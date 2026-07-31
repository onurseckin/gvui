# 01. Coordinate Space Transformation

This module documents the rotated matrix coordinate transformation for horizontal Left-to-Right layout.

---

## 1. Matrix Rotation Mechanics

The mathematical engine computes layout in a rotated coordinate system where **rank layers map to X-coordinates** and **in-layer node ordering maps to Y-coordinates**:

$$\begin{pmatrix} X_{\text{final}} \\ Y_{\text{final}} \end{pmatrix} = \begin{pmatrix} Y_{\text{sugiyama}} \\ X_{\text{sugiyama}} \end{pmatrix}$$

```
    Vertical Top-Down Layout (TB)         Horizontal Left-to-Right Layout (LR)
          ┌────────┐                                    ┌────────┐
          │ Rank 0 │                                    │ Rank 0 │
          └───┬────┘                                    └───┬────┘
              │                                             │
              ▼                                             ▼
          ┌────────┐                                    ┌────────┐
          │ Rank 1 │                                    │ Rank 1 │
          └────────┘                                    └────────┘
                                            (Rotated 90° Clockwise)
```

---

## 2. Dimension Swapping

For node dimension computations, node widths and heights are interchanged during rank spacing:

$$\text{EffWidth}(v) = \text{Height}(v), \quad \text{EffHeight}(v) = \text{Width}(v)$$

---

## 3. Codebase Reference Map

- [nodeDimensions.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L60-L110) — `rankdir: "LR"`
