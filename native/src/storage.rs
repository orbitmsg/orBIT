use napi::bindgen_prelude::*;
use base64::prelude::*;
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;
use crate::crypto::{internal_get_cipher, internal_encrypt_data, internal_decrypt_data};

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
         CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
         CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC);"
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
