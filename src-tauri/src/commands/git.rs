use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct ChangedFile {
    pub path: String,
    pub status: String, // "M", "A", "D", "??"
    pub staged: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct DiffStats {
    pub additions: u32,
    pub deletions: u32,
    pub files_changed: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct GitStatusResult {
    pub branch: String,
    pub files: Vec<ChangedFile>,
    pub stats: DiffStats,
}

#[derive(Debug, Serialize, Clone)]
pub struct GitBranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream_status: String,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub last_commit_subject: Option<String>,
    pub last_commit_date: Option<String>,
}

fn validate_directory(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Directory path is empty".to_string());
    }

    let dir = Path::new(trimmed);
    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", trimmed));
    }
    if !dir.is_dir() {
        return Err(format!("'{}' is not a directory", trimmed));
    }

    fs::canonicalize(dir).map_err(|e| format!("Failed to resolve directory '{}': {}", trimmed, e))
}

fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let cwd = validate_directory(cwd)?;
    let output = Command::new("git")
        .args(args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git {} failed: {}", args[0], stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn push_branch(
    branches: &mut Vec<GitBranchInfo>,
    seen: &mut HashSet<String>,
    name: &str,
    is_current: bool,
    is_remote: bool,
) {
    let name = name.trim();
    if name.is_empty() || name.ends_with("/HEAD") || !seen.insert(name.to_string()) {
        return;
    }

    branches.push(GitBranchInfo {
        name: name.to_string(),
        is_current,
        is_remote,
        upstream_status: "none".to_string(),
        ahead: None,
        behind: None,
        last_commit_subject: None,
        last_commit_date: None,
    });
}

/// Get git status for a directory
#[tauri::command]
pub fn git_status(cwd: String) -> Result<GitStatusResult, String> {
    // Get branch
    let branch = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "HEAD".to_string())
        .trim()
        .to_string();

    // Get status
    let status_output = run_git(&cwd, &["status", "--porcelain=v1", "--untracked-files=all"])?;
    let mut files = Vec::new();

    for line in status_output.lines() {
        if line.len() < 4 {
            continue;
        }
        let index_status = line.chars().nth(0).unwrap_or(' ');
        let work_status = line.chars().nth(1).unwrap_or(' ');
        let path = line[3..].to_string();

        // Determine display status and staging
        let (status, staged) = match (index_status, work_status) {
            ('?', '?') => ("??".to_string(), false),
            (i, ' ') if i != ' ' => (i.to_string(), true),
            (' ', w) if w != ' ' => (w.to_string(), false),
            (i, w) => {
                // Both staged and unstaged changes — show as two entries
                files.push(ChangedFile {
                    path: path.clone(),
                    status: i.to_string(),
                    staged: true,
                });
                (w.to_string(), false)
            }
        };

        files.push(ChangedFile {
            path,
            status,
            staged,
        });
    }

    // Get diff stats
    let stats_output = run_git(&cwd, &["diff", "--shortstat"]).unwrap_or_default();
    let stats = parse_diff_stats(&stats_output);

    Ok(GitStatusResult {
        branch,
        files,
        stats,
    })
}

/// List local branches for a directory.
#[tauri::command]
pub fn git_list_branches(cwd: String) -> Result<Vec<GitBranchInfo>, String> {
    let mut branches = Vec::new();
    let local_output = run_git(
        &cwd,
        &[
            "for-each-ref",
            "--format=%(refname:short)\x1f%(HEAD)\x1f%(upstream)\x1f%(upstream:track)\x1f%(contents:subject)\x1f%(committerdate:relative)",
            "refs/heads",
        ],
    )?;
    for line in local_output.lines() {
        let parts: Vec<&str> = line.splitn(6, '\x1f').collect();
        if parts.len() < 6 {
            continue;
        }
        let upstream_status = parse_upstream_status(parts[2].trim(), parts[3].trim());
        let (ahead, behind) = parse_upstream_track(parts[3].trim());
        branches.push(GitBranchInfo {
            name: parts[0].trim().to_string(),
            is_current: parts[1].trim() == "*",
            is_remote: false,
            upstream_status,
            ahead,
            behind,
            last_commit_subject: non_empty_string(parts[4]),
            last_commit_date: non_empty_string(parts[5]),
        });
    }

    branches.sort_by(|a, b| {
        b.is_current
            .cmp(&a.is_current)
            .then(a.is_remote.cmp(&b.is_remote))
            .then(a.name.cmp(&b.name))
    });

    Ok(branches)
}

