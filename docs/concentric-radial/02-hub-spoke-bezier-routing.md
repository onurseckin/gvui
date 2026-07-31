# 02. Quadratic Hub-Spoke Bezier Routing & Deflection Calculus

[← Back to Master Index](../README.md)

This module documents quadratic Bezier curve routing through the central origin hub, label placement optimization, and deflection vector mathematics in the **Concentric Radial Engine**.

---

## 1. Problem & Trade-off Journey

### The Goal
Edges connecting perimeter satellite nodes in a concentric radial layout must convey connectivity while keeping edge paths distinct, visually appealing, and uncluttered by overlapping label text.

### Naive Routing Strategies & Their Failures

1. **Straight Chord Lines ($\mathbf{P}_s \to \mathbf{P}_t$)**:
   - *Failure Mode*: Straight lines connecting two perimeter satellite nodes slice straight across the interior of the circle. When multiple edges connect non-adjacent perimeter nodes, all straight chords intersect in a dense, criss-crossing mesh near the circle center.
   - *Visual Artefact*: Obscures the central hub origin, creating visual chaos and clutter in the graph core.

2. **True Bezier Apex Label Placement ($\mathbf{B}(0.5)$)**:
   - *Failure Mode*: Quadratic Bezier routing bows edges inward toward the central hub control point $\mathbf{P}_0 = (X_0, Y_0)$. Placing edge label badges at the true curve midpoint $\mathbf{B}(0.5)$ pulls every edge label inward toward the center origin hub.
   - *Visual Artefact*: When multiple edges exist in the graph, all label badges collide and overlap densely around the central origin $(X_0, Y_0)$, rendering label text illegible.

### The Solution: Quadratic Bezier Hub Routing + Linear Chord Label Placement

The **Concentric Radial Engine** combines two distinct geometric strategies:
1. **Edge Paths**: Curved inward using a **Quadratic Bezier curve** $\mathbf{B}(t)$ with the canvas center origin $\mathbf{P}_0 = (X_0, Y_0)$ serving as the shared control point.
2. **Label Placement**: Positioned at the **linear chord midpoint** $\mathbf{P}_{\text{label}} = \frac{\mathbf{P}_s + \mathbf{P}_t}{2}$ between the endpoints.

```
┌─────────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ Edge Routing Strategy           │ Visual Clarity / Aesthetics   │ Label Collision Resistance    │
├─────────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Straight Chords                 │ Low (Center criss-crossing)   │ Medium (Crosses interior)     │
│ Curved Hub Routing + Apex Label │ High (Smooth wheel curves)    │ Low (Severe hub clustering)   │
│ Curved Hub Routing + Chord Label│ High (Smooth wheel curves)    │ High (Spaced along chord)     │
└─────────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

This decoupled approach retains the elegant curved "hub-and-spoke" wheel aesthetic while keeping edge labels cleanly distributed across the outer perimeter chords.

---

## 2. Bottom-Up Mathematical Deconstruction & Numerical Sub-Steps

We derive the quadratic Bezier curve, its tangent vectors, the true curve apex $\mathbf{B}(0.5)$, the linear chord midpoint $\mathbf{P}_{\text{label}}$, and the deflection vector $\mathbf{D}$ step by step.

---

### Sub-step 2.1: Node Center Extraction $\mathbf{P}_s, \mathbf{P}_t$ & Central Hub Anchor $\mathbf{P}_0$

#### 1. Mathematical Sub-Component Formula
For edge $e = (u, v)$, endpoint centers $\mathbf{P}_s, \mathbf{P}_t$ and control hub $\mathbf{P}_0$ are extracted from node top-left origins $(X, Y)$ and dimensions $(W, H)$:

$$\mathbf{P}_s = \begin{pmatrix} srcCx \\ srcCy \end{pmatrix} = \begin{pmatrix} X_u + \frac{W_u}{2} \\[4pt] Y_u + \frac{H_u}{2} \end{pmatrix}, \quad \mathbf{P}_t = \begin{pmatrix} tgtCx \\ tgtCy \end{pmatrix} = \begin{pmatrix} X_v + \frac{W_v}{2} \\[4pt] Y_v + \frac{H_v}{2} \end{pmatrix}, \quad \mathbf{P}_0 = \begin{pmatrix} X_0 \\ Y_0 \end{pmatrix}$$

#### 2. Concrete Numerical Graph Example
Given edge $e = (u, v)$ connecting Source Node $u$ at origin $(40, 170)$ with dimensions $120 \times 60$, Target Node $v$ at origin $(640, 170)$ with dimensions $120 \times 60$, and Canvas Hub Origin $(X_0, Y_0) = (400, 500)$:
1. **Source Node Center**:
   $$\mathbf{P}_s = \begin{pmatrix} 40 + \frac{120}{2} \\[4pt] 170 + \frac{60}{2} \end{pmatrix} = \begin{pmatrix} 100 \\[4pt] 200 \end{pmatrix}$$
2. **Target Node Center**:
   $$\mathbf{P}_t = \begin{pmatrix} 640 + \frac{120}{2} \\[4pt] 170 + \frac{60}{2} \end{pmatrix} = \begin{pmatrix} 700 \\[4pt] 200 \end{pmatrix}$$
3. **Central Hub Control Point Anchor**:
   $$\mathbf{P}_0 = \begin{pmatrix} 400 \\[4pt] 500 \end{pmatrix}$$

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM ExtractEndpointsAndHub(srcNode, tgtNode, centerX, centerY):
    INPUT: srcNode, tgtNode, center hub origin (centerX, centerY)
    OUTPUT: endpoint centers P_s, P_t and hub anchor P_0

    srcCx <- srcNode.x + (srcNode.width / 2)
    srcCy <- srcNode.y + (srcNode.height / 2)
    tgtCx <- tgtNode.x + (tgtNode.width / 2)
    tgtCy <- tgtNode.y + (tgtNode.height / 2)
    P_s <- (srcCx, srcCy)
    P_t <- (tgtCx, tgtCy)
    P_0 <- (centerX, centerY)
    RETURN P_s, P_t, P_0
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
P_s (100, 200)                                                  P_t (700, 200)
     o                                                               o
     │                                                               │
     │                                                               │
     └───────────────────────────────┐───────────────────────────────┘
                                     ▼
                            Central Hub P_0 (400, 500)
```

