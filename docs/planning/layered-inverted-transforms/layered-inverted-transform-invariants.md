# Module 4: Layered Inverted Transforms Invariants

## Executive Summary

The GVUI Layered Engine (`crates/gvui/src/7_engines/7_1_layered.rs`) operates on a fundamental architectural principle: **Direction is a coordinate frame, not a separate engine pipeline**. The core algorithmic engine (Phases 0 through 9: Ingest, Cycle Breaking, Rank Assignment, Layer Building, Crossing Minimization, Routing Demand, Brandes-Köpf Coordinate Assignment, Orthogonal Routing, and Emit) executes strictly in a canonical **top-down** coordinate frame.

All non-canonical flow directions (`bottom-top` / BT, `left-right` / LR, `right-left` / RL) are realized via exact affine coordinate transformations applied to input bounding boxes before ingest and to the final geometric payload after Phase 9.

This specification formalizes the affine transform matrices, port normal mapping rules, channel lane depth preservation proofs, and collinear edge avoidance invariants across all four flow directions.

---

## 1. Affine Frame Transformation System

```
+----------------------------------------------------------------------------------------------------+
|                               CANONICAL AFFINE PIPELINE ARCHITECTURE                               |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|    Input Nodes & Edges (Direction: D)                                                              |
|                     |                                                                              |
|                     v                                                                              |
|       +----------------------------+                                                               |
|       | Input Pre-Transposition    |  If D in {LR, RL}: Swap (w, h) of all node & badge boxes      |
|       +----------------------------+                                                               |
|                     |                                                                              |
|                     v                                                                              |
|       +----------------------------+                                                               |
|       | Canonical Layered Pipeline |  Phases 0-9 executed Top-Down (+y rank progression)           |
|       +----------------------------+                                                               |
|                     |                                                                              |
|                     v                                                                              |
|       +----------------------------+                                                               |
|       | Output Transposition       |  If D in {LR, RL}: T_LR(x, y) = (y, x), Side::transposed()    |
|       +----------------------------+                                                               |
|                     |                                                                              |
|                     v                                                                              |
|       +----------------------------+                                                               |
|       | Output Axis Reflection     |  If D in {BT, RL}: Mirror about bounding box midline          |
|       +----------------------------+                                                               |
|                     |                                                                              |
|                     v                                                                              |
|     Final Geometric Wire Result                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### 1.1 Transform Formalization

Let $\mathcal{B}_{\text{draw}} = [x_{\min}, x_{\max}] \times [y_{\min}, y_{\max}]$ be the bounding extent of the canonical top-down layout.

1. **Top-Down ($\text{TD}$)**:
   $$\mathcal{T}_{\text{TD}}\begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix} \begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} x \\ y \end{pmatrix}$$

2. **Bottom-Top / Bottom-Up ($\text{BT}$)**:
   $$\mathcal{T}_{\text{BT}}\begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} 1 & 0 \\ 0 & -1 \end{pmatrix} \begin{pmatrix} x \\ y \end{pmatrix} + \begin{pmatrix} 0 \\ y_{\min} + y_{\max} \end{pmatrix} = \begin{pmatrix} x \\ y_{\min} + y_{\max} - y \end{pmatrix}$$
   For a node rectangle with top-left $(x, y)$ and height $h$:
   $$y' = (y_{\min} + y_{\max}) - (y + h)$$

3. **Left-Right ($\text{LR}$)**:
   $$\mathcal{T}_{\text{LR}}\begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} \begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} y \\ x \end{pmatrix}$$
   For a node rectangle: $(x', y', w', h') = (y, x, h, w)$.

4. **Right-Left ($\text{RL}$)**:
   $$\mathcal{T}_{\text{RL}}\begin{pmatrix} x \\ y \end{pmatrix} = \mathcal{M}_{\text{Horiz}} \circ \mathcal{T}_{\text{LR}} \begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} 0 & -1 \\ 1 & 0 \end{pmatrix} \begin{pmatrix} x \\ y \end{pmatrix} + \begin{pmatrix} x_{\min} + x_{\max} \\ 0 \end{pmatrix} = \begin{pmatrix} x_{\min} + x_{\max} - y \\ x \end{pmatrix}$$
   For a node rectangle: $(x', y', w', h') = (x_{\min} + x_{\max} - (y + h), x, h, w)$.

---

## 2. Port Normal Vectors & Boundary Side Mapping

Each port $P = (\text{node\_id}, \text{side}, \text{index}, \text{point}, \text{stub})$ has an attachment side and an outward-pointing normal stub vector $\vec{v}_{\text{stub}} = \text{stub} - \text{point}$.

### 2.1 Side Transformation Matrix

| Canonical Side | `TopDown` (TD) | `BottomTop` (BT) | `LeftRight` (LR) | `RightLeft` (RL) |
| -------------- | -------------- | ---------------- | ---------------- | ---------------- |
| `Side::Top`    | `Side::Top`    | `Side::Bottom`   | `Side::Left`     | `Side::Right`    |
| `Side::Bottom` | `Side::Bottom` | `Side::Top`      | `Side::Right`    | `Side::Left`     |
| `Side::Left`   | `Side::Left`   | `Side::Left`     | `Side::Top`      | `Side::Top`      |
| `Side::Right`  | `Side::Right`  | `Side::Right`    | `Side::Bottom`   | `Side::Bottom`   |

### 2.2 Stub Normal Vector Invariants

For any boundary side $S \in \{\text{Top}, \text{Right}, \text{Bottom}, \text{Left}\}$, the outward unit normal $\hat{n}(S)$ is defined as:
$$\hat{n}(\text{Top}) = (0, -1), \quad \hat{n}(\text{Right}) = (1, 0), \quad \hat{n}(\text{Bottom}) = (0, 1), \quad \hat{n}(\text{Left}) = (-1, 0)$$

Under any affine transformation $\mathcal{T} \in \{\mathcal{T}_{\text{TD}}, \mathcal{T}_{\text{BT}}, \mathcal{T}_{\text{LR}}, \mathcal{T}_{\text{RL}}\}$:
$$\vec{v}'_{\text{stub}} = \mathcal{T}(\text{point} + L_{\text{stub}} \hat{n}(S)) - \mathcal{T}(\text{point}) = L_{\text{stub}} \hat{n}(\mathcal{T}(S))$$
This guarantees that port stubs always project strictly outward into routing channels and never point into node interiors.

---

## 3. Channel Lane Depth & Spacing Preservation

In Phase 6 (`step4_coordinate_assignment/compute_routing_demand.rs`), the channel lane count $K_{\text{lanes}}$ between adjacent ranks $r$ and $r+1$ is calculated based on edge segment crossing density and port pitch.

### 3.1 Invariance Proof for Channel Spacing

**Theorem 1 (Channel Lane Invariance)**:
Let $C(r, r+1)$ be the routing channel between ranks $r$ and $r+1$ with lane depth $D_{\text{channel}} = K_{\text{lanes}} \cdot \text{channel\_lane\_pitch} + \text{channel\_margin}$.
Under vertical mirroring $\mathcal{T}_{\text{BT}}$ or horizontal mirroring $\mathcal{T}_{\text{RL}}$:

1. The channel is mapped to $C'(r', r'+1)$ where $r' = \text{max\_rank} - 1 - r$.
2. The channel width $D'_{\text{channel}} = D_{\text{channel}}$ is identically preserved.
3. Every routing track within the channel retains its assigned index $k \in \{0, \dots, K_{\text{lanes}}-1\}$ without track compaction or lane collision.

_Proof_:
Affine reflections and transpositions are isometries ($|\det J| = 1$). The distance between any two parallel lines $\ell_1: y = y_1$ and $\ell_2: y = y_2$ in the canonical frame is $|y_2 - y_1|$. Under $\mathcal{T}_{\text{BT}}$, the mapped lines $\ell'_1: y' = \Sigma_y - y_1$ and $\ell'_2: y' = \Sigma_y - y_2$ have separation $|(\Sigma_y - y_2) - (\Sigma_y - y_1)| = |y_1 - y_2| = |y_2 - y_1|$. Thus, channel depth is an invariant. $\blacksquare$

---

## 4. Collinear Edge Avoidance & Zero Regression Invariants

In Phase 8 (`step5_edge_routing`), parallel edge runs along shared channel lanes are assigned distinct track indices $t \in \mathbb{N}$ to guarantee $\text{collinearEdgeOverlaps} = 0$.

### 4.1 Invariance Proof for Collinear Avoidance

**Theorem 2 (Collinear Avoidance Invariance)**:
If no two edge segments $\overline{a_1 b_1}$ and $\overline{a_2 b_2}$ are collinear in the canonical top-down layout, then no two edge segments are collinear in the transformed layouts (`BT`, `LR`, `RL`).

_Proof_:
Two segments are collinear if and only if they lie on the same line $\ell$ and their 1D intervals overlap:
$$\exists \ell, \quad \overline{a_1 b_1} \subset \ell \land \overline{a_2 b_2} \subset \ell \land \operatorname{Overlap}(\overline{a_1 b_1}, \overline{a_2 b_2}) > \epsilon$$
Since affine transformations $\mathcal{T}$ are bijective collinearity-preserving maps (they map lines to lines and preserve 1D interval intersections), if the intersection is empty in canonical frame:
$$\mathcal{T}(\overline{a_1 b_1} \cap \overline{a_2 b_2}) = \mathcal{T}(\emptyset) = \emptyset$$
Therefore, $\text{collinearEdgeOverlaps} = 0$ holds identically for all 4 directions. $\blacksquare$

---

## 5. Summary of Layered Direction Invariants

| Property / Metric       | `TopDown` (TD) | `BottomTop` (BT) | `LeftRight` (LR)  | `RightLeft` (RL)  |
| ----------------------- | -------------- | ---------------- | ----------------- | ----------------- |
| `nodeNodeOverlaps`      | 0              | 0                | 0                 | 0                 |
| `edgeNodePenetrations`  | 0              | 0                | 0                 | 0                 |
| `badgeNodeOverlaps`     | 0              | 0                | 0                 | 0                 |
| `badgeBadgeOverlaps`    | 0              | 0                | 0                 | 0                 |
| `badgeEdgePenetrations` | 0              | 0                | 0                 | 0                 |
| `collinearEdgeOverlaps` | 0              | 0                | 0                 | 0                 |
| `unresolvedRouteCount`  | 0              | 0                | 0                 | 0                 |
| `unresolvedBadgeCount`  | 0              | 0                | 0                 | 0                 |
| `aspect_ratio`          | $\text{AR}_0$  | $\text{AR}_0$    | $1 / \text{AR}_0$ | $1 / \text{AR}_0$ |
| Channel Lane Depth      | $D_c$          | $D_c$            | $D_c$             | $D_c$             |
