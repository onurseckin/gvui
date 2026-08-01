# GVUI Layout Engine Documentation

This documentation teaches you how GVUI transforms a set of nodes and edges into a readable, visually clean graph layout. It covers five layout engines, from simple grid placement to a sophisticated state-space optimization system.

**No prior knowledge of graph algorithms is assumed.** Each section builds from fundamental concepts to the complete picture.

---

## How to Read These Docs

If you're new to graph layout, start with the **Custom Engine** tutorials — they teach graph theory from scratch and progressively build to the full optimization pipeline. If you're looking for something specific, use the section index below.

---

## The Five Layout Engines at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                        GVUI Layout System                       │
├──────────────────┬──────────────────┬───────────────────────────┤
│   Custom Engine  │  Dagre Layouts   │     Simple Layouts        │
│   (State-Space   │  (Library-Based) │     (Fast Exploration)    │
│    Optimization) │                  │                           │
│                  │  • Top-Down      │  • Grid Layout            │
│  • Top-Down      │  • Left-to-Right │  • Circular Layout        │
│    (default)     │                  │                           │
├──────────────────┼──────────────────┼───────────────────────────┤
│  Quality: ★★★★★  │  Quality: ★★★    │  Quality: ★               │
│  Speed:   ★★     │  Speed:   ★★★★   │  Speed:   ★★★★★           │
└──────────────────┴──────────────────┴───────────────────────────┘
```

---

## Documentation Index

### [Custom Engine](./custom-engine/README.md) — The Deep Dive

The crown jewel: an 82-file custom layout engine that wraps a Sugiyama pipeline in a state-space optimization search. This section teaches every algorithm from scratch.

| Chapter                                            | Topic                    | What You'll Learn                                      |
| -------------------------------------------------- | ------------------------ | ------------------------------------------------------ |
| [01](./custom-engine/01-foundations.md)            | Graph Theory Foundations | Nodes, edges, directed graphs, cycles — from zero      |
| [02](./custom-engine/02-the-sugiyama-framework.md) | The Sugiyama Framework   | The 4-phase approach to layered graph drawing          |
| [03](./custom-engine/03-cycle-detection.md)        | Cycle Detection          | DFS, back edges, Tarjan's SCC algorithm                |
| [04](./custom-engine/04-cycle-breaking.md)         | Cycle Breaking           | Eades greedy heuristic, feedback edge marking          |
| [05](./custom-engine/05-rank-assignment.md)        | Rank Assignment          | Topological sort, longest-path layering, dummy nodes   |
| [06](./custom-engine/06-crossing-minimization.md)  | Crossing Minimization    | Barycenters, bidirectional sweeps, transposition       |
| [07](./custom-engine/07-coordinate-assignment.md)  | Coordinate Assignment    | PAVA isotonic regression for optimal positioning       |
| [08](./custom-engine/08-edge-routing.md)           | Edge Routing             | A* pathfinding on a 3D state grid                      |
| [09](./custom-engine/09-badge-placement.md)        | Badge Placement          | Label collision resolution, spacing demands            |
| [10](./custom-engine/10-optimization-loop.md)      | Optimization Loop        | State-space search, neighborhood generation, scoring   |
| [11](./custom-engine/11-aesthetic-refinement.md)   | Aesthetic Refinement     | Hairpin elimination, bend reduction — the polish phase |

### [Dagre Integration](./dagre-integration/README.md) — Library-Based Layouts

How GVUI uses the Dagre library for fast hierarchical layouts, and what we build on top.

| Chapter                                               | Topic                 | What You'll Learn                                             |
| ----------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| [01](./dagre-integration/01-dagre-internals.md)       | Dagre Internals       | What happens inside `dagre.layout()` (for context)            |
| [02](./dagre-integration/02-our-integration-layer.md) | Our Integration Layer | Node dimensions, LR transform, edge clipping, badge repulsion |

### [Simple Layouts](./simple-layouts/README.md) — Fast Exploration Modes

Topology-unaware layouts for quick visualization.

| Chapter                                      | Topic           | What You'll Learn                                          |
| -------------------------------------------- | --------------- | ---------------------------------------------------------- |
| [01](./simple-layouts/01-grid-layout.md)     | Grid Layout     | Static grid placement (what "Organic Force" actually does) |
| [02](./simple-layouts/02-circular-layout.md) | Circular Layout | Polar placement, trigonometry from scratch, Bézier routing |

### [Shared Concepts](./concepts/) — Cross-Cutting Knowledge

Fundamental concepts referenced across multiple sections, documented once.

| Document                                                             | Topic                                               |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| [Sugiyama Framework](./concepts/sugiyama-framework.md)               | The meta-framework for layered graph drawing        |
| [Node Dimension Estimation](./concepts/node-dimension-estimation.md) | How pixel sizes are calculated from content         |
| [Lexicographic Scoring](./concepts/lexicographic-scoring.md)         | Multi-objective optimization with priority ordering |
| [Computational Complexity](./concepts/computational-complexity.md)   | Time/space analysis for all engines                 |
