# Switchboard

Open-source multi-agent orchestrator for AI coding agents (Claude Code, Codex).

## Tech Stack
- **Backend:** Rust (Tauri v2) — `src-tauri/`
- **Frontend:** React + TypeScript + Tailwind CSS — `src/`
- **Terminal:** xterm.js v6 with WebGL addon
- **PTY:** portable-pty (custom Tauri commands, not the plugin)
- **Git:** All operations via git CLI subprocess
- **State:** React Context + useReducer

## Development
```bash
npm install
npm run tauri dev      # Run in dev mode
npm run build          # Build frontend
cargo test --manifest-path src-tauri/Cargo.toml  # Run Rust tests
npx tsc --noEmit       # TypeScript check
```

## Architecture
- PTY pipeline: portable-pty → Tauri events → usePty hook → xterm.js
- Session data: reads from ~/.claude/projects/ (Claude Code storage), writes own metadata to ~/.switchboard/sessions.json
- Git panel: all operations via git CLI subprocess in the session's worktree

## Design System
- Font: JetBrains Mono
- Spacing: 4px base unit
- Colors: CSS variables prefixed with `--sb-` (see src/styles/globals.css)
- Aesthetic: terminal-native, dark, dense, minimal chrome

## Testing
```bash
cargo test --manifest-path src-tauri/Cargo.toml  # Rust unit tests
```
Test files are colocated with source in Rust (mod tests blocks).
