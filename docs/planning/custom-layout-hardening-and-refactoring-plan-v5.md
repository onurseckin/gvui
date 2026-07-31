# Custom Layout Engine Hardening & Legacy Refactoring Plan (V5)

## Overview & Objectives

This plan addresses three key architectural and visual enhancements in the custom directed graph layout and orthogonal routing engine:

1. **Legacy File & Naming Refactoring**:
   - Disambiguate legacy `dagreLayout.ts` by renaming it to `nodeDimensions.ts`.
   - Remove lingering Dagre nomenclature from production adapter paths to clarify that the codebase uses a **100% custom, dependency-free layout engine**.

2. **Port Detachment & Border Alignment Fixes (Scenario #19 & Application Canvas)**:
   - Synchronize calculated node height estimations with rendered DOM card bounding boxes.
   - Fix port attachment points so edge departure and arrival coordinates touch node boundaries with **zero visual gap or internal overlap**.
   - Align SVG path start/end points with marker arrowhead offsets (`refX`/`refY`).

3. **Badge Squeezing & Badge-vs-Node Collision Resolution (Scenario #20 & Dense Graphs)**:
   - Extend `planLabelLaneDemands` in `labelLanePlanner.ts` to detect badge-vs-node overlaps in addition to badge-vs-badge overlaps.
   - Generate exact `lane-x` (node gap) spacing demands (`minimum = badge.width + 2 * badgeClearance`) when a badge needs to squeeze between nodes on a rank.
   - Allow `layoutOptimizerState.ts` to expand `nodeGap` for specific ranks so wide badges (such as `"Verifies Permission"`) fit cleanly between nodes without overlapping.

---

## Detailed Task Breakdown

### Task 1: Legacy File Disambiguation & Refactoring
- **Files**:
  - `src/engine/layout/dagreLayout.ts` $\rightarrow$ rename to `src/engine/layout/nodeDimensions.ts`
  - `src/engine/layout/dagreLayout.test.ts` $\rightarrow$ rename to `src/engine/layout/nodeDimensions.test.ts`
  - `src/engine/layout/customLayoutAdapter.ts` (update imports)
  - `src/engine/layout/layoutDispatcher.ts` (update imports)
- **Steps**:
  - Extract node dimension estimation (`calculateNodeDimensions`) into `nodeDimensions.ts`.
  - Replace imports of `dagreLayout` across `layoutDispatcher.ts` and `customLayoutAdapter.ts`.
  - Verify that tests pass with `bun test src/engine/layout/nodeDimensions.test.ts`.

### Task 2: Port Border Alignment & Height Synchronization
- **Files**:
  - `src/engine/layout/custom/portDistribution.ts`
  - `src/engine/layout/customLayoutAdapter.ts`
  - `src/primitives/nodes/NodeCard/index.tsx`
  - `src/features/GraphTesting/components/GraphTestingPage.tsx`
- **Steps**:
  - Audit `<NodeCard>` and `.testing-node-card` CSS bounding boxes against calculated node dimensions.
  - Update `calculateNodeDimensions` to include padding and border box metrics so `node.height` matches actual rendered DOM height.
  - In `customLayoutAdapter.ts` and `GraphTestingPage.tsx`, ensure SVG path start and end points clip precisely to node boundary rectangles.

### Task 3: Badge-vs-Node Overlap Detection & Rank Spacing Expansion
- **Files**:
  - `src/engine/layout/custom/labelLanePlanner.ts`
  - `src/engine/layout/custom/labelLanePlanner.test.ts`
  - `src/engine/layout/custom/badgePlacement.ts`
  - `src/engine/layout/custom/badgePlacement.test.ts`
  - `src/engine/layout/custom/layoutOptimizerState.ts`
- **Steps**:
  - Add badge-vs-node collision inspection to `planLabelLaneDemands` in `labelLanePlanner.ts`.
  - When a badge overlaps a node on rank $r$, calculate required minimum node gap:
    $$\text{minimum} = \text{badge.width} + 2 \times \text{badgeClearance} + \text{nodePadding}$$
  - Emit a `lane-x` spacing demand targeting rank $r$.
  - In `layoutOptimizerState.ts`, apply the `lane-x` demand to `SpacingOverrides`, causing the optimizer to re-calculate node positions with the expanded node gap.
  - Verify Scenario #20: badge `"Verifies Permission"` squeezes between `Auth Service` and `User Service` with 0 node overlaps.

---

## Verification & Acceptance Gates

1. **Unit & Integration Tests**:
   - `bun test src/engine/layout/custom/labelLanePlanner.test.ts`
   - `bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`
   - `bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts`
2. **Quality Gates**:
   - `bun run typecheck` (0 TypeScript errors)
   - `bun run lint` (0 oxlint warnings/errors)
