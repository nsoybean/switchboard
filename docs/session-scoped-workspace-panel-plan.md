<!-- /autoplan restore point: /Users/nyangshawbin/.gstack/projects/switchboard/main-autoplan-restore-20260327-174824.md -->

# Session Workspace Inspector Plan

## Plan Summary

This change is not just "move the file tree to the right." The product problem is that Switchboard currently treats workspace identity as inconsistent: the selected session can be worktree-scoped, while the file tree still shows the repo root. The fix is to make workspace inspection consistently session-scoped and make that identity visible.

The UI expression of that model is a single right-side inspector with `Files | Changes`, both driven by the same resolved workspace context for the selected session.

## Problem

Switchboard currently splits related workspace affordances across two places:

- The left sidebar contains `Sessions | Files`, but the `Files` tab always shows `state.projectPath`.
- The right panel contains the Git UI, and it already scopes itself to `selectedSession?.cwd`.

That mismatch is most obvious for worktree-backed sessions. A user can select a session that is clearly isolated, but the file tree still shows the repo root instead of the session's workspace root. The app teaches two mental models at once.

## Desired User Experience

When the user selects a session, the right side of the app becomes that session's workspace inspector:

- `Files` shows the raw filesystem rooted at the selected session's launch/worktree root.
- `Changes` shows Git status and diffs for that same root.
- The header makes the inspected workspace explicit even when the workspace is missing or unavailable.
- The left sidebar focuses on session navigation and management.

This should feel like: "pick a session on the left, inspect that session's workspace on the right."

## Current Code Reality

### Relevant files

- `src/components/layout/AppLayout.tsx`
  - Owns the 3-panel layout.
  - Already passes `selectedSession?.cwd ?? state.projectPath` into `GitPanel`.
- `src/components/sidebar/SessionSidebar.tsx`
  - Owns the left sidebar tabs.
  - Currently renders `FilePanel rootPath={state.projectPath}` from a `Files` tab.
- `src/components/files/FilePanel.tsx`
  - Thin wrapper around `FileTree`.
- `src/components/files/FileTree.tsx`
  - Loads once on mount and stores expansion state locally.
- `src/components/git/GitPanel.tsx`
  - Already behaves like a session-scoped inspector because it accepts `cwd`, but it also keeps local tab and expansion state.
- `src/state/types.ts`
  - Session already stores `cwd`, `worktreePath`, and `branch`.
- `src-tauri/src/commands/session.rs`
  - Persists session metadata locally.
- `src-tauri/src/commands/claude_data.rs`
  - History sessions expose `project_path`.
- `src-tauri/src/commands/codex_data.rs`
  - History sessions expose `cwd` as `project_path`.

### What already exists

| Sub-problem | Existing code we can reuse |
|---|---|
| Session-specific context | `selectedSession` resolution in `AppLayout` |
| Workspace metadata | `Session.cwd`, `Session.worktreePath`, `Session.branch` |
| File browser UI | `FilePanel` + `FileTree` |
| Git changes UI | `GitPanel` |
| File preview | `previewFilePath` overlay in `AppLayout` |
| Right-side resizable inspector slot | Existing right panel in `AppLayout` |

## Premises

The user confirmed these premises during the CEO gate:

1. The real confusion is "project-scoped files vs session-scoped changes," not just left vs right.
2. The selected session should own workspace inspection.
3. The right panel should become the primary `Files | Changes` inspector.
4. The inspected root should be labeled honestly as the session's launch/worktree root, not silently overclaim to be the shell's current live directory.
5. If a selected session's workspace no longer exists, the app should fail clearly instead of falling back to the project root and showing the wrong workspace.

## Proposal

### 1. Make workspace identity explicit

Introduce a resolved workspace context in `AppLayout` instead of passing around a raw string:

```ts
type ResolvedWorkspaceContext =
  | {
      kind: "project";
      rootPath: string;
      label: string;
      branch: string | null;
      isWorktree: false;
      availability: "ready";
      source: "project";
    }
  | {
      kind: "session";
      rootPath: string | null;
      label: string;
      branch: string | null;
      isWorktree: boolean;
      availability: "ready" | "missing";
      source: "cwd" | "worktreePath" | "history";
    };
```

### 2. Use a deterministic resolver ladder

The resolver must be explicit and must not silently "help" by showing the wrong root.

