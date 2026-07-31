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

## 2. Bottom-Up Mathematical Deconstruction & Numerical Sub-Steps

We construct the polar-to-Cartesian projection transformation incrementally from primary geometric primitives.

---

### Sub-step 2.1: Dynamic Orbit Radius $R(N)$ & Canvas Center Origin $(X_0, Y_0)$

#### 1. Mathematical Sub-Component Formula
To prevent node overlap on large graphs while maintaining compactness on small graphs, the orbit radius $R(N)$ scales linearly with vertex count $N$, bounded below by minimum floor $R_{\text{min}} = 280\text{px}$:

$$R(N) = \max\left(280\text{px},\, N \cdot 45\text{px}\right)$$

The canvas center origin $(X_0, Y_0)$ adds a padding margin of $100\text{px}$:

$$X_0 = R + 100\text{px}, \quad Y_0 = R + 100\text{px}$$

Total canvas bounding box dimensions $W_{\text{canvas}} = H_{\text{canvas}} = 2R + 200\text{px}$.

#### 2. Concrete Numerical Graph Example
Given a graph dataset with $N = 8$ satellite nodes:
1. **Dynamic Orbit Radius**:
   $$R(8) = \max(280, 8 \cdot 45) = \max(280, 360) = 360\text{px}$$
2. **Canvas Center Origin Point**:
   $$X_0 = 360 + 100 = 460\text{px}, \quad Y_0 = 360 + 100 = 460\text{px}$$
3. **Canvas Extents**:
   $$W_{\text{canvas}} = H_{\text{canvas}} = 2(360) + 200 = 920\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM ComputeOrbitGeometry(nodeCount):
    INPUT: integer nodeCount N
    OUTPUT: radius R, centerX X_0, centerY Y_0, canvasSize

    R <- MAX(280, nodeCount * 45)
    X_0 <- R + 100
    Y_0 <- R + 100
    canvasSize <- 2 * R + 200
    RETURN R, X_0, Y_0, canvasSize
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
+-------------------------------------------------------------+
| Canvas Bounds (920px x 920px)                               |
|                                                             |
|             Padding Margin = 100px                          |
|             +---------------------------------+             |
|             |                                 |             |
|             |          R = 360px              |             |
|             |      <--------------->          |             |
|             |             (X_0, Y_0)          |             |
|             |              (460, 460)         |             |
|             |                 o               |             |
|             |                                 |             |
|             +---------------------------------+             |
|                                                             |
+-------------------------------------------------------------+
```

---

### Sub-step 2.2: Angular Displacement $\theta_i$ & Phase Shift Offset

#### 1. Mathematical Sub-Component Formula
For $N$ vertices indexed $i \in \{0, 1, \dots, N - 1\}$, the uniform angular step size $\Delta\theta$ is:

$$\Delta\theta = \frac{2\pi}{N}$$

An angular phase shift of $-\frac{\pi}{2}$ radians ($-90^\circ$) aligns index $i = 0$ at the top 12 o'clock position:

$$\theta_i = i \cdot \Delta\theta - \frac{\pi}{2} = \frac{2\pi \cdot i}{N} - \frac{\pi}{2}$$

#### 2. Concrete Numerical Graph Example
For $N = 8$ nodes indexed $i \in \{0, \dots, 7\}$:
1. **Angular Step**: $\Delta\theta = \frac{2\pi}{8} = \frac{\pi}{4} = 45^\circ \approx 0.7854\text{ rad}$.
2. **Node 0 ($i = 0$, Top 12 o'clock)**:
   $$\theta_0 = 0 \cdot \frac{\pi}{4} - \frac{\pi}{2} = -\frac{\pi}{2}\text{ rad} = -90^\circ$$
3. **Node 2 ($i = 2$, Right 3 o'clock)**:
   $$\theta_2 = 2 \cdot \frac{\pi}{4} - \frac{\pi}{2} = \frac{\pi}{2} - \frac{\pi}{2} = 0\text{ rad} = 0^\circ$$
4. **Node 4 ($i = 4$, Bottom 6 o'clock)**:
   $$\theta_4 = 4 \cdot \frac{\pi}{4} - \frac{\pi}{2} = \pi - \frac{\pi}{2} = \frac{\pi}{2}\text{ rad} = 90^\circ$$

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM ComputeNodeAngle(index, totalNodes):
    INPUT: node index i, totalNodes N
    OUTPUT: angle theta in radians

    stepAngle <- (2 * PI) / totalNodes
    phaseShift <- PI / 2
    theta <- (index * stepAngle) - phaseShift
    RETURN theta
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
                      Node 0 (i=0)
                    θ_0 = -π/2 (-90°)
                         (12 o'clock)
                            ▲
                            │
Node 6 (i=6)                │                Node 2 (i=2)
θ_6 = π (180°) <──── (460, 460) ────> θ_2 = 0 (0°)
(9 o'clock)                 │                (3 o'clock)
                            │
                            ▼
                      Node 4 (i=4)
                    θ_4 = π/2 (90°)
                         (6 o'clock)
```

