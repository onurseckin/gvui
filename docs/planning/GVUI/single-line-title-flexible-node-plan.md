# Single-Line Title & Completely Flexible Content-Fit Node Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all title word-wrapping (titles fit 100% on a single line with `white-space: nowrap`) and remove all hardcoded width/height constraints so node dimensions expand/contract 100% flexibly based on exact single-line content width.

---

## Task Breakdown

### Task 1: Refactor `dagreLayout.ts` Single-Line Width & Height Engine

**Files:**

- Modify: `src/engine/layout/dagreLayout.ts`

- [ ] **Step 1: Compute single-line title width generously (`node.name.length * 11 + 90`) to guarantee single-line title width**
- [ ] **Step 2: Calculate max content width across single-line title, badges, tools, model, and context rows with zero artificial min/max caps**
- [ ] **Step 3: Calculate node height dynamically based on header + badge rows + tool rows + details content without hardcoded 120px minimum**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 5: Commit:** `fix: calculate single-line title width and fully flexible content bounds in Dagre layout`

---

### Task 2: Update NodeCard CSS for Single-Line Titles & Flexible Auto-Fitting

**Files:**

- Modify: `src/primitives/nodes/NodeCard/NodeCard.css`

- [ ] **Step 1: Set `.node-card-title` to `white-space: nowrap; word-break: normal; flex-shrink: 0;` to enforce single-line title**
- [ ] **Step 2: Ensure `.node-card` uses `width: 100%; height: 100%; box-sizing: border-box; overflow: visible;`**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 4: Commit:** `style: enforce single-line titles without wrapping or clipping on node cards`
