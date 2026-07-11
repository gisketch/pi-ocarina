use crate::app_state::{AppState, AppStateStore, ModelPreference};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSelection {
    scope: String,
    model: Option<ModelPreference>,
}

#[tauri::command]
pub fn model_selection(
    store: State<'_, AppStateStore>,
    workspace_id: String,
) -> Result<ModelSelection, String> {
    resolve(&store.snapshot(), &workspace_id)
}

#[tauri::command]
pub fn set_model_scope(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    workspace_id: String,
    scope: String,
) -> Result<ModelSelection, String> {
    if !matches!(scope.as_str(), "global" | "repository") {
        return Err("model scope must be global or repository".into());
    }
    let root_id = root_id(&store.snapshot(), &workspace_id)?;
    let snapshot = store.update(|state| {
        if scope == "repository" && !state.preferences.repository_models.contains_key(&root_id) {
            if let Some(model) = state.preferences.global_model.clone() {
                state
                    .preferences
                    .repository_models
                    .insert(root_id.clone(), model);
            }
        }
        state.preferences.model_scope = scope;
    })?;
    app.emit("app-state://changed", &snapshot)
        .map_err(|e| e.to_string())?;
    resolve(&snapshot, &workspace_id)
}

#[tauri::command]
pub fn set_model_preference(
    app: AppHandle,
    store: State<'_, AppStateStore>,
    workspace_id: String,
    model: ModelPreference,
) -> Result<ModelSelection, String> {
    if model.provider.trim().is_empty() || model.id.trim().is_empty() {
        return Err("provider and model are required".into());
    }
    let root_id = root_id(&store.snapshot(), &workspace_id)?;
    let snapshot = store.update(|state| {
        if state.preferences.model_scope == "repository" {
            state.preferences.repository_models.insert(root_id, model);
        } else {
            state.preferences.global_model = Some(model);
        }
    })?;
    app.emit("app-state://changed", &snapshot)
        .map_err(|e| e.to_string())?;
    resolve(&snapshot, &workspace_id)
}

fn resolve(state: &AppState, workspace_id: &str) -> Result<ModelSelection, String> {
    let root = root_id(state, workspace_id)?;
    let model = if state.preferences.model_scope == "repository" {
        state.preferences.repository_models.get(&root).cloned()
    } else {
        state.preferences.global_model.clone()
    };
    Ok(ModelSelection {
        scope: state.preferences.model_scope.clone(),
        model,
    })
}

fn root_id(state: &AppState, workspace_id: &str) -> Result<String, String> {
    let workspace = state
        .workspaces
        .iter()
        .find(|item| item.id == workspace_id)
        .ok_or("workspace is not in the catalog")?;
    if let Some(root) = &workspace.root_workspace_id {
        if !state.workspaces.iter().any(|item| &item.id == root) {
            return Err("worktree root is not in the catalog".into());
        }
        Ok(root.clone())
    } else {
        Ok(workspace.id.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::Workspace;
    use std::path::PathBuf;

    fn state() -> AppState {
        AppState {
            workspaces: vec![
                Workspace {
                    id: "root".into(),
                    path: PathBuf::from("/repo"),
                    name: None,
                    root_workspace_id: None,
                    branch: None,
                },
                Workspace {
                    id: "tree".into(),
                    path: PathBuf::from("/tree"),
                    name: None,
                    root_workspace_id: Some("root".into()),
                    branch: Some("feature".into()),
                },
            ],
            ..AppState::default()
        }
    }

    #[test]
    fn resolves_global_and_root_repository_models_for_worktrees() {
        let mut state = state();
        state.preferences.global_model = Some(ModelPreference {
            provider: "global".into(),
            id: "one".into(),
        });
        assert_eq!(
            resolve(&state, "tree").unwrap().model.unwrap().provider,
            "global"
        );
        state.preferences.model_scope = "repository".into();
        state.preferences.repository_models.insert(
            "root".into(),
            ModelPreference {
                provider: "repo".into(),
                id: "two".into(),
            },
        );
        assert_eq!(
            resolve(&state, "root").unwrap().model,
            resolve(&state, "tree").unwrap().model
        );
    }
}
