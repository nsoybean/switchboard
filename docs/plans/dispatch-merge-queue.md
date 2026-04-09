# Dispatch & Review Queue — Session-First Revision

## Context

The earlier version of this plan treated dispatch as a special "task mode" and centered the UX
around a merge queue. After reviewing the desired direction and the Cursor ADE reference, the
better framing is broader:

- Switchboard's primary job is managing parallel agent sessions
- the main center surface should be sessions and transcripts, not file editing
- files, diffs, and git actions should stay visible as supporting side panels for trust and review
- the UI should reduce mode decisions and collapse attention into a small number of obvious states

This revision updates the plan accordingly.

## Product Direction

Switchboard should feel like a modern parallel agent cockpit:

- left: session management and attention queue
- center: tabbed session surfaces
- right: workspace transparency and review tools

The mental model is no longer "open a terminal, then inspect code as the main thing."
It is:

1. launch or resume sessions
2. watch which ones need attention
3. inspect transcript, files, and diffs without losing session context
4. merge, continue, or discard from a review-oriented workspace

## Core Decisions

### 1. No user-facing task-vs-interactive mode split

Do not ask the user to think in terms of "task session" versus "interactive session."

Keep a single new-session flow:

- agent
- optional initial prompt
- optional isolated worktree

The initial prompt is session metadata, not a mode switch. A session can start focused and later
become conversational, or start conversational and later become a reviewable branch of work.

### 2. One primary attention state: `Ready for review`

User-facing session supervision should be simplified to two primary buckets in the main rail:

- `Active`
- `Ready for review`

`Ready for review` is the single high-signal state that covers both:

- the agent finished a turn and is waiting
- the agent asked a question and needs user input

We can still preserve finer-grained internal reasons, but the visible badge and queue label should
stay simple.

Recommended internal mapping:

| Raw runtime status | Attention bucket | Secondary reason |
|---|---|---|
| `running` | `active` | `working` |
| `idle` | `ready-for-review` | `turn-complete` |
| `needs-input` | `ready-for-review` | `question` |
| `done` / `stopped` / `error` | `history` | `exited` / `failed` |

### 3. Review queue, not merge queue

The queue should represent "sessions that need me," not only "branches ready to merge."

That means the review rail includes:

- sessions whose turn is complete
- sessions waiting on a question
- sessions with code changes ready to inspect

Merge and PR actions remain important, but they belong inside review tooling, not as the primary
top-level status taxonomy.

### 4. Classic panes become the default shell

Canvas remains valuable, but it should become the advanced workspace mode.

Default shell:

- left session rail
- center pane workspace
- right inspector

This should feel closer to VS Code, Warp, and Cursor's newer ADE layout: structured, docked, and
easy to reason about at a glance.

### 5. Center surfaces must be tabbed, but session-first

Transcript viewing and session switching should not behave like invisible overlays.

The center workspace should use explicit tabs for session-oriented surfaces such as:

- live session terminal
- transcript view
- history workspace
- canvas surface

Opening a transcript should create or focus a tab, not replace the current surface invisibly.

### 6. Files and diffs belong in the right pane

Files, diffs, and git actions remain essential for transparency, but they should live in a docked
right-side review pane rather than competing with the session thread for the center.

Default emphasis:

- center = sessions, questions, transcript context
- right = open files, diffs, changes, review details, merge actions

This aligns the product with agentic development rather than hand-editing-first IDE workflows.

---

## What Changes From The Previous Plan

The following assumptions from the prior version are replaced:

1. `taskPrompt` should not define a distinct user-facing task mode.
2. `idle` versus `merge-pending` should not become separate user-facing statuses.
3. A dedicated right-side `MergeQueuePanel` is no longer the primary queue surface.

Instead:

- keep raw execution status minimal
- derive a simpler attention bucket for the UI
- make the left session rail the review queue
- move merge and PR actions into a review-oriented inspector tab
- treat tabbed center surfaces and classic panes as part of the same implementation, not separate ideas

---

## Target UX

### Left Rail: Session Manager

The left rail should be optimized for supervision.

Recommended structure for the selected project rail:

- `Active`
- `Ready for Review`

Keep the existing multi-project capability, but the selected project should get the primary session
rail treatment. Other projects can remain compact above or below it.

Session rows should prioritize:

- session label
- agent
- branch or workspace identity
- primary badge: `Running` or `Ready for review`
- secondary subcopy: `Question waiting`, `Turn complete`, `Failed`, or relative time

Past sessions should move out of the always-visible supervision rail.

Recommended destination:

