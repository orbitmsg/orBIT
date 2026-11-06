use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use crate::cache::folder::{create_media_folder_if_needed, resolve_media_folder};
use crate::media::RustMediaResult;

#[napi(object)]
pub struct RustCacheSaveResult {
    pub local_path: String,
    pub file_size: i64,
    pub resolved_dir: String,
}

pub fn open_media_db(db_path: &str) -> Result<Connection> {
    if let Some(parent) = Path::new(db_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(db_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open db {}: {}", db_path, e)))?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -4096;
         CREATE TABLE IF NOT EXISTS media_cache (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             cache_key TEXT UNIQUE NOT NULL,
             local_path TEXT NOT NULL,
             original_url TEXT NOT NULL,
             mime_type TEXT,
             file_size INTEGER,
             created_at INTEGER NOT NULL,
             last_accessed INTEGER NOT NULL,
             download_status TEXT DEFAULT 'downloaded',
             chat_id TEXT,
             message_id TEXT
         );
         CREATE INDEX IF NOT EXISTS idx_last_accessed ON media_cache(last_accessed);
         CREATE INDEX IF NOT EXISTS idx_cache_key ON media_cache(cache_key);
         CREATE INDEX IF NOT EXISTS idx_mime_type ON media_cache(mime_type);
         CREATE INDEX IF NOT EXISTS idx_chat_id ON media_cache(chat_id);"
    ).map_err(|e| Error::new(Status::GenericFailure, format!("Init media table failed: {}", e)))?;

    Ok(conn)
}

fn sanitize_filename(raw_name: &str) -> String {
    let mut clean = String::with_capacity(raw_name.len());
    for c in raw_name.chars() {
        if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\0'..='\x1f') {
            clean.push('_');
        } else {
            clean.push(c);
        }
    }
    let trimmed = clean.trim_matches(&[' ', '.'][..]).to_string();
    if trimmed.is_empty() {
        "file".to_string()
    } else {
        trimmed
    }
}

fn is_sticker(cache_key: &str, mime_type: &str, file_name: Option<&str>) -> bool {
    let lower_key = cache_key.to_lowercase();
    let lower_mime = mime_type.to_lowercase();
    let lower_name = file_name.map(|n| n.to_lowercase()).unwrap_or_default();

    lower_key.contains("sticker")
        || lower_key.ends_with(".tgs")
        || lower_key.contains("spotty")
        || lower_key.contains("utyaduck")
        || lower_mime.contains("tgsticker")
        || lower_name.contains("spotty")
        || lower_name.contains("sticker")
        || lower_name.ends_with(".tgs")
}

fn detect_extension(data: &[u8], mime: &str) -> &'static str {
    if data.len() >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
        return "jpg";
    }
    if data.len() >= 8 && &data[0..8] == b"\x89PNG\r\n\x1a\n" {
        return "png";
    }
    if data.len() >= 6 && (&data[0..6] == b"GIF87a" || &data[0..6] == b"GIF89a") {
        return "gif";
    }
    if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return "webp";
    }
    if data.len() >= 8 && (&data[4..8] == b"ftyp" || (data.len() >= 12 && &data[4..8] == b"moov")) {
        let lower = mime.to_lowercase();
        if lower.contains("audio") || lower.contains("m4a") {
            return "m4a";
        }
        return "mp4";
    }
    if data.len() >= 4 && &data[0..4] == b"OggS" {
        return "ogg";
    }
    if data.len() >= 3 && &data[0..3] == b"ID3" {
        return "mp3";
    }
    if data.len() >= 2 && data[0] == 0xFF && (data[1] & 0xE0) == 0xE0 {
        return "mp3";
    }
    if data.len() >= 4 && &data[0..4] == b"%PDF" {
        return "pdf";
    }
    if data.len() >= 4 && &data[0..4] == b"PK\x03\x04" {
        let lower = mime.to_lowercase();
        if lower.contains("wordprocessing") || lower.contains("docx") {
            return "docx";
        }
        if lower.contains("presentation") || lower.contains("pptx") {
            return "pptx";
        }
        if lower.contains("spreadsheet") || lower.contains("xlsx") {
            return "xlsx";
        }
        return "zip";
    }

    let lower = mime.to_lowercase();
    if lower.contains("jpeg") || lower.contains("jpg") {
        "jpg"
    } else if lower.contains("png") {
        "png"
    } else if lower.contains("webp") {
        "webp"
    } else if lower.contains("gif") {
        "gif"
    } else if lower.contains("mp4") {
        if lower.contains("audio") {
            "m4a"
        } else {
            "mp4"
        }
    } else if lower.contains("webm") {
        "webm"
    } else if lower.contains("ogg") || lower.contains("opus") {
        "ogg"
    } else if lower.contains("mp3") || lower.contains("mpeg") {
        "mp3"
    } else if lower.contains("pdf") {
        "pdf"
    } else {
        "bin"
    }
}

