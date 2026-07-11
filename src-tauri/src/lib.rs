pub mod agent_host;
pub mod app_state;
pub mod workspace;

use app_state::{
    AppState, AppStateStore, LoadStatus, Preferences, WindowProjection, WorkspaceView,
};
use serde::Serialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager, State, WebviewWindow,
};

#[derive(Serialize)]
struct AppStateSnapshot {
    state: AppState,
    load_status: LoadStatus,
}

#[tauri::command]
fn app_state_snapshot(store: State<'_, AppStateStore>) -> AppStateSnapshot {
    AppStateSnapshot {
        state: store.snapshot(),
        load_status: store.load_status.clone(),
    }
}

#[tauri::command]
fn set_preferences(
    app: tauri::AppHandle,
    store: State<'_, AppStateStore>,
    preferences: Preferences,
) -> Result<AppState, String> {
    if !matches!(preferences.theme.as_str(), "system" | "light" | "dark") {
        return Err("theme must be system, light, or dark".into());
    }
    update_and_emit(&app, &store, |state| state.preferences = preferences)
}

#[tauri::command]
fn set_window_projection(
    app: tauri::AppHandle,
    window: WebviewWindow,
    store: State<'_, AppStateStore>,
    projection: WindowProjection,
) -> Result<AppState, String> {
    update_and_emit(&app, &store, |state| {
        state.windows.insert(window.label().into(), projection);
    })
}

#[tauri::command]
fn set_workspace_projection(
    app: tauri::AppHandle,
    window: WebviewWindow,
    store: State<'_, AppStateStore>,
    workspace_id: String,
    projection: WorkspaceView,
) -> Result<AppState, String> {
    if !store
        .snapshot()
        .workspaces
        .iter()
        .any(|workspace| workspace.id == workspace_id)
    {
        return Err("workspace is not in the catalog".into());
    }
    update_and_emit(&app, &store, |state| {
        state.set_workspace_view(window.label(), workspace_id, projection);
    })
}

fn update_and_emit(
    app: &tauri::AppHandle,
    store: &AppStateStore,
    change: impl FnOnce(&mut AppState),
) -> Result<AppState, String> {
    let snapshot = store.update(change)?;
    app.emit("app-state://changed", &snapshot)
        .map_err(|error| format!("broadcast app state: {error}"))?;
    Ok(snapshot)
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(agent_host::AgentHostState::default())
        .setup(|app| {
            let state_path = app.path().app_data_dir()?.join("app-state.json");
            let store = AppStateStore::open(state_path).map_err(std::io::Error::other)?;
            if store.load_status == LoadStatus::RecoveredFromBackup {
                eprintln!("recovered app state from backup");
            }
            app.manage(store);
            let open_folder = MenuItemBuilder::with_id("open-folder", "Open Folder…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let app_menu = SubmenuBuilder::new(app, "Pi Ocarina").quit().build()?;
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&open_folder)
                .build()?;
            app.set_menu(
                MenuBuilder::new(app)
                    .items(&[&app_menu, &file_menu])
                    .build()?,
            )?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "open-folder" {
                let _ = app.emit("workspace://open-picker", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            agent_host::start_agent_host,
            agent_host::send_agent_request,
            app_state_snapshot,
            set_preferences,
            set_window_projection,
            set_workspace_projection,
            workspace::add_workspace,
            workspace::select_workspace
        ]);

    #[cfg(debug_assertions)]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Pi Ocarina");
}
