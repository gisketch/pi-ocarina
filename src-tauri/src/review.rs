use crate::app_state::{AppStateStore, Workspace};
use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
};
use tauri::State;

const SEARCH_LIMIT: usize = 100;
const DIFF_LIMIT: usize = 512 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    path: String,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    path: String,
    content: String,
    binary: bool,
}

#[tauri::command]
pub fn search_workspace_files(
    store: State<'_, AppStateStore>,
    workspace_id: String,
    query: String,
) -> Result<Vec<String>, String> {
    let workspace = workspace(&store, &workspace_id)?;
    let mut matches = Vec::new();
    visit(
        &workspace.path,
        &workspace.path,
        &query.to_lowercase(),
        &mut matches,
    )?;
    Ok(matches)
}

#[tauri::command]
pub fn repository_changes(
    store: State<'_, AppStateStore>,
    workspace_id: String,
) -> Result<Vec<ChangedFile>, String> {
    let workspace = workspace(&store, &workspace_id)?;
    let output = git(&workspace.path, &["status", "--porcelain", "-z"])?;
    Ok(output
        .split(|byte| *byte == 0)
        .filter(|record| record.len() >= 4)
        .map(|record| {
            let text = String::from_utf8_lossy(record);
            ChangedFile {
                status: text[..2].trim().to_string(),
                path: text[3..].to_string(),
            }
        })
        .collect())
}

#[tauri::command]
pub fn file_diff(
    store: State<'_, AppStateStore>,
    workspace_id: String,
    path: String,
) -> Result<FileDiff, String> {
    let workspace = workspace(&store, &workspace_id)?;
    let relative = safe_relative(&path)?;
    let output = git(
        &workspace.path,
        &[
            "diff",
            "--no-ext-diff",
            "--",
            relative.to_string_lossy().as_ref(),
        ],
    )?;
    let content = if output.is_empty() {
        fs::read(contained_file(&workspace.path, &relative)?)
            .map_err(|error| format!("read changed file: {error}"))?
    } else {
        output
    };
    let binary = content.contains(&0);
    let text = if binary {
        String::new()
    } else {
        String::from_utf8_lossy(&content[..content.len().min(DIFF_LIMIT)]).into_owned()
    };
    Ok(FileDiff {
        path,
        content: text,
        binary,
    })
}

fn workspace(store: &AppStateStore, id: &str) -> Result<Workspace, String> {
    store
        .snapshot()
        .workspaces
        .into_iter()
        .find(|item| item.id == id)
        .ok_or_else(|| "workspace is not in the catalog".into())
}

fn safe_relative(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("file path must stay inside the workspace".into());
    }
    Ok(path.to_owned())
}

fn contained_file(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    let root = root
        .canonicalize()
        .map_err(|_| "workspace is unavailable")?;
    let file = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "file is unavailable")?;
    if !file.starts_with(&root) || !file.is_file() {
        return Err("file must stay inside the workspace".into());
    }
    Ok(file)
}

fn visit(
    root: &Path,
    directory: &Path,
    needle: &str,
    matches: &mut Vec<String>,
) -> Result<(), String> {
    if matches.len() >= SEARCH_LIMIT {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|error| format!("search workspace: {error}"))? {
        let entry = entry.map_err(|error| format!("search workspace: {error}"))?;
        let path = entry.path();
        let name = entry.file_name();
        if name == ".git" || name == "node_modules" || name == "target" {
            continue;
        }
        let kind = entry
            .file_type()
            .map_err(|error| format!("search workspace: {error}"))?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            visit(root, &path, needle, matches)?;
        } else if kind.is_file() {
            let relative = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .into_owned();
            if needle.is_empty() || relative.to_lowercase().contains(needle) {
                matches.push(relative);
            }
        }
        if matches.len() >= SEARCH_LIMIT {
            break;
        }
    }
    Ok(())
}

fn git(root: &Path, arguments: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(arguments)
        .output()
        .map_err(|error| format!("run git: {error}"))?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::safe_relative;
    #[test]
    fn rejects_paths_outside_workspace() {
        assert!(safe_relative("src/main.rs").is_ok());
        assert!(safe_relative("../secret").is_err());
        assert!(safe_relative("/etc/passwd").is_err());
    }
}
