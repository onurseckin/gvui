# 05. Concentric Radial Engine (Radial Balance)

The **Concentric Radial Engine** arranges nodes along concentric circular orbits centered around a central origin point $(X_0, Y_0)$. It is ideal for central hub-and-spoke architectures, radial network maps, and single-source dependency topologies.

---

## 1. Polar Coordinate System Transformation

Node coordinates are computed in polar space $\langle r, \theta \rangle$ and projected into 2D Cartesian space $\langle X, Y \rangle$:

$$\begin{pmatrix} X_i \\ Y_i \end{pmatrix} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) - \frac{W_i}{2} \\ Y_0 + R \cdot \sin(\theta_i) - \frac{H_i}{2} \end{pmatrix}$$

Where:
- $(X_0, Y_0)$: Center origin point of the canvas canvas bounds ($R + 100\text{px}$).
- $R = \max(280\text{px}, N_{\text{nodes}} \cdot 45\text{px})$: Radius of the concentric orbit ring.
- $\theta_i = \frac{2 \pi \cdot i}{N_{\text{nodes}}} - \frac{\pi}{2}$: Angular displacement for node index $i$.

---

## 2. Radial Quadratic Bezier Edge Routing

Edges connecting nodes on the radial ring are routed using quadratic Bezier curves passing through the central hub $(X_0, Y_0)$ as a control point:

$$\mathbf{B}(t) = (1-t)^2 \mathbf{P}_s + 2(1-t)t \mathbf{P}_0 + t^2 \mathbf{P}_t, \quad t \in [0, 1]$$

Where:
- $\mathbf{P}_s = (X_{\text{src}}, Y_{\text{src}})$: Center coordinate of source node.
- $\mathbf{P}_0 = (X_0, Y_0)$: Central hub control point.
- $\mathbf{P}_t = (X_{\text{tgt}}, Y_{\text{tgt}})$: Center coordinate of target node.

### Edge Label Midpoint Coordinates

The midpoint $(X_{\text{label}}, Y_{\text{label}})$ for edge badge overlays along the quadratic curve corresponds to $t = 0.5$:

$$X_{\text{label}} = \frac{X_{\text{src}} + X_{\text{tgt}}}{2}, \quad Y_{\text{label}} = \frac{Y_{\text{src}} + Y_{\text{tgt}}}{2}$$

This ensures edge labels sit cleanly in the spatial corridors between radial nodes and the central hub.
