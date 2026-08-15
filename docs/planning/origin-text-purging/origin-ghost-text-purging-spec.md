# Module 2 Specification: Origin (0,0) Ghost Text & Top-Left Canvas Banner Purging

**Document ID**: `GVUI-SPEC-2026-08-15-ORIGIN-PURGE`  
**Status**: `PROPOSED / APPROVED ARCHITECTURE`  
**Target Path**: `gvui/src/engine/GraphCanvas/`, `gvui/src/primitives/edges/GraphEdge/`, `gvui/src/AppContent.tsx`  
**Author**: Dedicated Planning Director  
**Date**: 2026-08-15

---

## 1. Executive Overview & Problem Statement

In the GVUI graph engine, users and automated visual test suites have occasionally observed two distinct visual artifacts corrupting the graph viewport:

1. **Origin (0,0) Ghost Text Badges**: Edge label badges (such as `"spawn"`, `"data"`, or step numbers) appearing clustered at the top-left coordinate $(0, 0)$ of the SVG canvas, floating above nodes and backgrounds.
2. **Unwanted Top-Left Floating Title / Sentence Banners**: Redundant top-left canvas banners displaying raw execution sentences (e.g. `"Execution Trajectory: 2026-08-15..."` or unformatted prompt summaries) anchored at $(0, 0)$ or $(12\text{px}, 12\text{px})$, colliding with viewport navigation, zoom controls, and canvas scrubbers.

This specification details the structural root causes across React components and layout adapters, establishes strict invariant guards against unpositioned coordinates, and designs an exhaustive purging strategy.

---

## 2. Deep Architectural Investigation & Root Cause Identification

### 2.1 Ghost Badge Origin Root Cause in `GraphBadgeLayer.tsx` and `GraphEdge/index.tsx`

In `GraphBadgeLayer.tsx` (lines 33–47):

```tsx
// Flawed Guard Condition:
const hasPlacement =
  edge.badgeRect !== undefined ||
  (edge.labelX !== undefined && edge.labelY !== undefined) ||
  (edge.points !== undefined && edge.points.length > 0);

if (!hasPlacement) {
  return null;
}

const placement = {
  x: edge.labelX ?? 0,
  y: edge.labelY ?? 0,
  badgeRect: edge.badgeRect,
  anchorPoint: edge.anchorPoint,
  leaderPoints: edge.leaderPoints,
};
```

#### The Failure Scenario:

1. When an edge is routed, `edge.points` contains waypoint coordinates (e.g. $[(120, 80), (340, 80)]$), but the layout engine has not yet computed or assigned `edge.badgeRect` or `edge.labelX / edge.labelY` (or the badge sector was skipped during layout calculation).
2. The condition `hasPlacement` evaluates to `true` solely because `edge.points.length > 0`.
3. However, `placement.x` and `placement.y` evaluate to `edge.labelX ?? 0` $\rightarrow 0$ and `edge.labelY ?? 0` $\rightarrow 0$.
4. `<EdgeBadgeOverlay>` receives $(x: 0, y: 0, \text{badgeRect}: \text{undefined})$ and renders:
   ```html
   <g transform="translate(0, 0)" class="edge-badge-group ...">
     <rect x="-27" y="-13" width="54" height="26" ... />
     <foreignObject ...>...</foreignObject>
   </g>
   ```
5. The badge is rendered directly at $(0, 0)$ in the canvas transform stage, resulting in the notorious "Origin Ghost Text" artifact.

A parallel flaw exists in `GraphEdge/index.tsx`:

```tsx
let badgeX = edge.labelX ?? 0;
let badgeY = edge.labelY ?? 0;
// If edge.points exist but labelX is undefined, badgeX remains 0
```

---

### 2.2 Unwanted Canvas Top-Left Title/Sentence Banners

In earlier iterations and certain toolbar configurations, floating canvas title banners were positioned absolutely inside `.graph-canvas-viewport` with styles like:

```css
.canvas-title-banner {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 40;
}
```

This causes major usability and visual audit defects:

- Overlaps with node cards positioned near $(0, 0)$ when pan offset is small.
- Clashes with the unified top header (`<header className="top-navbar-full">` in `AppContent.tsx`) which already renders the active filename, upload button, and search palette.
- Collides with the floating `<StepScrubber>` centered at the top.

---

## 3. Comprehensive Solution Architecture

