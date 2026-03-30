# Worktree, Branch, and Session Identity Plan

## Problem Statement

Switchboard's core promise is parallel AI-assisted development with low overhead.
Today the app can launch isolated sessions, but the worktree and branch model is not
yet strong enough to make users feel confident about where each session lives, what
branch it owns, or how to safely resume and hand off work.

The result is avoidable ambiguity:

- A session can be active while the header only shows a branch name.
- Historical sessions often lose branch and worktree identity entirely.
- The app creates worktrees, but it does not yet behave like a worktree manager.
- Session labels, branch names, and worktree paths are related implicitly instead of
  being modeled as first-class identity.
- External worktrees created by Codex or the user exist outside Switchboard's mental
  model even though they are part of the same repo reality.

## Current Findings

### What already exists

- Session persistence already stores `worktree_path`, `branch`, and `cwd` in
  [`src-tauri/src/commands/session.rs`](../src-tauri/src/commands/session.rs).
- New worktrees are created through
  [`src-tauri/src/commands/worktree.rs`](../src-tauri/src/commands/worktree.rs)
  and rooted under `.switchboard-worktrees/<slug>`.
- New session creation in
  [`src/components/layout/AppLayout.tsx`](../src/components/layout/AppLayout.tsx)
  already branches session launch between project-root and worktree-root modes.
- The new-session modal in
  [`src/components/dialogs/NewSessionDialog.tsx`](../src/components/dialogs/NewSessionDialog.tsx)
  already lets the user pick a base branch and create branches with agent-aware
  prefixes.
- The inspector-side workspace card in
  [`src/components/workspace/WorkspacePanel.tsx`](../src/components/workspace/WorkspacePanel.tsx)
  already has a stronger identity model than the main header. It knows about
  `rootPath`, `source`, `branch`, and whether the session is a worktree.

### Where the experience breaks down

- The titlebar in
  [`src/components/layout/Titlebar.tsx`](../src/components/layout/Titlebar.tsx)
  shows only `branch` plus `projectName`, which is not enough to answer "where am I?"
- Historical sessions in
  [`src/components/sidebar/SessionSidebar.tsx`](../src/components/sidebar/SessionSidebar.tsx)
  are reconstructed with `branch: null` and `worktreePath: null`, so identity regresses
  after the live session ends.
- Session cards in
  [`src/components/sidebar/SessionCard.tsx`](../src/components/sidebar/SessionCard.tsx)
  surface `branch` when available, but have no concept of workspace type, detached
  HEAD, or launch root.
- `handleNewSession()` currently creates every app-managed worktree branch as
  `sb/<slug>` regardless of agent, even though the branch creation modal elsewhere
  uses `codex/`, `claude/`, or no prefix.
- `list_worktrees()` exists in the backend but the app does not use it to build a
  full repo-wide worktree map, detect externally created worktrees, or explain branch
  occupancy to the user.
- Git status and the changes panel operate correctly on the selected workspace, but
  the system does not explicitly communicate why a given session points at that path.

## Product Premises

- The user should never need to inspect the filesystem to know which workspace a
  session is using.
- A session should carry a durable workspace identity that survives stop, resume,
  history view, and handoff.
- Worktree creation should feel as lightweight as creating a tab, but the underlying
  git reality must stay explicit.
- The app should manage both Switchboard-owned worktrees and repo worktrees it did
  not create.
- Branch naming should be predictable, collision-safe, and consistent with the chosen
  agent and workspace strategy.

## Dream State

### Current

- Session selection changes the main content, but the workspace identity is split
  between the titlebar, terminal toolbar, and inspector.

### This plan

- Every selected session has a visible workspace identity in the macOS header:
  repo, workspace root, branch, and worktree status.
- New session creation defaults to the right isolation mode without forcing users to
  think in git internals up front.
- Resume and history views preserve branch/worktree identity instead of degrading to
  generic project history.
- The app can explain all worktrees in the repo, including ones created outside
  Switchboard.

### 12-month ideal

- Switchboard becomes the place where users understand and manage parallel feature
  work across agents, branches, and worktrees without dropping to terminal unless
  they want to.

## Decision: Make Workspace Identity First-Class

