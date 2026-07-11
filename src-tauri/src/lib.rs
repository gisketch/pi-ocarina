pub mod app_state;

use app_state::{AppState, AppStateStore, LoadStatus, Preferences, WindowProjection};
use serde::Serialize;
use tauri::{Emitter, Manager, State, WebviewWindow};

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
        .setup(|app| {
            let state_path = app.path().app_data_dir()?.join("app-state.json");
            let store = AppStateStore::open(state_path).map_err(std::io::Error::other)?;
            if store.load_status == LoadStatus::RecoveredFromBackup {
                eprintln!("recovered app state from backup");
            }
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_state_snapshot,
            set_preferences,
            set_window_projection
        ]);

    #[cfg(debug_assertions)]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Pi Ocarina");
}
