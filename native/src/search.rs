use napi::bindgen_prelude::*;

#[napi]
pub fn fast_text_search(haystack: Vec<String>, query: String) -> Result<Vec<u32>> {
    let q = query.to_lowercase();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let mut matches = Vec::new();
    for (idx, item) in haystack.into_iter().enumerate() {
        if item.to_lowercase().contains(&q) {
            matches.push(idx as u32);
        }
    }

    Ok(matches)
}
