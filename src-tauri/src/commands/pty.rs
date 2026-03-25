use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Unique ID for each PTY session
type PtyId = u32;

/// Holds a PTY master pair: writer for input, reader for output
struct PtyHandle {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// Global state managing all active PTY sessions
pub struct PtyState {
    handles: Mutex<HashMap<PtyId, PtyHandle>>,
    next_id: Mutex<u32>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }
}

#[derive(Serialize, Clone)]
struct PtyOutput {
    id: PtyId,
    data: Vec<u8>,
}

#[derive(Serialize, Clone)]
struct PtyExit {
    id: PtyId,
    code: Option<u32>,
}

#[derive(Deserialize)]
pub struct SpawnOptions {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
    pub env: Option<HashMap<String, String>>,
}

/// Spawn a new PTY process and start streaming output
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    options: SpawnOptions,
) -> Result<PtyId, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: options.rows,
            cols: options.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd = CommandBuilder::new(&options.command);
    for arg in &options.args {
        cmd.arg(arg);
    }
    if let Some(cwd) = &options.cwd {
        cmd.cwd(cwd);
    }
    // Set TERM for proper terminal rendering
    cmd.env("TERM", "xterm-256color");
    if let Some(env) = &options.env {
        for (k, v) in env {
            cmd.env(k, v);
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    // Assign ID
    let id = {
        let mut next = state.next_id.lock().unwrap();
        let id = *next;
        *next += 1;
        id
    };

    // Start background reader thread that emits events to the frontend
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    let app_clone = app.clone();
    let pty_id = id;
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let _ = app_clone.emit(
                        "pty-output",
                        PtyOutput {
                            id: pty_id,
                            data: buf[..n].to_vec(),
                        },
                    );
                }
                Err(_) => break,
            }
        }
        // Process exited — notify frontend
        let _ = app_clone.emit(
            "pty-exit",
            PtyExit {
                id: pty_id,
                code: None, // Exit code retrieved separately
            },
        );
    });

    // Store handle
    {
        let mut handles = state.handles.lock().unwrap();
        handles.insert(
            id,
            PtyHandle {
                writer,
                master: pair.master,
                child,
            },
        );
    }

    Ok(id)
}

/// Write data (user keystrokes) to a PTY
#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, id: PtyId, data: String) -> Result<(), String> {
    let mut handles = state.handles.lock().unwrap();
    let handle = handles
        .get_mut(&id)
        .ok_or_else(|| format!("PTY {} not found", id))?;
    handle
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))?;
    handle
        .writer
        .flush()
        .map_err(|e| format!("Flush failed: {}", e))?;
    Ok(())
}

/// Resize a PTY
#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyState>,
    id: PtyId,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let handles = state.handles.lock().unwrap();
    let handle = handles
        .get(&id)
        .ok_or_else(|| format!("PTY {} not found", id))?;
    handle
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize failed: {}", e))?;
    Ok(())
}

/// Kill a PTY process
#[tauri::command]
pub fn pty_kill(state: State<'_, PtyState>, id: PtyId) -> Result<(), String> {
    let mut handles = state.handles.lock().unwrap();
    if let Some(mut handle) = handles.remove(&id) {
        handle
            .child
            .kill()
            .map_err(|e| format!("Kill failed: {}", e))?;
    }
    Ok(())
}