Resolver ladder:

1. If there is no selected session and `state.projectPath` exists:
   - return project context rooted at `state.projectPath`
2. If there is a selected local session:
   - prefer `worktreePath` when present and existing on disk
   - otherwise use `cwd` when it exists on disk
   - otherwise return session context with `rootPath = null` and `availability = "missing"`
3. If there is a selected history/transcript session:
   - use its stored `cwd` only if it still exists
   - otherwise return session context with `rootPath = null` and `availability = "missing"`

Important: when a session is selected and its root is missing, do not fall back to `state.projectPath`. The selected session remains authoritative.

### 3. Make the right panel a unified workspace inspector

Replace the standalone `GitPanel` slot with a `WorkspacePanel` containing tabs:

- `Files`
- `Changes`

The header order is fixed:

1. Session or project label
2. Branch and worktree badge
3. Path subtitle (`Launch root`, `Worktree root`, or `Unavailable`)
4. Tab bar
5. Content area

### 4. Remove the left `Files` tab

The left sidebar becomes sessions-only:

- start sessions
- switch sessions
- resume/view past sessions
- session actions like rename, delete, stop

That makes the sidebar answer "which session am I looking at?" while the inspector answers "what workspace does this session own?"

### 5. Specify all relevant states

The new inspector must define all important states up front:

- No project open
- Project open, no session selected
- Session selected, workspace resolving
- Session selected, workspace ready
- Session selected, workspace missing
- Workspace ready but not a git repo
- File preview open for a file outside the current workspace

State copy must keep identity visible even in failure states.

## Interaction Details

### Files tab

- Root the tree at the resolved workspace root, never directly at `state.projectPath` when a session is selected.
- When the workspace root changes, remount or reset the file tree so expanded folders from the prior session do not leak.
- While resolving a new root, show a lightweight loading state instead of stale content.
- Missing workspace state:
  - title: `Workspace unavailable`
  - body: explain that Switchboard can still show the transcript/session identity, but the saved workspace path no longer exists
  - CTA: `Back to project files` only when no session is selected

### Changes tab

- Reuse `GitPanel` behavior, but scope it to the resolved workspace root.
- Reset tab-local state when the root changes so expanded diffs and staged/unstaged focus do not leak across sessions.
- Non-git state:
  - title: `No git repository at this workspace`
  - body: explain which path was inspected
- Missing workspace state:
  - title: `Cannot load changes`
  - body: explain that the selected session's saved root is unavailable

### Header copy rules

- Show session label first, even when the workspace is missing
- Show branch when available
- Show a `Worktree` badge when `worktreePath` won the resolver
- Show a subtitle using one of:
  - `Worktree root`
  - `Launch root`
  - `Project root`
  - `Workspace unavailable`

### Shortcuts

- `Cmd/Ctrl+G` continues to toggle the whole right inspector
- `Cmd/Ctrl+E` switches the inspector to the `Files` tab when the inspector is open
- If the inspector is closed, `Cmd/Ctrl+E` opens it and selects `Files`

## Architecture Sketch

```text
SessionSidebar (left)
  -> selects session or transcript
       |
       v
AppLayout
  -> derives selectedSession
  -> resolves WorkspaceContext
       |
       +--> Main center pane
       |      - live terminal OR transcript
       |
       +--> WorkspacePanel (right, keyed by workspace identity)
              - header: label / branch / badge / path subtitle
              - tab: Files   -> FilePanel(rootPath)
              - tab: Changes -> GitPanel(cwd=rootPath)
              - empty/error/loading states when rootPath is null or unresolved
```

## Implementation Plan

### Phase 1: Introduce workspace identity

- Add a `resolveWorkspaceContext(selectedSession, projectPath)` helper in the frontend
- Make selected session authoritative
- Explicitly model `missing` instead of hiding it with fallback

### Phase 2: Build `WorkspacePanel`

- Replace the standalone right `GitPanel` with a wrapper panel
- Render the fixed header hierarchy
- Add `Files | Changes` tabs

### Phase 3: Remove split affordances

- Remove the left sidebar's `Files` tab
- Keep the left rail focused on session navigation only

### Phase 4: Reset stale local state correctly

