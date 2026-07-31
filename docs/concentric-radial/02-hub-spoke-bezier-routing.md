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

## 2. Bottom-Up Mathematical Deconstruction

We derive the quadratic Bezier curve, its tangent vectors, the true curve apex $\mathbf{B}(0.5)$, the linear chord midpoint $\mathbf{P}_{\text{label}}$, and the deflection vector $\mathbf{D}$ step by step.

### Step 1: Endpoint Identification

For an edge $e = (u, v)$ connecting source node $u$ and target node $v$, node center coordinates are extracted from node top-left origins $(X_u, Y_u)$ and dimensions $(W_u, H_u)$:

$$\mathbf{P}_s = \begin{pmatrix} srcCx \\ srcCy \end{pmatrix} = \begin{pmatrix} X_u + \frac{W_u}{2} \\[4pt] Y_u + \frac{H_u}{2} \end{pmatrix}, \quad \mathbf{P}_t = \begin{pmatrix} tgtCx \\ tgtCy \end{pmatrix} = \begin{pmatrix} X_v + \frac{W_v}{2} \\[4pt] Y_v + \frac{H_v}{2} \end{pmatrix}$$

The control point $\mathbf{P}_0$ is fixed at the central hub canvas origin:

$$\mathbf{P}_0 = \begin{pmatrix} centerX \\ centerY \end{pmatrix} = \begin{pmatrix} X_0 \\ Y_0 \end{pmatrix}$$

---

### Step 2: Parametric Quadratic Bezier Equation $\mathbf{B}(t)$

The continuous 2D parametric trajectory $\mathbf{B}(t)$ for $t \in [0, 1]$ between $\mathbf{P}_s$ and $\mathbf{P}_t$ anchored by control point $\mathbf{P}_0$ is defined as:

$$\mathbf{B}(t) = (1-t)^2 \mathbf{P}_s + 2(1-t)t \mathbf{P}_0 + t^2 \mathbf{P}_t$$

Expanding into Cartesian component equations:

$$B_x(t) = (1-t)^2 \cdot srcCx + 2(1-t)t \cdot centerX + t^2 \cdot tgtCx$$

$$B_y(t) = (1-t)^2 \cdot srcCy + 2(1-t)t \cdot centerY + t^2 \cdot tgtCy$$

In SVG path syntax, this quadratic Bezier curve is encoded as:

$$\texttt{"M } srcCx \text{ } srcCy \texttt{ Q } centerX \text{ } centerY \text{ } tgtCx \text{ } tgtCy\texttt{"}$$

---

### Step 3: Tangent & Velocity Vector Analysis $\mathbf{B}'(t)$

Taking the first derivative of $\mathbf{B}(t)$ with respect to parameter $t$ yields the velocity vector $\mathbf{B}'(t)$ along the trajectory:

$$\mathbf{B}'(t) = \frac{d\mathbf{B}(t)}{dt} = 2(1-t)(\mathbf{P}_0 - \mathbf{P}_s) + 2t(\mathbf{P}_t - \mathbf{P}_0)$$

Evaluating at path endpoints:

1. **Initial Departure Tangent ($t = 0$)**:
   $$\mathbf{B}'(0) = 2(\mathbf{P}_0 - \mathbf{P}_s)$$
   *Physical Meaning*: The trajectory leaves source node center $\mathbf{P}_s$ pointing directly toward the central hub origin $\mathbf{P}_0$.

2. **Terminal Arrival Tangent ($t = 1$)**:
   $$\mathbf{B}'(1) = 2(\mathbf{P}_t - \mathbf{P}_0)$$
   *Physical Meaning*: The trajectory approaches target node center $\mathbf{P}_t$ coming directly from the direction of the central hub origin $\mathbf{P}_0$.

---

### Step 4: True Curve Apex Derivation ($\mathbf{B}(0.5)$)

Evaluating $\mathbf{B}(t)$ at mid-parameter $t = 0.5$:

$$\mathbf{B}(0.5) = (1-0.5)^2 \mathbf{P}_s + 2(1-0.5)(0.5) \mathbf{P}_0 + (0.5)^2 \mathbf{P}_t$$

$$\mathbf{B}(0.5) = 0.25 \, \mathbf{P}_s + 0.5 \, \mathbf{P}_0 + 0.25 \, \mathbf{P}_t = \frac{\mathbf{P}_s + 2\mathbf{P}_0 + \mathbf{P}_t}{4}$$

Note that $\mathbf{B}(0.5)$ is weighted $50\%$ by central hub $\mathbf{P}_0$, pulling the true geometric midpoint of the curve heavily inward toward the center origin.

---

### Step 5: Linear Chord Midpoint Calculation ($\mathbf{P}_{\text{label}}$)

To avoid hub label congestion, edge label coordinates $(X_{\text{label}}, Y_{\text{label}})$ are assigned to the linear midpoint of the secant chord connecting $\mathbf{P}_s$ and $\mathbf{P}_t$:

