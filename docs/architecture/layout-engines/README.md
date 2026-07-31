# Graph Layout Engines Architecture & Documentation Suite

Welcome to the comprehensive, deeply educational developer documentation for the **GVUI Graph Visualization Engine**.

This documentation suite provides step-by-step mathematical derivations, ASCII infographics, system flow diagrams, performance characteristics, and direct codebase reference maps for all 5 layout algorithm paradigms implemented in GVUI.

---

## 🗺️ Layout Engines Sitemap & Architecture Matrix

```
                               ┌──────────────────────────────────────────────┐
                               │       GVUI Graph Visualization Engine        │
                               └──────────────────────┬───────────────────────┘
                                                      │
         ┌──────────────────┬───────────────────┼───────────────────┬──────────────────┐
         │                  │                   │                   │                  │
         ▼                  ▼                   ▼                   ▼                  ▼
┌─────────────────┐┌─────────────────┐┌──────────────────┐┌──────────────────┐┌──────────────────┐
│ 01. State-Space ││ 02. Top-Down    ││ 03. Left-to-Right││ 04. Force        ││ 05. Radial       │
│ Engine (Custom) ││ Dagre Engine    ││ Dagre Engine     ││ Directed Engine  ││ Concentric Engine│
└────────┬────────┘└────────┬────────┘└────────┬─────────┘└────────┬─────────┘└────────┬─────────┘
         │                  │                   │                   │                  │
   7 Doc Modules      5 Doc Modules       4 Doc Modules       4 Doc Modules      4 Doc Modules
```

---

## 📊 Comparative Engine Matrix

| Paradigm | Primary Algorithmic Family | Routing Strategy | Cycle Handling | Best For | Directory |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Top-Down (State-Space)** | Multi-Pass State-Space Search & Sugiyama | Grid A* Orthogonal Routing with Bridges | Tarjan SCC Cycle Breaking & Reversal | Complex directed microservices, DAG execution traces, cyclic graphs | [`01-custom-state-space/`](./01-custom-state-space/README.md) |
| **Top-Down (Dagre)** | Sugiyama Framework (Top-to-Bottom) | Simplex Channel Routing | Stack DFS Back-Edge Reversal | Decision trees, hierarchical workflows | [`02-top-down-dagre/`](./02-top-down-dagre/README.md) |
| **Left-to-Right (Dagre)** | Transposed Sugiyama (Left-to-Right) | Cubic Bezier S-Curves | Stack DFS Back-Edge Reversal | Sequential timelines, pipeline execution logs | [`03-left-right-dagre/`](./03-left-right-dagre/README.md) |
| **Organic Force** | Fruchterman-Reingold Physics Simulation | Direct Straight Segments | N/A (Unstructured Force Balance) | Cluster discovery, social network graphs | [`04-force-directed/`](./04-force-directed/README.md) |
| **Radial Balance** | Polar Coordinate Radius Projection | Quadratic Hub-Spoke Bezier Arcs | N/A (Concentric Circular Orbit) | Central hub-and-spoke maps, single-source trees | [`05-concentric-radial/`](./05-concentric-radial/README.md) |

---

## 📚 Engine Sub-directories

1. [**01. Custom State-Space Engine**](./01-custom-state-space/README.md) — 7 comprehensive guides detailing state-space vectors, 32-stage Web Worker pipelines, barycentric sweeps, grid A* orthogonal routing, dynamic spacing demands ($G_{\text{req}}$), and codebase code maps.
2. [**02. Top-Down Dagre Engine**](./02-top-down-dagre/README.md) — 5 guides detailing Network Simplex linear programming, order heuristics, Brandes-Köpf 4-pass coordinate alignment, and codebase code maps.
3. [**03. Left-to-Right Dagre Engine**](./03-left-right-dagre/README.md) — 4 guides detailing rotated matrix transformations, cubic Bezier S-curve math, and codebase code maps.
4. [**04. Organic Force Engine**](./04-force-directed/README.md) — 4 guides detailing Coulomb electrostatic repulsion, Hooke spring attraction, simulated annealing cooling schedules, and codebase code maps.
5. [**05. Concentric Radial Engine**](./05-concentric-radial/README.md) — 4 guides detailing polar coordinate projection, quadratic Bezier hub-spoke routing, and codebase code maps.