- Key the inspector subtree by resolved workspace identity or add explicit reset effects
- Reset `FileTree` root state on workspace change
- Reset `GitPanel` expanded file and selected tab state as needed
- Validate `previewFilePath` when the workspace changes

### Phase 5: Validation and polish

- Add missing/unavailable/non-git states with explicit copy
- Reconcile shortcut behavior
- Verify focused and scroll modes remain coherent

## Alternatives Considered

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| Keep files on left, only make them session-aware | Smallest diff | Still splits one concept across two surfaces | Rejected |
| Right-side unified inspector | Matches session mental model and reuses existing `GitPanel` behavior | Requires wrapper panel and state reset work | Chosen |
| Keep both left files and right files | Max discoverability | Duplicated truth and more confusion | Rejected |

## Not In Scope

- True live shell-directory tracking after the agent `cd`s inside the PTY
- A new `Checks` system
- Multi-session workspace comparison
- Docked editor replacement for file preview

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Missing selected-session root silently falls back to project root | Shows the wrong workspace as truth | Make selected session authoritative and return `missing` |
| File and diff state leak across sessions | User sees stale folders or diffs from another session | Key or reset inspector subtree on workspace change |
| Persisted paths are stale or malformed | Inspector can point at the wrong place | Normalize and validate paths in Rust before file/git commands |
| History/live sessions come from different metadata sources | Workspace identity remains lossy | Keep resolver explicit; defer deeper persistence cleanup to TODOs |

## Test Plan

1. Open project with no sessions
2. Start one normal session without worktree
3. Start one worktree session
4. Switch rapidly between two sessions with different roots
5. Open a past session transcript with a valid root
6. Open a past session transcript whose root no longer exists
7. Point a session at a non-git directory
8. Open file preview, then switch sessions and verify stale preview is cleared or blocked
9. Run `npx tsc --noEmit`

## CEO Review

### Step 0A: Premise challenge

- Premise 1 is valid. The root problem is split workspace identity, not simple panel placement.
- Premise 2 needed tightening. `selectedSession.cwd` is not trustworthy enough to be treated as the live shell location; the plan now treats it as launch/worktree metadata and labels it honestly.
- Premise 3 is valid. The right inspector already has the strongest fit because `GitPanel` is session-scoped today.
- Premise 4 is valid and aligns with explicit-over-clever engineering.
- Premise 5 is valid and non-negotiable; falling back to project root would produce a more dangerous lie than an empty state.

### Step 0B: Existing code leverage map

| Sub-problem | Existing code | Reuse decision |
|---|---|---|
| Session selection | `AppLayout`, `SessionSidebar` | Reuse |
| Session metadata | `Session` type fields | Reuse with explicit resolver |
| Files UI | `FilePanel`, `FileTree` | Reuse with reset behavior |
| Changes UI | `GitPanel` | Reuse inside wrapper |
| Preview overlay | `previewFilePath` | Reuse with validation |
| Persisted session metadata | Tauri session commands | Reuse, but do not over-trust |

### Step 0C: Dream state

```text
CURRENT
  Session selected
    -> terminal shows one workspace
    -> git panel shows one workspace
    -> file tree may show another workspace

THIS PLAN
  Session selected
    -> one resolver decides workspace identity
    -> Files and Changes agree
    -> missing roots fail clearly

12-MONTH IDEAL
  Session selected
    -> workspace identity is first-class across terminal, transcript, files, changes, checks, and preview
    -> live cwd tracking or richer provenance is available when worth the complexity
```

### Step 0C-bis: Implementation alternatives

| Approach | Effort | Risk | Pros | Cons |
|---|---|---|---|---|
| Session-aware left tree only | Low | Medium | Minimal diff | Still split concept |
| Right unified inspector | Medium | Medium | Best coherence | Requires wrapper and reset work |
| New workspace model plus full persistence cleanup now | High | High | Strongest long-term basis | Too broad for this feature |

### Step 0D: Mode-specific analysis

Mode selected: `SELECTIVE_EXPANSION`

- Approved: explicit workspace resolver, missing-root handling, path validation, reset behavior, richer empty states
- Deferred: live cwd tracking, checks tab, full persistence/data-source cleanup

### Step 0E: Temporal interrogation

- Hour 1: user clicks sessions and expects Files and Changes to agree
- Hour 6: user opens a past transcript whose worktree is gone; the app must still tell the truth
- Month 6: the regret case is shipping a nicer right panel while workspace identity is still ambiguous; this revision avoids that by centering the resolver

