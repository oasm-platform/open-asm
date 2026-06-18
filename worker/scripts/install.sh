#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# OASM Worker Installer for Linux/macOS
# ============================================================
# Downloads the latest oasm-worker binary from GitHub releases,
# verifies it, and optionally starts the worker immediately.
#
# Usage:
#   ./install.sh --api-key "oasm_xxx"
#   ./install.sh --api-key "oasm_xxx" --run
#   ./install.sh --api-key "oasm_xxx" --grpc-host "my-server.com" --run
#
# Requirements:
#   - curl or wget
#   - 64-bit Linux or macOS (amd64 or arm64)
# ============================================================

REPOSITORY="oasm-platform/open-asm"
DEFAULT_INSTALL_DIR="$HOME/.oasm-worker"
DEFAULT_GRPC_HOST="localhost"
DEFAULT_GRPC_PORT=16276
DEFAULT_MAX_CONCURRENCY=10
DOWNLOAD_TIMEOUT=300
DOWNLOAD_RETRY=3

# ============================================================
# Colors & Helpers
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}$*${NC}"; }
success() { echo -e "${GREEN}$*${NC}"; }
warn()    { echo -e "${YELLOW}$*${NC}"; }
error()   { echo -e "${RED}$*${NC}" >&2; }
gray()    { echo -e "${GRAY}$*${NC}"; }

usage() {
    cat <<EOF
OASM Worker Installer

Usage:
  install.sh [OPTIONS]

Options:
  --api-key KEY          (Required) API key for worker authentication
  --grpc-host HOST       gRPC server host (default: $DEFAULT_GRPC_HOST)
  --grpc-port PORT       gRPC server port (default: $DEFAULT_GRPC_PORT)
  --max-concurrency N    Maximum concurrent tasks (default: $DEFAULT_MAX_CONCURRENCY)
  --network NETWORK      Network ID for internal network (optional)
  --install-dir DIR      Installation directory (default: $DEFAULT_INSTALL_DIR)
  --run                  Start worker immediately after installation
  --help                 Show this help message

Examples:
  ./install.sh --api-key "oasm_xxx"
  ./install.sh --api-key "oasm_xxx" --run
  ./install.sh --api-key "oasm_xxx" --grpc-host "my-server.com" --grpc-port 16276 --run
EOF
    exit 0
}

# ============================================================
# Parse Arguments
# ============================================================
parse_args() {
    API_KEY=""
    GRPC_HOST="$DEFAULT_GRPC_HOST"
    GRPC_PORT="$DEFAULT_GRPC_PORT"
    MAX_CONCURRENCY="$DEFAULT_MAX_CONCURRENCY"
    NETWORK=""
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
    RUN=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --api-key)
                API_KEY="$2"
                shift 2
                ;;
            --grpc-host)
                GRPC_HOST="$2"
                shift 2
                ;;
            --grpc-port)
                GRPC_PORT="$2"
                shift 2
                ;;
            --max-concurrency)
                MAX_CONCURRENCY="$2"
                shift 2
                ;;
            --network)
                NETWORK="$2"
                shift 2
                ;;
            --install-dir)
                INSTALL_DIR="$2"
                shift 2
                ;;
            --run)
                RUN=true
                shift
                ;;
            --help|-h)
                usage
                ;;
            *)
                error "Unknown option: $1"
                echo "Run with --help for usage information."
                exit 1
                ;;
        esac
    done

    if [[ -z "$API_KEY" ]]; then
        error "Error: --api-key is required"
        echo "Run with --help for usage information."
        exit 1
    fi
}

# ============================================================
# Platform Detection
# ============================================================
detect_platform() {
    local os arch

    # Detect OS
    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="darwin" ;;
        CYGWIN*|MINGW*|MSYS*)
            error "This script is for Linux/macOS only."
            error "Use install.ps1 for Windows."
            exit 1
            ;;
        *)
            error "Unsupported OS: $(uname -s)"
            exit 1
            ;;
    esac

    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64|AMD64)
            arch="amd64"
            ;;
        aarch64|arm64|ARM64)
            arch="arm64"
            ;;
        *)
            error "Unsupported architecture: $(uname -m)"
            error "oasm-worker requires a 64-bit system (amd64 or arm64)."
            exit 1
            ;;
    esac

    OS="$os"
    ARCH="$arch"
    BINARY_NAME="oasm-worker-${OS}-${ARCH}"
}

