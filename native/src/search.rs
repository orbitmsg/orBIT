use napi::bindgen_prelude::*;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use base64::prelude::*;
use std::collections::HashMap;
use std::path::Path;
use crate::crypto::{internal_get_cipher, internal_decrypt_data};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchHit {
    pub id: String,
    pub message_id: String,
    pub chat_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}

fn open_search_db(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to open sqlite {}: {}", db_path, e)))?;
    conn.execute_batch(
        "PRAGMA busy_timeout = 5000;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = -8192;"
    ).map_err(|e| Error::new(Status::GenericFailure, format!("Failed to set pragma: {}", e)))?;
    Ok(conn)
}

pub fn ensure_fts_table(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
             message_id UNINDEXED,
             chat_id UNINDEXED,
             content,
             tokenize = 'unicode61'
         );"
    )
}

fn sanitize_fts5_query(input: &str) -> Option<String> {
    let mut tokens = Vec::new();
    let mut current_token = String::new();

    for c in input.chars() {
        if c.is_alphanumeric() || c == '_' {
            current_token.push(c);
        } else if !current_token.is_empty() {
            tokens.push(current_token.clone());
            current_token.clear();
        }
    }
    if !current_token.is_empty() {
        tokens.push(current_token);
    }

    if tokens.is_empty() {
        return None;
    }

    let query_str = tokens
        .into_iter()
        .map(|tok| format!("\"{}\"*", tok))
        .collect::<Vec<_>>()
        .join(" ");

    Some(query_str)
}

pub fn extract_searchable_content(value: &serde_json::Value) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();

    if let Some(text) = value.get("text").and_then(|v| v.as_str()) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed);
        }
    }
    if let Some(media_name) = value.get("mediaName").and_then(|v| v.as_str()) {
        let trimmed = media_name.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed);
        }
    }
    if let Some(file_name) = value.get("fileName").and_then(|v| v.as_str()) {
        let trimmed = file_name.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed);
        }
    }
    if let Some(sender) = value.get("sender").and_then(|v| v.as_str()) {
        let trimmed = sender.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed);
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

#[napi]
pub fn rust_search_messages(
    db_path: String,
    query: String,
    limit: Option<u32>,
) -> Result<String> {
    let q_trimmed = query.trim();
    if q_trimmed.is_empty() {
        return Ok("[]".to_string());
    }

    let fts_query = match sanitize_fts5_query(q_trimmed) {
        Some(q) => q,
        None => return Ok("[]".to_string()),
    };

    if !Path::new(&db_path).exists() {
        return Ok("[]".to_string());
    }

    let conn = open_search_db(&db_path)?;
    let _ = ensure_fts_table(&conn);

    let effective_limit = match limit {
        Some(l) if l > 0 => l.min(1000) as i64,
        _ => 50,
    };

    let mut stmt = conn
        .prepare(
            "SELECT message_id, chat_id, snippet(messages_fts, 2, '<b>', '</b>', '...', 16)
             FROM messages_fts
             WHERE messages_fts MATCH ?1
             ORDER BY bm25(messages_fts) ASC
             LIMIT ?2"
        )
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare FTS query failed: {}", e)))?;

    let rows = stmt
        .query_map(params![fts_query, effective_limit], |row| {
            let msg_id: String = row.get(0)?;
            let chat_id: String = row.get(1)?;
            let snippet: Option<String> = row.get(2).ok();
            Ok(SearchHit {
                id: msg_id.clone(),
                message_id: msg_id,
                chat_id,
                snippet,
            })
        })
        .map_err(|e| Error::new(Status::GenericFailure, format!("Execute FTS query failed: {}", e)))?;

    let mut hits = Vec::new();
    for r in rows {
        if let Ok(hit) = r {
            hits.push(hit);
        }
    }

    serde_json::to_string(&hits)
        .map_err(|e| Error::new(Status::GenericFailure, format!("JSON serialize failed: {}", e)))
}

