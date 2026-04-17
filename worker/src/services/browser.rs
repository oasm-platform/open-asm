use crate::error::WorkerError;
use headless_chrome::{Browser, LaunchOptions};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use rand::prelude::*; 

#[derive(Clone)]
pub struct BrowserService {
    browser: Arc<Mutex<Option<Browser>>>,
}

impl std::fmt::Debug for BrowserService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BrowserService").field("status", &"Active").finish()
    }
}

const USER_AGENTS: &[&str] = &[
    // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",

  // Chrome on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",

  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",

  // Safari on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",

  // Edge on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
].as_slice();

impl BrowserService {
    pub async fn new() -> Result<Self, WorkerError> {
        let browser = Self::init_browser().await?;
        Ok(Self {
            browser: Arc::new(Mutex::new(Some(browser))),
        })
    }

    async fn init_browser() -> Result<Browser, WorkerError> {
        let options = LaunchOptions {
            headless: true,
            sandbox: false,
            args: vec![
                std::ffi::OsStr::new("--disable-gpu"),
                std::ffi::OsStr::new("--no-sandbox"),
                std::ffi::OsStr::new("--disable-dev-shm-usage"),
                std::ffi::OsStr::new("--disable-software-rasterizer"),
                std::ffi::OsStr::new("--ignore-certificate-errors"),
                std::ffi::OsStr::new("--ignore-ssl-errors"),
            ],
            idle_browser_timeout: Duration::from_secs(3600),
            ..Default::default()
        };

        tokio::task::spawn_blocking(move || Browser::new(options))
            .await
            .map_err(|e| WorkerError::Browser(format!("Spawn failed: {}", e)))?
            .map_err(|e| WorkerError::Browser(format!("Launch failed: {}", e)))
    }

    pub async fn screenshot(&self, url: &str, full_page: bool) -> Result<Vec<u8>, WorkerError> {
        let clean_url = url.trim_start_matches("http://").trim_start_matches("https://");
        
        let mut urls_to_try = vec![];
        if url.contains(":80") && !url.contains(":8080") {
            urls_to_try.push(format!("http://{}", clean_url));
            urls_to_try.push(format!("https://{}", clean_url));
        } else {
            urls_to_try.push(format!("https://{}", clean_url));
            urls_to_try.push(format!("http://{}", clean_url));
        }

        let mut guard = self.browser.lock().await;
        let mut browser_instance = guard.as_ref().ok_or_else(|| WorkerError::Browser("Missing".into()))?.clone();

        let tab = match browser_instance.new_tab() {
            Ok(t) => t,
            Err(_) => {
                let new_b = Self::init_browser().await?;
                *guard = Some(new_b.clone());
                browser_instance = new_b;
                browser_instance.new_tab().map_err(|e| WorkerError::Browser(e.to_string()))?
            }
        };
        drop(guard);

        
        let user_agent: &str = {
            let mut r = rand::rng(); 
            USER_AGENTS
                .choose(&mut r)
                .copied()
                .unwrap_or(USER_AGENTS[0])
        }; 

        let result = tokio::task::spawn_blocking(move || {
            let _ = tab.set_user_agent(user_agent, None, None);

            let mut last_error = String::new();
            for target_url in urls_to_try {
                match tab.navigate_to(&target_url) {
                    Ok(_) => {
                        let _ = tab.wait_until_navigated();
                        
                        if let Ok(content) = tab.get_content() {
                            if content.contains("The plain HTTP request was sent to HTTPS port") || 
                               content.contains("400 Bad Request") {
                                continue;
                            }
                        }

                        let screenshot = tab.capture_screenshot(
                            headless_chrome::protocol::cdp::Page::CaptureScreenshotFormatOption::Png,
                            None, None, full_page,
                        ).map_err(|e| WorkerError::Browser(e.to_string()))?;

                        let _ = tab.close(true);
                        return Ok(screenshot);
                    }
                    Err(e) => {
                        last_error = e.to_string();
                        continue;
                    }
                }
            }
            let _ = tab.close(true);
            Err(WorkerError::Browser(format!("All protocols failed. Last error: {}", last_error)))
        })
        .await
        .map_err(|e| WorkerError::Browser(e.to_string()))?;

        result
    }

    pub async fn shutdown(&self) -> Result<(), WorkerError> {
        let mut guard = self.browser.lock().await;
        if let Some(browser) = guard.take() { drop(browser); }
        Ok(())
    }
}
