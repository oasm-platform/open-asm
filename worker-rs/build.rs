fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_prost_build::configure()
        .build_server(false)
        .compile_protos(
            &["src/proto/workers.proto", "src/proto/jobs_registry.proto"],
            &["src/proto"],
        )?;
    Ok(())
}
