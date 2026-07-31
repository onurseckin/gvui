# Graph Layout Collision Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate hidden badge/edge collisions and missing routes, improve feedback routing and expansion efficiency, and move interactive graph computation off the browser main thread.

**Architecture:** Preserve the existing custom ranked layout, orthogonal router, and deterministic scoring. Correct the validation contract first, then make port/routing/search changes against those failures, prune ineffective expansion states, and finally integrate the existing Worker boundary into both testing surfaces without a synchronous timeout fallback.

**Tech Stack:** TypeScript, Bun tests, React 19, Vite, existing custom layout engine.

---

### Task 1: Lock Collision Truth and Uniform Port Distribution

**Files:**

- Modify: `src/engine/layout/custom/portDistribution.test.ts`
- Modify: `src/engine/layout/custom/portDistribution.ts`
- Modify: `src/engine/layout/custom/layoutValidator.test.ts`
- Modify: `src/engine/layout/custom/layoutValidator.ts`

- [ ] **Step 1: Replace the two-port expectation and add three/four-port tests**

The assertions must use one formula:

```ts
expect(twoPorts.map((p) => p.point.x)).toEqual([75, 225]);
expect(threePorts.map((p) => p.point.x)).toEqual([50, 150, 250]);
expect(fourPorts.map((p) => p.point.x)).toEqual([37.5, 112.5, 187.5, 262.5]);
```

Use a 300px side and `portEndpointPadding: 0`.

- [ ] **Step 2: Run the port tests and verify RED**

Run:

```bash
bun test src/engine/layout/custom/portDistribution.test.ts
```

Expected: the new two/three/four attachment coordinate assertions fail because the implementation still uses `(index + 1) / (count + 1)`.

- [ ] **Step 3: Implement equal-bin centers**

For every non-empty attachment group:

```ts
const usable = Math.max(0, sideLength - 2 * padding);
const offset = padding + usable * ((index + 0.5) / attachmentCount);
```

Keep existing deterministic attachment sorting.

- [ ] **Step 4: Add a sibling badge/edge validator test**

Create two edges that share a node. Place the first edge’s badge across the second edge and assert:

```ts
expect(result.metrics.badgeUnrelatedEdgeOverlaps).toBe(1);
expect(result.diagnostics).toContainEqual(
  expect.objectContaining({
    code: "BADGE_UNRELATED_EDGE_OVERLAP",
    ids: expect.arrayContaining(["e-badge", "e-sibling"]),
  }),
);
```

- [ ] **Step 5: Run the validator test and verify RED**

Run:

```bash
bun test src/engine/layout/custom/layoutValidator.test.ts
```

Expected: the sibling collision is ignored.

- [ ] **Step 6: Remove the shared-node exclusion**

In the badge-versus-edge loop, skip only `edge.edgeId === badge.edgeId`. Do not inspect endpoint equality.

- [ ] **Step 7: Run focused GREEN tests**

```bash
bun test src/engine/layout/custom/portDistribution.test.ts
bun test src/engine/layout/custom/layoutValidator.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/engine/layout/custom/portDistribution.ts src/engine/layout/custom/portDistribution.test.ts src/engine/layout/custom/layoutValidator.ts src/engine/layout/custom/layoutValidator.test.ts
git commit -m "fix: expose graph label collisions and spread ports"
```

---

### Task 2: Make Missing Routes Impossible to Report as Success

**Files:**

- Modify: `src/engine/layout/custom/types.ts`
- Modify: `src/engine/layout/custom/layoutValidator.ts`
- Modify: `src/engine/layout/custom/layoutValidator.test.ts`
- Modify: `src/engine/layout/custom/stateEvaluator.ts`
- Modify: `src/engine/layout/custom/edgeRouter.ts`
- Modify: `src/engine/layout/custom/optimizeLayout.ts`
- Modify: `src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`
- Modify: `src/engine/layout/custom/customLayoutValidatorStrict.test.ts`

- [ ] **Step 1: Add expected-edge validator failures**

Extend the validator input with:

```ts
expectedEdges?: NormalizedEdge[];
```

Write tests where `expectedEdges` contains `e1` and `e2`, but rendered routes contain only `e1`.

Assert:

```ts
expect(result.isValid).toBe(false);
expect(result.metrics.unresolvedRouteCount).toBe(1);
expect(result.diagnostics).toContainEqual(
  expect.objectContaining({ code: "MISSING_ROUTE", ids: ["e2"] }),
);
```

- [ ] **Step 2: Add missing-badge status coverage**

When an expected edge has a label or `isCycle`, but no badge exists, assert:

