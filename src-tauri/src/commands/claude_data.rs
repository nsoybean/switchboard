use super::session_metadata;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader, Write};
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
struct JsonlMessage {
    #[serde(rename = "type")]
    msg_type: Option<String>,
    timestamp: Option<String>,
    message: Option<MessageContent>,
}

#[derive(Debug, Deserialize)]
struct MessageContent {
    content: Option<serde_json::Value>,
    usage: Option<UsageInfo>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UsageInfo {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptMetadataItem {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionTranscriptEvent {
    pub id: String,
    pub kind: String,
    pub timestamp: Option<String>,
    pub role: Option<String>,
    pub title: Option<String>,
    pub text: Option<String>,
    pub status: Option<String>,
    pub display_mode: Option<String>,
    pub call_id: Option<String>,
    pub metadata: Vec<TranscriptMetadataItem>,
}

/// Encode a project path the way Claude Code does: /Users/foo/bar → -Users-foo-bar
fn encode_project_path(path: &str) -> String {
    path.replace('/', "-")
}

/// Get the Claude projects directory
fn claude_projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

fn find_claude_session_file(session_id: &str) -> Option<PathBuf> {
    let projects_dir = claude_projects_dir()?;
    let entries = fs::read_dir(projects_dir).ok()?;

    for entry in entries.flatten() {
        let path = entry.path().join(format!("{session_id}.jsonl"));
        if path.exists() {
            return Some(path);
        }
    }

    None
}

fn claude_history_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("history.jsonl"))
}

fn rewrite_jsonl_file(path: &PathBuf, should_keep: impl Fn(&str) -> bool) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(path).map_err(|e| format!("Read failed: {}", e))?;
    let mut next = String::new();

    for line in content.lines() {
        if should_keep(line) {
            next.push_str(line);
            next.push('\n');
        }
    }

    let mut file = fs::File::create(path).map_err(|e| format!("Write failed: {}", e))?;
    file.write_all(next.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))
}

/// Read all Claude sessions for a given project path
#[tauri::command]
pub fn get_claude_sessions(project_path: String) -> Result<Vec<ClaudeSessionSummary>, String> {
    let projects_dir =
        claude_projects_dir().ok_or_else(|| "Could not determine home directory".to_string())?;

    let encoded = encode_project_path(&project_path);
    let session_dir = projects_dir.join(&encoded);

    if !session_dir.exists() {
        return Ok(vec![]);
    }

    let mut summaries = Vec::new();
    let metadata_store = session_metadata::read_store()?;

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
            if !session_metadata::apply_metadata_label(
                &mut summary.display,
                metadata_store.sessions.get(&session_id),
            ) {
                continue;
            }
            summaries.push(summary);
        }
    }

    // Sort by timestamp descending
    summaries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(summaries)
}

