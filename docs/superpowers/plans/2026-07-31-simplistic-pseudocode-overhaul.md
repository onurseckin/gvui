# Simplistic Language-Agnostic Pseudocode Overhaul Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul all 19 documentation files across `docs/` to replace all complex TypeScript code dumps in pseudocode sections with **simplistic, human-readable, language-agnostic pseudocode**.

**Pseudocode Standard:**
- Use clean, pseudo-language keywords (`ALGORITHM`, `INPUT`, `OUTPUT`, `FOR EACH`, `IF`, `WHILE`, `RETURN`, `<-` or `=`).
- NO TypeScript types (`Map<string, number>`, `Node[]`, `Array<{...}>`), NO TypeScript helper methods (`.filter((x): x is number => ...)`, `.reduce()`, `.map()`), NO language-specific boilerplate.
- Simple, high-level, clear step-by-step logic that any developer (regardless of language background) can read and simulate in their mind instantly.

---

## Plan Tasks

### Task 1: Overhaul Pseudocode in `docs/custom-state-space/` (6 Files)

**Files:**
- Modify: `docs/custom-state-space/01-state-space-search.md`
- Modify: `docs/custom-state-space/02-sugiyama-layering-cycle-breaking.md`
- Modify: `docs/custom-state-space/03-barycentric-crossing-minimization.md`
- Modify: `docs/custom-state-space/04-astar-orthogonal-routing.md`
- Modify: `docs/custom-state-space/05-dynamic-spacing-demands.md`
- Modify: `docs/custom-state-space/06-codebase-reference-map.md`

- [ ] Replace all TypeScript code blocks with simplistic pseudocode (using `ALGORITHM`, `INPUT`, `OUTPUT`, `FOR EACH`, etc.).

---

### Task 2: Overhaul Pseudocode in `docs/top-down-dagre/` (4 Files)

**Files:**
- Modify: `docs/top-down-dagre/01-network-simplex-layering.md`
- Modify: `docs/top-down-dagre/02-order-heuristics.md`
- Modify: `docs/top-down-dagre/03-brandes-kopf-coordinate-assignment.md`
- Modify: `docs/top-down-dagre/04-codebase-reference-map.md`

- [ ] Replace all TypeScript code blocks (e.g. `calculateEdgeSlack`, `computeCutValue`, `executeSimplexPivot`, `calculateNodeMedian`, `countPairCrossings`, `alignBlockPointers`, etc.) with simplistic pseudocode.

---

### Task 3: Overhaul Pseudocode in `docs/left-right-dagre/` (3 Files)

**Files:**
- Modify: `docs/left-right-dagre/01-coordinate-space-transformation.md`
- Modify: `docs/left-right-dagre/02-horizontal-bezier-routing.md`
- Modify: `docs/left-right-dagre/03-codebase-reference-map.md`

- [ ] Replace all code blocks in pseudocode sections with simplistic pseudocode.

---

### Task 4: Overhaul Pseudocode in `docs/force-directed/` (3 Files)

**Files:**
- Modify: `docs/force-directed/01-coulomb-hooke-vector-math.md`
- Modify: `docs/force-directed/02-simulated-annealing-cooling.md`
- Modify: `docs/force-directed/03-codebase-reference-map.md`

- [ ] Replace all TypeScript helper blocks (`computeEquilibriumDistance`, `computeDisplacementAndDistance`, `computeCoulombRepulsion`, `computeHookeAttraction`, `computeCenterGravity`, `computeNetForceOnNode`, `clampDisplacementAndUpdatePosition`, `computeExponentialTemperature`, `runForceDirectedSimulation`) with simplistic pseudocode.

---

### Task 5: Overhaul Pseudocode in `docs/concentric-radial/` (3 Files)

**Files:**
- Modify: `docs/concentric-radial/01-polar-coordinate-transformation.md`
- Modify: `docs/concentric-radial/02-hub-spoke-bezier-routing.md`
- Modify: `docs/concentric-radial/03-codebase-reference-map.md`

- [ ] Ensure all sub-steps use simplistic, language-agnostic pseudocode.

---

### Task 6: Audit & Verify Across All 19 Files

- [ ] Deploy 20 parallel auditor subagents to verify zero TypeScript boilerplate remains in pseudocode sections.
- [ ] Run `bun run typecheck && bun run lint && bun run build:local`.
- [ ] Push to `main`.
