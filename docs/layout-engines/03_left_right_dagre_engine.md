# 03. Left-to-Right Dagre Rank-Based Engine

The **Left-to-Right (Dagre Rank-Based Engine)** configures the Sugiyama hierarchical layout framework in a horizontal Left-to-Right (`LR`) direction. This paradigm is ideal for sequential process pipelines, trace logs, and timelines where time or sequence naturally flows from left to right.

---

## 1. Coordinate Space Transformation

The mathematical engine computes layout in a rotated coordinate system where **rank layers map to X-coordinates** and **in-layer node ordering maps to Y-coordinates**:

$$\begin{pmatrix} X_{\text{final}} \\ Y_{\text{final}} \end{pmatrix} = \begin{pmatrix} Y_{\text{sugiyama}} \\ X_{\text{sugiyama}} \end{pmatrix}$$

### Dimension Swapping for Bounding Boxes

For node dimension computations, node widths and heights are interchanged during rank spacing:

$$\text{EffWidth}(v) = \text{Height}(v), \quad \text{EffHeight}(v) = \text{Width}(v)$$

---

## 2. Layer Separation & Channel Routing

In Left-to-Right orientation:
- **Rank Gap ($G_{\text{rank}}$)**: Sets the minimum horizontal distance between vertical rank columns ($X_{r+1} - X_r \ge G_{\text{rank}}$).
- **Node Gap ($G_{\text{node}}$)**: Sets the minimum vertical distance between nodes stacked in the same column ($Y_{i+1} - Y_i \ge G_{\text{node}}$).

### Horizontal Bezier Curve Routing

Edge paths for Left-to-Right layout connect the right border of source node $(X_{s} + W_s, Y_s)$ to the left border of target node $(X_t, Y_t)$ using cubic Bezier control points:

$$P_0 = (X_s + W_s, Y_s), \quad P_3 = (X_t, Y_t)$$

$$C_1 = \left( X_s + W_s + \frac{\Delta X}{2}, Y_s \right), \quad C_2 = \left( X_t - \frac{\Delta X}{2}, Y_t \right)$$

$$\text{Path}(t) = (1-t)^3 P_0 + 3(1-t)^2 t C_1 + 3(1-t) t^2 C_2 + t^3 P_3, \quad t \in [0, 1]$$

This produces smooth horizontal S-curves that guide the eye naturally across the pipeline.