#[tauri::command]
pub fn delete_claude_session(session_id: String) -> Result<(), String> {
    if let Some(session_file) = find_claude_session_file(&session_id) {
        if session_file.exists() {
            fs::remove_file(&session_file)
                .map_err(|e| format!("Failed to delete Claude session file: {}", e))?;
        }

        let bundle_dir = session_file.with_extension("");
        if bundle_dir.exists() {
            fs::remove_dir_all(&bundle_dir)
                .map_err(|e| format!("Failed to delete Claude session bundle: {}", e))?;
        }
    }

    if let Some(history_path) = claude_history_path() {
        rewrite_jsonl_file(&history_path, |line| {
            if line.trim().is_empty() {
                return false;
            }

            let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                return true;
            };

            value.get("sessionId").and_then(|value| value.as_str()) != Some(session_id.as_str())
        })?;
    }

    Ok(())
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

        let msg: JsonlMessage = match serde_json::from_str(&line) {
            Ok(m) => m,
            Err(_) => continue, // Skip malformed lines
        };

        // Extract first user message for display
        if first_user_message.is_none() {
            if let Some(ref t) = msg.msg_type {
                if t == "user" {
                    if let Some(ref message) = msg.message {
                        if let Some(ref content) = message.content {
                            let text = extract_json_text(content);
                            if !text.trim().is_empty() {
                                let first_line = text.lines().next().unwrap_or("");
                                first_user_message = Some(truncate(first_line.trim(), 100));
                            }
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
    let metadata_store = session_metadata::read_store()?;

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
            if session_metadata::apply_metadata_label(
                &mut summary.display,
                metadata_store.sessions.get(&session_id),
            ) {
                entries.push(summary);
            }
        }
    }

    Ok(entries)
}

#[tauri::command]
pub fn get_claude_session_transcript(
    session_id: String,
) -> Result<Vec<SessionTranscriptEvent>, String> {
    let path = find_claude_session_file(&session_id)
        .ok_or_else(|| "Could not find Claude session file".to_string())?;
    let file = fs::File::open(path).map_err(|e| format!("Open failed: {}", e))?;
    let reader = BufReader::new(file);
    let mut events = Vec::new();
    let mut tool_titles = HashMap::<String, String>::new();
    let mut hidden_local_command_ids = HashSet::<String>::new();

    for line in reader.lines() {
        let line = match line {
            Ok(value) => value,
            Err(_) => continue,
        };

        if line.trim().is_empty() {
            continue;
        }

        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        let timestamp = value
            .get("timestamp")
            .and_then(|v| v.as_str())
            .map(|value| value.to_string());
        let event_id = value
            .get("uuid")
            .and_then(|v| v.as_str())
            .map(|value| value.to_string())
            .unwrap_or_else(|| format!("claude-{}", events.len()));

        match value
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
        {
            "user" => {
                let message_content = value
                    .get("message")
                    .and_then(|message| message.get("content"));
                let is_meta = value
                    .get("isMeta")
                    .and_then(|flag| flag.as_bool())
                    .unwrap_or(false);

                if let Some(items) = message_content.and_then(|content| content.as_array()) {
                    for (index, item) in items.iter().enumerate() {
                        let item_type = item
                            .get("type")
                            .and_then(|value| value.as_str())
                            .unwrap_or_default();

                        if item_type == "tool_result" {
                            let call_id = item
                                .get("tool_use_id")
                                .and_then(|value| value.as_str())
                                .map(|value| value.to_string());
                            let tool_title = call_id
                                .as_ref()
                                .and_then(|value| tool_titles.get(value))
                                .cloned()
                                .unwrap_or_else(|| "Tool".to_string());
                            let is_error = item
                                .get("is_error")
                                .and_then(|value| value.as_bool())
                                .unwrap_or(false);
                            let result = extract_claude_tool_result(&value, item);
                            let metadata = tool_result_metadata(&value);

                            events.push(SessionTranscriptEvent {
                                id: format!("{event_id}:{index}"),
                                kind: "tool_result".to_string(),
                                timestamp: timestamp.clone(),
                                role: None,
                                title: Some(tool_title),
                                text: result,
                                status: Some(
                                    if is_error { "error" } else { "success" }.to_string(),
                                ),
                                display_mode: Some("code".to_string()),
                                call_id,
                                metadata,
                            });
                            continue;
                        }

                        let content = extract_json_text(item);
                        if should_skip_claude_user_text(&content, is_meta) {
                            continue;
                        }

                        events.push(SessionTranscriptEvent {
                            id: format!("{event_id}:{index}"),
                            kind: "message".to_string(),
                            timestamp: timestamp.clone(),
                            role: Some("user".to_string()),
                            title: None,
                            text: Some(content.trim().to_string()),
                            status: None,
                            display_mode: Some("text".to_string()),
                            call_id: None,
                            metadata: Vec::new(),
                        });
                    }
                    continue;
                }

                let content = message_content.map(extract_json_text).unwrap_or_default();
                if should_skip_claude_user_text(&content, is_meta) {
                    continue;
                }

                events.push(SessionTranscriptEvent {
                    id: event_id,
                    kind: "message".to_string(),
                    timestamp,
                    role: Some("user".to_string()),
                    title: None,
                    text: Some(content.trim().to_string()),
                    status: None,
                    display_mode: Some("text".to_string()),
                    call_id: None,
                    metadata: Vec::new(),
                });
            }
            "assistant" => {
                let content = value
                    .get("message")
                    .and_then(|message| message.get("content"));

                if let Some(items) = content.and_then(|content| content.as_array()) {
                    for (index, item) in items.iter().enumerate() {
                        let item_type = item
                            .get("type")
                            .and_then(|value| value.as_str())
                            .unwrap_or("text");

                        match item_type {
                            "text" => {
                                let text = extract_json_text(item);
                                if text.trim().is_empty() {
                                    continue;
                                }
                                events.push(SessionTranscriptEvent {
                                    id: format!("{event_id}:{index}"),
                                    kind: "message".to_string(),
                                    timestamp: timestamp.clone(),
                                    role: Some("assistant".to_string()),
                                    title: None,
                                    text: Some(text.trim().to_string()),
                                    status: None,
                                    display_mode: Some("text".to_string()),
                                    call_id: None,
                                    metadata: Vec::new(),
                                });
                            }
                            "thinking" => {
                                let text = item
                                    .get("thinking")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or("")
                                    .trim()
                                    .to_string();
                                events.push(SessionTranscriptEvent {
                                    id: format!("{event_id}:{index}"),
                                    kind: "reasoning".to_string(),
                                    timestamp: timestamp.clone(),
                                    role: Some("assistant".to_string()),
                                    title: Some("Thinking".to_string()),
                                    text: if text.is_empty() { None } else { Some(text) },
                                    status: None,
                                    display_mode: Some("text".to_string()),
                                    call_id: None,
                                    metadata: Vec::new(),
                                });
                            }
                            "tool_use" => {
                                let tool_name = item
                                    .get("name")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or("Tool");
                                let input = item.get("input");
                                let title = format_claude_tool_title(tool_name, input);
                                let call_id = item
                                    .get("id")
                                    .and_then(|value| value.as_str())
                                    .map(|value| value.to_string());
                                if let Some(call_id) = call_id.as_ref() {
                                    tool_titles.insert(call_id.clone(), title.clone());
                                }

                                events.push(SessionTranscriptEvent {
                                    id: format!("{event_id}:{index}"),
                                    kind: "tool_call".to_string(),
                                    timestamp: timestamp.clone(),
                                    role: Some("assistant".to_string()),
                                    title: Some(title),
                                    text: format_claude_tool_text(tool_name, input),
                                    status: None,
                                    display_mode: Some(
                                        claude_tool_display_mode(tool_name).to_string(),
                                    ),
                                    call_id,
                                    metadata: claude_tool_metadata(tool_name, input),
                                });
                            }
                            _ => {}
                        }
                    }
                    continue;
                }

                let content = content.map(extract_json_text).unwrap_or_default();
                if content.trim().is_empty() {
                    continue;
                }

                events.push(SessionTranscriptEvent {
                    id: event_id,
                    kind: "message".to_string(),
                    timestamp,
                    role: Some("assistant".to_string()),
                    title: None,
                    text: Some(content.trim().to_string()),
                    status: None,
                    display_mode: Some("text".to_string()),
                    call_id: None,
                    metadata: Vec::new(),
                });
            }
            "system" => {
                if value.get("subtype").and_then(|v| v.as_str()) != Some("local_command") {
                    continue;
                }

                let content = value
                    .get("content")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default();
                let parent_call_id = value
                    .get("parentUuid")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string());

                if let Some(command_name) = extract_tagged_content(content, "command-name") {
                    if should_hide_local_command(&command_name) {
                        hidden_local_command_ids.insert(event_id);
                        continue;
                    }

                    let message = extract_tagged_content(content, "command-message");
                    let args = extract_tagged_content(content, "command-args");
                    let mut metadata = Vec::new();
                    if let Some(args) = args
                        .as_ref()
                        .map(|value| value.trim())
                        .filter(|value| !value.is_empty())
                    {
                        metadata.push(TranscriptMetadataItem {
                            label: "Args".to_string(),
                            value: args.to_string(),
                        });
                    }

                    events.push(SessionTranscriptEvent {
                        id: event_id.clone(),
                        kind: "tool_call".to_string(),
                        timestamp: timestamp.clone(),
                        role: Some("user".to_string()),
                        title: Some(format!("Local command {}", command_name.trim())),
                        text: message
                            .map(|value| value.trim().to_string())
                            .filter(|value| !value.is_empty()),
                        status: None,
                        display_mode: Some("text".to_string()),
                        call_id: Some(event_id),
                        metadata,
                    });
                    continue;
                }

                if let Some(stdout) = extract_tagged_content(content, "local-command-stdout") {
                    if parent_call_id
                        .as_ref()
                        .is_some_and(|id| hidden_local_command_ids.contains(id))
                        || should_hide_local_command_output(&stdout)
                    {
                        continue;
                    }

                    events.push(SessionTranscriptEvent {
                        id: event_id,
                        kind: "tool_result".to_string(),
                        timestamp,
                        role: None,
                        title: Some("Local command output".to_string()),
                        text: Some(stdout.trim().to_string()),
                        status: Some("success".to_string()),
                        display_mode: Some("code".to_string()),
                        call_id: parent_call_id,
                        metadata: Vec::new(),
                    });
                }
            }
            _ => continue,
        }
    }

    Ok(events)
}

fn extract_json_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(text) => normalize_claude_text(text),
        serde_json::Value::Array(items) => items
            .iter()
            .map(|item| {
                item.get("text")
                    .and_then(|text| text.as_str())
                    .map(normalize_claude_text)
                    .unwrap_or_else(|| extract_json_text(item))
            })
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        serde_json::Value::Object(map) => map
            .get("text")
            .and_then(|text| text.as_str())
            .map(normalize_claude_text)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn normalize_claude_text(text: &str) -> String {
    let trimmed = text.trim();
    if let Some(unwrapped) = unwrap_single_xml_tag(trimmed) {
        return normalize_claude_text(&unwrapped);
    }
    trimmed.to_string()
}

fn unwrap_single_xml_tag(text: &str) -> Option<String> {
    if !text.starts_with('<') {
        return None;
    }

    let open_end = text.find('>')?;
    let tag = &text[1..open_end];
    if tag.is_empty() || tag.starts_with('/') || tag.contains(' ') {
        return None;
    }

    let close = format!("</{tag}>");
    if !text.ends_with(&close) {
        return None;
    }

    Some(
        text[open_end + 1..text.len() - close.len()]
            .trim()
            .to_string(),
    )
}

fn should_skip_claude_user_text(text: &str, is_meta: bool) -> bool {
    let trimmed = text.trim();
    trimmed.is_empty()
        || (is_meta
            && (trimmed.contains("<local-command-caveat>")
                || trimmed.starts_with(
                    "Caveat: The messages below were generated by the user while running local commands.",
                )))
        || should_hide_local_command_user_message(trimmed)
}

fn extract_tagged_content(content: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = content.find(&open)? + open.len();
    let end = content[start..].find(&close)? + start;
    Some(content[start..end].trim().to_string())
}

fn should_hide_local_command(command_name: &str) -> bool {
    matches!(
        command_name.trim(),
        "/exit" | "/help" | "/status" | "/usage" | "/cost"
    )
}

fn should_hide_local_command_output(text: &str) -> bool {
    matches!(
        text.trim(),
        "Status dialog dismissed" | "Help dialog dismissed" | "Goodbye!"
    )
}

fn should_hide_local_command_user_message(text: &str) -> bool {
    extract_tagged_content(text, "command-name")
        .map(|command_name| should_hide_local_command(&command_name))
        .unwrap_or(false)
}

fn format_claude_tool_title(name: &str, _input: Option<&serde_json::Value>) -> String {
    match name {
        "NotebookEdit" => "Edit".to_string(),
        "MultiEdit" => "MultiEdit".to_string(),
        _ => name.to_string(),
    }
}

fn format_claude_tool_text(name: &str, input: Option<&serde_json::Value>) -> Option<String> {
    let empty = serde_json::Value::Null;
    let input = input.unwrap_or(&empty);
    match name {
        "Bash" => input
            .get("command")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        "Write" => input
            .get("content")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .filter(|value| !value.is_empty()),
        "Edit" | "NotebookEdit" => {
            let old_string = input
                .get("old_string")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .trim_end();
            let new_string = input
                .get("new_string")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .trim_end();
            if old_string.is_empty() && new_string.is_empty() {
                None
            } else {
                Some(format_before_after_diff(old_string, new_string))
            }
        }
        "MultiEdit" => input
            .get("edits")
            .and_then(|value| serde_json::to_string_pretty(value).ok()),
        _ => serde_json::to_string_pretty(input).ok().and_then(|value| {
            let trimmed = value.trim();
            if trimmed == "null" || trimmed == "{}" || trimmed == "[]" {
                None
            } else {
                Some(value)
            }
        }),
    }
}

fn format_before_after_diff(old_string: &str, new_string: &str) -> String {
    let mut lines = Vec::new();

    let old_lines: Vec<&str> = if old_string.is_empty() {
        Vec::new()
    } else {
        old_string.split('\n').collect()
    };
    let new_lines: Vec<&str> = if new_string.is_empty() {
        Vec::new()
    } else {
        new_string.split('\n').collect()
    };

    let shared_prefix = old_lines
        .iter()
        .zip(new_lines.iter())
        .take_while(|(old_line, new_line)| old_line == new_line)
        .count();

    let shared_suffix = old_lines[shared_prefix..]
        .iter()
        .rev()
        .zip(new_lines[shared_prefix..].iter().rev())
        .take_while(|(old_line, new_line)| old_line == new_line)
        .count();

    for line in old_lines.iter().take(shared_prefix) {
        lines.push(format!(" {line}"));
    }

    let old_change_end = old_lines.len().saturating_sub(shared_suffix);
    let new_change_end = new_lines.len().saturating_sub(shared_suffix);

    for line in &old_lines[shared_prefix..old_change_end] {
        lines.push(format!("-{line}"));
    }

    for line in &new_lines[shared_prefix..new_change_end] {
        lines.push(format!("+{line}"));
    }

    for line in &old_lines[old_change_end..] {
        lines.push(format!(" {line}"));
    }

    lines.join("\n").trim().to_string()
}

fn claude_tool_display_mode(name: &str) -> &'static str {
    match name {
        "Edit" | "MultiEdit" | "NotebookEdit" => "diff",
        "Bash" | "Write" | "Read" => "code",
        _ => "text",
    }
}

