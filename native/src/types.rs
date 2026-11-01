use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SensitiveKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SensitiveBuffer(pub Vec<u8>);
