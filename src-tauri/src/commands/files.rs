use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DirectoryStatus {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub canonical_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FileIndexEntry {
    pub path: String,
    pub relative_path: String,
    pub basename: String,
    pub directory: String,
    pub extension: String,
    pub size: Option<u64>,
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

fn entry_from_relative_path(root: &Path, relative_path: &str) -> Option<FileIndexEntry> {
    let rel = relative_path.trim_matches('\0').trim();
    if rel.is_empty() {
        return None;
    }

    let absolute = root.join(rel);
    let metadata = fs::metadata(&absolute).ok();
    if metadata.as_ref().is_some_and(|m| m.is_dir()) {
        return None;
    }

    let basename = Path::new(rel)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| rel.to_string());
    let directory = Path::new(rel)
        .parent()
        .map(|parent| {
            let value = parent.to_string_lossy().to_string();
            if value == "." {
                String::new()
            } else {
                value
            }
        })
        .unwrap_or_default();
    let extension = Path::new(rel)
        .extension()
        .map(|ext| ext.to_string_lossy().to_string())
        .unwrap_or_default();

    Some(FileIndexEntry {
        path: absolute.to_string_lossy().to_string(),
        relative_path: rel.to_string(),
        basename,
        directory,
        extension,
        size: metadata.map(|m| m.len()),
    })
}

fn git_index_files(root: &Path) -> Result<Vec<FileIndexEntry>, String> {
    let output = Command::new("git")
        .arg("ls-files")
        .arg("-z")
        .arg("--cached")
        .arg("--others")
        .arg("--exclude-standard")
        .current_dir(root)
        .output()
        .map_err(|e| format!("Failed to run git ls-files: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let mut entries = output
        .stdout
        .split(|byte| *byte == 0)
        .filter_map(|bytes| String::from_utf8(bytes.to_vec()).ok())
        .filter_map(|relative| entry_from_relative_path(root, &relative))
        .collect::<Vec<_>>();

    entries.sort_by(|a, b| {
        a.relative_path
            .to_lowercase()
            .cmp(&b.relative_path.to_lowercase())
    });
    Ok(entries)
}

fn should_skip_walk_dir(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "node_modules" | "target" | "dist" | "build")
}

fn walk_files(
    root: &Path,
    dir: &Path,
    entries: &mut Vec<FileIndexEntry>,
    visited: &mut HashSet<PathBuf>,
) -> Result<(), String> {
    const MAX_FILES: usize = 20_000;
    if entries.len() >= MAX_FILES {
        return Ok(());
    }

    let canonical =
        fs::canonicalize(dir).map_err(|e| format!("Failed to resolve directory: {}", e))?;
    if !visited.insert(canonical) {
        return Ok(());
    }

    let read_dir = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;
    for entry in read_dir {
        if entries.len() >= MAX_FILES {
            break;
        }

        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = entry.metadata().ok();

        if metadata.as_ref().is_some_and(|m| m.is_dir()) {
            if !should_skip_walk_dir(&name) {
                walk_files(root, &path, entries, visited)?;
            }
            continue;
        }

        if metadata.as_ref().is_some_and(|m| m.is_file()) {
            let relative_path = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            if let Some(index_entry) = entry_from_relative_path(root, &relative_path) {
                entries.push(index_entry);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn index_files(root: String) -> Result<Vec<FileIndexEntry>, String> {
    let root = validate_directory(&root)?;

    match git_index_files(&root) {
        Ok(entries) => Ok(entries),
        Err(_) => {
            let mut entries = Vec::new();
            let mut visited = HashSet::new();
            walk_files(&root, &root, &mut entries, &mut visited)?;
            entries.sort_by(|a, b| {
                a.relative_path
                    .to_lowercase()
                    .cmp(&b.relative_path.to_lowercase())
            });
            Ok(entries)
        }
    }
}

#[tauri::command]
pub fn inspect_directory(path: String) -> Result<DirectoryStatus, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Ok(DirectoryStatus {
            path,
            exists: false,
            is_dir: false,
            canonical_path: None,
        });
    }

    let dir = Path::new(&trimmed);
    let exists = dir.exists();
    let is_dir = exists && dir.is_dir();
    let canonical_path = if is_dir {
        fs::canonicalize(dir)
            .ok()
            .map(|resolved| resolved.to_string_lossy().to_string())
    } else {
        None
    };

    Ok(DirectoryStatus {
        path,
        exists,
        is_dir,
        canonical_path,
    })
}

/// List directory contents, respecting .gitignore.
/// Returns sorted entries (directories first, then files, alphabetically).
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = validate_directory(&path)?;

    // Collect all entries
    let read_dir = fs::read_dir(&dir).map_err(|e| format!("Failed to read directory: {}", e))?;
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
    let ignored = get_git_ignored(dir.to_string_lossy().as_ref(), &entries);
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

/// Save raw image bytes to a temporary file and return the path.
/// Used for pasting clipboard images into the inline session input.
#[tauri::command]
pub fn save_temp_image(data: Vec<u8>, extension: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("switchboard");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let name = format!(
        "paste-{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        extension,
    );

    let path = temp_dir.join(&name);
    fs::write(&path, &data).map_err(|e| format!("Failed to write temp image: {}", e))?;
    Ok(path.to_string_lossy().to_string())
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
