# GVUI Graph Layout Algorithms & Architecture Documentation

Welcome to the master documentation index for the **GVUI Graph Layout Visualization Engine**.

This repository implements 5 distinct layout engine paradigms designed for visualizing directed acyclic/cyclic graphs, microservice architectures, execution trace logs, and network topologies.

---

## 🎨 Layout Engine Matrix & Algorithmic Index

```
                                    ┌──────────────────────────────────┐
                                    │     GVUI Graph Layout Engine     │
                                    └────────────────┬─────────────────┘
                                                     │
         ┌──────────────────┬────────────────────────┼────────────────────────┬──────────────────┐
         │                  │                        │                        │                  │
         ▼                  ▼                        ▼                        ▼                  ▼
┌─────────────────┐┌─────────────────┐    ┌────────────────────┐   ┌────────────────────┐┌────────────────────┐
│   custom-state- ││ top-down-dagre  │    │  left-right-dagre  │   │   force-directed   ││ concentric-radial  │
│   space/        ││ /               │    │  /                 │   │   /                ││ /                  │
└────────┬────────┘└────────┬────────┘    └─────────┬──────────┘   └─────────┬──────────┘└─────────┬──────────┘
         │                  │                       │                        │                     │
     6 Topics            4 Topics                3 Topics                 3 Topics              3 Topics
```

---

## 📚 Direct Documentation Navigation Sitemap

### 1. ⚙️ Custom State-Space Engine (`custom-state-space/`)
*Multi-Objective State-Space Search, Sugiyama Layering, Grid A* Orthogonal Routing & Dynamic Spacing Demands*

- [**01. State-Space Search & Fitness Vectors**](./custom-state-space/01-state-space-search.md) — State tuple $\sigma$, lexicographic cost vector $\mathbf{C}(\sigma)$, perturbation neighborhood operators.
- [**02. Sugiyama Layering & Cycle Breaking**](./custom-state-space/02-sugiyama-layering-cycle-breaking.md) — Tarjan SCC cycle breaking, stack DFS back-edge reversal, longest-path ranking, dummy nodes.
- [**03. Barycentric Crossing Minimization**](./custom-state-space/03-barycentric-crossing-minimization.md) — Alternating top-down/bottom-up sweeps, median/mean neighbor sorting, crossing counts.
- [**04. Grid A* Orthogonal Edge Routing**](./custom-state-space/04-astar-orthogonal-routing.md) — 2D spatial grid pathfinding, 90° turn penalty ($P_{\text{bend}} = 40$), perpendicular SVG arc bridges ($r = 6\text{px}$).
- [**05. Dynamic Spacing Demands**](./custom-state-space/05-dynamic-spacing-demands.md) — Required badge gap calculation ($G_{\text{req}}$), spacing demand emission $\mathcal{D}$, coordinate gap expansion.
- [**06. Codebase Reference Map**](./custom-state-space/06-codebase-reference-map.md) — File-by-file directory map, TypeScript symbol dictionary, unit test commands.

---

### 2. 🌲 Top-Down Dagre Engine (`top-down-dagre/`)
*Sugiyama Hierarchical Framework with Top-to-Bottom (`TB`) Rank Direction*

- [**01. Network Simplex Layering**](./top-down-dagre/01-network-simplex-layering.md) — Linear programming rank constraints $r(v) - r(u) \ge 1$, dual spanning tree tight edges, cut values.
- [**02. Order Heuristics**](./top-down-dagre/02-order-heuristics.md) — Adjacent rank barycentric sorting, crossing minimization.
- [**03. Brandes-Köpf Coordinate Assignment**](./top-down-dagre/03-brandes-kopf-coordinate-assignment.md) — 4-pass alignments (UL, UR, LL, LR), block compaction, median X-coordinate calculation.
- [**04. Codebase Reference Map**](./top-down-dagre/04-codebase-reference-map.md) — `computeDagreLayout` integration map and line anchors in `nodeDimensions.ts`.

---

### 3. ➡️ Left-to-Right Dagre Engine (`left-right-dagre/`)
*Transposed Sugiyama Framework for Sequential Pipelines (`LR` Direction)*

- [**01. Coordinate Space Transformation**](./left-right-dagre/01-coordinate-space-transformation.md) — Rotated matrix transformation $\begin{pmatrix} X_{\text{final}} \\ Y_{\text{final}} \end{pmatrix} = \begin{pmatrix} Y_{\text{sugiyama}} \\ X_{\text{sugiyama}} \end{pmatrix}$, dimension swapping ($\text{EffWidth} = \text{Height}$).
- [**02. Horizontal Bezier Routing**](./left-right-dagre/02-horizontal-bezier-routing.md) — Cubic Bezier control points $C_1, C_2$, horizontal delta $\Delta X$, label midpoint placement at $t=0.5$.
- [**03. Codebase Reference Map**](./left-right-dagre/03-codebase-reference-map.md) — `computeDagreLayout(dataset, "LR")` reference map in `layoutDispatcher.ts`.

---

### 4. ⚛️ Organic Force Engine (`force-directed/`)
*Fruchterman-Reingold Spring Embedder Physics Simulation*

- [**01. Coulomb-Hooke Vector Math**](./force-directed/01-coulomb-hooke-vector-math.md) — Electrostatic repulsion $\vec{F}_r$, Hooke spring attraction $\vec{F}_a$, center gravity $\vec{F}_g$, net force summation.
- [**02. Simulated Annealing Cooling**](./force-directed/02-simulated-annealing-cooling.md) — Exponential temperature decay $T(t) = T_{\text{initial}} \cdot \gamma^t$, velocity bounding $\min(\|\vec{F}_{\text{net}}\|, T(t))$, numerical safeguards $\epsilon$.
- [**03. Codebase Reference Map**](./force-directed/03-codebase-reference-map.md) — `computeForceLayout` simulation loop reference map in `layoutDispatcher.ts`.

---

### 5. 🎯 Concentric Radial Engine (`concentric-radial/`)
*Polar Coordinate Orbit Projection & Hub-Spoke Bezier Routing*

- [**01. Polar Coordinate Transformation**](./concentric-radial/01-polar-coordinate-transformation.md) — Polar transformation $\langle R, \theta_i \rangle \to \langle X_i, Y_i \rangle$, angular displacement $\theta_i = \frac{2\pi \cdot i}{N} - \frac{\pi}{2}$, radius $R = \max(280, N \cdot 45)$.
- [**02. Hub-Spoke Bezier Routing**](./concentric-radial/02-hub-spoke-bezier-routing.md) — Quadratic Bezier curves $\mathbf{B}(t)$ through central hub control point $\mathbf{P}_0 = (X_0, Y_0)$, label midpoint placement.
- [**03. Codebase Reference Map**](./concentric-radial/03-codebase-reference-map.md) — `computeRadialLayout` reference map in `layoutDispatcher.ts`.
