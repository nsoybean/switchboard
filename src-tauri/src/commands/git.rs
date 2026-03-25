use serde::Serialize;
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

fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git {} failed: {}", args[0], stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
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
    let status_output = run_git(&cwd, &["status", "--porcelain=v1"])?;
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

/// Push current branch to remote
#[tauri::command]
pub fn git_push(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["push"])
}

/// Create a new branch
#[tauri::command]
pub fn git_create_branch(cwd: String, name: String) -> Result<(), String> {
    run_git(&cwd, &["checkout", "-b", &name])?;
    Ok(())
}

/// Create a PR using gh CLI
#[tauri::command]
pub fn git_create_pr(
    cwd: String,
    title: String,
    body: String,
    base: String,
) -> Result<String, String> {
    let output = Command::new("gh")
        .args(["pr", "create", "--title", &title, "--body", &body, "--base", &base])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run gh: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh pr create failed: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
