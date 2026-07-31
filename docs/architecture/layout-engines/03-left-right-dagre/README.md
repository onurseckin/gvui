# Left-to-Right Dagre Rank-Based Engine

The **Left-to-Right (Dagre Rank-Based Engine)** layout mode configures the Sugiyama hierarchical layout framework in a horizontal Left-to-Right (`LR`) direction. This paradigm is ideal for sequential process pipelines, trace logs, and timelines where time or sequence naturally flows from left to right.

---

## 🎨 Architectural Infographic & Pipeline Map

```
                  ┌──────────────────────────────────────────────────┐
                  │             Input Raw Graph Dataset              │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │   Phase 1: Transposed Matrix Coordinate Mapping   │
                  │   - Dimension Swapping: Width <-> Height          │
                  │   - Rank Columns Map to X-Coordinates             │
                  │   - In-Layer Orders Map to Y-Coordinates          │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │   Phase 2: Horizontal Cubic Bezier S-Curve Routing│
                  │   - Control Points C_1, C_2 with ΔX / 2 Offset    │
                  │   - Smooth Transition Ports Right -> Left         │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │        Final Positioned Nodes & Edges            │
                  └──────────────────────────────────────────────────┘
```

---

## 📚 Sub-Module Documentation Files

1. [**01-coordinate-space-transformation.md**](./01-coordinate-space-transformation.md) — Rotated matrix transformation $\begin{pmatrix} X_{\text{final}} \\ Y_{\text{final}} \end{pmatrix} = \begin{pmatrix} Y_{\text{sugiyama}} \\ X_{\text{sugiyama}} \end{pmatrix}$, dimension swapping.
2. [**02-horizontal-bezier-routing.md**](./02-horizontal-bezier-routing.md) — Cubic Bezier control points $C_1, C_2$, horizontal delta $\Delta X$, label midpoint placement.
3. [**03-codebase-reference-map.md**](./03-codebase-reference-map.md) — Code map linking `computeDagreLayout(dataset, "LR")` in `nodeDimensions.ts`.
