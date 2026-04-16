use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Clone)]
pub struct SessionRegistry {
    sessions: Arc<Mutex<HashMap<String, SessionRecord>>>,
}

struct SessionRecord {
    #[allow(dead_code)]
    session_id: String,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    output_buffer: Arc<Mutex<String>>,
}

const TERMINAL_BUFFER_LIMIT: usize = 200_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalResponse {
    pub session_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOutputPayload {
    pub tile_id: String,
    pub data: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExitPayload {
    pub tile_id: String,
    pub code: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalRequest {
    pub tile_id: String,
    pub cols: u16,
    pub rows: u16,
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    pub start_dir: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_terminal(
        &self,
        app: AppHandle,
        request: CreateTerminalRequest,
    ) -> Result<CreateTerminalResponse, String> {
        self.close_terminal(&request.tile_id)?;
        let (cols, rows) = clamp_dimensions(request.cols, request.rows);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("failed to allocate pty: {error}"))?;

        let resolved_command = resolve_command(request.command);
        let resolved_args = default_args_for_command(&resolved_command, request.args);
        let cwd = resolve_start_dir(request.start_dir);

        let mut command_builder = CommandBuilder::new(&resolved_command);
        command_builder.args(&resolved_args);
        command_builder.cwd(cwd);
        command_builder.env("TERM", "xterm-256color");
        command_builder.env("COLORTERM", "truecolor");
        command_builder.env("FORCE_COLOR", "3");

        // Ensure UTF-8 locale so wide/CJK characters render correctly
        if std::env::var("LANG").map_or(true, |v| !v.contains("UTF-8")) {
            command_builder.env("LANG", "en_US.UTF-8");
        }

        if let Some(env) = request.env {
            for (key, value) in env {
                command_builder.env(key, value);
            }
        }

        let child = pair
            .slave
            .spawn_command(command_builder)
            .map_err(|error| format!("failed to spawn command: {error}"))?;

        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| format!("failed to clone pty reader: {error}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| format!("failed to take pty writer: {error}"))?;

        let session_id = Uuid::new_v4().to_string();
        let master = Arc::new(Mutex::new(pair.master));
        let writer = Arc::new(Mutex::new(writer));
        let child = Arc::new(Mutex::new(child));
        let output_buffer = Arc::new(Mutex::new(String::new()));

        self.sessions
            .lock()
            .map_err(|_| "failed to lock session registry".to_string())?
            .insert(
                request.tile_id.clone(),
                SessionRecord {
                    session_id: session_id.clone(),
                    master,
                    writer,
                    child,
                    output_buffer: output_buffer.clone(),
                },
            );

        spawn_reader(app, request.tile_id, reader, output_buffer);

        Ok(CreateTerminalResponse { session_id })
    }

    pub fn write_terminal(&self, tile_id: &str, data: &str) -> Result<(), String> {
        let writer = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| "failed to lock session registry".to_string())?;
            let session = sessions
                .get(tile_id)
                .ok_or_else(|| format!("unknown tile id: {tile_id}"))?;
            session.writer.clone()
        };

        let mut writer = writer
            .lock()
            .map_err(|_| "failed to lock terminal writer".to_string())?;

        writer
            .write_all(data.as_bytes())
            .map_err(|error| format!("failed to write to terminal: {error}"))
    }

    pub fn resize_terminal(&self, tile_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let (cols, rows) = clamp_dimensions(cols, rows);
        let master = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| "failed to lock session registry".to_string())?;
            let session = sessions
                .get(tile_id)
                .ok_or_else(|| format!("unknown tile id: {tile_id}"))?;
            session.master.clone()
        };

        let master = master
            .lock()
            .map_err(|_| "failed to lock master pty".to_string())?;

        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("failed to resize terminal: {error}"))
    }

    pub fn close_terminal(&self, tile_id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "failed to lock session registry".to_string())?
            .remove(tile_id);

        if let Some(record) = session {
            let _ = record
                .child
                .lock()
                .map_err(|_| "failed to lock terminal child".to_string())?
                .kill();
        }

        Ok(())
    }

    pub fn terminal_exists(&self, tile_id: &str) -> Result<bool, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "failed to lock session registry".to_string())?;

        Ok(sessions.contains_key(tile_id))
    }

    pub fn terminal_buffer(&self, tile_id: &str) -> Result<String, String> {
        let output_buffer = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| "failed to lock session registry".to_string())?;
            let session = sessions
                .get(tile_id)
                .ok_or_else(|| format!("unknown tile id: {tile_id}"))?;
            session.output_buffer.clone()
        };

        output_buffer
            .lock()
            .map(|buffer| buffer.clone())
            .map_err(|_| "failed to lock terminal output buffer".to_string())
    }

    fn close_all(&self) {
        let tile_ids = match self.sessions.lock() {
            Ok(sessions) => sessions.keys().cloned().collect::<Vec<_>>(),
            Err(_) => return,
        };

        for tile_id in tile_ids {
            let _ = self.close_terminal(&tile_id);
        }
    }

    #[cfg(test)]
    fn insert_placeholder(&self, tile_id: &str, session_id: &str) {
        let writer = Arc::new(Mutex::new(
            Box::new(std::io::sink()) as Box<dyn Write + Send>
        ));
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 8,
                cols: 20,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("open pty");
        let master = Arc::new(Mutex::new(pair.master));
        let child = pair
            .slave
            .spawn_command(CommandBuilder::new("/usr/bin/true"))
            .expect("spawn");
        self.sessions.lock().expect("registry lock").insert(
            tile_id.to_string(),
            SessionRecord {
                session_id: session_id.to_string(),
                master,
                writer,
                child: Arc::new(Mutex::new(child)),
                output_buffer: Arc::new(Mutex::new(String::new())),
            },
        );
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.sessions.lock().expect("registry lock").len()
    }
}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for SessionRegistry {
    fn drop(&mut self) {
        self.close_all();
    }
}

