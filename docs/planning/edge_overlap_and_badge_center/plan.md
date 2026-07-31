# Edge Overlap Disambiguation & 50% Badge Centering Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Orthogonal Channel Nudging in `shortestPathEngine.ts` to separate overlapping horizontal and vertical edge line segments into distinct parallel lanes (10px apart), and ensure edge information badges are centered at exact 50% arc-length.

**Architecture:**

1. Post-process calculated edge polyline paths by grouping horizontal and vertical segments across all edges.
2. Detect overlapping collinear segments sharing the same coordinate axis line ($x = C$ or $y = C$).
3. Shift overlapping segments laterally into distinct parallel lanes ($\pm 10\text{px}$, $\pm 20\text{px}$) while maintaining 90° orthogonal connections.
4. Recalculate 50% total path arc-length ($s = L / 2$) on nudged polyline paths for exact badge positioning.

**Tech Stack:** TypeScript, Bun Test, Vite, React

---

### Task 1: Add Unit Tests for Segment Overlap Nudging & Badge Centering

**Files:**

- Modify: `src/features/GraphTesting/algorithm/tests/shortestPathEngine.spec.ts`

- [ ] **Step 1: Write failing unit test for overlapping segment separation**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Commit unit test additions**

---

### Task 2: Implement Orthogonal Channel Nudging & 50% Arc-Length Centering in `shortestPathEngine.ts`

**Files:**

- Modify: `src/features/GraphTesting/algorithm/shortestPathEngine.ts`

- [ ] **Step 1: Implement `nudgeOverlappingSegments` function**

- [ ] **Step 2: Integrate `nudgeOverlappingSegments` into `computeShortestPathLayout`**

- [ ] **Step 3: Run unit tests to verify all 13+ tests pass cleanly**

- [ ] **Step 4: Run repository quality gates**

- [ ] **Step 5: Commit implementation**