- a dedicated `History` workspace opened intentionally from the titlebar or sidebar footer
- project-scoped by default, with optional cross-project search later
- opens as its own center tab/surface, so transcript browsing is a deliberate mode switch

Why this is the right move:

- past sessions stay one click away during active development
- the left rail stays high-signal and low-noise
- transcript review still feels first-class, but no longer competes with active supervision

### Center: Tabbed Session Workspace

The center surface becomes a real workspace, not a stack of replacements.

Surface types:

- live session terminal
- transcript tab
- history tab
- canvas tab

Rules:

- opening the same transcript focuses the existing tab
- transcript/history tabs are closable
- live session tabs stay stable while the session exists
- canvas is treated as a first-class tab or shell surface, not a hidden base layer

This plan absorbs the intent from [middle-pane-surface-tabs.md](/Users/nyangshawbin/Documents/projects/switchboard/docs/plans/middle-pane-surface-tabs.md).

### Right Review Pane: Files, Diffs, and Merge Context

The right side should move closer to the Cursor reference: a tabbed document/review pane.

The right pane should evolve from a simple inspector into a docked workspace for:

- open file tabs
- diff tabs
- changes list
- review tab

Recommended layout inside the right pane:

1. document tab strip at the top
2. active file/diff/review content below
3. optional lightweight source switcher for `Explorer`, `Changes`, and `Review`

Behavior:

- opening a file from the tree creates or focuses a right-pane file tab
- opening a diff from changes creates or focuses a right-pane diff tab
- multiple files can stay open side by side as tabs
- review actions remain docked in the same pane, not promoted to the center

The `Review` tab becomes the place for:

- launch prompt / task summary when present
- branch and workspace identity
- git diff stats
- transcript summary or latest attention reason
- merge / PR / discard actions

This keeps code visibility close by without turning the app into a file-browser-first product.

### Shell Modes

#### Pane Mode (default)

Structured IDE-like layout:

- left rail
- center tabbed pane workspace
- right inspector

This is the default experience for most users.

#### Canvas Mode (advanced)

Canvas remains available for users who want spatial orchestration, but it should sit behind a
clear shell toggle and should no longer force transcript/file previews into full-screen overlays.

Canvas is the power-user workspace, not the default mental model.

---

## Technical Proposal

### 1. Keep raw runtime status simple

Do not add merge-lifecycle values like `merge-pending`, `merged`, or `pr-raised` to
`SessionStatus` yet.

Keep the current runtime-oriented statuses:

```ts
type SessionStatus =
  | "running"
  | "idle"
  | "needs-input"
  | "done"
  | "error"
  | "stopped";
```

If we need richer review semantics, derive them separately.

### 2. Add a derived attention model

Introduce a UI-facing derived model rather than bloating `SessionStatus`.

Recommended shape:

```ts
type SessionRailBucket = "active" | "ready-for-review";
type SessionArchiveState = "history";
type SessionAttentionReason =
  | "working"
  | "turn-complete"
  | "question"
  | "exited"
  | "failed";
```

This can live in a selector/helper instead of persisted session state.

Suggested file:

- `src/lib/session-attention.ts`

### 3. Rename `taskPrompt` intent to neutral session metadata

`NewSessionDialog` already collects a prompt-like field. Keep that capability, but stop treating it
as a mode flag.

If persisted, prefer a neutral field such as:

```ts
launchPrompt: string | null;
```

Meaning:

- present when the session was launched with an initial instruction
- absent for manually started shells or empty launches

This metadata is useful in the review tab and session summaries, but it should not decide whether a
session is "interactive" or "task mode."

### 4. Introduce center-surface tabs

Add a first-class center workspace model in app state.

Recommended types:

```ts
type CenterSurfaceKind =
  | "live-session"
  | "transcript"
  | "history"
  | "canvas";

interface CenterSurfaceTab {
  id: string;
  kind: CenterSurfaceKind;
  title: string;
  sessionId?: string;
  closable: boolean;
}
```

App state additions:

```ts
centerTabs: CenterSurfaceTab[];
activeCenterTabId: string | null;
workspaceShellMode: "pane" | "canvas";
```

### 5. Add a right-pane document model

Files should open in the right pane, not the center pane.

Recommended types:

```ts
type RightPaneSurfaceKind = "file" | "diff" | "review";

interface RightPaneTab {
  id: string;
  kind: RightPaneSurfaceKind;
  title: string;
  filePath?: string;
  diffPath?: string;
  sessionId?: string;
  closable: boolean;
}
```

App state additions:

