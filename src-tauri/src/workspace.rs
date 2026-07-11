use crate::app_state::{AppState, AppStateStore, Workspace};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn add_workspace(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    path: PathBuf,
) -> Result<AppState, String> {
    let path = canonical_workspace_path(&path)?;
    let id = path.to_string_lossy().into_owned();
    let snapshot = store.update(|state| {
        if !state.workspaces.iter().any(|workspace| workspace.id == id) {
            state.workspaces.push(Workspace {
                id: id.clone(),
                path: path.clone(),
                root_workspace_id: None,
                branch: None,
            });
        }
        state.selected_workspace = Some(id);
    })?;
    app.emit("app-state://changed", &snapshot)
        .map_err(|error| format!("broadcast workspace state: {error}"))?;
    Ok(snapshot)
}

#[tauri::command]
pub fn select_workspace(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    workspace_id: String,
) -> Result<AppState, String> {
    if !store
        .snapshot()
        .workspaces
        .iter()
        .any(|workspace| workspace.id == workspace_id)
    {
        return Err("workspace is not in the catalog".into());
    }
    let snapshot = store.update(|state| state.selected_workspace = Some(workspace_id))?;
    app.emit("app-state://changed", &snapshot)
        .map_err(|error| format!("broadcast workspace state: {error}"))?;
    Ok(snapshot)
}

fn canonical_workspace_path(path: &Path) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("open workspace {}: {error}", path.display()))?;
    if !canonical.is_dir() {
        return Err(format!("workspace is not a folder: {}", path.display()));
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_workspace_identity_deduplicates_equivalent_paths() {
        let root = tempfile::tempdir().unwrap();
        let nested = root.path().join("nested");
        std::fs::create_dir(&nested).unwrap();
        assert_eq!(
            canonical_workspace_path(&nested).unwrap(),
            canonical_workspace_path(&nested.join("..").join("nested")).unwrap()
        );
        assert!(canonical_workspace_path(&root.path().join("missing")).is_err());
    }
}