---

### Sub-step 2.3: Arc Length Circumferential Separation $s$

#### 1. Mathematical Sub-Component Formula
The circumferential arc length distance $s$ along the orbit ring between any two adjacent node centers is:

$$s = R \cdot \Delta\theta = R \cdot \frac{2\pi}{N}$$

For scaled radius $R = N \cdot 45\text{px}$ ($N \ge 7$):

$$s = (N \cdot 45) \cdot \frac{2\pi}{N} = 90\pi \approx 282.74\text{px}$$

#### 2. Concrete Numerical Graph Example
Given $R = 360\text{px}$ and $N = 8$:
1. **Angular Step**: $\Delta\theta = \frac{\pi}{4} \approx 0.7854\text{ rad}$.
2. **Arc Length Separation**:
   $$s = 360\text{px} \times \frac{\pi}{4} = 90\pi \approx 282.74\text{px}$$
3. **Spacing Clearance**: Provides $\approx 282.74\text{px}$ center-to-center spacing along the ring, easily accommodating $120\text{px}$ wide nodes with $\approx 162.74\text{px}$ gap clearance between adjacent boundaries.

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM ComputeArcSeparation(radius, totalNodes):
    INPUT: radius R, totalNodes N
    OUTPUT: arc length distance s between adjacent node centers

    stepAngle <- (2 * PI) / totalNodes
    arcLength <- radius * stepAngle
    RETURN arcLength
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
                     (460, 100) Node 0
                         .---'---.
                       .'         '.
                     .'             '.  Arc length s = 282.74px
Node 7 (i=7)       .'                 '. Node 1 (i=1)
(205.4, 205.4)    /  R = 360px   Δθ=45° \ (714.6, 205.4)
                 ;        \        /     ;
                 |         (460,460)     |
```

---

### Sub-step 2.4: Polar-to-Cartesian Center Projection $(cx_i, cy_i)$

#### 1. Mathematical Sub-Component Formula
The polar coordinate tuple $\langle R, \theta_i \rangle$ is projected into 2D Cartesian center coordinates $\mathbf{P}_{\text{center}, i} = (cx_i, cy_i)$:

$$\begin{pmatrix} cx_i \\ cy_i \end{pmatrix} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) \\ Y_0 + R \cdot \sin(\theta_i) \end{pmatrix}$$

#### 2. Concrete Numerical Graph Example
Given $X_0 = 460\text{px}, Y_0 = 460\text{px}, R = 360\text{px}$, evaluating for Node 2 ($i = 2, \theta_2 = 0\text{ rad}$):
1. **Trigonometric values**: $\cos(0) = 1.0$, $\sin(0) = 0.0$.
2. **Center X Coordinate**:
   $$cx_2 = 460 + 360 \cdot \cos(0) = 460 + 360 \cdot 1.0 = 820\text{px}$$
3. **Center Y Coordinate**:
   $$cy_2 = 460 + 360 \cdot \sin(0) = 460 + 360 \cdot 0.0 = 460\text{px}$$
4. **Node 2 Center Vector**: $\mathbf{P}_{\text{center}, 2} = (820, 460)$.

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM ProjectPolarToCartesianCenter(centerX, centerY, radius, theta):
    INPUT: centerX X_0, centerY Y_0, radius R, angle theta
    OUTPUT: center point (cx, cy)

    cx <- centerX + radius * COS(theta)
    cy <- centerY + radius * SIN(theta)
    RETURN (cx, cy)
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
                       Center (460, 460)
                              o
                              │
                              │ R * cos(0) = +360px  (R * sin(0) = 0px)
                              └─────────────────────────► Node 2 Center
                                                          (820, 460)
```

