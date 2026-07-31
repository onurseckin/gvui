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

Edge paths for Left-to-Right layout connect the right border center of source node $(X_s + W_s, Y_s + \frac{H_s}{2})$ to the left border center of target node $(X_t, Y_t + \frac{H_t}{2})$ using cubic Bezier control points:

$$P_0 = \left( X_s + W_s, Y_s + \frac{H_s}{2} \right), \quad P_3 = \left( X_t, Y_t + \frac{H_t}{2} \right)$$

Define horizontal delta $\Delta X = X_t - (X_s + W_s)$:

$$C_1 = \left( X_s + W_s + \frac{\Delta X}{2}, Y_s + \frac{H_s}{2} \right), \quad C_2 = \left( X_t - \frac{\Delta X}{2}, Y_t + \frac{H_t}{2} \right)$$

$$\text{Path}(t) = (1-t)^3 P_0 + 3(1-t)^2 t C_1 + 3(1-t) t^2 C_2 + t^3 P_3, \quad t \in [0, 1]$$

### Edge Label Midpoint Coordinates

The midpoint $(X_{\text{label}}, Y_{\text{label}})$ for edge badge overlays corresponds to parameter $t = 0.5$:

$$X_{\text{label}} = \frac{X_s + W_s + X_t}{2}, \quad Y_{\text{label}} = \frac{Y_s + \frac{H_s}{2} + Y_t + \frac{H_t}{2}}{2}$$

This produces smooth horizontal S-curves that guide the eye naturally across the pipeline.
