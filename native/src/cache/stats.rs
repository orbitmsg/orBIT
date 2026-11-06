use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::Connection;
use std::collections::HashMap;

#[napi(object)]
#[derive(Default, Clone)]
pub struct CategoryStat {
    pub count: i64,
    pub size: i64,
}

#[napi(object)]
#[derive(Default, Clone)]
pub struct DetailedCacheStats {
    pub total_count: i64,
    pub total_size: i64,
    pub photos: CategoryStat,
    pub stickers: CategoryStat,
    pub voice: CategoryStat,
    pub videos: CategoryStat,
    pub other: CategoryStat,
    pub by_type: HashMap<String, CategoryStat>,
}

#[napi(object)]
#[derive(Clone)]
pub struct ChatMediaStat {
    pub chat_id: String,
    pub count: i64,
    pub size: i64,
}

pub fn get_detailed_stats_internal(conn: &Connection) -> Result<DetailedCacheStats> {
    let mut stmt = conn
        .prepare(
            "SELECT mime_type, COUNT(*), COALESCE(SUM(file_size), 0)
             FROM media_cache
             WHERE download_status = 'downloaded'
             GROUP BY mime_type",
        )
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

    let mut stats = DetailedCacheStats::default();
    let rows = stmt
        .query_map([], |row| {
            let mime: Option<String> = row.get(0)?;
            let count: i64 = row.get(1)?;
            let size: i64 = row.get(2)?;
            Ok((mime.unwrap_or_else(|| "application/octet-stream".to_string()), count, size))
        })
        .map_err(|e| Error::new(Status::GenericFailure, format!("Query failed: {}", e)))?;

    for item in rows.flatten() {
        let (mime, count, size) = item;
        stats.total_count += count;
        stats.total_size += size;

        let entry = stats.by_type.entry(mime.clone()).or_insert_with(CategoryStat::default);
        entry.count += count;
        entry.size += size;

        let lower = mime.to_lowercase();
        if lower.contains("gif") || lower.contains("sticker") {
            stats.stickers.count += count;
            stats.stickers.size += size;
        } else if lower.starts_with("image/") {
            stats.photos.count += count;
            stats.photos.size += size;
        } else if lower.starts_with("audio/") || lower.contains("opus") || lower.contains("ogg") {
            stats.voice.count += count;
            stats.voice.size += size;
        } else if lower.starts_with("video/") {
            stats.videos.count += count;
            stats.videos.size += size;
        } else {
            stats.other.count += count;
            stats.other.size += size;
        }
    }

    Ok(stats)
}

pub fn get_chat_stats_internal(conn: &Connection) -> Result<Vec<ChatMediaStat>> {
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(chat_id, ''), COUNT(*), COALESCE(SUM(file_size), 0)
             FROM media_cache
             WHERE download_status = 'downloaded'
             GROUP BY chat_id
             ORDER BY SUM(file_size) DESC",
        )
        .map_err(|e| Error::new(Status::GenericFailure, format!("Prepare failed: {}", e)))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ChatMediaStat {
                chat_id: row.get(0)?,
                count: row.get(1)?,
                size: row.get(2)?,
            })
        })
        .map_err(|e| Error::new(Status::GenericFailure, format!("Query failed: {}", e)))?;

    let mut result = Vec::new();
    for r in rows.flatten() {
        result.push(r);
    }
    Ok(result)
}