---

### Sub-step 2.5: Top-Left Rendering Origin Offset $(X_i, Y_i)$

#### 1. Mathematical Sub-Component Formula
Given node dimensions $(W_i, H_i)$, top-left rendering origin $(X_i, Y_i)$ is derived by subtracting half-width and half-height:

$$\begin{pmatrix} X_i \\ Y_i \end{pmatrix} = \begin{pmatrix} cx_i - \frac{W_i}{2} \\ cy_i - \frac{H_i}{2} \end{pmatrix} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) - \frac{W_i}{2} \\ Y_0 + R \cdot \sin(\theta_i) - \frac{H_i}{2} \end{pmatrix}$$

#### 2. Concrete Numerical Graph Example
Given Node 2 Center $(cx_2, cy_2) = (820, 460)$ and dimensions $W_2 = 120\text{px}, H_2 = 60\text{px}$:
1. **Top-Left X Coordinate**:
   $$X_2 = 820 - \frac{120}{2} = 820 - 60 = 760\text{px}$$
2. **Top-Left Y Coordinate**:
   $$Y_2 = 460 - \frac{60}{2} = 460 - 30 = 430\text{px}$$
3. **Top-Left Origin Tuple**: $(X_2, Y_2) = (760, 430)$.

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM ComputeTopLeftOrigin(cx, cy, width, height):
    INPUT: center point (cx, cy), dimensions (width, height)
    OUTPUT: top-left origin (x, y)

    x <- cx - (width / 2)
    y <- cy - (height / 2)
    RETURN (x, y)
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
                   (760, 430) Top-Left Origin
                         ┌─────────────────────────┐
                         │                         │
                         │   • Center (820, 460)   │  H = 60px
                         │                         │
                         └─────────────────────────┘
                                  W = 120px
```

---

## 3. Step-by-Step Computational Pseudocode & Master Synthesis

Combining sub-steps 2.1 through 2.5 into the complete master polar transformation algorithm:

```text
ALGORITHM ComputePolarRadialPositions(dataset):
    INPUT: dataset containing nodes list V of size N
    OUTPUT: positionedNodes list with Cartesian coordinates (x, y, width, height)

    IF N == 0 THEN
        RETURN empty list
    END IF

    // Sub-step 2.1: Dynamic radius & center setup
    radius <- MAX(280, N * 45)
    centerX <- radius + 100
    centerY <- radius + 100

    positionedNodes <- empty list

    FOR EACH i FROM 0 TO N - 1 DO
        node <- V[i]
        width, height <- CalculateNodeDimensions(node)

        // Sub-step 2.2: Compute angular position with 12 o'clock offset (-PI/2)
        angle <- (2 * PI * i / N) - (PI / 2)

        // Sub-step 2.4: Project polar coordinates to Cartesian center
        cx <- centerX + radius * COS(angle)
        cy <- centerY + radius * SIN(angle)

        // Sub-step 2.5: Offset center to obtain top-left rendering origin
        topLx <- cx - (width / 2)
        topLy <- cy - (height / 2)

        APPEND (node.id, topLx, topLy, width, height) TO positionedNodes
    END FOR

    RETURN positionedNodes
END ALGORITHM
```

---

## 4. Master Radial Orbit ASCII Diagram & Axis Alignment

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
    θ_6 = π (9 o'clock)           ▼           θ_2 = 0 (3 o'clock)
      ┌───────────┐         (X_0, Y_0)          ┌───────────┐
      │  Node 6   │<────── Central Hub ────────>│  Node 2   │
      └───────────┘       Origin (0, 0)         └───────────┘
                                  ▲             (760, 430)
                                  │
                                  │  R (Orbit Radius)
                                  │
                                  │
                            ┌─────┴─────┐
                            │  Node 4   │
                            └───────────┘
                         θ_4 = π/2 (6 o'clock)
```

---

## 🔗 Codebase Reference Anchors

- Layout Dispatcher Engine: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L18-L36)
- Main Dispatcher Entrypoint: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L147-L148)
