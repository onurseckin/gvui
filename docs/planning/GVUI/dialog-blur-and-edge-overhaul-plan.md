# Dialog Crisp 50% Sizing & Edge Layout Overhaul Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate blurry modal rendering in `DeveloperSettings` and `CommandPalette`, set dynamic 50% screen viewport dialog sizing, center edge badges at the exact 50% total path arc length, and implement badge collision avoidance to prevent badge overlaps.

---

## Task Breakdown

### Task 1: Fix Dialog Blur & Dynamic 50% Viewport Sizing (`CommandPalette` & `DeveloperSettings`)

**Files:**

- Modify: `src/components/CommandPalette/CommandPalette.css`
- Modify: `src/components/DeveloperSettings/DeveloperSettings.css`

- [ ] **Step 1: Replace subpixel `translate(-50%, -50%)` centering with flexbox centering on fixed portal wrapper**
  ```css
  .command-palette-backdrop,
  .developer-settings-backdrop {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    inset: 0;
  }
  ```
- [ ] **Step 2: Set dynamic 50% screen viewport sizing (`width: 50vw; min-width: 520px; max-width: 900px; height: 60vh; max-height: 700px;`)**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `fix: eliminate dialog rendering blur and set dynamic 50% screen viewport sizing`

---

### Task 2: Overhaul Edge Path Midpoints & Badge Collision Avoidance

**Files:**

- Modify: `src/engine/layout/dagreLayout.ts`
- Modify: `src/primitives/edges/GraphEdge/GraphEdge.css`

- [x] **Step 1: Compute total arc-length midpoint $s = L / 2$ along full edge polyline for 100% centered edge description badges**
- [x] **Step 2: Increase Dagre layout spacing (`nodesep: 80`, `ranksep: 90`) for edge breathing room**
- [x] **Step 3: Implement 2D edge badge collision avoidance pass to offset overlapping badges**
- [x] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [x] **Step 5: Commit:** `fix: center edge badges at total path midpoint and prevent badge collision overlaps`
