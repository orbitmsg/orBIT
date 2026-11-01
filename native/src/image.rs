use napi::bindgen_prelude::*;
use std::io::Cursor;
use image::ImageReader;

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
    encoder.encode_image(&resized)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to encode image: {}", e)))?;

    Ok(out_bytes.into())
}
