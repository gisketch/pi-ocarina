use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const MAX_ATTACHMENT_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub path: PathBuf,
    pub name: String,
    pub size: u64,
    pub kind: &'static str,
}

#[tauri::command]
pub fn prepare_attachments(paths: Vec<PathBuf>) -> Result<Vec<Attachment>, String> {
    if paths.len() > 20 {
        return Err("Select at most 20 attachments".into());
    }
    paths.into_iter().map(validate).collect()
}

#[tauri::command]
pub fn import_attachment(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> Result<Attachment, String> {
    if bytes.len() as u64 > MAX_ATTACHMENT_BYTES {
        return Err("Attachment exceeds 25 MB".into());
    }
    let safe_name = PathBuf::from(&name)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Attachment name is invalid")?;
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("attachments");
    fs::create_dir_all(&directory).map_err(|error| format!("create attachment cache: {error}"))?;
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let path = directory.join(format!("{id}-{safe_name}"));
    let mut file = File::options()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| format!("create attachment: {error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("write attachment: {error}"))?;
    validate(path)
}

fn validate(path: PathBuf) -> Result<Attachment, String> {
    let path = path
        .canonicalize()
        .map_err(|_| "Attachment does not exist")?;
    let metadata = fs::metadata(&path).map_err(|_| "Attachment cannot be read")?;
    if !metadata.is_file() {
        return Err("Attachments must be files".into());
    }
    if metadata.len() > MAX_ATTACHMENT_BYTES {
        return Err("Attachment exceeds 25 MB".into());
    }
    File::open(&path).map_err(|_| "Attachment cannot be read")?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Attachment name is invalid")?
        .to_owned();
    let kind = match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png" | "jpg" | "jpeg" | "gif" | "webp") => "image",
        _ => "file",
    };
    Ok(Attachment {
        path,
        name,
        size: metadata.len(),
        kind,
    })
}

use std::fs::File;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn accepts_files_and_rejects_directories() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("photo.png");
        File::create(&file).unwrap().write_all(b"png").unwrap();
        let result = prepare_attachments(vec![file]).unwrap();
        assert_eq!(result[0].kind, "image");
        assert!(prepare_attachments(vec![root.path().to_owned()]).is_err());
    }
}
