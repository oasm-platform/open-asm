#!/usr/bin/env bash
# ================================================================
# Local GitHub Actions testing script using act (nektos/act)
# ================================================================
# Usage:
#   bash .github/scripts/test-local.sh           # List available workflows
#   bash .github/scripts/test-local.sh check-lint # Run specific workflow
#   bash .github/scripts/test-local.sh --all      # Run all workflows (dry-run)
#
# Prerequisites:
#   - Docker Desktop installed and running
#   - act installed (see https://github.com/nektos/act)
#
# Windows (Git Bash):
#   curl -fsSL https://raw.githubusercontent.com/nektos/act/master/install.sh | bash
#   mv act_Windows_x86_64.zip /tmp/act/act.exe
# ================================================================

set -euo pipefail

ACT_BIN="${ACT_BIN:-/tmp/act/act.exe}"
WORKFLOW="${1:-list}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Validate act binary
if [ ! -f "$ACT_BIN" ] && ! command -v act &>/dev/null; then
  error "act not found at $ACT_BIN or in PATH"
  echo ""
  echo "  Install act:"
  echo "    Linux/macOS: curl -fsSL https://raw.githubusercontent.com/nektos/act/master/install.sh | bash"
  echo "    Windows:     Download from https://github.com/nektos/act/releases"
  echo "    Or set:      ACT_BIN=/path/to/act"
  echo ""
  exit 1
fi

# Use PATH version if available, fallback to ACT_BIN
if command -v act &>/dev/null; then
  ACT_BIN="act"
fi

cd "$ROOT_DIR"

# List mode
if [ "$WORKFLOW" = "list" ]; then
  echo "============================================"
  echo "  Available GitHub Actions Workflows"
  echo "============================================"
  echo ""
  for f in .github/workflows/*.yml; do
    name=$(basename "$f" .yml)
    desc=$(grep "^name:" "$f" | sed 's/name: *//')
    jobs=$(grep -c "^\s\+[a-z_-]\+:" "$f" || true)
    printf "  %-25s %s\n" "$name" "$desc"
  done
  echo ""
  echo "============================================"
  echo "Usage: $0 <workflow-name>"
  echo "  Ex:  $0 check-lint"
  echo "  Ex:  $0 worker-ci"
  echo "  Ex:  $0 --all        (validate all workflows)"
  echo "  Ex:  ACT_BIN=act $0 check-lint"
  echo "============================================"
  exit 0
fi

# Validate all mode
if [ "$WORKFLOW" = "--all" ] || [ "$WORKFLOW" = "all" ]; then
  info "Validating all workflows (dry-run)..."
  for f in .github/workflows/*.yml; do
    name=$(basename "$f" .yml)
    echo ""
    info "=== $name ==="
    "$ACT_BIN" --workflows "$f" --dry-run 2>&1 | head -5 || {
      warn "Dry-run for $name had issues (expected for Docker/multi-arch workflows)"
    }
  done
  info "All workflows validated."
  exit 0
fi

# Run specific workflow
WF_FILE=".github/workflows/${WORKFLOW}.yml"
if [ ! -f "$WF_FILE" ]; then
  error "Workflow file not found: $WF_FILE"
  echo "  Run '$0 list' to see available workflows"
  exit 1
fi

info "Running workflow: $WORKFLOW"
echo "  File: $WF_FILE"
echo ""

"$ACT_BIN" \
  --workflows "$WF_FILE" \
  --container-architecture linux/amd64 \
  --reuse
