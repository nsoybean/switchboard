# Switchboard Architecture

This document is the high-level, living map of the app for both humans and agents.
It should answer two questions quickly:

1. What does Switchboard do today?
2. Which part of the codebase owns each behavior?

## Product Snapshot

Switchboard is a Tauri desktop app for running multiple coding-agent sessions side by side in real PTYs.

Today, the app is centered around:

- A project picker for choosing git repositories to work in
- A session sidebar for active sessions and past Claude/Codex history
- A live terminal surface backed by `portable-pty -> Tauri events -> xterm.js`
- A structured transcript view for past Claude Code and Codex sessions
- A workspace inspector with file browsing and git changes
- Optional per-session git worktree isolation
- Local persistence for Switchboard metadata in `~/.switchboard/`

## What Exists Today

The current app already supports these main flows:

- Launch a new `claude`, `codex`, or `bash` session
- Optionally create a dedicated git worktree for a session before launch
- Keep multiple live sessions open and switch between them
- Stop, rename, delete, and resume sessions
- Read past Claude Code sessions from `~/.claude/projects/...`
- Read past Codex sessions from `~/.codex/state_5.sqlite` and archived transcripts
- Open past sessions in a structured transcript viewer
- Inspect repository files from the selected project or selected session workspace
- View diffs, stage, unstage, revert, commit, push, switch branch, create branch, and open a PR from the git panel
- Track Claude token usage and estimated cost while a session is running
- Check for and install desktop app updates via the Tauri updater

## System Overview

```text
Frontend (React / TypeScript)
  App.tsx
    -> Theme + tooltip + notification shell
    -> AppProvider (global reducer state)
    -> AppLayout
         -> Titlebar
         -> SessionSidebar
         -> Focused terminal view OR scroll view
         -> Transcript viewer for historical sessions
         -> WorkspacePanel
              -> FilePanel / FileTree
              -> GitPanel

Backend (Tauri / Rust)
  PTY commands
    -> spawn/write/resize/kill real terminal processes
  Session/config commands
    -> persist Switchboard metadata in ~/.switchboard
  Claude/Codex data commands
    -> read local agent history/transcripts
  Git/worktree commands
    -> shell out to git CLI in the selected workspace
  File commands
    -> inspect directories, list files, read text files

External local data sources
  ~/.switchboard/
  ~/.claude/
  ~/.codex/
  git CLI
```

## Primary Runtime Flows

### 1. New Session Flow

Owner: `src/components/layout/AppLayout.tsx`

1. User opens the new session dialog.
2. AppLayout decides the launch root:
   - project root, or
   - a newly created `.switchboard-worktrees/<slug>` worktree
3. AppLayout builds the command line for the chosen agent via `src/lib/agents.ts`.
4. The new session is added to reducer state and persisted through `save_session`.
5. `XTermContainer` mounts for that session.
6. `usePty` calls `pty_spawn`.
7. Rust spawns the real command in a PTY and streams output through Tauri events.
8. xterm.js renders the stream and forwards keystrokes back with `pty_write`.

### 2. Session Exit / Resume Flow

Owner: `src/components/layout/AppLayout.tsx`

- When a PTY exits, the frontend marks the session `done`, `error`, or `stopped`.
- For Codex sessions, the app tries to discover and backfill the true resume target after launch.
- Resuming a historical session swaps the UI back from transcript mode to a fresh live PTY session.

### 3. Workspace Resolution Flow

Owner: `src/components/layout/AppLayout.tsx`, `src/components/workspace/WorkspacePanel.tsx`

The inspector does not blindly assume the saved path still exists.
It resolves the root in this order:

1. session worktree path
2. session cwd
3. project root

Then it checks the path through `inspect_directory` and renders one of:

- ready
- missing
- resolving

This is why historical sessions can still be shown even when their old workspace is gone.

### 4. Transcript / History Flow

Owners:

- `src/hooks/useSessions.ts`
- `src/components/terminal/SessionTranscriptView.tsx`
- `src-tauri/src/commands/claude_data.rs`
- `src-tauri/src/commands/codex_data.rs`

Claude history:

- session summaries come from Claude's local project JSONL files
- transcripts are parsed from Claude session JSONL records
- Switchboard overlays local rename/delete metadata in `~/.switchboard/claude_session_metadata.json`

Codex history:

- session summaries come from the local Codex sqlite database
- transcript files are resolved from the rollout path in sqlite, with archived-session fallback
- Switchboard overlays local rename/delete metadata in `~/.switchboard/codex_session_metadata.json`

### 5. Git / Worktree Flow

Owners:

- `src/components/git/*`
- `src-tauri/src/commands/git.rs`
- `src-tauri/src/commands/worktree.rs`

The git panel always operates in the selected workspace root, not some global repo state.

Supported actions today:

- status
- list local branches
- diff
- stage / unstage
- revert file changes
- commit
- push
- checkout branch
- create branch
- create PR
- create/remove/list git worktrees

Switchboard-created worktrees live under:

```text
<repo>/.switchboard-worktrees/
```

and that directory is automatically added to `.gitignore` if missing.

## Frontend Module Guide

### App Shell

- `src/App.tsx`
  Bootstraps theme, tooltips, notifications, and the main app shell.

- `src/components/layout/AppLayout.tsx`
  Main orchestration layer. Owns session creation, resume, stop, rename, delete, workspace resolution, dialogs, and view switching.

- `src/components/layout/Titlebar.tsx`
  Top chrome for project identity, inspector/sidebar toggles, view mode, theme, settings, and updater actions.

### State