```ts
expect(result.metrics.unresolvedBadgeCount).toBe(1);
expect(result.diagnostics).toContainEqual(
  expect.objectContaining({ code: "MISSING_BADGE", severity: "warning", ids: ["e2"] }),
);
```

- [ ] **Step 3: Verify validator RED**

```bash
bun test src/engine/layout/custom/layoutValidator.test.ts
```

Expected: expected-edge fields and unresolved metrics do not exist.

- [ ] **Step 4: Add unresolved metrics**

Add to `LayoutMetrics` and `LayoutScore`:

```ts
unresolvedRouteCount: number;
unresolvedBadgeCount: number;
```

Place unresolved routes immediately after `hardErrorCount` in score priority. Place unresolved badges before badge collision fields.

- [ ] **Step 5: Validate the expected set**

Build maps for rendered routes and badges. Emit one canonical diagnostic per missing expected route and per missing required badge.

- [ ] **Step 6: Pass expected edges at every engine validation boundary**

`stateEvaluator.ts` and each `edgeRouter.ts` trial validation must pass:

```ts
expectedEdges: normalizedGraph.edges;
```

- [ ] **Step 7: Prefer complete route sets**

Every router variant/permutation score must include unresolved route count. Do not let a partial route map win because it has fewer crossings or less length.

- [ ] **Step 8: Set honest public status**

Use:

```ts
if (!validation.isValid) status = "invalid_hard_failure";
else if (validation.metrics.unresolvedBadgeCount > 0 || hasAestheticDefect(validation)) {
  status = "unresolved_soft_conflicts";
} else status = "success";
```

- [ ] **Step 9: Strengthen scenario acceptance**

For all 20 scenarios:

```ts
expect(result.edges).toHaveLength(normalizedEdges.length);
expect(result.validation.metrics.unresolvedRouteCount).toBe(0);
expect(result.validation.metrics.unresolvedBadgeCount).toBe(0);
```

Specifically assert scenario #13 contains `e-N4-N1-3` and scenario #20 contains `e-ORDER-DB-8` and `e-ORDER-CACHE-9`.

- [ ] **Step 10: Verify RED for #13/#20, then GREEN after routing correction**

```bash
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
```

Do not weaken route-count assertions. If routing remains incomplete, continue within this task until every expected route is present.

- [ ] **Step 11: Commit**

```bash
git add src/engine/layout/custom
git commit -m "fix: require complete graph layout results"
```

---

### Task 3: Route Feedback Edges and Badges Through Distinct Corridors

**Files:**

- Modify: `src/engine/layout/custom/portCandidates.ts`
- Modify: `src/engine/layout/custom/portCandidates.test.ts`
- Modify: `src/engine/layout/custom/neighborhoodSearch.ts`
- Modify: `src/engine/layout/custom/neighborhoodSearch.test.ts`
- Modify: `src/engine/layout/custom/stateEvaluator.ts`
- Modify: `src/engine/layout/custom/edgeRouter.ts`
- Modify: `src/engine/layout/custom/badgePlacement.ts`
- Modify: `src/engine/layout/custom/badgePlacement.test.ts`
- Modify: `src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`

- [ ] **Step 1: Add role-based feedback neighborhood test**

Use a feedback edge ID without `cycle` or `loop`:

```ts
{ id: "e-C-A-2", source: "C", target: "A", isCycle: true }
```

Assert feedback alternatives are generated from role metadata.

- [ ] **Step 2: Verify feedback test RED**

```bash
bun test src/engine/layout/custom/neighborhoodSearch.test.ts
```

Expected: the current edge-ID substring test finds no feedback edge.

- [ ] **Step 3: Pass classified role metadata**

Add role/edge metadata to `StateEvaluationResult`. `generateNeighborhoodStates` must use `role === "feedback" || edge.isCycle`.

For feedback defects, generate this deterministic candidate order:

```ts
[
  { srcSide: "left", tgtSide: "left" },
  { srcSide: "right", tgtSide: "right" },
  { srcSide: "left", tgtSide: "top" },
  { srcSide: "right", tgtSide: "top" },
];
```

Skip the current pair and deduplicate states.

- [ ] **Step 4: Target every edge named by a diagnostic**

For badge/edge conflicts, add both diagnostic IDs to `problemEdgeIds`. Allocate at least one alternative to each defect edge before generating a second alternative for any edge.

- [ ] **Step 5: Pass explicit port orders**

Extend `EdgeRouterOptions`:

```ts
portOrders?: Record<string, string[]>;
```

