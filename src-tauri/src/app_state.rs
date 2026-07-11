use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

const SCHEMA_VERSION: u64 = 1;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AppState {
    pub schema_version: u64,
    pub workspaces: Vec<Workspace>,
    pub selected_workspace: Option<String>,
    pub preferences: Preferences,
    pub windows: BTreeMap<String, WindowProjection>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub path: PathBuf,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Preferences {
    pub theme: String,
    pub terminal_shell: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WindowProjection {
    pub workspace_id: Option<String>,
    pub active_thread_id: Option<String>,
    pub session_file: Option<String>,
    pub draft: String,
    pub run_status: String,
    pub workspace_views: BTreeMap<String, WorkspaceView>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WorkspaceView {
    pub active_thread_id: Option<String>,
    pub session_file: Option<String>,
    pub draft: String,
    pub drafts: BTreeMap<String, String>,
    pub run_status: String,
    pub revision: u64,
}

impl AppState {
    pub fn set_workspace_view(
        &mut self,
        window: &str,
        workspace: String,
        projection: WorkspaceView,
    ) {
        let current = self
            .windows
            .entry(window.into())
            .or_default()
            .workspace_views
            .entry(workspace)
            .or_default();
        if projection.revision >= current.revision {
            *current = projection;
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub enum LoadStatus {
    New,
    Loaded,
    RecoveredFromBackup,
    Migrated { from: u64 },
}

pub struct AppStateStore {
    path: PathBuf,
    state: Mutex<AppState>,
    pub load_status: LoadStatus,
}

impl AppStateStore {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        let (mut state, load_status) = load(&path)?;
        if load_status == LoadStatus::New {
            state.schema_version = SCHEMA_VERSION;
        }
        if matches!(
            load_status,
            LoadStatus::Migrated { .. } | LoadStatus::RecoveredFromBackup
        ) {
            write_atomic(&path, &state)?;
        }
        Ok(Self {
            path,
            state: Mutex::new(state),
            load_status,
        })
    }

    pub fn snapshot(&self) -> AppState {
        self.state.lock().expect("app state lock poisoned").clone()
    }

    pub fn update(&self, change: impl FnOnce(&mut AppState)) -> Result<AppState, String> {
        let mut state = self.state.lock().map_err(|_| "app state lock poisoned")?;
        let mut next = state.clone();
        change(&mut next);
        next.schema_version = SCHEMA_VERSION;
        write_atomic(&self.path, &next)?;
        *state = next.clone();
        Ok(next)
    }
}

fn load(path: &Path) -> Result<(AppState, LoadStatus), String> {
    if !path.exists() {
        return Ok((AppState::default(), LoadStatus::New));
    }

    match decode(path) {
        Ok(result) => Ok(result),
        Err(primary_error) => {
            if primary_error.starts_with("unsupported app-state schema") {
                return Err(primary_error);
            }
            let backup = backup_path(path);
            decode(&backup)
                .map(|(state, _)| (state, LoadStatus::RecoveredFromBackup))
                .map_err(|backup_error| {
                    format!("state and backup are unreadable: {primary_error}; {backup_error}")
                })
        }
    }
}

fn decode(path: &Path) -> Result<(AppState, LoadStatus), String> {
    let mut value: Value = serde_json::from_slice(
        &fs::read(path).map_err(|error| format!("read {}: {error}", path.display()))?,
    )
    .map_err(|error| format!("parse {}: {error}", path.display()))?;
    let version = value
        .get("schema_version")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if version > SCHEMA_VERSION {
        return Err(format!("unsupported app-state schema {version}"));
    }
    let status = if version == 0 {
        value["schema_version"] = Value::from(SCHEMA_VERSION);
        LoadStatus::Migrated { from: 0 }
    } else {
        LoadStatus::Loaded
    };
    serde_json::from_value(value)
        .map(|state| (state, status))
        .map_err(|error| format!("decode {}: {error}", path.display()))
}

fn write_atomic(path: &Path, state: &AppState) -> Result<(), String> {
    let parent = path.parent().ok_or("app-state path has no parent")?;
    fs::create_dir_all(parent).map_err(|error| format!("create state directory: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let backup = backup_path(path);
    let bytes = serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?;
    write_synced(&temporary, &bytes, "state")?;
    if path.exists() && decode(path).is_ok() {
        let backup_temporary = backup.with_extension("bak.tmp");
        let primary = fs::read(path).map_err(|error| format!("read app state backup: {error}"))?;
        write_synced(&backup_temporary, &primary, "backup")?;
        fs::rename(&backup_temporary, &backup)
            .map_err(|error| format!("replace app state backup: {error}"))?;
    }
    fs::rename(&temporary, path).map_err(|error| format!("replace app state: {error}"))?;
    Ok(())
}

fn write_synced(path: &Path, bytes: &[u8], label: &str) -> Result<(), String> {
    let mut file = File::create(path).map_err(|error| format!("create {label} temp: {error}"))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("write {label} temp: {error}"))
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_rust_owned_window_projections() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("app-state.json");
        let store = AppStateStore::open(path.clone()).unwrap();
        store
            .update(|state| {
                state.preferences.theme = "dark".into();
                state.windows.insert(
                    "main".into(),
                    WindowProjection {
                        workspace_id: Some("workspace-1".into()),
                        active_thread_id: None,
                        ..WindowProjection::default()
                    },
                );
            })
            .unwrap();

        let reopened = AppStateStore::open(path).unwrap();
        assert_eq!(reopened.snapshot().preferences.theme, "dark");
        assert_eq!(
            reopened.snapshot().windows["main"].workspace_id.as_deref(),
            Some("workspace-1")
        );
    }

    #[test]
    fn stale_workspace_projection_cannot_replace_a_newer_draft() {
        let temp = tempfile::tempdir().unwrap();
        let store = AppStateStore::open(temp.path().join("app-state.json")).unwrap();
        store
            .update(|state| {
                state.set_workspace_view(
                    "main",
                    "workspace-1".into(),
                    WorkspaceView {
                        draft: "new".into(),
                        revision: 2,
                        ..WorkspaceView::default()
                    },
                )
            })
            .unwrap();
        store
            .update(|state| {
                state.set_workspace_view(
                    "main",
                    "workspace-1".into(),
                    WorkspaceView {
                        draft: "stale".into(),
                        revision: 1,
                        ..WorkspaceView::default()
                    },
                )
            })
            .unwrap();

        assert_eq!(
            store.snapshot().windows["main"].workspace_views["workspace-1"].draft,
            "new"
        );
    }

    #[test]
    fn workspace_and_thread_drafts_survive_restart_without_bleeding() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("app-state.json");
        let store = AppStateStore::open(path.clone()).unwrap();
        store
            .update(|state| {
                state.set_workspace_view(
                    "main",
                    "one".into(),
                    WorkspaceView {
                        active_thread_id: Some("thread-a".into()),
                        drafts: BTreeMap::from([("thread-a".into(), "draft a".into())]),
                        revision: 1,
                        ..WorkspaceView::default()
                    },
                );
                state.set_workspace_view(
                    "main",
                    "two".into(),
                    WorkspaceView {
                        drafts: BTreeMap::from([("new".into(), "draft b".into())]),
                        revision: 1,
                        ..WorkspaceView::default()
                    },
                );
            })
            .unwrap();

        let reopened = AppStateStore::open(path).unwrap().snapshot();
        assert_eq!(
            reopened.windows["main"].workspace_views["one"].drafts["thread-a"],
            "draft a"
        );
        assert_eq!(
            reopened.windows["main"].workspace_views["two"].drafts["new"],
            "draft b"
        );
    }

    #[test]
    fn recovers_backup_after_primary_corruption() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("app-state.json");
        let store = AppStateStore::open(path.clone()).unwrap();
        store
            .update(|state| state.preferences.theme = "light".into())
            .unwrap();
        store
            .update(|state| state.preferences.theme = "dark".into())
            .unwrap();
        fs::write(&path, b"not json").unwrap();

        let recovered = AppStateStore::open(path).unwrap();
        assert_eq!(recovered.load_status, LoadStatus::RecoveredFromBackup);
        assert_eq!(recovered.snapshot().preferences.theme, "light");
        assert_eq!(
            decode(&recovered.path).unwrap().0.preferences.theme,
            "light"
        );
    }

    #[test]
    fn migrates_v0_and_rejects_future_schemas() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old.json");
        fs::write(&old, br#"{"preferences":{"theme":"light"}}"#).unwrap();
        let migrated = AppStateStore::open(old).unwrap();
        assert_eq!(migrated.load_status, LoadStatus::Migrated { from: 0 });
        assert_eq!(migrated.snapshot().schema_version, SCHEMA_VERSION);

        let future = temp.path().join("future.json");
        fs::write(&future, br#"{"schema_version":2}"#).unwrap();
        assert!(matches!(
            AppStateStore::open(future),
            Err(error) if error.contains("unsupported app-state schema 2")
        ));
    }

    #[test]
    fn failed_write_does_not_change_the_authoritative_snapshot() {
        let temp = tempfile::tempdir().unwrap();
        let blocked = temp.path().join("blocked");
        fs::write(&blocked, b"not a directory").unwrap();
        let mut store = AppStateStore::open(temp.path().join("app-state.json")).unwrap();
        store.path = blocked.join("app-state.json");

        assert!(store
            .update(|state| state.preferences.theme = "dark".into())
            .is_err());
        assert_eq!(store.snapshot().preferences.theme, "");
    }

    #[test]
    fn failed_backup_replacement_preserves_primary_and_previous_backup() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("app-state.json");
        let store = AppStateStore::open(path.clone()).unwrap();
        store
            .update(|state| state.preferences.theme = "light".into())
            .unwrap();
        store
            .update(|state| state.preferences.theme = "dark".into())
            .unwrap();
        let backup = backup_path(&path);
        let original_primary = fs::read(&path).unwrap();
        let original_backup = fs::read(&backup).unwrap();
        fs::create_dir(backup.with_extension("bak.tmp")).unwrap();

        assert!(store
            .update(|state| state.preferences.theme = "system".into())
            .is_err());
        assert_eq!(fs::read(&path).unwrap(), original_primary);
        assert_eq!(fs::read(&backup).unwrap(), original_backup);
        assert_eq!(store.snapshot().preferences.theme, "dark");
    }
}
