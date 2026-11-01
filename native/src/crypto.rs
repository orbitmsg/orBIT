use napi::bindgen_prelude::*;
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};
use rand::RngCore;
use x25519_dalek::{PublicKey, StaticSecret};
use crate::types::{SensitiveKey, SensitiveBuffer};

#[napi(object)]
pub struct KeyPairResult {
    pub public_key: String,
    pub private_key: String,
}

#[napi(object)]
pub struct EncryptedMessageResult {
    pub ciphertext: Buffer,
    pub nonce: Buffer,
    pub tag: Buffer,
}

#[napi]
pub fn generate_key_pair() -> Result<KeyPairResult> {
    let mut rng = rand::thread_rng();
    let secret = StaticSecret::random_from_rng(&mut rng);
    let public = PublicKey::from(&secret);
    let secret_bytes = SensitiveKey(secret.to_bytes());

    Ok(KeyPairResult {
        public_key: hex::encode(public.as_bytes()),
        private_key: hex::encode(&secret_bytes.0),
    })
}

#[napi]
pub fn derive_public_key(private_key_hex: String) -> Result<String> {
    let bytes = hex::decode(&private_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid private key hex: {}", e)))?;
    if bytes.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Private key must be 32 bytes"));
    }
    let sensitive_bytes = SensitiveBuffer(bytes);
    let mut arr = SensitiveKey([0u8; 32]);
    arr.0.copy_from_slice(&sensitive_bytes.0);
    let secret = StaticSecret::from(arr.0);
    let public = PublicKey::from(&secret);
    Ok(hex::encode(public.as_bytes()))
}

