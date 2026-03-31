use serde_json::json;
use std::fs;
use std::path::PathBuf;

/// Write Claude hook configuration to `.claude/settings.local.json` in the given cwd.
/// Uses Claude's native HTTP hook type to POST events to the Switchboard hook server.
/// Merges with any existing settings (preserves non-hook keys).
#[tauri::command]
pub fn write_claude_hook_config(cwd: String, port: u16) -> Result<(), String> {
    let claude_dir = PathBuf::from(&cwd).join(".claude");
    fs::create_dir_all(&claude_dir).map_err(|e| format!("Failed to create .claude dir: {}", e))?;

    let config_path = claude_dir.join("settings.local.json");
    let hook_url = format!("http://127.0.0.1:{}/claude-hooks", port);

    let hook_entry = |event_name: &str| {
        json!([{
            "hooks": [{
                "type": "http",
                "url": hook_url,
                "headers": {
                    "Authorization": "Bearer $SWITCHBOARD_HOOK_TOKEN",
                    "X-Hook-Event": event_name
                },
                "allowedEnvVars": ["SWITCHBOARD_HOOK_TOKEN"]
            }]
        }])
    };

    let hooks_config = json!({
        "Stop": hook_entry("Stop"),
        "StopFailure": hook_entry("StopFailure"),
        "PermissionRequest": hook_entry("PermissionRequest"),
        "Elicitation": hook_entry("Elicitation"),
        "Notification": hook_entry("Notification"),
        "UserPromptSubmit": hook_entry("UserPromptSubmit"),
    });

    // Merge with existing settings if present
    let mut config: serde_json::Value = if config_path.exists() {
        let data = fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config["hooks"] = hooks_config;

    fs::write(
        &config_path,
        serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Failed to write settings.local.json: {}", e))
}

// ---------------------------------------------------------------------------
// Codex hooks
// ---------------------------------------------------------------------------

/// Write Codex hook configuration:
/// 1. A forwarder shell script at `~/.switchboard/codex-hook-forwarder.sh`
/// 2. `<cwd>/.codex/hooks.json` pointing each event to the forwarder
/// 3. Enable `codex_hooks = true` in `~/.codex/config.toml`
#[tauri::command]
pub fn write_codex_hook_config(cwd: String, port: u16) -> Result<(), String> {
    write_codex_forwarder_script()?;
    write_codex_hooks_json(&cwd)?;
    enable_codex_hooks_feature()?;
    let _ = port; // port is baked into env vars at spawn time, not into config
    Ok(())
}

/// Write the forwarder script that bridges Codex command hooks → Switchboard HTTP server.
/// Codex pipes JSON to stdin; the script POSTs it to our hook server.
fn write_codex_forwarder_script() -> Result<(), String> {
    let sb_dir = dirs::home_dir()
        .ok_or("no home dir")?
        .join(".switchboard");
    fs::create_dir_all(&sb_dir)
        .map_err(|e| format!("Failed to create ~/.switchboard: {}", e))?;

    let script_path = sb_dir.join("codex-hook-forwarder.sh");

    let script = r#"#!/bin/bash
# Switchboard Codex hook forwarder — reads Codex hook JSON from stdin
# and POSTs it to the Switchboard hook server.
INPUT=$(cat)
curl -s -X POST "http://127.0.0.1:${SWITCHBOARD_HOOK_PORT}/codex-hooks" \
  -H "Authorization: Bearer ${SWITCHBOARD_HOOK_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$INPUT" >/dev/null 2>&1
echo '{"continue": true}'
"#;

    fs::write(&script_path, script)
        .map_err(|e| format!("Failed to write forwarder script: {}", e))?;

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to chmod forwarder script: {}", e))?;
    }

    Ok(())
}

/// Write `<cwd>/.codex/hooks.json` with hooks for lifecycle events.
fn write_codex_hooks_json(cwd: &str) -> Result<(), String> {
    let codex_dir = PathBuf::from(cwd).join(".codex");
    fs::create_dir_all(&codex_dir)
        .map_err(|e| format!("Failed to create .codex dir: {}", e))?;

    let hooks_path = codex_dir.join("hooks.json");

    let forwarder = dirs::home_dir()
        .ok_or("no home dir")?
        .join(".switchboard")
        .join("codex-hook-forwarder.sh");
    let forwarder_str = forwarder.to_string_lossy().to_string();

    let hook_entry = |_event: &str| {
        json!([{
            "hooks": [{
                "type": "command",
                "command": forwarder_str
            }]
        }])
    };

    let config = json!({
        "hooks": {
            "SessionStart": hook_entry("SessionStart"),
            "Stop": hook_entry("Stop"),
            "UserPromptSubmit": hook_entry("UserPromptSubmit"),
        }
    });

    // Merge with existing hooks.json if present
    let mut existing: serde_json::Value = if hooks_path.exists() {
        let data = fs::read_to_string(&hooks_path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or(json!({}))
    } else {
        json!({})
    };

    existing["hooks"] = config["hooks"].clone();

    fs::write(
        &hooks_path,
        serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Failed to write .codex/hooks.json: {}", e))
}

/// Ensure `codex_hooks = true` in `~/.codex/config.toml`.
fn enable_codex_hooks_feature() -> Result<(), String> {
    let config_path = dirs::home_dir()
        .ok_or("no home dir")?
        .join(".codex")
        .join("config.toml");

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create ~/.codex: {}", e))?;
    }

    let mut doc: toml::Table = if config_path.exists() {
        let data = fs::read_to_string(&config_path).unwrap_or_default();
        data.parse::<toml::Table>().unwrap_or_default()
    } else {
        toml::Table::new()
    };

    let features = doc
        .entry("features")
        .or_insert_with(|| toml::Value::Table(toml::Table::new()));

    if let toml::Value::Table(features_table) = features {
        features_table.insert("codex_hooks".into(), toml::Value::Boolean(true));
    }

    let output = toml::to_string_pretty(&doc)
        .map_err(|e| format!("Failed to serialize config.toml: {}", e))?;

    fs::write(&config_path, output)
        .map_err(|e| format!("Failed to write config.toml: {}", e))
}
