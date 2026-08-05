#!/usr/bin/env bash
# One-command environment setup for gvui.
# Installs Bun, the Rust toolchain (with the wasm32 target), and wasm-pack
# if they're not already present, then installs JS deps and builds the WASM
# layout engine. Safe to re-run.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

log() { printf '\n\033[1;36m==>\033[0m %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

log "Checking for Bun"
if ! have bun; then
  echo "Bun not found — installing latest via official installer..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
else
  echo "Bun found: $(bun --version)"
fi

if ! have bun; then
  echo "error: bun install completed but 'bun' is still not on PATH." >&2
  echo "Open a new shell (or 'source ~/.bashrc'/'source ~/.zshrc') and re-run 'bun run setup'." >&2
  exit 1
fi

log "Checking for Rust toolchain"
if ! have rustc || ! have cargo; then
  echo "Rust not found — installing via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  export PATH="$HOME/.cargo/bin:$PATH"
else
  echo "Rust found: $(rustc --version)"
fi

log "Ensuring wasm32-unknown-unknown target is installed"
rustup target add wasm32-unknown-unknown

log "Checking for wasm-pack"
if ! have wasm-pack; then
  echo "wasm-pack not found — installing..."
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
  export PATH="$HOME/.cargo/bin:$PATH"
else
  echo "wasm-pack found: $(wasm-pack --version)"
fi

log "Checking for Docker (optional, only needed for 'bun run prod' / 'bun run dev')"
if have docker; then
  echo "Docker found: $(docker --version)"
else
  echo "Docker not found. Not required — 'bun start' runs fully without it."
  echo "Install Docker Desktop from https://www.docker.com/products/docker-desktop/ if you want the containerized dev/prod flow."
fi

log "Installing the git pre-commit hook"
# `core.hooksPath` is per-clone local config, so a fresh clone has to opt in here. The hook itself
# lives in .githooks/ and is version controlled; .git/hooks is not.
if git rev-parse --git-dir >/dev/null 2>&1; then
  git config core.hooksPath .githooks
  chmod +x .githooks/* 2>/dev/null || true
  echo "Pre-commit hook installed (refuses unformatted commits; bypass with --no-verify)."
else
  echo "Not a git repository, skipping hook installation."
fi

log "Installing JS dependencies"
bun install

log "Building the WASM layout engine"
bun run build:wasm

log "Setup complete"
cat <<'EOF'

Next steps:
  bun start        Build and run the app in production mode locally  (http://localhost:5555)
  bun run dev:host  Run the dev server directly on your machine       (http://localhost:4444)
  bun run prod      Build and run production mode inside Docker       (http://localhost:5555)
  bun run dev       Run the dev server inside Docker with hot reload  (http://localhost:4444)

EOF
