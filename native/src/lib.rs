#[macro_use]
extern crate napi_derive;

use napi::bindgen_prelude::*;
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};
use rand::RngCore;
use x25519_dalek::{PublicKey, StaticSecret};
use std::io::Cursor;
use image::ImageReader;
use zeroize::{Zeroize, ZeroizeOnDrop};
use base64::prelude::*;
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SensitiveKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SensitiveBuffer(pub Vec<u8>);

#[napi(object)]
pub struct KeyPairResult {
    pub public_key: String,
    pub private_key: String,
}

#[napi(object)]
pub struct EncryptedMessageResult {
    pub ciphertext: Buffer,
    pub nonce: Buffer,
    pub tag: Buffer,
}

#[napi]
pub fn generate_key_pair() -> Result<KeyPairResult> {
    let mut rng = rand::thread_rng();
    let secret = StaticSecret::random_from_rng(&mut rng);
    let public = PublicKey::from(&secret);
    let secret_bytes = SensitiveKey(secret.to_bytes());

    Ok(KeyPairResult {
        public_key: hex::encode(public.as_bytes()),
        private_key: hex::encode(&secret_bytes.0),
    })
}

#[napi]
pub fn derive_public_key(private_key_hex: String) -> Result<String> {
    let bytes = hex::decode(&private_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid private key hex: {}", e)))?;
    if bytes.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Private key must be 32 bytes"));
    }
    let sensitive_bytes = SensitiveBuffer(bytes);
    let mut arr = SensitiveKey([0u8; 32]);
    arr.0.copy_from_slice(&sensitive_bytes.0);
    let secret = StaticSecret::from(arr.0);
    let public = PublicKey::from(&secret);
    Ok(hex::encode(public.as_bytes()))
}

#[napi]
pub fn derive_shared_secret(my_private_key_hex: String, other_public_key_hex: String) -> Result<String> {
    let priv_bytes = hex::decode(&my_private_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid private key hex: {}", e)))?;
    let pub_bytes = hex::decode(&other_public_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid public key hex: {}", e)))?;

    if priv_bytes.len() != 32 || pub_bytes.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Keys must be 32 bytes"));
    }

    let priv_buffer = SensitiveBuffer(priv_bytes);
    let pub_buffer = SensitiveBuffer(pub_bytes);

    let mut priv_arr = SensitiveKey([0u8; 32]);
    priv_arr.0.copy_from_slice(&priv_buffer.0);
    let mut pub_arr = SensitiveKey([0u8; 32]);
    pub_arr.0.copy_from_slice(&pub_buffer.0);

    let secret = StaticSecret::from(priv_arr.0);
    let public = PublicKey::from(pub_arr.0);
    let shared = secret.diffie_hellman(&public);
    let shared_arr = SensitiveKey(*shared.as_bytes());

    Ok(hex::encode(&shared_arr.0))
}

#[napi]
pub fn derive_root_key(shared_secret_hex: String) -> Result<String> {
    let ikm_vec = hex::decode(&shared_secret_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid shared secret hex: {}", e)))?;
    let ikm = SensitiveBuffer(ikm_vec);
    
    let salt = [0u8; 32];
    let hk = Hkdf::<Sha256>::new(Some(&salt[..]), &ikm.0);
    let mut okm = SensitiveKey([0u8; 32]);
    hk.expand(b"orbita-root-key-v1", &mut okm.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("HKDF expand failed: {:?}", e)))?;

    Ok(hex::encode(&okm.0))
}

fn derive_file_key(shared_secret_hex: &str) -> Result<SensitiveKey> {
    let ikm_vec = hex::decode(shared_secret_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid shared secret hex: {}", e)))?;
    let ikm = SensitiveBuffer(ikm_vec);
    
    let hk = Hkdf::<Sha256>::new(Some(b"orbita-file-key"), &ikm.0);
    let mut okm = SensitiveKey([0u8; 32]);
    hk.expand(b"file-encryption", &mut okm.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("HKDF file key expand failed: {:?}", e)))?;

    Ok(okm)
}

#[napi]
pub fn encrypt_file(data: Buffer, key_hex: String) -> Result<Buffer> {
    let raw_key_vec = hex::decode(&key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    let raw_key = SensitiveBuffer(raw_key_vec);

    let key_bytes: SensitiveKey = if raw_key.0.len() == 32 {
        let mut k = SensitiveKey([0u8; 32]);
        k.0.copy_from_slice(&raw_key.0);
        k
    } else {
        derive_file_key(&key_hex)?
    };

    let cipher = Aes256Gcm::new_from_slice(&key_bytes.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_ref())
        .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM encryption failed: {}", e)))?;

    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result.into())
}

#[napi]
pub fn decrypt_file(encrypted_data: Buffer, key_hex: String) -> Result<Buffer> {
    if encrypted_data.len() < 28 {
        return Err(Error::new(Status::InvalidArg, "Data too short for AES-GCM (needs at least 12 IV + 16 Tag)"));
    }

    let raw_key_vec = hex::decode(&key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    let raw_key = SensitiveBuffer(raw_key_vec);

    let (nonce_slice, ciphertext) = encrypted_data.split_at(12);
    let nonce = Nonce::from_slice(nonce_slice);

    if raw_key.0.len() == 32 {
        if let Ok(cipher) = Aes256Gcm::new_from_slice(&raw_key.0) {
            if let Ok(plaintext) = cipher.decrypt(nonce, ciphertext) {
                return Ok(plaintext.into());
            }
        }
        if let Ok(derived) = derive_file_key(&key_hex) {
            if let Ok(cipher) = Aes256Gcm::new_from_slice(&derived.0) {
                if let Ok(plaintext) = cipher.decrypt(nonce, ciphertext) {
                    return Ok(plaintext.into());
                }
            }
        }
        return Err(Error::new(Status::GenericFailure, "AES-GCM decryption failed"));
    }

    let derived = derive_file_key(&key_hex)?;
    let cipher = Aes256Gcm::new_from_slice(&derived.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM decryption failed: {}", e)))?;

    Ok(plaintext.into())
}

#[napi]
pub fn encrypt_message_aes_gcm(
    key: Buffer,
    plaintext: Buffer,
    nonce_opt: Option<Buffer>,
    associated_data_opt: Option<Buffer>,
) -> Result<EncryptedMessageResult> {
    if key.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Key must be 32 bytes"));
    }

    let mut key_arr = SensitiveKey([0u8; 32]);
    key_arr.0.copy_from_slice(key.as_ref());

    let cipher = Aes256Gcm::new_from_slice(&key_arr.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))?;

    let nonce_bytes: Vec<u8> = match nonce_opt {
        Some(b) => {
            if b.len() != 12 {
                return Err(Error::new(Status::InvalidArg, "Nonce must be 12 bytes"));
            }
            b.to_vec()
        }
        None => {
            let mut n = vec![0u8; 12];
            rand::thread_rng().fill_bytes(&mut n);
            n
        }
    };

    let nonce = Nonce::from_slice(&nonce_bytes);
    let payload = match associated_data_opt {
        Some(ref ad) => Payload {
            msg: plaintext.as_ref(),
            aad: ad.as_ref(),
        },
        None => Payload {
            msg: plaintext.as_ref(),
            aad: b"",
        },
    };

    let encrypted = cipher
        .encrypt(nonce, payload)
        .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM message encrypt failed: {}", e)))?;

    let tag_offset = encrypted.len() - 16;
    let ciphertext = encrypted[..tag_offset].to_vec();
    let tag = encrypted[tag_offset..].to_vec();

    Ok(EncryptedMessageResult {
        ciphertext: ciphertext.into(),
        nonce: nonce_bytes.into(),
        tag: tag.into(),
    })
}

#[napi]
pub fn decrypt_message_aes_gcm(
    key: Buffer,
    ciphertext: Buffer,
    nonce: Buffer,
    tag: Buffer,
    associated_data_opt: Option<Buffer>,
) -> Result<Buffer> {
    if key.len() != 32 || nonce.len() != 12 || tag.len() != 16 {
        return Err(Error::new(Status::InvalidArg, "Invalid AES key, nonce or tag length"));
    }

    let mut key_arr = SensitiveKey([0u8; 32]);
    key_arr.0.copy_from_slice(key.as_ref());

    let cipher = Aes256Gcm::new_from_slice(&key_arr.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))?;

    let mut full_ciphertext = Vec::with_capacity(ciphertext.len() + 16);
    full_ciphertext.extend_from_slice(ciphertext.as_ref());
    full_ciphertext.extend_from_slice(tag.as_ref());

    let nonce_ref = Nonce::from_slice(nonce.as_ref());
    let payload = match associated_data_opt {
        Some(ref ad) => Payload {
            msg: &full_ciphertext,
            aad: ad.as_ref(),
        },
        None => Payload {
            msg: &full_ciphertext,
            aad: b"",
        },
    };

    let plaintext = cipher
        .decrypt(nonce_ref, payload)
        .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM message decrypt failed: {}", e)))?;

    Ok(plaintext.into())
}

