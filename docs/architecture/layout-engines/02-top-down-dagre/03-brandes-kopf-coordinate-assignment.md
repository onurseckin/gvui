# 03. Brandes-Köpf Coordinate Alignment

This module documents the **Brandes-Köpf coordinate assignment algorithm** used by Dagre to calculate aesthetic horizontal X-coordinates.

---

## 1. Algorithmic Overview

Horizontal coordinates $x(v)$ are calculated using 4 sub-pass alignments:
- Upper-Left (UL)
- Upper-Right (UR)
- Lower-Left (LL)
- Lower-Right (LR)

```
        Upper-Left Alignment           Upper-Right Alignment
         (Align to Left Neighbor)       (Align to Right Neighbor)
               \                             /
                \                           /
        Lower-Left Alignment           Lower-Right Alignment
         (Align from Bottom-Left)       (Align from Bottom-Right)
                 \                         /
                  \                       /
                ┌───────────────────────────┐
                │ Final Coordinate x(v) =   │
                │ Median(UL, UR, LL, LR)    │
                └───────────────────────────┘
```

---

## 2. Alignment & Compaction Math

Each sub-pass aligns vertices with their median neighbor and builds blocks of connected vertices. The blocks are placed using a block graph compaction algorithm. The final X-coordinate is the median of the 4 candidate alignments:

$$x(v) = \text{Median}\left( x_{\text{UL}}(v), x_{\text{UR}}(v), x_{\text{LL}}(v), x_{\text{LR}}(v) \right)$$

This guarantees balanced subtree placement and aesthetic symmetry.

---

## 3. Codebase Reference Map

- [nodeDimensions.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout`
- [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) — Mode dispatcher
