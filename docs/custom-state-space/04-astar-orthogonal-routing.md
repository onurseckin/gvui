# 04. Grid A* Orthogonal Edge Routing

[← Back to Master Index](../README.md)

This module documents grid-based 3D A* orthogonal pathfinding, turn penalties, node clearance margin envelopes, and parametric SVG perpendicular crossing bridges.

---

## 1. Grid A* Pathfinder Mechanics

Edges are routed as orthogonal polyline paths consisting strictly of horizontal and vertical segments.

```
       Source Port (p_start)
              │
              ├───┐   <-- 90° Turn (Penalty P_bend = 40)
              │   │
              │   └───┐   <-- Perpendicular Crossing Bridge (Arc r = 6px)
              │       │
              ▼       ▼
       Target Port (p_target)
```

---

## 2. A* Directed Search Space & Cost Formulation

The search space is defined over directed 3D state tuple vertices $(x, y, \vec{d}) \in \mathbb{Z}^2 \times \{\text{up}, \text{down}, \text{left}, \text{right}\}$.

### Total Estimated Cost Function $f(p, \vec{d})$

$$f(p, \vec{d}) = g(p, \vec{d}) + h(p, q)$$

Where $g(p, \vec{d})$ is the accumulated route cost vector and $h(p, q)$ is the admissible heuristic estimate to target port $q = (x_q, y_q)$.

### Accumulated Path Cost Vector $g(p, \vec{d})$

$$g(p, \vec{d}) = g(p_{\text{prev}}, \vec{d}_{\text{prev}}) + \mathbf{C}_{\text{step}}(p, p_{\text{prev}}, \vec{d}, \vec{d}_{\text{prev}})$$

$$\mathbf{C}_{\text{step}} = \left\langle \text{Cost}_{\text{cross}}, \text{Cost}_{\text{hairpin}}, \text{Cost}_{\text{bend}}, \text{Cost}_{\text{dev}}, \text{Cost}_{\text{length}}, \text{Cost}_{\text{obstacle}} \right\rangle$$

Component cost derivations:
1. **Grid Step Length** ($\text{Cost}_{\text{length}}$): Step distance $\text{Dist}(p, p_{\text{prev}})$ (default grid step = 8px).
2. **Orthogonal Turn Penalty** ($\text{Cost}_{\text{bend}}$): $P_{\text{bend}} = 40$ added whenever path direction turns $90^\circ$ ($\vec{d} \neq \vec{d}_{\text{prev}}$ and $\vec{d} \neq -\vec{d}_{\text{prev}}$).
3. **Obstacle Clearance Violation** ($\text{Cost}_{\text{obstacle}}$): $P_{\text{obstacle}} = 500$ added if grid point $p$ violates a node card boundary clearance margin.
4. **Collinear Segment Occupancy**: Penalty $P_{\text{occupancy}}$ added if step overlaps an existing reserved route segment.

### Admissible Manhattan Heuristic $h(p, q)$

$$h(p, q) = |x_p - x_q| + |y_p - y_q|$$

#### Admissibility & Monotonicity Proof

For any grid graph step $(p, p')$, Manhattan distance satisfies the triangle inequality:

$$h(p, q) \le \text{Dist}(p, p') + h(p', q)$$

Because $g(p, p') \ge \text{Dist}(p, p')$, we have $h(p, q) \le g^*(p, q)$. Thus $h(p, q)$ never overestimates the true minimum orthogonal distance to $q$, guaranteeing $A^*$ returns the optimal route.

---

## 3. Perpendicular Edge Crossing Bridges

When two orthogonal edge paths intersect perpendicularly in 2D space:

```
        Vertical Edge
             │
             │
      ───────┼───────  Horizontal Edge
             │
             │
```

The engine renders an SVG arc bridge to visually distinguish non-connecting crossings:

$$\text{BridgePath}(p_{\text{cross}}) = M \ (x-6, y) \ A \ 6 \ 6 \ 0 \ 0 \ 0 \ (x+6, y)$$

Where $p_{\text{cross}} = (x, y)$ is the geometric point of intersection and arc radius $r = 6\text{px}$.

```
                 SVG Arc Bridge Geometry (r = 6px)
                        Arc Radius r = 6px
                            ┌───────┐
                            │   ▲   │
                            │  / \  │
       ─────────────────────┴─/───\─┴───────────────────── Horizontal Path
                       (x-6, y)   (x+6, y)
```

---

## 4. Step-by-Step Developer Walkthrough

1. **Construct Spatial Grid**: Call `buildRoutingGrid()` to construct 2D spatial clearance grid around node bounding boxes with 8px step resolution.
2. **Initialize A* Priority Queue**: Instantiate open set queue initialized with source port $p_{\text{start}}$ and outward direction vector $\vec{d}_{\text{outward}}$.
3. **Expand Open States**: Iteratively pop lowest $f(p, \vec{d})$ state from priority queue using `compareRouteCost()`.
4. **Evaluate Neighbor Step**: For each adjacent grid step, compute $g(p', \vec{d}')$ by adding step length, turn penalty $P_{\text{bend}}$, and obstacle margin penalty $P_{\text{obstacle}}$.
5. **Path Reconstruction & Simplification**: Upon reaching target port $q$, trace parent pointers to reconstruct coordinate sequence and invoke `simplifyOrthogonalPath()` to remove redundant collinear points.
6. **Generate SVG Path**: Pass simplified point array to `pointsToSvgPath()` in `svgPath.ts` to synthesize SVG path strings with arc bridges for perpendicular crossings.

---

## 5. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/routeSearch.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L21-L150)
  - [`RouteCost`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L21-L28) — 6-element route cost vector interface
  - [`compareRouteCost`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L30-L50) — Route cost lexicographical comparator
  - [`searchOrthogonalRoute`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L120-L400) — Grid A* pathfinder algorithm
- [`src/engine/layout/custom/edgeRouter.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L1-L250)
  - [`routeAllEdges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L1-L250) — Multi-edge sequential router & occupancy manager
- [`src/engine/layout/custom/svgPath.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L1-L180)
  - [`pointsToSvgPath`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L1-L180) — SVG path rendering & bridge arc generator

```typescript
// Code Snippet from routeSearch.ts (L21-L50)
export interface RouteCost {
  crossings: number;
  hairpins: number;
  bends: number;
  directionDeviation: number;
  length: number;
  nearObstaclePenalty: number;
}

export function compareRouteCost(a: RouteCost, b: RouteCost, epsilon = 0.001): number {
  if (Math.abs(a.crossings - b.crossings) > epsilon) {
    return a.crossings - b.crossings;
  }
  if (Math.abs(a.hairpins - b.hairpins) > epsilon) {
    return a.hairpins - b.hairpins;
  }
  if (Math.abs(a.bends - b.bends) > epsilon) {
    return a.bends - b.bends;
  }
  if (Math.abs(a.directionDeviation - b.directionDeviation) > epsilon) {
    return a.directionDeviation - b.directionDeviation;
  }
  if (Math.abs(a.length - b.length) > epsilon) {
    return a.length - b.length;
  }
  if (Math.abs(a.nearObstaclePenalty - b.nearObstaclePenalty) > epsilon) {
    return a.nearObstaclePenalty - b.nearObstaclePenalty;
  }
  return 0;
}
```
