use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub head: String,
}

/// Convert a label to a URL-safe slug
pub fn label_to_slug(label: &str) -> String {
    let slug: String = label
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    // Collapse multiple hyphens and trim
    let mut result = String::new();
    let mut prev_hyphen = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_hyphen && !result.is_empty() {
                result.push('-');
            }
            prev_hyphen = true;
        } else {
            result.push(c);
            prev_hyphen = false;
        }
    }
    let trimmed = result.trim_end_matches('-').to_string();
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed
    }
}

/// Create a new git worktree for a session
#[tauri::command]
pub fn create_worktree(
    repo_path: String,
    branch_name: String,
    label: String,
    base_branch: Option<String>,
) -> Result<WorktreeInfo, String> {
    let slug = label_to_slug(&label);
    let worktree_path = Path::new(&repo_path)
        .join(".switchboard-worktrees")
        .join(&slug);
    let worktree_str = worktree_path.to_str().ok_or("Invalid path")?.to_string();

    // Create parent directory if needed
    if let Some(parent) = worktree_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let mut command = Command::new("git");
    command
        .arg("worktree")
        .arg("add")
        .arg("-b")
        .arg(&branch_name)
        .arg(&worktree_str);

    if let Some(base_branch) = base_branch.as_deref() {
        command.arg(base_branch);
    }

    let output = command
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree add failed: {}", stderr.trim()));
    }

    // Ensure .switchboard-worktrees is in .gitignore
    let gitignore_path = Path::new(&repo_path).join(".gitignore");
    let entry = ".switchboard-worktrees/";
    if let Ok(contents) = std::fs::read_to_string(&gitignore_path) {
        if !contents.lines().any(|l| l.trim() == entry) {
            let mut new_contents = contents;
            if !new_contents.ends_with('\n') {
                new_contents.push('\n');
            }
            new_contents.push_str(entry);
            new_contents.push('\n');
            let _ = std::fs::write(&gitignore_path, new_contents);
        }
    }

    Ok(WorktreeInfo {
        path: worktree_str,
        branch: branch_name,
        head: String::new(),
    })
}

/// Remove a git worktree
#[tauri::command]
pub fn remove_worktree(repo_path: String, worktree_path: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["worktree", "remove", &worktree_path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree remove failed: {}", stderr.trim()));
    }

    Ok(())
}

/// List all git worktrees
#[tauri::command]
pub fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree list failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_head = String::new();
    let mut current_branch = String::new();

    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            current_path = path.to_string();
        } else if let Some(head) = line.strip_prefix("HEAD ") {
            current_head = head[..7.min(head.len())].to_string();
        } else if let Some(branch) = line.strip_prefix("branch ") {
            current_branch = branch
                .strip_prefix("refs/heads/")
                .unwrap_or(branch)
                .to_string();
        } else if line.is_empty() && !current_path.is_empty() {
            worktrees.push(WorktreeInfo {
                path: current_path.clone(),
                branch: current_branch.clone(),
                head: current_head.clone(),
            });
            current_path.clear();
            current_head.clear();
            current_branch.clear();
        }
    }

    // Push last entry if no trailing newline
    if !current_path.is_empty() {
        worktrees.push(WorktreeInfo {
            path: current_path,
            branch: current_branch,
            head: current_head,
        });
    }

    Ok(worktrees)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_label_to_slug() {
        assert_eq!(label_to_slug("Auth Refactor!"), "auth-refactor");
        assert_eq!(label_to_slug("hello   world"), "hello-world");
        assert_eq!(label_to_slug(""), "untitled");
        assert_eq!(label_to_slug("---"), "untitled");
        assert_eq!(label_to_slug("simple"), "simple");
        assert_eq!(label_to_slug("CamelCase"), "camelcase");
    }
}
