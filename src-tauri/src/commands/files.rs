use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

/// List directory contents, respecting .gitignore.
/// Returns sorted entries (directories first, then files, alphabetically).
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("'{}' is not a directory", path));
    }

    // Collect all entries
    let read_dir = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut entries: Vec<FileEntry> = Vec::new();

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/directories (starting with .)
        if file_name.starts_with('.') {
            continue;
        }

        let file_path = entry.path();
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = if is_dir {
            None
        } else {
            metadata.as_ref().map(|m| m.len())
        };

        entries.push(FileEntry {
            name: file_name,
            path: file_path.to_string_lossy().to_string(),
            is_dir,
            size,
        });
    }

    // Check git-ignored status in bulk
    let ignored = get_git_ignored(&path, &entries);
    entries.retain(|e| !ignored.contains(&e.path));

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Read file contents as a string. Returns error for binary or very large files.
#[tauri::command]
pub fn read_file_contents(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("'{}' is not a file", path));
    }
    let metadata = fs::metadata(p).map_err(|e| format!("Failed to read metadata: {}", e))?;
    // Limit to 1MB to avoid loading huge files
    if metadata.len() > 1_048_576 {
        return Err("File too large to preview (>1MB)".to_string());
    }
    let contents = fs::read_to_string(p).map_err(|_| "File appears to be binary".to_string())?;
    Ok(contents)
}

/// Use `git check-ignore` to filter out ignored paths
fn get_git_ignored(cwd: &str, entries: &[FileEntry]) -> std::collections::HashSet<String> {
    let mut ignored = std::collections::HashSet::new();

    if entries.is_empty() {
        return ignored;
    }

    let paths: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();

    // git check-ignore returns the paths that ARE ignored (exit code 0 for ignored, 1 for not)
    let result = Command::new("git")
        .arg("check-ignore")
        .args(&paths)
        .current_dir(cwd)
        .output();

    if let Ok(output) = result {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                ignored.insert(trimmed.to_string());
            }
        }
    }

    ignored
}