fn trim_output_buffer(buffer: &mut String, limit: usize) {
    if buffer.len() <= limit {
        return;
    }

    let overflow = buffer.len() - limit;
    let boundary = buffer
        .char_indices()
        .find(|(index, _)| *index >= overflow)
        .map(|(index, _)| index)
        .unwrap_or(0);

    buffer.drain(..boundary);
}

/// Return the number of leading bytes that form complete UTF-8 characters.
/// Any trailing incomplete multi-byte sequence is excluded so the caller
/// can carry it over to the next read — avoiding `from_utf8_lossy` corruption
/// that breaks the ANSI escape sequence stream in xterm.js.
fn utf8_complete_len(bytes: &[u8]) -> usize {
    match std::str::from_utf8(bytes) {
        Ok(_) => bytes.len(),
        Err(e) => e.valid_up_to(),
    }
}

fn spawn_reader(
    app: AppHandle,
    tile_id: String,
    mut reader: Box<dyn Read + Send>,
    output_buffer: Arc<Mutex<String>>,
) {
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        // Carry-over buffer for incomplete UTF-8 sequences split across reads
        let mut carry = Vec::<u8>::new();

        loop {
            // Read into the buffer, leaving room at the start for carried-over bytes
            let start = carry.len();
            let n = match reader.read(&mut buffer[start..]) {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };

            // Prepend any carried-over bytes from the previous read
            if !carry.is_empty() {
                buffer[..start].copy_from_slice(&carry);
                carry.clear();
            }

            let total = start + n;
            let valid = utf8_complete_len(&buffer[..total]);

            // Stash any trailing incomplete UTF-8 bytes for the next iteration
            if valid < total {
                carry.extend_from_slice(&buffer[valid..total]);
            }

            if valid == 0 {
                continue;
            }

            // SAFETY: utf8_complete_len guarantees buffer[..valid] is valid UTF-8
            let data = unsafe { std::str::from_utf8_unchecked(&buffer[..valid]) }.to_owned();

            if let Ok(mut buffered_output) = output_buffer.lock() {
                buffered_output.push_str(&data);
                trim_output_buffer(&mut buffered_output, TERMINAL_BUFFER_LIMIT);
            }
            let _ = app.emit(
                "workspace-output",
                WorkspaceOutputPayload {
                    tile_id: tile_id.clone(),
                    data,
                },
            );
        }

        // Flush any remaining carried-over bytes (lossy is fine at EOF)
        if !carry.is_empty() {
            let data = String::from_utf8_lossy(&carry).into_owned();
            if let Ok(mut buffered_output) = output_buffer.lock() {
                buffered_output.push_str(&data);
                trim_output_buffer(&mut buffered_output, TERMINAL_BUFFER_LIMIT);
            }
            let _ = app.emit(
                "workspace-output",
                WorkspaceOutputPayload {
                    tile_id: tile_id.clone(),
                    data,
                },
            );
        }

        let _ = app.emit(
            "workspace-exit",
            WorkspaceExitPayload {
                tile_id,
                code: None,
            },
        );
    });
}

fn resolve_command(command: Option<String>) -> String {
    match command {
        Some(command) if !command.trim().is_empty() => command,
        _ => std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string()),
    }
}

