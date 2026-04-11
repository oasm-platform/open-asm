fn main() -> Result<(), Box<dyn std::error::Error>> {
    prost_build::Config::new()
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .out_dir("src/grpc/generated")
        .compile_protos(
            &["src/proto/workers.proto", "src/proto/jobs_registry.proto"],
            &["src/proto"],
        )?;
    Ok(())
}