use axum::{
    Router,
    extract::State as AxumState,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// State shared with the Tauri app — exposes port and token to frontend.
/// Registered synchronously so it's always available to commands.
#[derive(Clone)]
pub struct HookServerState {
    pub port: u16,
    pub token: String,
}

/// Internal state for the axum handler.
struct HandlerState {
    token: String,
    app_handle: AppHandle,
}

/// Incoming hook payload (shared fields used by both Claude and Codex).
#[derive(Deserialize)]
struct AgentHookPayload {
    session_id: String,
    hook_event_name: String,
}

/// Event emitted to the Tauri frontend.
#[derive(Serialize, Clone)]
pub struct AgentHookEvent {
    pub session_id: String,
    pub event_name: String,
}

/// Bind port and generate token synchronously. Returns state for `app.manage()`
/// and a std listener to be converted to tokio later.
pub fn init_hook_server() -> (HookServerState, std::net::TcpListener) {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .expect("failed to bind hook server");
    listener.set_nonblocking(true).expect("failed to set nonblocking");
    let port = listener.local_addr().unwrap().port();
    let token = load_or_create_token();

    log::info!("Hook server bound to 127.0.0.1:{}", port);

    let state = HookServerState {
        port,
        token,
    };
    (state, listener)
}

/// Spawn the axum server as an async task. Call this after `app.manage()`.
pub fn spawn_hook_server(
    app_handle: AppHandle,
    std_listener: std::net::TcpListener,
    token: String,
) {
    tauri::async_runtime::spawn(async move {
        let listener = tokio::net::TcpListener::from_std(std_listener)
            .expect("failed to convert listener to tokio");

        let handler_state = Arc::new(HandlerState {
            token,
            app_handle,
        });

        let app = Router::new()
            .route("/claude-hooks", post(handle_hook))
            .route("/codex-hooks", post(handle_hook))
            .with_state(handler_state);

        axum::serve(listener, app)
            .await
            .expect("hook server crashed");
    });
}

async fn handle_hook(
    AxumState(state): AxumState<Arc<HandlerState>>,
    headers: HeaderMap,
    body: String,
) -> StatusCode {
    // Validate bearer token
    let auth = match headers.get("authorization").and_then(|v| v.to_str().ok()) {
        Some(v) => v,
        None => return StatusCode::UNAUTHORIZED,
    };
    let expected = format!("Bearer {}", state.token);
    if auth != expected {
        return StatusCode::UNAUTHORIZED;
    }

    // Parse payload
    let payload: AgentHookPayload = match serde_json::from_str(&body) {
        Ok(p) => p,
        Err(_) => return StatusCode::BAD_REQUEST,
    };

    // Emit Tauri event to frontend (single event name for all agents)
    let event = AgentHookEvent {
        session_id: payload.session_id,
        event_name: payload.hook_event_name,
    };
    let _ = state.app_handle.emit("agent-hook", event);

    StatusCode::OK
}

/// Load a persisted token from `~/.switchboard/hook_token`, or generate and
/// save a new one. This keeps the token stable across restarts so that
/// already-configured Claude sessions don't get 401s.
fn load_or_create_token() -> String {
    let token_path = dirs::home_dir()
        .expect("no home dir")
        .join(".switchboard")
        .join("hook_token");

    if let Ok(existing) = std::fs::read_to_string(&token_path) {
        let trimmed = existing.trim().to_string();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }

    let token = generate_token();
    if let Some(parent) = token_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&token_path, &token);
    token
}

fn generate_token() -> String {
    let mut rng = rand::rng();
    let bytes: [u8; 32] = rng.random();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

// -- Tauri commands --

#[tauri::command]
pub fn get_hook_port(state: tauri::State<'_, HookServerState>) -> u16 {
    state.port
}

#[tauri::command]
pub fn get_hook_token(state: tauri::State<'_, HookServerState>) -> String {
    state.token.clone()
}
