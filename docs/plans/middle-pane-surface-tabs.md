<!-- /autoplan restore point: /Users/nyangshawbin/.gstack/projects/nsoybean-switchboard/main-autoplan-restore-20260328-003913.md -->
# Middle Pane Surface Tabs Plan

## Problem

In focused view, the middle pane currently behaves like a stack of full-surface overlays:

- the live session terminal owns the pane
- transcript preview overlays the pane
- file preview overlays the pane

That means when a user clicks a transcript from the sidebar or opens a file from the git/files panel, the center surface changes abruptly with no persistent indication that they are now looking at a different surface. The result is disorientation, especially when a live session is still running behind the preview.

## Goal

Make middle-pane attention explicit and reversible.

Users should be able to:

- understand what they are currently looking at
- switch back to the live session without losing context
- keep multiple middle-pane surfaces open long enough to compare or return
- close transient surfaces without feeling like the app "teleported"

## Non-Goals

- Full browser-style tab persistence across app restarts
- Multi-row tabs, drag-reorder, pinning, or split panes
- Changes to scroll view mode in this iteration

## User-Facing Proposal

Introduce a lightweight tab strip for the middle pane in focused view.

### Surface types

Represent each middle-pane surface as a tab:

- Live session tab
- Transcript preview tab
- File preview tab

### Default behavior

- If a project has a selected active session, its live terminal remains the primary tab.
- Opening a transcript preview creates or focuses a transcript tab instead of covering the pane invisibly.
- Opening a file preview creates or focuses a file tab instead of covering the pane invisibly.
- Switching tabs swaps the middle-pane content without destroying other open surfaces.
- Closing a non-primary tab returns focus to the previously active tab when possible, otherwise the live session tab.

### Tab labels

- Live session tab: session label plus agent badge
- Transcript tab: session label plus `view only` badge
- File tab: file name plus extension/language hint

### Tab lifecycle

- One live tab per session surface
- One transcript tab per session id
- One file tab per absolute file path
- Reopening the same transcript/file focuses the existing tab instead of duplicating it

## UX Details

### Placement

- Add the tab strip at the top of the middle pane, above the current terminal/transcript/file content
- Keep each surface’s own local header for now only if it still carries unique actions; otherwise collapse duplicated header chrome into the tab strip over time

### Affordances

- Active tab is visually clear
- Non-primary tabs have close buttons
- Transcript tabs show they are read-only
- Live tabs show status, such as running or needs input, without requiring the sidebar

### Empty and fallback behavior

- If no live session exists but a transcript is selected, the transcript tab can still be the only tab
- If a file is opened while no session is selected, the file tab still works
- If a tab’s backing resource disappears, the tab remains but shows an error state in content

## Technical Proposal

### New middle-pane model

Replace implicit overlay state with an explicit middle-pane tab state.

Add a new concept in app state:

- `centerTabs: CenterTab[]`
- `activeCenterTabId: string | null`

`CenterTab` should include:

- `id`
- `kind: "live-session" | "transcript" | "file"`
- `sessionId?: string`
- `filePath?: string`
- `title`
- enough metadata to render the tab chip without loading the full view

### State transitions

- Selecting an active live session should create/focus its live tab
- Viewing a past session transcript should create/focus a transcript tab
- Opening a file preview should create/focus a file tab
- Closing a tab removes it and picks the best fallback active tab

### Rendering

Instead of rendering transcript and file preview as `absolute inset-0` overlays above the terminal stack, render a single tabbed content router:

- if active tab is `live-session`, render the relevant `XTermContainer`
- if active tab is `transcript`, render `SessionTranscriptView`
- if active tab is `file`, render `FilePreview`

### Compatibility

- Focused view gets tabs
- Scroll view remains unchanged in this iteration
- Existing sidebar actions should dispatch "open/focus tab" actions instead of setting ad hoc overlay state

## Migration Plan

1. Introduce `CenterTab` types and reducer actions.
2. Add a `MiddlePaneTabs` component that renders tab headers and close behavior.
3. Convert `viewingSession` and `previewFilePath` state into tab-opening actions.
4. Replace overlay rendering in `AppLayout` with a single active tab router.
5. Keep existing `SessionTranscriptView` and `FilePreview` components working inside the router with minimal changes.
6. Polish header duplication and edge states after the tab model is stable.

## Alternatives Considered

