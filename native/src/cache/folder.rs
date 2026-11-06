use std::path::{Path, PathBuf};

pub const DEFAULT_MEDIA_DIR_NAME: &str = "Orbita Desktop";

pub fn get_default_downloads_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(profile).join("Downloads");
            if p.exists() {
                return p;
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let p = PathBuf::from(home).join("Downloads");
            if p.exists() {
                return p;
            }
        }
    }
    std::env::temp_dir()
}

pub fn resolve_media_folder(configured_path: Option<&str>, base_downloads: Option<&str>) -> PathBuf {
    let downloads_dir = match base_downloads {
        Some(b) if !b.trim().is_empty() && Path::new(b).is_dir() => PathBuf::from(b),
        _ => get_default_downloads_dir(),
    };
    let default_target = downloads_dir.join(DEFAULT_MEDIA_DIR_NAME);

    if let Some(cfg) = configured_path {
        let trimmed = cfg.trim();
        if !trimmed.is_empty() {
            let configured_path_buf = PathBuf::from(trimmed);
            if configured_path_buf.exists() && configured_path_buf.is_dir() {
                return configured_path_buf;
            }
        }
    }

    default_target
}

pub fn create_media_folder_if_needed(dir: &Path) -> std::io::Result<()> {
    if !dir.exists() {
        std::fs::create_dir_all(dir)?;
    }
    Ok(())
}
