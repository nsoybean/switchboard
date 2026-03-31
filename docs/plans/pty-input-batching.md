# PTY Input Write Batching

## Problem

When running multiple sessions (e.g. Claude Code + Codex), the Codex terminal feels laggier to type in. Every keystroke fires a separate `invoke("pty_write")` IPC call, and `pty_write` in `src-tauri/src/commands/pty.rs` locks a **global mutex** on the entire handles HashMap — so writes to one PTY block while another PTY's lock is held.

## Proposed Fix

**File: `src/hooks/usePty.ts`**

- Add `inputBufferRef` (string) and `inputFlushTimerRef` (timer) refs
- Replace the per-keystroke `invoke("pty_write")` in `terminal.onData` with a 3ms batching timer:
  - Accumulate keystrokes via string concatenation
  - On timer fire: send the entire buffer in one IPC call
  - 3ms is fast enough to feel instant but coalesces rapid keystrokes (fast typing, pastes) into fewer IPC calls
- Flush remaining buffer on effect teardown so no keystrokes are lost
- Add cleanup for `inputFlushTimerRef` in the existing unmount cleanup effect

This reduces IPC calls during fast typing from N-per-keystroke to ~1-per-3ms, and reduces global mutex contention proportionally.