### Step 0F: Mode confirmation

We are not broadening into a multi-quarter workspace architecture rewrite. We are boiling the lake around one feature boundary: session-scoped workspace inspection.

### CEO Dual Voices

#### CODEX SAYS (CEO — strategy challenge)

Unavailable. Codex transport/auth attempts returned partial diagnostics but no stable completed CEO review. The useful signal that did emerge matched the main review: selected session identity is not the same as reliable workspace identity.

#### CLAUDE SUBAGENT (CEO — strategic independence)

- High: the original draft solved a layout symptom, not the workspace-identity model
- High: `cwd` was treated too casually as trustworthy truth
- Medium: the left-session-aware alternative was dismissed too quickly
- Medium: the moat is the workspace/session model, not the tab arrangement

#### CEO DUAL VOICES — CONSENSUS TABLE

| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Premises valid? | Mixed; tighten | N/A | N/A |
| Right problem to solve? | Workspace identity first | N/A | N/A |
| Scope calibration correct? | Yes after rewrite | N/A | N/A |
| Alternatives sufficiently explored? | Needed more | N/A | N/A |
| Competitive/product risk covered? | Partial | N/A | N/A |
| 6-month trajectory sound? | Yes after reframing | N/A | N/A |

### Error & Rescue Registry

| Scenario | User impact | Rescue |
|---|---|---|
| Selected session root missing | User sees nothing useful | Keep session identity visible and show unavailable state |
| Selected session points outside current git repo | Changes tab becomes confusing | Show explicit non-git state with inspected path |
| User switches sessions during polling | Stale content may flash | Key/reset inspector subtree |
| Preview file belongs to prior workspace | Wrong file remains visible | Clear or validate preview on workspace change |

### Failure Modes Registry

| Failure mode | Severity | Mitigation |
|---|---|---|
| Wrong-root fallback | Critical | No fallback when selected session is missing |
| Stale file tree expansions | High | Remount/reset on root change |
| Stale diff expansion | High | Reset `GitPanel` local state |
| Misleading copy about cwd | Medium | Label root as launch/worktree root |

### What Already Exists

The existing code already gives us the right composition shape: `AppLayout` can resolve context, `GitPanel` already accepts a scoped cwd, and the file browser already exists. This is a coherence problem, not a greenfield feature.

### NOT in Scope

- live PTY cwd tracking
- checks surface
- loading persisted live sessions into app state on boot

### Dream State Delta

This plan gets Switchboard from "split workspace truth" to "one visible workspace truth per selected session." It does not yet get to a richer future where workspace identity is persisted and synchronized across every session source with live cwd semantics.

### CEO Completion Summary

| Area | Status | Notes |
|---|---|---|
| Problem framing | Improved | Reframed around workspace identity |
| Scope | Good | Focused, complete within blast radius |
| Risk handling | Improved | Missing-root and stale-state risks now explicit |
| Deferred work | Acceptable | Live cwd and broader persistence cleanup deferred |

## Design Review

### Step 0: Design scope

UI scope is present. The change touches the primary navigation and inspection surfaces of the app, so design specificity matters.

### CLAUDE SUBAGENT (design — independent review)

- High: workspace-root resolution and failure copy were ambiguous
- High: loading/transition states were unspecified
- Medium: dead-end recovery paths were missing
- Medium: header hierarchy and concrete empty-state rules were under-specified

### CODEX SAYS (design — UX challenge)

Unavailable as a completed review. Partial Codex output aligned with the main concern: the plan originally treated workspace identity as a derived prop rather than the UI object users need to trust.

### Design Litmus Scorecard

| Dimension | Score | What raises it to 10 |
|---|---|---|
| Information hierarchy | 8 | Fixed header order and default tab behavior |
| State coverage | 9 | Explicit loading, missing, and non-git states |
| Session/workspace clarity | 9 | Resolver ladder and honest path labels |
| Interaction model | 8 | Shortcut behavior now defined |
| Recovery UX | 8 | Keep clear next-step copy in failure states |
| Accessibility intent | 7 | Preserve button/tab semantics in implementation |
| Responsive intent | 7 | Ensure header and tabs remain legible at narrow widths |

