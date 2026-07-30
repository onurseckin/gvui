# Collapse State Persistence, Dead-Centered Modals, & 8-Direction (45°) Vector Edges Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist node collapse states in localStorage per file, enforce 100% dead-centered modal dialog positioning (`top: 0; left: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center;`), fix edge start/arrival node border touching, and snap edge vector paths to 8-direction (45° angle) clean aesthetic routing with collision avoidance.

---

## Task Breakdown

### Task 1: Node Collapse State LocalStorage Persistence

**Files:**
- Modify: `src/utils/fileStorage.ts`
- Modify: `src/App.tsx`
- Modify: `src/engine/GraphCanvas/index.tsx`

- [ ] **Step 1: Add `collapsedNodeIds?: string[]` to `SavedFileViewport` in `fileStorage.ts`**
- [ ] **Step 2: Restore `collapsedNodeIds` from `localStorage` in `App.tsx` when loading graph file**
- [ ] **Step 3: Save `Array.from(collapsedNodeIds)` to `localStorage` when user collapses/expands nodes in `GraphCanvas`**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 5: Commit:** `feat: persist per-file node collapse states in local storage`

---

### Task 2: 100% Dead-Centered Modal Dialog Positioning (`CommandPalette` & `DeveloperSettings`)

**Files:**
- Modify: `src/components/CommandPalette/CommandPalette.css`
- Modify: `src/components/DeveloperSettings/DeveloperSettings.css`

- [ ] **Step 1: Set `.command-palette-backdrop` and `.developer-settings-backdrop` to `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; z-index: 9999;`**
- [ ] **Step 2: Remove any fixed container offsets or subpixel positioning on `.command-palette-dialog` and `.developer-settings-dialog`**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 4: Commit:** `fix: enforce 100% dead-centered modal dialog positioning`

---

### Task 3: 8-Direction (45° Angle Snap) Edge Routing & Precise Border Touching

**Files:**
- Modify: `src/engine/layout/dagreLayout.ts`
- Modify: `src/primitives/edges/GraphEdge/computeEdgePath.ts`

- [ ] **Step 1: In `dagreLayout.ts`, snap edge path segments to 8 cardinal/intercardinal directions (45° angle increments)**
- [ ] **Step 2: Ensure start point $P_0$ touches source node border and arrival point $P_n$ touches target node border with 0px gap**
- [ ] **Step 3: Apply 2D repulsion pass so 8-direction edge badges never collide**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `fix: snap edge vector paths to 8-direction 45-degree angles and eliminate node border gaps`
