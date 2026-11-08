use napi::bindgen_prelude::*;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use crate::types::{SensitiveKey, SensitiveBuffer};

#[napi(object)]
pub struct RustMediaResult {
    pub data: Buffer,
    pub mime: String,
}

#[napi]
pub fn rust_media_init_db(db_path: String) -> Result<bool> {
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open db: {}", e)))?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;
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
    ).map_err(|e| Error::new(Status::GenericFailure, format!("Failed to execute migrations: {}", e)))?;

    Ok(true)
}

#[napi]
pub fn rust_media_save(
    db_path: String,
    media_dir: String,
    cache_key: String,
    data: Buffer,
    mime_type: String,
    chat_id: Option<String>,
    message_id: Option<String>,
    local_key_hex: String,
) -> Result<String> {
    let key_vec = hex::decode(&local_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    if key_vec.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Key must be 32 bytes"));
    }
    let sensitive_key_vec = SensitiveBuffer(key_vec);
    let mut key_bytes = SensitiveKey([0u8; 32]);
    key_bytes.0.copy_from_slice(&sensitive_key_vec.0);

    let cipher = Aes256Gcm::new_from_slice(&key_bytes.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_ref())
        .map_err(|e| Error::new(Status::GenericFailure, format!("Encryption failed: {}", e)))?;

    let mut encrypted = Vec::with_capacity(12 + ciphertext.len());
    encrypted.extend_from_slice(&nonce_bytes);
    encrypted.extend_from_slice(&ciphertext);

    let random_id: String = (0..16).map(|_| format!("{:x}", rand::random::<u8>() % 16)).collect();
    let filename = format!("{}.dat", random_id);
    let file_path = std::path::Path::new(&media_dir).join(&filename);
    let local_path_str = file_path.to_string_lossy().to_string();

    std::fs::write(&file_path, &encrypted)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to write file: {}", e)))?;

    let file_size = encrypted.len() as i64;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open db: {}", e)))?;

    conn.execute(
        "INSERT OR REPLACE INTO media_cache
         (cache_key, local_path, original_url, mime_type, file_size, created_at, last_accessed, download_status, chat_id, message_id)
         VALUES (?1, ?2, ?1, ?3, ?4, ?5, ?5, 'downloaded', ?6, ?7)",
        rusqlite::params![cache_key, local_path_str, mime_type, file_size, now, chat_id, message_id],
    ).map_err(|e| Error::new(Status::GenericFailure, format!("Failed to insert into sqlite: {}", e)))?;

    Ok(local_path_str)
}

#[napi]
pub fn rust_media_get(
    db_path: String,
    cache_key: String,
    local_key_hex: String,
) -> Result<Option<RustMediaResult>> {
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open db: {}", e)))?;

    let row: Option<(String, String)> = conn.query_row(
        "SELECT local_path, mime_type FROM media_cache WHERE cache_key = ?1 AND download_status = 'downloaded'",
        rusqlite::params![cache_key],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).ok();

    if let Some((local_path, mime_type)) = row {
        let path = std::path::Path::new(&local_path);
        if !path.exists() {
            let _ = conn.execute("DELETE FROM media_cache WHERE cache_key = ?1", rusqlite::params![cache_key]);
            return Ok(None);
        }

        let encrypted = match std::fs::read(path) {
            Ok(bytes) => bytes,
            Err(_) => return Ok(None),
        };

        if encrypted.len() < 28 {
            return Ok(None);
        }

        let key_vec = match hex::decode(&local_key_hex) {
            Ok(k) if k.len() == 32 => k,
            _ => return Err(Error::new(Status::InvalidArg, "Invalid local key hex")),
        };
        let sensitive_key_vec = SensitiveBuffer(key_vec);
        let mut key_bytes = SensitiveKey([0u8; 32]);
        key_bytes.0.copy_from_slice(&sensitive_key_vec.0);

        let cipher = match Aes256Gcm::new_from_slice(&key_bytes.0) {
            Ok(c) => c,
            Err(_) => return Ok(None),
        };

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
            "UPDATE media_cache SET last_accessed = ?1 WHERE cache_key = ?2",
            rusqlite::params![now, cache_key],
        );

        Ok(Some(RustMediaResult {
            data: plaintext.into(),
            mime: mime_type,
        }))
    } else {
        Ok(None)
    }
}

#[napi]
pub fn read_file_fast(path: String) -> Result<Buffer> {
    let bytes = std::fs::read(&path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to read file {}: {}", path, e)))?;
    Ok(bytes.into())
}
