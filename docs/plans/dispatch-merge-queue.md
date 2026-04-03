# Dispatch & Merge Queue — Tier 1 Foundation

## Context

Switchboard is adding a parallel multi-agent workflow. The core idea: a solo founder dispatches
multiple agents to work in isolated git worktrees simultaneously, supervises them from a cockpit
view, then reviews and merges their outputs one by one.

Two design decisions lock in the foundation:

1. **"Dispatch Agent" = existing new session flow + `taskPrompt` field.** Same primitives
   (`create_worktree` + `create_terminal` + `ADD_SESSION`). The `taskPrompt` field on `Session`
   is the contract: if set, the session is in "task mode" — it has one job and should move to
   review when done. `NewSessionDialog` already collects `task` and `useWorktree` — no UI change
   needed.

2. **`idle` vs `merge-pending` are distinct states.** `idle` = "waiting for your next message"
   (interactive sessions, unchanged). `merge-pending` = "dispatched task complete, code ready
   to review." The `Stop` hook already fires when an agent finishes a turn. The reducer
   auto-promotes `idle → merge-pending` when `session.taskPrompt !== null`.

This plan implements the minimum to make that lifecycle work end-to-end.

---

## What's NOT in Scope (deferred)

- `ConflictResolver` component (three-pane)
- `git merge-tree` conflict detection (`merge.rs`)
- Local merge command (`git_merge_branch`)
- PR creation changes — `git_create_pr` already exists in `git.rs:288`
- `config.rs` for repo-scoped merge strategy preference
- PTY idle detection (backlogged — existing Claude/Codex hooks cover it)

---

## Critical Files

| File | Change |
|------|--------|
| `src/state/types.ts` | Extend `SessionStatus` with 5 new values, add `taskPrompt` to `Session` |
| `src/state/reducer.ts` | Auto-promote `idle → merge-pending` for dispatched sessions |
| `src/components/layout/AppLayout.tsx` | Pass `config.task` into `session.taskPrompt` at lines 524-545 |
| `src/components/sidebar/SessionCard.tsx` | Add badge labels + colors for new statuses |
| `src/components/git/MergeQueuePanel.tsx` | New component — merge queue list (right panel) |
| `src-tauri/src/commands/session.rs` | Add `task_prompt: Option<String>` with `#[serde(default)]` |

---

## Implementation

### 1. Extend `SessionStatus` — `src/state/types.ts`

```typescript
export type SessionStatus =
  | "running"
  | "idle"
  | "needs-input"
  | "done"
  | "error"
  | "stopped"
  // Dispatched-session merge lifecycle:
  | "merge-pending"    // task complete, in merge queue awaiting review
  | "merge-conflict"   // conflict detected pre-merge (future: merge.rs)
  | "merged"           // local merge complete
  | "pr-raised"        // PR created on GitHub
  | "rejected";        // task abandoned by user
```

Add `taskPrompt` to `Session` (after the `env` field):

```typescript
/** Set when session was created via Dispatch (task mode). Null = regular interactive session. */
taskPrompt: string | null;
```

Full status taxonomy:

| Status | Meaning | Session type |
|--------|---------|-------------|
| running | Agent actively producing output | Both |
| needs-input | Agent asked a clarifying question | Both |
| idle | Agent finished a turn, waiting for input | Regular only |
| merge-pending | Dispatched task complete, ready to review | Dispatched only |
| merge-conflict | Conflict detected, needs resolution | Dispatched only |
| merged | Local merge complete | Dispatched only |
| pr-raised | PR created on GitHub | Dispatched only |
| rejected | Task abandoned | Dispatched only |
| done | PTY process exited | Both |
| error | PTY exited with error | Both |
| stopped | User manually stopped | Both |

---

### 2. Auto-promote in reducer — `src/state/reducer.ts` (lines 68-82)

Replace the `UPDATE_STATUS` case body:

```typescript
case "UPDATE_STATUS": {
  const session = state.sessions[action.id];
  if (!session) return state;
  const isDispatched = Boolean(session.taskPrompt);
  const effectiveStatus =
    action.status === "idle" && isDispatched
      ? "merge-pending"
      : action.status;
  return {
    ...state,
    sessions: {
      ...state.sessions,
      [action.id]: {
        ...session,
        status: effectiveStatus,
        exitCode: action.exitCode ?? session.exitCode,
      },
    },
  };
}
```

The `Stop` hook already maps to `"idle"` in `src/hooks/useClaudeHooks.ts` (line 10).
No hook changes needed — the reducer handles the promotion transparently.

---

### 3. Plumb `taskPrompt` through session creation — `AppLayout.tsx` lines 524-545

`NewSessionDialog` already collects `config.task` and `config.useWorktree`.
In the session object construction block, add one field:

```typescript
taskPrompt: config.useWorktree && config.task ? config.task : null,
```

Rule: dispatched = created with worktree AND a task prompt. Regular sessions (no worktree,
or no task prompt) remain `taskPrompt: null` and are unaffected.

---