### A. Keep overlays, add a small breadcrumb/header only

Pros:

- lowest engineering cost

Cons:

- still only one implicit surface at a time
- weaker mental model
- does not solve "return to what I was doing" as cleanly as tabs

### B. Replace the middle pane with a stack/history switcher, not tabs

Pros:

- slightly simpler than true tabs

Cons:

- less legible
- worse for quick comparison
- less familiar than tabs for IDE-like software

### C. Split the pane into live session + preview sub-pane

Pros:

- preserves live visibility

Cons:

- heavy layout complexity
- poor fit for small windows
- likely overkill for this scope

## Risks

- Header duplication if both tabs and per-surface headers remain unchanged
- Too many tabs if file previews are opened aggressively
- Terminal lifecycle bugs if tab routing accidentally remounts live PTYs
- Ambiguous fallback behavior when closing the active tab

## Mitigations

- Deduplicate tabs by backing identity
- Keep PTY ownership stable and hide/show rather than recreate live terminals
- Limit this iteration to focused view
- Preserve existing surface components and only change orchestration first

## Testing Plan

### Happy paths

- Open a live session, then open a transcript preview, then switch back to the live tab
- Open a file from the git panel while a live session is running
- Open the same transcript twice and verify only one tab exists
- Open the same file twice and verify only one tab exists

### Edge cases

- Open transcript preview when no live session is active
- Open file preview from history/transcript workspace context
- Close the active transcript tab and verify sensible fallback
- Close the only open tab and verify empty-state behavior
- Switch active session while transcript/file tabs are open

### Regression checks

- Focused view still shows and preserves running PTYs correctly
- Scroll view is unchanged
- Sidebar selection semantics remain understandable
- File preview and transcript loading states still render properly

## Recommendation

Implement middle-pane tabs in focused view. This is the smallest change that makes the app’s center surface feel intentional instead of incidental, and it matches the repo’s clean IDE-like direction better than one-off overlay fixes.

## CEO Review

### Premise Challenge

This is the right problem to solve. The actual pain is not "there are no tabs" in the abstract; it is that the center of the app has multiple meaningful surfaces, but the current UI presents them as invisible replacements. Users lose orientation because the app knows these are different surfaces while the UI treats them like a single slot.

Doing nothing keeps a real product tax in place: transcript clicks feel like teleportation, file preview feels like it hijacks the session, and the user has to remember what was previously underneath. In an IDE-like product, that is not a cosmetic flaw. It damages trust in the workspace model.

### What Already Exists

| Sub-problem | Existing code leverage |
|---|---|
| Tab primitives | `src/components/ui/tabs.tsx` already exists and matches the app's UI layer |
| Live session rendering | `src/components/layout/AppLayout.tsx` already keeps live terminals mounted by session and hides/shows them |
| Transcript surface | `src/components/terminal/SessionTranscriptView.tsx` is already a self-contained read-only surface |
| File surface | `src/components/files/FilePreview.tsx` is already a self-contained preview surface |
| Sidebar open actions | `SessionSidebar` already distinguishes active-session selection vs transcript viewing |

This should be an orchestration change more than a surface rewrite.

### Dream State Mapping

```text
CURRENT STATE                  THIS PLAN                         12-MONTH IDEAL
overlay-based slot             explicit center-surface tabs      coherent IDE workspace model
invisible context switches --> focused-view tab router      --> tabs, previews, history, and inspectors
session hidden by preview      stable return path                all center surfaces feel first-class
```

### Implementation Alternatives

**APPROACH A: Overlay header only**
  Summary: Keep the current overlay model, but add a stronger header/back affordance.
  Effort: S
  Risk: Medium
  Pros:
  - minimal diff
  - quickest to ship
  - little reducer churn
  Cons:
  - still one implicit surface at a time
  - does not model file/transcript/live as peers
  - weak long-term fit for an IDE-like app

**APPROACH B: Tabbed center-surface router**
  Summary: Represent live session, transcript preview, and file preview as explicit center tabs with one active surface at a time.
  Effort: M
  Risk: Low-Medium
  Pros:
  - fixes the actual orientation problem
  - reuses existing surface components
  - aligns with IDE expectations
  Cons:
  - requires reducer/state changes
  - needs careful PTY mount stability

