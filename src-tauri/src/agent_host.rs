use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[allow(dead_code)]
struct CatalogPayload {
    providers: Vec<CatalogProvider>,
    models: Vec<CatalogModel>,
    errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[allow(dead_code)]
struct CatalogProvider {
    id: String,
    name: String,
    configured: bool,
    source: Option<String>,
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[allow(dead_code)]
struct CatalogModel {
    provider: String,
    id: String,
    name: String,
    available: bool,
    input: Vec<String>,
    reasoning: bool,
}

impl HostEvent {
    pub fn parse(line: &str) -> Result<Self, String> {
        let event: Self = serde_json::from_str(line)
            .map_err(|error| format!("Malformed agent-host output: {error}"))?;
        if event.version != PROTOCOL_VERSION || event.request_id.is_empty() {
            return Err("Unsupported or invalid agent-host protocol event".into());
        }
        if event.kind == "catalog" {
            let catalog: CatalogPayload = serde_json::from_value(event.payload.clone())
                .map_err(|error| format!("Invalid agent-host catalog payload: {error}"))?;
            let _ = (
                catalog.providers.len(),
                catalog.models.len(),
                catalog.errors.len(),
            );
        }
        Ok(event)
    }
}

pub struct AgentHost {
    child: Child,
    stdin: ChildStdin,
    pending: Arc<Mutex<HashSet<String>>>,
    failed: Arc<AtomicBool>,
}

impl AgentHost {
    pub fn start(app: AppHandle, node: &Path, script: &Path) -> io::Result<Self> {
        validate_runtime(node, script)?;
        let mut child = Command::new(node)
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
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
        let failed = Arc::new(AtomicBool::new(false));
        let reader_failed = Arc::clone(&failed);
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let event = line
                    .map_err(|error| format!("Agent host output failed: {error}"))
                    .and_then(|line| HostEvent::parse(&line));
                match event {
                    Ok(event) => {
                        let terminal =
                            matches!(event.kind.as_str(), "completed" | "cancelled" | "failed");
                        let mut pending = reader_pending.lock().unwrap();
                        let known = if terminal {
                            pending.remove(&event.request_id)
                        } else {
                            pending.contains(&event.request_id)
                        };
                        drop(pending);
                        if !known {
                            continue;
                        }
                        let _ = app.emit("agent-host-event", event);
                    }
                    Err(message) => {
                        reader_failed.store(true, Ordering::Release);
                        fail_pending(&app, &reader_pending, &message);
                        break;
                    }
                }
            }
            reader_failed.store(true, Ordering::Release);
            fail_pending(&app, &reader_pending, "Agent host stopped unexpectedly");
        });
        Ok(Self {
            child,
            stdin,
            pending,
            failed,
        })
    }

    pub fn send(&mut self, request: serde_json::Value) -> Result<(), String> {
        if self.failed.load(Ordering::Acquire) {
            return Err("Agent host is unavailable and must be restarted".into());
        }
        let version = request.get("version").and_then(|value| value.as_u64());
        let request_id = request.get("requestId").and_then(|value| value.as_str());
        if version != Some(PROTOCOL_VERSION.into()) || request_id.map_or(true, str::is_empty) {
            return Err("Unsupported or invalid agent-host protocol request".into());
        }
        let request_id = request_id.unwrap().to_owned();
        if !self.pending.lock().unwrap().insert(request_id.clone()) {
            return Err(format!("Agent request is already active: {request_id}"));
        }
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

    fn is_available(&mut self) -> bool {
        !self.failed.load(Ordering::Acquire) && matches!(self.child.try_wait(), Ok(None))
    }
}

fn validate_runtime(node: &Path, script: &Path) -> io::Result<()> {
    if !node.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("bundled Node runtime is missing: {}", node.display()),
        ));
    }
    if !script.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("bundled agent host is missing: {}", script.display()),
        ));
    }
    let output = Command::new(node).arg("--version").output()?;
    let version = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() || !version.starts_with("v20.") {
        return Err(io::Error::other(format!(
            "bundled Node runtime is incompatible: expected Node 20, got {}",
            version.trim()
        )));
    }
    Ok(())
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
    let bundled_node = resources.join("agent-host/node_modules/node/bin/node");
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
        if active.is_available() {
            return Ok(());
        }
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
        assert!(HostEvent::parse(
            r#"{"version":1,"requestId":"a","type":"catalog","payload":{"providers":[],"models":[],"errors":[],"apiKey":"secret"}}"#
        )
        .is_err());
    }

    #[test]
    fn missing_bundled_runtime_fails_before_startup() {
        let root = tempfile::tempdir().unwrap();
        let error =
            validate_runtime(&root.path().join("node"), &root.path().join("host.js")).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        assert!(error
            .to_string()
            .contains("bundled Node runtime is missing"));
    }
}
