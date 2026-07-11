use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub const PROTOCOL_VERSION: u8 = 1;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostEvent {
    pub version: u8,
    pub request_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub payload: serde_json::Value,
}

impl HostEvent {
    pub fn parse(line: &str) -> Result<Self, String> {
        let event: Self = serde_json::from_str(line)
            .map_err(|error| format!("Malformed agent-host output: {error}"))?;
        if event.version != PROTOCOL_VERSION || event.request_id.is_empty() {
            return Err("Unsupported or invalid agent-host protocol event".into());
        }
        Ok(event)
    }
}

pub struct AgentHost {
    child: Child,
    stdin: ChildStdin,
    pending: Arc<Mutex<HashSet<String>>>,
}

impl AgentHost {
    pub fn start(app: AppHandle, node: &Path, script: &Path) -> io::Result<Self> {
        let mut child = Command::new(node)
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("agent host stdin unavailable"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("agent host stdout unavailable"))?;
        let pending = Arc::new(Mutex::new(HashSet::new()));
        let reader_pending = Arc::clone(&pending);
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let event = line
                    .map_err(|error| format!("Agent host output failed: {error}"))
                    .and_then(|line| HostEvent::parse(&line));
                match event {
                    Ok(event) => {
                        if matches!(event.kind.as_str(), "completed" | "cancelled" | "failed") {
                            reader_pending.lock().unwrap().remove(&event.request_id);
                        }
                        let _ = app.emit("agent-host-event", event);
                    }
                    Err(message) => fail_pending(&app, &reader_pending, &message),
                }
            }
            fail_pending(&app, &reader_pending, "Agent host stopped unexpectedly");
        });
        Ok(Self {
            child,
            stdin,
            pending,
        })
    }

    pub fn send(&mut self, request: serde_json::Value) -> Result<(), String> {
        let version = request.get("version").and_then(|value| value.as_u64());
        let request_id = request.get("requestId").and_then(|value| value.as_str());
        if version != Some(PROTOCOL_VERSION.into()) || request_id.map_or(true, str::is_empty) {
            return Err("Unsupported or invalid agent-host protocol request".into());
        }
        let request_id = request_id.unwrap().to_owned();
        self.pending.lock().unwrap().insert(request_id.clone());
        if let Err(error) = writeln!(self.stdin, "{request}") {
            self.pending.lock().unwrap().remove(&request_id);
            return Err(format!("Agent host write failed: {error}"));
        }
        self.stdin
            .flush()
            .map_err(|error| format!("Agent host flush failed: {error}"))
    }

    pub fn shutdown(&mut self) -> io::Result<()> {
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
            self.child.wait()?;
        }
        Ok(())
    }
}

fn fail_pending(app: &AppHandle, pending: &Arc<Mutex<HashSet<String>>>, message: &str) {
    for request_id in pending.lock().unwrap().drain() {
        let _ = app.emit(
            "agent-host-event",
            HostEvent {
                version: PROTOCOL_VERSION,
                request_id,
                kind: "failed".into(),
                payload: serde_json::json!({ "message": message }),
            },
        );
    }
}

#[derive(Default)]
pub struct AgentHostState(Mutex<Option<AgentHost>>);

#[tauri::command]
pub fn start_agent_host(app: AppHandle, state: State<'_, AgentHostState>) -> Result<(), String> {
    let resources = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let source_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let bundled_node = resources.join("node_modules/node/bin/node");
    let node = if bundled_node.exists() {
        bundled_node
    } else {
        source_root.join("node_modules/node/bin/node")
    };
    let bundled_script = resources.join("agent-host/src/host.js");
    let script = if bundled_script.exists() {
        bundled_script
    } else {
        source_root.join("agent-host/src/host.js")
    };
    let mut host = state.0.lock().unwrap();
    if let Some(active) = host.as_mut() {
        active.shutdown().map_err(|error| error.to_string())?;
    }
    *host = Some(AgentHost::start(app, &node, &script).map_err(|error| {
        format!(
            "Agent host failed to start using {}: {error}",
            node.display()
        )
    })?);
    Ok(())
}

#[tauri::command]
pub fn send_agent_request(
    state: State<'_, AgentHostState>,
    request: serde_json::Value,
) -> Result<(), String> {
    state
        .0
        .lock()
        .unwrap()
        .as_mut()
        .ok_or_else(|| "Agent host is not running".to_owned())?
        .send(request)
}

impl Drop for AgentHost {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_host_events_at_the_rust_boundary() {
        let event =
            HostEvent::parse(r#"{"version":1,"requestId":"a","type":"completed","payload":{}}"#)
                .unwrap();
        assert_eq!(event.request_id, "a");
        assert!(HostEvent::parse("not json")
            .unwrap_err()
            .contains("Malformed"));
        assert!(HostEvent::parse(
            r#"{"version":2,"requestId":"a","type":"completed","payload":{}}"#
        )
        .is_err());
    }
}