Pass `state.portOrders` from `stateEvaluator.ts` into `routeAllEdges`, then into `distributePorts`.

- [ ] **Step 6: Add hard badge-candidate collision tests**

Create a candidate whose rect intersects another route segment. Assert it is absent from returned candidates.

Add a case where every ordinary direct candidate is blocked and assert an explicit spacing request is returned instead of an overlapping fallback placement.

- [ ] **Step 7: Verify badge test RED**

```bash
bun test src/engine/layout/custom/badgePlacement.test.ts
```

Expected: the intersecting candidate currently survives with a score penalty or fallback.

- [ ] **Step 8: Reject intersecting badge candidates**

In `tryAddCandidate`, return immediately when the rect intersects any non-owner segment. Delete the unchecked default fallback candidate.

- [ ] **Step 9: Add independent scenario collision assertions**

For scenarios #8, #9, #12, #14, #19, and #20, iterate every badge against every non-owner route segment with `segmentIntersectsRectInterior`.

Assert the collected pair set is empty. Do not rely only on `validation.metrics`.

- [ ] **Step 10: Add #11 outer-corridor assertion**

Assert the feedback route:

- exists;
- targets Node A on `left` or another proven outer side;
- has no segment intersecting Node B’s expanded rectangle;
- has at most one structural hairpin.

- [ ] **Step 11: Run focused suites**

```bash
bun test src/engine/layout/custom/portCandidates.test.ts
bun test src/engine/layout/custom/neighborhoodSearch.test.ts
bun test src/engine/layout/custom/badgePlacement.test.ts
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
```

- [ ] **Step 12: Commit**

```bash
git add src/engine/layout/custom
git commit -m "fix: route feedback and labels through distinct corridors"
```

---

### Task 4: Remove Ineffective Expansion and Bound Cyclic Work

**Files:**

- Modify: `src/engine/layout/custom/labelLanePlanner.ts`
- Modify: `src/engine/layout/custom/labelLanePlanner.test.ts`
- Modify: `src/engine/layout/custom/stateEvaluator.ts`
- Modify: `src/engine/layout/custom/layoutOptimizerState.ts`
- Modify: `src/engine/layout/custom/layoutOptimizerState.test.ts`
- Modify: `src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`

- [ ] **Step 1: Add ineffective-demand tests**

Construct a node layout where every rank contains one node. Assert a global `node-gap` or `lane-x` demand is not actionable and is not appended.

Construct a rank with two nodes and assert the same demand remains actionable.

- [ ] **Step 2: Verify RED**

```bash
bun test src/engine/layout/custom/labelLanePlanner.test.ts
```

Expected: the planner currently emits a global node-gap demand for every wide badge.

- [ ] **Step 3: Generate only conflict-derived demands**

Use route orientation, badge geometry, and actual intersections. Do not use `rect.width > 0` as a vertical-track test.

Only emit:

- node/lane X demand when at least two nodes/tracks can separate horizontally;
- rank/lane Y demand when at least two ranks/tracks can separate vertically;
- a demand whose minimum exceeds the effective current value.

- [ ] **Step 4: Suppress no-op state evaluation**

Before enqueuing a demand state, verify it changes an effective spacing override and can change at least one coordinate/lane. Deduplicate by canonical demand key.

- [ ] **Step 5: Add cyclic work assertions**

For #11 and #13:

```ts
expect(result.edges).toHaveLength(inputEdges.length);
expect(scenario11.optimizationStats?.totalEvaluatedStates).toBeLessThanOrEqual(12);
expect(scenario13.optimizationStats?.totalEvaluatedStates).toBeLessThanOrEqual(8);
expect(sumExpandedStates(scenario11)).toBeLessThanOrEqual(12_000);
expect(sumExpandedStates(scenario13)).toBeLessThanOrEqual(10_000);
```

These bounds include more than 20% headroom over the corrected target behavior while still failing the confirmed duplicate-work path. Keep wall-clock timing out of normal geometry tests.

- [ ] **Step 6: Optimize only the measured remaining hot path**

If feedback A* still dominates:

- avoid recreating comparator state strings on every heap comparison;
- precompute a scalar/numeric tuple and deterministic numeric sequence;
- cache only searches with identical grid, ports, occupancy signature, and role.

Do not increase `maxAStarStatesPerRoute`.

- [ ] **Step 7: Run performance regressions**

```bash
bun test src/engine/layout/custom/layoutOptimizerState.test.ts
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
```

Repeat #11 and #13 ten times with the diagnostic script. Record median and maximum; do not make wall time a normal geometry assertion.

