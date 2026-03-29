---
name: release
description: Guides an interactive release flow for Switchboard — bumps the version, generates a user-facing GitHub changelog from commits since the last release, confirms with the user, then runs the full release (version sync across package.json / tauri.conf.json / Cargo.toml, git tag, push origin).
user-invocable: true
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Bash(cargo *), Bash(grep *), Bash(node *)
---

# Release Skill

Orchestrates the full Switchboard release flow when the user types `$release`.

## Steps

Follow these steps **in order**. Do not skip steps. Pause for user confirmation where indicated.

---

### 1. Run pre-release checks

Run both checks before doing anything else. If either fails, stop and report the error — do not continue.

```bash
npx tsc --noEmit
```

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Report **"Pre-release checks passed."** before moving on.

---

### 2. Read the current version

```bash
grep '"version"' package.json | head -1
```

Report the current version clearly: **"Current version: X.Y.Z"**

---

### 3. Ask for bump type

Present the three options with the calculated next version for each:

```
Bump type:
  patch → X.Y.(Z+1)
  minor → X.(Y+1).0
  major → (X+1).0.0
```

Wait for the user to choose patch / minor / major before continuing.

---

### 4. Find the previous release tag and collect commits

```bash
# Last release tag
git describe --tags --abbrev=0

# All non-merge commits since that tag
git log <last_tag>..HEAD --oneline --no-merges
```

If no previous tag exists, use all commits: `git log --oneline --no-merges`.

---

### 5. Write the changelog

Analyse the commits and write a concise, **user-facing** changelog in Markdown.

Rules:
- Group entries under headers: `### Features`, `### Improvements`, `### Bug Fixes`. Omit empty groups.
- Each bullet should describe **what changed and why it matters to the user**, not the internal implementation.
- Skip pure chore/build/version-bump commits (e.g. "bump version", "update lock file", CI config changes).
- Keep bullets short — one line each.
- Do not include commit hashes.

Example format:
```markdown
### Features
- Sessions now reopen at the exact scroll position you left them

### Improvements
- Git diff panel loads 40% faster on large repos

### Bug Fixes
- Fixed crash when closing a session with an active PTY
```

Present the full changelog to the user and ask: **"Does this changelog look good? Confirm to proceed with the release, or let me know what to change."**

---

### 6. Run the release (after user confirmation)

Execute the following commands in sequence. Stop immediately and report any failure.

```bash
# 1. Bump version in package.json (no git tag yet)
npm version <next_version> --no-git-tag-version

# 2. Sync version to tauri.conf.json and Cargo.toml
npm run version:sync -- <next_version>

# 3. Stage and commit the version bump
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to <next_version>"

# 4. Create annotated tag with the changelog as the message
git tag -a "v<next_version>" -m "<changelog>"

# 5. Push the commit and the tag
git push origin HEAD
git push origin "v<next_version>"
```

---

### 7. Confirm success

Report: **"Released v\<next_version\>. Tag pushed to origin."**

Remind the user to publish the GitHub release from the tag if the CI does not do it automatically.

---

## Error Handling

- If `git describe --tags` fails (no tags), fall back to `git log --oneline --no-merges` for the full commit history.
- If `npm version` or `version:sync` fails, stop and show the error — do not proceed to the git steps.
- If the tag already exists, warn the user and ask whether to overwrite before running `git tag -d` + `git push origin --delete`.
