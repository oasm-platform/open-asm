use worker::services::browser::BrowserService;

#[tokio::test]
async fn test_browser_service_screenshot() {
    let service = BrowserService::new()
        .await
        .expect("Failed to create browser service");

    // Test screenshot of example.com
    let result = service.screenshot("https://example.com", false).await;
    assert!(result.is_ok());

    let png_data = result.unwrap();
    assert!(!png_data.is_empty());
    assert!(png_data.starts_with(b"\x89PNG\r\n\x1a\n")); // PNG magic number

    service.shutdown().await.expect("Failed to shutdown");
}
