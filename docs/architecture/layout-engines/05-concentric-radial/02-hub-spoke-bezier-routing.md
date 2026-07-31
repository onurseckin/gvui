# 02. Quadratic Hub-Spoke Bezier Routing

This module documents quadratic Bezier curve routing through the central origin hub in the Concentric Radial Engine.

---

## 1. Quadratic Bezier Curve Math

Edges connecting nodes on the radial ring are routed using quadratic Bezier curves passing through the central hub $(X_0, Y_0)$ as a control point:

$$\mathbf{B}(t) = (1-t)^2 \mathbf{P}_s + 2(1-t)t \mathbf{P}_0 + t^2 \mathbf{P}_t, \quad t \in [0, 1]$$

Where:
- $\mathbf{P}_s = (X_{\text{src, center}}, Y_{\text{src, center}})$: Center coordinate of source node.
- $\mathbf{P}_0 = (X_0, Y_0)$: Central hub control point.
- $\mathbf{P}_t = (X_{\text{tgt, center}}, Y_{\text{tgt, center}})$: Center coordinate of target node.

```
       Source Node (P_s)                              Target Node (P_t)
             \                                             /
              \                                           /
               \───────> Central Control Point <─────────/
                              (X_0, Y_0) P_0
```

---

## 2. Mathematical Note on Edge Label Midpoint Coordinates

Evaluating the quadratic Bezier curve $\mathbf{B}(t)$ at parameter $t = 0.5$ yields:

$$\mathbf{B}(0.5) = \frac{\mathbf{P}_s + 2\mathbf{P}_0 + \mathbf{P}_t}{4}$$

For fast rendering performance, the engine places the edge badge at the linear chord midpoint $(X_{\text{label}}, Y_{\text{label}})$ between the node centers:

$$X_{\text{label}} = \frac{X_{\text{src, center}} + X_{\text{tgt, center}}}{2}, \quad Y_{\text{label}} = \frac{Y_{\text{src, center}} + Y_{\text{tgt, center}}}{2}$$
