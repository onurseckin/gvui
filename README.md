# GVUI — Graph Visualization UI

**GVUI** is a high-performance directed graph layout and visualization UI built with **React**, **TypeScript**, **Vite**, and a custom **Rust / WebAssembly (WASM)** layout engine.

---

## 🚀 Setup

One command installs everything you need — Bun, the Rust toolchain, the `wasm32-unknown-unknown` target, and `wasm-pack` — if they're not already on your machine, then installs dependencies and builds the WASM engine.

```bash
bun run setup
```

> **Note:** If Bun was just installed by the script, open a new terminal (or `source` your shell rc file) before running the next commands, so `bun` is on your `PATH`.

---

## 📦 Running in Production Mode (Local)

### Option 1: Without Docker (fastest)

```bash
bun start
```

Builds the WASM engine and the production bundle, then serves it locally.

Open **http://localhost:5555**

### Option 2: With Docker

```bash
bun run prod
```

Builds the WASM engine on the host, then builds and runs an optimized Nginx container serving the production bundle.

Open **http://localhost:5555**

Other Docker prod commands:

```bash
bun run prod:stop     # stop the container
bun run prod:restart  # restart the container
bun run prod:logs     # tail logs
```

---

## 🛠️ Development Mode

### Option 1: Without Docker

```bash
bun run dev:host
```

Open **http://localhost:4444**

### Option 2: With Docker (hot reload)

```bash
bun run dev
```

- App access: **http://localhost:4444**
- Logs: `bun run logs`
- Stop server: `bun run stop`
- Run in background: `bun run dev:daemon`
- Restart: `bun run restart` (or `bun run restart:daemon`)

### Testing & Code Quality Commands

- **Run all tests** (Rust crate tests + TypeScript test suite + layout audit):
  ```bash
  bun run test
  ```
- **Typecheck:**
  ```bash
  bun run typecheck
  ```
- **Lint (Oxlint):**
  ```bash
  bun run lint
  ```
- **Format (Oxfmt):**
  ```bash
  bun run format
  ```
- **Layout audit harness:**
  ```bash
  bun run audit
  ```

---

## 🔌 Ports

| Mode                        | URL                   |
| --------------------------- | --------------------- |
| Production (Docker or not)  | http://localhost:5555 |
| Development (Docker or not) | http://localhost:4444 |

These memorable repeated-digit ports were chosen so gvui can run alongside other local projects without colliding with common defaults like `3000`/`5173`/`8080`.

---

## 📊 Importing Execution Graphs from `@onurseckin/skills` (`orchestrating-long-tasks`)

`GVUI` integrates natively with the [`orchestrating-long-tasks`](https://github.com/onurseckin/skills) skill harness to visualize autonomous multi-agent execution trajectories, DAG dependencies, verification gates, and telemetry.

### 1. Export summary graph from the capsule

In the workspace where `orchestrating-long-tasks` was executed, export the summary suite:

```bash
bun orchestrating-long-tasks/scripts/harness.ts summary:export --run .capsules/<run-id>
```

This compiles `.capsules/<run-id>/summary/graph.json`, `metrics.json`, `timeline.json`, and `summary.md`.

### 2. Import into GVUI

From the `gvui` repository root, run the CLI import command:

```bash
bun run gvui:import --capsule /path/to/.capsules/<run-id>
# Or directly:
bun scripts/import-capsule.ts --capsule /path/to/.capsules/<run-id>
```

### What this does:

1. Resolves and parses `.capsules/<run-id>/summary/graph.json` (with automatic fallback to `state.json`).
2. Validates nodes, edges, and status fields against the `GraphDataset` schema.
3. Saves the dataset into `public/data/graphs/<slug>.json`.
4. Registers `<slug>` in `public/data/graphs/manifest.json` so the dataset appears automatically in the graph switcher dropdown.
5. Prints the direct preview link: `http://localhost:4444/?graph=<slug>`.

---

## 💾 Local SQLite Database & Layout Caching

`GVUI` uses an in-browser SQLite database powered by **`sql.js`** (`src/utils/sqliteDb.ts`) to store and cache graph layout calculations.

### How it works & Data Privacy:

- **Client-Side Only**: The SQLite database runs entirely inside the end-user's browser WebAssembly runtime and persists layout caches to browser `localStorage` under the key `gvui_sqlite_db_v1`.
- **No Database Files Pushed**: There are **no `.sqlite` or `.db` binary database files** stored on disk or tracked by Git.
- **Fresh State for Every User**: When another user clones or runs this repository, their browser initializes a brand-new, empty in-memory SQLite database.
- **Zero Server Overhead / Data Leakage**: Your local cache data stays strictly in your own browser and is never committed or pushed to GitHub.