Introduce a first-class `WorkspaceIdentity` model and treat it as part of the
session contract, not derived display data.

Suggested shape:

```ts
type WorkspaceKind = "project" | "switchboard-worktree" | "external-worktree";
type HeadKind = "branch" | "detached";

interface WorkspaceIdentity {
  repoRoot: string;
  launchRoot: string;
  displayRoot: string;
  worktreePath: string | null;
  worktreeKind: WorkspaceKind;
  branchName: string | null;
  baseBranchName: string | null;
  headKind: HeadKind;
  headSha: string | null;
  isManagedBySwitchboard: boolean;
  createdByAgent: "claude-code" | "codex" | "bash" | null;
}
```

This model should be persisted with local sessions and used to enrich historical
sessions whenever Switchboard can recover identity from metadata or the current
worktree map.

## UX Proposal

### 1. Make the macOS header answer "where am I?"

When a session is selected, the titlebar should show a compact workspace identity
cluster instead of only branch plus project name.

Recommended layout:

- Left: session label + agent chip
- Center: repo name
- Center-right: workspace chip group
  - branch or `detached`
  - worktree badge: `project`, `switchboard`, or `external`
  - short path label, for example `/.switchboard-worktrees/codex-auth`
- Hover or click opens a workspace popover:
  - full path
  - base branch
  - HEAD sha
  - "Open in Finder"
  - "Copy path"
  - "Reveal in sidebar"

This should re-use the same workspace truth as the inspector rather than inventing a
second header-only representation.

### 1.5 Add a dedicated worktree management surface

Codex's worktree settings page is a good reference for one important reason: it
separates "what workspace is this current session using?" from "what worktrees exist
for this repo, and should any be cleaned up?"

Switchboard should do the same.

Recommended split:

- Header + sidebar + transcript: session-level identity
- Settings or repo management page: repo-level worktree management

Recommended worktree management page contents:

- Group by repo root
- List every detected worktree, including external Codex worktrees and
  Switchboard-managed worktrees
- Show for each worktree:
  - path
  - branch or `detached`
  - whether it is the main worktree
  - whether Switchboard manages it
  - linked sessions or "no linked sessions"
  - dirty/clean state
- Support actions:
  - reveal
  - attach session to this worktree
  - prune
  - delete with safety checks

Recommended settings above the list:

- auto-clean old Switchboard-managed worktrees
- keep at most N inactive worktrees per repo
- only auto-delete clean worktrees
- optionally snapshot metadata before deletion

Important product boundary:

- This page should manage inventory and lifecycle
- It should not be the only place users can understand location

The mistake to avoid is copying Codex's page but still leaving the main session view
ambiguous. The manager page is a complement to strong in-session identity, not a
replacement for it.

### 2. Redesign session creation around intent, not git jargon

The current "New worktree" checkbox is technically correct but too binary. Replace it
with workspace strategies:

- `Continue in project root`
- `New isolated worktree`
- `Use existing worktree`

For `New isolated worktree`, show:

- Base branch
- New branch name
- Suggested branch name derived from agent + task slug
- Result preview: "Creates `.switchboard-worktrees/<slug>` from `main` on branch `codex/auth-refactor`"

For `Use existing worktree`, show a searchable list of detected worktrees with:

- path
- branch
- detached/branch state
- whether it is already attached to an active session

### 3. Unify branch naming rules

Right now branch naming is split between:

- app-created worktrees: `sb/<slug>`
- manual create-branch modal: `codex/`, `claude/`, or none

Pick one model and apply it everywhere.

Recommended rule:

- For session-owned branches: `<agent-prefix><task-slug>`
  - Codex: `codex/<slug>`
  - Claude Code: `claude/<slug>`
  - Bash: `<slug>`
- Only fall back to a collision suffix when needed:
  - `codex/<slug>-2`
- Keep `sb/` for internal bookkeeping only if the branch is intentionally app-owned
  and disposable. Do not mix user-facing feature branches and internal naming in the
  same creation flow.

This makes the session, agent, and branch feel coherent.

### 4. Give every session card a workspace identity line

In the sidebar, each session row should show:

- branch or detached state
- a small worktree badge
- short relative path

Example:

