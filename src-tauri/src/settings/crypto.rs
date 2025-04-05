use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce, KeyInit};
use chacha20poly1305::aead::Aead;
use rand::{rngs::OsRng, RngCore};
use std::fs;
use std::path::Path;
use base64::{decode, encode};

// Generate or load the encryption key
pub fn get_encryption_key(app_data_dir: &str) -> Result<[u8; 32], String> {
    let key_path = format!("{}/encryption_key.bin", app_data_dir);
    
    if Path::new(&key_path).exists() {
        // Load existing key
        let key_data = fs::read(&key_path).map_err(|e| format!("Failed to read key: {}", e))?;
        if key_data.len() != 32 {
            return Err("Invalid key length".to_string());
        }
        
        let mut key = [0u8; 32];
        key.copy_from_slice(&key_data);
        Ok(key)
    } else {
        // Generate new key
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        
        // Ensure directory exists
        if let Some(parent) = Path::new(&key_path).parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        
        // Write key to file
        fs::write(&key_path, &key).map_err(|e| format!("Failed to write key: {}", e))?;
        
        Ok(key)
    }
}

// Encrypt data
pub fn encrypt(key: &[u8; 32], data: &str) -> Result<String, String> {
    // Create nonce (must be unique per encryption)
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    let nonce = Nonce::from_slice(&nonce);
    
    // Encrypt data
    let encrypted = cipher
        .encrypt(nonce, data.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;
    
    // Prepend nonce to encrypted data
    let mut result = Vec::with_capacity(nonce.len() + encrypted.len());
    result.extend_from_slice(nonce);
    result.extend_from_slice(&encrypted);
    
    // Base64 encode for storage
    Ok(encode(&result))
}

// Decrypt data
pub fn decrypt(key: &[u8; 32], encrypted_data: &str) -> Result<String, String> {
    // Base64 decode
    let data = decode(encrypted_data).map_err(|e| format!("Base64 decoding failed: {}", e))?;
    
    if data.len() < 12 {
        return Err("Invalid encrypted data".to_string());
    }
    
    // Extract nonce (first 12 bytes)
    let nonce = Nonce::from_slice(&data[0..12]);
    
    // Extract encrypted data (remaining bytes)
    let encrypted = &data[12..];
    
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    
    // Decrypt data
    let decrypted = cipher
        .decrypt(nonce, encrypted)
        .map_err(|e| format!("Decryption failed: {}", e))?;
    
    String::from_utf8(decrypted).map_err(|e| format!("UTF-8 conversion failed: {}", e))
}