#[napi]
pub fn process_audio_waveform(data: Buffer, num_bars: u32) -> Result<Vec<f64>> {
    let bytes = data.as_ref();
    let bars = if num_bars == 0 { 64 } else { num_bars as usize };
    if bytes.is_empty() {
        return Ok(vec![0.1; bars]);
    }

    let sample_count = bytes.len() / 2;
    if sample_count == 0 {
        return Ok(vec![0.1; bars]);
    }

    let chunk_size = (sample_count / bars).max(1);
    let mut peaks: Vec<f64> = Vec::with_capacity(bars);

    for i in 0..bars {
        let start_sample = i * chunk_size;
        let end_sample = ((i + 1) * chunk_size).min(sample_count);
        let mut sum_squares: f64 = 0.0;
        let mut count: f64 = 0.0;

        for s in start_sample..end_sample {
            let byte_idx = s * 2;
            if byte_idx + 1 < bytes.len() {
                let sample = i16::from_le_bytes([bytes[byte_idx], bytes[byte_idx + 1]]) as f64;
                sum_squares += sample * sample;
                count += 1.0;
            }
        }

        let rms = if count > 0.0 {
            (sum_squares / count).sqrt() / 32768.0
        } else {
            0.05
        };

        peaks.push(rms);
    }

    let max_peak = peaks.iter().cloned().fold(0.0f64, f64::max);
    let normalized = if max_peak > 0.001 {
        peaks.into_iter().map(|p| (p / max_peak).clamp(0.08, 1.0)).collect()
    } else {
        vec![0.1; bars]
    };

    Ok(normalized)
}

#[napi]
pub fn resize_image(data: Buffer, max_width: u32, max_height: u32, quality: Option<u32>) -> Result<Buffer> {
    let cursor = Cursor::new(data.as_ref());
    let img = ImageReader::new(cursor)
        .with_guessed_format()
        .map_err(|e| Error::new(Status::InvalidArg, format!("Failed to read image header: {}", e)))?
        .decode()
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to decode image: {}", e)))?;

    let (w, h) = (img.width(), img.height());
    let resized = if w > max_width || h > max_height {
        img.thumbnail(max_width, max_height)
    } else {
        img
    };

    let mut out_bytes = Vec::new();
    let q = quality.unwrap_or(85).clamp(1, 100) as u8;
    let mut out_cursor = Cursor::new(&mut out_bytes);

    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out_cursor, q);
    encoder.encode_image(&resized)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to encode image: {}", e)))?;

    Ok(out_bytes.into())
}

#[napi]
pub fn fast_text_search(haystack: Vec<String>, query: String) -> Result<Vec<u32>> {
    let q = query.to_lowercase();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let mut matches = Vec::new();
    for (idx, item) in haystack.into_iter().enumerate() {
        if item.to_lowercase().contains(&q) {
            matches.push(idx as u32);
        }
    }

    Ok(matches)
}

