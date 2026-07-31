# 04. A* Orthogonal Edge Routing

[← Previous: Barycentric Crossing Minimization](./03-barycentric-crossing-minimization.md) | [← Back to Master Index](../README.md) | [Next: Dynamic Spacing Demands →](./05-dynamic-spacing-demands.md)

This document provides a complete technical and mathematical breakdown of the 3D A* orthogonal edge routing engine in the **Custom State-Space Layout Engine**.

---

## 1. Problem & Trade-Off Journey

### The Core Challenge
In modern UI graph visualizers, connecting nodes with straight-line chords leads to severe visual clutter:
1. Straight lines cut directly across node UI card bounds, obscuring text labels and interactive controls.
2. Parallel straight edges overlap and collide, making it impossible to distinguish individual connections.

```
Straight-Line Routing (Node Intersections):     Orthogonal A* Grid Routing (Clean Channels):
┌───────────┐         ┌───────────┐             ┌───────────┐         ┌───────────┐
│ Node A    │         │ Node B    │             │ Node A    │         │ Node B    │
└─────┬─────┘         └─────┬─────┘             └─────┬─────┘         └─────┬─────┘
      │                     │                         │                 │
      ├───────┐   ┌─────────┤                         └──────┐   ┌──────┘
      │       │   │         │                                │   │
      │ ❌ CUTS │ THROUGH │ CARD                             ▼   ▼
      │   ┌───▼───▼───┐     │                          ┌───────────────┐
      └───┤ Node C    ├─────┘                          │ Node C        │
          └───────────┘                                └───────────────┘
```

### Trade-Off Comparison of Edge Routers

| Algorithm | Mechanism | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- | :--- |
| **Lee / Hadlock Maze Router** | Breadth-First Search (BFS) / Detour Expansion on 2D grid | Guarantees shortest Manhattan distance | Explores states in all directions indiscriminately; produces chaotic "staircase" zig-zag bends ($> 10$ bends per edge) | ❌ Rejected |
| **Manhattan Channel Router** | Fixed horizontal/vertical routing channel assignment | Fast ($O(|E|)$) | Requires global channel reservation; cannot route around arbitrary rectangular node obstacles dynamically | ❌ Rejected |
| **3D Directed A* Search** | A* search over 3D state space $(x, y, \vec{d})$ with directional cost penalties | Finds optimal routes balancing distance, bend counts, hairpin U-turns, and obstacle clearance | Higher open-list memory consumption ($O(|V_{\text{grid}}| \cdot 4)$) | ✅ **Chosen Approach** |

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 2.1: 3D State Tuple $(x, y, \vec{d})$ & Neighbor Directions

#### 1. Mathematical Sub-Component Formula
A grid routing state is represented as a 3D state tuple $s = (x, y, \vec{d})$, where $(x, y) \in \mathbb{R}^2$ represents grid vertex coordinates and $\vec{d} \in \{ \text{up}, \text{down}, \text{left}, \text{right} \}$ represents current travel direction.

State tracking in 3D is essential to detect directional bends ($90^\circ$) and hairpin U-turns ($180^\circ$) during neighbor expansion:

$$\text{State Key } K(s) = x + \text{":"} + y + \text{":"} + \vec{d}$$

#### 2. Concrete Numerical Step Example
Consider current state $s_1 = (16, 24, \text{right})$ on an $8\text{px}$ grid. Expanding to adjacent neighbors:

- **Neighbor 1 (Straight Move)**: $s_2 = (24, 24, \text{right})$
  - $\Delta x = +8, \Delta y = 0, \vec{d}_{\text{move}} = \text{right}$.
  - Direction unchanged ($\vec{d}_{\text{move}} = \vec{d}$) $\implies$ Bends delta = $0$.
- **Neighbor 2 (90° Right Turn)**: $s_3 = (16, 32, \text{down})$
  - $\Delta x = 0, \Delta y = +8, \vec{d}_{\text{move}} = \text{down}$.
  - Direction changed ($\vec{d}_{\text{move}} \neq \vec{d}$) $\implies$ Bends delta = $+1$.
