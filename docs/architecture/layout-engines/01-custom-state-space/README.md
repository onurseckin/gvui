# Custom State-Space Layout Engine (Top-Down)

The **Custom State-Space Engine** is GVUI's primary top-down graph layout solver. Designed to handle dense microservice meshes, execution traces, and cyclic graphs, it combines state-space search optimization, Sugiyama layering, barycentric crossing minimization, grid A* orthogonal edge routing, and dynamic badge clearance demands.

---

## 🎨 Architectural Infographic & Pipeline Map

```
                  ┌──────────────────────────────────────────────────┐
                  │             Input Raw Graph Dataset              │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │   Phase 1: Pre-Search Topology Normalization     │
                  │   - Tarjan SCC Cycle Breaking                    │
                  │   - Longest-Path Rank Assignment                 │
                  │   - Dummy Node Insertion for Long Edges          │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │    Phase 2: Barycentric Crossing Minimization    │
                  │   - Top-Down & Bottom-Up Order Sweeps            │
                  │   - Median & Mean Neighbor Position Sorting      │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │     Phase 3: Grid A* Orthogonal Edge Routing     │
                  │   - Corridor Grid Cost Minimization f(p)=g+h     │
                  │   - 90° Turn Penalties & Perpendicular Bridges   │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │    Phase 4: Dynamic Badge Spacing Demands        │
                  │   - Required Same-Rank Gap G_req Computation     │
                  │   - Spacing Demand Emission & Node Gap Expansion │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │        Final Positioned Nodes & Edges            │
                  └──────────────────────────────────────────────────┘
```

---

## 📚 Sub-Module Documentation Files

1. [**01-state-space-search.md**](./01-state-space-search.md) — Mathematical state representation $\sigma$, candidate evaluation, lexicographic cost vectors, neighborhood search transitions.
2. [**02-sugiyama-layering-cycle-breaking.md**](./02-sugiyama-layering-cycle-breaking.md) — Tarjan SCC cycle breaking, stack-based DFS back-edge reversal, longest path ranking, virtual dummy nodes.
3. [**03-barycentric-crossing-minimization.md**](./03-barycentric-crossing-minimization.md) — Barycentric top-down & bottom-up sweeps, crossing matrices, median ordering heuristics.
4. [**04-astar-orthogonal-routing.md**](./04-astar-orthogonal-routing.md) — Grid A* pathfinder, turn penalties $P_{\text{bend}}$, obstacle envelopes, perpendicular crossing bridges.
5. [**05-dynamic-spacing-demands.md**](./05-dynamic-spacing-demands.md) — Minimum required badge gap $G_{\text{req}}$, exact spacing demand emission, coordinate shift adjustments, node gap expansion.
6. [**06-codebase-reference-map.md**](./06-codebase-reference-map.md) — Developer code map linking source files, interfaces, algorithms, and unit test suites.
