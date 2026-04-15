# AI Agents for worker (Rust)

## Code Quality Standards

- **Formatting**: `rustfmt` (default 2021 edition)
- **Linting**: `clippy` with `cargo clippy -- -D warnings`
- **Error handling**: Use `Result<T, E>` and propagate with `?`. Wrap errors with `anyhow` or custom error enums.
- **Async**: Use `tokio` runtime, avoid blocking calls inside async functions.
- **Logging**: Use `tracing` crate; never use `println!` for production logs.
- **Testing**: `cargo test` with >80% coverage for business logic. Use `mockall` or similar for mocking external services.
- **Security**: Validate all external inputs, avoid unsafe code, ensure proper handling of secrets via environment variables.

## Agents

### 1. Performance Optimization Agent
- **Focus**: Identify performance bottlenecks in async job execution, tool management, and gRPC communication.
- **Key files**: `src/main.rs`, `src/executor/mod.rs`, `src/tools/mod.rs`.
- **Typical tasks**: Profile with `tokio-console`, optimize semaphore usage, reduce allocation overhead.

### 2. Rust Best Practices Agent
- **Focus**: Enforce idiomatic Rust, proper error handling, and module organization.
- **Key files**: Entire `src/` directory.
- **Typical tasks**: Refactor large functions, replace `unwrap`/`expect` with proper error propagation, ensure `Send + Sync` where needed.

### 3. Integration Agent
- **Focus**: Verify correct interaction with the gRPC server, tool manager, and shared state.
- **Key files**: `src/grpc/`, `src/state.rs`, `src/tools/`.
- **Typical tasks**: Ensure metadata handling is correct, test reconnection logic, validate token parsing.

### 4. Testing Agent
- **Focus**: Write unit and integration tests for job execution, tool download, and alive loop.
- **Key files**: `tests/` (create if missing), mock implementations for gRPC client.
- **Typical tasks**: Achieve >80% coverage, use `tokio::test` for async tests.

## Development Workflow

1. **Setup**
   ```bash
    cd worker
   cargo build
   cargo test
   ```
2. **Run**
   ```bash
   cargo run -- --grpc-host localhost --grpc-port 50051 --api-key <key>
   ```
3. **Lint & Format**
   ```bash
   cargo fmt
   cargo clippy -- -D warnings
   ```

## Documentation
- Keep this `AGENTS.md` up‑to‑date with any new agents or responsibilities.
- Document public structs and functions with Rustdoc comments.