```
+----------------------------------------------------------------------------------------------------+
|                               ORIGIN GHOST TEXT & BANNER ELIMINATION ARCHITECTURE                  |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ Invariant 1: Multi-Tier Coordinate Validation & Polyline Midpoint Fallback ]                    |
|    1. If `edge.badgeRect` is valid (width > 0, height > 0):                                        |
|         Use (badgeRect.x + badgeRect.width / 2, badgeRect.y + badgeRect.height / 2)                |
|    2. Else if `edge.labelX` and `edge.labelY` are defined:                                         |
|         Use (edge.labelX, edge.labelY)                                                             |
|    3. Else if `edge.points` length >= 2:                                                           |
|         Calculate parametric polyline midpoint P_mid along the path length L / 2                    |
|    4. Else (Unresolvable coordinate):                                                              |
|         STRICTLY SUPPRESS RENDERING (return null) - ZERO (0,0) FALLBACK TOLERANCE                  |
|                                                                                                    |
|  [ Invariant 2: Explicit (0,0) Coincident Guard ]                                                  |
|    If computed (x == 0 && y == 0) and no valid non-zero badgeRect is provided:                     |
|    Mark placement as unpositioned and discard badge element.                                       |
|                                                                                                    |
|  [ Invariant 3: Single Source of Truth for Canvas Titles ]                                         |
|    - All graph titles live exclusively in `<header className="top-navbar-full">`                   |
|    - Scrubber displays compact step controls without floating sentence overlays                   |
|    - 0% absolute floating title banners inside `.graph-canvas-viewport`                            |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Mathematical Midpoint Algorithm for Polyline Edges

When `labelX` and `labelY` are absent but a polyline $\mathcal{P} = \langle p_0, p_1, \dots, p_n \rangle$ exists, we compute the exact arc-length midpoint:

1. **Segment Lengths**:
   $$L_i = \|p_{i+1} - p_i\| = \sqrt{(x_{i+1} - x_i)^2 + (y_{i+1} - y_i)^2}$$
2. **Total Polyline Length**:
   $$L_{\text{total}} = \sum_{i=0}^{n-1} L_i$$
3. **Half-Length Target**:
   $$D_{\text{target}} = \frac{L_{\text{total}}}{2}$$
4. **Midpoint Segment Identification**:
   Find index $k$ such that $\sum_{i=0}^{k-1} L_i \le D_{\text{target}} < \sum_{i=0}^k L_i$.
5. **Parametric Interpolation**:
   $$t = \frac{D_{\text{target}} - \sum_{i=0}^{k-1} L_i}{L_k}$$
   $$\mathbf{P}_{\text{mid}} = (1 - t) p_k + t p_{k+1}$$

```typescript
export function computePolylineMidpoint(points: readonly Point[]): Point | null {
  if (!points || points.length < 2) return null;
  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  let totalLength = 0;
  const segLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return points[0];

  const target = totalLength / 2;
  let accumulated = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (accumulated + segLen >= target) {
      const t = segLen > 0 ? (target - accumulated) / segLen : 0;
      return {
        x: points[i].x + t * (points[i + 1].x - points[i].x),
        y: points[i].y + t * (points[i + 1].y - points[i].y),
      };
    }
    accumulated += segLen;
  }

  return points[points.length - 1];
}
```

---

## 5. Concrete Code Modification Blueprint

### 5.1 `GraphBadgeLayer.tsx` Refactoring

```typescript
// Refactored placement resolution in GraphBadgeLayer.tsx
export function resolveSafeBadgePlacement(edge: PositionedEdge): {
  x: number;
  y: number;
  badgeRect?: Rect;
  anchorPoint?: Point;
  leaderPoints?: Point[];
} | null {
  // Case 1: Pre-computed layout bounding box
  if (edge.badgeRect && edge.badgeRect.width > 0 && edge.badgeRect.height > 0) {
    return {
      x: edge.badgeRect.x + edge.badgeRect.width / 2,
      y: edge.badgeRect.y + edge.badgeRect.height / 2,
      badgeRect: edge.badgeRect,
      anchorPoint: edge.anchorPoint,
      leaderPoints: edge.leaderPoints,
    };
  }

  // Case 2: Explicit label coordinates (must not be unassigned 0,0 without explicit reason)
  if (
    typeof edge.labelX === "number" &&
    typeof edge.labelY === "number" &&
    (edge.labelX !== 0 || edge.labelY !== 0)
  ) {
    return {
      x: edge.labelX,
      y: edge.labelY,
      anchorPoint: edge.anchorPoint,
      leaderPoints: edge.leaderPoints,
    };
  }

  // Case 3: Polyline midpoint calculation
  if (edge.points && edge.points.length >= 2) {
    const mid = computePolylineMidpoint(edge.points);
    if (mid && (mid.x !== 0 || mid.y !== 0)) {
      return {
        x: mid.x,
        y: mid.y,
        anchorPoint: edge.anchorPoint,
        leaderPoints: edge.leaderPoints,
      };
    }
  }

  // Strict Invariant: If no valid non-zero coordinate can be found, return null to suppress ghost text
  return null;
}
```

### 5.2 Top-Left Canvas Banner Purge in `GraphCanvas.css` & `AppContent.tsx`

1. **Verify No Floating Banner in Viewport**:
   Audit `GraphCanvas.tsx` to guarantee zero child elements with `.canvas-title-banner` or `.graph-canvas-header`.
2. **Top Navbar Header Integration**:
   Confirm that all graph identification is rendered cleanly in `AppContent.tsx`:
   ```tsx
   <span className="navbar-file-title">
     <IconFileText size={14} />
     <span>{currentFile || fileIdFromRoute}</span>
   </span>
   ```
3. **Step Scrubber Cleanliness**:
   In `StepScrubber.tsx`, display only the scrubber pill buttons and playback controls; eliminate long descriptive sentences that overflow into the canvas.

---

## 6. Verification & Automated Test Matrix

| Test ID          | Target Component      | Scenario                                                       | Expected Outcome                                                      |
| :--------------- | :-------------------- | :------------------------------------------------------------- | :-------------------------------------------------------------------- |
| `TEST-GHOST-01`  | `GraphBadgeLayer.tsx` | Edge with `points` but `labelX=undefined, labelY=undefined`    | Badge is rendered at polyline midpoint, NOT at $(0, 0)$.              |
| `TEST-GHOST-02`  | `GraphBadgeLayer.tsx` | Edge with no `points`, no `labelX`, no `badgeRect`             | Badge element is suppressed (`null`), 0 DOM nodes created.            |
| `TEST-GHOST-03`  | `GraphBadgeLayer.tsx` | Edge with `labelX=0, labelY=0, badgeRect=undefined, points=[]` | Badge is suppressed, 0 origin ghost elements rendered.                |
| `TEST-BANNER-01` | `GraphCanvas.css`     | Inspect `.graph-canvas-viewport` DOM tree                      | 0 `.canvas-title-banner` elements present in viewport.                |
| `TEST-BANNER-02` | `AppContent.tsx`      | Viewport resizing across 375px, 768px, 1280px                  | Title remains inside top navbar without wrapping or canvas intrusion. |

---