**APPROACH C: Split session and preview into two simultaneous panes**
  Summary: Keep live session always visible and show preview in a sub-pane.
  Effort: L
  Risk: High
  Pros:
  - preserves constant session visibility
  - supports side-by-side work
  Cons:
  - too heavy for this problem
  - poor small-window behavior
  - much more layout and resize complexity

### Mode Selection

SELECTIVE EXPANSION.

The core fix is Approach B. Expansion ideas inside the blast radius are acceptable only if they do not turn this into a general workspace overhaul.

### Error & Rescue Registry

| Failure | Why it happens | Rescue |
|---|---|---|
| Active tab points to missing session | transcript/history state outlives live state | fall back to transcript tab if available, else project empty state |
| Closing active tab leaves null surface unexpectedly | reducer picks no fallback | preserve previous-tab stack or deterministic fallback order |
| Live PTY remount kills terminal continuity | tab switch recreates `XTermContainer` | keep PTY containers mounted and route visibility only |
| Duplicate tabs accumulate | open actions always append | dedupe by backing identity |

### Failure Modes Registry

| Mode | Severity | Covered by plan? | Note |
|---|---|---|---|
| Transcript preview opened while session still running | High | Yes | tabs make this explicit |
| Same file reopened repeatedly | Medium | Yes | dedupe by absolute path |
| Window width too small for many tabs | Medium | Partial | requires overflow strategy in implementation |
| Scroll view gains half-finished tab affordances | Medium | Yes | explicitly out of scope |

### NOT in Scope

- Persisting middle-pane tabs across app restarts
- Multi-row or reorderable tabs
- Split-view editing or compare mode
- Retrofitting scroll view mode in the first pass

## Design Review

### Initial Rating

This plan is **8/10** on design completeness after review. The structural move is strong, but it needed more explicit hierarchy, tighter tab behavior, and more concrete edge-state treatment to avoid becoming "tabs because tabs."

A 10/10 version for this app means the user can always answer three questions instantly:

- what am I looking at?
- what else do I have open?
- how do I get back to the thing I was just doing?

### Information Architecture

The new hierarchy should be:

1. middle-pane tab strip
2. active surface content
3. surface-local actions only when they are unique to that surface

If the tab strip is introduced but transcript/file/live headers all remain equally loud, the hierarchy will still feel noisy. The implementation should progressively collapse shared identity chrome into the tab strip.

### Interaction State Coverage

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Live session tab | terminal mounting indicator | no live session selected | PTY failed to spawn | interactive terminal | session exists but is stopped |
| Transcript tab | transcript loading message | bash transcript unavailable placeholder | transcript fetch error | timeline rendered | history metadata exists but local session missing |
| File tab | file loading message | not applicable | file read/highlight error | syntax-highlighted preview | file exists but language/highlighter fallback used |
| Tab strip | overflow affordance if crowded | single-tab mode still visible | unknown surface kind fallback | active tab clearly highlighted | truncated title with tooltip |

### Specific UI Decisions

- Use the existing `line` tabs visual language rather than introducing a new chrome pattern.
- Keep tab labels mono or mixed mono-forward where the content identity is code/workspace oriented.
- Use a pinned-feeling live session tab and closable transcript/file tabs.
- Show transcript tabs as `view only`; show file tabs with file name first and path detail on hover, not in the chip.
- Use hover-reveal close buttons for non-active tabs only if they remain keyboard reachable.

### AI Slop Risk Check

Low risk if this stays utilitarian. High risk if the tab strip turns into oversized pills/cards or if every surface keeps its own full header and the middle pane becomes stacked chrome. The design should stay calm and dense, not "workspace but with marketing spacing."

### Responsive / Small Width Behavior

- Tabs must truncate aggressively with tooltips.
- On narrow widths, only the active tab should show full label priority; inactive tabs can compress earlier.
- If overflow becomes severe, add a secondary overflow menu later rather than shrinking everything into illegibility in v1.

## Engineering Review

### Scope Challenge

This can be done in a reasonably tight diff if it stays orchestration-first. The minimum complete version is:

1. introduce center-tab state
2. route opening actions through it
3. render one active surface from that state
4. keep live PTY mounting stable

That is the smallest change that actually solves the problem. A header-only patch is smaller, but it solves the symptom, not the workspace model.

### Architecture Diagram

