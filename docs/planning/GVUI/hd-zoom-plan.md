# HD Zoom & Anti-Blur Resolution Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate zoom blurriness completely so that text, cards, borders, and SVG lines render at 100% HD vector sharpness across all zoom levels (`0.1x` to `5.0x`).

**Architecture:** Use CSS `zoom` + viewport transformation matrix with SVG `viewBox` & `non-scaling-stroke` vector scaling so the browser re-evaluates layout & text glyph hinting natively at every zoom scale instead of bitmap stretching.

**Tech Stack:** React 19, TypeScript 7, CSS Zoom & ViewBox, Bun, Oxlint, Oxfmt.

---

## Task Breakdown

### Task 1: SVG Native ViewBox Vector Scaling & non-scaling-stroke

**Files:**
- Modify: `src/engine/GraphCanvas/index.tsx`
- Modify: `src/engine/GraphCanvas/GraphCanvas.css`
- Modify: `src/primitives/edges/GraphEdge/GraphEdge.css`

- [ ] **Step 1: Update SVG canvas to use native SVG `viewBox` coordinates**
- [ ] **Step 2: Add `vector-effect="non-scaling-stroke"` and `shape-rendering="geometricPrecision"` to all SVG paths and markers**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `fix: update SVG layer to native viewBox scale with geometricPrecision`

---

### Task 2: Native Text Vector Scaling for HTML Node Cards

**Files:**
- Modify: `src/engine/GraphCanvas/index.tsx`
- Modify: `src/engine/GraphCanvas/GraphCanvas.css`
- Modify: `src/primitives/nodes/NodeCard/NodeCard.css`

- [ ] **Step 1: Replace container CSS transform scaling with CSS `zoom` / dynamic font-smoothing matrix**
- [ ] **Step 2: Apply `-webkit-font-smoothing: subpixel-antialiased` and `text-rendering: geometricPrecision` across node cards**
- [ ] **Step 3: Test across all zoom levels (0.1x, 0.5x, 1.0x, 2.0x, 4.0x)**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `fix: implement native CSS zoom font hinting for HD node card typography`