#[napi]
pub fn rust_search_messages_in_chat(
    db_path: String,
    chat_id: String,
    query: String,
    limit: Option<u32>,
) -> Result<String> {
    let q_trimmed = query.trim();
    if q_trimmed.is_empty() {
        return Ok("[]".to_string());
    }

    let fts_query = match sanitize_fts5_query(q_trimmed) {
        Some(q) => q,
        None => return Ok("[]".to_string()),
    };

    if !Path::new(&db_path).exists() {
        return Ok("[]".to_string());
    }

    let conn = open_search_db(&db_path)?;
    let _ = ensure_fts_table(&conn);

    let effective_limit = match limit {
        Some(l) if l > 0 => l.min(1000) as i64,
        _ => 50,
    };

    let is_account_2 = chat_id.starts_with("account_2:::");
    let is_account_1 = chat_id.starts_with("account_1:::");

    let sql = if is_account_2 {
        "SELECT message_id, chat_id, snippet(messages_fts, 2, '<b>', '</b>', '...', 16)
         FROM messages_fts
         WHERE messages_fts MATCH ?1 AND chat_id = ?2
         ORDER BY bm25(messages_fts) ASC
         LIMIT ?3"
    } else {
        "SELECT message_id, chat_id, snippet(messages_fts, 2, '<b>', '</b>', '...', 16)
         FROM messages_fts
         WHERE messages_fts MATCH ?1 AND chat_id IN (?2, ?3)
         ORDER BY bm25(messages_fts) ASC
         LIMIT ?4"
    };

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare FTS chat query failed: {}", e)))?;

    let p1 = chat_id.clone();
    let p2 = if is_account_1 {
        chat_id.replace("account_1:::", "")
    } else {
        format!("account_1:::{}", chat_id)
    };

    let mut hits = Vec::new();
    if is_account_2 {
        let rows = stmt
            .query_map(params![fts_query, p1, effective_limit], |row| {
                let msg_id: String = row.get(0)?;
                let c_id: String = row.get(1)?;
                let snippet: Option<String> = row.get(2).ok();
                Ok(SearchHit {
                    id: msg_id.clone(),
                    message_id: msg_id,
                    chat_id: c_id,
                    snippet,
                })
            })
            .map_err(|e| Error::new(Status::GenericFailure, format!("Execute FTS chat query failed: {}", e)))?;
        for r in rows {
            if let Ok(hit) = r {
                hits.push(hit);
            }
        }
    } else {
        let rows = stmt
            .query_map(params![fts_query, p1, p2, effective_limit], |row| {
                let msg_id: String = row.get(0)?;
                let c_id: String = row.get(1)?;
                let snippet: Option<String> = row.get(2).ok();
                Ok(SearchHit {
                    id: msg_id.clone(),
                    message_id: msg_id,
                    chat_id: c_id,
                    snippet,
                })
            })
            .map_err(|e| Error::new(Status::GenericFailure, format!("Execute FTS chat query failed: {}", e)))?;
        for r in rows {
            if let Ok(hit) = r {
                hits.push(hit);
            }
        }
    }

    serde_json::to_string(&hits)
        .map_err(|e| Error::new(Status::GenericFailure, format!("JSON serialize failed: {}", e)))
}

#[napi]
pub fn rust_search_init_fts(db_path: String) -> Result<bool> {
    let conn = open_search_db(&db_path)?;
    ensure_fts_table(&conn)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to init FTS table: {}", e)))?;
    Ok(true)
}

#[napi]
pub fn rust_search_index_message(
    db_path: String,
    message_id: String,
    chat_id: String,
    content: String,
) -> Result<bool> {
    let conn = open_search_db(&db_path)?;
    let _ = ensure_fts_table(&conn);

    let _ = conn.execute("DELETE FROM messages_fts WHERE message_id = ?1", params![message_id]);

    if !content.trim().is_empty() {
        conn.execute(
            "INSERT INTO messages_fts (message_id, chat_id, content) VALUES (?1, ?2, ?3)",
            params![message_id, chat_id, content.trim()],
        ).map_err(|e| Error::new(Status::GenericFailure, format!("Insert FTS entry failed: {}", e)))?;
    }

    Ok(true)
}

#[napi]
pub fn rust_search_delete_message(db_path: String, message_id: String) -> Result<bool> {
    if !Path::new(&db_path).exists() {
        return Ok(true);
    }
    let conn = open_search_db(&db_path)?;
    let _ = ensure_fts_table(&conn);
    let _ = conn.execute("DELETE FROM messages_fts WHERE message_id = ?1", params![message_id]);
    Ok(true)
}

#[napi]
pub fn rust_search_delete_chat(db_path: String, chat_id: String) -> Result<bool> {
    if !Path::new(&db_path).exists() {
        return Ok(true);
    }
    let conn = open_search_db(&db_path)?;
    let _ = ensure_fts_table(&conn);
    let is_account_1 = chat_id.starts_with("account_1:::");
    if is_account_1 {
        let raw_id = chat_id.replace("account_1:::", "");
        let _ = conn.execute("DELETE FROM messages_fts WHERE chat_id IN (?1, ?2)", params![chat_id, raw_id]);
    } else {
        let scoped_id = format!("account_1:::{}", chat_id);
        let _ = conn.execute("DELETE FROM messages_fts WHERE chat_id IN (?1, ?2)", params![chat_id, scoped_id]);
    }
    Ok(true)
}

