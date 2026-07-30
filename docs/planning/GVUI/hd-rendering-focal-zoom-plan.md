# Complete HD Rendering, Mouse Focal Zoom & Edge Label Sync Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all zoom focal point, edge label desync, and text blurriness bugs so that zooming zeroes in precisely on mouse cursor position, edge labels remain 100% locked to edge paths, and typography renders at 100% crisp HD resolution.

**Architecture:**

1. **Mouse Focal Zoom Math**: Precise graph-space coordinate conversion `(mouseX - panX) / zoom` so zooming scales centered relative to the mouse cursor position.
2. **Edge Label Sync Architecture**: Move edge badge overlays out of SVG `<foreignObject>` (which causes WebKit double-zoom bugs) and render them directly as native HTML badges or native SVG `<rect>`+`<text>` elements perfectly locked to `(labelX, labelY)`.
3. **Pure HD Vector & Text Rendering**: Standard 2D CSS transform matrix `translate(x, y) scale(zoom)` with `transform-origin: 0 0` without texture-flattening 3D properties or CSS `zoom` bugs.

**Tech Stack:** React 19, TypeScript 7, SVG + HTML Canvas Engine, Bun, Oxlint, Oxfmt.

---

## Task Breakdown

### Task 1: Mouse Cursor Focal Point Zoom Math & Unified Transform Matrix

**Files:**

- Modify: `src/engine/GraphCanvas/usePanZoom.ts`
- Modify: `src/engine/GraphCanvas/index.tsx`

- [ ] **Step 1: Implement graph-space mouse coordinate translation in `usePanZoom.ts`**

```typescript
const pointInGraphX = (mouseX - currentPan.x) / currentZoom;
const pointInGraphY = (mouseY - currentPan.y) / currentZoom;
const newPanX = mouseX - pointInGraphX * newZoom;
const newPanY = mouseY - pointInGraphY * newZoom;
```

- [ ] **Step 2: Apply unified `transform: translate(${panX}px, ${panY}px) scale(${zoomLevel})` with `transform-origin: 0 0` on `.graph-transform-stage`**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `fix: implement precise mouse focal point zoom math`

---

### Task 2: Refactor Edge Labels to Prevent WebKit ForeignObject Desync

**Files:**

- Modify: `src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx`
- Modify: `src/primitives/edges/GraphEdge/index.tsx`
- Modify: `src/primitives/edges/GraphEdge/GraphEdge.css`

- [ ] **Step 1: Replace SVG `<foreignObject>` in `EdgeBadgeOverlay.tsx` with native SVG `<g transform="translate(x, y)">` containing `<rect>` badge background and `<text>` label**
- [ ] **Step 2: Ensure edge badges scale and position 100% synchronously with edge paths at all zoom levels**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `fix: refactor edge badge overlay to SVG rect text elements to prevent zoom desync`

---

### Task 3: 100% Native Crisp Typography & Full Codebase Quality Verification

**Files:**

- Modify: `src/engine/GraphCanvas/GraphCanvas.css`
- Modify: `src/primitives/nodes/NodeCard/NodeCard.css`

- [ ] **Step 1: Clean up CSS transform properties, remove `zoom:`, and apply subpixel antialiasing and crisp rendering directives across all node cards**
- [ ] **Step 2: Test all zoom scales (10% to 500%) for zero blur, zero edge desync, and precise mouse focal zoom**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 4: Commit:** `fix: enforce native HD crisp typography and zero-blur canvas rendering`
