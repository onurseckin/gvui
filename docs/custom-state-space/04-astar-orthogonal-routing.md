# 04. A* Orthogonal Edge Routing

[← Previous: Barycentric Crossing Minimization](./03-barycentric-crossing-minimization.md) | [← Back to Custom State-Space Engine Overview](./README.md) | [Next: Dynamic Spacing Demands →](./05-dynamic-spacing-demands.md)

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
| **Manhattan Channel Router** | Fixed horizontal/vertical routing channel assignment | Fast ($O(\|E\|)$) | Requires global channel reservation; cannot route around arbitrary rectangular node obstacles dynamically | ❌ Rejected |
| **3D Directed A* Search** | A* search over 3D state space $(x, y, \vec{d})$ with directional cost penalties | Finds optimal routes balancing distance, bend counts, hairpin U-turns, and obstacle clearance | Higher open-list memory consumption ($O(\|V_{\text{grid}}\| \cdot 4)$) | ✅ **Chosen Approach** |

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 2.1: 3D State Tuple $(x, y, \vec{d})$
A grid routing node is represented as a 3D state tuple $s = (x, y, \vec{d})$, where $(x, y) \in \mathbb{R}^2$ represents grid vertex coordinates and $\vec{d} \in \{ \text{up}, \text{down}, \text{left}, \text{right} \}$ represents the current travel direction vector.

State tracking in 3D is essential to detect directional bends and $180^\circ$ hairpin U-turns during grid expansion.

---

### Step 2.2: Composite Step Cost Function $\mathbf{g}(s)$
The path cost $\mathbf{g}(s)$ from source stub to current state $s$ is computed as a composite multi-criteria cost vector:

$$\mathbf{g}(s) = \left\langle g_{\text{cross}}, g_{\text{hairpin}}, g_{\text{bend}}, g_{\text{dev}}, g_{\text{len}}, g_{\text{obs}} \right\rangle$$

Let us define each cost component incrementally when transitioning from state $s = (p, \vec{d})$ to neighbor $s' = (q, \vec{d}_{\text{move}})$ across segment $\mathbf{seg} = \overline{pq}$:

1. **Edge Crossings Cost ($g_{\text{cross}}$)**:
   $$g_{\text{cross}}(s') = g_{\text{cross}}(s) + \text{Crossings}(\mathbf{seg}, \text{Occupancy})$$
   Counts perpendicular intersections with previously committed edge routes.

2. **Hairpin U-Turn Cost ($g_{\text{hairpin}}$)**:
   $$g_{\text{hairpin}}(s') = g_{\text{hairpin}}(s) + \begin{cases} 1 & \text{if } \vec{d}_{\text{move}} = -\vec{d} \\ 0 & \text{otherwise} \end{cases}$$
   Penalizes $180^\circ$ reverse loops.

3. **Orthogonal Bends Cost ($g_{\text{bend}}$)**:
   $$g_{\text{bend}}(s') = g_{\text{bend}}(s) + \begin{cases} 1 & \text{if } \vec{d}_{\text{move}} \neq \vec{d} \\ 0 & \text{otherwise} \end{cases}$$
   Penalizes $90^\circ$ direction changes.

4. **Direction Deviation Cost ($g_{\text{dev}}$)**:
   $$g_{\text{dev}}(s') = g_{\text{dev}}(s) + \begin{cases} P_{\text{dir}} & \text{if exiting port side in non-outward direction} \\ 0 & \text{otherwise} \end{cases}$$

5. **Manhattan Distance Cost ($g_{\text{len}}$)**:
   $$g_{\text{len}}(s') = g_{\text{len}}(s) + \|\mathbf{seg}\|_1 = g_{\text{len}}(s) + (|x_q - x_p| + |y_q - y_p|)$$

6. **Near-Obstacle Penalty ($g_{\text{obs}}$)**:
   $$g_{\text{obs}}(s') = g_{\text{obs}}(s) + \begin{cases} P_{\text{obs}} & \text{if } \mathbf{seg} \text{ lies within buffer zone of a node} \\ 0 & \text{otherwise} \end{cases}$$

---

### Step 2.3: Admissible Manhattan Heuristic $h(s)$
The heuristic cost $h(s)$ estimates the remaining Manhattan distance from grid vertex $p = (x_p, y_p)$ to target stub $q = (x_q, y_q)$:

$$h(p, q) = |x_p - x_q| + |y_p - y_q|$$

**Proof of Admissibility**: Since the true shortest orthogonal grid distance between $p$ and $q$ can never be less than the L1 Manhattan distance $\|p - q\|_1$, we have $h(p, q) \le h^*(p, q)$ for all grid vertices. Thus, the A* search is guaranteed to find an optimal route.

---

### Step 2.4: SVG Arc Bridge Geometry Equation
When two edge routes cross perpendicularly at point $\mathbf{P}_{\text{cross}} = (x_c, y_c)$, the secondary edge renders an SVG circular arc bridge to visually jump over the primary edge:

$$\text{SVG Cmd} = \text{M } (x_c - r \cdot dx, y_c - r \cdot dy) \;\; \text{A } r \;\; r \;\; 0 \;\; 0 \;\; 0 \;\; (x_c + r \cdot dx, y_c + r \cdot dy)$$

where $r$ is the bridge radius (default $6\text{px}$) and $(dx, dy)$ is the unit direction vector along the edge.

---

## 3. Step-by-Step Computational Pseudocode

The following pseudocode details 3D A* grid route search (`searchOrthogonalRoute`):

```typescript
function searchOrthogonalRoute(
  edgeId: string,
  sourcePort: PortRef,
  targetPort: PortRef,
  grid: RoutingGrid,
  occupancy: OccupancyRecord[],
  config: LayoutConfig
): RoutedPath | null {
  const initialDir = sideToOutwardDir(sourcePort.side);
  const targetInwardDir = sideToInwardDir(targetPort.side);
  
  const startNode: AStarNode = {
    vId: vertexKey(sourcePort.stub),
    dir: initialDir,
    previousDir: null,
    gCost: { crossings: 0, hairpins: 0, bends: 0, length: config.portStubLength * 2 },
    fCost: { length: manhattanDist(sourcePort.stub, targetPort.stub) },
    parent: null,
  };

  const openHeap = new AStarMinHeap();
  openHeap.push(startNode);

  const gCosts = new Map<string, RouteCost>([[startNode.stateKey, startNode.gCost]]);
  const indexedOcc = new IndexedOccupancy(occupancy);

  while (openHeap.size > 0) {
    const current = openHeap.pop()!;

    // Check if target stub is reached
    if (current.vId === vertexKey(targetPort.stub)) {
      return reconstructAndSimplifyPath(current, sourcePort, targetPort, grid);
    }

    const currentPt = grid.vertices.get(current.vId)!;
    const neighbors = grid.adj.get(current.vId) ?? [];

    for (const neighbor of neighbors) {
      const nextPt = grid.vertices.get(neighbor.targetId)!;
      const seg = { a: currentPt, b: nextPt };
      const moveDir = getSegmentDirection(currentPt, nextPt);

      // 1. Hard Obstacle Check (Node bounding boxes)
      if (intersectsNodeInterior(seg, grid.nodeObstacles)) continue;

      // 2. Collinear Edge Occupancy & Crossing Check
      const occResult = indexedOcc.checkSegmentConflict(seg, edgeId);
      if (occResult.isCollinearOccupied) continue; // Reject collinear overlap

      // 3. Compute step penalties
      const isBend = moveDir !== current.dir;
      const isHairpin = OPPOSITE_DIR[current.dir] === moveDir;
      
      const newGCost: RouteCost = {
        crossings: current.gCost.crossings + occResult.stepCrossings,
        hairpins: current.gCost.hairpins + (isHairpin ? 1 : 0),
        bends: current.gCost.bends + (isBend ? 1 : 0),
        length: current.gCost.length + neighbor.edge.weight,
      };

      const newFCost: RouteCost = {
        ...newGCost,
        length: newGCost.length + manhattanDist(nextPt, targetPort.stub),
      };

      const nextKey = `${neighbor.targetId}:${moveDir}:${current.dir}`;
      const existingG = gCosts.get(nextKey);

      if (!existingG || compareRouteCost(newGCost, existingG) < 0) {
        gCosts.set(nextKey, newGCost);
        openHeap.push({
          vId: neighbor.targetId,
          dir: moveDir,
          previousDir: current.dir,
          gCost: newGCost,
          fCost: newFCost,
          parent: current,
        });
      }
    }
  }

  return null; // Route unresolvable
}
```

---

## 4. Visual ASCII Diagrams

### 3D Grid Routing & SVG Crossing Bridge Geometry

```
A* Orthogonal Grid Routing:                     SVG Arc Bridge Intersection Geometry:
          (x_p, y_p)                                          Primary Straight Edge
   Source Stub  ┌───────┐                                              │
        ●───────┤ Node  │                                              │
        │       └───────┘                                              │
        │ (Bend)                                          ─────────────┼─────────────> Secondary
        └───┐                                                    (Arc  │  Bridge)
            │ (Channel Lane)                                          ┌┴┐
            └───────────┐                                            /   \  (r = 6px)
                        │ (Bend)                                    └┬─┬┘
                        └───● Target Stub                            │ │
                         (x_q, y_q)                                  ▼
```

---

## 5. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/routeSearch.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L21-L774)
  - [`compareRouteCost`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L30-L50) — Lexicographic comparator for route costs.
  - [`IndexedOccupancy`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L330-L465) — Spatial interval tree indexing edge segments for fast collision queries.
  - [`searchOrthogonalRoute`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L467-L740) — Core 3D A* directed open-list grid search.
- [`src/engine/layout/custom/edgeRouter.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L105-L638)
  - [`routeAllEdges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L105-L638) — Multi-variant order routing loop with conflict rip-up and reroute passes.
- [`src/engine/layout/custom/svgPath.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L17-L184)
  - [`pointsToSvgPath`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L17-L30) — Converts orthogonal point polylines into SVG path strings (`M... L...`).
  - [`renderPathWithCrossingBridges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L60-L184) — Renders SVG path strings with circular arc bridges (`A r r 0 0 0...`) at crossing points.
