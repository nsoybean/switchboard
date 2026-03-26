# Switchboard

Open-source multi-agent orchestrator for AI coding agents (Claude Code, Codex).

## Tech Stack
- **Backend:** Rust (Tauri v2) — `src-tauri/`
- **Frontend:** React + TypeScript + Tailwind CSS v4 + shadcn/ui — `src/`
- **UI Components:** shadcn/ui (radix-mira style, stone base, lucide icons)
- **Terminal:** xterm.js v6 with WebGL addon
- **PTY:** portable-pty (custom Tauri commands, not the plugin)
- **Git:** All operations via git CLI subprocess
- **State:** React Context + useReducer
- **Window:** Custom Tauri titlebar (decorations: false, titleBarStyle: overlay)

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
- Fonts: Inter (UI), JetBrains Mono (terminal/code)
- Colors: shadcn oklch CSS variables (light + dark mode) in `src/styles/globals.css`
- Theme: radix-mira style, stone base, preset `bKZTOdKa` from tweakcn.com
- Switchboard-specific tokens: `--sb-status-*`, `--sb-diff-*` for status/diff colors
- Icons: lucide-react
- Use semantic Tailwind classes (`bg-background`, `text-muted-foreground`), not raw colors
- Aesthetic: clean, minimal, IDE-like with light and dark mode

## Testing
```bash
cargo test --manifest-path src-tauri/Cargo.toml  # Rust unit tests
```
Test files are colocated with source in Rust (mod tests blocks).
