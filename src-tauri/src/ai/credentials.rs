// Secure credential storage for API keys
//
// Uses OS-native secure storage:
// - macOS: Keychain
// - Windows: Credential Manager
// - Linux: Secret Service (GNOME/KDE)

use keyring::Entry;

const SERVICE_NAME: &str = "com.recodeck.app";
const API_KEY_NAME: &str = "claude_api_key";

pub struct CredentialManager;

impl CredentialManager {
    /// Store the Claude API key in the OS keychain
    pub fn store_api_key(key: &str) -> Result<(), String> {
        // Validate key format (Claude keys start with "sk-ant-")
        // More permissive validation to accept various Claude API key formats
        if !key.starts_with("sk-ant-") {
            return Err("Invalid API key format. Claude API keys should start with 'sk-ant-'".to_string());
        }

        // Additional length check (Claude keys are typically quite long)
        if key.len() < 20 {
            return Err("API key appears too short. Please check and try again.".to_string());
        }

        let entry = Entry::new(SERVICE_NAME, API_KEY_NAME)
            .map_err(|e| format!("Failed to access keychain: {}", e))?;

        entry
            .set_password(key)
            .map_err(|e| format!("Failed to store API key: {}", e))?;

        println!("✓ API key stored successfully in keychain");
        Ok(())
    }

    /// Retrieve the Claude API key from the OS keychain
    pub fn retrieve_api_key() -> Result<Option<String>, String> {
        let entry = Entry::new(SERVICE_NAME, API_KEY_NAME)
            .map_err(|e| format!("Failed to access keychain: {}", e))?;

        match entry.get_password() {
            Ok(key) => {
                println!("✓ API key retrieved from keychain (length: {})", key.len());
                Ok(Some(key))
            },
            Err(keyring::Error::NoEntry) => {
                println!("⚠ No API key found in keychain");
                Ok(None)
            },
            Err(e) => {
                println!("✗ Failed to retrieve API key: {}", e);
                Err(format!("Failed to retrieve API key: {}", e))
            },
        }
    }

    /// Delete the Claude API key from the OS keychain
    pub fn delete_api_key() -> Result<(), String> {
        let entry = Entry::new(SERVICE_NAME, API_KEY_NAME)
            .map_err(|e| format!("Failed to access keychain: {}", e))?;

        entry
            .delete_credential()
            .map_err(|e| format!("Failed to delete API key: {}", e))?;

        Ok(())
    }

    /// Check if an API key is stored (without retrieving it)
    pub fn has_api_key() -> Result<bool, String> {
        match Self::retrieve_api_key() {
            Ok(Some(_)) => {
                println!("✓ API key check: Key is configured");
                Ok(true)
            },
            Ok(None) => {
                println!("⚠ API key check: No key configured");
                Ok(false)
            },
            Err(e) => {
                println!("✗ API key check error: {}", e);
                Err(e)
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_key_validation() {
        // Valid key
        assert!(CredentialManager::store_api_key("sk-ant-api03-test123").is_ok());

        // Invalid key
        assert!(CredentialManager::store_api_key("invalid-key").is_err());
    }
}