/// List remote origin branches for a directory, using PR-safe branch names.
#[tauri::command]
pub fn git_list_remote_branches(cwd: String) -> Result<Vec<GitBranchInfo>, String> {
    let mut seen = HashSet::new();
    let mut branches = Vec::new();

    let remote_output = run_git(
        &cwd,
        &[
            "for-each-ref",
            "--format=%(refname:lstrip=3)",
            "refs/remotes/origin",
        ],
    )?;

    for line in remote_output.lines() {
        push_branch(&mut branches, &mut seen, line, false, true);
    }

    branches.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(branches)
}

fn parse_diff_stats(output: &str) -> DiffStats {
    let mut stats = DiffStats {
        additions: 0,
        deletions: 0,
        files_changed: 0,
    };

    let trimmed = output.trim();
    if trimmed.is_empty() {
        return stats;
    }

    // Parse "N files changed, N insertions(+), N deletions(-)"
    for part in trimmed.split(',') {
        let part = part.trim();
        if part.contains("file") {
            if let Some(n) = part.split_whitespace().next() {
                stats.files_changed = n.parse().unwrap_or(0);
            }
        } else if part.contains("insertion") {
            if let Some(n) = part.split_whitespace().next() {
                stats.additions = n.parse().unwrap_or(0);
            }
        } else if part.contains("deletion") {
            if let Some(n) = part.split_whitespace().next() {
                stats.deletions = n.parse().unwrap_or(0);
            }
        }
    }

    stats
}

fn non_empty_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_upstream_track(track: &str) -> (Option<u32>, Option<u32>) {
    let trimmed = track.trim();
    if trimmed.is_empty() || trimmed == "[gone]" {
        return (None, None);
    }

    let trimmed = trimmed
        .trim_start_matches('[')
        .trim_end_matches(']');
    let mut ahead = None;
    let mut behind = None;

    for part in trimmed.split(',') {
        let entry = part.trim();
        if let Some(value) = entry.strip_prefix("ahead ") {
            ahead = value.parse().ok();
        } else if let Some(value) = entry.strip_prefix("behind ") {
            behind = value.parse().ok();
        }
    }

    (ahead, behind)
}

fn parse_upstream_status(upstream: &str, track: &str) -> String {
    if upstream.trim().is_empty() {
        return "none".to_string();
    }

    if track.trim() == "[gone]" {
        return "gone".to_string();
    }

    "tracking".to_string()
}

/// Get unified diff for a directory or specific file
#[tauri::command]
pub fn git_diff(cwd: String, file: Option<String>, staged: bool) -> Result<String, String> {
    let mut args = vec!["diff"];
    if staged {
        args.push("--cached");
    }
    if let Some(ref f) = file {
        args.push("--");
        args.push(f);
    }
    run_git(&cwd, &args)
}

/// Stage files
#[tauri::command]
pub fn git_stage(cwd: String, files: Vec<String>) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["add"];
    let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    args.extend(file_refs);
    run_git(&cwd, &args)?;
    Ok(())
}

/// Unstage files
#[tauri::command]
pub fn git_unstage(cwd: String, files: Vec<String>) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["restore", "--staged"];
    let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    args.extend(file_refs);
    run_git(&cwd, &args)?;
    Ok(())
}

