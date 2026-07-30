# Dynamic Content-Fit Node Sizing & Zero Truncation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every node card expands naturally to fit 100% of its title, badges, description, tools, and metadata content with zero text truncation (`ellipsis`), zero word cutting, and zero artificial empty padding.

---

## Task Breakdown

### Task 1: Update Dagre Layout Bounding Box Calculation Engine

**Files:**
- Modify: `src/engine/layout/dagreLayout.ts`

- [ ] **Step 1: Compute dynamic node width based on title string length, description length, badges, and metadata**
  ```typescript
  const titleLen = node.name.length;
  const descLen = node.description?.length ?? 0;
  const computedWidth = Math.max(160, Math.max(titleLen * 8.5 + 50, descLen * 6.5 + 30));
  ```
- [ ] **Step 2: Compute dynamic node height based on active elements (header, badges, tools, metadata rows)**
- [ ] **Step 3: Pass exact content-fit `width` and `height` to Dagre graph nodes**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 5: Commit:** `feat: calculate dynamic content-fit node dimensions in Dagre layout engine`

---

### Task 2: Update NodeCard CSS to Remove Truncation & Enable Natural Auto-Expansion

**Files:**
- Modify: `src/primitives/nodes/NodeCard/NodeCard.css`
- Modify: `src/primitives/nodes/NodeCard/NodeCardHeader.tsx`

- [ ] **Step 1: Remove `text-overflow: ellipsis`, `overflow: hidden`, and `white-space: nowrap` from node card titles and descriptions**
- [ ] **Step 2: Set `.node-card` to `width: 100%; height: auto; font-size: 13px;` so card fills Dagre calculated content dimensions naturally**
- [ ] **Step 3: Ensure badges, tool chips, and metadata rows wrap cleanly without overflowing or squeezing**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `style: remove text truncation and enable natural auto-expanding node card layout`
