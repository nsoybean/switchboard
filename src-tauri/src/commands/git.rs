use serde::Serialize;
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
    let current_branch = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_default()
        .trim()
        .to_string();
    let mut seen = HashSet::new();
    let mut branches = Vec::new();

    let local_output = run_git(
        &cwd,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )?;
    for line in local_output.lines() {
        push_branch(
            &mut branches,
            &mut seen,
            line,
            line.trim() == current_branch,
            false,
        );
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
    let mut args: Vec<&str> = vec!["checkout", "--"];
    let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    args.extend(file_refs);
    run_git(&cwd, &args)?;
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
