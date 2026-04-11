#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    tracing::info!("Starting worker-rs");
    
    // TODO: Initialize worker
    Ok(())
}