```text
SessionSidebar / FilePanel / GitPanel
          | open/focus actions
          v
     App reducer
  + centerTabs[]
  + activeCenterTabId
          |
          v
   MiddlePaneTabs header
          |
          v
  Active surface router
   |        |          |
   |        |          |
   v        v          v
 live    transcript    file
 tab      tab          tab
   |        |          |
   v        v          v
XTerm   Session-    FilePreview
Container Transcript
          View
```

### Minimal File Blast Radius

Expected core touch set:

- `src/state/types.ts`
- `src/state/reducer.ts`
- `src/components/layout/AppLayout.tsx`
- new `src/components/layout/MiddlePaneTabs.tsx`
- `src/components/terminal/SessionTranscriptView.tsx`
- `src/components/files/FilePreview.tsx`

This is inside the "boil the lake, not the ocean" range.

### Code Quality Guidance

- Replace ad hoc overlay booleans with one explicit center-surface model instead of adding a third or fourth overlay flag.
- Keep `SessionTranscriptView` and `FilePreview` largely intact; move orchestration, not rendering complexity, into the new tab model.
- Prefer a tiny reducer vocabulary like `OPEN_CENTER_TAB`, `CLOSE_CENTER_TAB`, `SET_ACTIVE_CENTER_TAB` over a generic abstraction that hides behavior.
- Do not couple tab identity to rendered React keys in a way that accidentally remounts live terminals.

### Test Diagram

```text
ENTRY: select live session
  -> live tab created/focused
  -> terminal remains mounted
  -> switch away / switch back
     [test: reducer + focused view integration]

ENTRY: click transcript from sidebar
  -> transcript tab created/focused
  -> existing live tab preserved
  -> close transcript
  -> fallback to previous/live tab
     [test: reducer + transcript open/close behavior]

ENTRY: open file preview
  -> file tab created/focused
  -> open same file again
  -> no duplicate tab
     [test: dedupe behavior]

EDGE: transcript without live session
  -> transcript as sole active tab
     [test: history-only path]

EDGE: close active tab with multiple tabs
  -> deterministic fallback
     [test: fallback ordering]

EDGE: live tab hidden but session exits
  -> tab label/status updates or falls back safely
     [test: state update while inactive]
```

### Test Plan Requirements

- Reducer tests for open/focus/dedupe/close/fallback behavior
- Focused-view integration tests for routing active tab content
- Regression test proving transcript click no longer hides context with no persistent affordance
- Regression test proving file preview no longer behaves as a blind overlay over the live session

### Performance / Stability Risks

- The highest-risk regression is PTY remounting; implementation must preserve hidden live terminals rather than rebuild them.
- File preview and transcript loading can remain lazy because tabs only solve orchestration, not data loading.
- No new infra or backend changes are required.

## Cross-Phase Themes

**Theme: make the center surface explicit.** This came up independently in strategy, design, and engineering form. The winning move is not "add another header." It is to promote the center pane from an implicit slot to an explicit workspace surface model.

**Theme: fix orchestration before polish.** The current pain is structural. Visual polish without a state-model cleanup will still feel brittle.

## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|---|---|---|---|---|
| 1 | CEO | Choose center-surface tabs over overlay header patch | P1 completeness | Tabs solve orientation and return-path together | header-only overlay patch |
| 2 | CEO | Limit v1 to focused view | P3 pragmatic | Solves real pain without dragging scroll view into the blast radius | full dual-mode rollout |
| 3 | Design | Use explicit tab strip above content | P5 explicit | Users need visible surface identity before reading content | invisible or implicit preview state |
| 4 | Design | Keep live tab plus closable preview tabs | P1 completeness | Preserves current work while making previews first-class | single replace-in-place preview surface |
| 5 | Eng | Introduce explicit reducer state for center tabs | P5 explicit | Centralizes surface orchestration and removes overlay drift | more overlay flags |
| 6 | Eng | Reuse existing surface components | P4 DRY | The surfaces themselves are fine; orchestration is the bug | component rewrites |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean | Tabs are the right level of ambition; split view is overkill |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | Strong if reducer state replaces overlays and PTYs stay mounted |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | Needs explicit hierarchy and responsive truncation, now added |

**VERDICT:** APPROVE THE TABBED MIDDLE-PANE DIRECTION. The recommended implementation is a focused-view center-surface tab model with one explicit tab strip, deduped transcript/file tabs, and stable live-session mounting.