- **Neighbor 3 (180° Hairpin U-Turn)**: $s_4 = (8, 24, \text{left})$
  - $\Delta x = -8, \Delta y = 0, \vec{d}_{\text{move}} = \text{left}$.
  - Direction reversed ($\vec{d}_{\text{move}} = -\vec{d}$) $\implies$ Hairpins delta = $+1$.

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM expand3DNeighbors(curr, grid)
  INPUT: current grid search node curr, routing grid grid
  OUTPUT: list of neighbor state transitions

  neighbors <- EMPTY LIST
  adjacentKeys <- grid.adj[curr.vId] OR EMPTY LIST

  FOR EACH adj IN adjacentKeys DO
    targetPt <- grid.vertices[adj.targetId]
    moveDir <- getSegmentDirection(curr.pt, targetPt)
    isBend <- (moveDir != curr.dir)
    isHairpin <- (OPPOSITE_DIR[curr.dir] = moveDir)

    APPEND {
      targetId: adj.targetId,
      moveDir: moveDir,
      isBend: isBend,
      isHairpin: isHairpin,
      stepDistance: adj.edge.weight
    } TO neighbors
  END FOR

  RETURN neighbors
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.1: 3D Grid State (x, y, d) Neighbor Expansions
                       (16, 16, up) [Turn]
                            ▲
                            │
 (8, 24, left) ◄─── (16, 24, right) ───► (24, 24, right) [Straight]
  [180° Hairpin]            │
                            ▼
                      (16, 32, down) [90° Turn]
```

---

### Step 2.2: Composite Step Cost $g(s)$ & Admissible Heuristic $h(s)$

#### 1. Mathematical Sub-Component Formula
Path cost $g(s')$ for transitioning from state $s$ to neighbor $s'$ across segment $\mathbf{seg} = \overline{pq}$ is:

$$g(s') = g(s) + \|\mathbf{seg}\|_1 + P_{\text{bend}} \cdot \mathbb{I}(\text{bend}) + P_{\text{hairpin}} \cdot \mathbb{I}(\text{hairpin}) + P_{\text{cross}} \cdot \mathbb{I}(\text{cross})$$

The admissible L1 Manhattan heuristic $h(p, q)$ to target stub $q = (x_q, y_q)$ is:

$$h(p, q) = |x_p - x_q| + |y_p - y_q|$$

Total evaluation cost $f(s') = g(s') + h(p', q)$.

#### 2. Concrete Numerical Arithmetic Example
Routing an edge from start stub $(16, 24)$ to target stub $(80, 80)$:
- **Penalty Constants**: $P_{\text{bend}} = 40, \; P_{\text{hairpin}} = 200, \; P_{\text{cross}} = 100$.
- **Current State $s_1$**: Position $(24, 24, \text{right})$, $g(s_1) = 8$ (accumulated distance $8\text{px}$, 0 bends).
- **Evaluating Candidate $s_2$**: Move to $(24, 32, \text{down})$.

**Step-by-Step Calculations**:
1. Step distance $\|\mathbf{seg}\|_1 = |24 - 24| + |32 - 24| = 8\text{px}$.
2. Direction change `right` $\to$ `down` $\implies \mathbb{I}(\text{bend}) = 1$. Bend cost $= 40$.
3. New accumulated cost:
   $$g(s_2) = g(s_1) + 8 + 40 = 8 + 8 + 40 = \mathbf{56}$$
4. Remaining Manhattan distance to target $(80, 80)$:
   $$h(s_2) = |24 - 80| + |32 - 80| = 56 + 48 = \mathbf{104}$$
5. Total evaluation score:
   $$f(s_2) = g(s_2) + h(s_2) = 56 + 104 = \mathbf{160}$$

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM computeCandidateCosts(curr, targetStub, trans, config)
  INPUT: current search node curr, target point stub, neighbor transition trans, config
  OUTPUT: candidate gCost and fCost objects

  length <- curr.gCost.length + trans.stepDistance
  bends <- curr.gCost.bends + (1 IF trans.isBend ELSE 0)
  hairpins <- curr.gCost.hairpins + (1 IF trans.isHairpin ELSE 0)
  crossings <- curr.gCost.crossings

  numericG <- length + bends * config.penaltyBend + hairpins * config.penaltyHairpin
  numericH <- ABS(curr.pt.x - targetStub.x) + ABS(curr.pt.y - targetStub.y)

  gCost <- { crossings: crossings, hairpins: hairpins, bends: bends, length: numericG }
  fCost <- { crossings: crossings, hairpins: hairpins, bends: bends, length: numericG + numericH }

  RETURN { gCost: gCost, fCost: fCost }
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.2: Composite Cost & Heuristic Calculation
 Current Node s1 (24, 24, right): g = 8, h = 112, f = 120
           │
           │ Step: Δy = 8px, Dir = down (90° Bend!)
           ▼
 Candidate Node s2 (24, 32, down):
 ┌──────────────────────────────────────────────────────────┐
 │ Length Δg  : 8px                                         │
 │ Bend Cost  : +40 (Penalty for 90° turn)                  │
 │ g(s2)      : 8 + 8 + 40 = 56                             │
 │ h(s2)      : |24-80| + |32-80| = 56 + 48 = 104           │
 │ f(s2)      : 56 + 104 = 160                              │
 └──────────────────────────────────────────────────────────┘
```

