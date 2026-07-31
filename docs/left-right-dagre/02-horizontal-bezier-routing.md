# 02. Horizontal Cubic Bezier Edge Routing

[← Back to Master Index](../README.md)

This module documents horizontal **Cubic Bezier curve edge routing** and badge collision repulsion mechanics for Left-to-Right (LR) graph layouts.

---

## 1. Parametric Cubic Bezier Curve Math

Edge paths for Left-to-Right layout connect the right border anchor of the source node $P_0$ to the left border anchor of the target node $P_3$ using a parametric cubic Bezier curve $B(t)$ where $t \in [0, 1]$:

$$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t C_1 + 3(1-t) t^2 C_2 + t^3 P_3$$

### Component-Wise Parametric Equations

$$X(t) = (1-t)^3 X_0 + 3(1-t)^2 t X_{C1} + 3(1-t) t^2 X_{C2} + t^3 X_3$$

$$Y(t) = (1-t)^3 Y_0 + 3(1-t)^2 t Y_{C1} + 3(1-t) t^2 Y_{C2} + t^3 Y_3$$

### Anchor Point Definitions

- **Source Anchor Point ($P_0$)**: Right border center of source node $v_s$:
  $$P_0 = \left( X_s + W_s, \, Y_s + \frac{H_s}{2} \right)$$

- **Target Anchor Point ($P_3$)**: Left border center of target node $v_t$:
  $$P_3 = \left( X_t, \, Y_t + \frac{H_t}{2} \right)$$

### Control Point Offsets & Vector Mathematics

Given the horizontal rank distance $\Delta X = X_t - (X_s + W_s)$:

$$C_1 = \left( X_s + W_s + \frac{\Delta X}{2}, \, Y_s + \frac{H_s}{2} \right)$$

$$C_2 = \left( X_t - \frac{\Delta X}{2}, \, Y_t + \frac{H_t}{2} \right)$$

### Tangent Vector & Derivative Calculus

The first derivative vector $B'(t)$ represents the tangent vector along the curve:

$$B'(t) = 3(1-t)^2 (C_1 - P_0) + 6(1-t)t (C_2 - C_1) + 3t^2 (P_3 - C_2)$$

At the boundary endpoints ($t=0$ and $t=1$):
- $B'(0) = 3(C_1 - P_0) = \left( \frac{3 \Delta X}{2}, \, 0 \right)$ — Horizontally outward from source right border.
- $B'(1) = 3(P_3 - C_2) = \left( \frac{3 \Delta X}{2}, \, 0 \right)$ — Horizontally inward into target left border.

---

## 2. ASCII Control Point & S-Curve Routing Schematics

```
                          HORIZONTALLY ROUTED CUBIC BEZIER S-CURVE
                          
      Source Node (v_s)                                                   Target Node (v_t)
     ┌──────────────────┐                                                ┌──────────────────┐
     │                  │                                                │                  │
     │  (X_s, Y_s)      │                                                │  (X_t, Y_t)      │
     │                  │P_0 (Right Center)                              │                  │
     │                  ├───●───────────────┐                            │                  │
     │  Width: W_s      │   │  Tangent      │                            │  Width: W_t      │
     │  Height: H_s     │   ▼               │                            │  Height: H_t     │
     └──────────────────┘  C_1 (Control 1)  │    Edge Label Badge        │                  │
                                            └───────────[M]──────────────┼───● (Left Center)│
                                                        │                │   P_3            │
                                                        ▼                └──────────────────┘
                                                       C_2 (Control 2)
```

---

## 3. Edge Label Midpoint Coordinates & Badge Repulsion

### Analytical Parametric Midpoint ($t = 0.5$)

Evaluating $B(t)$ at $t = 0.5$:

$$X(0.5) = \frac{1}{8} X_0 + \frac{3}{8} X_{C1} + \frac{3}{8} X_{C2} + \frac{1}{8} X_3 = \frac{X_s + W_s + X_t}{2}$$

$$Y(0.5) = \frac{1}{8} Y_0 + \frac{3}{8} Y_{C1} + \frac{3}{8} Y_{C2} + \frac{1}{8} Y_3 = \frac{\left(Y_s + \frac{H_s}{2}\right) + \left(Y_t + \frac{H_t}{2}\right)}{2}$$

