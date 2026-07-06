# Screenshot Tool

The worker now includes a native screenshot tool using headless Chrome.

## Usage

To execute a screenshot job, send a job with command format:
```
screenshot <url> [--full-page]
```

## Examples

```bash
# Screenshot viewport
screenshot https://example.com

# Full page screenshot
screenshot https://example.com --full-page
```

## Output

The job will return a base64-encoded PNG image in the `stdout` field, prefixed with `data:image/png;base64,`.

## Configuration

The browser runs in headless mode with GPU disabled by default. Chromium binary is automatically downloaded on first run.