- [ ] **Step 8: Commit**

```bash
git add src/engine/layout/custom
git commit -m "perf: prune ineffective graph expansion states"
```

---

### Task 5: Move Testing Surfaces to the Hard Worker Boundary

**Files:**

- Modify: `src/engine/layout/custom/customLayoutWorkerClient.ts`
- Modify: `src/engine/layout/custom/customLayoutWorkerClient.test.ts`
- Modify: `src/features/GraphTesting/hooks/useCustomLayoutWorker.ts`
- Modify: `src/features/GraphTesting/components/GraphTestingPage.tsx`
- Modify: `src/features/GraphTesting/components/GraphTestingModal.tsx`
- Modify: `src/features/GraphTesting/components/CustomLayoutMetrics.tsx`
- Modify: `src/features/GraphTesting/components/LayoutErrorBoundary.tsx`

- [ ] **Step 1: Add injectable Worker/watchdog tests**

Introduce narrow dependencies:

```ts
interface LayoutWorkerRuntime {
  createWorker(): WorkerLike;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}
```

With a non-responsive fake Worker, assert timeout:

```ts
expect(worker.terminateCalls).toBe(1);
expect(syncOptimizeCalls).toBe(0);
await expect(promise).rejects.toMatchObject({ name: "LayoutTimeoutError" });
```

- [ ] **Step 2: Verify worker test RED**

```bash
bun test src/engine/layout/custom/customLayoutWorkerClient.test.ts
```

Expected: the current timeout runs synchronous `optimizeLayout`.

- [ ] **Step 3: Remove browser synchronous fallback**

On Worker timeout, construction error, `error`, or `messageerror`:

- terminate once;
- clear timer/listeners;
- reject with a typed error;
- never call `optimizeLayout` when `window.Worker` exists.

Keep direct synchronous fallback only when no browser Worker environment exists.

- [ ] **Step 4: Preserve the last valid hook result**

When a new request starts, keep `result`. Set `isCalculating: true`. On timeout/error, preserve `result`, set `error`, and expose `recalculate`.

Ignore completions from an aborted/superseded request.

- [ ] **Step 5: Replace both synchronous `useMemo` calls**

`GraphTestingPage.tsx` and `GraphTestingModal.tsx` must use:

```ts
const {
  result: layoutResult,
  isCalculating,
  error,
  recalculate,
} = useCustomLayoutWorker({ nodes: normalizedNodes, edges: normalizedEdges });
```

Render a loading state before the first result. Render the last result plus warning during later recalculation failure.

- [ ] **Step 6: Report honest status**

`CustomLayoutMetrics` must display the actual `stats.stopReason`, unresolved route count, and unresolved badge count. It must not map every stop to `Pass Limit`.

- [ ] **Step 7: Wrap testing surfaces**

Use `LayoutErrorBoundary` around the testing visualization. Retry resets the rendering subtree and triggers an explicit recalculation; it must not loop automatically.

- [ ] **Step 8: Run automated gates**

```bash
bun test
bun run typecheck
bun run lint
bun run build:local
```

- [ ] **Step 9: Perform browser regression loop**

At `http://localhost:5173/?page=testing`, inspect:

```text
#8 → #9 → #11 → #12 → #13 → #14 → #19 → #20
```

Verify:

- no missing edge or badge;
- no badge intersects another edge;
- feedback corridors avoid unrelated nodes;
- #11/#13 selection does not freeze the controls;
- timeout/retry does not crash the tab.

- [ ] **Step 10: Commit**

```bash
git add src/engine/layout/custom src/features/GraphTesting
git commit -m "feat: render graph testing layouts through worker"
```

---

### Task 6: Final Review Loop

**Files:**

- Modify only files required by proven review findings

- [ ] **Step 1: Run spec-compliance review**

Compare every acceptance requirement in `docs/superpowers/specs/2026-07-31-graph-layout-collision-hardening-design.md` with code and tests.

- [ ] **Step 2: Fix every missing or extra behavior test-first**

For each finding, add or strengthen the failing test, run RED, implement the smallest fix, then run GREEN.

- [ ] **Step 3: Run code-quality review**

Review deterministic ordering, hot-loop allocations, cleanup paths, state staleness, scenario-specific branches, and assertion weakening.

- [ ] **Step 4: Repeat reviews until no critical or important finding remains**

Do not stop after the first review response.

- [ ] **Step 5: Run final verification**

```bash
bun test
bun run typecheck
bun run lint
bun run format:check
bun run build:local
```

Record exact pass/fail counts and distinguish pre-existing format failures from changed-file failures.
