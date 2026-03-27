mod commands;

use commands::pty::PtyState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PtyState::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pty::pty_spawn,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
            commands::claude_data::get_claude_sessions,
            commands::claude_data::get_claude_history,
            commands::claude_data::rename_claude_session,
            commands::claude_data::delete_claude_session,
            commands::codex_data::get_codex_sessions,
            commands::codex_data::find_codex_session,
            commands::codex_data::rename_codex_session,
            commands::codex_data::delete_codex_session,
            commands::worktree::create_worktree,
            commands::worktree::remove_worktree,
            commands::worktree::list_worktrees,
            commands::git::git_status,
            commands::git::git_diff,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_revert_files,
            commands::git::git_commit,
            commands::git::git_push,
            commands::git::git_create_branch,
            commands::git::git_create_pr,
            commands::session::load_sessions,
            commands::session::save_session,
            commands::session::delete_session,
            commands::session::is_first_run,
            commands::session::complete_onboarding,
            commands::session::detect_agents,
            commands::session::get_project_path,
            commands::session::set_project_path,
            commands::session::get_github_token,
            commands::session::set_github_token,
            commands::session::validate_github_token,
            commands::files::list_directory,
            commands::files::read_file_contents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
