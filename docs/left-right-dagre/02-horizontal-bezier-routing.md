# 02. Horizontal Cubic Bezier Edge Routing

[← Back to Master Index](../README.md)

This module documents horizontal cubic Bezier curve edge routing for Left-to-Right layout.

---

## 1. Cubic Bezier Curve Math

Edge paths for Left-to-Right layout connect the right border center of source node $(X_s + W_s, Y_s + \frac{H_s}{2})$ to the left border center of target node $(X_t, Y_t + \frac{H_t}{2})$ using cubic Bezier control points:

$$P_0 = \left( X_s + W_s, Y_s + \frac{H_s}{2} \right), \quad P_3 = \left( X_t, Y_t + \frac{H_t}{2} \right)$$

Define horizontal delta $\Delta X = X_t - (X_s + W_s)$:

$$C_1 = \left( X_s + W_s + \frac{\Delta X}{2}, Y_s + \frac{H_s}{2} \right), \quad C_2 = \left( X_t - \frac{\Delta X}{2}, Y_t + \frac{H_t}{2} \right)$$

$$\text{Path}(t) = (1-t)^3 P_0 + 3(1-t)^2 t C_1 + 3(1-t) t^2 C_2 + t^3 P_3, \quad t \in [0, 1]$$

```
     ┌───────────┐                                      ┌───────────┐
     │ Source    │(P_0)────(C_1)           (C_2)────(P_3)│ Target    │
     │ Node      │           \               /          │ Node      │
     └───────────┘            └─────────────┘           └───────────┘
                               S-Curve Path
```

---

## 2. Edge Label Midpoint Coordinates

The midpoint $(X_{\text{label}}, Y_{\text{label}})$ for edge badge overlays corresponds to parameter $t = 0.5$:

$$X_{\text{label}} = \frac{X_s + W_s + X_t}{2}, \quad Y_{\text{label}} = \frac{Y_s + \frac{H_s}{2} + Y_t + \frac{H_t}{2}}{2}$$