---

### Step 2.3: SVG Arc Bridge Geometry Equation

#### 1. Mathematical Sub-Component Formula
When two edge routes cross perpendicularly at point $\mathbf{P}_{\text{cross}} = (x_c, y_c)$, the secondary edge renders an SVG circular arc bridge to visually jump over the primary edge:

$$\text{SVG Cmd} = \text{M } (x_c - r \cdot dx, y_c - r \cdot dy) \;\; \text{A } r \;\; r \;\; 0 \;\; 0 \;\; 0 \;\; (x_c + r \cdot dx, y_c + r \cdot dy)$$

where $r$ is the bridge radius (default $6\text{px}$) and $(dx, dy)$ is the unit direction vector along the edge.

#### 2. Concrete Geometric Calculation Example
Consider a horizontal edge segment moving right ($(dx=1, dy=0)$) intersecting a vertical edge at crossing point $\mathbf{P}_{\text{cross}} = (120, 200)$ with bridge radius $r = 6\text{px}$:

- **Arc Start Point ($P_1$)**:
  $$P_1 = (x_c - r \cdot dx, y_c - r \cdot dy) = (120 - 6 \cdot 1, 200 - 6 \cdot 0) = (114, 200)$$
- **Arc End Point ($P_2$)**:
  $$P_2 = (x_c + r \cdot dx, y_c + r \cdot dy) = (120 + 6 \cdot 1, 200 + 6 \cdot 0) = (126, 200)$$
- **Generated SVG Path Command**:
  $$\text{"M 114 200 A 6 6 0 0 0 126 200"}$$

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM renderPathWithCrossingBridges(points, crossings, r)
  INPUT: list of path points, list of crossing points, bridge arc radius r (default 6)
  OUTPUT: SVG path string containing arc jump bridges

  pathStr <- FORMAT("M {x} {y}", x: points[0].x, y: points[0].y)

  FOR i FROM 0 TO LENGTH(points) - 2 DO
    p1 <- points[i]
    p2 <- points[i + 1]
    segCrossings <- findCrossingsOnSegment(p1, p2, crossings)

    IF segCrossings IS EMPTY THEN
      pathStr <- CONCAT(pathStr, FORMAT(" L {x} {y}", x: p2.x, y: p2.y))
    ELSE
      dx <- SIGN(p2.x - p1.x)
      dy <- SIGN(p2.y - p1.y)
      FOR EACH c IN segCrossings DO
        startX <- c.x - r * dx
        startY <- c.y - r * dy
        endX <- c.x + r * dx
        endY <- c.y + r * dy
        pathStr <- CONCAT(pathStr, FORMAT(" L {sx} {sy} A {r} {r} 0 0 0 {ex} {ey}",
          sx: startX, sy: startY, r: r, ex: endX, ey: endY))
      END FOR
      pathStr <- CONCAT(pathStr, FORMAT(" L {x} {y}", x: p2.x, y: p2.y))
    END IF
  END FOR

  RETURN pathStr
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.3: SVG Crossing Arc Bridge Geometry
           Primary Vertical Edge
                     │
                     │
 ─────────●──────────┼──────────●─────────► Secondary Horizontal Edge
      (114, 200)    │       (126, 200)
    (Bridge Start) ┌┴┐     (Bridge End)
                  /   \  Arc Radius r = 6px
                 └┬─┬┘
                  │ │ (Intersection at (120, 200))
                  ▼
 Generated SVG: "M 114 200 A 6 6 0 0 0 126 200"
