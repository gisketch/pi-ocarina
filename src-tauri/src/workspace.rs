use crate::app_state::{AppState, AppStateStore, Workspace};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn add_workspace(
    app: AppHandle,
    window: WebviewWindow,
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
                name: None,
                root_workspace_id: None,
                branch: None,
            });
        }
        state
            .windows
            .entry(window.label().into())
            .or_default()
            .workspace_id = Some(id);
    })?;
    app.emit("app-state://changed", &snapshot)
        .map_err(|error| format!("broadcast workspace state: {error}"))?;
    Ok(snapshot)
}

#[tauri::command]
pub fn rename_workspace(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    workspace_id: String,
    name: String,
) -> Result<AppState, String> {
    let snapshot = store.try_update(|state| rename(state, &workspace_id, &name))?;
    emit(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn reorder_workspace(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    workspace_id: String,
    new_index: usize,
) -> Result<AppState, String> {
    let snapshot = store.try_update(|state| reorder(state, &workspace_id, new_index))?;
    emit(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn remove_workspace(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    workspace_id: String,
) -> Result<AppState, String> {
    let snapshot = store.try_update(|state| remove(state, &workspace_id))?;
    emit(&app, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn reveal_workspace(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    workspace_id: String,
) -> Result<(), String> {
    let workspace = store
        .snapshot()
        .workspaces
        .into_iter()
        .find(|workspace| workspace.id == workspace_id)
        .ok_or("workspace is not in the catalog")?;
    let path = canonical_workspace_path(&workspace.path)?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| format!("reveal workspace: {error}"))
}

#[tauri::command]
pub fn reveal_skill(app: AppHandle, workspace: PathBuf, path: PathBuf) -> Result<(), String> {
    let path = path
        .canonicalize()
        .map_err(|_| "skill path is unavailable")?;
    let project_root = workspace
        .canonicalize()
        .map_err(|_| "workspace is unavailable")?
        .join(".pi/skills");
    let global_root = std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join(".pi/agent/skills"));
    if !path.starts_with(project_root) && !global_root.is_some_and(|root| path.starts_with(root)) {
        return Err("skill path is outside Pi skill roots".into());
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| format!("reveal skill: {error}"))
}

fn rename(state: &mut AppState, workspace_id: &str, name: &str) -> Result<(), String> {
    let workspace = state
        .workspaces
        .iter_mut()
        .find(|workspace| workspace.id == workspace_id)
        .ok_or("workspace is not in the catalog")?;
    let name = name.trim();
    workspace.name = (!name.is_empty()).then(|| name.to_string());
    Ok(())
}

fn reorder(state: &mut AppState, workspace_id: &str, new_index: usize) -> Result<(), String> {
    let old_index = state
        .workspaces
        .iter()
        .position(|workspace| workspace.id == workspace_id)
        .ok_or("workspace is not in the catalog")?;
    if new_index >= state.workspaces.len() {
        return Err("workspace position is out of range".into());
    }
    let workspace = state.workspaces.remove(old_index);
    state.workspaces.insert(new_index, workspace);
    Ok(())
}

fn remove(state: &mut AppState, workspace_id: &str) -> Result<(), String> {
    let index = state
        .workspaces
        .iter()
        .position(|workspace| workspace.id == workspace_id)
        .ok_or("workspace is not in the catalog")?;
    state.workspaces.remove(index);
    let fallback = state
        .workspaces
        .get(index.min(state.workspaces.len().saturating_sub(1)))
        .map(|workspace| workspace.id.clone());
    if state.selected_workspace.as_deref() == Some(workspace_id) {
        state.selected_workspace = fallback.clone();
    }
    for window in state.windows.values_mut() {
        if window.workspace_id.as_deref() == Some(workspace_id) {
            window.workspace_id = fallback.clone();
        }
    }
    Ok(())
}

fn emit(app: &AppHandle, snapshot: &AppState) -> Result<(), String> {
    app.emit("app-state://changed", snapshot)
        .map_err(|error| format!("broadcast workspace state: {error}"))
}

#[tauri::command]
pub fn select_workspace(
    app: AppHandle,
    window: WebviewWindow,
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
    let snapshot = store.update(|state| {
        state
            .windows
            .entry(window.label().into())
            .or_default()
            .workspace_id = Some(workspace_id);
    })?;
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

    fn workspace(id: &str) -> Workspace {
        Workspace {
            id: id.into(),
            path: PathBuf::from(format!("/{id}")),
            name: None,
            root_workspace_id: None,
            branch: None,
        }
    }

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

    #[test]
    fn management_persists_order_names_and_safe_fallback_without_erasing_views() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("app-state.json");
        let store = AppStateStore::open(path.clone()).unwrap();
        store
            .update(|state| {
                state.workspaces = vec![workspace("one"), workspace("two")];
                state.selected_workspace = Some("one".into());
                state
                    .windows
                    .entry("main".into())
                    .or_default()
                    .workspace_views
                    .insert(
                        "one".into(),
                        crate::app_state::WorkspaceView {
                            draft: "keep me".into(),
                            ..Default::default()
                        },
                    );
                rename(state, "two", "  Second  ").unwrap();
                reorder(state, "two", 0).unwrap();
                remove(state, "one").unwrap();
            })
            .unwrap();

        let reopened = AppStateStore::open(path).unwrap().snapshot();
        assert_eq!(reopened.workspaces[0].name.as_deref(), Some("Second"));
        assert_eq!(reopened.selected_workspace.as_deref(), Some("two"));
        assert_eq!(
            reopened.windows["main"].workspace_views["one"].draft,
            "keep me"
        );

        let mut empty = AppState {
            workspaces: vec![workspace("two")],
            selected_workspace: Some("two".into()),
            ..Default::default()
        };
        remove(&mut empty, "two").unwrap();
        assert!(empty.workspaces.is_empty());
        assert_eq!(empty.selected_workspace, None);
    }
}
