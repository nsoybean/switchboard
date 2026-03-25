use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersistedSession {
    pub id: String,
    pub agent: String,
    pub label: String,
    pub worktree_path: Option<String>,
    pub branch: Option<String>,
    pub cwd: String,
    pub created_at: String,
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionStore {
    version: u32,
    sessions: HashMap<String, PersistedSession>,
}

fn store_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let dir = home.join(".switchboard");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(dir.join("sessions.json"))
}

fn read_store() -> Result<SessionStore, String> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(SessionStore {
            version: 1,
            sessions: HashMap::new(),
        });
    }
    let data = fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Parse failed: {}", e))
}

fn write_store(store: &SessionStore) -> Result<(), String> {
    let path = store_path()?;
    let data = serde_json::to_string_pretty(store).map_err(|e| format!("Serialize failed: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Write failed: {}", e))
}

/// Load all persisted sessions
#[tauri::command]
pub fn load_sessions() -> Result<Vec<PersistedSession>, String> {
    let store = read_store()?;
    Ok(store.sessions.into_values().collect())
}

/// Save a session to the persistent store
#[tauri::command]
pub fn save_session(session: PersistedSession) -> Result<(), String> {
    let mut store = read_store()?;
    store.sessions.insert(session.id.clone(), session);
    write_store(&store)
}

/// Remove a session from the persistent store
#[tauri::command]
pub fn delete_session(id: String) -> Result<(), String> {
    let mut store = read_store()?;
    store.sessions.remove(&id);
    write_store(&store)
}

/// Check if first-run onboarding has been completed
#[tauri::command]
pub fn is_first_run() -> Result<bool, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let config_path = home.join(".switchboard").join("config.json");
    if !config_path.exists() {
        return Ok(true);
    }
    let data = fs::read_to_string(&config_path).map_err(|e| format!("Read failed: {}", e))?;
    let config: serde_json::Value =
        serde_json::from_str(&data).map_err(|e| format!("Parse failed: {}", e))?;
    Ok(!config
        .get("onboarding_complete")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

/// Mark onboarding as complete
#[tauri::command]
pub fn complete_onboarding() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let dir = home.join(".switchboard");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    let config_path = dir.join("config.json");

    let mut config: serde_json::Value = if config_path.exists() {
        let data = fs::read_to_string(&config_path).map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&data).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    config["onboarding_complete"] = serde_json::json!(true);
    let data =
        serde_json::to_string_pretty(&config).map_err(|e| format!("Serialize failed: {}", e))?;
    fs::write(&config_path, data).map_err(|e| format!("Write failed: {}", e))
}

/// Detect which agent CLIs are available in PATH
#[tauri::command]
pub fn detect_agents() -> Result<Vec<DetectedAgent>, String> {
    let agents = vec![
        ("claude", "Claude Code"),
        ("codex", "Codex"),
    ];

    let mut results = Vec::new();
    for (cmd, name) in agents {
        let available = std::process::Command::new("which")
            .arg(cmd)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        let version = if available {
            std::process::Command::new(cmd)
                .arg("--version")
                .output()
                .ok()
                .and_then(|o| {
                    if o.status.success() {
                        Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                    } else {
                        None
                    }
                })
        } else {
            None
        };

        results.push(DetectedAgent {
            command: cmd.to_string(),
            name: name.to_string(),
            available,
            version,
        });
    }

    Ok(results)
}

#[derive(Debug, Serialize)]
pub struct DetectedAgent {
    pub command: String,
    pub name: String,
    pub available: bool,
    pub version: Option<String>,
}