- `src/state/types.ts`
  Canonical frontend types for sessions, workspace identity, and app state.

- `src/state/reducer.ts`
  Reducer for session list, active session, workspace preview, project selection, and settings state.

- `src/state/context.tsx`
  Global provider that loads persisted project paths and GitHub token on startup.

### Sessions and Terminals

- `src/lib/agents.ts`
  Maps agent type to command-line behavior for spawn and resume.

- `src/hooks/usePty.ts`
  Frontend PTY bridge. Listens for `pty-output` / `pty-exit` events and forwards terminal input back to Rust.

- `src/components/terminal/XTermContainer.tsx`
  Owns xterm.js setup, fit behavior, resize syncing, and delayed spawn until the terminal has valid dimensions.

- `src/components/terminal/TerminalToolbar.tsx`
  Displays session metadata, stop action, branch, cwd, and Claude token/cost estimates.

- `src/components/terminal/ScrollView.tsx`
  Multi-terminal view when the app is in scroll mode.

### History / Transcripts

- `src/hooks/useSessions.ts`
  Loads historical Claude/Codex session summaries for the selected project.

- `src/components/terminal/SessionTranscriptView.tsx`
  Read-only structured transcript viewer with resume action for supported agents.

- `src/lib/session-transcript.ts`
  Groups tool calls and tool results for cleaner transcript rendering.

### Workspace Inspector

- `src/components/workspace/WorkspacePanel.tsx`
  Switches between file browsing and git changes for the resolved workspace.

- `src/components/files/FilePanel.tsx`
  Thin wrapper that connects file selection to global preview state.

- `src/components/files/FileTree.tsx`
  Lazy recursive directory browser. Filters ignored files through backend commands.

- `src/components/files/FilePreview.tsx`
  Text preview surface for the selected file.

- `src/components/git/GitPanel.tsx`
  Main git UI for status, diff expansion, staging, committing, pushing, and branch actions.

- `src/components/git/GitToolbar.tsx`
  Git controls and PR actions at the top of the inspector.

### Supporting UX

- `src/hooks/useKeyboardShortcuts.ts`
  Global shortcuts for session switching, new session, sidebar toggle, inspector toggle, and view mode.

- `src/hooks/useAppUpdater.ts`
  Tauri updater integration.

- `src/hooks/useTokenUsage.ts`
  Polls Claude session summaries to estimate live token usage and cost.

- `src/hooks/useNotchNotifications.ts`
  Notification state for the app's notch-style alert UI.

## Backend Module Guide

### PTY Runtime

- `src-tauri/src/commands/pty.rs`
  Real PTY process lifecycle. Opens the PTY, spawns the child command, streams bytes to the frontend, handles resize, and kills child processes.

### Local Session / Config Storage

- `src-tauri/src/commands/session.rs`
  Persists Switchboard-owned metadata in `~/.switchboard/`, including:
  - `sessions.json`
  - `config.json`
  - selected project path(s)
  - onboarding state
  - GitHub token

### Claude Data Integration

- `src-tauri/src/commands/claude_data.rs`
  Reads Claude project JSONL history, extracts summaries, parses transcripts, and stores local rename/delete overlays.

### Codex Data Integration

- `src-tauri/src/commands/codex_data.rs`
  Reads the Codex sqlite database, resolves transcript files, parses transcripts, and stores local rename/delete overlays.

### Git / Worktrees

- `src-tauri/src/commands/git.rs`
  Thin git CLI wrapper for status, diffs, branch actions, staging, commit, push, and PR creation.

- `src-tauri/src/commands/worktree.rs`
  Thin git worktree wrapper for creation, removal, listing, and Switchboard worktree naming.

### Filesystem Access

- `src-tauri/src/commands/files.rs`
  Directory inspection, git-ignore-aware file listing, and text file reading for preview.

### Tauri Wiring

- `src-tauri/src/lib.rs`
  Registers plugins and exposes the full Tauri command surface to the frontend.

## Local Data and External Dependencies

### Switchboard-owned local files

Switchboard writes its own metadata under:

```text
~/.switchboard/
  sessions.json
  config.json
  claude_session_metadata.json
  codex_session_metadata.json
```

### External local data Switchboard reads

Claude:

```text
~/.claude/history.jsonl
~/.claude/projects/...
```

Codex:

```text
~/.codex/state_5.sqlite
~/.codex/archived_sessions
```

### Important external binaries / APIs

- `git`
- `sqlite3` for Codex history queries
- local `claude` CLI
- local `codex` CLI
- Tauri desktop plugins

## Current State Notes

These are useful mental-model notes for anyone changing the app:

- The main orchestration logic currently lives in one large file: `src/components/layout/AppLayout.tsx`.
- The reducer is intentionally lightweight; most asynchronous orchestration still happens in components and hooks.
- Session persistence is wired on create/resume/update/delete actions through `save_session`, but I did not find a frontend callsite for `load_sessions` during this inspection. That suggests persisted session metadata may currently be written more than it is hydrated on startup.
- Bash sessions can run live in a PTY, but transcript view is not implemented for bash yet.
- File preview is text-only and capped to relatively small files by the backend.
- The file tree hides dotfiles and filters git-ignored entries in the backend.
- Token/cost tracking is Claude-specific at the moment.
- Branch listing in the current git panel is focused on local branches.

## Suggested Way To Keep This Updated

When a feature lands, update one or more of these sections:

- `What Exists Today`
- `Primary Runtime Flows`
- `Frontend Module Guide`
- `Backend Module Guide`
- `Current State Notes`

If a new subsystem appears, add it here before expanding the README.
