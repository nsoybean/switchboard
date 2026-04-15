use super::session_metadata;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
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

#[derive(Debug, Deserialize)]
struct CodexTranscriptRow {
    rollout_path: String,
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

fn codex_state_db_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join(".codex").join("state_5.sqlite"),
        home.join(".Codex").join("state_5.sqlite"),
    ];

    candidates.into_iter().find(|path| path.exists())
}

fn codex_archived_sessions_dir() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join(".Codex").join("archived_sessions"),
        home.join(".codex").join("archived_sessions"),
    ];

    candidates.into_iter().find(|path| path.exists())
}

fn codex_history_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join(".Codex").join("history.jsonl"),
        home.join(".codex").join("history.jsonl"),
    ];

    candidates.into_iter().find(|path| path.exists())
}

fn codex_session_index_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join(".Codex").join("session_index.jsonl"),
        home.join(".codex").join("session_index.jsonl"),
    ];

    candidates.into_iter().find(|path| path.exists())
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

fn run_codex_statement(statement: &str) -> Result<(), String> {
    let db_path =
        codex_state_db_path().ok_or_else(|| "Could not find Codex state database".to_string())?;
    let db_str = db_path
        .to_str()
        .ok_or_else(|| "Invalid Codex state database path".to_string())?;

    let output = Command::new("sqlite3")
        .args([db_str, statement])
        .output()
        .map_err(|e| format!("Failed to run sqlite3: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("sqlite3 statement failed: {}", stderr.trim()));
    }

    Ok(())
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

    parse_sqlite_json_rows(&output.stdout)
}

fn parse_sqlite_json_rows<T>(stdout: &[u8]) -> Result<Vec<T>, String>
where
    T: DeserializeOwned,
{
    if stdout.iter().all(|byte| byte.is_ascii_whitespace()) {
        return Ok(Vec::new());
    }

    serde_json::from_slice(stdout).map_err(|e| format!("Failed to parse sqlite JSON: {}", e))
}

fn escape_sql(value: &str) -> String {
    value.replace('\'', "''")
}

fn find_codex_transcript_path(session_id: &str) -> Result<PathBuf, String> {
    let escaped = escape_sql(session_id);
    let query = format!(
        "select rollout_path \
         from threads \
         where id = '{escaped}' \
         limit 1"
    );

    let rows: Vec<CodexTranscriptRow> = {
        let db_path = codex_state_db_path()
            .ok_or_else(|| "Could not find Codex state database".to_string())?;
        let db_str = db_path
            .to_str()
            .ok_or_else(|| "Invalid Codex state database path".to_string())?;

        let output = Command::new("sqlite3")
            .args(["-json", db_str, &query])
            .output()
            .map_err(|e| format!("Failed to run sqlite3: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("sqlite3 query failed: {}", stderr.trim()));
        }

        parse_sqlite_json_rows(&output.stdout)?
    };

    if let Some(path) = rows
        .into_iter()
        .map(|row| PathBuf::from(row.rollout_path))
        .find(|path| path.exists())
    {
        return Ok(path);
    }

    let archive_dir = codex_archived_sessions_dir()
        .ok_or_else(|| "Could not find Codex transcript store".to_string())?;
    let entries = fs::read_dir(&archive_dir).map_err(|e| format!("Read dir failed: {}", e))?;

    entries
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.contains(session_id))
                .unwrap_or(false)
        })
        .ok_or_else(|| "Could not find Codex transcript file".to_string())
}

