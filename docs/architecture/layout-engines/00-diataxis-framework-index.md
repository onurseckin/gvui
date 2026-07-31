# Diátaxis Documentation Framework for GVUI Layout Engines

This documentation suite follows the **Diátaxis Technical Documentation Authoring Framework** (https://diataxis.fr/). The documentation is structured into four distinct functional quadrants to serve different developer needs:

```
                      LEARNING                       WORKING
              ┌───────────────────────────┬───────────────────────────┐
              │                           │                           │
  PRACTICAL   │        TUTORIALS          │       HOW-TO GUIDES       │
              │  (Learning-oriented)      │   (Problem-oriented)      │
              │                           │                           │
              ├───────────────────────────┼───────────────────────────┤
              │                           │                           │
 Theoretical  │       EXPLANATIONS        │        REFERENCE          │
              │  (Understanding-oriented) │   (Information-oriented)  │
              │                           │                           │
              └───────────────────────────┴───────────────────────────┘
```

---

## 🗺️ Diátaxis Documentation Navigation Map

### 1. 🎓 Tutorials (Learning-Oriented)
- [**Tutorial: Rendering Your First Custom Graph in GVUI**](./tutorials/01-rendering-your-first-graph.md) — Step-by-step hands-on lesson for onboarding new developers.

### 2. 🛠️ How-To Guides (Problem-Oriented)
- [**How-To: Add a New Custom Layout Engine to GVUI**](./how-to/01-adding-a-new-layout-engine.md) — Step-by-step recipe to implement and register a 6th layout mode.
- [**How-To: Debug Edge Badge Overlaps and Spacing Demands**](./how-to/02-debugging-badge-overlaps.md) — Step-by-step recipe for inspecting spacing demand overrides.

### 3. 📖 Reference (Information-Oriented)
- [**Custom State-Space Engine Reference Map**](./01-custom-state-space/06-codebase-reference-map.md) — Symbol & function signature dictionary.
- [**Top-Down Dagre Reference Map**](./02-top-down-dagre/04-codebase-reference-map.md) — Dagre TB layout parameter dictionary.
- [**Left-to-Right Dagre Reference Map**](./03-left-right-dagre/03-codebase-reference-map.md) — Transposed matrix parameter dictionary.
- [**Organic Force Reference Map**](./04-force-directed/03-codebase-reference-map.md) — Force physics parameter dictionary.
- [**Concentric Radial Reference Map**](./05-concentric-radial/03-codebase-reference-map.md) — Polar coordinate parameter dictionary.

### 4. 🧠 Explanations (Understanding-Oriented)
- [**State-Space Search & Fitness Vectors**](./01-custom-state-space/01-state-space-search.md) — Deep dive into multi-objective search algorithms.
- [**Sugiyama Layering & Cycle Breaking**](./01-custom-state-space/02-sugiyama-layering-cycle-breaking.md) — Deep dive into Tarjan SCCs and DAG reduction.
- [**Barycentric Crossing Minimization**](./01-custom-state-space/03-barycentric-crossing-minimization.md) — Deep dive into ordering sweeps.
- [**Grid A* Orthogonal Routing**](./01-custom-state-space/04-astar-orthogonal-routing.md) — Deep dive into pathfinding & turn penalties.
- [**Dynamic Spacing Demand Feedback Loops**](./01-custom-state-space/05-dynamic-spacing-demands.md) — Deep dive into gap expansion.
- [**Network Simplex Layering**](./02-top-down-dagre/01-network-simplex-layering.md) — Deep dive into linear programming rank constraints.
- [**Brandes-Köpf Coordinate Alignment**](./02-top-down-dagre/03-brandes-kopf-coordinate-assignment.md) — Deep dive into 4-pass block compaction.
- [**Coulomb-Hooke Force Vector Physics**](./04-force-directed/01-coulomb-hooke-vector-math.md) — Deep dive into physics simulation.
- [**Polar Coordinate Transformations**](./05-concentric-radial/01-polar-coordinate-transformation.md) — Deep dive into radial geometry.

---

## 🏛️ Architectural Decision Records (ADRs)

Key architectural decisions and design rationale are recorded under `docs/decisions/`:
- [**ADR-001: Custom State-Space Layout Engine**](../../decisions/ADR-001-custom-state-space-layout-engine.md)
- [**ADR-002: Grid A* Orthogonal Routing with 90° Turn Penalties**](../../decisions/ADR-002-grid-astar-orthogonal-routing.md)
- [**ADR-003: Dynamic Node Gap Expansion for Badge Clearance**](../../decisions/ADR-003-dynamic-node-gap-expansion.md)