### Design DUAL VOICES — CONSENSUS TABLE

| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Information hierarchy | Concern | N/A | N/A |
| Missing states | Concern | N/A | N/A |
| User journey | Concern | N/A | N/A |
| Specificity | Concern | N/A | N/A |
| Accessibility | Watch | N/A | N/A |
| Responsive strategy | Watch | N/A | N/A |
| Ambiguity risk | Concern | N/A | N/A |

### Design Pass Notes

1. Information hierarchy: examined the proposed header, tabs, and content order. The revised plan now locks this order so the selected session remains the anchor.
2. Missing states: examined Files and Changes flows. The revised plan now specifies resolving, missing, and non-git states instead of generic placeholders.
3. Emotional arc: examined no-session, missing-workspace, and transcript flows. The design now keeps identity visible even when the workspace fails.
4. Specificity: examined phrases that were previously generic (`optional badge`, `path hint`, `targeted empty state`). They are now concrete enough to implement consistently.
5. Accessibility: no explicit blocker found at the planning layer, but the implementation must keep semantic tabs/buttons and preserve keyboard reachability.
6. Responsive strategy: no responsive redesign is required, but narrow widths must keep header metadata readable.
7. Ambiguous hauntings: the main haunting decision was path trust. That is now explicit and honest.

### Design Completion Summary

| Area | Status | Notes |
|---|---|---|
| Hierarchy | Good | Fixed stack order |
| States | Good | Major missing states addressed |
| Specificity | Improved | Concrete copy categories defined |
| Residual risk | Acceptable | Responsive density still needs implementation care |

## Engineering Review

### Step 0: Scope challenge with actual code analysis

The component split is sound. `AppLayout` is the right place to resolve workspace identity because it already owns `selectedSession`, `viewingSession`, `projectPath`, preview overlay behavior, and the right panel slot.

The main engineering risk is not composition; it is stale or lossy state. `FileTree` loads once and keeps expansion state locally, `GitPanel` keeps expanded diff state and tab state locally, and session/history roots come from multiple data sources with inconsistent trust levels.

### CODEX SAYS (eng — architecture challenge)

Partial Codex analysis surfaced one useful concern: Switchboard already has split identity sources for live sessions, history sessions, and persisted session metadata, so "selected session" alone is not yet a perfect workspace identity primitive. That concern is accepted and contained by making the resolver explicit and deferring deeper data-source cleanup.

### CLAUDE SUBAGENT (eng — independent review)

- High: never fall back from a selected missing session root to `state.projectPath`
- High: reset file tree, git diff, and preview state on workspace change
- Medium: validate persisted paths before file or git commands
- Medium: expand tests for transcript/live switching and missing-root behavior

### ENG DUAL VOICES — CONSENSUS TABLE

| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Architecture sound? | Yes with resolver | Partial yes | Single-theme agreement |
| Test coverage sufficient? | No | Partial no | Single-theme agreement |
| Performance risks addressed? | Mostly | N/A | N/A |
| Security threats covered? | Not enough | N/A | N/A |
| Error paths handled? | Improved but must be explicit | Partial yes | Single-theme agreement |
| Deployment risk manageable? | Yes | N/A | N/A |

### Section 1: Architecture

```text
ProjectPicker / SessionSidebar / Transcript selection
                  |
                  v
              AppLayout
                  |
      +-----------+-----------+
      |                       |
      v                       v
resolveWorkspaceContext   Main center pane
      |                   (terminal or transcript)
      v
 WorkspacePanel (keyed by workspace identity)
      |
  +---+---+
  |       |
  v       v
Files   Changes
 |         |
 v         v
FilePanel  GitPanel
 |         |
 v         v
FileTree   git status/diff commands
```

The architecture is intentionally boring. A resolver plus wrapper panel is better than spreading conditional path logic through both `FilePanel` and `GitPanel`.

### Section 2: Code quality

- Keep root resolution in one helper to avoid duplicating `selectedSession?.cwd ?? state.projectPath` logic in multiple components.
- Do not rename every `gitPanelOpen` usage if it makes the diff noisy; either wrap it with a better comment now or rename it in the same small blast radius.
- Avoid hiding stale-state bugs with clever memoization. Keyed remounts are explicit and acceptable here.

### Section 3: Test review

#### Test diagram