$$\mathbf{P}_{\text{label}} = \begin{pmatrix} X_{\text{label}} \\[4pt] Y_{\text{label}} \end{pmatrix} = \frac{\mathbf{P}_s + \mathbf{P}_t}{2} = \begin{pmatrix} \frac{srcCx + tgtCx}{2} \\[4pt] \frac{srcCy + tgtCy}{2} \end{pmatrix}$$

---

### Step 6: Inward Deflection Vector Analysis ($\mathbf{D}$)

The spatial deflection vector $\mathbf{D}$ measuring the difference between the true Bezier curve apex $\mathbf{B}(0.5)$ and the label badge location $\mathbf{P}_{\text{label}}$ is derived as:

$$\mathbf{D} = \mathbf{B}(0.5) - \mathbf{P}_{\text{label}} = \frac{\mathbf{P}_s + 2\mathbf{P}_0 + \mathbf{P}_t}{4} - \frac{2\mathbf{P}_s + 2\mathbf{P}_t}{4}$$

$$\mathbf{D} = \frac{2\mathbf{P}_0 - (\mathbf{P}_s + \mathbf{P}_t)}{4} = \frac{\mathbf{P}_0 - \left(\frac{\mathbf{P}_s + \mathbf{P}_t}{2}\right)}{2} = \frac{\mathbf{P}_0 - \mathbf{P}_{\text{label}}}{2}$$

$$\mathbf{D} = \frac{1}{2} (\mathbf{P}_0 - \mathbf{P}_{\text{label}})$$

#### Mathematical Insight:
The true curve apex $\mathbf{B}(0.5)$ is deflected **exactly halfway** along the line segment connecting the linear chord midpoint $\mathbf{P}_{\text{label}}$ to the central hub origin $\mathbf{P}_0$. By placing labels at $\mathbf{P}_{\text{label}}$, label text is maintained at a safe distance away from the central origin hub.

---

## 3. Step-by-Step Computational Pseudocode

The following pseudocode details edge quadratic Bezier string construction and label coordinate calculation:

```text
ALGORITHM RouteHubSpokeBeziers(dataset, nodeMap, centerX, centerY):
    INPUT: dataset containing edges array E, nodeMap dictionary, central hub origin (centerX, centerY)
    OUTPUT: positionedEdges array with SVG path strings and label (X, Y) coordinates

    1. INITIALIZE positionedEdges as empty list

    2. FOR EACH edge IN E DO
           srcNode <- nodeMap.GET(edge.source)
           tgtNode <- nodeMap.GET(edge.target)

           IF srcNode IS NULL OR tgtNode IS NULL THEN
               APPEND { ...edge, path: "", labelX: 0, labelY: 0 } TO positionedEdges
               CONTINUE
           END IF

           // Step 1: Calculate node center points
           srcCx <- srcNode.x + (srcNode.width / 2)
           srcCy <- srcNode.y + (srcNode.height / 2)
           tgtCx <- tgtNode.x + (tgtNode.width / 2)
           tgtCy <- tgtNode.y + (tgtNode.height / 2)

           // Step 2: Build SVG Quadratic Bezier path string (Control point = centerX, centerY)
           pathString <- FORMAT("M {0} {1} Q {2} {3} {4} {5}", srcCx, srcCy, centerX, centerY, tgtCx, tgtCy)

           // Step 5: Compute linear chord midpoint for label badge
           labelX <- (srcCx + tgtCx) / 2
           labelY <- (srcCy + tgtCy) / 2

           APPEND { ...edge, path: pathString, labelX: labelX, labelY: labelY } TO positionedEdges
       END FOR

    3. RETURN positionedEdges
END ALGORITHM
```

---

## 4. Hub Control Point Deflection Schematic Diagram

```
                 Source Node Center (P_s)                      Target Node Center (P_t)
                     (srcCx, srcCy)                                (tgtCx, tgtCy)
                           │                                             │
                           │\                                           /│
                           │ \          Linear Chord Midpoint          / │
                           │  \        P_label = (P_s + P_t) / 2      /  │
                           │   \─────────────── o ───────────────/   │
                           │    \               │               /    │
                           │     \              │ Deflection   /     │
                           │      \             │ D = (P_0 - P_l)/2  │
                           │       \            ▼            /       │
                           │        \──────> B(0.5) <───────/        │
                           │          True Curve Midpoint            │
                           │                     │                   │
                           │                     │                   │
                           └─────────────────────┼───────────────────┘
                                                 ▼
                                        Central Hub Control
                                          Point P_0 (X_0, Y_0)
```

---

## 🔗 Codebase Reference Anchors

- Hub Bezier Routing Implementation: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L40-L63)
- Main Dispatcher Entrypoint: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L147-L148)