fn generate_media_filename(mime_type: &str, file_name: Option<&str>, data: &[u8]) -> String {
    let ext = detect_extension(data, mime_type);

    if let Some(name) = file_name {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            let clean = sanitize_filename(trimmed);
            if clean.contains('.') {
                return clean;
            }
            return format!("{}.{}", clean, ext);
        }
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let lower = mime_type.to_lowercase();
    let prefix = if lower.starts_with("image/") {
        "photo"
    } else if lower.starts_with("video/") {
        "video"
    } else if lower.starts_with("audio/") || lower.contains("opus") || lower.contains("ogg") || lower.contains("m4a") {
        "audio"
    } else {
        "file"
    };

    format!("{}_{}.{}", prefix, now, ext)
}

fn get_unique_filepath(dir: &Path, desired_name: &str, data: &[u8]) -> (PathBuf, String) {
    let candidate = dir.join(desired_name);
    if !candidate.exists() {
        return (candidate, desired_name.to_string());
    }

    if let Ok(meta) = std::fs::metadata(&candidate) {
        if meta.len() == data.len() as u64 {
            if let Ok(existing_bytes) = std::fs::read(&candidate) {
                if existing_bytes == data {
                    return (candidate, desired_name.to_string());
                }
            }
        }
    }

    let path_obj = Path::new(desired_name);
    let stem = path_obj.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = path_obj.extension().and_then(|s| s.to_str()).unwrap_or("");

    let mut counter = 1;
    loop {
        let name_with_counter = if ext.is_empty() {
            format!("{} ({})", stem, counter)
        } else {
            format!("{} ({}).{}", stem, counter, ext)
        };
        let next_candidate = dir.join(&name_with_counter);
        if !next_candidate.exists() {
            return (next_candidate, name_with_counter);
        }
        if let Ok(meta) = std::fs::metadata(&next_candidate) {
            if meta.len() == data.len() as u64 {
                if let Ok(existing_bytes) = std::fs::read(&next_candidate) {
                    if existing_bytes == data {
                        return (next_candidate, name_with_counter);
                    }
                }
            }
        }
        counter += 1;
    }
}

