# GVUI — Directed Graph Visualization UI

**GVUI** is a high-performance directed graph layout and visualization UI built with **React**, **TypeScript**, **Vite**, and a custom **Rust / WebAssembly (WASM)** layout engine.

---

## 🚀 Quick Start: Running Locally (Dockerless)

To run `GVUI` directly on your host machine without Docker:

### Prerequisites

- **[Bun](https://bun.sh)** (v1.0+)
- **[Rust](https://rustup.rs)** with the `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- **[wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)**:
  ```bash
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
  ```

### Steps to Run

1. **Install dependencies:**

   ```bash
   bun install
   ```

2. **Build the WASM layout engine:**

   ```bash
   bun run build:wasm
   ```

3. **Start the local development server:**
   ```bash
   bun run dev:host
   ```
   Open **`http://localhost:5173`** in your browser.

---

## 📦 Production Deployment Options

### Option 1: Production with Docker (Recommended)

Run the production static bundle served behind an optimized Nginx container:

1. **Build and start the container in background:**
   ```bash
   bun run prod
   # Or directly using docker compose:
   docker compose -f docker-compose.prod.yml up -d --build
   ```
2. **Access the app:**
   Open **`http://localhost:8080`** in your browser.

3. **Stop the production container:**
   ```bash
   bun run prod:stop
   # Or:
   docker compose -f docker-compose.prod.yml down
   ```

---

### Option 2: Production without Docker (Local Production Compilation)

To build and test the production-compiled bundle locally without Docker:

1. **Compile WASM & build the production bundle:**

   ```bash
   bun run build
   ```

   _This outputs static assets to the `./dist` directory._

2. **Preview the production bundle locally:**

   ```bash
   bun run preview:local
   ```

   Open **`http://localhost:4173`** to view the production preview.

3. **Deploying to a web server / host:**
   You can serve the generated `dist/` directory using any static web server (such as Nginx, Caddy, Vercel, Netlify, or GitHub Pages).

---

## 🛠️ Development Steps & Workflow

### 1. Running Development Server with Docker

If you prefer developing inside a containerized environment with auto-rebuilding and hot-reloading:

```bash
bun run dev
# Or directly:
docker compose -f docker-compose.dev.yml up --build --watch
```

- App access: `http://localhost:5173`
- Logs: `bun run logs`
- Stop server: `bun run stop`

### 2. Running Development Server Dockerless

```bash
bun run dev:host
```

### 3. Testing & Code Quality Commands

- **Run all unit tests** (Rust crate tests + TypeScript test suite):
  ```bash
  bun run test
  ```
- **Run Typecheck:**
  ```bash
  bun run typecheck
  ```
- **Run Linter (Oxlint):**
  ```bash
  bun run lint
  ```
- **Run Formatter (Oxfmt):**
  ```bash
  bun run format
  ```
- **Run Layout Audit Harness:**
  ```bash
  bun run audit
  ```

---

## 💾 Local SQLite Database & Layout Caching

`GVUI` uses an in-browser SQLite database powered by **`sql.js`** (`src/utils/sqliteDb.ts`) to store and cache graph layout calculations.

### How it works & Data Privacy:

- **Client-Side Only**: The SQLite database runs entirely inside the end-user's browser WebAssembly runtime and persists layout caches to browser `localStorage` under the key `gvui_sqlite_db_v1`.
- **No Database Files Pushed**: There are **no `.sqlite` or `.db` binary database files** stored on disk or tracked by Git.
- **Fresh State for Every User**: When another user clones or runs this repository, their browser initializes a brand-new, empty in-memory SQLite database.
- **Zero Server Overhead / Data Leakage**: Your local cache data stays strictly in your own browser and is never committed or pushed to GitHub.
