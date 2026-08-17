# GVUI Documentation Master Index

This is the comprehensive technical documentation for **GVUI** — graph visualization architecture, mathematical layout engine specifications, UI diagnostic drawers, caching pipelines, and automated audit harnesses.

---

## 🧭 Architectural Overview & Philosophy

GVUI is organized around a single architectural axiom:

> **Constraints flow forward. Nothing is retried.**

Every phase in the pipeline produces a result that is mathematically correct by construction with respect to constraints downstream phases cannot repair:

1. **Edge Labels as First-Class Items**: Labels carry measured bounding boxes and occupy integer ranks/slots in the layered graph alongside nodes. Badge space is allocated by the node-separation machinery, making badge overlap impossible.
2. **Precomputed Routing Demand**: Routing channel and corridor lane demand is computed from the fixed item ordering using interval-graph coloring _before_ any geometry is evaluated, feeding exact spacing lower bounds into coordinate assignment.
3. **Discrete Decision-Making**: Ranks, ordering, port sides, port indices, and channel lanes are resolved as discrete integers. Continuous geometry is evaluated once in closed form.

```text
                        ┌──────────────┐
              rank 0     │    Ingest    │
                        └──────┬───────┘
                               │
              ─────────────────┼──────────────────  routing channel (lane demand)
                          ┌────┴────┐
                          │         │
                    ┌─────▼────┐  ┌─▼────────┐
              rank 1 │ Validate │  │  Reject  │
                    └─────┬────┘  └──────────┘
                          │
                       ┌──┴───────────┐
              rank 2   │ [ retry x3 ] │   ← Edge label is an ITEM with reserved area
                       └──┬───────────┘
                          │
                    ┌─────▼────┐
              rank 3 │  Persist │
                    └──────────┘
```

---

## 🗺️ Master Navigation Matrix

| Documentation Section                   | Scope & Core Topics                                                                                                                         |
| :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| **[`engine/`](./engine/README.md)**     | **11-Phase Layout Engine**: Rust WASM implementation, mathematical foundations, rank assignment, Brandes-Köpf coordinates, channel routing. |
| **[`modes/`](./modes/README.md)**       | **Layout Modes**: Hierarchical `layered` mode, concentric orbital `radial` mode, and orthogonal `direction` transformations.                |
| **[`concepts/`](./concepts/README.md)** | **Foundational Concepts**: Sugiyama decomposition, headless node measurement, determinism invariants, complexity, and quality models.       |
| **[`features/`](./features/README.md)** | **Application Subsystems**: In-browser SQLite layout caching (`sql.js`), 10-tab Node Detail Drawer, and multi-format export (SVG/PNG/SQL).  |
| **[`tooling/`](./tooling/README.md)**   | **Developer Tooling & Audits**: 280-run layout audit gate, Playwright visual capture pipeline, and CLI capsule import tools.                |

---

## 📑 Complete Document Catalog

### 1. Engine Pipeline Chapters (`docs/engine/`)

- [01 Foundations](./engine/01-foundations.md) — Graphs from zero: vertices, directed edges, DAGs, cycles, and rank bands.
- [02 The Pipeline](./engine/02-the-pipeline.md) — The 11-phase forward pipeline and the formal proof against iterative loops.
- [03 Ingest & Measurement](./engine/03-ingest-and-measurement.md) — Wire format normalization, CSR adjacency, degree-driven widening, and font metrics.
- [04 Structural Analysis](./engine/04-structure.md) — Tarjan SCC decomposition, Eades-Lin-Smyth Greedy FAS cycle breaking, Kahn DAG verification.
- [05 Rank Assignment](./engine/05-rank-assignment.md) — Gansner Network Simplex ranking, longest path layering, and labelled-span balancing.
- [06 Layering & Labels](./engine/06-layering-and-labels.md) — Virtual node chains and edge labels as first-class layered items.
- [07 Crossing Minimization](./engine/07-crossing-minimization.md) — Two-layer Barycenter/Median sweeps, adjacent transpositions, and BMJ crossing counting.
- [08 Routing Demand](./engine/08-routing-demand.md) — Interval-graph coloring for channels and corridors before geometry evaluation.
- [09 Coordinate Assignment](./engine/09-coordinate-assignment.md) — Rank band heights, Brandes-Köpf 4-way alignment, and median horizontal balancing.
- [10 Edge Routing](./engine/10-edge-routing.md) — Scored port selection, straight-shot alignment, corridor routing, Bézier splines, and chamfering.
- [11 Emit & Quality](./engine/11-emit-and-quality.md) — Wire serialization, SpatialHash constraint verification, and deterministic layout hashes.

