# 01. Polar Coordinate Transformation & Radial Projections

[← Back to Master Index](../README.md)

This module documents polar coordinate system transformations, dynamic orbit scaling, arc length distribution, and Cartesian projections in the **Concentric Radial Engine**.

---

## 1. Problem & Trade-off Journey

### The Goal
When visualizing system architectures centered around a single core entity — such as a central API Gateway, a primary root microservice, a database primary, or a central state store — graph layouts must clearly highlight the hub-and-spoke relationship between the central hub and its satellite dependencies.

### Naive Approaches & Their Failures

1. **Top-Down & Left-Right DAG Layouts (Dagre/Sugiyama)**:
   - *Failure Mode*: Sugiyama layering algorithms partition nodes into rigid horizontal or vertical ranks based on topological distance. In a single-source hub-and-spoke topology, all satellite nodes lie at distance 1 from the hub. Sugiyama layout places all satellites into a single wide rank (e.g. Layer 1), producing an excessively wide horizontal banner or vertical stack.
   - *Visual Artefact*: Masks the radial symmetry of the topology and introduces an artificial directional flow that does not exist among peer satellites.

2. **Rectangular Grid Layouts**:
   - *Failure Mode*: Placing satellite nodes on a uniform $M \times N$ grid places nodes at varying Euclidean distances from the central hub (e.g., corner nodes are $\sqrt{2}\times$ further away than axial neighbors).
   - *Visual Artefact*: Destroys visual equality among satellite nodes and causes severe edge crossing when interior chord lines cross grid intersections.

3. **Organic Force-Directed Layouts (Fruchterman-Reingold)**:
   - *Failure Mode*: While force-directed engines naturally spread nodes, non-deterministic spring physics causes satellite nodes to settle into irregular, non-uniform clusters or asymmetrical shapes depending on initial random seeding.
   - *Visual Artefact*: Lacks geometric precision and clean visual order; requires computationally expensive iterative cooling sweeps ($O(|V|^2)$ per frame).

### The Solution: Concentric Polar Orbit Projection
The **Concentric Radial Engine** projects satellite nodes along a deterministic 2D circular polar orbit of radius $R(N)$ centered on origin $(X_0, Y_0)$. 

