use crate::error::WorkerError;
use headless_chrome::{Browser, LaunchOptions};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct BrowserService {
    browser: Arc<Mutex<Option<Browser>>>,
}

impl std::fmt::Debug for BrowserService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BrowserService").finish()
    }
}

impl BrowserService {
    pub async fn new() -> Result<Self, WorkerError> {
        let options = LaunchOptions {
            headless: true,
            sandbox: true,
            args: vec![
                std::ffi::OsStr::new("--disable-gpu"),
                std::ffi::OsStr::new("--no-sandbox"),
                std::ffi::OsStr::new("--disable-dev-shm-usage"),
                std::ffi::OsStr::new("--disable-software-rasterizer"),
            ],
            ..Default::default()
        };


        let browser = tokio::task::spawn_blocking(move || {
            Browser::new(options)
        })
        .await
        .map_err(|e| WorkerError::Browser(format!("Failed to spawn browser task: {}", e)))?
        .map_err(|e| WorkerError::Browser(format!("Failed to launch browser: {}", e)))?;

        Ok(Self {
            browser: Arc::new(Mutex::new(Some(browser))),
        })
    }

    pub async fn screenshot(&self, url: &str, full_page: bool) -> Result<Vec<u8>, WorkerError> {
        let tab = {
            let browser_guard = self.browser.lock().await;
            let browser = browser_guard.as_ref()
                .ok_or_else(|| WorkerError::Browser("Browser not initialized".into()))?;

            browser.new_tab()
                .map_err(|e| WorkerError::Browser(format!("Failed to create tab: {}", e)))?
        };

        let url_clone = url.to_string();
        let result = tokio::task::spawn_blocking(move || {
            tab.navigate_to(&url_clone).map_err(|e| WorkerError::Browser(e.to_string()))?;
            tab.wait_until_navigated().map_err(|e| WorkerError::Browser(e.to_string()))?;

            let screenshot = if full_page {
                tab.capture_screenshot(
                    headless_chrome::protocol::cdp::Page::CaptureScreenshotFormatOption::Png,
                    None,
                    None,
                    true
                )
            } else {
                tab.capture_screenshot(
                    headless_chrome::protocol::cdp::Page::CaptureScreenshotFormatOption::Png,
                    None,
                    None,
                    false
                )
            }
            .map_err(|e| WorkerError::Browser(e.to_string()))?;

            // Clean up tab
            tab.close(true).map_err(|e| WorkerError::Browser(e.to_string()))?;

            Ok::<Vec<u8>, WorkerError>(screenshot)
        })
        .await
        .map_err(|e| WorkerError::Browser(format!("Screenshot task failed: {}", e)))?;

        result
    }

    pub async fn shutdown(&self) -> Result<(), WorkerError> {
        let mut browser_guard = self.browser.lock().await;
        if let Some(browser) = browser_guard.take() {
            drop(browser);
        }
        Ok(())
    }
}