---

### Sub-step 2.2: Parametric Quadratic Bezier Equation $\mathbf{B}(t)$ & Curve Apex $\mathbf{B}(0.5)$

#### 1. Mathematical Sub-Component Formula
The 2D parametric trajectory $\mathbf{B}(t)$ for $t \in [0, 1]$ anchored by control point $\mathbf{P}_0$ is:

$$\mathbf{B}(t) = (1-t)^2 \mathbf{P}_s + 2(1-t)t \mathbf{P}_0 + t^2 \mathbf{P}_t$$

Evaluating at mid-parameter $t = 0.5$ yields the true geometric curve apex:

$$\mathbf{B}(0.5) = 0.25 \, \mathbf{P}_s + 0.5 \, \mathbf{P}_0 + 0.25 \, \mathbf{P}_t = \frac{\mathbf{P}_s + 2\mathbf{P}_0 + \mathbf{P}_t}{4}$$

SVG path string representation: `M srcCx srcCy Q centerX centerY tgtCx tgtCy`.

#### 2. Concrete Numerical Graph Example
Given $\mathbf{P}_s = (100, 200)$, $\mathbf{P}_t = (700, 200)$, $\mathbf{P}_0 = (400, 500)$, evaluating at $t = 0.5$:
1. **X Coordinate Calculation**:
   $$B_x(0.5) = 0.25(100) + 0.5(400) + 0.25(700) = 25 + 200 + 175 = 400\text{px}$$
2. **Y Coordinate Calculation**:
   $$B_y(0.5) = 0.25(200) + 0.5(500) + 0.25(200) = 50 + 250 + 50 = 350\text{px}$$
3. **Curve Apex Tuple**: $\mathbf{B}(0.5) = (400, 350)$.
4. **SVG Path String**: `M 100 200 Q 400 500 700 200`.

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM EvaluateQuadraticBezier(P_s, P_0, P_t, t):
    INPUT: endpoint centers P_s, P_t, hub control P_0, parameter t
    OUTPUT: curve point B(t) and SVG path string

    bx <- ((1 - t)^2 * P_s.x) + (2 * (1 - t) * t * P_0.x) + (t^2 * P_t.x)
    by <- ((1 - t)^2 * P_s.y) + (2 * (1 - t) * t * P_0.y) + (t^2 * P_t.y)
    pathString <- FORMAT("M {0} {1} Q {2} {3} {4} {5}", P_s.x, P_s.y, P_0.x, P_0.y, P_t.x, P_t.y)
    RETURN (bx, by), pathString
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
P_s (100, 200)                                                  P_t (700, 200)
     o                                                               o
      \                                                             /
       \                   B(0.5) Curve Apex                       /
        \                      (400, 350)                         /
         ` .                       o                           . '
            ` . _                 / \                 _ . '
                 ` ` - - . _     /   \     _ . - - ` `
                             ` - o - - `
                            Hub Anchor P_0
                              (400, 500)
