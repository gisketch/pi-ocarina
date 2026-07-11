pub mod agent_host;
pub mod app_state;
pub mod attachment;
pub mod model_scope;
pub mod review;
pub mod terminal;
pub mod workspace;
pub mod worktree;

use app_state::{
    AppState, AppStateStore, LoadStatus, Preferences, WindowProjection, WorkspaceView,
};
use serde::Serialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_opener::OpenerExt;
use url::Url;

#[derive(Serialize)]
struct AppStateSnapshot {
    state: AppState,
    load_status: LoadStatus,
}

#[derive(Serialize)]
struct AppearanceSupport {
    transparency: bool,
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
    if preferences.transparency && !cfg!(target_os = "macos") {
        return Err("window transparency is not supported on this platform".into());
    }
    update_and_emit(&app, &store, |state| {
        let terminal_shell = std::mem::take(&mut state.preferences.terminal_shell);
        state.preferences = preferences;
        state.preferences.terminal_shell = terminal_shell;
    })
}

#[tauri::command]
fn appearance_support() -> AppearanceSupport {
    AppearanceSupport {
        transparency: cfg!(target_os = "macos"),
    }
}

#[tauri::command]
fn set_panel_layout(
    app: tauri::AppHandle,
    store: State<'_, AppStateStore>,
    reviewer_width: Option<u32>,
    terminal_height: Option<u32>,
    terminal_maximized: Option<bool>,
) -> Result<AppState, String> {
    validate_panel_layout(reviewer_width, terminal_height)?;
    update_and_emit(&app, &store, |state| {
        if let Some(value) = reviewer_width {
            state.preferences.reviewer_width = value;
        }
        if let Some(value) = terminal_height {
            state.preferences.terminal_height = value;
        }
        if let Some(value) = terminal_maximized {
            state.preferences.terminal_maximized = value;
        }
    })
}

fn validate_panel_layout(
    reviewer_width: Option<u32>,
    terminal_height: Option<u32>,
) -> Result<(), String> {
    if reviewer_width.is_some_and(|value| !(320..=1200).contains(&value))
        || terminal_height.is_some_and(|value| !(160..=900).contains(&value))
    {
        Err("panel dimensions are outside usable bounds".into())
    } else {
        Ok(())
    }
}

#[tauri::command]
fn open_app_window(app: tauri::AppHandle) -> Result<String, String> {
    let label = format!("window-{}", uuid::Uuid::new_v4());
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("Pi Ocarina")
        .inner_size(1080.0, 720.0)
        .min_inner_size(720.0, 480.0)
        .build()
        .map_err(|error| format!("open app window: {error}"))?;
    Ok(label)
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

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = validate_external_url(&url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| format!("open external URL: {error}"))
}

fn validate_external_url(value: &str) -> Result<Url, String> {
    let scheme_len = if value
        .get(..7)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("http://"))
    {
        7
    } else if value
        .get(..8)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("https://"))
    {
        8
    } else {
        return Err("only HTTP and HTTPS links are supported".into());
    };
    if value[scheme_len..].starts_with('/') || value.chars().any(char::is_whitespace) {
        return Err("invalid external URL".into());
    }
    let url = Url::parse(value).map_err(|_| "invalid external URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("only HTTP and HTTPS links are supported".into());
    }
    Ok(url)
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
        .plugin(tauri_plugin_opener::init())
        .manage(agent_host::AgentHostState::default())
        .manage(terminal::TerminalState::default())
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
            appearance_support,
            set_panel_layout,
            open_app_window,
            model_scope::model_selection,
            model_scope::set_model_scope,
            model_scope::set_model_preference,
            review::search_workspace_files,
            review::repository_changes,
            review::file_diff,
            review::workspace_files,
            review::read_workspace_file,
            review::set_file_reviewed,
            set_window_projection,
            set_workspace_projection,
            attachment::prepare_attachments,
            attachment::import_attachment,
            open_external_url,
            terminal::open_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::close_terminal,
            terminal::set_terminal_shell,
            workspace::add_workspace,
            workspace::select_workspace,
            workspace::rename_workspace,
            workspace::reorder_workspace,
            workspace::remove_workspace,
            workspace::reveal_workspace,
            workspace::reveal_skill,
            worktree::create_worktree,
            worktree::register_worktree,
            worktree::rollback_worktree,
            worktree::remove_worktree,
            worktree::prune_orphaned_worktrees
        ]);

    #[cfg(debug_assertions)]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Pi Ocarina");
}

#[cfg(test)]
mod external_url_tests {
    use super::{validate_external_url, validate_panel_layout};

    #[test]
    fn accepts_only_absolute_web_urls() {
        assert!(validate_external_url("https://example.com/docs?q=1").is_ok());
        assert!(validate_external_url("http://localhost:3000").is_ok());
        for unsafe_url in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "mailto:a@b.test",
            "/relative",
            "not a url",
            "https:///missing-host",
        ] {
            assert!(
                validate_external_url(unsafe_url).is_err(),
                "accepted {unsafe_url}"
            );
        }
    }

    #[test]
    fn panel_layout_stays_usable() {
        assert!(validate_panel_layout(Some(320), Some(160)).is_ok());
        assert!(validate_panel_layout(Some(319), None).is_err());
        assert!(validate_panel_layout(None, Some(901)).is_err());
    }
}
