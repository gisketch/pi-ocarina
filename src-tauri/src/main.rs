#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_host;

fn main() {
    let builder = tauri::Builder::default()
        .manage(agent_host::AgentHostState::default())
        .invoke_handler(tauri::generate_handler![
            agent_host::start_agent_host,
            agent_host::send_agent_request
        ]);

    #[cfg(debug_assertions)]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Pi Ocarina");
}
