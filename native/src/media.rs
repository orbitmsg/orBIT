use napi::bindgen_prelude::*;

#[napi(object)]
pub struct RustMediaResult {
    pub data: Buffer,
    pub mime: String,
}

#[napi]
pub fn rust_media_init_db(db_path: String) -> Result<bool> {
    crate::cache::manager::open_media_db(&db_path)?;
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
    _local_key_hex: String,
) -> Result<String> {
    let res = crate::cache::manager::save_media_internal(
        &db_path,
        Some(&media_dir),
        &cache_key,
        data.as_ref(),
        &mime_type,
        chat_id.as_deref(),
        message_id.as_deref(),
        None,
        None,
        None,
    )?;
    Ok(res.local_path)
}

#[napi]
pub fn rust_media_get(
    db_path: String,
    cache_key: String,
    local_key_hex: String,
) -> Result<Option<RustMediaResult>> {
    crate::cache::manager::get_media_internal(
        &db_path,
        None,
        &cache_key,
        Some(&local_key_hex),
        None,
    )
}
