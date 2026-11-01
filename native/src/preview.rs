use napi::bindgen_prelude::*;

#[napi(object)]
pub struct RustLinkPreview {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub site_name: Option<String>,
}

fn extract_meta_attr(html: &str, tag_attr: &str, attr_val: &str) -> Option<String> {
    let lower_html = html.to_lowercase();
    let pat_double = format!("{}=\"{}\"", tag_attr, attr_val);
    let pat_single = format!("{}='{}'", tag_attr, attr_val);
    let patterns = [&pat_double, &pat_single];

    for pat in &patterns {
        let mut start_search = 0;
        while let Some(pos) = lower_html[start_search..].find(pat.as_str()) {
            let actual_pos = start_search + pos;
            let tag_start = html[..actual_pos].rfind('<').unwrap_or(actual_pos);
            let tag_end = match html[actual_pos..].find('>') {
                Some(p) => actual_pos + p,
                None => break,
            };

            let tag_snippet = &html[tag_start..=tag_end];
            let lower_snippet = &lower_html[tag_start..=tag_end];

            if let Some(content_idx) = lower_snippet.find("content=") {
                let after_content = &tag_snippet[content_idx + 8..];
                let trimmed = after_content.trim_start();
                if trimmed.starts_with('"') {
                    if let Some(end_quote) = trimmed[1..].find('"') {
                        let val = &trimmed[1..=end_quote];
                        if !val.trim().is_empty() {
                            return Some(val.trim().to_string());
                        }
                    }
                } else if trimmed.starts_with('\'') {
                    if let Some(end_quote) = trimmed[1..].find('\'') {
                        let val = &trimmed[1..=end_quote];
                        if !val.trim().is_empty() {
                            return Some(val.trim().to_string());
                        }
                    }
                }
            }
            start_search = tag_end + 1;
            if start_search >= lower_html.len() {
                break;
            }
        }
    }
    None
}

fn extract_tag_content(html: &str, tag_name: &str) -> Option<String> {
    let open_tag = format!("<{}", tag_name);
    let close_tag = format!("</{}>", tag_name);
    let lower_html = html.to_lowercase();
    if let Some(start_idx) = lower_html.find(&open_tag) {
        if let Some(tag_end) = lower_html[start_idx..].find('>') {
            let content_start = start_idx + tag_end + 1;
            if let Some(end_idx) = lower_html[content_start..].find(&close_tag) {
                let content = &html[content_start..content_start + end_idx];
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

fn parse_html_opengraph(html: &str, target_url: &str) -> Option<RustLinkPreview> {
    let title = extract_meta_attr(html, "property", "og:title")
        .or_else(|| extract_meta_attr(html, "name", "twitter:title"))
        .or_else(|| extract_meta_attr(html, "name", "title"))
        .or_else(|| extract_tag_content(html, "title"));

    let description = extract_meta_attr(html, "property", "og:description")
        .or_else(|| extract_meta_attr(html, "name", "twitter:description"))
        .or_else(|| extract_meta_attr(html, "name", "description"));

    let mut image = extract_meta_attr(html, "property", "og:image")
        .or_else(|| extract_meta_attr(html, "name", "twitter:image"))
        .or_else(|| extract_meta_attr(html, "property", "og:image:url"));

    if let Some(ref img) = image {
        if !img.starts_with("http://") && !img.starts_with("https://") && !img.starts_with("data:") {
            if let Ok(base) = url::Url::parse(target_url) {
                if let Ok(joined) = base.join(img) {
                    image = Some(joined.to_string());
                }
            }
        }
    }

    let site_name = extract_meta_attr(html, "property", "og:site_name")
        .or_else(|| extract_meta_attr(html, "name", "application-name"))
        .or_else(|| {
            url::Url::parse(target_url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.trim_start_matches("www.").to_string()))
        });

    let desc_len = description.as_ref().map(|d| d.trim().len()).unwrap_or(0);
    let img_nonempty = image.as_ref().map(|i| !i.trim().is_empty()).unwrap_or(false);

    if !img_nonempty && desc_len <= 10 {
        return None;
    }

    Some(RustLinkPreview {
        url: target_url.to_string(),
        title,
        description,
        image,
        site_name,
    })
}

#[napi]
pub async fn rust_fetch_link_preview(url: String) -> Result<Option<RustLinkPreview>> {
    let lower = url.to_lowercase();
    if lower.contains("orbitachat.vercel.app")
        || lower.contains("orbitad.vercel.app")
        || lower.contains("orbita.workers.dev")
        || lower.contains("/groups/#")
        || lower.contains("/groups/")
        || lower.contains("localhost")
        || lower.contains("127.0.0.1")
    {
        return Ok(None);
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(2500))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
    {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };

    let resp = match client
        .get(&url)
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Orbita/2.0")
        .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };

    if !resp.status().is_success() {
        return Ok(None);
    }

    let bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(_) => return Ok(None),
    };

    let slice_len = std::cmp::min(bytes.len(), 65536);
    let html = String::from_utf8_lossy(&bytes[..slice_len]);

    let preview = parse_html_opengraph(&html, &url);
    if let Some(ref p) = preview {
        let has_image = p.image.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
        let has_rich_desc = p.description.as_ref().map(|s| s.trim().len() > 10).unwrap_or(false);
        if !has_image && !has_rich_desc {
            return Ok(None);
        }
    }

    Ok(preview)
}
