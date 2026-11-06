use napi::bindgen_prelude::*;
use napi_derive::napi;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use crate::cache::folder::{create_media_folder_if_needed, resolve_media_folder};
use crate::media::RustMediaResult;
use crate::types::{SensitiveBuffer, SensitiveKey};

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

fn derive_cipher(local_key_hex: &str) -> Result<Aes256Gcm> {
    let key_vec = hex::decode(local_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    if key_vec.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Key must be 32 bytes"));
    }
    let sensitive_key_vec = SensitiveBuffer(key_vec);
    let mut key_bytes = SensitiveKey([0u8; 32]);
    key_bytes.0.copy_from_slice(&sensitive_key_vec.0);

    Aes256Gcm::new_from_slice(&key_bytes.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))
}

pub fn save_media_internal(
    db_path: &str,
    configured_dir: Option<&str>,
    cache_key: &str,
    data: &[u8],
    mime_type: &str,
    chat_id: Option<&str>,
    message_id: Option<&str>,
    local_key_hex: &str,
) -> Result<RustCacheSaveResult> {
    let resolved_dir = resolve_media_folder(configured_dir);
    create_media_folder_if_needed(&resolved_dir)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create folder {}: {}", resolved_dir.display(), e)))?;

    let cipher = derive_cipher(local_key_hex)?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Encryption failed: {}", e)))?;

    let mut encrypted = Vec::with_capacity(12 + ciphertext.len());
    encrypted.extend_from_slice(&nonce_bytes);
    encrypted.extend_from_slice(&ciphertext);

    let random_id: String = (0..16).map(|_| format!("{:x}", rand::random::<u8>() % 16)).collect();
    let filename = format!("{}.dat", random_id);
    let full_file_path = resolved_dir.join(&filename);

    std::fs::write(&full_file_path, &encrypted)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to write media file: {}", e)))?;

    let file_size = encrypted.len() as i64;
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
            filename,
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
    local_key_hex: &str,
) -> Result<Option<RustMediaResult>> {
    let conn = open_media_db(db_path)?;

    let row: Option<(i64, String, String)> = conn.query_row(
        "SELECT id, local_path, mime_type FROM media_cache WHERE cache_key = ?1 AND download_status = 'downloaded'",
        params![cache_key],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).ok();

    if let Some((row_id, local_path_str, mime_type)) = row {
        let resolved_dir = resolve_media_folder(configured_dir);
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

        let encrypted = match std::fs::read(&file_path) {
            Ok(bytes) => bytes,
            Err(_) => return Ok(None),
        };

        if encrypted.len() < 28 {
            return Ok(None);
        }

        let cipher = derive_cipher(local_key_hex)?;
        let (nonce_slice, ciphertext) = encrypted.split_at(12);
        let nonce = Nonce::from_slice(nonce_slice);

        let plaintext = match cipher.decrypt(nonce, ciphertext) {
            Ok(p) => p,
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
            data: plaintext.into(),
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
        let resolved_dir = resolve_media_folder(configured_dir);
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