# ============================================================
# Dependency Check
# ============================================================
check_dependencies() {
    local has_curl has_wget has_jq

    has_curl=false
    has_wget=false
    has_jq=false

    if command -v curl &>/dev/null; then
        has_curl=true
    fi

    if command -v wget &>/dev/null; then
        has_wget=true
    fi

    if command -v jq &>/dev/null; then
        has_jq=true
    fi

    if [[ "$has_curl" == false && "$has_wget" == false ]]; then
        error "Error: Neither curl nor wget is installed."
        error "Install one of them:"
        error "  Ubuntu/Debian: sudo apt install curl"
        error "  CentOS/RHEL:   sudo yum install curl"
        error "  macOS:         brew install curl"
        exit 1
    fi

    HAS_CURL="$has_curl"
    HAS_WGET="$has_wget"
    HAS_JQ="$has_jq"
}

# ============================================================
# HTTP Helpers
# ============================================================
# api_get: fetch GitHub API with proper headers (returns body only)
api_get() {
    local url="$1"

    if [[ "$HAS_CURL" == true ]]; then
        curl -sL --connect-timeout 30 --max-time 60 \
            -H "Accept: application/vnd.github.v3+json" \
            -H "User-Agent: oasm-installer/1.0" \
            "$url"
    elif [[ "$HAS_WGET" == true ]]; then
        wget -q --timeout=60 \
            --header="Accept: application/vnd.github.v3+json" \
            --header="User-Agent: oasm-installer/1.0" \
            -O- "$url"
    fi
}

# http_get: simple GET (no auth headers, for binary downloads)
http_get() {
    local url="$1"
    local output="${2:-}"

    if [[ "$HAS_CURL" == true ]]; then
        if [[ -n "$output" ]]; then
            curl -sL --connect-timeout 30 --max-time 120 -o "$output" "$url"
        else
            curl -sL --connect-timeout 30 --max-time 120 "$url"
        fi
    elif [[ "$HAS_WGET" == true ]]; then
        if [[ -n "$output" ]]; then
            wget -q --timeout=120 -O "$output" "$url"
        else
            wget -q --timeout=120 -O- "$url"
        fi
    fi
}

# ============================================================
# Download File with Progress + Retry
# ============================================================
download_file() {
    local url="$1"
    local output="$2"
    local attempt=1

    while [[ $attempt -le $DOWNLOAD_RETRY ]]; do
        info "  Attempt ${attempt}/${DOWNLOAD_RETRY}..." >&2

        if [[ "$HAS_CURL" == true ]]; then
            if curl -L --progress-bar \
                --connect-timeout 30 \
                --max-time "$DOWNLOAD_TIMEOUT" \
                --retry 2 \
                -o "$output" \
                "$url" 1>/dev/null; then
                return 0
            fi
        elif [[ "$HAS_WGET" == true ]]; then
            if wget --progress=bar:force:noscroll \
                --timeout=30 \
                --tries=2 \
                -O "$output" \
                "$url" >/dev/null; then
                return 0
            fi
        fi

        warn "  Download failed on attempt ${attempt}." >&2
        rm -f "$output"
        attempt=$((attempt + 1))

        if [[ $attempt -le $DOWNLOAD_RETRY ]]; then
            gray "  Retrying in 3 seconds..." >&2
            sleep 3
        fi
    done

    error "Download failed after ${DOWNLOAD_RETRY} attempts."
    return 1
}

