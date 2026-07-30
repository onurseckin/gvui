# Edge Path Precision & Solid Badge Cutout Overlay Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate edge start/end gaps at node boundaries, position edge badges strictly along the midpoint of straight segments (never on corners), and enforce solid opaque background cutouts on cycle edge badges to prevent dashed lines from bleeding through text.

---

## Task Breakdown

### Task 1: Edge Path Connection Precision & Segment Midpoint Label Placement

**Files:**
- Modify: `src/engine/layout/dagreLayout.ts`

- [ ] **Step 1: In `dagreLayout.ts`, compute exact node boundary clip points for edge start/end points to eliminate gaps**
- [ ] **Step 2: Compute `(labelX, labelY)` at the midpoint of the longest straight edge segment (avoiding corner vertices)**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `fix: clip edge paths to node boundaries and position labels on straight segment midpoints`

---

### Task 2: Solid Opaque Cutout Badges & Clean Cycle Edge Styling

**Files:**
- Modify: `src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx`
- Modify: `src/primitives/edges/GraphEdge/GraphEdge.css`

- [ ] **Step 1: Set solid opaque background (`fill: #18181b`) and solid border on all edge badge rects**
- [ ] **Step 2: Ensure cycle edge badges (`isCycle`) use solid opaque `#18181b` fill with `#d97706` amber stroke so dashed lines never cut through description text**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 4: Commit:** `style: enforce solid opaque badge cutout background to prevent dashed line bleed`
