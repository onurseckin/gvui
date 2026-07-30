# Removal of Inline `minHeight` & Natural Node Card Content Fit Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove inline `minHeight` style from `NodeCard/index.tsx` and set `.node-card` to `height: auto`, allowing HTML node cards to shrink-wrap their content with 0px excess bottom space while passing tight bounds to Dagre layout.

---

## Task Breakdown

### Task 1: Remove Inline `minHeight` & Set `height: auto` in NodeCard

**Files:**

- Modify: `src/primitives/nodes/NodeCard/index.tsx`
- Modify: `src/primitives/nodes/NodeCard/NodeCard.css`

- [ ] **Step 1: In `NodeCard/index.tsx`, remove `minHeight: node.height` inline style**
  ```tsx
  // Before: style={{ width: `${node.width}px`, minHeight: `${node.height}px` }}
  // After:  style={{ width: `${node.width}px` }}
  ```
- [ ] **Step 2: In `NodeCard.css`, set `.node-card` to `height: auto; min-height: 0; padding: 10px; gap: 8px;`**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `fix: remove inline minHeight and enable natural content-fit card height`

---

### Task 2: Align Dagre Layout Bounding Box Math with Compact Rendered Height

**Files:**

- Modify: `src/engine/layout/dagreLayout.ts`

- [ ] **Step 1: Recalculate Dagre node height to match true compact DOM rendered height**
- [ ] **Step 2: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 3: Commit:** `fix: align Dagre layout node height with compact DOM content height`
