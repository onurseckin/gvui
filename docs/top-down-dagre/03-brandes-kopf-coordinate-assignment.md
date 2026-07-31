# 03. Brandes-Köpf Coordinate Alignment

[← Back to Master Index](../README.md)

This module documents the **Brandes-Köpf coordinate assignment algorithm** used by Dagre to calculate aesthetic horizontal X-coordinates with balanced subtree placement and straight vertical alignment.

---

## 1. Algorithmic Overview & 4-Pass Mechanics

Horizontal coordinates $x(v)$ are derived by computing 4 extremal sub-pass alignments:
1. **Upper-Left (UL)**: Top-down sweep aligning vertices to their leftmost upper median neighbor.
2. **Upper-Right (UR)**: Top-down sweep aligning vertices to their rightmost upper median neighbor.
3. **Lower-Left (LL)**: Bottom-up sweep aligning vertices to their leftmost lower median neighbor.
4. **Lower-Right (LR)**: Bottom-up sweep aligning vertices to their rightmost lower median neighbor.

---

## 2. Brandes-Köpf 4-Pass Alignment ASCII Diagrams

### 2.1 Sub-Pass Alignment Visualizations

```
   1. Upper-Left (UL) Alignment              2. Upper-Right (UR) Alignment
   (Sweep: Top→Bottom, Align: Left Median)   (Sweep: Top→Bottom, Align: Right Median)
           [A1]     [A2]                             [A1]     [A2]
           │        │                                   \     │
           │        │                                    \    │
           [B1]     [B2]                             [B1] \   [B2]
           │        │                                │     \  │
           │        │                                │      \ │
           [C1]     [C2]                             [C1]     [C2]

   3. Lower-Left (LL) Alignment              4. Lower-Right (LR) Alignment
   (Sweep: Bottom→Top, Align: Left Median)   (Sweep: Bottom→Top, Align: Right Median)
           [A1]     [A2]                             [A1]     [A2]
           │      /  │                               │        │
           │     /   │                               │        │
           [B1] /   [B2]                             [B1]     [B2]
           │   /     │                               │        │
           │  /      │                               │        │
           [C1]     [C2]                             [C1]     [C2]
```

### 2.2 Block Graph Construction & Horizontal Compaction

Each sub-pass groups aligned node paths into vertical **blocks** stored via `root[v]` and `align[v]` arrays:
- **Block Formation**: Edges connecting aligned nodes become zero-width vertical block segments.
- **Block Graph DAG**: Blocks form nodes in a secondary block graph where directed edges represent horizontal separation constraints:
  $$x(\text{Block}_B) \ge x(\text{Block}_A) + \text{width}(\text{Block}_A) + \text{nodesep}$$

```
                Node Alignment Blocks                   Compacted Class Graph
             
                 ┌──────────┐                          ┌────────────────────┐
                 │ Node A1  │                          │      Block 1       │
                 │    │     │                          │ (A1 ─ B1 ─ C1)     │
                 │ Node B1  │                          └─────────┬──────────┘
                 │    │     │                                    │
                 │ Node C1  │                                    │ min_sep = 150px
                 └──────────┘                                    ▼
                                                       ┌────────────────────┐
                 ┌──────────┐                          │      Block 2       │
                 │ Node A2  │                          │ (A2 ─ B2 ─ C2)     │
                 │    │     │                          └────────────────────┘
                 │ Node B2  │
                 │    │     │
                 │ Node C2  │
                 └──────────┘
```

### 2.3 Median Coordinate Resolution

For each node $v \in V$, the four candidate alignments produce horizontal positions $(x_{\text{UL}}(v), x_{\text{UR}}(v), x_{\text{LL}}(v), x_{\text{LR}}(v))$.

The final horizontal coordinate is the **median** of the 4 candidate layouts:

$$x(v) = \text{Median}\left( x_{\text{UL}}(v), x_{\text{UR}}(v), x_{\text{LL}}(v), x_{\text{LR}}(v) \right)$$

```
        UL Candidate:  x_UL(v) = 120 ──────────┐
        UR Candidate:  x_UR(v) = 280 ──────────┼──►  Sorted: [120, 180, 220, 280]
        LL Candidate:  x_LL(v) = 180 ──────────┤         Median = (180 + 220) / 2 = 200
        LR Candidate:  x_LR(v) = 220 ──────────┘
                                                          │
                                                          ▼
                                              Final Coordinate x(v) = 200
```

Taking the median balances asymmetric bias across directional sweeps, placing trees symmetrically around centerlines and preventing edge inflection distortion.

---

## 3. Codebase Reference Map

- [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout` layout entry point executing Brandes-Köpf coordinate placement.
- [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) — Dispatcher case routing `"top-down-dagre"`.
