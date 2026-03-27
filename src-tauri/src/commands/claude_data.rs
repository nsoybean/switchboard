use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

/// Summary of a Claude Code session extracted from JSONL
#[derive(Debug, Serialize, Clone)]
pub struct ClaudeSessionSummary {
    pub session_id: String,
    pub display: String,
    pub timestamp: String,
    pub project_path: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub model: Option<String>,
}

/// Entry from ~/.claude/history.jsonl
#[derive(Debug, Deserialize)]
struct HistoryEntry {
    display: Option<String>,
    timestamp: Option<u64>,
    project: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
}

/// A user message from a session JSONL file
#[derive(Debug, Deserialize)]
struct JonlMessage {
    #[serde(rename = "type")]
    msg_type: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    timestamp: Option<String>,
    message: Option<MessageContent>,
}

#[derive(Debug, Deserialize)]
struct MessageContent {
    role: Option<String>,
    content: Option<serde_json::Value>,
    usage: Option<UsageInfo>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UsageInfo {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct ClaudeSessionMetadata {
    label: Option<String>,
    deleted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct ClaudeSessionMetadataStore {
    version: u32,
    sessions: HashMap<String, ClaudeSessionMetadata>,
}

/// Encode a project path the way Claude Code does: /Users/foo/bar → -Users-foo-bar
fn encode_project_path(path: &str) -> String {
    path.replace('/', "-")
}

/// Get the Claude projects directory
fn claude_projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

fn metadata_store_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let dir = home.join(".switchboard");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(dir.join("claude_session_metadata.json"))
}

fn read_metadata_store() -> Result<ClaudeSessionMetadataStore, String> {
    let path = metadata_store_path()?;
    if !path.exists() {
        return Ok(ClaudeSessionMetadataStore {
            version: 1,
            sessions: HashMap::new(),
        });
    }

    let data = fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Parse failed: {}", e))
}

fn write_metadata_store(store: &ClaudeSessionMetadataStore) -> Result<(), String> {
    let path = metadata_store_path()?;
    let data =
        serde_json::to_string_pretty(store).map_err(|e| format!("Serialize failed: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Write failed: {}", e))
}

fn apply_metadata(
    summary: &mut ClaudeSessionSummary,
    metadata: Option<&ClaudeSessionMetadata>,
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

/// Read all Claude sessions for a given project path
#[tauri::command]
pub fn get_claude_sessions(project_path: String) -> Result<Vec<ClaudeSessionSummary>, String> {
    let projects_dir = claude_projects_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;

    let encoded = encode_project_path(&project_path);
    let session_dir = projects_dir.join(&encoded);

    if !session_dir.exists() {
        return Ok(vec![]);
    }

    let mut summaries = Vec::new();
    let metadata_store = read_metadata_store()?;

    let entries = fs::read_dir(&session_dir).map_err(|e| format!("Read dir failed: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(true, |e| e != "jsonl") {
            continue;
        }

        // Session ID is the filename without extension
        let session_id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        if let Some(mut summary) = parse_session_summary(&path, &session_id, &project_path) {
            if !apply_metadata(&mut summary, metadata_store.sessions.get(&session_id)) {
                continue;
            }
            summaries.push(summary);
        }
    }

    // Sort by timestamp descending
    summaries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(summaries)
}

/// Parse a session JSONL file to extract the first user message and usage stats
fn parse_session_summary(
    path: &PathBuf,
    session_id: &str,
    project_path: &str,
) -> Option<ClaudeSessionSummary> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut first_user_message: Option<String> = None;
    let mut timestamp: Option<String> = None;
    let mut total_input_tokens: u64 = 0;
    let mut total_output_tokens: u64 = 0;
    let mut model: Option<String> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.trim().is_empty() {
            continue;
        }

        let msg: JonlMessage = match serde_json::from_str(&line) {
            Ok(m) => m,
            Err(_) => continue, // Skip malformed lines
        };

        // Extract first user message for display
        if first_user_message.is_none() {
            if let Some(ref t) = msg.msg_type {
                if t == "user" {
                    if let Some(ref message) = msg.message {
                        if let Some(ref content) = message.content {
                            first_user_message = match content {
                                serde_json::Value::String(s) => Some(truncate(s, 100)),
                                _ => Some(truncate(&content.to_string(), 100)),
                            };
                        }
                    }
                    timestamp = msg.timestamp.clone();
                }
            }
        }

        // Accumulate usage from assistant messages
        if let Some(ref t) = msg.msg_type {
            if t == "assistant" {
                if let Some(ref message) = msg.message {
                    if let Some(ref usage) = message.usage {
                        total_input_tokens += usage.input_tokens.unwrap_or(0);
                        total_output_tokens += usage.output_tokens.unwrap_or(0);
                    }
                    if model.is_none() {
                        model = message.model.clone();
                    }
                }
            }
        }
    }

    let display = first_user_message.unwrap_or_else(|| "(empty session)".to_string());
    let ts = timestamp.unwrap_or_default();

    Some(ClaudeSessionSummary {
        session_id: session_id.to_string(),
        display,
        timestamp: ts,
        project_path: project_path.to_string(),
        input_tokens: total_input_tokens,
        output_tokens: total_output_tokens,
        model,
    })
}

/// Read the global history index
#[tauri::command]
pub fn get_claude_history() -> Result<Vec<ClaudeSessionSummary>, String> {
    let history_path = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?
        .join(".claude")
        .join("history.jsonl");

    if !history_path.exists() {
        return Ok(vec![]);
    }

    let file = fs::File::open(&history_path).map_err(|e| format!("Open failed: {}", e))?;
    let reader = BufReader::new(file);
    let mut entries = Vec::new();
    let metadata_store = read_metadata_store()?;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.trim().is_empty() {
            continue;
        }

        let entry: HistoryEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };

        if let Some(session_id) = entry.session_id {
            let mut summary = ClaudeSessionSummary {
                session_id,
                display: entry.display.unwrap_or_else(|| "(no prompt)".to_string()),
                timestamp: entry
                    .timestamp
                    .map(|t| {
                        // Convert millisecond epoch to ISO string
                        let secs = (t / 1000) as i64;
                        let dt = time::OffsetDateTime::from_unix_timestamp(secs).ok();
                        dt.map(|d| {
                            d.format(&time::format_description::well_known::Iso8601::DEFAULT)
                                .unwrap_or_default()
                        })
                        .unwrap_or_default()
                    })
                    .unwrap_or_default(),
                project_path: entry.project.unwrap_or_default(),
                input_tokens: 0,
                output_tokens: 0,
                model: None,
            };

            let session_id = summary.session_id.clone();
            if apply_metadata(&mut summary, metadata_store.sessions.get(&session_id)) {
                entries.push(summary);
            }
        }
    }

    Ok(entries)
}

#[tauri::command]
pub fn rename_claude_session(session_id: String, label: String) -> Result<(), String> {
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
pub fn delete_claude_session(session_id: String) -> Result<(), String> {
    let mut store = read_metadata_store()?;
    let metadata = store.sessions.entry(session_id).or_default();
    metadata.deleted = true;
    write_metadata_store(&store)
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_encode_project_path() {
        assert_eq!(
            encode_project_path("/Users/foo/bar"),
            "-Users-foo-bar"
        );
        assert_eq!(encode_project_path("/"), "-");
    }

    #[test]
    fn test_parse_session_summary_happy_path() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test-session.jsonl");
        let mut file = fs::File::create(&path).unwrap();
        writeln!(
            file,
            r#"{{"type":"user","message":{{"role":"user","content":"hello world"}},"timestamp":"2026-03-25T10:00:00Z","sessionId":"abc"}}"#
        )
        .unwrap();
        writeln!(
            file,
            r#"{{"type":"assistant","message":{{"role":"assistant","content":[{{"type":"text","text":"hi"}}],"usage":{{"input_tokens":100,"output_tokens":20}},"model":"claude-opus-4-6"}},"timestamp":"2026-03-25T10:00:01Z","sessionId":"abc"}}"#
        )
        .unwrap();

        let summary = parse_session_summary(&path, "abc", "/test").unwrap();
        assert_eq!(summary.display, "hello world");
        assert_eq!(summary.input_tokens, 100);
        assert_eq!(summary.output_tokens, 20);
        assert_eq!(summary.model, Some("claude-opus-4-6".to_string()));
    }

    #[test]
    fn test_parse_session_summary_empty_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("empty.jsonl");
        fs::File::create(&path).unwrap();

        let summary = parse_session_summary(&path, "empty", "/test");
        // Empty file should return Some with "(empty session)" display
        assert!(summary.is_some());
        assert_eq!(summary.unwrap().display, "(empty session)");
    }

    #[test]
    fn test_parse_session_summary_malformed_line() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("bad.jsonl");
        let mut file = fs::File::create(&path).unwrap();
        writeln!(file, "not valid json").unwrap();
        writeln!(
            file,
            r#"{{"type":"user","message":{{"role":"user","content":"after bad line"}},"timestamp":"2026-03-25T10:00:00Z"}}"#
        )
        .unwrap();

        let summary = parse_session_summary(&path, "bad", "/test").unwrap();
        assert_eq!(summary.display, "after bad line");
    }

    #[test]
    fn test_truncate() {
        assert_eq!(truncate("short", 10), "short");
        assert_eq!(truncate("this is a long string", 10), "this is a ...");
    }
}