```ts
rightPaneTabs: RightPaneTab[];
activeRightPaneTabId: string | null;
rightPaneSource: "explorer" | "changes" | "review";
```

This gives Switchboard the UX you want from the reference:

- session thread stays centered
- code visibility stays docked on the right
- multiple files can remain open without taking over the conversation pane

### 6. Add a pane-layout model

To support the classic multi-pane experience, the center workspace should be able to grow from one
tab stack into multiple split panes.

Recommended phased model:

```ts
type PaneNode =
  | {
      kind: "leaf";
      id: string;
      tabIds: string[];
      activeTabId: string | null;
    }
  | {
      kind: "split";
      id: string;
      axis: "horizontal" | "vertical";
      size: number[];
      children: [PaneNode, PaneNode];
    };
```

Important implementation note:

- phase 1 can ship with a single center pane plus one right review pane
- the same model can later power drag-to-split without another state rewrite

### 7. Expand the inspector into a tabbed right review pane

`WorkspacePanel` should remain the right-side container, but it should evolve toward a document-like
right pane rather than a simple static inspector.

Recommended `WorkspaceTab`:

```ts
type WorkspaceTab = "files" | "changes" | "review";
```

Recommended first-pass composition:

- `files` = source browser that opens file tabs in the right pane
- `changes` = status/diff navigator that opens diff tabs in the right pane
- `review` = merge/PR/discard and session summary

Then, once stable, the header can become a document tab strip-first layout with the source switcher
de-emphasized.

### 8. Move past sessions into a dedicated history workspace

Past sessions should not sit in the left supervision rail.

Recommended location:

- titlebar `History` entry
- optional sidebar footer shortcut
- keyboard shortcut such as `Cmd/Ctrl+Shift+H`

History behavior:

- opens a dedicated center tab called `History`
- defaults to the current project
- supports search by session title, agent, and branch
- opening a past session transcript creates/focuses a transcript tab in the center

### 9. Keep merge actions scoped to review tooling

Merge/PR/discard actions should be available only when a selected session has a reviewable
workspace and branch context.

Do not create top-level lifecycle status values yet for:

- merged
- rejected
- pr raised
- conflict

Those may become useful later, but they are not needed to ship the simpler session-first UX.

---

## Implementation Phases

### Phase 1. Simplify attention and session rail

Goal:

- make the app easier to scan immediately and remove past-session noise from the main rail

Changes:

- add derived session attention helpers
- group sidebar sessions by `Active` and `Ready for Review`
- update session badges and row copy to use the simpler language
- add a dedicated `History` entry outside the rail
- keep raw runtime status unchanged underneath

Primary files:

- `src/components/sidebar/SessionSidebar.tsx`
- `src/components/sidebar/SessionCard.tsx`
- `src/state/types.ts`
- `src/lib/session-attention.ts`

### Phase 2. Replace center overlays with tabs

Goal:

- make transcripts and previews explicit, reversible, and non-destructive

Changes:

- introduce `centerTabs` and `activeCenterTabId`
- convert transcript and history opening into tab-opening actions
- remove `absolute inset-0` overlay behavior for transcript surfaces
- keep `SessionTranscriptView` mostly intact

Primary files:

- `src/components/layout/AppLayout.tsx`
- `src/components/terminal/SessionTranscriptView.tsx`
- new `src/components/history/HistoryWorkspace.tsx`
- new `src/components/layout/CenterTabStrip.tsx`

### Phase 3. Ship classic pane mode as the default shell

Goal:

- make the default experience feel familiar and review-oriented

Changes:

- introduce `workspaceShellMode: "pane" | "canvas"`
- make pane mode the default
- keep canvas available behind a shell toggle
- ensure canvas also respects the new center-surface model
- keep the right review pane docked in pane mode

Primary files:

- `src/components/layout/AppLayout.tsx`
- `src/components/layout/Titlebar.tsx`
- new `src/components/layout/PaneWorkspace.tsx`
- existing `src/components/canvas/CanvasView.tsx`

### Phase 4. Add split panes and drag-to-arrange

Goal:

- let users keep multiple sessions visible in a classic docked workspace

Changes:

- implement pane tree state
- allow dragging session tabs between panes
- support split left/right and split up/down
- preserve the existing terminal experience inside each pane
- keep right review/document tabs as a stable docked region in the first split-pane pass

Primary files:

- `src/components/layout/PaneWorkspace.tsx`
- new pane tree helpers/components
- `src/components/terminal/XTermContainer.tsx` integration points

### Phase 5. Add review tooling and merge actions

Goal:

- turn the right inspector into the place where session output becomes actionable

