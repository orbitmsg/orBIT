use napi::bindgen_prelude::*;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use crate::types::{SensitiveKey, SensitiveBuffer};
use std::fs::{File, OpenOptions};
use std::path::Path;
use aes_gcm::aead::Payload;

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

#[napi(js_name = "rustReadFileFast")]
pub fn rust_read_file_fast(path: String) -> Result<Buffer> {
    read_file_fast(path)
}

const STREAM_MAGIC: &[u8; 8] = b"ORBSTR01";
const STREAM_HEADER_SIZE: usize = 32;
const STREAM_CHUNK_SIZE: usize = 64 * 1024;
const TAG_SIZE: usize = 16;

#[inline]
fn derive_chunk_nonce(base_nonce: &[u8; 12], chunk_index: u64) -> [u8; 12] {
    let mut nonce = *base_nonce;
    let mut carry = chunk_index;
    for byte in nonce.iter_mut().rev() {
        let sum = (*byte as u64) + (carry & 0xFF);
        *byte = sum as u8;
        carry = (carry >> 8) + (sum >> 8);
        if carry == 0 {
            break;
        }
    }
    nonce
}

#[inline]
fn build_chunk_aad(chunk_index: u64, is_last: bool) -> [u8; 17] {
    let mut aad = [0u8; 17];
    aad[0..8].copy_from_slice(&chunk_index.to_be_bytes());
    aad[8] = if is_last { 1 } else { 0 };
    aad[9..17].copy_from_slice(STREAM_MAGIC);
    aad
}

