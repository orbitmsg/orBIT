use base64::prelude::*;
use image::ImageReader;
use napi::bindgen_prelude::*;
use std::io::Cursor;

#[napi(object)]
pub struct RustCompressedImage {
    pub data: Buffer,
    pub width: u32,
    pub height: u32,
    pub mime: String,
    pub size: u32,
}

#[napi]
pub fn compress_image_native(
    data: Buffer,
    max_width: u32,
    max_height: u32,
    quality: Option<u32>,
    format: Option<String>,
) -> Result<RustCompressedImage> {
    let cursor = Cursor::new(data.as_ref());
    let reader = ImageReader::new(cursor)
        .with_guessed_format()
        .map_err(|e| Error::new(Status::InvalidArg, format!("Failed to read image header: {}", e)))?;

    let guessed_format = reader.format();
    let img = reader
        .decode()
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to decode image: {}", e)))?;

    let (w, h) = (img.width(), img.height());
    let resized = if (max_width > 0 && w > max_width) || (max_height > 0 && h > max_height) {
        let target_w = if max_width > 0 { max_width } else { w };
        let target_h = if max_height > 0 { max_height } else { h };
        img.thumbnail(target_w, target_h)
    } else {
        img
    };

    let (use_webp, mime) = match format.as_deref().map(|s| s.to_ascii_lowercase()).as_deref() {
        Some("webp") => (true, "image/webp".to_string()),
        Some("jpeg") | Some("jpg") => (false, "image/jpeg".to_string()),
        _ => {
            if guessed_format == Some(image::ImageFormat::WebP) {
                (true, "image/webp".to_string())
            } else if guessed_format == Some(image::ImageFormat::Jpeg) {
                (false, "image/jpeg".to_string())
            } else if resized.color().has_alpha() {
                (true, "image/webp".to_string())
            } else {
                (false, "image/jpeg".to_string())
            }
        }
    };

    let mut out_bytes = Vec::new();
    let mut out_cursor = Cursor::new(&mut out_bytes);

    if use_webp {
        resized
            .write_to(&mut out_cursor, image::ImageFormat::WebP)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to encode WebP: {}", e)))?;
    } else {
        let q = quality.unwrap_or(85).clamp(1, 100) as u8;
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out_cursor, q);
        encoder
            .encode_image(&resized)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to encode JPEG: {}", e)))?;
    }

    let final_width = resized.width();
    let final_height = resized.height();
    let size = out_bytes.len() as u32;

    Ok(RustCompressedImage {
        data: out_bytes.into(),
        width: final_width,
        height: final_height,
        mime,
        size,
    })
}

#[napi]
pub fn generate_blur_preview(data: Buffer, thumb_size: Option<u32>) -> Result<String> {
    let cursor = Cursor::new(data.as_ref());
    let reader = ImageReader::new(cursor)
        .with_guessed_format()
        .map_err(|e| Error::new(Status::InvalidArg, format!("Failed to read image header: {}", e)))?;

    let decoded = reader
        .decode()
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to decode image: {}", e)))?;

    let size = thumb_size.unwrap_or(24).clamp(8, 128);
    let thumb = decoded.thumbnail(size, size);
    let blurred = thumb.blur(2.0);

    let mut out_bytes = Vec::new();
    let mut out_cursor = Cursor::new(&mut out_bytes);

    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out_cursor, 60);
    encoder
        .encode_image(&blurred)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to encode blur preview: {}", e)))?;

    let b64 = BASE64_STANDARD.encode(&out_bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
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
    encoder
        .encode_image(&resized)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to encode image: {}", e)))?;

    Ok(out_bytes.into())
}
