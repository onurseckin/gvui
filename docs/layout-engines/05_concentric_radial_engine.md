# 05. Concentric Radial Engine (Radial Balance)

The **Concentric Radial Engine** arranges nodes along concentric circular orbits centered around a central origin point $(X_0, Y_0)$. It is ideal for central hub-and-spoke architectures, radial network maps, and single-source dependency topologies.

---

## 1. Polar Coordinate System Transformation

Node coordinates are computed in polar space $\langle R, \theta_i \rangle$ for index $i \in \{0, 1, \dots, N_{\text{nodes}} - 1\}$ and projected into 2D Cartesian top-left node origin coordinates $\langle X_i, Y_i \rangle$:

$$\begin{pmatrix} X_i \\ Y_i \end{pmatrix} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) - \frac{W_i}{2} \\ Y_0 + R \cdot \sin(\theta_i) - \frac{H_i}{2} \end{pmatrix}$$

Where:
- $(X_0, Y_0) = (R + 100\text{px}, R + 100\text{px})$: Center origin point of the canvas bounds.
- $R = \max(280\text{px}, N_{\text{nodes}} \cdot 45\text{px})$: Radius of the concentric orbit ring.
- $\theta_i = \frac{2 \pi \cdot i}{N_{\text{nodes}}} - \frac{\pi}{2}$: Angular displacement for node index $i$.

Corresponding node center coordinates $\mathbf{P}_{\text{center}, i}$ are:

$$\mathbf{P}_{\text{center}, i} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) \\ Y_0 + R \cdot \sin(\theta_i) \end{pmatrix}$$

---

## 2. Radial Quadratic Bezier Edge Routing

Edges connecting nodes on the radial ring are routed using quadratic Bezier curves passing through the central hub $(X_0, Y_0)$ as a control point:

$$\mathbf{B}(t) = (1-t)^2 \mathbf{P}_s + 2(1-t)t \mathbf{P}_0 + t^2 \mathbf{P}_t, \quad t \in [0, 1]$$

Where:
- $\mathbf{P}_s = (X_{\text{src, center}}, Y_{\text{src, center}})$: Center coordinate of source node.
- $\mathbf{P}_0 = (X_0, Y_0)$: Central hub control point.
- $\mathbf{P}_t = (X_{\text{tgt, center}}, Y_{\text{tgt, center}})$: Center coordinate of target node.

### Mathematical Note on Edge Label Midpoint Coordinates

Evaluating the quadratic Bezier curve $\mathbf{B}(t)$ at parameter $t = 0.5$ yields:

$$\mathbf{B}(0.5) = \frac{\mathbf{P}_s + 2\mathbf{P}_0 + \mathbf{P}_t}{4}$$

For fast rendering performance, the engine places the edge badge at the linear chord midpoint $(X_{\text{label}}, Y_{\text{label}})$ between the node centers:

$$X_{\text{label}} = \frac{X_{\text{src, center}} + X_{\text{tgt, center}}}{2}, \quad Y_{\text{label}} = \frac{Y_{\text{src, center}} + Y_{\text{tgt, center}}}{2}$$

This ensures edge labels sit cleanly in the spatial corridors between radial nodes and the central hub.
