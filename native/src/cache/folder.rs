use std::path::{Path, PathBuf};

pub const CACHE_MARKER_FILE: &str = ".orbita_cache";
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

pub fn check_dir_has_marker(dir: &Path) -> bool {
    dir.is_dir() && dir.join(CACHE_MARKER_FILE).exists()
}

pub fn scan_dir_for_marker(parent: &Path) -> Option<PathBuf> {
    if !parent.is_dir() {
        return None;
    }
    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.join(CACHE_MARKER_FILE).exists() {
                return Some(p);
            }
        }
    }
    None
}

pub fn resolve_media_folder(configured_path: Option<&str>) -> PathBuf {
    let downloads_dir = get_default_downloads_dir();
    let default_target = downloads_dir.join(DEFAULT_MEDIA_DIR_NAME);

    if let Some(cfg) = configured_path {
        let trimmed = cfg.trim();
        if !trimmed.is_empty() {
            let configured_path_buf = PathBuf::from(trimmed);
            if configured_path_buf.exists() && configured_path_buf.is_dir() {
                return configured_path_buf;
            }

            if let Some(parent) = configured_path_buf.parent() {
                if let Some(renamed) = scan_dir_for_marker(parent) {
                    return renamed;
                }
            }

            if let Some(renamed) = scan_dir_for_marker(&downloads_dir) {
                return renamed;
            }

            return configured_path_buf;
        }
    }

    if default_target.exists() && default_target.is_dir() {
        return default_target;
    }

    if let Some(renamed) = scan_dir_for_marker(&downloads_dir) {
        return renamed;
    }

    default_target
}

pub fn create_media_folder_if_needed(dir: &Path) -> std::io::Result<()> {
    if !dir.exists() {
        std::fs::create_dir_all(dir)?;
    }
    let marker_path = dir.join(CACHE_MARKER_FILE);
    if !marker_path.exists() {
        let content = br#"{"app":"orbita_desktop","marker_version":1,"note":"Orbita Desktop media cache folder marker"}"#;
        std::fs::write(&marker_path, content)?;

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::ffi::OsStrExt;
            let wide: Vec<u16> = marker_path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
            extern "system" {
                fn SetFileAttributesW(lpFileName: *const u16, dwFileAttributes: u32) -> i32;
            }
            const FILE_ATTRIBUTE_HIDDEN: u32 = 0x00000002;
            unsafe {
                SetFileAttributesW(wide.as_ptr(), FILE_ATTRIBUTE_HIDDEN);
            }
        }
    }
    Ok(())
}