fn seconds_to_iso(seconds: i64) -> String {
    time::OffsetDateTime::from_unix_timestamp(seconds)
        .ok()
        .and_then(|dt| {
            dt.format(&time::format_description::well_known::Iso8601::DEFAULT)
                .ok()
        })
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
    let metadata_store = session_metadata::read_store()?;
    let mut summaries = Vec::new();

    for row in rows {
        let mut summary = to_summary(&row);
        let session_id = summary.session_id.clone();
        if !session_metadata::apply_metadata_label(
            &mut summary.display,
            metadata_store.sessions.get(&session_id),
        ) {
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

    let prompt = prompt
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
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
pub fn delete_codex_session(session_id: String) -> Result<(), String> {
    let transcript_path = find_codex_transcript_path(&session_id).ok();
    let escaped = escape_sql(&session_id);
    let statement = format!(
        "BEGIN IMMEDIATE;\
         UPDATE agent_job_items SET assigned_thread_id = NULL WHERE assigned_thread_id = '{escaped}';\
         DELETE FROM logs WHERE thread_id = '{escaped}';\
         DELETE FROM thread_spawn_edges WHERE parent_thread_id = '{escaped}' OR child_thread_id = '{escaped}';\
         DELETE FROM threads WHERE id = '{escaped}';\
         COMMIT;"
    );
    run_codex_statement(&statement)?;

    if let Some(path) = transcript_path {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete Codex transcript file: {}", e))?;
        }
    }

    if let Some(history_path) = codex_history_path() {
        rewrite_jsonl_file(&history_path, |line| {
            if line.trim().is_empty() {
                return false;
            }

            let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                return true;
            };

            value.get("session_id").and_then(|value| value.as_str()) != Some(session_id.as_str())
        })?;
    }

    if let Some(index_path) = codex_session_index_path() {
        rewrite_jsonl_file(&index_path, |line| {
            if line.trim().is_empty() {
                return false;
            }

            let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                return true;
            };

            value.get("id").and_then(|value| value.as_str()) != Some(session_id.as_str())
        })?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_codex_sessions_batch(session_ids: Vec<String>) -> Result<(), String> {
    let ids_set: std::collections::HashSet<&str> =
        session_ids.iter().map(|s| s.as_str()).collect();

    // Build a single compound SQL statement for all sessions.
    let mut sql = String::from("BEGIN IMMEDIATE;");
    for session_id in &session_ids {
        let escaped = escape_sql(session_id);
        sql.push_str(&format!(
            "UPDATE agent_job_items SET assigned_thread_id = NULL WHERE assigned_thread_id = '{escaped}';\
             DELETE FROM logs WHERE thread_id = '{escaped}';\
             DELETE FROM thread_spawn_edges WHERE parent_thread_id = '{escaped}' OR child_thread_id = '{escaped}';\
             DELETE FROM threads WHERE id = '{escaped}';"
        ));
    }
    sql.push_str("COMMIT;");
    run_codex_statement(&sql)?;

    for session_id in &session_ids {
        if let Ok(path) = find_codex_transcript_path(session_id) {
            if path.exists() {
                let _ = fs::remove_file(&path);
            }
        }
    }

    if let Some(history_path) = codex_history_path() {
        rewrite_jsonl_file(&history_path, |line| {
            if line.trim().is_empty() {
                return false;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                return true;
            };
            let Some(sid) = value.get("session_id").and_then(|v| v.as_str()) else {
                return true;
            };
            !ids_set.contains(sid)
        })?;
    }

    if let Some(index_path) = codex_session_index_path() {
        rewrite_jsonl_file(&index_path, |line| {
            if line.trim().is_empty() {
                return false;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                return true;
            };
            let Some(sid) = value.get("id").and_then(|v| v.as_str()) else {
                return true;
            };
            !ids_set.contains(sid)
        })?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_codex_session_transcript(
    session_id: String,
) -> Result<Vec<SessionTranscriptEvent>, String> {
    let file_path = find_codex_transcript_path(&session_id)?;

    let data = fs::read_to_string(file_path).map_err(|e| format!("Read failed: {}", e))?;
    let mut events = Vec::new();
    let mut tool_titles = HashMap::<String, String>::new();
    let mut last_reasoning_text: Option<String> = None;

    for (index, line) in data.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }

        let value: serde_json::Value = match serde_json::from_str(line) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        let Some(payload) = value.get("payload") else {
            continue;
        };
        let timestamp = value
            .get("timestamp")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        let event_id = format!("codex-{index}");

        if value.get("type").and_then(|v| v.as_str()) == Some("event_msg") {
            if payload.get("type").and_then(|value| value.as_str()) == Some("agent_reasoning") {
                let text = payload
                    .get("text")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .trim()
                    .to_string();

                if !text.is_empty() {
                    last_reasoning_text = Some(text.clone());
                    events.push(SessionTranscriptEvent {
                        id: event_id,
                        kind: "reasoning".to_string(),
                        timestamp,
                        role: Some("assistant".to_string()),
                        title: Some("Thinking".to_string()),
                        text: Some(text),
                        status: None,
                        display_mode: Some("text".to_string()),
                        call_id: None,
                        metadata: Vec::new(),
                    });
                }
            }
            continue;
        }

        if value.get("type").and_then(|v| v.as_str()) != Some("response_item") {
            continue;
        }

        match payload
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
        {
            "message" => {
                let role = payload
                    .get("role")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default();
                if role == "developer" {
                    continue;
                }

                let Some(items) = payload.get("content").and_then(|value| value.as_array()) else {
                    continue;
                };

                for (item_index, item) in items.iter().enumerate() {
                    let item_type = item
                        .get("type")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default();
                    let text = item
                        .get("text")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default()
                        .trim()
                        .to_string();

                    if item_type != "input_text" && item_type != "output_text" {
                        continue;
                    }

                    if should_skip_codex_message(role, &text) {
                        continue;
                    }

                    events.push(SessionTranscriptEvent {
                        id: format!("{event_id}:{item_index}"),
                        kind: "message".to_string(),
                        timestamp: timestamp.clone(),
                        role: Some(role.to_string()),
                        title: None,
                        text: Some(text),
                        status: None,
                        display_mode: Some("text".to_string()),
                        call_id: None,
                        metadata: phase_metadata(payload),
                    });
                }
            }
            "reasoning" => {
                let summary = payload
                    .get("summary")
                    .and_then(|value| value.as_array())
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(|item| item.get("text").and_then(|value| value.as_str()))
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_default();

                let summary = summary.trim().to_string();
                if summary.is_empty() {
                    continue;
                }

                if last_reasoning_text.as_deref() == Some(summary.as_str()) {
                    continue;
                }

                events.push(SessionTranscriptEvent {
                    id: event_id,
                    kind: "reasoning".to_string(),
                    timestamp,
                    role: Some("assistant".to_string()),
                    title: Some("Thinking".to_string()),
                    text: Some(summary),
                    status: None,
                    display_mode: Some("text".to_string()),
                    call_id: None,
                    metadata: Vec::new(),
                });
            }
            "function_call" | "custom_tool_call" => {
                let name = payload
                    .get("name")
                    .and_then(|value| value.as_str())
                    .unwrap_or("Tool");
                let arguments = payload
                    .get("arguments")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default();
                let call_id = payload
                    .get("call_id")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string());
                let (title, text, display_mode, metadata) =
                    describe_codex_tool_call(name, arguments);
                if let Some(call_id) = call_id.as_ref() {
                    tool_titles.insert(call_id.clone(), title.clone());
                }

                events.push(SessionTranscriptEvent {
                    id: event_id,
                    kind: "tool_call".to_string(),
                    timestamp,
                    role: Some("assistant".to_string()),
                    title: Some(title),
                    text,
                    status: None,
                    display_mode: Some(display_mode),
                    call_id,
                    metadata,
                });
            }
            "function_call_output" | "custom_tool_call_output" => {
                let call_id = payload
                    .get("call_id")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string());
                let output = payload
                    .get("output")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let title = call_id
                    .as_ref()
                    .and_then(|value| tool_titles.get(value))
                    .cloned()
                    .unwrap_or_else(|| "Tool".to_string());

                events.push(SessionTranscriptEvent {
                    id: event_id,
                    kind: "tool_result".to_string(),
                    timestamp,
                    role: None,
                    title: Some(title),
                    text: if output.is_empty() {
                        None
                    } else {
                        Some(output.clone())
                    },
                    status: Some(codex_output_status(&output).to_string()),
                    display_mode: Some(codex_output_display_mode(&output).to_string()),
                    call_id,
                    metadata: Vec::new(),
                });
            }
            _ => continue,
        }
    }

    Ok(events)
}

