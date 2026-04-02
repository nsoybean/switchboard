mod commands;
mod hook_server;

use commands::pty::SessionRegistry;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // macOS and Linux GUI apps lose access to your shell's $PATH env
    let _ = fix_path_env::fix();

    // Bind hook server port synchronously so state is always available
    let (hook_state, hook_listener) = hook_server::init_hook_server();
    let hook_token = hook_state.token.clone();

    tauri::Builder::default()
        .manage(SessionRegistry::new())
        .manage(hook_state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Spawn the async HTTP server now that the runtime is available
            hook_server::spawn_hook_server(
                app.handle().clone(),
                hook_listener,
                hook_token,
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pty::create_terminal,
            commands::pty::write_terminal,
            commands::pty::resize_terminal,
            commands::pty::close_terminal,
            commands::claude_data::get_claude_sessions,
            commands::claude_data::get_claude_history,
            commands::claude_data::get_claude_session_transcript,
            commands::codex_data::get_codex_sessions,
            commands::codex_data::find_codex_session,
            commands::codex_data::get_codex_session_transcript,
            commands::session_metadata::rename_session_metadata,
            commands::session_metadata::delete_session_metadata,
            commands::worktree::create_worktree,
            commands::worktree::remove_worktree,
            commands::worktree::list_worktrees,
            commands::git::git_status,
            commands::git::git_list_branches,
            commands::git::git_diff,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_revert_files,
            commands::git::git_commit,
            commands::git::git_pull,
            commands::git::git_push,
            commands::git::git_create_branch,
            commands::git::git_checkout_branch,
            commands::git::git_create_pr,
            commands::session::load_sessions,
            commands::session::save_session,
            commands::session::delete_session,
            commands::session::delete_all_data,
            commands::session::is_first_run,
            commands::session::complete_onboarding,
            commands::session::detect_agents,
            commands::session::get_project_path,
            commands::session::set_project_path,
            commands::session::list_project_paths,
            commands::session::add_project_path,
            commands::session::remove_project_path,
            commands::session::get_github_token,
            commands::session::set_github_token,
            commands::session::validate_github_token,
            commands::session::save_canvas_state,
            commands::session::load_canvas_state,
            commands::files::list_directory,
            commands::files::inspect_directory,
            commands::files::read_file_contents,
            // commands::session::get_notification_prefs,
            // commands::session::set_notification_prefs,
            commands::hooks::write_claude_hook_config,
            commands::hooks::write_codex_hook_config,
            hook_server::get_hook_port,
            hook_server::get_hook_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
