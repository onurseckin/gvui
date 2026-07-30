# Modal Layout, Edge Collision, & Node Collapse System Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix CommandPalette and DeveloperSettings modal flexbox layouts, eliminate parallel edge badge collisions via 2D repulsion math, ensure collapsed node headers remain 100% visible and expandable, and reset collapsed node states on Fit/Reset button clicks.

---

## Task Breakdown

### Task 1: CommandPalette & DeveloperSettings Flexbox Modal Layout Fix

**Files:**

- Modify: `src/components/CommandPalette/CommandPalette.css`
- Modify: `src/components/CommandPalette/index.tsx`
- Modify: `src/components/DeveloperSettings/DeveloperSettings.css`

- [ ] **Step 1: In `CommandPalette.css`, set `.command-palette-results` to `flex: 1; min-height: 0; overflow-y: auto;`**
- [ ] **Step 2: Pin `.command-palette-footer` to bottom with `margin-top: auto; border-top: 1px solid #27272a;`**
- [ ] **Step 3: Remove all transform and backdrop-filter rules from `<Dialog.Popup>` element in `CommandPalette.css` and `DeveloperSettings.css`**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 5: Commit:** `fix: pin modal footer to bottom and eliminate subpixel popup blur`

---

### Task 2: Parallel Edge Curved Offset & 2D Badge Repulsion Math

**Files:**

- Modify: `src/engine/layout/dagreLayout.ts`
- Modify: `src/primitives/edges/GraphEdge/computeEdgePath.ts`

- [ ] **Step 1: Identify multi-edges / parallel edges between node pairs `(src, tgt)` in `dagreLayout.ts`**
- [ ] **Step 2: Calculate curved paths for multi-edges and push parallel edge midpoints apart**
- [ ] **Step 3: Run iterative 2D badge repulsion pass (offsetting overlapping badge rects by normal vectors)**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 5: Commit:** `fix: add parallel edge curvature and 2D badge repulsion collision avoidance`

---

### Task 3: Collapsed Node Header Visibility & Fit/Reset Accordion Reset

**Files:**

- Modify: `src/engine/GraphCanvas/index.tsx`
- Modify: `src/state/useGraphStore.ts`
- Modify: `src/components/Controls/CanvasToolbar.tsx`

- [ ] **Step 1: Ensure collapsed nodes are NOT added to `hiddenNodeIds` (only downstream descendant children are hidden)**
- [ ] **Step 2: In `useGraphStore.ts`, update `resetViewport()` to clear `collapsedNodeIds` (`new Set()`)**
- [ ] **Step 3: In `CanvasToolbar.tsx` `handleFitView()`, clear `collapsedNodeIds` (`new Set()`)**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `fix: preserve collapsed node header visibility and reset collapse states on Fit/Reset`
