#[napi(object)]
pub struct RustCallSession {
    pub name: String,
    pub avatar: Option<String>,
    pub chat_id: String,
    pub call_state: String,
    pub direction: String,
    pub call_type: String,
    pub verification_secret: Option<String>,
    pub verification_salt: Option<String>,
}

fn urlencoding_fast(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len() * 2);
    for byte in input.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

#[napi]
pub fn rust_build_call_query(session: RustCallSession) -> String {
    let mut parts: Vec<String> = Vec::new();
    parts.push("view=call".to_string());
    parts.push(format!("name={}", urlencoding_fast(&session.name)));
    if let Some(av) = session.avatar {
        if !av.is_empty() {
            parts.push(format!("avatar={}", urlencoding_fast(&av)));
        }
    }
    parts.push(format!("chatId={}", urlencoding_fast(&session.chat_id)));
    parts.push(format!("state={}", urlencoding_fast(&session.call_state)));
    parts.push(format!("direction={}", urlencoding_fast(&session.direction)));
    parts.push(format!("type={}", urlencoding_fast(&session.call_type)));
    if let Some(vs) = session.verification_secret {
        if !vs.is_empty() {
            parts.push(format!("secret={}", urlencoding_fast(&vs)));
        }
    }
    if let Some(salt) = session.verification_salt {
        if !salt.is_empty() {
            parts.push(format!("salt={}", urlencoding_fast(&salt)));
        }
    }
    parts.join("&")
}

#[napi]
pub fn rust_should_activate_connected(
    call_state: String,
    has_remote_participants: bool,
    has_subscribed_tracks: bool,
) -> bool {
    if call_state == "connecting" || call_state == "ringing" {
        return has_remote_participants || has_subscribed_tracks;
    }
    false
}

#[napi]
pub fn rust_verify_call_session(
    room_name: String,
    local_identity: String,
    has_token: bool,
) -> bool {
    !room_name.is_empty() && !local_identity.is_empty() && has_token
}
