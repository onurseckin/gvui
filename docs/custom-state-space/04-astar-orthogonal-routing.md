# 04. Grid A* Orthogonal Edge Routing

[← Back to Master Index](../README.md)

This module documents grid-based A* orthogonal pathfinding, turn penalties, node clearance envelopes, and perpendicular crossing bridges.

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

## 2. A* Cost Functions $f(p) = g(p) + h(p, q)$

For grid point $p = (x_1, y_1)$ and target port $q = (x_2, y_2)$:

### Accumulated Path Cost $g(p)$

$$g(p) = g(\text{prev}) + \text{Dist}(p, \text{prev}) + P_{\text{bend}} \cdot \text{IsBend}(p, \text{prev}) + P_{\text{obstacle}} \cdot \text{ObstacleDist}(p)$$

Where:
- $\text{Dist}(p, \text{prev})$: Grid step length (default = 8px grid step).
- $P_{\text{bend}} = 40$: Penalty added whenever the path direction turns $90^\circ$.
- $P_{\text{obstacle}} = 500$: Penalty added if $p$ violates a node card boundary clearance margin.
- $\text{IsBend}(p, \text{prev}) = 1$ if $(\vec{v}_{\text{curr}} \cdot \vec{v}_{\text{prev}} = 0)$, else 0.

### Admissible Heuristic Estimate $h(p, q)$

Manhattan distance heuristic:

$$h(p, q) = |x_1 - x_2| + |y_1 - y_2|$$

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

---

## 4. Codebase Reference Map

- [edgeRouter.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L1-L120) — `routeAllEdges`
- [routeSearch.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L1-L150) — `searchOrthogonalRoute`, `compareRouteCost`
- [svgPath.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L1-L180) — `pointsToSvgPath`, bridge arc generation

```typescript
// Code Snippet from routeSearch.ts
export function searchOrthogonalRoute(
  startPort: PortRef,
  endPort: PortRef,
  grid: RoutingGrid,
  config: CustomLayoutConfig,
): RouteSearchResult | null {
  // A* grid search algorithm with RouteCost lexicographical priority...
}
```