### Polyline Arc-Length Midpoint (`findTotalPathMidpoint`)

For polylines discretized from Dagre control points, total arc length $L$ is computed as:

$$L = \sum_{i=0}^{n-1} \sqrt{(x_{i+1} - x_i)^2 + (y_{i+1} - y_i)^2}$$

The midpoint point $(x_{\text{mid}}, y_{\text{mid}})$ is positioned at distance $s = \frac{L}{2}$ along the path segments.

### Edge Label Badge Repulsion Algorithm

When multiple parallel edges render overlapping badges within a bounding box of size $W_{\text{badge}} \times H_{\text{badge}} = 84\text{px} \times 34\text{px}$, a pairwise repulsion displacement pass adjusts label coordinates:

$$\Delta x = |x_2 - x_1|, \quad \Delta y = |y_2 - y_1|$$

If $\Delta x < 84$ and $\Delta y < 34$:

$$\delta_x = \frac{84 - \Delta x + 4}{2}, \quad \delta_y = \frac{34 - \Delta y + 4}{2}$$

If $\Delta x \le \Delta y$, separate horizontally ($x_1 \leftarrow x_1 - \delta_x$, $x_2 \leftarrow x_2 + \delta_x$); otherwise separate vertically ($y_1 \leftarrow y_1 - \delta_y$, $y_2 \leftarrow y_2 + \delta_y$).

```
                         BADGE REPULSION DISPLACEMENT
                         
          Before Repulsion                             After Repulsion
          ┌─────────────┐                              ┌─────────────┐
          │  Badge 1    │                              │  Badge 1    │
          │  ┌──────────┼──┐                           └─────────────┘
          └──┼──────────┘  │                                 ▲ shiftY
             │   Badge 2   │                                 ▼ shiftY
             └─────────────┘                           ┌─────────────┐
                                                       │  Badge 2    │
                                                       └─────────────┘
```

---

## 4. Codebase Reference Map & Snippets

- [`nodeDimensions.ts` (L178-L187)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L178-L187) — `buildSvgPath` builds path strings from control points.
- [`nodeDimensions.ts` (L192-L228)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L192-L228) — `clipPointToNodeRect` clips edge terminals to node border boundaries.
- [`nodeDimensions.ts` (L389-L446)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L389-L446) — `findTotalPathMidpoint` computes arc-length midpoint coordinates $(x, y)$ and normal vector.
- [`nodeDimensions.ts` (L575-L601)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L575-L601) — Badge repulsion displacement pass.

```typescript
// Code Snippet from nodeDimensions.ts (L389-L408)
export function findTotalPathMidpoint(points: Point2D[]): PathMidpointResult {
  if (points.length === 0) return { x: 0, y: 0, normal: { x: 0, y: 1 } };
  if (points.length === 1) return { x: points[0].x, y: points[0].y, normal: { x: 0, y: 1 } };

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
    segmentLengths.push(len);
    totalLength += len;
  }
  // Target arc-length distance s = L / 2
  const targetDist = totalLength / 2;
  ...
}
```

```typescript
// Code Snippet from nodeDimensions.ts (L575-L601): Badge Repulsion Pass
const BADGE_WIDTH = 84;
const BADGE_HEIGHT = 34;
for (let i = 0; i < positionedEdges.length; i++) {
  const e1 = positionedEdges[i];
  if (e1.labelX === undefined || e1.labelY === undefined) continue;
  for (let j = i + 1; j < positionedEdges.length; j++) {
    const e2 = positionedEdges[j];
    if (e2.labelX === undefined || e2.labelY === undefined) continue;

    const dx = Math.abs(e2.labelX - e1.labelX);
    const dy = Math.abs(e2.labelY - e1.labelY);

    if (dx < BADGE_WIDTH && dy < BADGE_HEIGHT) {
      const shiftX = (BADGE_WIDTH - dx + 4) / 2;
      const shiftY = (BADGE_HEIGHT - dy + 4) / 2;
      if (dx <= dy) {
        e1.labelX -= shiftX;
        e2.labelX += shiftX;
      } else {
        e1.labelY -= shiftY;
        e2.labelY += shiftY;
      }
    }
  }
}
```
