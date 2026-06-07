//! App-level OS keychain access for the E2E sync layer.
//!
//! The device X25519 private key (and other sync secrets) must live in the OS
//! keychain **independent of the sidecar** — sync is an app concern and must work
//! even when no sidecar/board is running. These commands are a thin, generic
//! key→value store over the `keyring` crate, keyed `service = com.myra-agents.app`,
//! `account = <caller-supplied key>`. Callers namespace their own keys (e.g.
//! `sync:device:privkey`) to avoid collisions with the sidecar's plugin secrets.
//!
//! Best-effort: on a box with no secret service the backend is unavailable, so a
//! clear `Err(String)` is surfaced rather than panicking or writing to disk.

const SERVICE: &str = "com.myra-agents.app";

fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

/// Store (or replace) a secret value under `key`.
#[tauri::command]
pub fn keychain_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

/// Read a secret. `Ok(None)` = not set; `Err` = keychain unavailable.
#[tauri::command]
pub fn keychain_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Remove a secret. Idempotent — a missing entry is not an error.
#[tauri::command]
pub fn keychain_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
