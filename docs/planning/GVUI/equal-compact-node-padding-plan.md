# Equal Compact Node Card Padding & Bottom Spacing Removal Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize node card padding to be 100% equal and compact (10px) on top, right, bottom, and left, eliminating extra bottom spacing.

---

## Task Breakdown

### Task 1: Tighten Dagre Layout Height Engine (`dagreLayout.ts`)

**Files:**

- Modify: `src/engine/layout/dagreLayout.ts`

- [ ] **Step 1: Recalculate base header height to 36px and section heights with tight 6px gap spacing**
- [ ] **Step 2: Add exact 20px vertical padding (10px top + 10px bottom) matching CSS `padding: 10px`**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `fix: calculate tight node height matching equal 10px padding`

---

### Task 2: Standardize NodeCard CSS Padding & Remove Extra Bottom Margin

**Files:**

- Modify: `src/primitives/nodes/NodeCard/NodeCard.css`

- [ ] **Step 1: Set `.node-card` to `padding: 10px; gap: 8px;`**
- [ ] **Step 2: Set `.node-card-header` to `margin: -10px -10px 0 -10px; padding: 8px 10px;`**
- [ ] **Step 3: Ensure bottom child elements have `margin-bottom: 0` so padding is strictly equal on all 4 sides**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `style: standardize node card padding to equal 10px on all sides`
