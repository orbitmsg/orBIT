use napi::bindgen_prelude::*;

#[napi]
pub fn process_audio_waveform(data: Buffer, num_bars: u32) -> Result<Vec<f64>> {
    let bytes = data.as_ref();
    let bars = if num_bars == 0 { 64 } else { num_bars as usize };
    if bytes.is_empty() {
        return Ok(vec![0.1; bars]);
    }

    let sample_count = bytes.len() / 2;
    if sample_count == 0 {
        return Ok(vec![0.1; bars]);
    }

    let chunk_size = (sample_count / bars).max(1);
    let mut peaks: Vec<f64> = Vec::with_capacity(bars);

    for i in 0..bars {
        let start_sample = i * chunk_size;
        let end_sample = ((i + 1) * chunk_size).min(sample_count);
        let mut sum_squares: f64 = 0.0;
        let mut count: f64 = 0.0;

        for s in start_sample..end_sample {
            let byte_idx = s * 2;
            if byte_idx + 1 < bytes.len() {
                let sample = i16::from_le_bytes([bytes[byte_idx], bytes[byte_idx + 1]]) as f64;
                sum_squares += sample * sample;
                count += 1.0;
            }
        }

        let rms = if count > 0.0 {
            (sum_squares / count).sqrt() / 32768.0
        } else {
            0.05
        };

        peaks.push(rms);
    }

    let max_peak = peaks.iter().cloned().fold(0.0f64, f64::max);
    let normalized = if max_peak > 0.001 {
        peaks.into_iter().map(|p| (p / max_peak).clamp(0.08, 1.0)).collect()
    } else {
        vec![0.1; bars]
    };

    Ok(normalized)
}

#[napi]
pub fn rust_detect_voice_activity(samples: Float32Array, threshold: Option<f64>) -> bool {
    let thresh = threshold.unwrap_or(0.006) as f32;
    let s = samples.as_ref();
    if s.is_empty() {
        return false;
    }
    let mut max_abs: f32 = 0.0;
    let mut sum_sq: f32 = 0.0;
    for &val in s {
        let abs_val = val.abs();
        if abs_val > max_abs {
            max_abs = abs_val;
        }
        sum_sq += val * val;
    }
    let rms = sum_sq / (s.len() as f32);
    let thresh_sq = thresh * thresh;
    max_abs >= thresh || rms >= thresh_sq
}
