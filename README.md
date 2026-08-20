# GVUI — Graph Visualization UI

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-WASM-DEA584?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0+-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.3+-FBF0DF?style=flat-square&logo=bun&logoColor=black)](https://bun.sh/)

**GVUI** is a high-performance, deterministic directed graph visualization UI and layout engine engineered for complex multi-agent system execution trajectories, microservice topologies, and dependency DAGs.

Built with **React 19**, **TypeScript**, and a custom **Rust / WebAssembly (WASM)** layout engine, GVUI achieves sub-millisecond layout computation with strict mathematical guarantees: **constraints flow forward, nothing is retried**.

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  GVUI WEB APPLICATION                                  │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│               React 19 Host UI           │              Developer Tooling              │
│  ┌─────────────────────────────────────┐ │  ┌───────────────────────────────────────┐  │
│  │ Interactive Graph Canvas            │ │  │ 216-Run Layout Audit Framework        │  │
│  │   - 19 semantic edge kinds + markers│ │  │ Playwright Visual Capture Engine      │  │
│  │   - 9 role archetypes on node cards │ │  │ Contract-Checked Capsule Importer     │  │
│  │   - Branch sections carry a reason  │ │  │ Multi-Format Exporter (SVG/PNG/SQL)   │  │
│  └─────────────────────────────────────┘ │  └───────────────────────────────────────┘  │
│  ┌─────────────────────────────────────┐ │  ┌───────────────────────────────────────┐  │
│  │ Node Detail Drawer - 10 tabs        │ │  │ Browser-Local Layout Cache            │  │
│  │   - Scripts, Tools, State Machine   │ │  │   - Deterministic dataset signature   │  │
│  │   - Evidence-classed telemetry      │ │  │   - LRU eviction on quota exhaustion  │  │
│  │   - Findings resolve to node.assets │ │  │   - localStorage JSON persistence     │  │
│  │   - Recorded cost only, never priced│ │  │                                       │  │
│  └─────────────────────────────────────┘ │  └───────────────────────────────────────┘  │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
                                           │
                        WebAssembly Boundary (JSON Bridge / Float Arrays)
                                           │
┌──────────────────────────────────────────▼─────────────────────────────────────────────┐
│                          RUST / WASM CUSTOM LAYOUT ENGINE                              │
│                                 (`crates/gvui/`)                                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  01. Ingest & Graph IR      ── intern IDs, build CSR adjacency, bundle parallel edges  │
│  02. Node Measurement       ── text-to-box metrics computed on host, isolated from WASM│
│  03. Structural Analysis    ── Tarjan SCC decomposition & Eades Greedy Cycle Removal   │
│  04. Rank Assignment        ── Gansner Network Simplex & Longest Path Layering         │
│  05. Layering & Virtuals    ── Dummy node chains for long edges & first-class badges   │
│  06. Label Placement        ── Geometric reservation ensuring badges never collide     │
│  07. Crossing Minimization  ── Two-Layer Barycenter/Median sweeps & BMJ exact counting │
│  08. Routing Demand         ── Interval-graph coloring for exact channel lane count    │
│  09. Coordinate Assignment  ── Brandes-Köpf 4-way alignment & median horizontal balance│
│  10. Edge Spline Routing    ── Scored port selection, orthogonal channels, chamfering  │
│  11. Emit & Quality Gate    ── SpatialHash constraint checks, metrics & serialization  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Capabilities & Feature Matrix

| Feature Subsystem              | Technical Implementation                                | Key Guarantees                                                                           |
| :----------------------------- | :------------------------------------------------------ | :--------------------------------------------------------------------------------------- |
| **Rust WASM Layout Engine**    | 11-Phase forward-flow pipeline (`crates/gvui/`)         | Median runtime $< 1.5\text{ ms}$; zero backtracking.                                     |
| **Dual Layout Modes**          | `layered` (Sugiyama hierarchy) & `radial` (orbital BFS) | Orthogonal `direction` support (`top-down`, `bottom-up`, `left-right`, `right-left`).    |
| **Quality Invariants**         | 8 Hard zero-tolerance gates enforced in CI              | 0 node overlaps, 0 edge penetrations, 0 badge collisions, 0 collinear overlaps.          |
| **Deterministic Hashes**       | Strict node ID sort keys & platform-agnostic floats     | Byte-identical coordinates across distinct worker processes and browser runs.            |
| **Browser-Local Layout Cache** | Dataset-signature keyed rows in `localStorage`          | Instant re-hydration of a layout already computed; LRU eviction on quota exhaustion.     |
| **Graph Vocabulary**           | 19 edge kinds, 9 role archetypes, branch sections       | `probe` and `pushback` never render alike; an unknown member warns instead of failing.   |
| **Node Detail Drawer**         | 10 evidence-classed inspection tabs                     | Scripts, tools and state machine from the record; an unreported value renders `unknown`. |
| **Capsule Import**             | Contract validation plus one-pass legacy normalisation  | Every problem reported at once; nothing the capsule did not record is filled in.         |
| **Multi-Format Export**        | SVG, PNG (2x/4x), Mermaid, SQL DDL, and standalone HTML | Fully portable, offline-viewable standalone bundles.                                     |
| **Visual Ingestion Pipeline**  | Playwright multi-viewport headless regression suite     | Automated screenshot capture matrix across 4 standard viewports.                         |

---

## 🚀 Quickstart & Setup

### 1. One-Command Toolchain Setup

Installs Bun, the Rust toolchain, the `wasm32-unknown-unknown` target, and `wasm-pack`:

```bash
bun run setup
```

### 2. Local Development (Host Mode)

Compiles the Rust WASM engine and starts the Vite development server:

```bash
bun run dev:host
# Open http://localhost:4444
```

### 3. Production Mode (Local or Docker)

```bash
# Option A: Local preview server (Fastest)
bun start
# Open http://localhost:5555

# Option B: Optimized Docker container
bun run prod
# Open http://localhost:5555
```

---

## 💻 Developer Commands & Tooling

```bash
# Quality Gates & Verification
bun run test            # Run full test triad: Cargo tests + Bun unit tests + 216-run layout audit
bun run audit           # Run exhaustive 216-run layout engine regression audit
bun run typecheck       # Compile WASM and verify strict TypeScript types
bun run lint            # Run Oxlint with 100+ rules
bun run format:check    # Check code formatting with Oxfmt
bun run format          # Format entire repository

# Ingestion & Visual Pipelines
bun run gvui:import --capsule <path>  # Ingest long-running task capsule trajectory
bun run test:visual                  # Run Playwright visual capture and regression tests

# Docker Lifecycle
bun run dev             # Start dev server in Docker with hot reloading
bun run logs            # Tail Docker container logs
bun run stop            # Stop running Docker containers
```

---

## 🔌 Default Port Mapping

| Environment      | Purpose                     | URL                     |
| :--------------- | :-------------------------- | :---------------------- |
| **Dev Host**     | Local Vite Dev Server       | `http://localhost:4444` |
| **Docker Dev**   | Hot-reloading Container     | `http://localhost:4444` |
| **Prod Preview** | Standalone Production Build | `http://localhost:5555` |
| **Docker Prod**  | Production Nginx Container  | `http://localhost:5555` |

---

## 📚 Complete Documentation Index

For in-depth architectural guides, mathematical specifications, and phase walkthroughs, see [`docs/README.md`](./docs/README.md):

- **[Concepts](./docs/concepts/README.md)**: [Sugiyama Framework](./docs/concepts/sugiyama-framework.md) · [Node Measurement](./docs/concepts/node-measurement.md) · [Determinism](./docs/concepts/determinism.md) · [Quality Model](./docs/concepts/quality-model.md) · [Computational Complexity](./docs/concepts/computational-complexity.md)
- **[Engine Pipeline](./docs/engine/README.md)**: [01 Foundations](./docs/engine/01-foundations.md) · [02 The Pipeline](./docs/engine/02-the-pipeline.md) · [03 Ingest & Measurement](./docs/engine/03-ingest-and-measurement.md) · [04 Structure](./docs/engine/04-structure.md) · [05 Rank Assignment](./docs/engine/05-rank-assignment.md) · [06 Layering & Labels](./docs/engine/06-layering-and-labels.md) · [07 Crossing Minimization](./docs/engine/07-crossing-minimization.md) · [08 Routing Demand](./docs/engine/08-routing-demand.md) · [09 Coordinate Assignment](./docs/engine/09-coordinate-assignment.md) · [10 Edge Routing](./docs/engine/10-edge-routing.md) · [11 Emit & Quality](./docs/engine/11-emit-and-quality.md)
- **[Layout Modes](./docs/modes/README.md)**: [Layered Mode](./docs/modes/01-layered.md) · [Radial Mode](./docs/modes/02-radial.md)
- **[Core Features](./docs/features/README.md)**: [Graph Vocabulary](./docs/features/graph-vocabulary.md) · [Node Detail Drawer](./docs/features/detail-drawer.md) · [Graph Export](./docs/features/graph-export.md) · [Layout Caching](./docs/features/layout-caching.md)
- **[Developer Tooling](./docs/tooling/README.md)**: [Layout Audit](./docs/tooling/layout-audit.md) · [Screenshot Pipeline](./docs/tooling/screenshot-pipeline.md) · [Capsule Import](./docs/tooling/capsule-import.md)
