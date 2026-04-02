# TODO

## Inspector And Git Panel Responsiveness

- Preserve the last resolved workspace context while validating a newly selected tile so the right panel does not flash back to a resolving or empty state on every click.
- Cache resolved workspace roots by session and canonical path so repeated tile switches do not re-run directory inspection for already-known workspaces.
- Cache git state by `cwd` instead of rebuilding it from scratch on every selected-tile change, especially when multiple tiles point at the same repo or worktree.
- Split lightweight git summary state from full git file-list state so branch and diff stats stay responsive even when the `Changes` tab is not active.
- Add a diff cache keyed by `cwd`, file path, and staged/unstaged mode so reopening the same file diff does not refetch unnecessarily.