/// Revert files (discard changes)
#[tauri::command]
pub fn git_revert_files(cwd: String, files: Vec<String>) -> Result<(), String> {
    let mut tracked_files: Vec<&str> = Vec::new();
    let mut untracked_files: Vec<&str> = Vec::new();

    for file in &files {
        let path = file.as_str();
        let tracked = Command::new("git")
            .args(["ls-files", "--error-unmatch", "--", path])
            .current_dir(validate_directory(&cwd)?)
            .output()
            .map_err(|e| format!("Failed to inspect git path '{}': {}", path, e))?;

        if tracked.status.success() {
            tracked_files.push(path);
        } else {
            untracked_files.push(path);
        }
    }

    if !tracked_files.is_empty() {
        let mut args: Vec<&str> = vec!["restore", "--worktree", "--"];
        args.extend(tracked_files.iter().copied());
        run_git(&cwd, &args)?;
    }

    if !untracked_files.is_empty() {
        let mut args: Vec<&str> = vec!["clean", "-fd", "--"];
        args.extend(untracked_files.iter().copied());
        run_git(&cwd, &args)?;
    }

    Ok(())
}

/// Commit staged changes
#[tauri::command]
pub fn git_commit(cwd: String, message: String) -> Result<String, String> {
    run_git(&cwd, &["commit", "-m", &message])
}

/// Pull current branch from remote
#[tauri::command]
pub fn git_pull(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["pull"])
}

/// Push current branch to remote, auto-setting upstream if needed
#[tauri::command]
pub fn git_push(cwd: String) -> Result<String, String> {
    match run_git(&cwd, &["push"]) {
        Ok(out) => Ok(out),
        Err(e) if e.contains("no upstream branch") || e.contains("has no upstream") => {
            let branch = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?;
            let branch = branch.trim();
            run_git(&cwd, &["push", "--set-upstream", "origin", branch])
        }
        Err(e) => Err(e),
    }
}

/// Create a new branch
#[tauri::command]
pub fn git_create_branch(cwd: String, name: String) -> Result<(), String> {
    run_git(&cwd, &["checkout", "-b", &name])?;
    Ok(())
}

/// Switch to an existing branch
#[tauri::command]
pub fn git_checkout_branch(cwd: String, name: String) -> Result<(), String> {
    run_git(&cwd, &["checkout", &name])?;
    Ok(())
}

/// Create a PR via the GitHub API and return the PR URL.
/// The token is passed from the frontend (read from config).
#[tauri::command]
pub fn git_create_pr(
    cwd: String,
    title: String,
    body: String,
    base: String,
    token: String,
) -> Result<String, String> {
    // Get current branch
    let branch = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();

    // Push the branch first (set upstream)
    let push_result = Command::new("git")
        .args(["push", "-u", "origin", &branch])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to push: {}", e))?;

    if !push_result.status.success() {
        let stderr = String::from_utf8_lossy(&push_result.stderr);
        return Err(format!("Push failed: {}", stderr.trim()));
    }

    // Get the remote URL and parse owner/repo
    let remote_url = run_git(&cwd, &["remote", "get-url", "origin"])?
        .trim()
        .to_string();

    let (owner, repo) = parse_github_remote(&remote_url)
        .ok_or_else(|| format!("Could not parse GitHub remote from: {}", remote_url))?;

    // Create PR via GitHub REST API
    let api_url = format!("https://api.github.com/repos/{}/{}/pulls", owner, repo);
    let payload = serde_json::json!({
        "title": title,
        "body": body,
        "head": branch,
        "base": base,
    });

    let response = ureq::post(&api_url)
        .header("Authorization", &format!("Bearer {}", token))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "switchboard")
        .send_json(&payload)
        .map_err(|e| format!("GitHub API error: {}", e))?;

    let response_body: serde_json::Value = response
        .into_body()
        .read_json()
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    response_body["html_url"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "GitHub API did not return a PR URL".to_string())
}

