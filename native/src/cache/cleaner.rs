use napi::bindgen_prelude::*;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

fn resolve_file_location(resolved_dir: &Path, raw_path: &str) -> PathBuf {
    let p = Path::new(raw_path);
    if let Some(file_name) = p.file_name() {
        let in_resolved = resolved_dir.join(file_name);
        if in_resolved.exists() {
            return in_resolved;
        }
    }
    PathBuf::from(raw_path)
}

pub fn clear_categories_internal(
    conn: &Connection,
    resolved_dir: &Path,
    categories: Option<Vec<String>>,
) -> Result<u32> {
    let mut where_clauses: Vec<String> = Vec::new();

    if let Some(cats) = categories {
        if !cats.is_empty() && cats.len() < 5 {
            let mut conditions = Vec::new();
            for c in cats {
                match c.as_str() {
                    "photos" => conditions.push("(mime_type LIKE 'image/%' AND mime_type NOT LIKE '%gif%')"),
                    "stickers" => conditions.push("(mime_type LIKE '%gif%' OR mime_type LIKE '%sticker%' OR mime_type LIKE '%webp%')"),
                    "voice" | "audio" => conditions.push("(mime_type LIKE 'audio/%' OR mime_type LIKE '%opus%' OR mime_type LIKE '%ogg%')"),
                    "videos" => conditions.push("mime_type LIKE 'video/%'"),
                    "other" => conditions.push("(mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%' AND mime_type NOT LIKE 'audio/%')"),
                    _ => {}
                }
            }
            if !conditions.is_empty() {
                where_clauses.push(format!("({})", conditions.join(" OR ")));
            }
        }
    }

    let sql_select = if where_clauses.is_empty() {
        "SELECT id, local_path FROM media_cache".to_string()
    } else {
        format!("SELECT id, local_path FROM media_cache WHERE {}", where_clauses.join(" AND "))
    };

    let mut stmt = conn
        .prepare(&sql_select)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| Error::new(Status::GenericFailure, format!("Query failed: {}", e)))?;

    let mut ids_to_delete = Vec::new();
    let mut deleted_count = 0u32;

    for item in rows.flatten() {
        let (id, raw_path) = item;
        let file_path = resolve_file_location(resolved_dir, &raw_path);
        if file_path.exists() {
            let _ = std::fs::remove_file(&file_path);
        }
        ids_to_delete.push(id);
        deleted_count += 1;
    }

    if !ids_to_delete.is_empty() {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| Error::new(Status::GenericFailure, format!("Transaction failed: {}", e)))?;
        {
            let mut del_stmt = tx
                .prepare_cached("DELETE FROM media_cache WHERE id = ?1")
                .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;
            for id in ids_to_delete {
                let _ = del_stmt.execute(params![id]);
            }
        }
        let _ = tx.commit();
    }

    Ok(deleted_count)
}

pub fn delete_chat_media_internal(
    conn: &Connection,
    resolved_dir: &Path,
    chat_id: &str,
) -> Result<u32> {
    let mut stmt = conn
        .prepare("SELECT id, local_path FROM media_cache WHERE chat_id = ?1 OR (?1 = '' AND (chat_id IS NULL OR chat_id = ''))")
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

    let rows = stmt
        .query_map(params![chat_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| Error::new(Status::GenericFailure, format!("Query failed: {}", e)))?;

    let mut ids_to_delete = Vec::new();
    let mut deleted_count = 0u32;

    for item in rows.flatten() {
        let (id, raw_path) = item;
        let file_path = resolve_file_location(resolved_dir, &raw_path);
        if file_path.exists() {
            let _ = std::fs::remove_file(&file_path);
        }
        ids_to_delete.push(id);
        deleted_count += 1;
    }

    if !ids_to_delete.is_empty() {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| Error::new(Status::GenericFailure, format!("Transaction failed: {}", e)))?;
        {
            let mut del_stmt = tx
                .prepare_cached("DELETE FROM media_cache WHERE id = ?1")
                .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare del failed: {}", e)))?;
            for id in ids_to_delete {
                let _ = del_stmt.execute(params![id]);
            }
        }
        let _ = tx.commit();
    }

    Ok(deleted_count)
}

pub fn evict_by_age_internal(
    conn: &Connection,
    resolved_dir: &Path,
    max_age_ms: i64,
) -> Result<u32> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let threshold = now - max_age_ms;

    let mut stmt = conn
        .prepare("SELECT id, local_path FROM media_cache WHERE last_accessed < ?1")
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

    let rows = stmt
        .query_map(params![threshold], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| Error::new(Status::GenericFailure, format!("Query failed: {}", e)))?;

    let mut ids_to_delete = Vec::new();
    let mut deleted_count = 0u32;

    for item in rows.flatten() {
        let (id, raw_path) = item;
        let file_path = resolve_file_location(resolved_dir, &raw_path);
        if file_path.exists() {
            let _ = std::fs::remove_file(&file_path);
        }
        ids_to_delete.push(id);
        deleted_count += 1;
    }

    if !ids_to_delete.is_empty() {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| Error::new(Status::GenericFailure, format!("Transaction failed: {}", e)))?;
        {
            let mut del_stmt = tx
                .prepare_cached("DELETE FROM media_cache WHERE id = ?1")
                .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;
            for id in ids_to_delete {
                let _ = del_stmt.execute(params![id]);
            }
        }
        let _ = tx.commit();
    }

    Ok(deleted_count)
}

pub fn evict_to_limit_internal(
    conn: &Connection,
    resolved_dir: &Path,
    limit_bytes: i64,
) -> Result<u32> {
    let total_size: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(file_size), 0) FROM media_cache WHERE download_status = 'downloaded'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if total_size <= limit_bytes {
        return Ok(0);
    }

    let mut current_size = total_size;
    let mut deleted_count = 0u32;

    let mut stmt = conn
        .prepare("SELECT id, local_path, file_size FROM media_cache ORDER BY last_accessed ASC")
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))
        .map_err(|e| Error::new(Status::GenericFailure, format!("Query failed: {}", e)))?;

    let mut ids_to_delete = Vec::new();

    for item in rows.flatten() {
        if current_size <= limit_bytes {
            break;
        }
        let (id, raw_path, size) = item;
        let file_path = resolve_file_location(resolved_dir, &raw_path);
        if file_path.exists() {
            let _ = std::fs::remove_file(&file_path);
        }
        ids_to_delete.push(id);
        current_size -= size;
        deleted_count += 1;
    }

    if !ids_to_delete.is_empty() {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| Error::new(Status::GenericFailure, format!("Transaction failed: {}", e)))?;
        {
            let mut del_stmt = tx
                .prepare_cached("DELETE FROM media_cache WHERE id = ?1")
                .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;
            for id in ids_to_delete {
                let _ = del_stmt.execute(params![id]);
            }
        }
        let _ = tx.commit();
    }

    Ok(deleted_count)
}
