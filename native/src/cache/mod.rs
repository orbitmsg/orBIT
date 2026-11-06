pub mod folder;
pub mod stats;
pub mod cleaner;
pub mod manager;

pub use folder::*;
pub use stats::*;
pub use cleaner::*;
pub use manager::*;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use crate::media::RustMediaResult;

#[napi]
pub fn rust_cache_resolve_folder(configured_dir: Option<String>, base_downloads: Option<String>) -> String {
    let resolved = folder::resolve_media_folder(configured_dir.as_deref(), base_downloads.as_deref());
    resolved.to_string_lossy().to_string()
}

#[napi]
pub fn rust_cache_ensure_folder(configured_dir: Option<String>, base_downloads: Option<String>) -> Result<String> {
    let resolved = folder::resolve_media_folder(configured_dir.as_deref(), base_downloads.as_deref());
    folder::create_media_folder_if_needed(&resolved)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create folder: {}", e)))?;
    Ok(resolved.to_string_lossy().to_string())
}

#[napi]
pub fn rust_cache_folder_exists(dir: String) -> bool {
    std::path::Path::new(&dir).is_dir()
}

#[napi]
pub async fn rust_cache_pick_directory() -> Result<Option<String>> {
    tokio::task::spawn_blocking(|| {
        let dialog = rfd::FileDialog::new();
        dialog.pick_folder().map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| Error::new(Status::GenericFailure, format!("Dialog task error: {}", e)))
}

#[napi]
pub fn rust_cache_save_media(
    db_path: String,
    configured_dir: Option<String>,
    cache_key: String,
    data: Buffer,
    mime_type: String,
    chat_id: Option<String>,
    message_id: Option<String>,
    file_name: Option<String>,
    local_key_hex: Option<String>,
    base_downloads: Option<String>,
) -> Result<RustCacheSaveResult> {
    manager::save_media_internal(
        &db_path,
        configured_dir.as_deref(),
        &cache_key,
        data.as_ref(),
        &mime_type,
        chat_id.as_deref(),
        message_id.as_deref(),
        file_name.as_deref(),
        local_key_hex.as_deref(),
        base_downloads.as_deref(),
    )
}

#[napi]
pub fn rust_cache_get_media(
    db_path: String,
    configured_dir: Option<String>,
    cache_key: String,
    local_key_hex: Option<String>,
    base_downloads: Option<String>,
) -> Result<Option<RustMediaResult>> {
    manager::get_media_internal(
        &db_path,
        configured_dir.as_deref(),
        &cache_key,
        local_key_hex.as_deref(),
        base_downloads.as_deref(),
    )
}

#[napi]
pub fn rust_cache_exists_media(
    db_path: String,
    configured_dir: Option<String>,
    cache_key: String,
    base_downloads: Option<String>,
) -> bool {
    manager::exists_media_internal(
        &db_path,
        configured_dir.as_deref(),
        &cache_key,
        base_downloads.as_deref(),
    )
}

#[napi]
pub fn rust_cache_clear(
    db_path: String,
    configured_dir: Option<String>,
    categories: Option<Vec<String>>,
    base_downloads: Option<String>,
) -> Result<u32> {
    let resolved_dir = folder::resolve_media_folder(configured_dir.as_deref(), base_downloads.as_deref());
    let conn = manager::open_media_db(&db_path)?;
    cleaner::clear_categories_internal(&conn, &resolved_dir, categories)
}

#[napi]
pub fn rust_cache_delete_by_chat(
    db_path: String,
    configured_dir: Option<String>,
    chat_id: String,
    base_downloads: Option<String>,
) -> Result<u32> {
    let resolved_dir = folder::resolve_media_folder(configured_dir.as_deref(), base_downloads.as_deref());
    let conn = manager::open_media_db(&db_path)?;
    cleaner::delete_chat_media_internal(&conn, &resolved_dir, &chat_id)
}

#[napi]
pub fn rust_cache_evict_by_age(
    db_path: String,
    configured_dir: Option<String>,
    max_age_ms: i64,
    base_downloads: Option<String>,
) -> Result<u32> {
    let resolved_dir = folder::resolve_media_folder(configured_dir.as_deref(), base_downloads.as_deref());
    let conn = manager::open_media_db(&db_path)?;
    cleaner::evict_by_age_internal(&conn, &resolved_dir, max_age_ms)
}

#[napi]
pub fn rust_cache_evict_to_limit(
    db_path: String,
    configured_dir: Option<String>,
    limit_bytes: i64,
    base_downloads: Option<String>,
) -> Result<u32> {
    let resolved_dir = folder::resolve_media_folder(configured_dir.as_deref(), base_downloads.as_deref());
    let conn = manager::open_media_db(&db_path)?;
    cleaner::evict_to_limit_internal(&conn, &resolved_dir, limit_bytes)
}

#[napi]
pub fn rust_cache_get_detailed_stats(db_path: String) -> Result<DetailedCacheStats> {
    let conn = manager::open_media_db(&db_path)?;
    stats::get_detailed_stats_internal(&conn)
}

#[napi]
pub fn rust_cache_get_chat_stats(db_path: String) -> Result<Vec<ChatMediaStat>> {
    let conn = manager::open_media_db(&db_path)?;
    stats::get_chat_stats_internal(&conn)
}
