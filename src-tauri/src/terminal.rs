use crate::app_state::AppStateStore;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, State};

struct Terminal {
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
}

#[derive(Default)]
pub struct TerminalState {
    next_id: AtomicU64,
    terminals: Mutex<HashMap<String, Terminal>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalEvent {
    terminal_id: String,
    data: Option<String>,
    message: Option<String>,
}

fn validate_shell(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("shell must be an absolute path".into());
    }
    let metadata = path
        .metadata()
        .map_err(|error| format!("invalid shell: {error}"))?;
    if !metadata.is_file() {
        return Err("shell must be an executable file".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 == 0 {
            return Err("shell is not executable".into());
        }
    }
    Ok(path.to_path_buf())
}

#[tauri::command]
pub fn set_terminal_shell(
    app: tauri::AppHandle,
    store: State<'_, AppStateStore>,
    shell: String,
) -> Result<(), String> {
    let shell = validate_shell(Path::new(&shell))?;
    store.update(|state| state.preferences.terminal_shell = shell.to_string_lossy().into())?;
    app.emit("app-state://changed", store.snapshot())
        .map_err(|error| format!("broadcast app state: {error}"))
}

#[tauri::command]
pub fn open_terminal(
    app: tauri::AppHandle,
    store: State<'_, AppStateStore>,
    terminals: State<'_, TerminalState>,
    workspace_id: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let snapshot = store.snapshot();
    let workspace = snapshot
        .workspaces
        .iter()
        .find(|item| item.id == workspace_id)
        .ok_or("workspace is not in the catalog")?;
    let default_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let shell = if snapshot.preferences.terminal_shell.is_empty() {
        default_shell
    } else {
        snapshot.preferences.terminal_shell
    };
    let shell = validate_shell(Path::new(&shell))?;
    let pty = native_pty_system()
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("open terminal: {error}"))?;
    let mut command = CommandBuilder::new(shell);
    command.cwd(&workspace.path);
    let child = pty
        .slave
        .spawn_command(command)
        .map_err(|error| format!("start shell: {error}"))?;
    let writer = pty
        .master
        .take_writer()
        .map_err(|error| format!("open terminal input: {error}"))?;
    let mut reader = pty
        .master
        .try_clone_reader()
        .map_err(|error| format!("open terminal output: {error}"))?;
    let id = format!(
        "terminal-{}",
        terminals.next_id.fetch_add(1, Ordering::Relaxed)
    );
    terminals
        .terminals
        .lock()
        .map_err(|_| "terminal lock poisoned")?
        .insert(
            id.clone(),
            Terminal {
                writer,
                child,
                master: pty.master,
            },
        );

    let terminal_id = id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match std::io::Read::read(&mut reader, &mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let _ = app.emit(
                        "terminal://output",
                        TerminalEvent {
                            terminal_id: terminal_id.clone(),
                            data: Some(String::from_utf8_lossy(&buffer[..count]).into()),
                            message: None,
                        },
                    );
                }
                Err(error) => {
                    let _ = app.emit(
                        "terminal://error",
                        TerminalEvent {
                            terminal_id: terminal_id.clone(),
                            data: None,
                            message: Some(error.to_string()),
                        },
                    );
                    break;
                }
            }
        }
        let _ = app.emit(
            "terminal://closed",
            TerminalEvent {
                terminal_id,
                data: None,
                message: None,
            },
        );
    });
    Ok(id)
}

#[tauri::command]
pub fn write_terminal(
    terminals: State<'_, TerminalState>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    let mut terminals = terminals
        .terminals
        .lock()
        .map_err(|_| "terminal lock poisoned")?;
    let terminal = terminals
        .get_mut(&terminal_id)
        .ok_or("terminal is not running")?;
    terminal
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| terminal.writer.flush())
        .map_err(|error| format!("write terminal: {error}"))
}

#[tauri::command]
pub fn resize_terminal(
    terminals: State<'_, TerminalState>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let terminals = terminals
        .terminals
        .lock()
        .map_err(|_| "terminal lock poisoned")?;
    let terminal = terminals
        .get(&terminal_id)
        .ok_or("terminal is not running")?;
    terminal
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("resize terminal: {error}"))
}

#[tauri::command]
pub fn close_terminal(
    terminals: State<'_, TerminalState>,
    terminal_id: String,
) -> Result<(), String> {
    let mut terminal = terminals
        .terminals
        .lock()
        .map_err(|_| "terminal lock poisoned")?
        .remove(&terminal_id)
        .ok_or("terminal is not running")?;
    terminal
        .child
        .kill()
        .map_err(|error| format!("stop terminal: {error}"))
}

impl Drop for TerminalState {
    fn drop(&mut self) {
        if let Ok(terminals) = self.terminals.get_mut() {
            for terminal in terminals.values_mut() {
                let _ = terminal.child.kill();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::validate_shell;
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::{Read, Write};
    use std::path::Path;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn shell_must_be_absolute_executable_file() {
        assert!(validate_shell(Path::new("zsh")).is_err());
        assert!(validate_shell(Path::new("/missing/pi-ocarina-shell")).is_err());
        assert!(validate_shell(Path::new("/bin/sh")).is_ok());
    }

    #[test]
    fn real_pty_uses_cwd_and_preserves_oversized_input() {
        let temp = tempfile::tempdir().unwrap();
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        let mut command = CommandBuilder::new("/bin/sh");
        command.args([
            "-c",
            "pwd; stty raw -echo; printf 'READY\\n'; head -c 131072 | wc -c",
        ]);
        command.cwd(temp.path());
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let (ready_tx, ready_rx) = mpsc::channel();
        let output = std::thread::spawn(move || {
            let mut output = Vec::new();
            let mut buffer = [0_u8; 1024];
            let mut ready = Some(ready_tx);
            loop {
                let count = reader.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                output.extend_from_slice(&buffer[..count]);
                if output.windows(5).any(|bytes| bytes == b"READY") {
                    if let Some(sender) = ready.take() {
                        let _ = sender.send(());
                    }
                }
            }
            String::from_utf8_lossy(&output).into_owned()
        });
        ready_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        writer.write_all(&vec![b'x'; 131_072]).unwrap();
        drop(writer);
        drop(pair.master);
        child.wait().unwrap();
        let output = output.join().unwrap().replace('\r', "");
        assert!(output.contains(temp.path().to_str().unwrap()));
        assert!(
            output.lines().any(|line| line.trim() == "131072"),
            "{output}"
        );
    }
}
