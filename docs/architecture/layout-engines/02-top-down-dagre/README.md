# Top-Down Dagre Ranked Engine

The **Top-Down (Dagre Ranked Engine)** layout mode utilizes the classic **Sugiyama hierarchical framework** implemented via DagreJS with a Top-to-Bottom (`TB`) rank direction. It organizes nodes into rigid horizontal rank layers, producing a clean, structured hierarchy for decision trees and directed workflows.

---

## 🎨 Architectural Infographic & Pipeline Map

```
                  ┌──────────────────────────────────────────────────┐
                  │             Input Raw Graph Dataset              │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │    Phase 1: Network Simplex Layer Assignment     │
                  │   - Stack DFS Cycle Removal                      │
                  │   - Linear Program Rank Constraints r(v)-r(u)>=1 │
                  │   - Dummy Node Insertion for Long Edges          │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │      Phase 2: Barycentric Order Heuristics       │
                  │   - Adjacent Rank Sweeps & Median Heuristic      │
                  │   - Crossing Minimization                        │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │   Phase 3: Brandes-Köpf Coordinate Alignment     │
                  │   - 4 Alignment Passes (UL, UR, LL, LR)          │
                  │   - Block Graph Compaction                       │
                  │   - Median X-Coordinate Calculation              │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │        Final Positioned Nodes & Edges            │
                  └──────────────────────────────────────────────────┘
```

---

## 📚 Sub-Module Documentation Files

1. [**01-network-simplex-layering.md**](./01-network-simplex-layering.md) — Network Simplex linear programming equations, dual spanning tree tight edges, rank constraints.
2. [**02-order-heuristics.md**](./02-order-heuristics.md) — Cross-layer order sweeps, barycentric sorting, dummy node placement.
3. [**03-brandes-kopf-coordinate-assignment.md**](./03-brandes-kopf-coordinate-assignment.md) — 4-pass alignments (UL, UR, LL, LR), block graph compaction, median coordinate calculation.
4. [**04-codebase-reference-map.md**](./04-codebase-reference-map.md) — Code map linking `computeDagreLayout` in `nodeDimensions.ts` and `layoutDispatcher.ts`.
