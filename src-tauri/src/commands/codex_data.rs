use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct CodexSessionSummary {
    pub session_id: String,
    pub display: String,
    pub timestamp: String,
    pub project_path: String,
}

#[derive(Debug, Deserialize)]
struct CodexThreadRow {
    id: String,
    created_at: i64,
    updated_at: i64,
    cwd: String,
    title: String,
    first_user_message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct CodexSessionMetadata {
    label: Option<String>,
    deleted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct CodexSessionMetadataStore {
    version: u32,
    sessions: HashMap<String, CodexSessionMetadata>,
}

fn codex_state_db_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join(".codex").join("state_5.sqlite"),
        home.join(".Codex").join("state_5.sqlite"),
    ];

    candidates.into_iter().find(|path| path.exists())
}

fn metadata_store_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let dir = home.join(".switchboard");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(dir.join("codex_session_metadata.json"))
}

fn read_metadata_store() -> Result<CodexSessionMetadataStore, String> {
    let path = metadata_store_path()?;
    if !path.exists() {
        return Ok(CodexSessionMetadataStore {
            version: 1,
            sessions: HashMap::new(),
        });
    }

    let data = fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Parse failed: {}", e))
}

fn write_metadata_store(store: &CodexSessionMetadataStore) -> Result<(), String> {
    let path = metadata_store_path()?;
    let data =
        serde_json::to_string_pretty(store).map_err(|e| format!("Serialize failed: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Write failed: {}", e))
}

fn run_codex_query(query: &str) -> Result<Vec<CodexThreadRow>, String> {
    let db_path =
        codex_state_db_path().ok_or_else(|| "Could not find Codex state database".to_string())?;
    let db_str = db_path
        .to_str()
        .ok_or_else(|| "Invalid Codex state database path".to_string())?;

    let output = Command::new("sqlite3")
        .args(["-json", db_str, query])
        .output()
        .map_err(|e| format!("Failed to run sqlite3: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("sqlite3 query failed: {}", stderr.trim()));
    }

    serde_json::from_slice(&output.stdout).map_err(|e| format!("Failed to parse sqlite JSON: {}", e))
}

fn escape_sql(value: &str) -> String {
    value.replace('\'', "''")
}

fn seconds_to_iso(seconds: i64) -> String {
    time::OffsetDateTime::from_unix_timestamp(seconds)
        .ok()
        .and_then(|dt| dt.format(&time::format_description::well_known::Iso8601::DEFAULT).ok())
        .unwrap_or_default()
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}

fn to_summary(row: &CodexThreadRow) -> CodexSessionSummary {
    let display = if !row.title.trim().is_empty() {
        row.title.trim()
    } else if !row.first_user_message.trim().is_empty() {
        row.first_user_message.trim()
    } else {
        "(empty session)"
    };

    CodexSessionSummary {
        session_id: row.id.clone(),
        display: truncate(display, 100),
        timestamp: seconds_to_iso(row.updated_at.max(row.created_at)),
        project_path: row.cwd.clone(),
    }
}

fn apply_metadata(
    summary: &mut CodexSessionSummary,
    metadata: Option<&CodexSessionMetadata>,
) -> bool {
    let Some(metadata) = metadata else {
        return true;
    };

    if metadata.deleted {
        return false;
    }

    if let Some(label) = metadata.label.as_ref().map(|value| value.trim()) {
        if !label.is_empty() {
            summary.display = label.to_string();
        }
    }

    true
}

#[tauri::command]
pub fn get_codex_sessions(project_path: String) -> Result<Vec<CodexSessionSummary>, String> {
    let escaped = escape_sql(&project_path);
    let query = format!(
        "select id, created_at, updated_at, cwd, title, first_user_message \
         from threads \
         where cwd = '{escaped}' or cwd like '{escaped}/%' \
         order by updated_at desc \
         limit 500"
    );

    let rows = run_codex_query(&query)?;
    let metadata_store = read_metadata_store()?;
    let mut summaries = Vec::new();

    for row in rows {
        let mut summary = to_summary(&row);
        let session_id = summary.session_id.clone();
        if !apply_metadata(&mut summary, metadata_store.sessions.get(&session_id)) {
            continue;
        }
        summaries.push(summary);
    }

    Ok(summaries)
}

#[tauri::command]
pub fn find_codex_session(
    cwd: String,
    created_at_secs: i64,
    prompt: Option<String>,
) -> Result<Option<CodexSessionSummary>, String> {
    let escaped_cwd = escape_sql(&cwd);
    let window_start = created_at_secs.saturating_sub(600);
    let window_end = created_at_secs.saturating_add(600);
    let query = format!(
        "select id, created_at, updated_at, cwd, title, first_user_message \
         from threads \
         where cwd = '{escaped_cwd}' \
           and created_at >= {window_start} \
           and created_at <= {window_end} \
         order by updated_at desc \
         limit 50"
    );

    let prompt = prompt.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    let rows = run_codex_query(&query)?;

    let best = rows
        .into_iter()
        .map(|row| {
            let mut score = 0_i64;
            if let Some(prompt) = prompt.as_ref() {
                if row.first_user_message.trim() == prompt || row.title.trim() == prompt {
                    score += 100;
                } else if row.first_user_message.contains(prompt) || row.title.contains(prompt) {
                    score += 25;
                }
            }
            score -= (row.created_at - created_at_secs).abs();
            (score, row)
        })
        .max_by(|a, b| a.0.cmp(&b.0))
        .map(|(_, row)| to_summary(&row));

    Ok(best)
}

#[tauri::command]
pub fn rename_codex_session(session_id: String, label: String) -> Result<(), String> {
    let next_label = label.trim();
    if next_label.is_empty() {
        return Err("Session label cannot be empty".to_string());
    }

    let mut store = read_metadata_store()?;
    let metadata = store.sessions.entry(session_id).or_default();
    metadata.label = Some(next_label.to_string());
    write_metadata_store(&store)
}

#[tauri::command]
pub fn delete_codex_session(session_id: String) -> Result<(), String> {
    let mut store = read_metadata_store()?;
    let metadata = store.sessions.entry(session_id).or_default();
    metadata.deleted = true;
    write_metadata_store(&store)
}