### 4. Rust session struct — `src-tauri/src/commands/session.rs`

Add to the `Session` struct:

```rust
#[serde(default)]
pub task_prompt: Option<String>,
```

`#[serde(default)]` ensures existing `~/.switchboard/sessions.json` files without this
field continue to deserialize without error (defaults to `None`).

---

### 5. SessionCard badges — `src/components/sidebar/SessionCard.tsx`

Extend `STATUS_LABELS` (around line 22) with the new values:

```typescript
const STATUS_LABELS: Record<string, string> = {
  // existing...
  "merge-pending": "Ready to Merge",
  "merge-conflict": "Conflict",
  merged: "Merged",
  "pr-raised": "PR Raised",
  rejected: "Rejected",
};
```

Add visual weight for actionable states. Use existing shadcn `Badge` with `variant` or
`className`:
- `merge-pending` → green (same treatment as a success/ready state)
- `merge-conflict` → red/destructive
- `merged` / `rejected` → muted (session is complete, de-emphasize)
- `pr-raised` → blue/secondary

---

### 6. MergeQueuePanel — new file `src/components/git/MergeQueuePanel.tsx`

Filter sessions by merge-lifecycle status, show as a list in the right panel.

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { Session } from "../../state/types";

const MERGE_STATUSES = ["merge-pending", "merge-conflict", "merged", "pr-raised"] as const;

interface MergeQueuePanelProps {
  sessions: Record<string, Session>;
  onSelect: (session: Session) => void;
}

export function MergeQueuePanel({ sessions, onSelect }: MergeQueuePanelProps) {
  const queue = Object.values(sessions)
    .filter(s => MERGE_STATUSES.includes(s.status as any))
    .sort((a, b) => {
      // merge-conflict first (needs attention), then merge-pending, then rest
      const order = { "merge-conflict": 0, "merge-pending": 1, "merged": 2, "pr-raised": 3 };
      return (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4);
    });

  if (queue.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">No agents done yet</p>
        <p className="text-xs text-muted-foreground">
          Completed agents appear here for review
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        {queue.map(session => (
          <MergeQueueItem key={session.id} session={session} onClick={() => onSelect(session)} />
        ))}
      </div>
    </ScrollArea>
  );
}

function MergeQueueItem({ session, onClick }: { session: Session; onClick: () => void }) {
  return (
    <button
      className="w-full px-3 py-3 text-left hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-mono font-medium truncate">{session.branch ?? session.label}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">{session.status}</Badge>
      </div>
      {session.taskPrompt && (
        <p className="text-xs text-muted-foreground truncate">{session.taskPrompt}</p>
      )}
      {/* Action buttons — stubs until merge.rs is implemented */}
      {session.status === "merge-pending" && (
        <div className="flex gap-1.5 mt-2">
          <button
            className="text-[10px] border border-border px-2 py-0.5 rounded hover:bg-muted"
            onClick={e => { e.stopPropagation(); /* TODO: local merge */ }}
          >
            Merge Locally
          </button>
          <button
            className="text-[10px] border border-border px-2 py-0.5 rounded hover:bg-muted"
            onClick={e => { e.stopPropagation(); /* TODO: raise PR */ }}
          >
            Raise PR
          </button>
        </div>
      )}
    </button>
  );
}
```

Wire into `AppLayout.tsx`: add `MergeQueuePanel` to the right column. Can sit below or
alongside the existing `WorkspacePanel`. A tab toggle ("Files / Changes / Queue") works
well — the right column already has a tab pattern in `WorkspacePanel`.

---

## Reused Existing Code

- `NewSessionDialog.tsx` — already collects `task` and `useWorktree`, no UI changes
- `SessionCard.tsx` — STATUS_LABELS extension only, no structural change
- `DiffView.tsx` — will be used inside `MergeQueueItem` for diff preview (next phase)
- `git_create_pr` in `git.rs:288` — reused as-is for "Raise PR" action (next phase)
- `remove_worktree` in `worktree.rs` — reused for post-merge cleanup (next phase)
- `useAgentHooks` in `useClaudeHooks.ts` — no changes, `Stop` → `idle` mapping unchanged

---

## Verification

1. **Type check:** `npx tsc --noEmit` — catches exhaustiveness gaps in reducer switch
   and any missing `taskPrompt` references.

2. **Rust serialization:** `cargo test --manifest-path src-tauri/Cargo.toml` — verify
   a session without `task_prompt` in JSON deserializes cleanly (tests in `session.rs`
   or `mod tests`).

3. **Manual — dispatched lifecycle:**
   - Open Switchboard, create a new session with worktree checked + task prompt filled
   - Observe: SessionCard shows "Running"
   - When agent finishes its turn (Stop hook fires): card should show "Ready to Merge"
   - Session should appear in MergeQueuePanel right column

4. **Manual — interactive sessions unaffected:**
   - Create a regular session (no worktree, or no task prompt)
   - When agent finishes a turn: card shows "Idle", NOT "Ready to Merge"
   - Session does NOT appear in MergeQueuePanel