```txt
when we create new ses...
codex/auth-refactor   switchboard   .switchboard-worktrees/auth-refactor
```

This lets users scan parallel work at a glance without opening the inspector.

### 5. Preserve identity in transcript/history mode

Historical sessions should not degrade to `branch: null` and `worktreePath: null`
unless the app truly cannot recover them.

Recovery order:

1. Persist workspace identity on live session creation
2. Store identity overlays for external agent histories
3. Reconcile against current `git worktree list`
4. Fall back to `cwd` with an explicit "identity incomplete" badge

## Backend Proposal

### 1. Build a repo-wide worktree registry

Add a higher-level command that combines:

- `git worktree list --porcelain`
- current branch occupancy
- detached HEAD state
- repo root
- whether a path lives under `.switchboard-worktrees`

Suggested output:

```ts
interface WorktreeEntry {
  path: string;
  branchName: string | null;
  headSha: string | null;
  headKind: "branch" | "detached";
  isMainWorktree: boolean;
  isManagedBySwitchboard: boolean;
  displayPath: string;
  sessionId: string | null;
}
```

This becomes the single source of truth for all worktree-related UI.

### 2. Persist richer identity with sessions

Extend the session store in
[`src-tauri/src/commands/session.rs`](../src-tauri/src/commands/session.rs) to save:

- `repo_root`
- `launch_root`
- `base_branch`
- `head_sha`
- `head_kind`
- `workspace_kind`

This avoids reconstructing session identity from lossy fields later.

### 3. Detect drift on resume

When resuming a session, validate:

- saved path still exists
- saved branch still matches the worktree
- saved HEAD did not silently move in unexpected ways

If drift is detected, show a clear banner:

- "This session was created on `codex/auth-refactor`, but the worktree now points at detached HEAD `3a1c142`."

That is much better than silently resuming into an ambiguous workspace.

## Handoff Proposal

Switchboard should explicitly support session handoff rather than assuming the next
human or agent will infer context from the filesystem.

Each session should expose a handoff summary:

- repo
- workspace path
- branch
- base branch
- dirty/clean state
- last commit
- unresolved changes count

This can appear in:

- transcript header
- share/copy handoff action
- resume confirmation

## Failure Modes To Design For

| Failure mode | Why it matters | Design response |
|---|---|---|
| Branch already checked out in another worktree | Session creation fails in a confusing way | Surface occupancy before creation |
| Detached Codex worktree | User thinks they are on a branch when they are not | Show `detached` explicitly in header and sidebar |
| History session missing metadata | Resume loses location context | Persist identity at creation time and reconcile later |
| Worktree path deleted manually | Session still appears resumable | Mark workspace unavailable with recovery guidance |
| Session label changes after creation | Branch/path identity becomes inconsistent | Decouple label from immutable workspace identity |
| Multiple agents on same branch | Hidden merge conflict risk | Warn in worktree picker and handoff summary |

## Recommended Implementation Order

### Phase 1: Identity foundation

- Introduce `WorkspaceIdentity` in frontend state and persisted session schema
- Add a repo-wide worktree registry command
- Thread this model through session creation, resume, and workspace resolution

### Phase 2: Visibility

- Upgrade the titlebar to show workspace identity
- Add worktree and path badges to session cards
- Preserve identity in transcript/history views

### Phase 3: Creation and handoff

- Replace the worktree checkbox with workspace strategies
- Unify branch naming rules
- Add handoff summary and drift detection

### Phase 4: Management

- Add a dedicated worktree manager view
- Support pruning, reveal, attach-to-session, and safe cleanup

## Not In Scope For The First Pass

- Full PR orchestration from the worktree manager
- Automatic branch rebasing or conflict resolution
- Cross-repo workspace management
- Multi-user collaboration state beyond local handoff metadata

## Recommendation

The highest-leverage change is not the header alone. It is making workspace identity a
real model that every surface uses consistently.

If only one improvement ships first, ship this stack together:

1. `WorkspaceIdentity` persistence
2. repo-wide worktree registry
3. titlebar identity cluster
4. sidebar identity line

That combination would make Switchboard feel trustworthy immediately, because the app
would finally explain the same workspace truth everywhere the user looks.
