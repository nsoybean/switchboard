use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersistedSession {
    pub id: String,
    pub agent: String,
    pub label: String,
    pub resume_target_id: Option<String>,
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
    let data =
        serde_json::to_string_pretty(store).map_err(|e| format!("Serialize failed: {}", e))?;
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
    let config = read_config()?;
    Ok(!config
        .get("onboarding_complete")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

/// Mark onboarding as complete
#[tauri::command]
pub fn complete_onboarding() -> Result<(), String> {
    let mut config = read_config()?;
    config["onboarding_complete"] = serde_json::json!(true);
    write_config(&config)
}

fn config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let dir = home.join(".switchboard");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(dir.join("config.json"))
}

fn read_config() -> Result<serde_json::Value, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Parse failed: {}", e))
}

fn write_config(config: &serde_json::Value) -> Result<(), String> {
    let path = config_path()?;
    let data =
        serde_json::to_string_pretty(config).map_err(|e| format!("Serialize failed: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Write failed: {}", e))
}

/// Get the stored project path, or None if not set
#[tauri::command]
pub fn get_project_path() -> Result<Option<String>, String> {
    let config = read_config()?;
    Ok(config
        .get("project_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

/// Set and validate the project path (must be a directory with .git)
#[tauri::command]
pub fn set_project_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.is_dir() {
        return Err(format!("'{}' is not a directory", path));
    }
    if !p.join(".git").exists() {
        return Err(format!("'{}' is not a git repository", path));
    }
    let mut config = read_config()?;
    config["project_path"] = serde_json::json!(path);
    write_config(&config)
}

/// Get the stored GitHub token
#[tauri::command]
pub fn get_github_token() -> Result<Option<String>, String> {
    let config = read_config()?;
    Ok(config
        .get("github_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

/// Set the GitHub token (empty string clears it)
#[tauri::command]
pub fn set_github_token(token: String) -> Result<(), String> {
    let mut config = read_config()?;
    if token.is_empty() {
        config.as_object_mut().map(|m| m.remove("github_token"));
    } else {
        config["github_token"] = serde_json::json!(token);
    }
    write_config(&config)
}

/// Validate a GitHub token by calling the /user endpoint
#[tauri::command]
pub fn validate_github_token(token: String) -> Result<String, String> {
    let response = ureq::get("https://api.github.com/user")
        .header("Authorization", &format!("Bearer {}", token))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "switchboard")
        .call()
        .map_err(|e| format!("GitHub API error: {}", e))?;

    let body: serde_json::Value = response
        .into_body()
        .read_json()
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    body["login"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Could not determine GitHub username".to_string())
}

/// Detect which agent CLIs are available in PATH
#[tauri::command]
pub fn detect_agents() -> Result<Vec<DetectedAgent>, String> {
    let agents = vec![("claude", "Claude Code"), ("codex", "Codex")];

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