### 2. Layout Modes (`docs/modes/`)

- [01 Layered Mode](./modes/01-layered.md) — Hierarchical DAG layout, 4 flow directions (`top-down`, `bottom-up`, `left-right`, `right-left`), and inverted transforms.
- [02 Radial Mode](./modes/02-radial.md) — Concentric polar BFS layout, angular wedge allocation, radial obstacle avoidance, and badge clearance.
- [Modes Overview](./modes/README.md) — Mode selection heuristics, trade-off matrix, and performance comparisons.

### 3. Shared Concepts (`docs/concepts/`)

- [Sugiyama Framework](./concepts/sugiyama-framework.md) — Classical 4-phase method extended to 11 production phases.
- [Node Measurement](./concepts/node-measurement.md) — Text-to-box boundary, OffscreenCanvas metrics, and headless test estimation.
- [Determinism](./concepts/determinism.md) — Byte-identical output guarantees, stable sort keys, and hash seed isolation.
- [Quality Model](./concepts/quality-model.md) — Hard zero-tolerance constraints vs observed metrics; elimination of heuristic search loops.
- [Computational Complexity](./concepts/computational-complexity.md) — Per-phase asymptotic bounds and native release benchmarks.

### 4. Core Features (`docs/features/`)

- [In-Browser SQLite Caching](./features/sqlite-caching.md) — Multi-tier layout cache via WebAssembly SQLite (`sql.js`), schema, and LRU eviction.
- [Node Detail Drawer](./features/detail-drawer.md) — Comprehensive reference for all 10 diagnostic tabs (Overview, Cost, Lineage, Errors, Diffs).
- [Graph Export Pipeline](./features/graph-export.md) — Standalone SVG, PNG, Mermaid, multi-dialect SQL (SQLite/Postgres/MySQL), and offline HTML bundles.

### 5. Developer Tooling (`docs/tooling/`)

- [Layout Audit Framework](./tooling/layout-audit.md) — 280-run matrix regression test asserting 8 zero-tolerance geometric invariants.
- [Screenshot Ingestion Pipeline](./tooling/screenshot-pipeline.md) — Playwright visual capture across 4 standard viewports.
- [CLI Capsule Import](./tooling/capsule-import.md) — Direct ingestion of long-running task capsules (`summary/graph.json` or `state.json`).

---

## ⚡ Performance Benchmarks

Measured on standard commodity hardware in native `--release` and WebAssembly across real-world topologies:

| Dataset / Topology            | Nodes | Edges | Legacy Engine | GVUI Rust/WASM | Invariant Violations |
| :---------------------------- | ----: | ----: | ------------: | -------------: | :------------------: |
| `kubernetes_cluster_topology` |    12 |    13 |     26,710 ms |    **0.14 ms** |        **0**         |
| `parallel_bundle_transports`  |     5 |    14 |      4,820 ms |    **0.11 ms** |        **0**         |
| `peer_mesh_service_registry`  |     8 |    22 |      8,950 ms |    **0.51 ms** |        **0**         |
| `dense_kubernetes_mesh`       |    30 |    45 |     47,336 ms |    **1.79 ms** |        **0**         |
| `long_span_bypass_network`    |    10 |    16 |     12,400 ms |    **0.65 ms** |        **0**         |

---

## 🛠️ Recommended Reading Pathways

1. **New to the Engine?**
   - Start with [Concepts: Sugiyama Framework](./concepts/sugiyama-framework.md) → [Engine: 01 Foundations](./engine/01-foundations.md) → [Engine: 02 The Pipeline](./engine/02-the-pipeline.md).
2. **Modifying Edge Routing or Coordinate Alignment?**
   - Read [Engine: 08 Routing Demand](./engine/08-routing-demand.md) → [Engine: 09 Coordinate Assignment](./engine/09-coordinate-assignment.md) → [Engine: 10 Edge Routing](./engine/10-edge-routing.md).
3. **Working on UI Telemetry or Exporters?**
   - Read [Features: Node Detail Drawer](./features/detail-drawer.md) → [Features: Graph Export](./features/graph-export.md) → [Features: SQLite Caching](./features/sqlite-caching.md).
4. **Verifying Correctness and Invariants?**
   - Read [Concepts: Quality Model](./concepts/quality-model.md) → [Tooling: Layout Audit](./tooling/layout-audit.md).