```

---

### Sub-step 2.3: Tangent & Velocity Vector Analysis $\mathbf{B}'(t)$

#### 1. Mathematical Sub-Component Formula
Taking the first derivative of $\mathbf{B}(t)$ with respect to $t$ yields velocity vector $\mathbf{B}'(t)$:

$$\mathbf{B}'(t) = \frac{d\mathbf{B}(t)}{dt} = 2(1-t)(\mathbf{P}_0 - \mathbf{P}_s) + 2t(\mathbf{P}_t - \mathbf{P}_0)$$

Evaluating at boundary endpoints $t=0$ and $t=1$:

$$\mathbf{B}'(0) = 2(\mathbf{P}_0 - \mathbf{P}_s), \quad \mathbf{B}'(1) = 2(\mathbf{P}_t - \mathbf{P}_0)$$

#### 2. Concrete Numerical Graph Example
Given $\mathbf{P}_s = (100, 200)$, $\mathbf{P}_t = (700, 200)$, $\mathbf{P}_0 = (400, 500)$:
1. **Departure Vector ($t = 0$)**:
   $$\mathbf{B}'(0) = 2(400-100, 500-200) = 2(300, 300) = (600, 600)$$
   Departure Angle: $\theta_{\text{dep}} = \arctan(600/600) = 45^\circ$ (pointing directly toward hub $\mathbf{P}_0$).
2. **Arrival Vector ($t = 1$)**:
   $$\mathbf{B}'(1) = 2(700-400, 200-500) = 2(300, -300) = (600, -600)$$
   Arrival Angle: $\theta_{\text{arr}} = \arctan(-600/600) = -45^\circ$ (approaching from hub $\mathbf{P}_0$).

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM ComputeBezierTangents(P_s, P_0, P_t):
    INPUT: endpoint centers P_s, P_t, hub control P_0
    OUTPUT: tangent vectors B'(0) and B'(1)

    v0_x <- 2 * (P_0.x - P_s.x)
    v0_y <- 2 * (P_0.y - P_s.y)
    v1_x <- 2 * (P_t.x - P_0.x)
    v1_y <- 2 * (P_t.y - P_0.y)
    RETURN (v0_x, v0_y), (v1_x, v1_y)
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
P_s (100, 200)                                                  P_t (700, 200)
     o ────────┐                                            ┌──> o
      \        │ B'(0) = (600, 600)        B'(1) = (600, -600)│   /
       \       ▼ (45° angle)                 (-45° angle)   │  /
        \                                                   └──'
         ▼
      Hub Anchor P_0 (400, 500)
```

---

### Sub-step 2.4: Linear Chord Midpoint Label Placement $\mathbf{P}_{\text{label}}$

#### 1. Mathematical Sub-Component Formula
To avoid hub label congestion, edge label coordinates $(X_{\text{label}}, Y_{\text{label}})$ are assigned to the linear midpoint of the secant chord connecting $\mathbf{P}_s$ and $\mathbf{P}_t$:

$$\mathbf{P}_{\text{label}} = \begin{pmatrix} X_{\text{label}} \\[4pt] Y_{\text{label}} \end{pmatrix} = \frac{\mathbf{P}_s + \mathbf{P}_t}{2} = \begin{pmatrix} \frac{srcCx + tgtCx}{2} \\[4pt] \frac{srcCy + tgtCy}{2} \end{pmatrix}$$

#### 2. Concrete Numerical Graph Example
Given $\mathbf{P}_s = (100, 200)$ and $\mathbf{P}_t = (700, 200)$:
1. **Label X Coordinate**:
   $$X_{\text{label}} = \frac{100 + 700}{2} = \frac{800}{2} = 400\text{px}$$
2. **Label Y Coordinate**:
   $$Y_{\text{label}} = \frac{200 + 200}{2} = \frac{400}{2} = 200\text{px}$$
3. **Label Placement Tuple**: $\mathbf{P}_{\text{label}} = (400, 200)$.

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM ComputeChordLabelPlacement(P_s, P_t):
    INPUT: endpoint centers P_s, P_t
    OUTPUT: label midpoint coordinates (labelX, labelY)

    labelX <- (P_s.x + P_t.x) / 2
    labelY <- (P_s.y + P_t.y) / 2
    RETURN (labelX, labelY)
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
P_s (100, 200)               Secant Chord Line                P_t (700, 200)
     o ───────────────────────────── o ───────────────────────────── o
                              P_label (400, 200)
                              [ Edge Label ]
