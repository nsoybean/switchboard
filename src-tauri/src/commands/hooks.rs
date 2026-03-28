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