/// Parse a GitHub remote URL (SSH or HTTPS) into (owner, repo)
fn parse_github_remote(url: &str) -> Option<(String, String)> {
    let url = url.trim();
    // SSH: git@github.com:owner/repo.git
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let rest = rest.strip_suffix(".git").unwrap_or(rest);
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    // HTTPS: https://github.com/owner/repo.git
    if url.contains("github.com/") {
        let after = url.split("github.com/").nth(1)?;
        let after = after.strip_suffix(".git").unwrap_or(after);
        let parts: Vec<&str> = after.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

// ─── New types ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub date: String,
    pub is_pushed: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct GitAheadBehind {
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct GitStatusSummary {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub dirty_count: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct StashEntry {
    pub index: u32,
    pub ref_name: String,
    pub message: String,
    pub date: String,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MergeStrategy {
    Merge,
    Squash,
    Rebase,
}

// ─── New commands ─────────────────────────────────────────────────────────────

/// Lightweight status summary: branch + ahead/behind + dirty count
#[tauri::command]
pub fn git_status_summary(cwd: String, branch: Option<String>) -> Result<GitStatusSummary, String> {
    let branch_name = branch.unwrap_or_else(|| {
        run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
            .unwrap_or_else(|_| "HEAD".to_string())
            .trim()
            .to_string()
    });

    let ab = git_ahead_behind_for_ref(&cwd, &branch_name);
    let (ahead, behind) = ab.unwrap_or((0, 0));

    let status_output = run_git(&cwd, &["status", "--porcelain=v1"]).unwrap_or_default();
    let dirty_count = status_output.lines().count() as u32;

    Ok(GitStatusSummary {
        branch: branch_name,
        ahead,
        behind,
        dirty_count,
    })
}

/// Fetch ahead/behind counts relative to remote tracking branch
#[tauri::command]
pub fn git_ahead_behind(cwd: String) -> Result<GitAheadBehind, String> {
    let (ahead, behind) = git_ahead_behind_inner(&cwd)?;
    Ok(GitAheadBehind { ahead, behind })
}

fn git_ahead_behind_inner(cwd: &str) -> Result<(u32, u32), String> {
    git_ahead_behind_for_ref(cwd, "HEAD")
}

fn git_ahead_behind_for_ref(cwd: &str, reference: &str) -> Result<(u32, u32), String> {
    let upstream_ref = format!("{}@{{u}}", reference);
    let upstream = run_git(
        cwd,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            &upstream_ref,
        ],
    );
    if upstream.is_err() {
        return Ok((0, 0));
    }

    let range = format!("{}...{}", reference, upstream_ref);

    let output = run_git(cwd, &["rev-list", "--count", "--left-right", &range]).unwrap_or_default();

    let parts: Vec<&str> = output.trim().split('\t').collect();
    let ahead = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let behind = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    Ok((ahead, behind))
}

/// Get commit log
#[tauri::command]
pub fn git_log(cwd: String, limit: u32, reference: Option<String>) -> Result<Vec<GitCommit>, String> {
    let limit_str = limit.to_string();
    let ref_name = reference.unwrap_or_else(|| "HEAD".to_string());

    // Get commits
    let output = run_git(
        &cwd,
        &[
            "log",
            &format!("-{}", limit_str),
            "--format=%H\x1f%h\x1f%s\x1f%an\x1f%ar",
            &ref_name,
        ],
    )?;

    // Get the list of pushed commits (commits in @{u} but also in HEAD)
    let upstream_ref = format!("{}@{{u}}", ref_name);
    let pushed_hashes: HashSet<String> = run_git(&cwd, &["log", &upstream_ref, "--format=%H"])
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_string())
        .collect();

    let mut commits = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(5, '\x1f').collect();
        if parts.len() < 5 {
            continue;
        }
        let hash = parts[0].trim().to_string();
        let is_pushed = pushed_hashes.contains(&hash);
        commits.push(GitCommit {
            is_pushed,
            hash: hash.clone(),
            short_hash: parts[1].trim().to_string(),
            subject: parts[2].trim().to_string(),
            author: parts[3].trim().to_string(),
            date: parts[4].trim().to_string(),
        });
    }

    Ok(commits)
}

/// Fetch from origin
#[tauri::command]
pub fn git_fetch(cwd: String) -> Result<(), String> {
    run_git(&cwd, &["fetch", "origin"])?;
    Ok(())
}

/// Merge a branch into the current branch
#[tauri::command]
pub fn git_merge(cwd: String, branch: String, strategy: MergeStrategy) -> Result<String, String> {
    let args: Vec<&str> = match strategy {
        MergeStrategy::Merge => vec!["merge", "--no-ff", &branch],
        MergeStrategy::Squash => vec!["merge", "--squash", &branch],
        MergeStrategy::Rebase => vec!["rebase", &branch],
    };
    run_git(&cwd, &args)
}

/// Delete a local branch
#[tauri::command]
pub fn git_delete_branch(cwd: String, branch: String, force: bool) -> Result<(), String> {
    let flag = if force { "-D" } else { "-d" };
    run_git(&cwd, &["branch", flag, &branch])?;
    Ok(())
}

/// Delete a remote branch
#[tauri::command]
pub fn git_push_delete_remote(cwd: String, branch: String) -> Result<(), String> {
    run_git(&cwd, &["push", "origin", "--delete", &branch])?;
    Ok(())
}

/// Stash current changes
#[tauri::command]
pub fn git_stash(cwd: String, message: Option<String>) -> Result<(), String> {
    let mut args = vec!["stash", "push"];
    let msg_owned;
    if let Some(ref msg) = message {
        args.push("-m");
        msg_owned = msg.clone();
        args.push(&msg_owned);
    }
    run_git(&cwd, &args)?;
    Ok(())
}

/// List stashes
#[tauri::command]
pub fn git_stash_list(cwd: String) -> Result<Vec<StashEntry>, String> {
    let output = run_git(
        &cwd,
        &["stash", "list", "--format=%gd\x1f%s\x1f%ar"],
    )
    .unwrap_or_default();

    let mut entries = Vec::new();
    for (i, line) in output.lines().enumerate() {
        let parts: Vec<&str> = line.splitn(3, '\x1f').collect();
        if parts.len() < 3 {
            continue;
        }
        entries.push(StashEntry {
            index: i as u32,
            ref_name: parts[0].trim().to_string(),
            message: parts[1].trim().to_string(),
            date: parts[2].trim().to_string(),
        });
    }

    Ok(entries)
}

/// Pop a stash (default: most recent)
#[tauri::command]
pub fn git_stash_pop(cwd: String, index: Option<u32>) -> Result<(), String> {
    let ref_str;
    let args = if let Some(i) = index {
        ref_str = format!("stash@{{{}}}", i);
        vec!["stash", "pop", &ref_str]
    } else {
        vec!["stash", "pop"]
    };
    run_git(&cwd, &args)?;
    Ok(())
}

/// Drop a stash entry
#[tauri::command]
pub fn git_stash_drop(cwd: String, index: u32) -> Result<(), String> {
    let ref_str = format!("stash@{{{}}}", index);
    run_git(&cwd, &["stash", "drop", &ref_str])?;
    Ok(())
}

/// Show the diff introduced by a specific commit
#[tauri::command]
pub fn git_show_commit(cwd: String, hash: String) -> Result<String, String> {
    run_git(&cwd, &["show", "--unified=3", &hash])
}

/// Remove worktree + delete local branch (+ optionally remote)
#[tauri::command]
pub fn cleanup_worktree(
    repo_path: String,
    worktree_path: String,
    branch: String,
    delete_remote: bool,
) -> Result<(), String> {
    use std::process::Command as Cmd;

    // Remove worktree (--force in case it has untracked changes)
    let wt_out = Cmd::new("git")
        .args(["worktree", "remove", "--force", &worktree_path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !wt_out.status.success() {
        let stderr = String::from_utf8_lossy(&wt_out.stderr);
        return Err(format!("git worktree remove failed: {}", stderr.trim()));
    }

    // Delete local branch (-d soft delete; ignore error if already gone)
    let _ = run_git(&repo_path, &["branch", "-d", &branch]);

    // Optionally delete remote branch
    if delete_remote {
        let _ = run_git(&repo_path, &["push", "origin", "--delete", &branch]);
    }

    Ok(())
}