Changes:

- add file/diff tabs to the right pane
- add `Review` tab to `WorkspacePanel`
- show prompt summary, attention reason, diff stats, and branch/worktree identity
- add merge / create PR / discard controls
- optionally add lightweight conflict detection afterward

Primary files:

- `src/components/workspace/WorkspacePanel.tsx`
- new `src/components/review/ReviewPanel.tsx`
- `src/components/git/*`
- `src-tauri/src/commands/git.rs`

---

## Critical Files

| File | Change |
|---|---|
| `src/state/types.ts` | Add center tab, right-pane tab, shell mode, and pane layout types; optionally persist neutral `launchPrompt` metadata |
| `src/state/reducer.ts` | Manage center-tab, right-pane-tab, history, and shell-mode actions |
| `src/components/layout/AppLayout.tsx` | Replace overlay orchestration with a session-first center pane and a tabbed right review pane |
| `src/components/layout/Titlebar.tsx` | Add shell toggle for `Pane` vs `Canvas` |
| `src/components/sidebar/SessionSidebar.tsx` | Show only `Active` and `Ready for Review` in the primary rail and move history entry out of band |
| `src/components/sidebar/SessionCard.tsx` | Simplify status presentation to `Running` / `Ready for review` plus secondary reason copy |
| `src/components/workspace/WorkspacePanel.tsx` | Expand the right side into a tabbed review/document pane with `Files | Changes | Review` sources |
| `src/components/canvas/CanvasView.tsx` | Keep canvas usable as an advanced shell without transcript/file overlay hacks |
| `src/components/history/HistoryWorkspace.tsx` | New dedicated workspace for past sessions and transcript lookup |
| `src-tauri/src/commands/session.rs` | Persist neutral `launch_prompt` metadata if we decide to retain initial prompt history |

---

## Reuse From Existing Work

- `NewSessionDialog.tsx` already collects the initial prompt and worktree preference
- `WorkspacePanel.tsx` already provides the right-side tab shell pattern
- `SessionTranscriptView.tsx` is already a self-contained transcript surface
- `CanvasView.tsx` already provides the advanced workspace foundation
- the existing session-scoped inspector model remains valid and should continue to anchor workspace identity

Related reference docs:

- [middle-pane-surface-tabs.md](/Users/nyangshawbin/Documents/projects/switchboard/docs/plans/middle-pane-surface-tabs.md)
- [session-scoped-workspace-panel-plan.md](/Users/nyangshawbin/Documents/projects/switchboard/docs/session-scoped-workspace-panel-plan.md)

---

## Out Of Scope For This Revision

- full browser-style tab persistence across app restarts
- complex branch lifecycle analytics in the sidebar
- conflict resolver UX in the first pass
- replacing the right inspector with a full editor
- removing canvas entirely

---

## Verification

1. `npx tsc --noEmit`
   Verify the new tab, shell, and attention models are wired consistently.

2. `cargo test --manifest-path src-tauri/Cargo.toml`
   Needed only if we persist neutral launch prompt metadata or add backend session fields.

3. Manual: attention simplification
   - start a running session and verify it appears under `In Progress`
   - let a session become `idle` and verify it moves to `Ready for Review`
   - trigger `needs-input` and verify it still appears as `Ready for Review`, with secondary reason copy

4. Manual: center and history tabs
   - open a live session, then open a transcript, then return to the live tab
   - open history and verify it appears as a deliberate center tab, not in the live rail
   - reopen the same transcript and verify the existing tab is focused

5. Manual: right-pane files
   - open a file from the explorer and verify it opens in the right pane
   - open a diff from changes and verify it opens as a right-pane diff tab
   - open multiple files and verify they remain tabbed on the right, similar to the target reference

6. Manual: shell modes
   - verify pane mode is the default
   - switch to canvas mode and back without losing open tabs or selected session context

7. Manual: split panes
   - place two live sessions side by side
   - drag a tab between panes
   - confirm terminals remain stable and do not respawn

8. Manual: review tooling
   - select a `Ready for Review` session
   - inspect `Files`, `Changes`, and `Review`
   - verify merge/PR actions are available only when branch/worktree context is valid

---

## Recommendation

Implement this in the order above, with Phase 1 through Phase 3 treated as the new minimum
foundation.

The key product move is not "add a merge queue." It is:

- simplify attention
- move history out of the live rail
- make center session surfaces explicit with tabs
- make files and diffs dock on the right
- make classic panes the default
- push review actions into the right pane

That is the shape that best matches modern parallel agentic development and the direction you want
Switchboard to own.
