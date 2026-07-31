# Graph Visualization Engine: Algorithmic Architecture & Layout Paradigms

Welcome to the comprehensive technical documentation for the graph layout engines in **GVUI**. This documentation suite details the mathematical foundations, algorithmic pipelines, geometry computations, and optimization strategies powering each of our 5 layout modes.

---

## Layout Paradigms Summary

| Mode | Algorithmic Paradigm | Mathematical Model | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **Top-Down** | **State-Space Optimization Engine** | Multi-Pass State-Space Search, A* Orthogonal Routing, Barycentric Sweeps, Spacing Demands | Complex directed microservice meshes, DAG execution traces, cyclic dependency graphs |
| **Top-Down (Dagre)** | **Dagre Ranked Engine (TB)** | Sugiyama Layered Framework, Network-Simplex Rank Assignment, Brandes-Köpf Coordinate Alignment | Hierarchical decision trees, workflow pipelines (Top-to-Bottom orientation) |
| **Left-to-Right** | **Dagre Rank-Based Engine (LR)** | Sugiyama Layered Framework (Horizontal Orientation), Cross-Rank Channel Routing | Sequential pipeline traces, temporal flow charts (Left-to-Right orientation) |
| **Organic Force** | **Physics Force-Directed Engine** | Fruchterman-Reingold Spring Embedder, Coulomb Electrostatic Repulsion & Hooke's Law Attraction | Unstructured network graphs, cluster topology exploration, social graphs |
| **Radial Balance** | **Concentric Circular Engine** | Polar Coordinate Radius Distribution, Geometric Angle Mapping | Radial hierarchy maps, central hub & spoke architectures |

---

## Detailed Documentation Files

- [01. Custom State-Space Engine](file:///Users/onurseckinsenoglu/repos/gvui/docs/layout-engines/01_custom_state_space_engine.md) — Exhaustive analysis of the 32-stage time-sliced state-space search, cycle breaking, barycentric crossing minimization, A* orthogonal routing, and dynamic spacing demand resolution.
- [02. Top-Down (Dagre Ranked Engine)](file:///Users/onurseckinsenoglu/repos/gvui/docs/layout-engines/02_top_down_dagre_engine.md) — Detailed breakdown of Sugiyama's 4-layer framework, Network Simplex layering, order heuristic sweeps, and Brandes-Köpf coordinate alignment in Top-to-Bottom orientation.
- [03. Left-to-Right (Dagre Rank-Based Engine)](file:///Users/onurseckinsenoglu/repos/gvui/docs/layout-engines/03_left_right_dagre_engine.md) — Mathematical transformation of Sugiyama layering into horizontal Left-to-Right coordinate spaces.
- [04. Organic Force (Physics Force-Directed Engine)](file:///Users/onurseckinsenoglu/repos/gvui/docs/layout-engines/04_force_directed_engine.md) — Physics simulation equations for Coulomb repulsion forces, Hooke's attraction springs, and simulated annealing cooling schedules.
- [05. Concentric Radial Engine](file:///Users/onurseckinsenoglu/repos/gvui/docs/layout-engines/05_concentric_radial_engine.md) — Polar coordinate transformation $\langle r, \theta \rangle \to \langle x, y \rangle$ and quadratic bezier control point generation.
