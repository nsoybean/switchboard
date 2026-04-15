use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SessionMetadata {
    pub label: Option<String>,
    pub deleted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionMetadataStore {
    pub version: u32,
    pub sessions: HashMap<String, SessionMetadata>,
}

fn store_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let dir = home.join(".switchboard");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(dir.join("session_metadata.json"))
}

pub fn read_store() -> Result<SessionMetadataStore, String> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(SessionMetadataStore {
            version: 1,
            sessions: HashMap::new(),
        });
    }

    let data = fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Parse failed: {}", e))
}

pub fn write_store(store: &SessionMetadataStore) -> Result<(), String> {
    let path = store_path()?;
    let data =
        serde_json::to_string_pretty(store).map_err(|e| format!("Serialize failed: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Write failed: {}", e))
}

/// Apply a metadata overlay to a display string. Returns false if the session is deleted.
pub fn apply_metadata_label(display: &mut String, metadata: Option<&SessionMetadata>) -> bool {
    let Some(metadata) = metadata else {
        return true;
    };

    if metadata.deleted {
        return false;
    }

    if let Some(label) = metadata.label.as_ref().map(|v| v.trim()) {
        if !label.is_empty() {
            *display = label.to_string();
        }
    }

    true
}

#[tauri::command]
pub fn rename_session_metadata(session_id: String, label: String) -> Result<(), String> {
    let next_label = label.trim();
    if next_label.is_empty() {
        return Err("Session label cannot be empty".to_string());
    }

    let mut store = read_store()?;
    let metadata = store.sessions.entry(session_id).or_default();
    metadata.label = Some(next_label.to_string());
    write_store(&store)
}

#[tauri::command]
pub fn delete_session_metadata(session_id: String) -> Result<(), String> {
    let mut store = read_store()?;
    let metadata = store.sessions.entry(session_id).or_default();
    metadata.deleted = true;
    write_store(&store)
}

#[tauri::command]
pub fn delete_session_metadata_batch(session_ids: Vec<String>) -> Result<(), String> {
    let mut store = read_store()?;
    for session_id in session_ids {
        let metadata = store.sessions.entry(session_id).or_default();
        metadata.deleted = true;
    }
    write_store(&store)
}