#[napi]
pub fn rust_search_sync_fts(db_path: String, master_key_hex: String) -> Result<u32> {
    if !Path::new(&db_path).exists() {
        return Ok(0);
    }
    let cipher = internal_get_cipher(&master_key_hex)?;
    let mut conn = open_search_db(&db_path)?;
    ensure_fts_table(&conn)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Init FTS table failed: {}", e)))?;

    let mut pending: Vec<(String, String, String)> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT id, chat_id, message_data FROM messages WHERE id NOT IN (SELECT message_id FROM messages_fts)")
            .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare sync query failed: {}", e)))?;

        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
            .map_err(|e| Error::new(Status::GenericFailure, format!("Query sync messages failed: {}", e)))?;

        for r in rows {
            if let Ok((id, chat_id, enc_b64)) = r {
                if let Ok(enc_bytes) = BASE64_STANDARD.decode(enc_b64.trim()) {
                    if let Ok(dec_bytes) = internal_decrypt_data(&enc_bytes, &cipher) {
                        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&dec_bytes) {
                            if let Some(content) = extract_searchable_content(&val) {
                                pending.push((id, chat_id, content));
                            }
                        }
                    }
                }
            }
        }
    }

    if pending.is_empty() {
        return Ok(0);
    }

    let count = pending.len() as u32;
    let tx = conn
        .transaction()
        .map_err(|e| Error::new(Status::GenericFailure, format!("Sync transaction failed: {}", e)))?;
    {
        let mut ins_stmt = tx
            .prepare_cached("INSERT INTO messages_fts (message_id, chat_id, content) VALUES (?1, ?2, ?3)")
            .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare insert failed: {}", e)))?;

        for (id, chat_id, content) in pending {
            let _ = ins_stmt.execute(params![id, chat_id, content]);
        }
    }
    tx.commit()
        .map_err(|e| Error::new(Status::GenericFailure, format!("Commit sync failed: {}", e)))?;

    Ok(count)
}

#[derive(Deserialize)]
pub struct InMemoryDoc {
    pub id: String,
    pub chat_id: String,
    pub content: String,
}

#[napi]
pub fn rust_search_bm25_in_memory(
    docs_json: String,
    query: String,
    limit: Option<u32>,
) -> Result<String> {
    let q_trimmed = query.trim().to_lowercase();
    if q_trimmed.is_empty() {
        return Ok("[]".to_string());
    }

    let docs: Vec<InMemoryDoc> = serde_json::from_str(&docs_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid docs JSON: {}", e)))?;

    if docs.is_empty() {
        return Ok("[]".to_string());
    }

    let query_terms: Vec<String> = q_trimmed
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect();

    if query_terms.is_empty() {
        return Ok("[]".to_string());
    }

    let n = docs.len() as f64;
    let mut doc_tokens_list: Vec<Vec<String>> = Vec::with_capacity(docs.len());
    let mut total_length: usize = 0;

    for doc in &docs {
        let tokens: Vec<String> = doc.content
            .to_lowercase()
            .split(|c: char| !c.is_alphanumeric() && c != '_')
            .filter(|t| !t.is_empty())
            .map(|t| t.to_string())
            .collect();
        total_length += tokens.len();
        doc_tokens_list.push(tokens);
    }

    let avgdl = if n > 0.0 { (total_length as f64) / n } else { 1.0 }.max(1.0);

    let mut df: HashMap<&str, usize> = HashMap::new();
    for q in &query_terms {
        let mut count = 0;
        for tokens in &doc_tokens_list {
            if tokens.iter().any(|tok| tok.starts_with(q) || tok == q) {
                count += 1;
            }
        }
        df.insert(q.as_str(), count);
    }

    const K1: f64 = 1.2;
    const B: f64 = 0.75;

    let mut scored: Vec<(f64, &InMemoryDoc)> = Vec::new();

    for (idx, doc) in docs.iter().enumerate() {
        let tokens = &doc_tokens_list[idx];
        let doc_len = tokens.len() as f64;
        let mut score: f64 = 0.0;

        for q in &query_terms {
            let doc_count = *df.get(q.as_str()).unwrap_or(&0);
            if doc_count == 0 {
                continue;
            }

            let idf = ((n - (doc_count as f64) + 0.5) / ((doc_count as f64) + 0.5) + 1.0).ln();
            let tf = tokens.iter().filter(|tok| tok.starts_with(q) || *tok == q).count() as f64;
            if tf > 0.0 {
                let numerator = tf * (K1 + 1.0);
                let denominator = tf + K1 * (1.0 - B + B * (doc_len / avgdl));
                score += idf * (numerator / denominator);
            }
        }

        if score > 0.0 {
            scored.push((score, doc));
        }
    }

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let max_results = match limit {
        Some(l) if l > 0 => l as usize,
        _ => 50,
    };

    let hits: Vec<SearchHit> = scored
        .into_iter()
        .take(max_results)
        .map(|(_, doc)| {
            SearchHit {
                id: doc.id.clone(),
                message_id: doc.id.clone(),
                chat_id: doc.chat_id.clone(),
                snippet: None,
            }
        })
        .collect();

    serde_json::to_string(&hits)
        .map_err(|e| Error::new(Status::GenericFailure, format!("JSON serialize failed: {}", e)))
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
