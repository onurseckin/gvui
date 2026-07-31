# 01. Polar Coordinate Transformation & Radial Projections

[← Back to Master Index](../README.md)

This module documents polar coordinate system transformations in the **Concentric Radial Engine**.

---

## 1. Polar Coordinate Projection

Node coordinates are computed in polar space $\langle R, \theta_i \rangle$ for index $i \in \{0, 1, \dots, N_{\text{nodes}} - 1\}$ and projected into 2D Cartesian top-left node origin coordinates $\langle X_i, Y_i \rangle$:

$$\begin{pmatrix} X_i \\ Y_i \end{pmatrix} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) - \frac{W_i}{2} \\ Y_0 + R \cdot \sin(\theta_i) - \frac{H_i}{2} \end{pmatrix}$$

```
                                  (X_0, Y_0 - R)
                                      Node 0
                                        │
                                        │
         (X_0 - R, Y_0) Node 3 <────── (X_0, Y_0) ──────> Node 1 (X_0 + R, Y_0)
                                    Center Hub
                                        │
                                        │
                                      Node 2
                                  (X_0, Y_0 + R)
```

Where:
- $(X_0, Y_0) = (R + 100\text{px}, R + 100\text{px})$: Center origin point of the canvas bounds.
- $R = \max(280\text{px}, N_{\text{nodes}} \cdot 45\text{px})$: Radius of the concentric orbit ring.
- $\theta_i = \frac{2 \pi \cdot i}{N_{\text{nodes}}} - \frac{\pi}{2}$: Angular displacement for node index $i$.

Corresponding node center coordinates $\mathbf{P}_{\text{center}, i}$ are:

$$\mathbf{P}_{\text{center}, i} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) \\ Y_0 + R \cdot \sin(\theta_i) \end{pmatrix}$$