```
┌─────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ Layout Paradigm         │ Structural Symmetry           │ Deterministic Execution       │
├─────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Sugiyama DAG (TB/LR)    │ Low (Forced linear ranks)     │ High ($O(|V| \log |V|)$)      │
│ Rectangular Grid        │ Low (Distorted distances)     │ High ($O(|V|)$)               │
│ Organic Force-Directed  │ Medium (Irregular clusters)   │ Low (Iterative simulation)    │
│ Concentric Radial Orbit │ High (100% Radial Symmetry)   │ High ($O(|V|)$ Closed-Form)   │
└─────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

By computing angular positions closed-form in $O(|V|)$ time, every satellite node is placed at an identical radial distance $R$ from the hub, preserving 100% topological symmetry.

---

## 2. Bottom-Up Mathematical Deconstruction

We construct the polar-to-Cartesian projection transformation incrementally from primary geometric primitives.

### Step 1: Dynamic Orbit Radius $R(N_{\text{nodes}})$

To prevent node overlap on large graphs while maintaining compactness on small graphs, the orbit radius $R$ scales linearly with vertex count $N_{\text{nodes}}$, bounded below by a minimum radius floor $R_{\text{min}} = 280\text{px}$:

$$R(N_{\text{nodes}}) = \max\left(280\text{px},\, N_{\text{nodes}} \cdot 45\text{px}\right)$$

- For $N_{\text{nodes}} \le 6$: $R = 280\text{px}$.
- For $N_{\text{nodes}} = 20$: $R = 20 \cdot 45 = 900\text{px}$.

---

### Step 2: Canvas Center Origin & Padding Margins

The center hub origin point $(X_0, Y_0)$ is computed by adding a constant padding margin of $100\text{px}$ to the orbit radius $R$:

$$X_0 = R + 100\text{px}, \quad Y_0 = R + 100\text{px}$$

This guarantees that all satellite nodes remain strictly within the canvas bounding extents:

$$W_{\text{canvas}} = H_{\text{canvas}} = 2R + 200\text{px}$$

---

### Step 3: Angular Displacement & Top-Center Alignment

For a graph containing $N_{\text{nodes}}$ vertices indexed $i \in \{0, 1, \dots, N_{\text{nodes}} - 1\}$, the uniform angular step size $\Delta\theta$ between adjacent nodes along the circle is:

$$\Delta\theta = \frac{2\pi}{N_{\text{nodes}}}$$

Standard trigonometric functions ($\cos, \sin$) measure angles counterclockwise starting from the positive X-axis (3 o'clock position). To align the initial node ($i = 0$) at the traditional 12 o'clock top-center position, an angular phase shift offset of $-\frac{\pi}{2}$ radians ($-90^\circ$) is applied:

$$\theta_i = i \cdot \Delta\theta - \frac{\pi}{2} = \frac{2\pi \cdot i}{N_{\text{nodes}}} - \frac{\pi}{2}$$

---

### Step 4: Arc Length Circumferential Separation

The arc length distance $s$ along the orbit ring between any two adjacent node centers is given by:

$$s = R \cdot \Delta\theta = R \cdot \frac{2\pi}{N_{\text{nodes}}}$$

Substituting the scaled radius equation $R = N_{\text{nodes}} \cdot 45\text{px}$ for $N_{\text{nodes}} \ge 7$:

$$s = (N_{\text{nodes}} \cdot 45) \cdot \frac{2\pi}{N_{\text{nodes}}} = 45 \cdot 2\pi \approx 282.74\text{px}$$

Thus, for all graph scales $N_{\text{nodes}} \ge 7$, the circumferential center-to-center distance between adjacent satellite nodes remains constant at $\approx 282.74\text{px}$, providing ample spatial clearance for node rendering without overlaps.

---

### Step 5: Polar-to-Cartesian Center Projection

The polar coordinate tuple $\langle R, \theta_i \rangle$ for node $i$ is projected into 2D Cartesian center coordinates $\mathbf{P}_{\text{center}, i} = (cx_i, cy_i)$:

$$\begin{pmatrix} cx_i \\ cy_i \end{pmatrix} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) \\ Y_0 + R \cdot \sin(\theta_i) \end{pmatrix}$$

---

### Step 6: Rendering Origin Offset Subtraction

SVG elements (such as HTML `<div` elements or SVG `<g>` groups) are positioned using their top-left bounding box corner $(X_i, Y_i)$. Given calculated node dimensions $(W_i, H_i)$ from `calculateNodeDimensions`, half-width and half-height offsets are subtracted:

$$\begin{pmatrix} X_i \\ Y_i \end{pmatrix} = \begin{pmatrix} cx_i - \frac{W_i}{2} \\ cy_i - \frac{H_i}{2} \end{pmatrix} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) - \frac{W_i}{2} \\ Y_0 + R \cdot \sin(\theta_i) - \frac{H_i}{2} \end{pmatrix}$$

---

## 3. Step-by-Step Computational Pseudocode

The following structured pseudocode outlines the complete algorithm for polar coordinate calculation and canvas node positioning:

```text
ALGORITHM ComputePolarRadialPositions(dataset):
    INPUT: dataset containing nodes array V of size N
    OUTPUT: positionedNodes array with Cartesian coordinates (x, y, width, height)

    1. IF N == 0 THEN
           RETURN empty array
       END IF

    2. // Step 1 & 2: Calculate dynamic radius and center origin
       radius <- MAX(280, N * 45)
       centerX <- radius + 100
       centerY <- radius + 100

    3. INITIALIZE positionedNodes as empty list

    4. FOR i FROM 0 TO N - 1 DO
           node <- V[i]
           dims <- CalculateNodeDimensions(node)   // Returns (width, height)

           // Step 3: Compute angular position with 12 o'clock offset (-PI/2)
           angle <- (2 * PI * i / N) - (PI / 2)

           // Step 5: Project polar coordinates to Cartesian center
           cx <- centerX + radius * COS(angle)
           cy <- centerY + radius * SIN(angle)

           // Step 6: Offset center to obtain top-left rendering origin
           topLx <- cx - (dims.width / 2)
           topLy <- cy - (dims.height / 2)

           APPEND { id: node.id, x: topLx, y: topLy, width: dims.width, height: dims.height } TO positionedNodes
       END FOR

    5. RETURN positionedNodes
END ALGORITHM
```

---

## 4. Radial Orbit ASCII Diagram & Axis Alignment

```
                         θ_0 = -π/2 (12 o'clock)
                            (cx_0, cy_0)
                            ┌───────────┐
                            │  Node 0   │
                            └─────┬─────┘
                                  │
                                  │
                                  │  R (Orbit Radius)
                                  │
    θ_3 = π (9 o'clock)           ▼           θ_1 = 0 (3 o'clock)
      ┌───────────┐         (X_0, Y_0)          ┌───────────┐
      │  Node 3   │<────── Central Hub ────────>│  Node 1   │
      └───────────┘       Origin (0, 0)         └───────────┘
                                  ▲
                                  │
                                  │  R (Orbit Radius)
                                  │
                                  │
                            ┌─────┴─────┐
                            │  Node 2   │
                            └───────────┘
                         θ_2 = π/2 (6 o'clock)
```

---

## 🔗 Codebase Reference Anchors

- Layout Dispatcher Engine: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L18-L36)
- Main Dispatcher Entrypoint: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L147-L148)
