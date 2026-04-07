use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(author, version, about = "Rust Worker Agent", long_about = None)]
pub struct Config {
    #[arg(long, default_value = "http://localhost:6276")]
    pub api_url: String,

    #[arg(long)]
    pub api_key: String,

    #[arg(long, default_value_t = 5)]
    pub max_concurrent_jobs: usize,

    #[arg(long, default_value_t = 300)]
    pub manifest_check_interval: u64,

    #[arg(long, default_value = "./tools")]
    pub tools_dir: String,

    #[arg(long, default_value_t = 5)]
    pub heartbeat_interval: u64,
}

impl Config {
    pub fn from_args() -> Self {
        clap::Parser::parse()
    }
}