#[napi]
pub fn derive_shared_secret(my_private_key_hex: String, other_public_key_hex: String) -> Result<String> {
    let priv_bytes = hex::decode(&my_private_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid private key hex: {}", e)))?;
    let pub_bytes = hex::decode(&other_public_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid public key hex: {}", e)))?;

    if priv_bytes.len() != 32 || pub_bytes.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Keys must be 32 bytes"));
    }

    let priv_buffer = SensitiveBuffer(priv_bytes);
    let pub_buffer = SensitiveBuffer(pub_bytes);

    let mut priv_arr = SensitiveKey([0u8; 32]);
    priv_arr.0.copy_from_slice(&priv_buffer.0);
    let mut pub_arr = SensitiveKey([0u8; 32]);
    pub_arr.0.copy_from_slice(&pub_buffer.0);

    let secret = StaticSecret::from(priv_arr.0);
    let public = PublicKey::from(pub_arr.0);
    let shared = secret.diffie_hellman(&public);
    let shared_arr = SensitiveKey(*shared.as_bytes());

    Ok(hex::encode(&shared_arr.0))
}

#[napi]
pub fn derive_root_key(shared_secret_hex: String) -> Result<String> {
    let ikm_vec = hex::decode(&shared_secret_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid shared secret hex: {}", e)))?;
    let ikm = SensitiveBuffer(ikm_vec);
    
    let salt = [0u8; 32];
    let hk = Hkdf::<Sha256>::new(Some(&salt[..]), &ikm.0);
    let mut okm = SensitiveKey([0u8; 32]);
    hk.expand(b"orbita-root-key-v1", &mut okm.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("HKDF expand failed: {:?}", e)))?;

    Ok(hex::encode(&okm.0))
}

pub(crate) fn derive_file_key(shared_secret_hex: &str) -> Result<SensitiveKey> {
    let ikm_vec = hex::decode(shared_secret_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid shared secret hex: {}", e)))?;
    let ikm = SensitiveBuffer(ikm_vec);
    
    let hk = Hkdf::<Sha256>::new(Some(b"orbita-file-key"), &ikm.0);
    let mut okm = SensitiveKey([0u8; 32]);
    hk.expand(b"file-encryption", &mut okm.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("HKDF file key expand failed: {:?}", e)))?;

    Ok(okm)
}

#[napi]
pub fn encrypt_file(data: Buffer, key_hex: String) -> Result<Buffer> {
    let raw_key_vec = hex::decode(&key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    let raw_key = SensitiveBuffer(raw_key_vec);

    let key_bytes: SensitiveKey = if raw_key.0.len() == 32 {
        let mut k = SensitiveKey([0u8; 32]);
        k.0.copy_from_slice(&raw_key.0);
        k
    } else {
        derive_file_key(&key_hex)?
    };

    let cipher = Aes256Gcm::new_from_slice(&key_bytes.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_ref())
        .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM encryption failed: {}", e)))?;

    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result.into())
}

#[napi]
pub fn decrypt_file(encrypted_data: Buffer, key_hex: String) -> Result<Buffer> {
    if encrypted_data.len() < 28 {
        return Err(Error::new(Status::InvalidArg, "Data too short for AES-GCM (needs at least 12 IV + 16 Tag)"));
    }

    let raw_key_vec = hex::decode(&key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    let raw_key = SensitiveBuffer(raw_key_vec);

    let (nonce_slice, ciphertext) = encrypted_data.split_at(12);
    let nonce = Nonce::from_slice(nonce_slice);

    if raw_key.0.len() == 32 {
        if let Ok(cipher) = Aes256Gcm::new_from_slice(&raw_key.0) {
            if let Ok(plaintext) = cipher.decrypt(nonce, ciphertext) {
                return Ok(plaintext.into());
            }
        }
        if let Ok(derived) = derive_file_key(&key_hex) {
            if let Ok(cipher) = Aes256Gcm::new_from_slice(&derived.0) {
                if let Ok(plaintext) = cipher.decrypt(nonce, ciphertext) {
                    return Ok(plaintext.into());
                }
            }
        }
        return Err(Error::new(Status::GenericFailure, "AES-GCM decryption failed"));
    }

    let derived = derive_file_key(&key_hex)?;
    let cipher = Aes256Gcm::new_from_slice(&derived.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM decryption failed: {}", e)))?;

    Ok(plaintext.into())
}

#[napi]
pub fn encrypt_message_aes_gcm(
    key: Buffer,
    plaintext: Buffer,
    nonce_opt: Option<Buffer>,
    associated_data_opt: Option<Buffer>,
) -> Result<EncryptedMessageResult> {
    if key.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Key must be 32 bytes"));
    }

    let mut key_arr = SensitiveKey([0u8; 32]);
    key_arr.0.copy_from_slice(key.as_ref());

    let cipher = Aes256Gcm::new_from_slice(&key_arr.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))?;

    let nonce_bytes: Vec<u8> = match nonce_opt {
        Some(b) => {
            if b.len() != 12 {
                return Err(Error::new(Status::InvalidArg, "Nonce must be 12 bytes"));
            }
            b.to_vec()
        }
        None => {
            let mut n = vec![0u8; 12];
            rand::thread_rng().fill_bytes(&mut n);
            n
        }
    };

    let nonce = Nonce::from_slice(&nonce_bytes);
    let payload = match associated_data_opt {
        Some(ref ad) => Payload {
            msg: plaintext.as_ref(),
            aad: ad.as_ref(),
        },
        None => Payload {
            msg: plaintext.as_ref(),
            aad: b"",
        },
    };

    let encrypted = cipher
        .encrypt(nonce, payload)
        .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM message encrypt failed: {}", e)))?;

    let tag_offset = encrypted.len() - 16;
    let ciphertext = encrypted[..tag_offset].to_vec();
    let tag = encrypted[tag_offset..].to_vec();

    Ok(EncryptedMessageResult {
        ciphertext: ciphertext.into(),
        nonce: nonce_bytes.into(),
        tag: tag.into(),
    })
}

#[napi]
pub fn decrypt_message_aes_gcm(
    key: Buffer,
    ciphertext: Buffer,
    nonce: Buffer,
    tag: Buffer,
    associated_data_opt: Option<Buffer>,
) -> Result<Buffer> {
    if key.len() != 32 || nonce.len() != 12 || tag.len() != 16 {
        return Err(Error::new(Status::InvalidArg, "Invalid AES key, nonce or tag length"));
    }

    let mut key_arr = SensitiveKey([0u8; 32]);
    key_arr.0.copy_from_slice(key.as_ref());

    let cipher = Aes256Gcm::new_from_slice(&key_arr.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid AES key: {}", e)))?;

    let mut full_ciphertext = Vec::with_capacity(ciphertext.len() + 16);
    full_ciphertext.extend_from_slice(ciphertext.as_ref());
    full_ciphertext.extend_from_slice(tag.as_ref());

    let nonce_ref = Nonce::from_slice(nonce.as_ref());
    let payload = match associated_data_opt {
        Some(ref ad) => Payload {
            msg: &full_ciphertext,
            aad: ad.as_ref(),
        },
        None => Payload {
            msg: &full_ciphertext,
            aad: b"",
        },
    };

    let plaintext = cipher
        .decrypt(nonce_ref, payload)
        .map_err(|e| Error::new(Status::GenericFailure, format!("AES-GCM message decrypt failed: {}", e)))?;

    Ok(plaintext.into())
}

pub(crate) fn internal_get_cipher(master_key_hex: &str) -> Result<Aes256Gcm> {
    let key_bytes = hex::decode(master_key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid master key hex: {}", e)))?;
    if key_bytes.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Master key must be 32 bytes"));
    }
    let mut key_arr = SensitiveKey([0u8; 32]);
    key_arr.0.copy_from_slice(&key_bytes);
    Aes256Gcm::new_from_slice(&key_arr.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create cipher: {}", e)))
}

pub(crate) fn internal_encrypt_data(data: &[u8], cipher: &Aes256Gcm) -> Result<Vec<u8>> {
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Encrypt failed: {}", e)))?;
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub(crate) fn internal_decrypt_data(data: &[u8], cipher: &Aes256Gcm) -> Result<Vec<u8>> {
    if data.len() < 28 {
        return Err(Error::new(Status::InvalidArg, "Data too short for AES-GCM"));
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Decrypt failed: {}", e)))
}

fn internal_pbkdf2_sha256(password: &[u8], salt: &[u8], iterations: u32, out: &mut [u8]) {
    use hmac::{Hmac, Mac};
    type HmacSha256 = Hmac<Sha256>;
    let mut block_idx = 1u32;
    let mut out_offset = 0;
    while out_offset < out.len() {
        let mut mac = <HmacSha256 as Mac>::new_from_slice(password).expect("HMAC valid key");
        mac.update(salt);
        mac.update(&block_idx.to_be_bytes());
        let mut u = mac.finalize().into_bytes();
        let mut ti = u;
        for _ in 1..iterations {
            let mut mac = <HmacSha256 as Mac>::new_from_slice(password).expect("HMAC valid key");
            mac.update(&u);
            u = mac.finalize().into_bytes();
            for (t_byte, u_byte) in ti.iter_mut().zip(u.iter()) {
                *t_byte ^= u_byte;
            }
        }
        let to_copy = (out.len() - out_offset).min(ti.len());
        out[out_offset..out_offset + to_copy].copy_from_slice(&ti[..to_copy]);
        out_offset += to_copy;
        block_idx += 1;
    }
}

#[derive(serde::Deserialize)]
struct PinPayload {
    salt: String,
    iv: String,
    tag: String,
    data: String,
}

#[derive(serde::Serialize)]
struct PinOutput {
    salt: String,
    iv: String,
    tag: String,
    data: String,
}

#[napi]
pub fn rust_unlock_with_pin(pin: String, payload_json: String) -> Result<Option<String>> {
    let payload: PinPayload = match serde_json::from_str(&payload_json) {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };
    let salt = match hex::decode(&payload.salt) {
        Ok(s) => s,
        Err(_) => return Ok(None),
    };
    let iv = match hex::decode(&payload.iv) {
        Ok(i) => i,
        Err(_) => return Ok(None),
    };
    let tag = match hex::decode(&payload.tag) {
        Ok(t) => t,
        Err(_) => return Ok(None),
    };
    let ciphertext = match hex::decode(&payload.data) {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };
    if iv.len() != 12 || tag.len() != 16 {
        return Ok(None);
    }

    let mut derived_key = SensitiveKey([0u8; 32]);
    internal_pbkdf2_sha256(pin.as_bytes(), &salt, 100_000, &mut derived_key.0);

    let cipher = match Aes256Gcm::new_from_slice(&derived_key.0) {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };

    let mut combined = Vec::with_capacity(ciphertext.len() + tag.len());
    combined.extend_from_slice(&ciphertext);
    combined.extend_from_slice(&tag);

    let nonce = Nonce::from_slice(&iv);
    match cipher.decrypt(nonce, combined.as_ref()) {
        Ok(decrypted) => {
            if decrypted.len() == 32 {
                Ok(Some(hex::encode(decrypted)))
            } else {
                Ok(None)
            }
        }
        Err(_) => Ok(None),
    }
}

#[napi]
pub fn rust_setup_pin(pin: String, key_hex: String) -> Result<String> {
    let key_bytes = hex::decode(&key_hex)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid key hex: {}", e)))?;
    if key_bytes.len() != 32 {
        return Err(Error::new(Status::InvalidArg, "Key must be 32 bytes"));
    }

    let mut salt = [0u8; 16];
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut iv);

    let mut derived_key = SensitiveKey([0u8; 32]);
    internal_pbkdf2_sha256(pin.as_bytes(), &salt, 100_000, &mut derived_key.0);

    let cipher = Aes256Gcm::new_from_slice(&derived_key.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Cipher init failed: {}", e)))?;

    let nonce = Nonce::from_slice(&iv);
    let encrypted = cipher
        .encrypt(nonce, key_bytes.as_slice())
        .map_err(|e| Error::new(Status::GenericFailure, format!("Encryption failed: {}", e)))?;

    let tag_offset = encrypted.len() - 16;
    let (ciphertext_slice, tag_slice) = encrypted.split_at(tag_offset);

    let out = PinOutput {
        salt: hex::encode(salt),
        iv: hex::encode(iv),
        tag: hex::encode(tag_slice),
        data: hex::encode(ciphertext_slice),
    };

    serde_json::to_string(&out)
        .map_err(|e| Error::new(Status::GenericFailure, format!("JSON serialize failed: {}", e)))
}

#[napi]
pub fn rust_encrypt_data(data: Buffer, master_key_hex: String) -> Result<Buffer> {
    let cipher = internal_get_cipher(&master_key_hex)?;
    let enc = internal_encrypt_data(data.as_ref(), &cipher)?;
    Ok(enc.into())
}

#[napi]
pub fn rust_decrypt_data(data: Buffer, master_key_hex: String) -> Result<Option<Buffer>> {
    let cipher = match internal_get_cipher(&master_key_hex) {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };
    match internal_decrypt_data(data.as_ref(), &cipher) {
        Ok(dec) => Ok(Some(dec.into())),
        Err(_) => Ok(None),
    }
}

#[napi]
pub fn get_direct_chat_id(user_a_uuid: String, user_b_uuid: String) -> Result<String> {
    let a = user_a_uuid.trim().to_lowercase();
    let b = user_b_uuid.trim().to_lowercase();
    if a.is_empty() || b.is_empty() {
        let mut rng = rand::thread_rng();
        let mut u = [0u8; 16];
        rng.fill_bytes(&mut u);
        u[6] = (u[6] & 0x0f) | 0x40;
        u[8] = (u[8] & 0x3f) | 0x80;
        let hex_str = hex::encode(u);
        return Ok(format!(
            "{}-{}-{}-{}-{}",
            &hex_str[0..8],
            &hex_str[8..12],
            &hex_str[12..16],
            &hex_str[16..20],
            &hex_str[20..32]
        ));
    }
    let mut pair = [a, b];
    pair.sort();
    let formatted = format!("orbita:direct:{}:{}", pair[0], pair[1]);
    let mut hasher = Sha256::new();
    hasher.update(formatted.as_bytes());
    let mut digest = hasher.finalize();
    digest[6] = (digest[6] & 0x0f) | 0x40;
    digest[8] = (digest[8] & 0x3f) | 0x80;
    let hex_str = hex::encode(&digest[0..16]);
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex_str[0..8],
        &hex_str[8..12],
        &hex_str[12..16],
        &hex_str[16..20],
        &hex_str[20..32]
    ))
}

#[napi]
pub fn derive_channel_key(channel_id: String) -> Result<String> {
    let ikm = format!("orbita:channel:{}", channel_id.trim());
    let salt = [0u8; 32];
    let hk = Hkdf::<Sha256>::new(Some(&salt), ikm.as_bytes());
    let mut okm = SensitiveKey([0u8; 32]);
    hk.expand(b"orbita-channel-e2ee-key", &mut okm.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("HKDF expand failed: {:?}", e)))?;
    Ok(hex::encode(&okm.0))
}

#[napi]
pub fn derive_ticket_key(ticket_number: String) -> Result<String> {
    let ikm = format!("orbita:ticket:{}", ticket_number.trim().to_uppercase());
    let salt = [0u8; 32];
    let hk = Hkdf::<Sha256>::new(Some(&salt), ikm.as_bytes());
    let mut okm = SensitiveKey([0u8; 32]);
    hk.expand(b"orbita-ticket-e2ee-key", &mut okm.0)
        .map_err(|e| Error::new(Status::GenericFailure, format!("HKDF expand failed: {:?}", e)))?;
    Ok(hex::encode(&okm.0))
}
