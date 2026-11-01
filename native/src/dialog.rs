use napi::bindgen_prelude::*;

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