fn phase_metadata(payload: &serde_json::Value) -> Vec<TranscriptMetadataItem> {
    payload
        .get("phase")
        .and_then(|value| value.as_str())
        .map(|value| {
            vec![TranscriptMetadataItem {
                label: "Phase".to_string(),
                value: value.to_string(),
            }]
        })
        .unwrap_or_default()
}

fn should_skip_codex_message(role: &str, text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return true;
    }

    role == "user"
        && (trimmed.starts_with("# AGENTS.md instructions")
            || trimmed.starts_with("<environment_context>")
            || trimmed.starts_with("<permissions instructions>"))
}

fn parse_json_arguments(arguments: &str) -> Option<serde_json::Value> {
    serde_json::from_str(arguments).ok()
}

fn describe_codex_tool_call(
    name: &str,
    arguments: &str,
) -> (String, Option<String>, String, Vec<TranscriptMetadataItem>) {
    match name {
        "exec_command" => {
            let parsed = parse_json_arguments(arguments);
            let workdir = parsed
                .as_ref()
                .and_then(|value| value.get("workdir"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            let cmd = parsed
                .as_ref()
                .and_then(|value| value.get("cmd"))
                .and_then(|value| value.as_str())
                .map(|value| normalize_exec_command(value, workdir.as_deref()))
                .filter(|value| !value.is_empty());

            let mut metadata = Vec::new();
            if let Some(workdir) = workdir {
                metadata.push(TranscriptMetadataItem {
                    label: "Workdir".to_string(),
                    value: workdir,
                });
            }

            (
                "exec_command".to_string(),
                cmd.or_else(|| {
                    Some(arguments.trim().to_string()).filter(|value| !value.is_empty())
                }),
                "code".to_string(),
                metadata,
            )
        }
        "apply_patch" => {
            let files = apply_patch_files(arguments);
            let metadata = if files.is_empty() {
                Vec::new()
            } else {
                vec![TranscriptMetadataItem {
                    label: "Files".to_string(),
                    value: files.join(", "),
                }]
            };

            (
                "apply_patch".to_string(),
                Some(arguments.trim().to_string()),
                "diff".to_string(),
                metadata,
            )
        }
        "write_stdin" => {
            let parsed = parse_json_arguments(arguments);
            let chars = parsed
                .as_ref()
                .and_then(|value| value.get("chars"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
                .filter(|value| !value.is_empty());
            (
                "write_stdin".to_string(),
                chars,
                "code".to_string(),
                Vec::new(),
            )
        }
        "update_plan" => {
            let parsed = parse_json_arguments(arguments);
            let body = parsed
                .as_ref()
                .and_then(|value| value.get("plan"))
                .and_then(|value| value.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| {
                            let step = item.get("step").and_then(|value| value.as_str())?;
                            let status = item
                                .get("status")
                                .and_then(|value| value.as_str())
                                .unwrap_or("pending");
                            Some(format!("{status}: {step}"))
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                });
            (
                "update_plan".to_string(),
                body,
                "text".to_string(),
                Vec::new(),
            )
        }
        "view_image" => {
            let parsed = parse_json_arguments(arguments);
            let path = parsed
                .as_ref()
                .and_then(|value| value.get("path"))
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let title = if path.is_empty() {
                "view_image".to_string()
            } else {
                "view_image".to_string()
            };
            (
                title,
                if path.is_empty() {
                    None
                } else {
                    Some(path.to_string())
                },
                "text".to_string(),
                Vec::new(),
            )
        }
        _ => (
            name.replace('_', " "),
            Some(arguments.trim().to_string()).filter(|value| !value.is_empty()),
            "text".to_string(),
            Vec::new(),
        ),
    }
}

fn apply_patch_files(arguments: &str) -> Vec<String> {
    arguments
        .lines()
        .filter_map(|line| {
            line.strip_prefix("*** Update File: ")
                .or_else(|| line.strip_prefix("*** Add File: "))
                .or_else(|| line.strip_prefix("*** Delete File: "))
                .or_else(|| line.strip_prefix("*** Move to: "))
                .map(|value| value.trim().to_string())
        })
        .collect()
}

fn normalize_exec_command(command: &str, workdir: Option<&str>) -> String {
    let trimmed = command.trim();
    let Some(workdir) = workdir.map(str::trim).filter(|value| !value.is_empty()) else {
        return trimmed.to_string();
    };

    for prefix in [
        format!("cd {workdir} && "),
        format!("cd '{workdir}' && "),
        format!("cd \"{workdir}\" && "),
    ] {
        if let Some(stripped) = trimmed.strip_prefix(&prefix) {
            return stripped.trim().to_string();
        }
    }

    trimmed.to_string()
}

fn codex_output_status(output: &str) -> &'static str {
    if output.contains("Process exited with code 0") {
        "success"
    } else if output.contains("Process exited with code") || output.to_lowercase().contains("error")
    {
        "error"
    } else {
        "success"
    }
}

fn codex_output_display_mode(output: &str) -> &'static str {
    if output.contains("*** Begin Patch") || output.contains("@@") {
        "diff"
    } else {
        "code"
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_exec_command, parse_sqlite_json_rows};

    #[test]
    fn strips_matching_workdir_prefix_from_exec_command() {
        let command = "cd /tmp/project && npm test";
        let normalized = normalize_exec_command(command, Some("/tmp/project"));
        assert_eq!(normalized, "npm test");
    }

    #[test]
    fn preserves_exec_command_when_prefix_does_not_match_workdir() {
        let command = "cd /tmp/other && npm test";
        let normalized = normalize_exec_command(command, Some("/tmp/project"));
        assert_eq!(normalized, "cd /tmp/other && npm test");
    }

    #[test]
    fn parses_empty_sqlite_json_output_as_no_rows() {
        let rows = parse_sqlite_json_rows::<serde_json::Value>(b"\n \t")
            .expect("empty sqlite output should parse as zero rows");
        assert!(rows.is_empty());
    }
}