```

---

### Sub-step 2.5: Inward Deflection Vector Analysis $\mathbf{D}$

#### 1. Mathematical Sub-Component Formula
The spatial deflection vector $\mathbf{D}$ measuring the difference between the true Bezier curve apex $\mathbf{B}(0.5)$ and the label badge location $\mathbf{P}_{\text{label}}$ is derived as:

$$\mathbf{D} = \mathbf{B}(0.5) - \mathbf{P}_{\text{label}} = \frac{1}{2} (\mathbf{P}_0 - \mathbf{P}_{\text{label}})$$

#### 2. Concrete Numerical Graph Example
Given $\mathbf{P}_0 = (400, 500)$, $\mathbf{P}_{\text{label}} = (400, 200)$, and $\mathbf{B}(0.5) = (400, 350)$:
1. **Deflection Vector Subtraction**:
   $$\mathbf{D} = (400, 350) - (400, 200) = (0, 150\text{px})$$
2. **Verification via Half-Hub Formula**:
   $$\mathbf{D} = \frac{1}{2} ((400, 500) - (400, 200)) = \frac{1}{2} (0, 300) = (0, 150\text{px})$$
3. **Deflection Distance Magnitude**: $\|\mathbf{D}\| = \sqrt{0^2 + 150^2} = 150\text{px}$.

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM ComputeDeflectionVector(P_0, P_label, B_05):
    INPUT: hub origin P_0, label midpoint P_label, curve apex B_05
    OUTPUT: deflection vector (dx, dy) and magnitude

    dx <- B_05.x - P_label.x
    dy <- B_05.y - P_label.y
    dist <- SQRT(dx^2 + dy^2)
    RETURN (dx, dy), dist
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
P_label (400, 200) ------------ [ Label Badge ]
        │
        │ Deflection Vector D = (0, 150px)
        ▼
 B(0.5) (400, 350) ---------- [ Curve Apex ]
        │
        │ Remaining Segment = (0, 150px)
        ▼
    P_0 (400, 500) ---------- [ Hub Origin ]
```

---

## 3. Step-by-Step Computational Pseudocode & Master Synthesis

Combining sub-steps 2.1 through 2.5 into the complete master hub-and-spoke Bezier routing algorithm:

```text
ALGORITHM RouteHubSpokeBeziers(dataset, nodeMap, centerX, centerY):
    INPUT: dataset containing edges list E, nodeMap lookup table, central hub origin (centerX, centerY)
    OUTPUT: positionedEdges list with SVG path strings and label (X, Y) coordinates

    positionedEdges <- empty list

    FOR EACH edge IN E DO
        srcNode <- LOOKUP edge.source IN nodeMap
        tgtNode <- LOOKUP edge.target IN nodeMap

        IF srcNode IS NULL OR tgtNode IS NULL THEN
            APPEND (edge.id, "", 0, 0) TO positionedEdges
            CONTINUE
        END IF

        // Sub-step 2.1: Extract node center points
        srcCx <- srcNode.x + (srcNode.width / 2)
        srcCy <- srcNode.y + (srcNode.height / 2)
        tgtCx <- tgtNode.x + (tgtNode.width / 2)
        tgtCy <- tgtNode.y + (tgtNode.height / 2)

        // Sub-step 2.2: Build SVG Quadratic Bezier path string (Control point = centerX, centerY)
        pathString <- FORMAT("M {0} {1} Q {2} {3} {4} {5}", srcCx, srcCy, centerX, centerY, tgtCx, tgtCy)

        // Sub-step 2.4: Compute linear chord midpoint for label badge
        labelX <- (srcCx + tgtCx) / 2
        labelY <- (srcCy + tgtCy) / 2

        APPEND (edge.id, pathString, labelX, labelY) TO positionedEdges
    END FOR

    RETURN positionedEdges
END ALGORITHM
```

---

## 4. Master Hub Control Point Deflection Schematic Diagram

```
                 Source Node Center (P_s)                      Target Node Center (P_t)
                     (100, 200)                                    (700, 200)
                           │                                             │
                           │\                                           /│
                           │ \          Linear Chord Midpoint          / │
                           │  \       P_label = (P_s + P_t) / 2       /  │
                           │   \─────────────── o ───────────────/   │
                           │    \           (400, 200)          /    │
                           │     \              │              /     │
                           │      \             │ Deflection  /      │
                           │       \            │ D = (0, 150)       │
                           │        \──────> B(0.5) <───────/        │
                           │                 (400, 350)              │
                           │                     │                   │
                           │                     │                   │
                           └─────────────────────┼───────────────────┘
                                                 ▼
                                        Central Hub Control
                                          Point P_0 (400, 500)
```

---

## 🔗 Codebase Reference Anchors

- Hub Bezier Routing Implementation: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L40-L63)
- Main Dispatcher Entrypoint: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L147-L148)