```

---

## 3. Master Synthesis: Merged 3D A* Directed Open-List Router

### 1. Unified Mathematical Router Formulation
Combining 3D state representations (2.1), composite step penalties and L1 heuristics (2.2), and SVG arc bridge rendering (2.3), the complete orthogonal route for edge $e$ is:

$$\mathcal{P}^*(e) = \arg\min_{\mathcal{P} \in \mathbf{Grid}} g(\mathcal{P}) + h(\text{end}(\mathcal{P}), \text{target})$$

### 2. Complete 3D A* Router Pseudocode
```text
ALGORITHM searchOrthogonalRoute(edgeId, sourcePort, targetPort, grid, occupancy, config)
  INPUT: edge ID, source port, target port, routing grid, occupancy map, configuration
  OUTPUT: routed path or null if unresolvable

  initialDir <- sideToOutwardDir(sourcePort.side)
  startNode <- {
    vId: vertexKey(sourcePort.stub),
    pt: sourcePort.stub,
    dir: initialDir,
    gCost: { crossings: 0, hairpins: 0, bends: 0, length: config.portStubLength * 2 },
    fCost: { crossings: 0, hairpins: 0, bends: 0, length: manhattanDist(sourcePort.stub, targetPort.stub) },
    parent: NULL
  }

  openHeap <- MIN_HEAP containing startNode
  gCosts <- MAP containing KEY(startNode.stateKey) -> startNode.gCost

  WHILE openHeap IS NOT EMPTY DO
    current <- POP_MIN(openHeap)
    IF current.vId = vertexKey(targetPort.stub) THEN
      RETURN reconstructAndSimplifyPath(current, sourcePort, targetPort, grid)
    END IF

    transitions <- expand3DNeighbors(current, grid)
    FOR EACH trans IN transitions DO
      IF intersectsNodeInterior(current.pt, trans.targetPt, grid.nodeObstacles) THEN
        CONTINUE
      END IF

      costs <- computeCandidateCosts(current, targetPort.stub, trans, config)
      stateKey <- CONCAT(trans.targetId, ":", trans.moveDir)
      existingG <- gCosts[stateKey]

      IF existingG IS NOT DEFINED OR compareRouteCost(costs.gCost, existingG) < 0 THEN
        gCosts[stateKey] <- costs.gCost
        PUSH {
          vId: trans.targetId,
          pt: grid.vertices[trans.targetId],
          dir: trans.moveDir,
          gCost: costs.gCost,
          fCost: costs.fCost,
          parent: current
        } INTO openHeap
      END IF
    END FOR
  END WHILE

  RETURN NULL // Route unresolvable
END ALGORITHM
```

### 3. Master Routing Architecture
```
3D A* Orthogonal Routing Engine Architecture:
┌────────────────────────────────────────────────────────────────────────┐
│                   Source & Target Pin Port Stubs                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2.1: 3D Grid State Tuple (x, y, d) -> Up/Down/Left/Right Moves   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2.2: Min-Heap Open List -> g(s) Step Cost + Admissible h(p, q)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2.3: Render SVG Polylines + Crossing Arc Bridges (A 6 6 0 0 0)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Optimal Collision-Free Route Path                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/routeSearch.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L21-L774)
  - [`compareRouteCost`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L30-L50) — Lexicographic comparator for route costs.
  - [`IndexedOccupancy`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L330-L465) — Spatial interval tree indexing edge segments for fast collision queries.
  - [`searchOrthogonalRoute`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L467-L740) — Core 3D A* directed open-list grid search.
- [`src/engine/layout/custom/edgeRouter.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L105-L638)
  - [`routeAllEdges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L105-L638) — Multi-variant order routing loop with conflict rip-up and reroute passes.
- [`src/engine/layout/custom/svgPath.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L17-L184)
  - [`pointsToSvgPath`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L17-L30) — Converts orthogonal point polylines into SVG path strings (`M... L...`).
  - [`renderPathWithCrossingBridges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L60-L184) — Renders SVG path strings with circular arc bridges (`A r r 0 0 0...`) at crossing points.