#[napi]
pub fn read_file_fast(path: String) -> Result<Buffer> {
    let bytes = std::fs::read(&path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to read file {}: {}", path, e)))?;
    Ok(bytes.into())
}

#[napi]
pub async fn pick_file(extensions: Vec<String>) -> Result<String> {
    use rfd::FileDialog;
    let mut dialog = FileDialog::new();
    
    if !extensions.is_empty() {
        let filters: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
        dialog = dialog.add_filter("Media", &filters);
    }
    
    match dialog.pick_file() {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Ok(String::new()),
    }
}

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

#[napi(object)]
pub struct RustFileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[napi]
pub async fn rust_save_file_dialog(
    data: Buffer,
    default_name: Option<String>,
    filters: Option<Vec<RustFileFilter>>,
) -> Result<Option<String>> {
    tokio::task::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new();
        if let Some(name) = &default_name {
            dialog = dialog.set_file_name(name);
        }
        if let Some(filter_list) = &filters {
            for f in filter_list {
                let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
                dialog = dialog.add_filter(&f.name, &exts);
            }
        }
        if let Some(path_buf) = dialog.save_file() {
            if let Err(e) = std::fs::write(&path_buf, data.as_ref()) {
                return Err(Error::new(Status::GenericFailure, format!("Failed to write file: {}", e)));
            }
            Ok(Some(path_buf.to_string_lossy().to_string()))
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| Error::new(Status::GenericFailure, format!("Task error: {}", e)))?
}

#[napi]
pub async fn rust_pick_file_dialog(
    filters: Option<Vec<RustFileFilter>>,
) -> Result<Option<String>> {
    tokio::task::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new();
        if let Some(filter_list) = &filters {
            for f in filter_list {
                let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
                dialog = dialog.add_filter(&f.name, &exts);
            }
        }
        let picked = dialog.pick_file();
        Ok(picked.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| Error::new(Status::GenericFailure, format!("Task error: {}", e)))?
}

#[napi(object)]
pub struct RustCallSession {
    pub name: String,
    pub avatar: Option<String>,
    pub chat_id: String,
    pub call_state: String,
    pub direction: String,
    pub call_type: String,
    pub verification_secret: Option<String>,
    pub verification_salt: Option<String>,
}

#[napi]
pub fn rust_build_call_query(session: RustCallSession) -> String {
    let mut parts: Vec<String> = Vec::new();
    parts.push("view=call".to_string());
    parts.push(format!("name={}", urlencoding_fast(&session.name)));
    if let Some(av) = session.avatar {
        if !av.is_empty() {
            parts.push(format!("avatar={}", urlencoding_fast(&av)));
        }
    }
    parts.push(format!("chatId={}", urlencoding_fast(&session.chat_id)));
    parts.push(format!("state={}", urlencoding_fast(&session.call_state)));
    parts.push(format!("direction={}", urlencoding_fast(&session.direction)));
    parts.push(format!("type={}", urlencoding_fast(&session.call_type)));
    if let Some(vs) = session.verification_secret {
        if !vs.is_empty() {
            parts.push(format!("secret={}", urlencoding_fast(&vs)));
        }
    }
    if let Some(salt) = session.verification_salt {
        if !salt.is_empty() {
            parts.push(format!("salt={}", urlencoding_fast(&salt)));
        }
    }
    parts.join("&")
}

#[napi]
pub fn rust_should_activate_connected(
    call_state: String,
    has_remote_participants: bool,
    has_subscribed_tracks: bool,
) -> bool {
    if call_state == "connecting" || call_state == "ringing" {
        return has_remote_participants || has_subscribed_tracks;
    }
    false
}

#[napi]
pub fn rust_verify_call_session(
    room_name: String,
    local_identity: String,
    has_token: bool,
) -> bool {
    !room_name.is_empty() && !local_identity.is_empty() && has_token
}

fn urlencoding_fast(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len() * 2);
    for byte in input.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

use std::sync::atomic::{AtomicI32, AtomicU32, Ordering};
use std::sync::Mutex;

#[repr(C)]
struct POINT {
    x: i32,
    y: i32,
}

#[repr(C)]
struct RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[repr(C)]
struct MSG {
    hwnd: isize,
    message: u32,
    wparam: usize,
    lparam: isize,
    time: u32,
    pt: POINT,
}

#[repr(C)]
struct WNDCLASSEXW {
    cb_size: u32,
    style: u32,
    lpfn_wnd_proc: Option<unsafe extern "system" fn(isize, u32, usize, isize) -> isize>,
    cb_cls_extra: i32,
    cb_wnd_extra: i32,
    h_instance: isize,
    h_icon: isize,
    h_cursor: isize,
    hbr_background: isize,
    lpsz_menu_name: *const u16,
    lpsz_class_name: *const u16,
    h_icon_sm: isize,
}

#[repr(C)]
struct PAINTSTRUCT {
    hdc: isize,
    f_erase: i32,
    rc_paint: RECT,
    f_restore: i32,
    f_inc_update: i32,
    rgb_reserved: [u8; 32],
}

#[repr(C)]
struct TRACKMOUSEEVENT {
    cb_size: u32,
    dw_flags: u32,
    hwnd_track: isize,
    dw_hover_time: u32,
}

const WS_POPUP: u32 = 0x80000000;
const WS_EX_TOOLWINDOW: u32 = 0x00000080;
const WS_EX_TOPMOST: u32 = 0x00000008;

const WM_DESTROY: u32 = 0x0002;
const WM_PAINT: u32 = 0x000F;
const WM_KILLFOCUS: u32 = 0x0008;
const WM_ACTIVATE: u32 = 0x0006;
const WM_SETCURSOR: u32 = 0x0020;
const WM_NCHITTEST: u32 = 0x0084;
const WM_MOUSEMOVE: u32 = 0x0200;
const WM_LBUTTONDOWN: u32 = 0x0201;
const WM_LBUTTONUP: u32 = 0x0202;
const WM_RBUTTONDOWN: u32 = 0x0204;
const WM_MOUSELEAVE: u32 = 0x02A3;
const WM_KEYDOWN: u32 = 0x0100;

const VK_ESCAPE: usize = 0x1B;
const TME_LEAVE: u32 = 0x00000002;
const HTCLIENT: isize = 1;

const SW_SHOW: i32 = 5;
const SM_CXSCREEN: i32 = 0;
const SM_CYSCREEN: i32 = 1;
const COLOR_WINDOW: isize = 5;
const IDC_ARROW: usize = 32512;

const DT_LEFT: u32 = 0x00000000;
const DT_VCENTER: u32 = 0x00000004;
const DT_SINGLELINE: u32 = 0x00000020;
const DT_NOPREFIX: u32 = 0x00000800;

#[link(name = "user32")]
extern "system" {
    fn RegisterClassExW(lpwcx: *const WNDCLASSEXW) -> u16;
    fn CreateWindowExW(
        dwExStyle: u32,
        lpClassName: *const u16,
        lpWindowName: *const u16,
        dwStyle: u32,
        X: i32,
        Y: i32,
        nWidth: i32,
        nHeight: i32,
        hWndParent: isize,
        hMenu: isize,
        hInstance: isize,
        lpParam: *mut std::ffi::c_void,
    ) -> isize;
    fn DefWindowProcW(hWnd: isize, Msg: u32, wParam: usize, lParam: isize) -> isize;
    fn ShowWindow(hWnd: isize, nCmdShow: i32) -> i32;
    fn SetForegroundWindow(hWnd: isize) -> i32;
    fn SetFocus(hWnd: isize) -> isize;
    fn GetClientRect(hWnd: isize, lpRect: *mut RECT) -> i32;
    fn BeginPaint(hWnd: isize, lpPaint: *mut PAINTSTRUCT) -> isize;
    fn EndPaint(hWnd: isize, lpPaint: *const PAINTSTRUCT) -> i32;
    fn InvalidateRect(hWnd: isize, lpRect: *const RECT, bErase: i32) -> i32;
    fn TrackMouseEvent(lpEventTrack: *mut TRACKMOUSEEVENT) -> i32;
    fn GetSystemMetrics(nIndex: i32) -> i32;
    fn DestroyWindow(hWnd: isize) -> i32;
    fn PostQuitMessage(nExitCode: i32);
    fn GetMessageW(lpMsg: *mut MSG, hWnd: isize, wMsgFilterMin: u32, wMsgFilterMax: u32) -> i32;
    fn TranslateMessage(lpMsg: *const MSG) -> i32;
    fn DispatchMessageW(lpMsg: *const MSG) -> isize;
    fn LoadCursorW(hInstance: isize, lpCursorName: *const u16) -> isize;
    fn SetCursor(hCursor: isize) -> isize;
    fn SetCapture(hWnd: isize) -> isize;
    fn ReleaseCapture() -> i32;
    fn SetWindowRgn(hWnd: isize, hRgn: isize, bRedraw: i32) -> i32;
    fn GetCursorPos(lpPoint: *mut POINT) -> i32;
}

#[link(name = "gdi32")]
extern "system" {
    fn CreateSolidBrush(color: u32) -> isize;
    fn CreateCompatibleDC(hdc: isize) -> isize;
    fn CreateCompatibleBitmap(hdc: isize, cx: i32, cy: i32) -> isize;
    fn SelectObject(hdc: isize, h: isize) -> isize;
    fn DeleteObject(ho: isize) -> i32;
    fn DeleteDC(hdc: isize) -> i32;
    fn BitBlt(hdcDest: isize, nXDest: i32, nYDest: i32, nWidth: i32, nHeight: i32, hdcSrc: isize, nXSrc: i32, nYSrc: i32, dwRop: u32) -> i32;
    fn FillRect(hDC: isize, lprc: *const RECT, hbr: isize) -> i32;
    fn SetBkMode(hdc: isize, mode: i32) -> i32;
    fn SetTextColor(hdc: isize, color: u32) -> u32;
    fn CreateFontW(
        cHeight: i32,
        cWidth: i32,
        cEscapement: i32,
        cOrientation: i32,
        cWeight: i32,
        bItalic: u32,
        bUnderline: u32,
        bStrikeOut: u32,
        iCharSet: u32,
        iOutPrecision: u32,
        iClipPrecision: u32,
        iQuality: u32,
        iPitchAndFamily: u32,
        pszFaceName: *const u16,
    ) -> isize;
    fn DrawTextW(hdc: isize, lpchText: *const u16, cchText: i32, lprc: *mut RECT, format: u32) -> i32;
    fn CreateRoundRectRgn(x1: i32, y1: i32, x2: i32, y2: i32, w: i32, h: i32) -> isize;
}

static HOVER_INDEX: AtomicI32 = AtomicI32::new(-1);
static SELECTED_INDEX: AtomicI32 = AtomicI32::new(-1);
static MENU_ITEMS: Mutex<Vec<Vec<u16>>> = Mutex::new(Vec::new());
static MENU_FONT_NAME: Mutex<Vec<u16>> = Mutex::new(Vec::new());

static COLOR_BG: AtomicU32 = AtomicU32::new(0x003b252a);
static COLOR_TEXT: AtomicU32 = AtomicU32::new(0x00ffffff);
static COLOR_HOVER: AtomicU32 = AtomicU32::new(0x00472e34);

const MENU_WIDTH: i32 = 190;
const ITEM_HEIGHT: i32 = 34;
const PADDING_V: i32 = 5;
const PADDING_H: i32 = 14;

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn tray_menu_wnd_proc(
    hwnd: isize,
    msg: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    match msg {
        WM_NCHITTEST => HTCLIENT,
        WM_SETCURSOR => {
            let h_cursor = LoadCursorW(0, IDC_ARROW as *const u16);
            SetCursor(h_cursor);
            1
        }
        WM_PAINT => {
            let mut ps = std::mem::zeroed::<PAINTSTRUCT>();
            let hdc = BeginPaint(hwnd, &mut ps);

            let mut rc = std::mem::zeroed::<RECT>();
            GetClientRect(hwnd, &mut rc);
            let w = rc.right - rc.left;
            let h = rc.bottom - rc.top;

            let mem_dc = CreateCompatibleDC(hdc);
            let mem_bm = CreateCompatibleBitmap(hdc, w, h);
            let old_bm = SelectObject(mem_dc, mem_bm);

            let bg_val = COLOR_BG.load(Ordering::SeqCst);
            let text_val = COLOR_TEXT.load(Ordering::SeqCst);
            let hover_val = COLOR_HOVER.load(Ordering::SeqCst);

            let bg_brush = CreateSolidBrush(bg_val);
            FillRect(mem_dc, &rc, bg_brush);
            DeleteObject(bg_brush);

            SetBkMode(mem_dc, 1);
            let font_name = {
                let global_font = MENU_FONT_NAME.lock().unwrap();
                if global_font.is_empty() {
                    to_wide("Segoe UI")
                } else {
                    global_font.clone()
                }
            };
            let hfont = CreateFontW(
                -13, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, font_name.as_ptr(),
            );
            let old_font = SelectObject(mem_dc, hfont);

            let current_hover = HOVER_INDEX.load(Ordering::SeqCst);
            let items = MENU_ITEMS.lock().unwrap();

            for (i, item) in items.iter().enumerate() {
                let item_top = PADDING_V + (i as i32) * ITEM_HEIGHT;
                let item_bottom = item_top + ITEM_HEIGHT;

                if i as i32 == current_hover {
                    let hover_rc = RECT {
                        left: 0,
                        top: item_top,
                        right: w,
                        bottom: item_bottom,
                    };
                    let hover_brush = CreateSolidBrush(hover_val);
                    FillRect(mem_dc, &hover_rc, hover_brush);
                    DeleteObject(hover_brush);
                }

                let mut text_rc = RECT {
                    left: PADDING_H,
                    top: item_top,
                    right: w - PADDING_H,
                    bottom: item_bottom,
                };

                SetTextColor(mem_dc, text_val);
                DrawTextW(
                    mem_dc,
                    item.as_ptr(),
                    -1,
                    &mut text_rc,
                    DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX,
                );
            }

            SelectObject(mem_dc, old_font);
            DeleteObject(hfont);

            BitBlt(hdc, 0, 0, w, h, mem_dc, 0, 0, 0x00CC0020);
            SelectObject(mem_dc, old_bm);
            DeleteObject(mem_bm);
            DeleteDC(mem_dc);

            EndPaint(hwnd, &ps);
            0
        }
        WM_MOUSEMOVE => {
            let h_cursor = LoadCursorW(0, IDC_ARROW as *const u16);
            SetCursor(h_cursor);

            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;

            let mut rc = std::mem::zeroed::<RECT>();
            GetClientRect(hwnd, &mut rc);

            let items_len = {
                let items = MENU_ITEMS.lock().unwrap();
                items.len() as i32
            };

            let mut new_hover = -1;
            if x >= 0 && x < rc.right && y >= PADDING_V && y < PADDING_V + items_len * ITEM_HEIGHT {
                new_hover = (y - PADDING_V) / ITEM_HEIGHT;
                if new_hover >= items_len {
                    new_hover = -1;
                }
            }

            let old_hover = HOVER_INDEX.swap(new_hover, Ordering::SeqCst);
            if old_hover != new_hover {
                InvalidateRect(hwnd, std::ptr::null(), 0);
            }

            let mut tme = TRACKMOUSEEVENT {
                cb_size: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                dw_flags: TME_LEAVE,
                hwnd_track: hwnd,
                dw_hover_time: 0,
            };
            TrackMouseEvent(&mut tme);
            0
        }
        WM_MOUSELEAVE => {
            HOVER_INDEX.store(-1, Ordering::SeqCst);
            InvalidateRect(hwnd, std::ptr::null(), 0);
            0
        }
        WM_LBUTTONDOWN => {
            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;
            let mut rc = std::mem::zeroed::<RECT>();
            GetClientRect(hwnd, &mut rc);

            if x < 0 || x >= rc.right || y < 0 || y >= rc.bottom {
                SELECTED_INDEX.store(-1, Ordering::SeqCst);
                DestroyWindow(hwnd);
            }
            0
        }
        WM_LBUTTONUP => {
            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;
            let mut rc = std::mem::zeroed::<RECT>();
            GetClientRect(hwnd, &mut rc);

            let items_len = {
                let items = MENU_ITEMS.lock().unwrap();
                items.len() as i32
            };

            if x >= 0 && x < rc.right && y >= PADDING_V && y < PADDING_V + items_len * ITEM_HEIGHT {
                let idx = (y - PADDING_V) / ITEM_HEIGHT;
                if idx >= 0 && idx < items_len {
                    SELECTED_INDEX.store(idx, Ordering::SeqCst);
                }
            }
            DestroyWindow(hwnd);
            0
        }
        WM_RBUTTONDOWN | WM_KILLFOCUS => {
            DestroyWindow(hwnd);
            0
        }
        WM_ACTIVATE => {
            if (wparam & 0xFFFF) == 0 {
                DestroyWindow(hwnd);
            }
            0
        }
        WM_KEYDOWN => {
            if wparam == VK_ESCAPE {
                SELECTED_INDEX.store(-1, Ordering::SeqCst);
                DestroyWindow(hwnd);
            }
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

#[napi]
pub fn show_native_tray_menu(
    tray_x: i32,
    tray_y: i32,
    _tray_w: i32,
    tray_h: i32,
    items: Vec<String>,
    bg_color: Option<u32>,
    text_color: Option<u32>,
    hover_color: Option<u32>,
    _border_color: Option<u32>,
    font_name: Option<String>,
) -> Result<i32> {
    if items.is_empty() {
        return Ok(-1);
    }

    let bg = bg_color.unwrap_or(0x003b252a);
    let text = text_color.unwrap_or(0x00ffffff);
    let hover = hover_color.unwrap_or(0x00472e34);

    COLOR_BG.store(bg, Ordering::SeqCst);
    COLOR_TEXT.store(text, Ordering::SeqCst);
    COLOR_HOVER.store(hover, Ordering::SeqCst);

    let fname = font_name.unwrap_or_else(|| "Segoe UI".to_string());
    let wide_fname = to_wide(&fname);
    {
        let mut global_font = MENU_FONT_NAME.lock().unwrap();
        *global_font = wide_fname;
    }

    let wide_items: Vec<Vec<u16>> = items.iter().map(|s| to_wide(s)).collect();
    let items_count = wide_items.len() as i32;

    {
        let mut global_items = MENU_ITEMS.lock().unwrap();
        *global_items = wide_items;
    }

    HOVER_INDEX.store(-1, Ordering::SeqCst);
    SELECTED_INDEX.store(-1, Ordering::SeqCst);

    let class_name = to_wide("OrbitaNativeTrayMenuClass_v3");
    let window_name = to_wide("OrbitaTrayMenu");

    unsafe {
        let h_cursor = LoadCursorW(0, IDC_ARROW as *const u16);
        let mut wc = std::mem::zeroed::<WNDCLASSEXW>();
        wc.cb_size = std::mem::size_of::<WNDCLASSEXW>() as u32;
        wc.lpfn_wnd_proc = Some(tray_menu_wnd_proc);
        wc.lpsz_class_name = class_name.as_ptr();
        wc.h_cursor = h_cursor;
        wc.hbr_background = COLOR_WINDOW;
        RegisterClassExW(&wc);

        let total_height = PADDING_V * 2 + items_count * ITEM_HEIGHT;
        let total_width = MENU_WIDTH;

        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);

        let mut cursor_pt = POINT { x: 0, y: 0 };
        GetCursorPos(&mut cursor_pt);
        if cursor_pt.x == 0 && cursor_pt.y == 0 {
            cursor_pt.x = tray_x;
            cursor_pt.y = tray_y;
        }

        let mut menu_x = cursor_pt.x;
        let mut menu_y = cursor_pt.y - total_height;

        if menu_x + total_width > screen_w - 4 {
            menu_x = cursor_pt.x - total_width;
        }
        if menu_x + total_width > screen_w - 4 {
            menu_x = screen_w - total_width - 4;
        }
        if menu_x < 4 {
            menu_x = 4;
        }

        if menu_y < 4 {
            menu_y = cursor_pt.y + tray_h.max(16);
        }
        if menu_y + total_height > screen_h - 4 {
            menu_y = screen_h - total_height - 4;
        }

        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_TOPMOST,
            class_name.as_ptr(),
            window_name.as_ptr(),
            WS_POPUP,
            menu_x,
            menu_y,
            total_width,
            total_height,
            0,
            0,
            0,
            std::ptr::null_mut(),
        );

        if hwnd == 0 {
            return Ok(-1);
        }

        let rgn = CreateRoundRectRgn(0, 0, total_width + 1, total_height + 1, 16, 16);
        SetWindowRgn(hwnd, rgn, 1);

        SetCursor(h_cursor);
        ShowWindow(hwnd, SW_SHOW);
        SetForegroundWindow(hwnd);
        SetFocus(hwnd);
        SetCapture(hwnd);

        let mut msg = std::mem::zeroed::<MSG>();
        while GetMessageW(&mut msg, 0, 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        ReleaseCapture();
    }

    Ok(SELECTED_INDEX.load(Ordering::SeqCst))
}

#[napi]
pub fn rust_detect_voice_activity(samples: Float32Array, threshold: Option<f64>) -> bool {
    let thresh = threshold.unwrap_or(0.006) as f32;
    let s = samples.as_ref();
    if s.is_empty() {
        return false;
    }
    let mut max_abs: f32 = 0.0;
    let mut sum_sq: f32 = 0.0;
    for &val in s {
        let abs_val = val.abs();
        if abs_val > max_abs {
            max_abs = abs_val;
        }
        sum_sq += val * val;
    }
    let rms = sum_sq / (s.len() as f32);
    let thresh_sq = thresh * thresh;
    max_abs >= thresh || rms >= thresh_sq
}

fn internal_get_cipher(master_key_hex: &str) -> Result<Aes256Gcm> {
    let key_bytes = hex::decode(master_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid master key hex: {}", e)))?;
    if key_bytes.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Master key must be 32 bytes"));
    }
    let mut key_arr = SensitiveKey([0u8; 32]);
    key_arr.0.copy_from_slice(&key_bytes);
    Aes256Gcm::new_from_slice(&key_arr.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create cipher: {}", e)))
}

fn internal_encrypt_data(data: &[u8], cipher: &Aes256Gcm) -> Result<Vec<u8>> {
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Encrypt failed: {}", e)))?;
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn internal_decrypt_data(data: &[u8], cipher: &Aes256Gcm) -> Result<Vec<u8>> {
    if data.len() < 28 {
        return Err(Error::new(Status::InvalidArg, "Data too short for AES-GCM"));
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Decrypt failed: {}", e)))
}

fn internal_pbkdf2_sha256(password: &[u8], salt: &[u8], iterations: u32, out: &mut [u8]) {
    use hmac::{Hmac, Mac};
    type HmacSha256 = Hmac<Sha256>;
    let mut block_idx = 1u32;
    let mut out_offset = 0;
    while out_offset < out.len() {
        let mut mac = <HmacSha256 as Mac>::new_from_slice(password).expect("HMAC valid key");
        mac.update(salt);
        mac.update(&block_idx.to_be_bytes());
        let mut u = mac.finalize().into_bytes();
        let mut ti = u;
        for _ in 1..iterations {
            let mut mac = <HmacSha256 as Mac>::new_from_slice(password).expect("HMAC valid key");
            mac.update(&u);
            u = mac.finalize().into_bytes();
            for (t_byte, u_byte) in ti.iter_mut().zip(u.iter()) {
                *t_byte ^= u_byte;
            }
        }
        let to_copy = (out.len() - out_offset).min(ti.len());
        out[out_offset..out_offset + to_copy].copy_from_slice(&ti[..to_copy]);
        out_offset += to_copy;
        block_idx += 1;
    }
}

#[derive(serde::Deserialize)]
struct PinPayload {
    salt: String,
    iv: String,
    tag: String,
    data: String,
}

#[derive(serde::Serialize)]
struct PinOutput {
    salt: String,
    iv: String,
    tag: String,
    data: String,
}

#[napi]
pub fn rust_unlock_with_pin(pin: String, payload_json: String) -> Result<Option<String>> {
    let payload: PinPayload = match serde_json::from_str(&payload_json) {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };
    let salt = match hex::decode(&payload.salt) {
        Ok(s) => s,
        Err(_) => return Ok(None),
    };
    let iv = match hex::decode(&payload.iv) {
        Ok(i) => i,
        Err(_) => return Ok(None),
    };
    let tag = match hex::decode(&payload.tag) {
        Ok(t) => t,
        Err(_) => return Ok(None),
    };
    let ciphertext = match hex::decode(&payload.data) {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };
    if iv.len() != 12 || tag.len() != 16 {
        return Ok(None);
    }

    let mut derived_key = SensitiveKey([0u8; 32]);
    internal_pbkdf2_sha256(pin.as_bytes(), &salt, 100_000, &mut derived_key.0);

    let cipher = match Aes256Gcm::new_from_slice(&derived_key.0) {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };

    let mut combined = Vec::with_capacity(ciphertext.len() + tag.len());
    combined.extend_from_slice(&ciphertext);
    combined.extend_from_slice(&tag);

    let nonce = Nonce::from_slice(&iv);
    match cipher.decrypt(nonce, combined.as_ref()) {
        Ok(decrypted) => {
            if decrypted.len() == 32 {
                Ok(Some(hex::encode(decrypted)))
            } else {
                Ok(None)
            }
        }
        Err(_) => Ok(None),
    }
}

#[napi]
pub fn rust_setup_pin(pin: String, key_hex: String) -> Result<String> {
    let key_bytes = hex::decode(&key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    if key_bytes.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Key must be 32 bytes"));
    }

    let mut salt = [0u8; 16];
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut iv);

    let mut derived_key = SensitiveKey([0u8; 32]);
    internal_pbkdf2_sha256(pin.as_bytes(), &salt, 100_000, &mut derived_key.0);

    let cipher = Aes256Gcm::new_from_slice(&derived_key.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Cipher init failed: {}", e)))?;

    let nonce = Nonce::from_slice(&iv);
    let encrypted = cipher
        .encrypt(nonce, key_bytes.as_slice())
        .map_err(|e| Error::new(Status::GenericFailure, format!("Encryption failed: {}", e)))?;

    let tag_offset = encrypted.len() - 16;
    let (ciphertext_slice, tag_slice) = encrypted.split_at(tag_offset);

    let out = PinOutput {
        salt: hex::encode(salt),
        iv: hex::encode(iv),
        tag: hex::encode(tag_slice),
        data: hex::encode(ciphertext_slice),
    };

    serde_json::to_string(&out)
        .map_err(|e| Error::new(Status::GenericFailure, format!("JSON serialize failed: {}", e)))
}

#[napi]
pub fn rust_encrypt_data(data: Buffer, master_key_hex: String) -> Result<Buffer> {
    let cipher = internal_get_cipher(&master_key_hex)?;
    let enc = internal_encrypt_data(data.as_ref(), &cipher)?;
    Ok(enc.into())
}

#[napi]
pub fn rust_decrypt_data(data: Buffer, master_key_hex: String) -> Result<Option<Buffer>> {
    let cipher = match internal_get_cipher(&master_key_hex) {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };
    match internal_decrypt_data(data.as_ref(), &cipher) {
        Ok(dec) => Ok(Some(dec.into())),
        Err(_) => Ok(None),
    }
}

#[napi]
pub fn get_direct_chat_id(user_a_uuid: String, user_b_uuid: String) -> Result<String> {
    let a = user_a_uuid.trim().to_lowercase();
    let b = user_b_uuid.trim().to_lowercase();
    if a.is_empty() || b.is_empty() {
        let mut rng = rand::thread_rng();
        let mut u = [0u8; 16];
        rng.fill_bytes(&mut u);
        u[6] = (u[6] & 0x0f) | 0x40;
        u[8] = (u[8] & 0x3f) | 0x80;
        let hex_str = hex::encode(u);
        return Ok(format!(
            "{}-{}-{}-{}-{}",
            &hex_str[0..8],
            &hex_str[8..12],
            &hex_str[12..16],
            &hex_str[16..20],
            &hex_str[20..32]
        ));
    }
    let mut pair = [a, b];
    pair.sort();
    let formatted = format!("orbita:direct:{}:{}", pair[0], pair[1]);
    let mut hasher = Sha256::new();
    hasher.update(formatted.as_bytes());
    let mut digest = hasher.finalize();
    digest[6] = (digest[6] & 0x0f) | 0x40;
    digest[8] = (digest[8] & 0x3f) | 0x80;
    let hex_str = hex::encode(&digest[0..16]);
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex_str[0..8],
        &hex_str[8..12],
        &hex_str[12..16],
        &hex_str[16..20],
        &hex_str[20..32]
    ))
}

#[napi]
pub fn derive_channel_key(channel_id: String) -> Result<String> {
    let ikm = format!("orbita:channel:{}", channel_id.trim());
    let salt = [0u8; 32];
    let hk = Hkdf::<Sha256>::new(Some(&salt), ikm.as_bytes());
    let mut okm = SensitiveKey([0u8; 32]);
    hk.expand(b"orbita-channel-e2ee-key", &mut okm.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("HKDF expand failed: {:?}", e)))?;
    Ok(hex::encode(&okm.0))
}

#[napi]
pub fn derive_ticket_key(ticket_number: String) -> Result<String> {
    let ikm = format!("orbita:ticket:{}", ticket_number.trim().to_uppercase());
    let salt = [0u8; 32];
    let hk = Hkdf::<Sha256>::new(Some(&salt), ikm.as_bytes());
    let mut okm = SensitiveKey([0u8; 32]);
    hk.expand(b"orbita-ticket-e2ee-key", &mut okm.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("HKDF expand failed: {:?}", e)))?;
    Ok(hex::encode(&okm.0))
}

fn open_storage_db(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open sqlite {}: {}", db_path, e)))?;
    conn.execute_batch(
        "PRAGMA busy_timeout = 5000;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA wal_autocheckpoint = 2000;
         PRAGMA cache_size = -8192;"
    ).map_err(|e| Error::new(Status::GenericFailure, format!("Failed to set pragma: {}", e)))?;
    Ok(conn)
}

#[napi]
pub fn rust_storage_init_db(db_path: String) -> Result<bool> {
    let conn = open_storage_db(&db_path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS kv_store (
             key TEXT PRIMARY KEY,
             value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS messages (
             id TEXT PRIMARY KEY,
             chat_id TEXT NOT NULL,
             message_data TEXT NOT NULL,
             created_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
         CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);"
    ).map_err(|e| Error::new(Status::GenericFailure, format!("Failed to init tables: {}", e)))?;
    Ok(true)
}

#[napi]
pub fn rust_storage_close_db(db_path: String) -> Result<bool> {
    let conn = open_storage_db(&db_path)?;
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    Ok(true)
}

fn get_vault_file_path(vault_dir: &str, key: &str) -> std::path::PathBuf {
    let safe_key: String = key
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    Path::new(vault_dir).join(format!("{}.enc", safe_key))
}

#[napi]
pub fn rust_storage_kv_get(
    db_path: String,
    key: String,
    master_key_hex: String,
    vault_dir: Option<String>,
) -> Result<Option<String>> {
    let cipher = internal_get_cipher(&master_key_hex)?;
    let conn = open_storage_db(&db_path)?;

    let mut stmt = conn
        .prepare_cached("SELECT value FROM kv_store WHERE key = ?1")
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

    let row: Option<String> = stmt
        .query_row(params![key], |r| r.get(0))
        .ok();

    if let Some(val_b64) = row {
        if let Ok(enc_bytes) = BASE64_STANDARD.decode(val_b64.trim()) {
            if let Ok(decrypted) = internal_decrypt_data(&enc_bytes, &cipher) {
                if let Ok(s) = String::from_utf8(decrypted) {
                    return Ok(Some(s));
                }
            }
        }
    }

    if let Some(ref vdir) = vault_dir {
        let p = get_vault_file_path(vdir, &key);
        if p.exists() {
            if let Ok(raw) = std::fs::read(&p) {
                if let Ok(dec) = internal_decrypt_data(&raw, &cipher) {
                    if let Ok(shadow_val) = String::from_utf8(dec) {
                        if let Ok(enc_bytes) = internal_encrypt_data(shadow_val.as_bytes(), &cipher) {
                            let enc_b64 = BASE64_STANDARD.encode(&enc_bytes);
                            let _ = conn.execute(
                                "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?1, ?2)",
                                params![key, enc_b64],
                            );
                        }
                        return Ok(Some(shadow_val));
                    }
                }
            }
        }
    }

    Ok(None)
}

#[napi]
pub fn rust_storage_kv_set(
    db_path: String,
    key: String,
    value: String,
    master_key_hex: String,
    vault_dir: Option<String>,
) -> Result<bool> {
    let cipher = internal_get_cipher(&master_key_hex)?;
    let enc_bytes = internal_encrypt_data(value.as_bytes(), &cipher)?;
    let enc_b64 = BASE64_STANDARD.encode(&enc_bytes);

    let is_critical = key.contains("auth")
        || key.contains("chat")
        || key.contains("registry")
        || key.contains("account");

    if is_critical {
        if let Some(ref vdir) = vault_dir {
            let p = get_vault_file_path(vdir, &key);
            let _ = std::fs::write(p, &enc_bytes);
        }
    }

    let conn = open_storage_db(&db_path)?;
    conn.execute(
        "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?1, ?2)",
        params![key, enc_b64],
    ).map_err(|e| Error::new(Status::GenericFailure, format!("KV insert failed: {}", e)))?;

    Ok(true)
}

#[napi]
pub fn rust_storage_kv_remove(
    db_path: String,
    key: String,
    vault_dir: Option<String>,
) -> Result<bool> {
    if let Some(ref vdir) = vault_dir {
        let p = get_vault_file_path(vdir, &key);
        if p.exists() {
            let _ = std::fs::remove_file(p);
        }
    }
    let conn = open_storage_db(&db_path)?;
    conn.execute("DELETE FROM kv_store WHERE key = ?1", params![key])
        .map_err(|e| Error::new(Status::GenericFailure, format!("KV delete failed: {}", e)))?;
    Ok(true)
}

#[napi]
pub fn rust_storage_kv_flush(db_path: String) -> Result<bool> {
    let conn = open_storage_db(&db_path)?;
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");
    Ok(true)
}

#[napi]
pub fn rust_storage_add_message(
    db_path: String,
    chat_id: String,
    message_id: String,
    message_json: String,
    master_key_hex: String,
    created_at_opt: Option<i64>,
) -> Result<bool> {
    let cipher = internal_get_cipher(&master_key_hex)?;
    let enc_bytes = internal_encrypt_data(message_json.as_bytes(), &cipher)?;
    let enc_b64 = BASE64_STANDARD.encode(&enc_bytes);

    let created_at = created_at_opt.unwrap_or_else(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    });

    let conn = open_storage_db(&db_path)?;
    conn.execute(
        "INSERT OR REPLACE INTO messages (id, chat_id, message_data, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![message_id, chat_id, enc_b64, created_at],
    ).map_err(|e| Error::new(Status::GenericFailure, format!("Add message failed: {}", e)))?;

    Ok(true)
}

#[derive(serde::Deserialize)]
struct BatchMessageItem {
    id: String,
    #[serde(rename = "messageData")]
    message_data: serde_json::Value,
}

#[napi]
pub fn rust_storage_add_messages_batch(
    db_path: String,
    chat_id: String,
    messages_json: String,
    master_key_hex: String,
) -> Result<bool> {
    let items: Vec<BatchMessageItem> = serde_json::from_str(&messages_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid batch JSON: {}", e)))?;

    if items.is_empty() {
        return Ok(true);
    }

    let cipher = internal_get_cipher(&master_key_hex)?;
    let mut conn = open_storage_db(&db_path)?;
    let tx = conn
        .transaction()
        .map_err(|e| Error::new(Status::GenericFailure, format!("Transaction failed: {}", e)))?;

    {
        let mut stmt = tx
            .prepare_cached("INSERT OR REPLACE INTO messages (id, chat_id, message_data, created_at) VALUES (?1, ?2, ?3, ?4)")
            .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        for item in items {
            let json_str = match serde_json::to_string(&item.message_data) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let enc_bytes = match internal_encrypt_data(json_str.as_bytes(), &cipher) {
                Ok(b) => b,
                Err(_) => continue,
            };
            let enc_b64 = BASE64_STANDARD.encode(&enc_bytes);

            let created_at = item
                .message_data
                .get("time")
                .and_then(|t| t.as_i64())
                .unwrap_or(now);

            let _ = stmt.execute(params![item.id, chat_id, enc_b64, created_at]);
        }
    }

    tx.commit()
        .map_err(|e| Error::new(Status::GenericFailure, format!("Commit failed: {}", e)))?;

    Ok(true)
}

#[napi]
pub fn rust_storage_get_messages(
    db_path: String,
    chat_id: String,
    master_key_hex: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<String>> {
    let cipher = internal_get_cipher(&master_key_hex)?;
    let conn = open_storage_db(&db_path)?;

    let is_account_2 = chat_id.starts_with("account_2:::");
    let is_account_1 = chat_id.starts_with("account_1:::");

    let mut sql = if is_account_2 {
        "SELECT id, message_data FROM messages WHERE chat_id = ?1 ORDER BY created_at ASC".to_string()
    } else if is_account_1 {
        "SELECT id, message_data FROM messages WHERE chat_id IN (?1, ?2) ORDER BY created_at ASC".to_string()
    } else {
        "SELECT id, message_data FROM messages WHERE chat_id IN (?1, ?2) ORDER BY created_at ASC".to_string()
    };

    if let Some(l) = limit {
        sql.push_str(&format!(" LIMIT {}", l));
    }
    if let Some(o) = offset {
        sql.push_str(&format!(" OFFSET {}", o));
    }

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

    let p1 = chat_id.clone();
    let p2 = if is_account_1 {
        chat_id.replace("account_1:::", "")
    } else {
        format!("account_1:::{}", chat_id)
    };

    let mut raw_rows = Vec::new();
    if is_account_2 {
        let rows = stmt
            .query_map(params![p1], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| Error::new(Status::GenericFailure, format!("Query failed: {}", e)))?;
        for r in rows {
            if let Ok(pair) = r {
                raw_rows.push(pair);
            }
        }
    } else {
        let rows = stmt
            .query_map(params![p1, p2], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| Error::new(Status::GenericFailure, format!("Query failed: {}", e)))?;
        for r in rows {
            if let Ok(pair) = r {
                raw_rows.push(pair);
            }
        }
    }

    let mut seen_ids = HashSet::new();
    let mut results = Vec::new();

    for (id, enc_b64) in raw_rows {
        if !seen_ids.insert(id) {
            continue;
        }
        if let Ok(enc_bytes) = BASE64_STANDARD.decode(enc_b64.trim()) {
            if let Ok(dec_bytes) = internal_decrypt_data(&enc_bytes, &cipher) {
                if let Ok(json_str) = String::from_utf8(dec_bytes) {
                    results.push(json_str);
                }
            }
        }
    }

    Ok(results)
}

#[napi]
pub fn rust_storage_get_all_recent_messages(
    db_path: String,
    scope_prefix: Option<String>,
    limit_per_chat: i64,
    master_key_hex: String,
) -> Result<String> {
    let cipher = internal_get_cipher(&master_key_hex)?;
    let conn = open_storage_db(&db_path)?;

    let is_account_2 = scope_prefix.as_deref() == Some("account_2");
    let sql = if is_account_2 {
        "SELECT id, chat_id, message_data, created_at FROM messages WHERE chat_id LIKE 'account_2:::%' ORDER BY created_at ASC"
    } else {
        "SELECT id, chat_id, message_data, created_at FROM messages WHERE chat_id LIKE 'account_1:::%' OR chat_id NOT LIKE 'account_%:::%' ORDER BY created_at ASC"
    };

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| Error::new(Status::GenericFailure, format!("Query failed: {}", e)))?;

    let mut seen_ids = HashSet::new();
    let mut map: std::collections::HashMap<String, Vec<serde_json::Value>> = std::collections::HashMap::new();

    for row in rows {
        if let Ok((id, chat_id, enc_b64)) = row {
            if !seen_ids.insert(id) {
                continue;
            }
            if let Ok(enc_bytes) = BASE64_STANDARD.decode(enc_b64.trim()) {
                if let Ok(dec_bytes) = internal_decrypt_data(&enc_bytes, &cipher) {
                    if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&dec_bytes) {
                        let mut raw_chat_id = chat_id;
                        if raw_chat_id.starts_with("account_1:::") {
                            raw_chat_id = raw_chat_id.replacen("account_1:::", "", 1);
                        } else if raw_chat_id.starts_with("account_2:::") {
                            raw_chat_id = raw_chat_id.replacen("account_2:::", "", 1);
                        }
                        map.entry(raw_chat_id).or_default().push(val);
                    }
                }
            }
        }
    }

    let limit = if limit_per_chat > 0 { limit_per_chat as usize } else { 30 };
    for list in map.values_mut() {
        if list.len() > limit {
            let start = list.len() - limit;
            *list = list[start..].to_vec();
        }
    }

    serde_json::to_string(&map)
        .map_err(|e| Error::new(Status::GenericFailure, format!("JSON serialize failed: {}", e)))
}

#[napi]
pub fn rust_storage_delete_messages(db_path: String, chat_id: String) -> Result<bool> {
    let conn = open_storage_db(&db_path)?;
    let is_account_2 = chat_id.starts_with("account_2:::");
    let is_account_1 = chat_id.starts_with("account_1:::");

    if is_account_2 {
        conn.execute("DELETE FROM messages WHERE chat_id = ?1", params![chat_id])
    } else if is_account_1 {
        let raw_id = chat_id.replace("account_1:::", "");
        conn.execute("DELETE FROM messages WHERE chat_id IN (?1, ?2)", params![chat_id, raw_id])
    } else {
        let scoped_id = format!("account_1:::{}", chat_id);
        conn.execute("DELETE FROM messages WHERE chat_id IN (?1, ?2)", params![chat_id, scoped_id])
    }.map_err(|e| Error::new(Status::GenericFailure, format!("Delete messages failed: {}", e)))?;

    Ok(true)
}

#[napi]
pub fn rust_storage_delete_message(db_path: String, id: String) -> Result<bool> {
    let conn = open_storage_db(&db_path)?;
    let is_account_2 = id.starts_with("account_2:::");
    let is_account_1 = id.starts_with("account_1:::");

    if is_account_2 {
        conn.execute("DELETE FROM messages WHERE id = ?1", params![id])
    } else if is_account_1 {
        let raw_id = id.replace("account_1:::", "");
        conn.execute("DELETE FROM messages WHERE id IN (?1, ?2)", params![id, raw_id])
    } else {
        let scoped_id = format!("account_1:::{}", id);
        conn.execute("DELETE FROM messages WHERE id IN (?1, ?2)", params![id, scoped_id])
    }.map_err(|e| Error::new(Status::GenericFailure, format!("Delete message failed: {}", e)))?;

    Ok(true)
}