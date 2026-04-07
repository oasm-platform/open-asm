// Authentication module - grpc_client handles auth directly via Join
// This module provides additional auth utilities if needed

pub struct AuthManager {
    // Currently auth is handled directly in GrpcClient::join()
    // Additional auth methods can be added here if needed
}

impl AuthManager {
    pub fn new() -> Self {
        Self {}
    }
}