fn resolve_cipher_for_encryption(key_hex: &str) -> Result<Aes256Gcm> {
    let key_vec = hex::decode(key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    let sensitive_key = SensitiveBuffer(key_vec);

    let key_bytes = if sensitive_key.0.len() == 32 {
        let mut k = SensitiveKey([0u8; 32]);
        k.0.copy_from_slice(&sensitive_key.0);
        k
    } else {
        crate::crypto::derive_file_key(key_hex)?
    };

    Aes256Gcm::new_from_slice(&key_bytes.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create AES-GCM cipher: {}", e)))
}

fn resolve_cipher_for_decryption(
    key_hex: &str,
    first_chunk: &[u8],
    first_nonce_bytes: &[u8; 12],
    first_aad: &[u8],
) -> Result<Aes256Gcm> {
    let first_nonce = Nonce::from_slice(first_nonce_bytes);
    let key_vec = hex::decode(key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    let sensitive_key = SensitiveBuffer(key_vec);

    if sensitive_key.0.len() == 32 {
        let mut k = SensitiveKey([0u8; 32]);
        k.0.copy_from_slice(&sensitive_key.0);
        if let Ok(cipher) = Aes256Gcm::new_from_slice(&k.0) {
            let payload = Payload {
                msg: first_chunk,
                aad: first_aad,
            };
            if cipher.decrypt(first_nonce, payload).is_ok() {
                return Ok(cipher);
            }
        }

        if let Ok(derived) = crate::crypto::derive_file_key(key_hex) {
            if let Ok(cipher) = Aes256Gcm::new_from_slice(&derived.0) {
                let payload = Payload {
                    msg: first_chunk,
                    aad: first_aad,
                };
                if cipher.decrypt(first_nonce, payload).is_ok() {
                    return Ok(cipher);
                }
            }
        }

        return Err(Error::new(
            Status::GenericFailure,
            "AES-GCM decryption failed: invalid key or corrupted stream",
        ));
    }

    let derived = crate::crypto::derive_file_key(key_hex)?;
    Aes256Gcm::new_from_slice(&derived.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create AES-GCM cipher: {}", e)))
}

#[napi]
pub fn rust_encrypt_file_stream(source_path: String, target_path: String, key_hex: String) -> Result<bool> {
    let src_path = Path::new(&source_path);
    let tgt_path = Path::new(&target_path);

    if src_path == tgt_path {
        return Err(Error::new(Status::InvalidArg, "Source and target paths cannot be identical"));
    }

    if let Some(parent) = tgt_path.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }

    let cipher = resolve_cipher_for_encryption(&key_hex)?;

    let source_file = File::open(src_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open source file {}: {}", source_path, e)))?;

    let source_len = source_file.metadata()
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to get source file metadata: {}", e)))?
        .len();

    let num_chunks = if source_len == 0 {
        0
    } else {
        (source_len + STREAM_CHUNK_SIZE as u64 - 1) / (STREAM_CHUNK_SIZE as u64)
    };

    let target_len = STREAM_HEADER_SIZE as u64 + source_len + (num_chunks * TAG_SIZE as u64);

    let target_file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(true)
        .open(tgt_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open target file {}: {}", target_path, e)))?;

    target_file.set_len(target_len)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to preallocate target file: {}", e)))?;

    let mut base_nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut base_nonce);

    let mut mmap_out = unsafe {
        memmap2::MmapMut::map_mut(&target_file)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to mmap target file: {}", e)))?
    };

    mmap_out[0..8].copy_from_slice(STREAM_MAGIC);
    mmap_out[8..12].copy_from_slice(&(STREAM_CHUNK_SIZE as u32).to_be_bytes());
    mmap_out[12..20].copy_from_slice(&source_len.to_be_bytes());
    mmap_out[20..32].copy_from_slice(&base_nonce);

    if source_len > 0 {
        let mmap_in = unsafe {
            memmap2::MmapOptions::new()
                .map(&source_file)
                .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to mmap source file: {}", e)))?
        };

        let mut src_offset: usize = 0;
        let mut dst_offset: usize = STREAM_HEADER_SIZE;
        let mut chunk_index: u64 = 0;

        while src_offset < source_len as usize {
            let remaining = (source_len as usize) - src_offset;
            let current_chunk_len = std::cmp::min(remaining, STREAM_CHUNK_SIZE);
            let is_last = (src_offset + current_chunk_len) == (source_len as usize);

            let nonce_bytes = derive_chunk_nonce(&base_nonce, chunk_index);
            let nonce = Nonce::from_slice(&nonce_bytes);
            let aad = build_chunk_aad(chunk_index, is_last);

            let payload = Payload {
                msg: &mmap_in[src_offset..src_offset + current_chunk_len],
                aad: &aad,
            };

            let encrypted = cipher
                .encrypt(nonce, payload)
                .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM encryption failed at chunk {}: {}", chunk_index, e)))?;

            mmap_out[dst_offset..dst_offset + encrypted.len()].copy_from_slice(&encrypted);

            src_offset += current_chunk_len;
            dst_offset += encrypted.len();
            chunk_index += 1;
        }

        mmap_out.flush()
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to flush encrypted target file: {}", e)))?;
    } else {
        mmap_out.flush()
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to flush empty encrypted target file: {}", e)))?;
    }

    Ok(true)
}

#[napi]
pub fn rust_decrypt_file_stream(source_path: String, target_path: String, key_hex: String) -> Result<bool> {
    let src_path = Path::new(&source_path);
    let tgt_path = Path::new(&target_path);

    if src_path == tgt_path {
        return Err(Error::new(Status::InvalidArg, "Source and target paths cannot be identical"));
    }

    if let Some(parent) = tgt_path.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }

    let source_file = File::open(src_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open encrypted file {}: {}", source_path, e)))?;

    let source_len = source_file.metadata()
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to get encrypted file metadata: {}", e)))?
        .len();

    if source_len < STREAM_HEADER_SIZE as u64 {
        return Err(Error::new(Status::InvalidArg, "File too small to be a valid encrypted stream"));
    }

    let mmap_in = unsafe {
        memmap2::MmapOptions::new()
            .map(&source_file)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to mmap encrypted file: {}", e)))?
    };

    if &mmap_in[0..8] != STREAM_MAGIC {
        return Err(Error::new(Status::InvalidArg, "Invalid file format: bad magic header"));
    }

    let chunk_size = u32::from_be_bytes(mmap_in[8..12].try_into().unwrap()) as usize;
    if chunk_size == 0 || chunk_size > 16 * 1024 * 1024 {
        return Err(Error::new(Status::InvalidArg, format!("Invalid chunk size in stream header: {}", chunk_size)));
    }

    let plaintext_total_size = u64::from_be_bytes(mmap_in[12..20].try_into().unwrap());
    let mut base_nonce = [0u8; 12];
    base_nonce.copy_from_slice(&mmap_in[20..32]);

    let num_chunks = if plaintext_total_size == 0 {
        0
    } else {
        (plaintext_total_size + chunk_size as u64 - 1) / (chunk_size as u64)
    };

    let expected_ciphertext_len = STREAM_HEADER_SIZE as u64 + plaintext_total_size + (num_chunks * TAG_SIZE as u64);
    if source_len != expected_ciphertext_len {
        return Err(Error::new(
            Status::InvalidArg,
            format!("Encrypted file length mismatch: actual {} bytes, expected {} bytes", source_len, expected_ciphertext_len),
        ));
    }

    if plaintext_total_size == 0 {
        File::create(tgt_path)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create target file: {}", e)))?;
        return Ok(true);
    }

    let target_file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(true)
        .open(tgt_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open target file {}: {}", target_path, e)))?;

    target_file.set_len(plaintext_total_size)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to preallocate target file: {}", e)))?;

    let mut mmap_out = unsafe {
        memmap2::MmapMut::map_mut(&target_file)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to mmap target file: {}", e)))?
    };

    let first_chunk_plain_len = std::cmp::min(plaintext_total_size as usize, chunk_size);
    let first_chunk_cipher_len = first_chunk_plain_len + TAG_SIZE;
    let first_nonce_bytes = derive_chunk_nonce(&base_nonce, 0);
    let first_is_last = first_chunk_plain_len == (plaintext_total_size as usize);
    let first_aad = build_chunk_aad(0, first_is_last);

    let first_chunk_slice = &mmap_in[STREAM_HEADER_SIZE..STREAM_HEADER_SIZE + first_chunk_cipher_len];
    let cipher = resolve_cipher_for_decryption(&key_hex, first_chunk_slice, &first_nonce_bytes, &first_aad)?;

    let mut decrypt_loop = || -> Result<()> {
        let mut src_offset: usize = STREAM_HEADER_SIZE;
        let mut dst_offset: usize = 0;
        let mut chunk_index: u64 = 0;

        while dst_offset < plaintext_total_size as usize {
            let remaining_plain = (plaintext_total_size as usize) - dst_offset;
            let current_chunk_plain_len = std::cmp::min(remaining_plain, chunk_size);
            let current_chunk_cipher_len = current_chunk_plain_len + TAG_SIZE;
            let is_last = (dst_offset + current_chunk_plain_len) == (plaintext_total_size as usize);

            let nonce_bytes = derive_chunk_nonce(&base_nonce, chunk_index);
            let nonce = Nonce::from_slice(&nonce_bytes);
            let aad = build_chunk_aad(chunk_index, is_last);

            let payload = Payload {
                msg: &mmap_in[src_offset..src_offset + current_chunk_cipher_len],
                aad: &aad,
            };

            let decrypted = cipher
                .decrypt(nonce, payload)
                .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM stream decryption failed at chunk {}: {}", chunk_index, e)))?;

            mmap_out[dst_offset..dst_offset + decrypted.len()].copy_from_slice(&decrypted);

            src_offset += current_chunk_cipher_len;
            dst_offset += decrypted.len();
            chunk_index += 1;
        }

        mmap_out.flush()
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to flush decrypted target file: {}", e)))?;

        Ok(())
    };

    if let Err(e) = decrypt_loop() {
        drop(mmap_out);
        drop(target_file);
        let _ = std::fs::remove_file(tgt_path);
        return Err(e);
    }

    Ok(true)
}