fn resolve_start_dir(start_dir: Option<String>) -> String {
    match start_dir {
        Some(path) if !path.trim().is_empty() => path,
        _ => std::env::var("HOME").unwrap_or_else(|_| "/".to_string()),
    }
}

fn default_args_for_command(command: &str, args: Vec<String>) -> Vec<String> {
    if !args.is_empty() {
        return args;
    }

    if uses_login_flag(command) {
        return vec!["-l".to_string()];
    }

    Vec::new()
}

fn uses_login_flag(command: &str) -> bool {
    let executable = command
        .rsplit('/')
        .next()
        .unwrap_or(command)
        .trim()
        .to_ascii_lowercase();

    matches!(executable.as_str(), "zsh" | "bash")
}

fn clamp_dimensions(cols: u16, rows: u16) -> (u16, u16) {
    (cols.max(20), rows.max(8))
}

#[tauri::command]
pub fn create_terminal(
    app: AppHandle,
    sessions: State<'_, SessionRegistry>,
    request: CreateTerminalRequest,
) -> Result<CreateTerminalResponse, String> {
    sessions.create_terminal(app, request)
}

#[tauri::command]
pub fn write_terminal(
    sessions: State<'_, SessionRegistry>,
    tile_id: String,
    data: String,
) -> Result<(), String> {
    sessions.write_terminal(&tile_id, &data)
}

#[tauri::command]
pub fn resize_terminal(
    sessions: State<'_, SessionRegistry>,
    tile_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    sessions.resize_terminal(&tile_id, cols, rows)
}

#[tauri::command]
pub fn close_terminal(sessions: State<'_, SessionRegistry>, tile_id: String) -> Result<(), String> {
    sessions.close_terminal(&tile_id)
}

#[tauri::command]
pub fn terminal_exists(sessions: State<'_, SessionRegistry>, tile_id: String) -> Result<bool, String> {
    sessions.terminal_exists(&tile_id)
}

#[tauri::command]
pub fn get_terminal_buffer(
    sessions: State<'_, SessionRegistry>,
    tile_id: String,
) -> Result<String, String> {
    sessions.terminal_buffer(&tile_id)
}

#[cfg(test)]
mod tests {
    use super::{clamp_dimensions, default_args_for_command, utf8_complete_len, SessionRegistry};

    #[test]
    fn tracks_and_removes_session_bookkeeping() {
        let registry = SessionRegistry::new();
        registry.insert_placeholder("tile-1", "session-1");

        assert_eq!(registry.len(), 1);

        registry
            .close_terminal("tile-1")
            .expect("close should succeed");

        assert_eq!(registry.len(), 0);
    }

    #[test]
    fn clamps_zero_sized_terminal_dimensions() {
        assert_eq!(clamp_dimensions(0, 0), (20, 8));
        assert_eq!(clamp_dimensions(120, 32), (120, 32));
    }

    #[test]
    fn defaults_shells_to_login_mode() {
        assert_eq!(default_args_for_command("/bin/zsh", vec![]), vec!["-l"]);
        assert_eq!(default_args_for_command("bash", vec![]), vec!["-l"]);
    }

    #[test]
    fn does_not_inject_shell_args_for_other_commands() {
        assert_eq!(
            default_args_for_command("codex", vec![]),
            Vec::<String>::new()
        );
        assert_eq!(
            default_args_for_command("claude", vec![]),
            Vec::<String>::new()
        );
    }

    #[test]
    fn preserves_explicit_args() {
        assert_eq!(
            default_args_for_command("codex", vec!["resume".into(), "--last".into()]),
            vec!["resume", "--last"]
        );
    }

    #[test]
    fn utf8_complete_len_returns_full_length_for_ascii() {
        assert_eq!(utf8_complete_len(b"hello"), 5);
    }

    #[test]
    fn utf8_complete_len_excludes_incomplete_multibyte() {
        // '€' is 3 bytes: 0xE2 0x82 0xAC
        // If only the first 2 bytes are present, they should be excluded
        let mut bytes = "hello€".as_bytes().to_vec();
        bytes.pop(); // remove last byte of '€'
        assert_eq!(utf8_complete_len(&bytes), 5); // only "hello" is complete
    }

    #[test]
    fn utf8_complete_len_handles_emoji_boundary() {
        // '🚀' is 4 bytes: 0xF0 0x9F 0x9A 0x80
        let mut bytes = "ok🚀".as_bytes().to_vec();
        bytes.pop(); // remove last byte of '🚀'
        assert_eq!(utf8_complete_len(&bytes), 2); // only "ok" is complete
    }
}