# ============================================================
# GitHub API: Get Latest Release
# Try /releases/latest first, fall back to /releases if 404
# ============================================================
get_latest_release() {
    local latest_url="https://api.github.com/repos/${REPOSITORY}/releases/latest"
    local list_url="https://api.github.com/repos/${REPOSITORY}/releases"
    local response http_code

    # Try /releases/latest first (like install.ps1)
    if [[ "$HAS_CURL" == true ]]; then
        http_code=$(curl -sL --connect-timeout 30 --max-time 60 \
            -H "Accept: application/vnd.github.v3+json" \
            -H "User-Agent: oasm-installer/1.0" \
            -w '%{http_code}' \
            -o /tmp/oasm_release.json \
            "$latest_url") || true
        response=$(cat /tmp/oasm_release.json 2>/dev/null || echo "")
        rm -f /tmp/oasm_release.json
    else
        response=$(api_get "$latest_url") || true
        http_code="200"
    fi

    # If /releases/latest returns 200 and has tag_name, use it
    if [[ "$http_code" == "200" ]] && echo "$response" | grep -q '"tag_name"'; then
        echo "$response"
        return 0
    fi

    # Fallback: get list of releases and use first one
    gray "  /releases/latest returned ${http_code}, trying /releases..."
    response=$(api_get "$list_url") || {
        error "Failed to connect to GitHub API"
        error "Check your internet connection."
        exit 1
    }

    if [[ -z "$response" ]]; then
        error "Empty response from GitHub API"
        exit 1
    fi

    # Check for error responses
    local msg
    msg=$(echo "$response" | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"' || true)
    if [[ -n "$msg" ]]; then
        error "GitHub API error: $msg"
        error "Check: https://github.com/${REPOSITORY}/releases"
        exit 1
    fi

    echo "$response"
}

# ============================================================
# Parse Release JSON (works with or without jq)
# ============================================================
parse_tag_name() {
    local json="$1"
    if [[ "$HAS_JQ" == true ]]; then
        echo "$json" | jq -r '.tag_name // .[0].tag_name // empty' 2>/dev/null || echo ""
    else
        echo "$json" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || echo ""
    fi
}

parse_published_at() {
    local json="$1"
    if [[ "$HAS_JQ" == true ]]; then
        echo "$json" | jq -r '.published_at // .[0].published_at // empty' 2>/dev/null || echo ""
    else
        echo "$json" | grep -o '"published_at"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"published_at"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || echo ""
    fi
}

# ============================================================
# Find Binary Asset in Release
# ============================================================
find_binary_asset() {
    local json="$1"
    local binary_name="$2"
    local download_url=""
    local asset_size=0

    if [[ "$HAS_JQ" == true ]]; then
        # Try single object first, then array
        download_url=$(echo "$json" | jq -r --arg name "$binary_name" '
            (.assets // [])[0] as $first_check |
            if ($first_check | type) == "array" then
                [.[] | .assets[]? | select(.name == $name) | .browser_download_url][0] // ""
            else
                [.assets[]? | select(.name == $name) | .browser_download_url][0] // ""
            end
        ' 2>/dev/null || echo "")
        
        if [[ -z "$download_url" ]]; then
            # Simpler approach: flatten all assets
            download_url=$(echo "$json" | jq -r --arg name "$binary_name" '
                [.. | .assets? // empty | .[] | select(.name == $name) | .browser_download_url][0] // ""
            ' 2>/dev/null || echo "")
        fi

        asset_size=$(echo "$json" | jq -r --arg name "$binary_name" '
            [.. | .assets? // empty | .[] | select(.name == $name) | .size][0] // 0
        ' 2>/dev/null || echo "0")
    else
        # grep fallback: GitHub download URLs contain the filename
        download_url=$(echo "$json" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*"' \
            | grep "$binary_name" \
            | head -1 \
            | sed 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
        
        if [[ -n "$download_url" ]]; then
            asset_size=$(echo "$json" | grep -o '"size"[[:space:]]*:[[:space:]]*[0-9]*' \
                | head -1 \
                | grep -o '[0-9]*$' || true)
        fi
    fi

    if [[ -z "$download_url" ]]; then
        error "Binary '$binary_name' not found in latest release."
        error "Available assets can be found at:"
        error "  https://github.com/${REPOSITORY}/releases"
        exit 1
    fi

    ASSET_URL="$download_url"
    ASSET_SIZE="${asset_size:-0}"
}

# ============================================================
# Download & Install Binary
# ============================================================
install_binary() {
    local download_url="$1"
    local install_dir="$2"
    local binary_name="$3"
    local expected_size="${4:-0}"

    # Create install directory
    mkdir -p "$install_dir"

    local dest_path="${install_dir}/${binary_name}"

    info "  Downloading ${binary_name}..." >&2

    # Download with progress + retry
    download_file "$download_url" "$dest_path" || {
        error "Failed to download binary after ${DOWNLOAD_RETRY} attempts"
        exit 1
    }

    # Verify download
    if [[ ! -f "$dest_path" ]]; then
        error "Download failed - file not found at $dest_path"
        exit 1
    fi

    local file_size
    file_size=$(stat -f%z "$dest_path" 2>/dev/null || stat -c%s "$dest_path" 2>/dev/null || echo "0")

    if [[ "$file_size" -eq 0 ]]; then
        rm -f "$dest_path"
        error "Downloaded file is empty. The release may be corrupted."
        exit 1
    fi

    # Size check (warning only)
    if [[ "$expected_size" -gt 0 && "$file_size" -ne "$expected_size" ]]; then
        warn "  Warning: File size ($file_size) differs from expected ($expected_size)" >&2
    fi

    local size_mb
    size_mb=$(echo "scale=2; $file_size / 1048576" | bc 2>/dev/null || echo "unknown")
    success "  Downloaded: ${size_mb} MB" >&2

    # Set executable permission
    chmod +x "$dest_path" || {
        warn "  Warning: Could not set executable permission." >&2
        warn "  Run manually: chmod +x $dest_path" >&2
    }

    echo "$dest_path"
}

# ============================================================
# Build Run Command
# ============================================================
build_rerun_command() {
    local binary_path="$1"
    local grpc_host="$2"
    local grpc_port="$3"
    local max_concurrency="$4"
    local network="$5"

    local cmd="\"${binary_path}\" --api-key \"${API_KEY}\" --grpc-host \"${grpc_host}\" --grpc-port ${grpc_port} --max-concurrency ${max_concurrency}"

    if [[ -n "$network" ]]; then
        cmd="${cmd} --network \"${network}\""
    fi

    echo "$cmd"
}

# ============================================================
# Start Worker
# ============================================================
start_worker() {
    local binary_path="$1"

    info ""
    info "  Starting oasm-worker..."
    gray "  Endpoint    : ${GRPC_HOST}:${GRPC_PORT}"
    gray "  Concurrency : ${MAX_CONCURRENCY}"
    if [[ -n "$NETWORK" ]]; then
        gray "  Network     : ${NETWORK}"
    fi
    info ""

    local args=(
        "--api-key" "$API_KEY"
        "--grpc-host" "$GRPC_HOST"
        "--grpc-port" "$GRPC_PORT"
        "--max-concurrency" "$MAX_CONCURRENCY"
    )

    if [[ -n "$NETWORK" ]]; then
        args+=("--network" "$NETWORK")
    fi

    exec "$binary_path" "${args[@]}"
}

# ============================================================
# Main
# ============================================================
main() {
    parse_args "$@"
    
    echo ""
    info "========================================"
    info "  OASM Worker Installer"
    info "========================================"
    echo ""

    # 1. Detect platform
    info "[1/5] Detecting platform..."
    detect_platform
    gray "  OS  : ${OS}"
    gray "  Arch: ${ARCH}"
    gray "  Bin : ${BINARY_NAME}"
    echo ""

    # 2. Check dependencies
    info "[2/5] Checking dependencies..."
    check_dependencies
    gray "  curl : ${HAS_CURL}"
    gray "  wget : ${HAS_WGET}"
    gray "  jq   : ${HAS_JQ}"
    echo ""

    # 3. Fetch latest release
    info "[3/5] Fetching latest release from GitHub..."
    local release_json
    release_json=$(get_latest_release)
    
    local version published_at
    version=$(parse_tag_name "$release_json")
    published_at=$(parse_published_at "$release_json")
    
    gray "  Version   : ${version}"
    gray "  Published : ${published_at}"
    echo ""

    # 4. Find matching binary
    info "[4/5] Finding matching binary..."
    find_binary_asset "$release_json" "$BINARY_NAME"
    gray "  URL  : ${ASSET_URL}"
    if [[ "$ASSET_SIZE" -gt 0 ]]; then
        local size_mb
        size_mb=$(echo "scale=2; $ASSET_SIZE / 1048576" | bc 2>/dev/null || echo "unknown")
        gray "  Size : ${size_mb} MB"
    fi
    echo ""

    # 5. Download and install
    info "[5/5] Installing binary..."
    local binary_path
    binary_path=$(install_binary "$ASSET_URL" "$INSTALL_DIR" "$BINARY_NAME" "$ASSET_SIZE")
    success "  Path: ${binary_path}"
    echo ""

    # Print summary
    success "========================================"
    success "  Installation complete!"
    success "  Version : ${version}"
    success "  Binary  : ${binary_path}"
    success "========================================"
    echo ""

    # Print re-run command
    local rerun_cmd
    rerun_cmd=$(build_rerun_command "$binary_path" "$GRPC_HOST" "$GRPC_PORT" "$MAX_CONCURRENCY" "$NETWORK")
    
    warn "To re-run the worker later:"
    echo "  ${rerun_cmd}"
    echo ""

    # Run if requested
    if [[ "$RUN" == true ]]; then
        start_worker "$binary_path"
    else
        gray "Run with --run flag to start the worker immediately."
        gray "Example:"
        gray "  \"${binary_path}\" --api-key \"${API_KEY}\""
        echo ""
    fi
}

main "$@"