pub fn save_media_internal(
    db_path: &str,
    configured_dir: Option<&str>,
    cache_key: &str,
    data: &[u8],
    mime_type: &str,
    chat_id: Option<&str>,
    message_id: Option<&str>,
    file_name: Option<&str>,
    _local_key_hex: Option<&str>,
    base_downloads: Option<&str>,
) -> Result<RustCacheSaveResult> {
    let resolved_dir = resolve_media_folder(configured_dir, base_downloads);

    if is_sticker(cache_key, mime_type, file_name) {
        return Ok(RustCacheSaveResult {
            local_path: String::new(),
            file_size: data.len() as i64,
            resolved_dir: resolved_dir.to_string_lossy().to_string(),
        });
    }

    create_media_folder_if_needed(&resolved_dir)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create folder {}: {}", resolved_dir.display(), e)))?;

    let desired_filename = generate_media_filename(mime_type, file_name, data);
    let (full_file_path, actual_filename) = get_unique_filepath(&resolved_dir, &desired_filename, data);

    std::fs::write(&full_file_path, data)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to write media file: {}", e)))?;

    let file_size = data.len() as i64;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let conn = open_media_db(db_path)?;
    conn.execute(
        "INSERT OR REPLACE INTO media_cache
         (cache_key, local_path, original_url, mime_type, file_size, created_at, last_accessed, download_status, chat_id, message_id)
         VALUES (?1, ?2, ?1, ?3, ?4, ?5, ?5, 'downloaded', ?6, ?7)",
        params![
            cache_key,
            actual_filename,
            mime_type,
            file_size,
            now,
            chat_id,
            message_id
        ],
    ).map_err(|e| Error::new(Status::GenericFailure, format!("Insert to sqlite failed: {}", e)))?;

    Ok(RustCacheSaveResult {
        local_path: full_file_path.to_string_lossy().to_string(),
        file_size,
        resolved_dir: resolved_dir.to_string_lossy().to_string(),
    })
}

pub fn get_media_internal(
    db_path: &str,
    configured_dir: Option<&str>,
    cache_key: &str,
    _local_key_hex: Option<&str>,
    base_downloads: Option<&str>,
) -> Result<Option<RustMediaResult>> {
    let conn = open_media_db(db_path)?;

    let row: Option<(i64, String, String)> = conn.query_row(
        "SELECT id, local_path, mime_type FROM media_cache WHERE cache_key = ?1 AND download_status = 'downloaded'",
        params![cache_key],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).ok();

    if let Some((row_id, local_path_str, mime_type)) = row {
        if local_path_str.is_empty() {
            return Ok(None);
        }

        let resolved_dir = resolve_media_folder(configured_dir, base_downloads);
        let path_obj = Path::new(&local_path_str);
        let candidate_in_resolved = path_obj.file_name().map(|f| resolved_dir.join(f));

        let actual_path: Option<PathBuf> = if let Some(ref p) = candidate_in_resolved {
            if p.exists() {
                Some(p.clone())
            } else if path_obj.exists() {
                Some(path_obj.to_path_buf())
            } else {
                None
            }
        } else if path_obj.exists() {
            Some(path_obj.to_path_buf())
        } else {
            None
        };

        let file_path = match actual_path {
            Some(p) => p,
            None => {
                let _ = conn.execute("DELETE FROM media_cache WHERE id = ?1", params![row_id]);
                return Ok(None);
            }
        };

        let bytes = match std::fs::read(&file_path) {
            Ok(b) => b,
            Err(_) => return Ok(None),
        };

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let _ = conn.execute(
            "UPDATE media_cache SET last_accessed = ?1 WHERE id = ?2",
            params![now, row_id],
        );

        Ok(Some(RustMediaResult {
            data: bytes.into(),
            mime: mime_type,
        }))
    } else {
        Ok(None)
    }
}

pub fn exists_media_internal(
    db_path: &str,
    configured_dir: Option<&str>,
    cache_key: &str,
    base_downloads: Option<&str>,
) -> bool {
    let conn = match open_media_db(db_path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    let row: Option<String> = conn.query_row(
        "SELECT local_path FROM media_cache WHERE cache_key = ?1 AND download_status = 'downloaded'",
        params![cache_key],
        |r| r.get(0),
    ).ok();

    if let Some(local_path_str) = row {
        if local_path_str.is_empty() {
            return false;
        }
        let resolved_dir = resolve_media_folder(configured_dir, base_downloads);
        let path_obj = Path::new(&local_path_str);
        if let Some(file_name) = path_obj.file_name() {
            if resolved_dir.join(file_name).exists() {
                return true;
            }
        }
        path_obj.exists()
    } else {
        false
    }
}