```text
Codepath / UX flow                          Coverage needed
------------------------------------------------------------------
No selected session -> project root         resolver unit + UI integration
Live session with worktreePath              resolver unit + UI integration
History session with valid cwd              resolver unit + transcript integration
Selected session with missing root          resolver unit + empty-state integration
Switch session while Files open             UI integration
Switch session while Changes diff open      UI integration
Switch session while preview open           UI integration
Selected root is not a git repo             UI integration
Shortcut: toggle inspector / open Files     shortcut integration
```

The previous test plan covered only one rapid-switch case. The revised plan now requires resolver tests plus integration coverage for stale-state resets and missing roots.

### Section 4: Performance

No major new performance risk is introduced if the resolver is cheap and the inspector only remounts on actual workspace identity changes. The bigger risk is unnecessary flicker from overly aggressive remounting, so the key should be based on stable resolved workspace identity, not random state.

### Mandatory outputs

#### What already exists

The existing right panel and file preview overlay reduce implementation risk significantly. This feature should be achieved with a small new wrapper plus scoped resets, not a subsystem rewrite.

#### NOT in scope

- rehydrating persisted live sessions into app state at boot
- live cwd inference from PTY
- deeper cross-agent workspace provenance

#### Failure modes registry

| Failure mode | Severity | Fix |
|---|---|---|
| Session root missing but project root shown instead | Critical | Selected session authoritative |
| `FileTree` retains prior entries | High | Key/reset on root change |
| `GitPanel` retains prior expanded file | High | Reset on root change |
| Preview file remains from prior workspace | Medium | Clear/validate on root change |
| Persisted path points somewhere unexpected | Medium | Normalize/validate in Rust |

### Engineering Completion Summary

| Area | Status | Notes |
|---|---|---|
| Architecture | Good | Resolver + wrapper is the right split |
| Hidden complexity | Managed | Root trust and state reset made explicit |
| Testing | Improved | Still must be implemented thoroughly |
| Security/path handling | Improved | Rust-side validation required |

## Cross-Phase Themes

- Workspace identity must be first-class, not implied by layout.
- Missing and stale state handling is the real complexity, not the tab move itself.
- Honesty beats convenience: if the selected session root is unavailable, the UI should say so instead of showing a nicer lie.

## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|---|---|---|---|---|
| 1 | CEO | Reframe the problem around session workspace identity | P1, P5 | Fixes root confusion, not just panel placement | Pure layout move |
| 2 | CEO | Make selected session authoritative when one is selected | P5 | Prevents wrong-root fallback | Silent fallback to project root |
| 3 | CEO | Label root as launch/worktree root, not live cwd | P5 | Honest UX beats overclaiming | Pretending `cwd` is always live truth |
| 4 | CEO | Keep `Files | Changes` together in one right inspector | P1, P3 | One concept, one surface | Split left files and right changes |
| 5 | CEO | Remove the left `Files` tab | P5 | Sidebar should answer session navigation only | Duplicate explorer surfaces |
| 6 | Design | Specify loading, missing, and non-git states | P1 | Prevents stale or confusing transitions | Generic empty/error placeholders |
| 7 | Design | Fix header order and shortcut behavior in the spec | P5 | Reduces implementation churn and UX drift | Leaving hierarchy implicit |
| 8 | Eng | Key or reset inspector state on workspace change | P5 | Explicit stale-state control | Clever partial state reuse |
| 9 | Eng | Validate session-derived paths in Rust | P1, P5 | Avoids malformed-path surprises | Trusting persisted paths blindly |
| 10 | Eng | Defer live cwd tracking to TODOS.md | P3 | Outside this feature blast radius | Pulling in PTY-level tracking now |

## Deferred to TODOS.md

- Evaluate whether Switchboard should persist a richer workspace identity object instead of reconstructing roots from mixed session/history metadata
- Consider hydrating persisted local sessions on boot so live/history identity is less fragmented
- Revisit a `Checks` surface only after workspace identity is trustworthy everywhere

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean | reframed problem around workspace identity |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | unavailable | transport/auth instability prevented complete runs |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | resolver, state reset, and path validation required |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | missing states and hierarchy tightened |

**VERDICT:** READY FOR APPROVAL GATE — the plan is implementation-ready once the resolver semantics, state-reset rules, and empty-state copy are accepted.