fn claude_tool_metadata(
    name: &str,
    input: Option<&serde_json::Value>,
) -> Vec<TranscriptMetadataItem> {
    let empty = serde_json::Value::Null;
    let input = input.unwrap_or(&empty);
    let mut metadata = Vec::new();

    if let Some(file_path) = input.get("file_path").and_then(|value| value.as_str()) {
        metadata.push(TranscriptMetadataItem {
            label: "File".to_string(),
            value: file_path.to_string(),
        });
    }

    if name == "Bash" {
        if let Some(description) = input
            .get("description")
            .and_then(|value| value.as_str())
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            metadata.push(TranscriptMetadataItem {
                label: "Description".to_string(),
                value: description.to_string(),
            });
        }
    }

    if let Some(pattern) = input
        .get("pattern")
        .and_then(|value| value.as_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        metadata.push(TranscriptMetadataItem {
            label: "Pattern".to_string(),
            value: pattern.to_string(),
        });
    }

    if let Some(path) = input
        .get("path")
        .and_then(|value| value.as_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        metadata.push(TranscriptMetadataItem {
            label: "Path".to_string(),
            value: path.to_string(),
        });
    }

    metadata
}

fn extract_claude_tool_result(
    event: &serde_json::Value,
    item: &serde_json::Value,
) -> Option<String> {
    let stdout = event
        .get("toolUseResult")
        .and_then(|result| result.get("stdout"))
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let stderr = event
        .get("toolUseResult")
        .and_then(|result| result.get("stderr"))
        .and_then(|value| value.as_str())
        .unwrap_or_default();

    let combined = match (stdout.trim(), stderr.trim()) {
        ("", "") => extract_json_text(item),
        ("", stderr) => stderr.to_string(),
        (stdout, "") => stdout.to_string(),
        (stdout, stderr) => format!("{stdout}\n\nstderr:\n{stderr}"),
    };

    if combined.trim().is_empty() {
        None
    } else {
        Some(normalize_claude_text(&combined))
    }
}

fn tool_result_metadata(event: &serde_json::Value) -> Vec<TranscriptMetadataItem> {
    let mut metadata = Vec::new();
    if event
        .get("toolUseResult")
        .and_then(|result| result.get("interrupted"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
    {
        metadata.push(TranscriptMetadataItem {
            label: "Interrupted".to_string(),
            value: "true".to_string(),
        });
    }

    metadata
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
        assert_eq!(encode_project_path("/Users/foo/bar"), "-Users-foo-bar");
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
