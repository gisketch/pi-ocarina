use crate::app_state::{AppState, AppStateStore, Workspace};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Debug, Serialize)]
pub struct CreatedWorktree {
    pub workspace: Workspace,
}

#[derive(Debug, Serialize)]
pub struct PruneResult {
    pub removed: Vec<String>,
    pub skipped: Vec<String>,
}

#[tauri::command]
pub fn create_worktree(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    root_workspace_id: String,
) -> Result<CreatedWorktree, String> {
    let root = root_workspace(&store.snapshot(), &root_workspace_id)?;
    let repo = git_output(&root.path, &["rev-parse", "--show-toplevel"])?;
    let repo = PathBuf::from(repo.trim())
        .canonicalize()
        .map_err(|e| format!("open repository: {e}"))?;
    if repo
        != root
            .path
            .canonicalize()
            .map_err(|e| format!("open workspace: {e}"))?
    {
        return Err("worktrees can only be created from the repository root".into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let slug = format!("ocarina-{stamp}-{}", std::process::id());
    let branch = format!("pi/{slug}");
    let repo_name = repo
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("repository");
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("worktrees")
        .join(repo_name)
        .join(&slug);
    fs::create_dir_all(path.parent().ok_or("invalid worktree path")?)
        .map_err(|e| format!("create worktree folder: {e}"))?;
    git(
        &repo,
        &[
            "worktree",
            "add",
            "-b",
            &branch,
            path.to_string_lossy().as_ref(),
            "HEAD",
        ],
    )?;
    let path = path
        .canonicalize()
        .map_err(|e| format!("open created worktree: {e}"))?;
    Ok(CreatedWorktree {
        workspace: Workspace {
            id: path.to_string_lossy().into_owned(),
            path,
            name: None,
            root_workspace_id: Some(root_workspace_id),
            branch: Some(branch),
        },
    })
}

#[tauri::command]
pub fn register_worktree(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    workspace: Workspace,
) -> Result<AppState, String> {
    validate_owned(&store.snapshot(), &workspace)?;
    let snapshot = store.update(|state| {
        if !state.workspaces.iter().any(|item| item.id == workspace.id) {
            state.workspaces.push(workspace.clone());
        }
        state.selected_workspace = Some(workspace.id.clone());
    })?;
    emit(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn rollback_worktree(
    store: State<'_, AppStateStore>,
    workspace: Workspace,
) -> Result<(), String> {
    let snapshot = store.snapshot();
    validate_owned(&snapshot, &workspace)?;
    let root = root_workspace(&snapshot, workspace.root_workspace_id.as_deref().unwrap())?;
    destroy_created(&root.path, &workspace)
}

#[tauri::command]
pub fn remove_worktree(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    workspace_id: String,
) -> Result<AppState, String> {
    let snapshot = store.snapshot();
    let workspace = snapshot
        .workspaces
        .iter()
        .find(|item| item.id == workspace_id)
        .cloned()
        .ok_or("workspace is not in the catalog")?;
    validate_owned(&snapshot, &workspace)?;
    if !git_output(&workspace.path, &["status", "--porcelain"])?
        .trim()
        .is_empty()
    {
        return Err("worktree has uncommitted changes; commit or discard them first".into());
    }
    let root = root_workspace(&snapshot, workspace.root_workspace_id.as_deref().unwrap())?;
    let branch = workspace.branch.as_deref().unwrap();
    if !git_success(&root.path, &["merge-base", "--is-ancestor", branch, "HEAD"])? {
        return Err("worktree branch is not merged; merge it before removal".into());
    }
    git(
        &root.path,
        &[
            "worktree",
            "remove",
            workspace.path.to_string_lossy().as_ref(),
        ],
    )?;
    git(&root.path, &["branch", "-d", branch])?;
    let next = store.update(|state| {
        state.workspaces.retain(|item| item.id != workspace.id);
        if state.selected_workspace.as_deref() == Some(&workspace.id) {
            state.selected_workspace = Some(root.id.clone());
        }
    })?;
    emit(&app, &next)?;
    Ok(next)
}

#[tauri::command]
pub fn prune_orphaned_worktrees(
    app: AppHandle,
    store: State<'_, AppStateStore>,
) -> Result<PruneResult, String> {
    let snapshot = store.snapshot();
    let managed_root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("worktrees");
    let mut result = PruneResult {
        removed: vec![],
        skipped: vec![],
    };
    for root in snapshot
        .workspaces
        .iter()
        .filter(|item| item.root_workspace_id.is_none())
    {
        let output = git_output(&root.path, &["worktree", "list", "--porcelain"])?;
        let mut path: Option<PathBuf> = None;
        for line in output.lines().chain([""]) {
            if let Some(value) = line.strip_prefix("worktree ") {
                path = Some(PathBuf::from(value));
            }
            if !line.is_empty() {
                continue;
            }
            let Some(candidate) = path.take() else {
                continue;
            };
            if !candidate.starts_with(&managed_root)
                || candidate == root.path
                || snapshot
                    .workspaces
                    .iter()
                    .any(|item| item.path == candidate)
            {
                continue;
            }
            let id = candidate.to_string_lossy().into_owned();
            if git(
                &root.path,
                &["worktree", "remove", candidate.to_string_lossy().as_ref()],
            )
            .is_ok()
            {
                result.removed.push(id);
            } else {
                result.skipped.push(id);
            }
        }
    }
    if !result.removed.is_empty() {
        app.emit("worktree://pruned", &result.removed)
            .map_err(|e| e.to_string())?;
    }
    Ok(result)
}

fn root_workspace(state: &AppState, id: &str) -> Result<Workspace, String> {
    state
        .workspaces
        .iter()
        .find(|item| item.id == id && item.root_workspace_id.is_none())
        .cloned()
        .ok_or_else(|| "root workspace is not in the catalog".into())
}

fn validate_owned(state: &AppState, workspace: &Workspace) -> Result<(), String> {
    let root_id = workspace
        .root_workspace_id
        .as_deref()
        .ok_or("primary workspace cannot be removed as a worktree")?;
    let branch = workspace
        .branch
        .as_deref()
        .ok_or("worktree branch is missing")?;
    if !branch.starts_with("pi/ocarina-") {
        return Err("refusing to manage a worktree not created by Pi Ocarina".into());
    }
    let _ = root_workspace(state, root_id)?;
    Ok(())
}

fn destroy_created(root: &Path, workspace: &Workspace) -> Result<(), String> {
    let _ = git(
        root,
        &[
            "worktree",
            "remove",
            "--force",
            workspace.path.to_string_lossy().as_ref(),
        ],
    );
    let _ = git(
        root,
        &[
            "branch",
            "-D",
            workspace
                .branch
                .as_deref()
                .ok_or("worktree branch is missing")?,
        ],
    );
    Ok(())
}

fn git(cwd: &Path, args: &[&str]) -> Result<(), String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .map_err(|e| format!("run git: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_owned())
    }
}
fn git_output(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .map_err(|e| format!("run git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_owned())
    }
}
fn git_success(cwd: &Path, args: &[&str]) -> Result<bool, String> {
    Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .map(|output| output.status.success())
        .map_err(|e| format!("run git: {e}"))
}
fn emit(app: &AppHandle, state: &AppState) -> Result<(), String> {
    app.emit("app-state://changed", state)
        .map_err(|e| format!("broadcast workspace state: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_foreign_and_primary_workspaces() {
        let root = Workspace {
            id: "/repo".into(),
            path: "/repo".into(),
            name: None,
            root_workspace_id: None,
            branch: None,
        };
        let state = AppState {
            workspaces: vec![root.clone()],
            ..AppState::default()
        };
        assert!(validate_owned(&state, &root).is_err());
        let foreign = Workspace {
            id: "/tmp/wt".into(),
            path: "/tmp/wt".into(),
            name: None,
            root_workspace_id: Some(root.id),
            branch: Some("feature/x".into()),
        };
        assert!(validate_owned(&state, &foreign).is_err());
    }
}
