# Accurate Canvas-Relative Fit View Calculation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `handleFitView` calculation by querying live `.canvas-wrapper` container dimensions (`clientWidth`, `clientHeight`) instead of hardcoded `window.innerWidth * 0.7`, ensuring 100% perfect geometric graph centering.

---

## Task Breakdown

### Task 1: Refactor `handleFitView` to Use Container-Relative Viewport Dimensions

**Files:**
- Modify: `src/components/Controls/CanvasToolbar.tsx`

- [ ] **Step 1: In `CanvasToolbar.tsx`, query `.canvas-wrapper` element for `clientWidth` and `clientHeight`**
- [ ] **Step 2: Calculate `fitScale`, `centerX`, `centerY`, `panX`, and `panY` relative to true canvas container bounds**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 4: Commit:** `fix: calculate fit view relative to actual canvas container dimensions`
