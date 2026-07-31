# Custom Directed Graph Aesthetic Optimizer V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing dependency-free TypeScript layout engine so every avoidable crossing and every ordinary-edge badge leader is removed before bend count, route length, side balance, or graph area are optimized.

**Architecture:** Keep the existing top-to-bottom layered engine, four-sided ports, sparse orthogonal routing grid, hard validator, and badge solver. Add a lexicographic aesthetic objective, badge-aware spacing demands, stable projected coordinate assignment, angular port ordering, crossing-first route search, and a bounded global improvement loop that continues after the first hard-valid result.

**Tech Stack:** TypeScript 7, Bun test runner, React 19 testing page, SVG orthogonal paths, no new runtime layout dependency.

---

## Start Here: Orchestrator and Agent Groups

One persistent orchestrator owns the complete run. Workers must not decide their own merge order, edit files outside their ownership, or run several tasks from different groups in one agent.

| Group                     | Persistent owner                    | Sequential tasks                 | Exclusive writable files                                                                                                                                                                       | Owned tests                                                      |
| ------------------------- | ----------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `O0-orchestrator`         | One orchestrator for the entire run | Tasks 0 and 14; every merge gate | V3 progress ledger and integration notes only                                                                                                                                                  | Runs every integration gate                                      |
| `C1-objective-contracts`  | One agent                           | Tasks 1 and 2 in order           | `types.ts`, `config.ts`, `layoutObjective.ts`, `layoutValidator.ts`, and their tests                                                                                                           | Contract, metric, objective-order, and hairpin tests             |
| `T1-aesthetic-acceptance` | One agent                           | Tasks 3 and 13 in order          | `customLayoutAestheticAcceptance.test.ts`, `generatedGraph.test.ts`                                                                                                                            | All aesthetic scenario assertions and generated-graph regression |
| `S1-spacing-coordinates`  | One agent                           | Tasks 4 and 5 in order           | `spacingDemand.ts`, `spacingDemand.test.ts`, `coordinateAssignment.ts`, `coordinateAssignment.test.ts`, `nodeLayout.ts`, `nodeLayout.test.ts`                                                  | Badge-space demand and stable coordinate tests                   |
| `P1-port-system`          | One agent                           | Tasks 6 and 7 in order           | `portProjection.ts`, `portProjection.test.ts`, `portDistribution.ts`, `portDistribution.test.ts`, `portCandidates.ts`, `portCandidates.test.ts`, `portAssignment.ts`, `portAssignment.test.ts` | Angular order, side alternatives, high-degree port tests         |
| `R1-routing`              | One agent                           | Tasks 8 and 9 in order           | `routeSearch.ts`, `routeSearch.test.ts`, `edgeRouter.ts`, `edgeRouter.test.ts`, `specialRoutes.ts`, `specialRoutes.test.ts`                                                                    | Lexicographic path search, batch order, feedback-route tests     |
| `B1-badges`               | One agent                           | Task 10                          | `badgePlacement.ts`, `badgePlacement.test.ts`                                                                                                                                                  | Direct badge and leader-policy tests                             |
| `G1-global-optimizer`     | One agent                           | Task 11                          | `optimizeLayout.ts`, `optimizeLayout.test.ts`, `computeCustomLayout.ts`, `computeCustomLayout.test.ts`, `index.ts`                                                                             | Convergence, conflict-directed moves, best-state tests           |
| `U1-visual-lab`           | One agent                           | Task 12                          | `CustomLayoutMetrics.tsx`, `GraphTestingPage.tsx`, `GraphTestingModal.tsx`, `EdgeBadgeOverlay.tsx`                                                                                             | Build, rendering, and browser visual checks                      |

### Mandatory Agent Rules

1. `O0` remains active for the entire run and is the only agent allowed to merge or cherry-pick worker commits.
2. The same persistent owner performs every task assigned to one group.
3. Tasks within one group are sequential, even if another group is working in parallel.
4. Only tasks in the same wave may run concurrently.
5. Use at most three workers beside `O0` at once.
6. A worker edits only its exclusive writable files.
7. If a worker needs another group's file, it sends a contract request to `O0`; it does not edit that file.
8. Every behavior task starts with a focused failing test.
9. Every task produces one focused commit.
10. Every worker reports the commit SHA, files changed, focused command, and exact result.
11. `O0` runs the strict 20-scenario suite after every merged production-code commit.
12. No worker may run `git reset --hard`, `git checkout --`, delete existing changes, or silently rewrite the current dirty working tree.
13. Do not add ELK, Dagre, Graphviz, libavoid, or another layout runner. Their algorithms may be reproduced in this codebase.
14. Do not weaken the existing hard validator to make an aesthetic test pass.
15. Do not add scenario-ID conditionals to production code.

### Parallel Waves

| Wave | Work allowed in parallel               | Entry gate                                                    | Exit gate                                           |
| ---- | -------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| 0    | `O0` Task 0                            | None                                                          | Baseline and branches recorded                      |
| 1    | `C1` Task 1                            | Wave 0                                                        | Contracts merged; typecheck passes                  |
| 2    | `C1` Task 2                            | Task 1                                                        | Objective metrics merged                            |
| 3    | `T1` Task 3                            | Task 2                                                        | Named aesthetic tests fail for the expected reasons |
| 4    | `S1` Task 4; `P1` Task 6; `R1` Task 8  | Task 3                                                        | Three focused commits ready                         |
| 5    | `S1` Task 5; `P1` Task 7; `B1` Task 10 | Each group's preceding contract is merged                     | Spacing, ports, and leader policy merged            |
| 6    | `R1` Task 9; `U1` Task 12              | Tasks 5, 7, 8, and 10 merged for `R1`; Task 2 merged for `U1` | Batch router and visual metrics merged              |
| 7    | `G1` Task 11                           | Tasks 4–10 merged                                             | Global optimizer merged                             |
| 8    | `T1` Task 13                           | Task 11                                                       | Acceptance and generated regression pass            |
| 9    | `O0` Task 14                           | Task 13                                                       | All automated and visual gates pass                 |

### Do Not Parallelize These Relationships

- Tasks 1 → 2: metric contracts must exist before the comparator is implemented.
- Tasks 4 → 5: coordinate assignment consumes spacing-demand output.
- Tasks 6 → 7: side assignment depends on angular port projections.
- Tasks 8 → 9: batch routing depends on tuple-based route costs.
- Tasks 3 → 4–10: workers need one shared failing aesthetic contract.
- Tasks 4–10 → 11: the optimizer integrates every subsystem and must be implemented last.
- Task 11 → 13: acceptance thresholds must not be relaxed while the optimizer is incomplete.

## Locked V3 Optimization Order

Compare complete layouts lexicographically in this exact order:

1. Hard validity and hard-error count.
2. Node overlap, node penetration, shared segment, and badge collision metrics.
3. Perpendicular edge crossing count.
4. Ordinary-edge badge leader count.
5. Hairpin count.
6. Bend count.
7. Direction-deviation penalty.
8. Total Manhattan route length.
9. Port-side imbalance.
10. Feedback-edge leader count and total leader length.
11. Total graph area.
12. Deterministic state hash as the final tie-breaker.

Consequences:

- Any crossing-free legal layout beats every legal layout with one crossing, regardless of size or length.
- Any leader-free ordinary edge beats an ordinary edge with a leader, regardless of bends or area.
- A two-bend route beats a three-bend route only after crossings and ordinary leaders tie.
- Compactness never justifies an avoidable crossing or an ordinary leader.
- Feedback leaders remain legal, but direct feedback badges are still preferred.
- Arbitrary non-planar graphs may retain unavoidable crossings; the engine must return the best deterministic state it found.
- The graph has no maximum width or height cap. Search iterations remain bounded for deterministic runtime.

## Scope and Non-Goals

### In Scope

- Top-to-bottom directed graphs.
- Cyclic and acyclic graphs.
- Same-rank cross edges.
- Feedback edges and self-loops.
- Four-sided source and target ports.
- Unique port points for every edge incidence.
- Crossing-aware port side and port order selection.
- Dynamic node and rank spacing derived from badge measurements.
- Direct ordinary-edge badges without dotted leaders.
- Deterministic bounded optimization.
- Existing testing page at `http://localhost:5173/?page=testing`.

### Not in Scope

- Replacing node rendering or React graph components.
- Curved or spline routing.
- Edge bundling that merges positive-length segments.
- Manual node dragging or incremental interactive layout.
- Proving global crossing optimality for arbitrary graphs.
- Adding a third-party layout runtime.
- Limiting graph width to the viewport.

## Verified V2 Baseline

Run before any V3 behavior change:

```bash
bun test
bun run typecheck
bun run lint
```

Expected current result:

- `193 pass`
- `0 fail`
- Typecheck exits `0`.
- Lint exits `0`.

The strict legality suite already passes:

```bash
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
```

Expected:

- `20 pass`
- `0 fail`

This is not the V3 success criterion. The current visual baseline is:

| Scenario         | Crossings | Bends | Ordinary leaders | Feedback leaders | Total length |      Area |
| ---------------- | --------: | ----: | ---------------: | ---------------: | -----------: | --------: |
| #5 Fan-Out       |         3 |    12 |                0 |                0 |       2617.0 |   282,240 |
| #6 Fan-In        |        13 |    15 |                1 |                0 |       4464.5 |   293,760 |
| #8 Same-Rank     |         0 |     7 |                1 |                0 |        825.5 |   163,560 |
| #14 Parallel     |         0 |     2 |                2 |                0 |        481.0 |  80,666.7 |
| #16 Dense Badges |         0 |     4 |                2 |                0 |        412.0 | 124,415.4 |
| #20 DevOps       |         6 |    18 |                6 |                2 |       2731.3 | 612,719.8 |

## V3 Acceptance Targets

### Every One of the 20 Scenarios

- Existing hard-validity assertions remain green.
- `ordinaryLeaderCount === 0`.
- All source port points on the same node are distinct.
- All target port points on the same node are distinct.
- Input shuffle produces deeply equal nodes, routes, badges, crossings, metrics, and status.
- The optimizer's returned score is no worse than its initial hard-valid state.

### Named Visual Scenarios

| Scenario         | Required V3 result                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #5 Fan-Out       | `crossingCount === 0`; messages 5–7 use monotone angular port order; no edge has more than 2 bends                                                              |
| #6 Fan-In        | `crossingCount === 0`; Aggregator is centered within the middle 20% of the source span; target ports use at least 2 sides; no ordinary leaders                  |
| #8 Same-Rank     | `crossingCount === 0`; `horizontal sync` has no leader; peer gap is at least badge width plus two clearances                                                    |
| #14 Parallel     | `crossingCount === 0`; all three source and target points are unique; no leaders; all badges remain directly associated                                         |
| #16 Dense Badges | `crossingCount === 0`; A→B has no leader and targets B from the top; all three badges are direct                                                                |
| #20 DevOps       | `crossingCount === 0`; no ordinary leaders; no ordinary edge exceeds 3 bends; feedback edges do not take an outer corridor when a shorter legal route is better |

Do not add a maximum-area assertion. Area is deliberately the last optimization objective.

## File Responsibility Map

### New Files

- `src/engine/layout/custom/layoutObjective.ts`  
  Builds the complete lexicographic score and compares scores.
- `src/engine/layout/custom/layoutObjective.test.ts`  
  Locks the optimization priority and hairpin counting.
- `src/engine/layout/custom/spacingDemand.ts`  
  Converts measured badge dimensions and graph topology into exact minimum node/rank gaps.
- `src/engine/layout/custom/spacingDemand.test.ts`  
  Covers same-rank labels, parallel labels, and no-op unlabeled graphs.
- `src/engine/layout/custom/portProjection.ts`  
  Projects a remote node ray onto a selected side and returns a sortable ideal offset.
- `src/engine/layout/custom/portProjection.test.ts`  
  Locks clockwise/angular ordering on all four sides.
- `src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`  
  Owns the visual-quality contract for scenarios #5, #6, #8, #14, #16, and #20.
- `docs/planning/custom-directed-graph-layout-routing-engine-v3-progress.md`  
  Created by `O0` during Task 0.

### Existing Files with Changed Responsibilities

- `types.ts`: adds score, spacing-request, route-cost, and optimization-stat contracts.
- `config.ts`: adds bounded search controls, not visual-size limits.
- `layoutValidator.ts`: reports new metrics but keeps all hard rules unchanged.
- `coordinateAssignment.ts`: replaces in-place directional median drift with synchronous desired positions plus isotonic projection.
- `portDistribution.ts`: replaces remote-axis sorting with ray-projected side ordering.
- `portAssignment.ts`: exposes deterministic alternative side assignments.
- `routeSearch.ts`: uses a tuple cost so a crossing can never be traded for a shorter route.
- `edgeRouter.ts`: tries deterministic edge orders and reroutes crossing conflict sets.
- `badgePlacement.ts`: forbids leaders for ordinary edges and returns exact spacing requests.
- `optimizeLayout.ts`: continues after hard validity and coordinates the full aesthetic search.
- Testing-page files: expose the new metrics and make remaining soft defects visible.

## Core Data Contracts

Task 1 must establish these contracts before parallel behavior work starts:

```ts
export interface RouteCost {
  crossings: number;
  hairpins: number;
  bends: number;
  directionDeviation: number;
  length: number;
  nearObstaclePenalty: number;
}

export interface LayoutScore {
  hardErrorCount: number;
  nodeNodeOverlaps: number;
  edgeNodePenetrations: number;
  sharedEdgeSegmentLength: number;
  badgeNodeOverlaps: number;
  badgeBadgeOverlaps: number;
  badgeUnrelatedEdgeOverlaps: number;
  crossingCount: number;
  ordinaryLeaderCount: number;
  hairpinCount: number;
  bendCount: number;
  directionDeviationPenalty: number;
  totalLength: number;
  portSideImbalance: number;
  feedbackLeaderCount: number;
  totalLeaderLength: number;
  totalArea: number;
  stateHash: string;
}

export interface BadgeSpacingRequest {
  edgeId: string;
  kind: "rank-gap" | "node-gap" | "graph-padding";
  rank?: number;
  afterNodeId?: string;
  minimum: number;
  reason: "same-rank-label" | "parallel-labels" | "blocked-direct-badge";
}

export interface PortSideAssignment {
  srcSide: Side;
  tgtSide: Side;
}

export interface OptimizationStats {
  globalPasses: number;
  evaluatedPortStates: number;
  spacingExpansions: number;
  repeatedStateStop: boolean;
}
```

`LayoutMetrics` gains:

```ts
ordinaryLeaderCount?: number;
feedbackLeaderCount?: number;
totalLeaderLength?: number;
hairpinCount?: number;
portSideImbalance?: number;
```

These metric fields are optional in the public interface only to keep existing manually constructed fallback objects source-compatible during the staged rollout. `validateCustomLayout` must always populate numeric values.

`CustomLayoutResult` gains:

```ts
optimizationStats?: OptimizationStats;
```

The field is optional only so existing manually constructed test/UI fallback objects continue compiling during the staged rollout. `computeCustomLayout` must always populate it after Task 11, and acceptance tests use `result.optimizationStats!`.

`CustomLayoutConfig` gains:

```ts
maxAestheticPasses: number;
maxPortStatesPerPass: number;
maxPortAlternativesPerEdge: number;
maxRouteOrderVariants: number;
coordinateSweepLimit: number;
```

Recommended defaults:

```ts
maxAestheticPasses: 12,
maxPortStatesPerPass: 8,
maxPortAlternativesPerEdge: 4,
maxRouteOrderVariants: 4,
coordinateSweepLimit: 16,
```

## Algorithm Overview

```text
normalize and classify graph
  -> measure every badge
  -> calculate topology-based spacing demands
  -> assign ranks and fixed layer order
  -> assign stable node coordinates
  -> build initial side assignments
  -> distribute ports in angular order
  -> route with crossing-first tuple A*
  -> place ordinary badges directly and feedback badges directly if possible
  -> validate and build full layout score
  -> inspect crossings, ordinary leaders, hairpins, and worst bends
  -> generate bounded conflict-directed side-assignment alternatives
  -> reroute and compare complete scores
  -> apply exact spacing requests when port moves cannot improve
  -> stop on aesthetic success, no improving move, repeated state, or pass bound
  -> return the best historical state
```

### Algorithm References for Implementers

Use these only as algorithm references; do not import their runners:

- ELK Layered phase ordering, port constraints, crossing minimization, and node placement:  
  `https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html`
- ELK’s rule that port order participates in crossing minimization:  
  `https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-considerModelOrder-portModelOrder.html`
- Orthogonal visibility routing followed by ordering/nudging of connectors:  
  `https://users.monash.edu/~mwybrow/papers/wybrow-gd-2009.pdf`
- Reserving edge-label space inside the layered layout through label-sized dummies:  
  `https://rtsys.informatik.uni-kiel.de/~biblio/downloads/papers/diagrams18cds.pdf`
- Corrected Brandes–Köpf coordinate-assignment details and warnings about directional variants:  
  `https://arxiv.org/abs/2008.01252`

V3 uses a smaller custom isotonic coordinate projection instead of copying the complete Brandes–Köpf implementation. This keeps the implementation bounded and testable while fixing the current one-sided sweep drift.

## Task 0: Bootstrap the V3 Run

**Owner:** `O0-orchestrator`  
**Effort:** 1–2 hours  
**Parallel:** No.

**Files:**

- Create: `docs/planning/custom-directed-graph-layout-routing-engine-v3-progress.md`

- [ ] **Step 1: Record the exact working-tree state**

Run:

```bash
git rev-parse HEAD
git status --short
git diff --stat
```

Record all output in the progress ledger. Do not reset, stash, or discard existing changes.

- [ ] **Step 2: Run and record the legal baseline**

Run:

```bash
bun test
bun run typecheck
bun run lint
```

Expected at plan creation time: `193 pass`, `0 fail`, typecheck `0`, lint `0`.

- [ ] **Step 3: Record the six aesthetic baselines**

Copy the baseline table from this plan into the progress ledger. Label these values “expected failing aesthetic baseline,” not “accepted result.”

- [ ] **Step 4: Create one isolated branch or worktree per active group**

Use branch names:

```text
codex/v3-objective-contracts
codex/v3-aesthetic-acceptance
codex/v3-spacing-coordinates
codex/v3-port-system
codex/v3-routing
codex/v3-badges
codex/v3-global-optimizer
codex/v3-visual-lab
```

If the integration tree contains uncommitted user changes, leave it untouched. Create worktrees from the current committed `HEAD`; do not move uncommitted files into worker branches without explicit owner approval.

- [ ] **Step 5: Create the progress table**

Use columns:

```text
Wave | Task | Owner | Branch | Status | Commit | Focused test | Strict gate | Full gate | Merge state
```

- [ ] **Step 6: Mark only Task 1 unblocked**

No behavior worker starts until `C1` freezes the shared contracts.

**Done when:** Baselines, branches, ownership, and merge gates are recorded.

**Commit:** `docs: start v3 aesthetic optimizer ledger`

## Task 1: Freeze V3 Types and Search Bounds

**Owner:** `C1-objective-contracts`  
**Effort:** 3–5 hours  
**Parallel:** No.

**Files:**

- Modify: `src/engine/layout/custom/types.ts`
- Modify: `src/engine/layout/custom/config.ts`
- Modify: `src/engine/layout/custom/config.test.ts`

- [ ] **Step 1: Add failing config tests**

Add:

```ts
it("provides bounded V3 aesthetic search defaults", () => {
  const config = resolveCustomLayoutConfig();
  expect(config.maxAestheticPasses).toBe(12);
  expect(config.maxPortStatesPerPass).toBe(8);
  expect(config.maxPortAlternativesPerEdge).toBe(4);
  expect(config.maxRouteOrderVariants).toBe(4);
  expect(config.coordinateSweepLimit).toBe(16);
});

it("rejects non-positive V3 search bounds", () => {
  for (const key of [
    "maxAestheticPasses",
    "maxPortStatesPerPass",
    "maxPortAlternativesPerEdge",
    "maxRouteOrderVariants",
    "coordinateSweepLimit",
  ] as const) {
    expect(() => resolveCustomLayoutConfig({ [key]: 0 })).toThrow(LayoutConfigurationError);
  }
});
```

- [ ] **Step 2: Run the config test and confirm failure**

Run:

```bash
bun test src/engine/layout/custom/config.test.ts
```

Expected: FAIL because the five V3 fields do not exist.

- [ ] **Step 3: Add the shared V3 interfaces to `types.ts`**

Add exactly the `RouteCost`, `LayoutScore`, `BadgeSpacingRequest`, `PortSideAssignment`, and `OptimizationStats` interfaces defined in “Core Data Contracts.”

Extend `LayoutMetrics` with:

```ts
ordinaryLeaderCount?: number;
feedbackLeaderCount?: number;
totalLeaderLength?: number;
hairpinCount?: number;
portSideImbalance?: number;
```

Extend `CustomLayoutResult` with:

```ts
optimizationStats?: OptimizationStats;
```

- [ ] **Step 4: Add the five config fields and defaults**

Use:

```ts
maxAestheticPasses: 12,
maxPortStatesPerPass: 8,
maxPortAlternativesPerEdge: 4,
maxRouteOrderVariants: 4,
coordinateSweepLimit: 16,
```

Add all five names to `positiveFields`.

- [ ] **Step 5: Update existing typed fixtures**

Search:

```bash
rg -n "LayoutMetrics|CustomLayoutResult" src/engine/layout/custom src/features/GraphTesting
```

Only `C1` updates type-level metric fixtures. For optimizer/UI fixture changes, send the compile errors to `O0` and leave them for `G1` or `U1`.

- [ ] **Step 6: Run focused validation**

Run:

```bash
bun test src/engine/layout/custom/config.test.ts
bun run typecheck
```

Expected: config tests pass. Typecheck may identify downstream required fields; resolve only files owned by `C1`, then give exact remaining errors to `O0`.

**Done when:** Shared contracts compile and all search bounds reject zero or negative values.

**Commit:** `refactor: freeze v3 aesthetic optimization contracts`

## Task 2: Implement the Lexicographic Layout Objective

**Owner:** `C1-objective-contracts`  
**Effort:** 4–6 hours  
**Parallel:** No.

**Files:**

- Create: `src/engine/layout/custom/layoutObjective.ts`
- Create: `src/engine/layout/custom/layoutObjective.test.ts`
- Modify: `src/engine/layout/custom/layoutValidator.ts`
- Modify: `src/engine/layout/custom/layoutValidator.test.ts`

- [ ] **Step 1: Write a complete metric factory in the test**

Use:

```ts
function score(overrides: Partial<LayoutScore> = {}): LayoutScore {
  return {
    hardErrorCount: 0,
    nodeNodeOverlaps: 0,
    edgeNodePenetrations: 0,
    sharedEdgeSegmentLength: 0,
    badgeNodeOverlaps: 0,
    badgeBadgeOverlaps: 0,
    badgeUnrelatedEdgeOverlaps: 0,
    crossingCount: 0,
    ordinaryLeaderCount: 0,
    hairpinCount: 0,
    bendCount: 0,
    directionDeviationPenalty: 0,
    totalLength: 0,
    portSideImbalance: 0,
    feedbackLeaderCount: 0,
    totalLeaderLength: 0,
    totalArea: 0,
    stateHash: "",
    ...overrides,
  };
}
```

- [ ] **Step 2: Lock the priority order with failing tests**

Add:

```ts
it("prefers zero crossings over any reduction in length or area", () => {
  const crossingFree = score({ totalLength: 100_000, totalArea: 10_000_000 });
  const compactWithCrossing = score({ crossingCount: 1, totalLength: 10, totalArea: 100 });
  expect(compareLayoutScore(crossingFree, compactWithCrossing)).toBeLessThan(0);
});

it("prefers no ordinary leader over fewer bends", () => {
  const direct = score({ bendCount: 10 });
  const leader = score({ ordinaryLeaderCount: 1, bendCount: 0 });
  expect(compareLayoutScore(direct, leader)).toBeLessThan(0);
});

it("uses area only after route and port aesthetics tie", () => {
  const small = score({ totalArea: 100 });
  const large = score({ totalArea: 200 });
  expect(compareLayoutScore(small, large)).toBeLessThan(0);
});
```

- [ ] **Step 3: Add failing hairpin tests**

Use the direction sequence definition `right → down → left` or `left → down → right` as one hairpin:

```ts
it("counts U-shaped axis reversals as hairpins", () => {
  expect(
    countPathHairpins([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 10, y: 20 },
    ]),
  ).toBe(1);
});

it("does not count a normal L route as a hairpin", () => {
  expect(
    countPathHairpins([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
    ]),
  ).toBe(0);
});
```

- [ ] **Step 4: Run the tests and confirm failure**

Run:

```bash
bun test src/engine/layout/custom/layoutObjective.test.ts
```

Expected: FAIL because the objective module does not exist.

- [ ] **Step 5: Implement `compareLayoutScore` as a tuple comparison**

Use this exact field order:

```ts
const ORDER: (keyof LayoutScore)[] = [
  "hardErrorCount",
  "nodeNodeOverlaps",
  "edgeNodePenetrations",
  "sharedEdgeSegmentLength",
  "badgeNodeOverlaps",
  "badgeBadgeOverlaps",
  "badgeUnrelatedEdgeOverlaps",
  "crossingCount",
  "ordinaryLeaderCount",
  "hairpinCount",
  "bendCount",
  "directionDeviationPenalty",
  "totalLength",
  "portSideImbalance",
  "feedbackLeaderCount",
  "totalLeaderLength",
  "totalArea",
];

export function compareLayoutScore(a: LayoutScore, b: LayoutScore): number {
  for (const key of ORDER) {
    const diff = (a[key] as number) - (b[key] as number);
    if (diff !== 0) return diff;
  }
  return a.stateHash.localeCompare(b.stateHash);
}
```

- [ ] **Step 6: Implement hairpin counting**

Simplify the path first. Convert each segment to `up`, `right`, `down`, or `left`. Count index `i` when directions `i` and `i + 2` are opposites.

```ts
const opposite: Record<SegmentDirection, SegmentDirection> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
```

- [ ] **Step 7: Build a score from validation and result data**

Export:

```ts
export function buildLayoutScore(
  result: Pick<CustomLayoutResult, "edges" | "badges">,
  validation: LayoutValidationResult,
  edgeRoles: Map<string, EdgeRole>,
  stateHash: string,
): LayoutScore;
```

Rules:

- A badge with `leaderPoints` is ordinary unless `edgeRoles.get(edgeId) === "feedback"`.
- `totalLeaderLength` is the Manhattan length of all leader paths.
- `hairpinCount` is summed across simplified edge paths.
- `portSideImbalance` is the sum, per node, of squared side counts after subtracting the minimum of all four side counts, including unused sides as zero. A perfectly even `[1,1,1,1]` distribution is `0`; `[4,0,0,0]` is strongly penalized.
- Leaders on `feedback` and `self` roles count as `feedbackLeaderCount`. Every other role counts as ordinary.

- [ ] **Step 8: Keep `compareLayoutScores` backward compatible**

`layoutValidator.ts` may continue exporting `compareLayoutScores`, but it must delegate to the new objective builder/comparator. Do not change hard diagnostics.

- [ ] **Step 9: Run focused and strict tests**

Run:

```bash
bun test src/engine/layout/custom/layoutObjective.test.ts
bun test src/engine/layout/custom/layoutValidator.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun run typecheck
```

Expected: all pass; strict suite remains `20 pass`.

**Done when:** A compact crossed layout can never beat an expanded crossing-free layout.

**Commit:** `feat: add lexicographic aesthetic layout objective`

## Task 3: Add the Failing V3 Aesthetic Acceptance Contract

**Owner:** `T1-aesthetic-acceptance`  
**Effort:** 3–5 hours  
**Parallel:** No.

**Files:**

- Create: `src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`

- [ ] **Step 1: Add scenario normalization helpers**

Use:

```ts
function computeScenario(id: number) {
  const scenario = CUSTOM_LAYOUT_SCENARIOS[id];
  const nodes: NormalizedNode[] = scenario.nodes.map((n) => ({
    id: n.id,
    label: n.name,
    width: n.w,
    height: n.h,
  }));
  const edges: NormalizedEdge[] = scenario.edges.map((e, index) => ({
    id: `e-${e.source}-${e.target}-${index}`,
    source: e.source,
    target: e.target,
    label: e.label,
    isCycle: e.isCycle,
    layoutRole: e.layoutRole,
  }));
  return { scenario, edges, result: computeCustomLayout(nodes, edges) };
}

function routeByLabel(label: string, edges: NormalizedEdge[], routes: RoutedPath[]): RoutedPath {
  const edge = edges.find((item) => item.label === label);
  if (!edge) throw new Error(`Missing edge label: ${label}`);
  const route = routes.find((item) => item.edgeId === edge.id);
  if (!route) throw new Error(`Missing route for: ${label}`);
  return route;
}
```

- [ ] **Step 2: Add the common V3 assertions**

For IDs `[5, 6, 8, 14, 16, 20]`, assert:

```ts
expect(result.validation.isValid).toBe(true);
expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
expect(result.validation.metrics.crossingCount).toBe(0);
```

Also group every `sourcePort.point` and `targetPort.point` by node and assert no duplicate `"x,y"` key within a node.

- [ ] **Step 3: Add Scenario #5 assertions**

```ts
const { edges, result } = computeScenario(5);
for (const label of ["msg 1", "msg 2", "msg 3", "msg 4", "msg 5", "msg 6", "msg 7"]) {
  const route = routeByLabel(label, edges, result.edges);
  expect(Math.max(0, simplifyOrthogonalPath(route.points).length - 2)).toBeLessThanOrEqual(2);
}
```

The general port-projection unit test owns the exact messages 5–7 ordering. Acceptance owns the visible zero-crossing result.

- [ ] **Step 4: Add Scenario #6 hub assertions**

Compute the minimum and maximum center X of `I1` through `I7`. Assert the `COL` center lies between 40% and 60% of that span.

```ts
expect(colCenterX).toBeGreaterThanOrEqual(minSourceX + span * 0.4);
expect(colCenterX).toBeLessThanOrEqual(minSourceX + span * 0.6);
```

Collect target sides for edges ending at `COL` and assert `new Set(sides).size >= 2`.

- [ ] **Step 5: Add Scenario #8 badge-space assertions**

Find the `horizontal sync` badge and assert:

```ts
expect(badge.leaderPoints).toBeUndefined();
```

Find `MID1` and `MID2`. Assert the boundary gap between them is at least:

```ts
badge.rect.width + 2 * DEFAULT_CUSTOM_LAYOUT_CONFIG.badgeClearance;
```

- [ ] **Step 6: Add Scenario #14 parallel-edge assertions**

Assert three unique source port point keys, three unique target port point keys, and no badge has `leaderPoints`.

- [ ] **Step 7: Add Scenario #16 explicit route assertion**

```ts
const route = routeByLabel("High Volume API Request [v1.2]", edges, result.edges);
expect(route.targetPort.nodeId).toBe("B");
expect(route.targetPort.side).toBe("top");
expect(result.badges.find((badge) => badge.edgeId === route.edgeId)?.leaderPoints).toBeUndefined();
```

- [ ] **Step 8: Add Scenario #20 route-quality assertions**

For every edge that is not `isCycle` and not explicitly `feedback`, assert at most 3 bends. Assert feedback edges have at most 4 bends.

- [ ] **Step 9: Run the new test and record the expected failure matrix**

Run:

```bash
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
```

Expected initial failures:

- #5: 3 crossings.
- #6: 13 crossings, 1 ordinary leader, off-center collector.
- #8: 1 ordinary leader and insufficient peer gap.
- #14: 2 ordinary leaders.
- #16: 2 ordinary leaders and wrong A→B target side.
- #20: 6 crossings and 6 ordinary leaders.

Do not weaken these assertions during Tasks 4–12.

**Done when:** The aesthetic suite fails only for the known V2 visual defects.

**Commit:** `test: define v3 graph aesthetic acceptance`

## Task 4: Compute Badge-Aware Spacing Demands Before Coordinates

**Owner:** `S1-spacing-coordinates`  
**Effort:** 4–6 hours  
**Parallel:** Tasks 6 and 8.

**Files:**

- Create: `src/engine/layout/custom/spacingDemand.ts`
- Create: `src/engine/layout/custom/spacingDemand.test.ts`

- [ ] **Step 1: Write a failing same-rank label test**

Construct two same-rank nodes with a 140 px badge. The required gap is:

```ts
badgeWidth + 2 * config.badgeClearance + 2 * config.portStubLength;
```

Test:

```ts
it("reserves a node gap wide enough for a same-rank badge", () => {
  const demand = computeInitialSpacingDemand(
    normalizedGraph,
    rankAssignment,
    orderedLayers,
    new Map([["cross", { x: 0, y: 0, width: 140, height: 30 }]]),
    config,
  );

  expect(demand.nodeGaps?.MID1).toBeGreaterThanOrEqual(
    140 + 2 * config.badgeClearance + 2 * config.portStubLength,
  );
});
```

- [ ] **Step 2: Write a failing parallel-label rank-gap test**

For three labeled edges between the same adjacent ranks, expect:

```ts
const required =
  2 * config.portStubLength + 2 * config.badgeClearance + 3 * (30 + config.badgeClearance);
```

Assert the selected rank gap is at least `required`.

- [ ] **Step 3: Write a no-op test**

An unlabeled two-node graph must return empty override records:

```ts
expect(result).toEqual({ rankGaps: {}, nodeGaps: {} });
```

- [ ] **Step 4: Run and confirm failure**

Run:

```bash
bun test src/engine/layout/custom/spacingDemand.test.ts
```

Expected: FAIL because `spacingDemand.ts` does not exist.

- [ ] **Step 5: Implement same-rank demands**

Export:

```ts
export function computeInitialSpacingDemand(
  graph: NormalizedGraph,
  rankAssignment: RankAssignmentResult,
  orderedLayers: LayerNode[][],
  badgeRects: Map<string, Rect>,
  config: CustomLayoutConfig,
): SpacingOverrides;
```

For a same-rank edge:

1. Find source and target indexes in the ordered layer.
2. Identify the left endpoint.
3. Set the gap after the left endpoint.
4. Use the maximum of the existing demand and:

```ts
badge.width + 2 * config.badgeClearance + 2 * config.portStubLength;
```

If another real node lies between the endpoints, distribute the total demand across the intervening gaps without changing node order.

- [ ] **Step 6: Implement rank-gap demands**

Group labeled non-cross edges by the rank gap selected for their badge:

```ts
const selectedGap = Math.floor((sourceRank + targetRank) / 2);
```

For each group, sort edges by ID and compute:

```ts
const labelsHeight = group.reduce(
  (sum, edge) => sum + badgeRects.get(edge.id)!.height + config.badgeClearance,
  0,
);
const required = 2 * config.portStubLength + 2 * config.badgeClearance + labelsHeight;
```

Use `Math.max(config.rankGap, required)`.

- [ ] **Step 7: Add a pure request merger**

Export:

```ts
export function applySpacingRequests(
  current: SpacingOverrides,
  requests: BadgeSpacingRequest[],
): { overrides: SpacingOverrides; changed: boolean };
```

Rules:

- Use `Math.max(currentValue, request.minimum)`.
- Never add a fixed increment when the exact minimum is known.
- Sort requests by `kind`, rank, `afterNodeId`, then edge ID.
- Return `changed: false` if every request is already satisfied.

- [ ] **Step 8: Test determinism**

Reverse the edge and request arrays. Expect deeply equal output.

- [ ] **Step 9: Run focused tests**

Run:

```bash
bun test src/engine/layout/custom/spacingDemand.test.ts
bun run typecheck
```

Expected: all focused tests pass.

**Done when:** Label dimensions create exact local spacing requirements before any route or badge is placed.

**Commit:** `feat: reserve badge-aware graph spacing`

## Task 5: Replace Coordinate Drift with Synchronous Isotonic Placement

**Owner:** `S1-spacing-coordinates`  
**Effort:** 5–8 hours  
**Parallel:** Tasks 7 and 10.

**Files:**

- Modify: `src/engine/layout/custom/coordinateAssignment.ts`
- Modify: `src/engine/layout/custom/coordinateAssignment.test.ts`
- Modify: `src/engine/layout/custom/nodeLayout.ts`
- Modify: `src/engine/layout/custom/nodeLayout.test.ts`

- [ ] **Step 1: Add a failing fan-in centering test**

Use seven rank-0 sources and one rank-1 collector. After coordinate assignment:

```ts
const minSourceX = Math.min(...sourceCenters);
const maxSourceX = Math.max(...sourceCenters);
const span = maxSourceX - minSourceX;
expect(collectorCenter).toBeGreaterThanOrEqual(minSourceX + span * 0.4);
expect(collectorCenter).toBeLessThanOrEqual(minSourceX + span * 0.6);
```

- [ ] **Step 2: Add a mirror-symmetry test**

Create a fan-out graph and its ID-renamed horizontal mirror. Compare normalized center distances from the hub. They must be equal within `0.001`.

- [ ] **Step 3: Run and confirm the fan-in test fails**

Run:

```bash
bun test src/engine/layout/custom/coordinateAssignment.test.ts
```

Expected: current in-place sweeps place the collector near one side.

- [ ] **Step 4: Implement weighted isotonic projection**

Add a private helper:

```ts
interface DesiredCenter {
  id: string;
  desiredX: number;
  width: number;
  gapAfter: number;
  weight: number;
}

function projectLayerCenters(items: DesiredCenter[]): Map<string, number>;
```

Implementation:

1. Build cumulative minimum offsets:

```ts
offsets[0] = 0;
offsets[i] = offsets[i - 1] + items[i - 1].width / 2 + items[i - 1].gapAfter + items[i].width / 2;
```

2. Transform each desired center:

```ts
value[i] = items[i].desiredX - offsets[i];
```

3. Run weighted pool-adjacent-violators on `value` so fitted values are nondecreasing.
4. Return:

```ts
centerX[i] = fitted[i] + offsets[i];
```

The PAV block merge is:

```ts
while (blocks.length >= 2) {
  const right = blocks[blocks.length - 1];
  const left = blocks[blocks.length - 2];
  if (left.mean <= right.mean) break;
  blocks.splice(blocks.length - 2, 2, {
    start: left.start,
    end: right.end,
    weight: left.weight + right.weight,
    mean: (left.mean * left.weight + right.mean * right.weight) / (left.weight + right.weight),
  });
}
```

- [ ] **Step 5: Make coordinate sweeps synchronous**

For each sweep:

1. Read all neighbor centers from an immutable copy of the previous sweep.
2. Calculate desired X as the median neighbor center.
3. Use the previous X when a node has no neighbor.
4. Use `weight = Math.max(1, predecessorCount + successorCount)`.
5. Project each fixed-order layer with `projectLayerCenters`.
6. Replace all layer centers only after every layer has been projected.
7. Stop when maximum absolute movement is `<= config.epsilon`.
8. Stop after `config.coordinateSweepLimit`.

Do not mutate one layer and then use its new values to calculate the next layer in the same sweep.

- [ ] **Step 6: Apply V3 spacing demands in `nodeLayout.ts`**

Change `computeNodeLayout` to accept an optional `SpacingOverrides` argument and pass it to `assignCoordinates`.

Required signature:

```ts
export function computeNodeLayout(
  inputNodes: NormalizedNode[],
  inputEdges: NormalizedEdge[],
  userConfig?: Partial<CustomLayoutConfig>,
  spacingOverrides?: SpacingOverrides,
): NodeLayoutResult;
```

- [ ] **Step 7: Preserve translation and deterministic ordering**

After projection, translate all real nodes so minimum X and Y equal `graphPadding`. Never sort layers inside coordinate assignment.

- [ ] **Step 8: Run focused and scenario tests**

Run:

```bash
bun test src/engine/layout/custom/coordinateAssignment.test.ts
bun test src/engine/layout/custom/nodeLayout.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
```

Expected: focused tests and all 20 strict scenarios pass.

**Done when:** Fan-in and fan-out hubs remain centered without directional drift or overlap.

**Commit:** `feat: stabilize layered node coordinates`

## Task 6: Order Ports by Projected Remote Angle

**Owner:** `P1-port-system`  
**Effort:** 4–6 hours  
**Parallel:** Tasks 4 and 8.

**Files:**

- Create: `src/engine/layout/custom/portProjection.ts`
- Create: `src/engine/layout/custom/portProjection.test.ts`
- Modify: `src/engine/layout/custom/portDistribution.ts`
- Modify: `src/engine/layout/custom/portDistribution.test.ts`

- [ ] **Step 1: Add failing projection tests for all four sides**

Export target:

```ts
export function projectRemoteToSideOffset(
  node: NormalizedNode & Point,
  side: Side,
  remoteCenter: Point,
  epsilon: number,
): number;
```

For each side, use two remote centers that share one coordinate but have different angles. Assert their projected offsets differ in the visually correct order.

- [ ] **Step 2: Reproduce messages 5–7**

Use a Dispatcher centered near `(668, 112.5)` with right boundary `x = 748`. Use worker centers:

```ts
W5 = { x: 844, y: 292.5 };
W6 = { x: 1020, y: 292.5 };
W7 = { x: 1196, y: 292.5 };
```

Assert:

```ts
expect(projectedW7).toBeLessThan(projectedW6);
expect(projectedW6).toBeLessThan(projectedW5);
```

- [ ] **Step 3: Run and confirm failure**

Run:

```bash
bun test src/engine/layout/custom/portProjection.test.ts
bun test src/engine/layout/custom/portDistribution.test.ts
```

Expected: projection module is missing and the existing remote-Y tie uses edge ID order.

- [ ] **Step 4: Implement ray-to-side projection**

Let node center be `(cx, cy)` and remote delta be `(dx, dy)`.

For left/right:

```ts
const sideX = side === "left" ? node.x : node.x + node.width;
const t = Math.abs(dx) <= epsilon ? 0 : (sideX - cx) / dx;
return cy + dy * t - node.y;
```

For top/bottom:

```ts
const sideY = side === "top" ? node.y : node.y + node.height;
const t = Math.abs(dy) <= epsilon ? 0 : (sideY - cy) / dy;
return cx + dx * t - node.x;
```

Do not clamp the returned value before sorting. Values outside the side are useful for preserving angular order.

- [ ] **Step 5: Replace port-distribution sorting**

For every attachment, calculate its projected offset on the assigned side. Sort by:

1. Projected offset ascending.
2. Remote node ID.
3. Edge ID.
4. Source before target only as the final tie-breaker.

Keep equal physical spacing:

```ts
offset = sideLength / 2; // one attachment
offset = padding + (usable * (index + 1)) / (count + 1); // multiple
```

- [ ] **Step 6: Add a general monotonicity test**

After distribution, sort attachments by projected ideal offset and assert their actual side coordinate is strictly increasing.

- [ ] **Step 7: Test input-order determinism**

Reverse edges and node-map insertion order. Expect the same `portsByEdge`.

- [ ] **Step 8: Run focused tests**

Run:

```bash
bun test src/engine/layout/custom/portProjection.test.ts
bun test src/engine/layout/custom/portDistribution.test.ts
bun run typecheck
```

Expected: all pass.

**Done when:** Messages 7, 6, and 5 occupy the Dispatcher’s right side from top to bottom, preventing their vertical trunks from crossing the shorter routes.

**Commit:** `feat: order graph ports by projected angle`

## Task 7: Expose Crossing-Aware Port-Side Alternatives

**Owner:** `P1-port-system`  
**Effort:** 5–8 hours  
**Parallel:** Tasks 5 and 10.

**Files:**

- Modify: `src/engine/layout/custom/portCandidates.ts`
- Modify: `src/engine/layout/custom/portCandidates.test.ts`
- Modify: `src/engine/layout/custom/portAssignment.ts`
- Modify: `src/engine/layout/custom/portAssignment.test.ts`

- [ ] **Step 1: Add a failing angular-deviation test**

For a target below and slightly left of the source, assert that bottom→top is ranked before right→right when neither route is blocked.

- [ ] **Step 2: Add a four-direction availability test**

For a high-degree hub with remote nodes in four quadrants, assert the initial assignment uses top, right, bottom, and left before reusing a side when candidate base costs tie.

This is a tie-break rule, not a hard requirement for every fan-out.

- [ ] **Step 3: Add an alternative enumeration test**

Required export:

```ts
export function enumeratePortAlternatives(
  edgeId: string,
  current: PortSideAssignment,
  candidates: PortCandidate[],
  limit: number,
): PortSideAssignment[];
```

Assert:

- Current assignment is excluded.
- Duplicate side pairs are removed.
- Results are ordered by candidate base cost and side name.
- Result length is at most `limit`.

- [ ] **Step 4: Run and confirm failure**

Run:

```bash
bun test src/engine/layout/custom/portCandidates.test.ts
bun test src/engine/layout/custom/portAssignment.test.ts
```

Expected: tests fail because angular deviation and alternatives are missing.

- [ ] **Step 5: Add angular side deviation to candidates**

For each endpoint:

1. Calculate the normalized vector from the node center to the remote center.
2. Use outward side normals:

```ts
top = { x: 0, y: -1 };
right = { x: 1, y: 0 };
bottom = { x: 0, y: 1 };
left = { x: -1, y: 0 };
```

3. Calculate:

```ts
deviation = 1 - Math.max(-1, Math.min(1, dot(remoteUnit, sideNormal)));
```

4. Add:

```ts
deviation * config.directionPenalty;
```

Do this for source and target. At the target, the outward normal still points from the target toward the source.

- [ ] **Step 6: Stop forbidding bottom target sides by large fixed preference**

Keep forward bottom→top as the preferred straight case, but do not make a bottom target categorically worse than a crossed alternative. Side preference remains only an initial heuristic; complete-layout scoring decides.

- [ ] **Step 7: Make side balance a deterministic tie-breaker**

Continue using squared reuse counts, but compare:

1. Candidate base cost.
2. Number of previously unused endpoint sides.
3. Side reuse cost.
4. Source side name.
5. Target side name.

The global optimizer, not this greedy initializer, decides whether a longer side assignment is worth eliminating crossings.

- [ ] **Step 8: Implement `enumeratePortAlternatives`**

Deduplicate on:

```ts
`${candidate.srcSide}:${candidate.tgtSide}`;
```

Return at most `config.maxPortAlternativesPerEdge`.

- [ ] **Step 9: Return the initial explicit assignment state**

Extend `PortSideAssignmentResult` with:

```ts
assignmentsByEdge: Map<string, PortSideAssignment>;
```

Keep the existing candidate map if current callers still need it.

- [ ] **Step 10: Run focused and strict tests**

Run:

```bash
bun test src/engine/layout/custom/portCandidates.test.ts
bun test src/engine/layout/custom/portAssignment.test.ts
bun test src/engine/layout/custom/portDistribution.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
```

Expected: all pass.

**Done when:** The optimizer can ask for bounded alternative side pairs without changing port-module internals.

**Commit:** `feat: expose deterministic port-side alternatives`

## Task 8: Make Orthogonal Route Search Crossing-First

**Owner:** `R1-routing`  
**Effort:** 5–8 hours  
**Parallel:** Tasks 4 and 6.

**Files:**

- Modify: `src/engine/layout/custom/routeSearch.ts`
- Modify: `src/engine/layout/custom/routeSearch.test.ts`

- [ ] **Step 1: Add a failing route-cost comparator test**

Required export:

```ts
export function compareRouteCost(a: RouteCost, b: RouteCost): number;
```

Test:

```ts
it("prefers an arbitrarily long crossing-free path", () => {
  const longClean: RouteCost = {
    crossings: 0,
    hairpins: 0,
    bends: 4,
    directionDeviation: 500,
    length: 100_000,
    nearObstaclePenalty: 100,
  };
  const shortCrossed: RouteCost = {
    crossings: 1,
    hairpins: 0,
    bends: 0,
    directionDeviation: 0,
    length: 10,
    nearObstaclePenalty: 0,
  };
  expect(compareRouteCost(longClean, shortCrossed)).toBeLessThan(0);
});
```

- [ ] **Step 2: Add a search-level crossing test**

Create a grid with:

- One short route crossing one occupied segment.
- One much longer crossing-free detour.

Set `crossingPenalty: 0` to prove the result does not depend on a numeric penalty. Assert the returned route has no crossing with occupancy.

- [ ] **Step 3: Add a hairpin-vs-bend test**

When crossings tie, a route with no U-turn wins before a route with one hairpin, even if both have the same bend count.

- [ ] **Step 4: Run and confirm failure**

Run:

```bash
bun test src/engine/layout/custom/routeSearch.test.ts
```

Expected: current scalar `g + h` cost may select the short crossing.

- [ ] **Step 5: Replace scalar route cost with `RouteCost`**

Use lexicographic order:

```ts
["crossings", "hairpins", "bends", "directionDeviation", "length", "nearObstaclePenalty"];
```

The A* heuristic contributes only to `length`:

```ts
const fCost = {
  ...gCost,
  length: gCost.length + manhattanHeuristic,
};
```

- [ ] **Step 6: Track enough direction history for hairpins**

Store `previousDir` and `dir` in the search state. A move is a hairpin when:

```ts
previousDir !== null && opposite[previousDir] === moveDir;
```

with one perpendicular segment between them.

- [ ] **Step 7: Keep collinear overlap forbidden**

Positive-length collinear overlap remains a hard rejection. Perpendicular crossings increment `crossings` by one for each occupied segment crossed.

- [ ] **Step 8: Keep deterministic tie-breaking**

After `RouteCost` ties, compare:

1. Manhattan heuristic.
2. State key.
3. Vertex ID.

- [ ] **Step 9: Run focused tests**

Run:

```bash
bun test src/engine/layout/custom/routeSearch.test.ts
bun test src/engine/layout/custom/routeOccupancy.test.ts
bun run typecheck
```

Expected: all pass.

**Done when:** A finite crossing penalty can no longer make a crossing appear cheaper than graph expansion.

**Commit:** `feat: route edges with lexicographic path cost`

## Task 9: Route Edge Batches with Crossing Conflict Reroutes

**Owner:** `R1-routing`  
**Effort:** 6–8 hours  
**Parallel:** Task 12.

**Files:**

- Modify: `src/engine/layout/custom/edgeRouter.ts`
- Modify: `src/engine/layout/custom/edgeRouter.test.ts`
- Modify: `src/engine/layout/custom/specialRoutes.ts`
- Modify: `src/engine/layout/custom/specialRoutes.test.ts`

- [ ] **Step 1: Add an explicit router-options contract**

Use the `PortSideAssignment` type frozen by `C1`:

```ts
export interface EdgeRouterOptions {
  sideAssignments?: Map<string, PortSideAssignment>;
}
```

Change:

```ts
routeAllEdges(nodeLayout, config, options?)
```

When `sideAssignments` is absent, use the existing global initializer.

- [ ] **Step 2: Add failing Scenario #5 and #6 route tests**

After node layout, route without badges and assert:

```ts
expect(validation.metrics.crossingCount).toBe(0);
expect(validation.metrics.sharedEdgeSegmentLength).toBe(0);
```

- [ ] **Step 3: Add a feedback strategy test**

Construct nearby feedback endpoints with a legal short route and a legal outer corridor. Assert the short route wins. Add an intermediate obstacle that blocks the short route and assert the outer corridor is then used.

- [ ] **Step 4: Run and confirm failure**

Run:

```bash
bun test src/engine/layout/custom/edgeRouter.test.ts
bun test src/engine/layout/custom/specialRoutes.test.ts
```

Expected: current batch exits once hard-valid and does not treat crossings as reroute conflicts.

- [ ] **Step 5: Generate deterministic route-order variants**

Create at most `config.maxRouteOrderVariants`:

1. Existing hardest-first order.
2. Reverse hardest-first order.
3. Badge area descending, rank span descending, edge ID.
4. Source node ID, projected source port index, edge ID.

Deduplicate identical edge-ID sequences.

- [ ] **Step 6: Route and score every order variant**

For each variant:

1. Start with a fresh occupancy ledger.
2. Route all edges with tuple A*.
3. Validate routes without badges.
4. Compare route batches by hard errors, crossings, hairpins, bends, direction deviation, length, then order signature.
5. Keep the best batch.

- [ ] **Step 7: Include crossings in rip-up conflict sets**

Current rip-up focuses on missing routes and hard occupancy conflicts. Add both edge IDs from every crossing record. Release and reroute only that conflict component.

Stop when:

- Crossing count reaches zero, or
- A full rip-up pass gives no lexicographic improvement, or
- `maxRipUpPasses` is reached, or
- The route-state signature repeats.

- [ ] **Step 8: Try feedback routes in this order**

For each feedback edge:

1. Unrestricted obstacle-aware grid route.
2. Left outer corridor route.
3. Right outer corridor route.

Compare complete route cost. Do not force an outer corridor only because the edge is feedback.

- [ ] **Step 9: Keep endpoint legs reserved**

Commit source point→stub and target stub→point legs to the ledger before the next edge. Preserve all V2 hard guarantees.

- [ ] **Step 10: Run focused, strict, and aesthetic tests**

Run:

```bash
bun test src/engine/layout/custom/edgeRouter.test.ts
bun test src/engine/layout/custom/specialRoutes.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
```

Expected at this stage:

- Strict suite: 20 pass.
- Scenario #5 and #6 crossing assertions improve.
- Leader assertions may still fail until Task 11.

**Done when:** Route ordering and rerouting continue until crossings cannot be improved within the fixed port assignment.

**Commit:** `feat: reroute crossing edge conflict sets`

## Task 10: Forbid Ordinary Badge Leaders and Return Space Requests

**Owner:** `B1-badges`  
**Effort:** 5–8 hours  
**Parallel:** Tasks 5 and 7.

**Files:**

- Modify: `src/engine/layout/custom/badgePlacement.ts`
- Modify: `src/engine/layout/custom/badgePlacement.test.ts`

- [ ] **Step 1: Add failing leader-policy tests**

Add:

```ts
it("never generates a leader candidate for an ordinary edge", () => {
  const candidates = generateBadgeCandidates(
    route,
    "ordinary label",
    false,
    nodeRects,
    [],
    unrelatedSegments,
    graphEnvelope,
    config,
    "direct-only",
  );
  expect(candidates.every((candidate) => candidate.leaderPoints === undefined)).toBe(true);
});

it("allows a feedback leader only after direct candidates", () => {
  const candidates = generateBadgeCandidates(
    route,
    "feedback label",
    true,
    nodeRects,
    [],
    unrelatedSegments,
    graphEnvelope,
    config,
    "allow-leader-fallback",
  );
  const firstLeader = candidates.findIndex((candidate) => candidate.leaderPoints);
  const lastDirect = candidates.map((candidate) => candidate.leaderPoints).lastIndexOf(undefined);
  expect(firstLeader).toBeGreaterThan(lastDirect);
});
```

- [ ] **Step 2: Add a blocked ordinary badge request test**

When every direct candidate is blocked, assert:

```ts
expect(result.placements).toHaveLength(0);
expect(result.unresolvedEdgeIds).toEqual(["e1"]);
expect(result.spacingRequests).toEqual([
  expect.objectContaining({
    edgeId: "e1",
    reason: "blocked-direct-badge",
  }),
]);
```

- [ ] **Step 3: Run and confirm failure**

Run:

```bash
bun test src/engine/layout/custom/badgePlacement.test.ts
```

Expected: current ordinary edges receive perpendicular or exterior leaders.

- [ ] **Step 4: Add a candidate policy parameter**

Use:

```ts
type BadgeCandidatePolicy = "direct-only" | "allow-leader-fallback";

export interface BadgePlacementOptions {
  enforceDirectOrdinaryBadges?: boolean;
}
```

Rules:

- `direct-only`: generate ring 0 candidates only.
- `allow-leader-fallback`: generate ring 0 first, then perpendicular rings, then exterior candidates.
- Candidate score never makes a leader sort before a direct candidate.

- [ ] **Step 5: Determine policy from edge role**

Add an optional final `BadgePlacementOptions` argument to `placeEdgeBadges`. Default `enforceDirectOrdinaryBadges` to `false` during this staged task so existing callers remain hard-valid until Task 11 activates the final policy.

Use `classifiedEdges` or an edge-role map from `NodeLayoutResult`:

```ts
const isSpecialLoop = role === "feedback" || role === "self";
const policy =
  isSpecialLoop || !options.enforceDirectOrdinaryBadges ? "allow-leader-fallback" : "direct-only";
```

Task 11 must call:

```ts
placeEdgeBadges(routes, nodeLayout, config, {
  enforceDirectOrdinaryBadges: true,
});
```

This activation point keeps every intermediate merge gate green while ensuring the public `computeCustomLayout` pipeline forbids ordinary leaders after integration.

- [ ] **Step 6: Return exact spacing requests**

Extend `BadgePlacementResult`:

```ts
spacingRequests: BadgeSpacingRequest[];
```

For an unresolved ordinary badge:

- Same-rank edge:

```ts
{
  edgeId,
  kind: "node-gap",
  afterNodeId: leftEndpointId,
  minimum: badgeWidth + 2 * badgeClearance + 2 * portStubLength,
  reason: "blocked-direct-badge",
}
```

- Different-rank edge:

```ts
{
  edgeId,
  kind: "rank-gap",
  rank: Math.floor((sourceRank + targetRank) / 2),
  minimum: currentRankGap + badgeHeight + 2 * badgeClearance,
  reason: "blocked-direct-badge",
}
```

Use graph padding only when neither rank nor layer position exists.

- [ ] **Step 7: Preserve global candidate backtracking**

Backtracking still resolves badge-badge conflicts. It may only choose candidates allowed by the edge policy.

- [ ] **Step 8: Add determinism coverage**

Reverse route order and edge order. Expect identical placements, unresolved IDs, and spacing requests.

- [ ] **Step 9: Run focused and strict tests**

Run:

```bash
bun test src/engine/layout/custom/badgePlacement.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun run typecheck
```

Expected: badge unit tests and the strict suite pass because existing callers still use the compatibility default. The explicit `enforceDirectOrdinaryBadges: true` unit test must produce spacing requests instead of leaders.

**Done when:** The final-policy option makes an ordinary badge either directly placed or request more space; it never silently receives a dotted leader.

**Commit:** `feat: reserve badge leaders for feedback edges`

## Task 11: Integrate the V3 Global Aesthetic Improvement Loop

**Owner:** `G1-global-optimizer`  
**Effort:** 8–12 hours  
**Parallel:** No.

**Files:**

- Modify: `src/engine/layout/custom/optimizeLayout.ts`
- Modify: `src/engine/layout/custom/optimizeLayout.test.ts`
- Modify: `src/engine/layout/custom/computeCustomLayout.ts`
- Modify: `src/engine/layout/custom/computeCustomLayout.test.ts`
- Modify: `src/engine/layout/custom/index.ts`

- [ ] **Step 1: Add a failing “continues after valid” test**

Create a graph whose first state is hard-valid with one crossing and whose second port assignment is hard-valid with zero crossings.

Assert:

```ts
expect(result.validation.isValid).toBe(true);
expect(result.validation.metrics.crossingCount).toBe(0);
expect(result.optimizationStats!.evaluatedPortStates).toBeGreaterThan(0);
```

This test must fail at the current early return:

```ts
if (isFullyValid) return bestResult;
```

- [ ] **Step 2: Add a failing ordinary-leader expansion test**

Use a same-rank edge with a wide badge. Assert:

```ts
expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
expect(result.optimizationStats!.spacingExpansions).toBeGreaterThan(0);
```

- [ ] **Step 3: Add a best-historical-state test**

Provide three synthetic evaluation states:

1. Valid, 1 crossing, small area.
2. Valid, 0 crossings, larger area.
3. Invalid, 0 crossings.

Assert state 2 is returned.

- [ ] **Step 4: Add bounded termination tests**

Assert:

- `globalPasses <= maxAestheticPasses`.
- `evaluatedPortStates <= maxAestheticPasses * maxPortStatesPerPass`.
- A repeated state sets `repeatedStateStop: true`.

- [ ] **Step 5: Run and confirm failure**

Run:

```bash
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun test src/engine/layout/custom/computeCustomLayout.test.ts
```

Expected: early return, missing metrics, and missing stats cause failures.

- [ ] **Step 6: Measure badges before the first node layout**

In `computeCustomLayout`:

1. Resolve config.
2. Measure badge rectangles.
3. Normalize/classify/rank enough graph structure to calculate initial spacing.
4. Pass badge rectangles and spacing demand into `optimizeLayout`.

Do not measure badge text differently in separate phases.

- [ ] **Step 7: Replace port-candidate offsets with explicit state**

Internal optimizer state:

```ts
interface AestheticState {
  spacing: SpacingOverrides;
  sideAssignments: Map<string, PortSideAssignment>;
}
```

The state hash includes:

- Node coordinates.
- Side assignments sorted by edge ID.
- Route points.
- Badge rectangles and leader points.
- Spacing overrides.

- [ ] **Step 8: Implement one complete state evaluation**

Create a private function:

```ts
function evaluateState(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  state: AestheticState,
  badgeRects: Map<string, Rect>,
  config: CustomLayoutConfig,
): EvaluatedState;
```

It must:

1. Compute node layout with `state.spacing`.
2. Fill absent side assignments from the port initializer.
3. Route with explicit side assignments.
4. Place badges with role-aware policy and `{ enforceDirectOrdinaryBadges: true }`.
5. Validate with classified edge roles.
6. Build `LayoutScore`.
7. Return spacing requests.

- [ ] **Step 9: Seed initial spacing from badge demand**

Before pass 0:

```ts
const structuralLayout = computeNodeLayout(nodes, edges, config, {
  rankGaps: {},
  nodeGaps: {},
});
state.spacing = computeInitialSpacingDemand(
  structuralLayout.normalizedGraph,
  structuralLayout.rankAssignment,
  structuralLayout.orderedLayers,
  badgeRects,
  config,
);
```

No initial graph-size cap is applied.

- [ ] **Step 10: Implement conflict-directed port moves**

From the current result, build a deterministic problem edge list:

1. Both edge IDs from every crossing.
2. Every ordinary edge with an unresolved badge or leader.
3. Edges participating in hard route diagnostics.
4. Edges with hairpins, highest count first.
5. Edges with more than 3 bends, highest count first.

Sort ties by edge ID.

For each problem edge, request at most:

```ts
config.maxPortAlternativesPerEdge;
```

from `enumeratePortAlternatives`.

Create candidate states by changing one edge assignment at a time. Deduplicate state hashes. Evaluate at most:

```ts
config.maxPortStatesPerPass;
```

- [ ] **Step 11: Accept only lexicographic improvement**

Choose the best candidate with `compareLayoutScore`. Replace current state only if the candidate is strictly better.

Never accept:

- Fewer bends with more crossings.
- Shorter length with an ordinary leader.
- Smaller area with a hairpin increase when earlier fields tie.

- [ ] **Step 12: Apply spacing requests after port moves stall**

If no port state improves and badge spacing requests exist:

```ts
const applied = applySpacingRequests(current.spacing, requests);
```

If `applied.changed`, increment `spacingExpansions`, evaluate the expanded state, and continue.

- [ ] **Step 13: Add a crossing-specific spacing fallback**

If crossings remain and port moves stall:

1. Find the crossing point.
2. Find the nearest rank gap or same-rank node gap containing that point.
3. Increase only that gap by:

```ts
2 * config.laneSpacing + config.portStubLength;
```

4. Evaluate once.
5. Keep the expansion only if the complete score improves.

This is the only additive spacing fallback. Badge spacing uses exact minimum requests.

- [ ] **Step 14: Remove the hard-valid early return**

Replace:

```ts
if (isFullyValid) return bestResult;
```

with success detection:

```ts
const aestheticallyComplete =
  isFullyValid &&
  score.crossingCount === 0 &&
  score.ordinaryLeaderCount === 0 &&
  score.hairpinCount === 0;
```

Return early only when `aestheticallyComplete` is true.

- [ ] **Step 15: Preserve the best historical result**

On every evaluated state:

```ts
if (!best || compareLayoutScore(candidate.score, best.score) < 0) {
  best = candidate;
}
```

At every stop condition, return `best`, not the last state.

- [ ] **Step 16: Implement deterministic stop conditions**

Stop on the first applicable condition:

1. Aesthetic completion.
2. Repeated state hash.
3. No improving port move and no applicable spacing change.
4. `maxAestheticPasses`.

Record `OptimizationStats`.

- [ ] **Step 17: Make status describe hard legality only**

- `success`: no hard validation errors.
- `unresolved_soft_conflicts`: hard-valid but crossings, ordinary leaders, or hairpins remain after bounded search.
- `invalid_hard_failure`: at least one hard validation error remains.

Do not claim aesthetic completion from status alone; metrics remain authoritative.

- [ ] **Step 18: Run focused and integration tests**

Run:

```bash
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun test src/engine/layout/custom/computeCustomLayout.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
bun run typecheck
```

Expected:

- Focused tests pass.
- Strict suite: 20 pass.
- Named aesthetic suite passes or reports only scenario-specific work assigned to Task 13; do not relax thresholds.

**Done when:** Hard validity is an intermediate milestone instead of the optimizer’s stopping condition.

**Commit:** `feat: optimize complete graph aesthetics after validity`

## Task 12: Expose Aesthetic Metrics in the Testing Page

**Owner:** `U1-visual-lab`  
**Effort:** 3–5 hours  
**Parallel:** Task 9.

**Files:**

- Modify: `src/features/GraphTesting/components/CustomLayoutMetrics.tsx`
- Modify: `src/features/GraphTesting/components/GraphTestingPage.tsx`
- Modify: `src/features/GraphTesting/components/GraphTestingModal.tsx`
- Modify: `src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx`

- [ ] **Step 1: Add metric cards**

Show:

```text
Crossings
Ordinary Leaders
Feedback Leaders
Hairpins
Bends
Maximum Edge Bends
Port Imbalance
Total Edge Length
Total Bounding Area
Optimization Passes
```

Normalize staged optional fields once:

```ts
const ordinaryLeaders = metrics.ordinaryLeaderCount ?? 0;
const feedbackLeaders = metrics.feedbackLeaderCount ?? 0;
const hairpins = metrics.hairpinCount ?? 0;
const portImbalance = metrics.portSideImbalance ?? 0;
const optimizationPasses = layoutResult.optimizationStats?.globalPasses ?? 0;
```

- [ ] **Step 2: Make remaining soft failures visible**

Display:

- Green when hard-valid, zero crossings, zero ordinary leaders, and zero hairpins.
- Amber when hard-valid but any of those soft metrics is nonzero.
- Red only for hard-invalid.

Do not label a crossed graph simply “Valid” without the amber aesthetic status.

- [ ] **Step 3: Render leaders by semantic role**

Ordinary leaders should never occur. If one appears:

- Render it red.
- Add a diagnostic title containing the edge ID.

Feedback leaders:

- Keep the current dotted appearance.
- Use the normal feedback color.

- [ ] **Step 4: Add route-quality diagnostics to the scenario header**

Show:

```text
Status: success | Aesthetic: complete
```

or:

```text
Status: success | Aesthetic: 3 crossings, 1 ordinary leader
```

- [ ] **Step 5: Preserve the existing stage controls**

Ports, badges, crossings, and diagnostics remain independently toggleable.

- [ ] **Step 6: Run build validation**

Run:

```bash
bun run typecheck
bun run lint
bun run build:local
```

Expected: all exit `0`.

- [ ] **Step 7: Inspect the existing page**

Open:

```text
http://localhost:5173/?page=testing
```

Verify metric values change when switching scenarios and no console error appears.

**Done when:** The page distinguishes hard legality from aesthetic completion.

**Commit:** `feat: display graph aesthetic optimization metrics`

## Task 13: Close Acceptance and Generated-Graph Regressions

**Owner:** `T1-aesthetic-acceptance`  
**Effort:** 5–8 hours  
**Parallel:** No.

**Files:**

- Modify: `src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`
- Modify: `src/engine/layout/custom/generatedGraph.test.ts`

- [ ] **Step 1: Run the unchanged aesthetic suite**

Run:

```bash
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
```

If a named scenario fails, report the exact metric, edge IDs, port sides, route points, and badge leader state to `O0`. Do not change expected thresholds.

- [ ] **Step 2: Add all-20 ordinary leader coverage**

For every scenario:

```ts
expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
```

Feedback leaders remain allowed.

- [ ] **Step 3: Add all-20 score non-regression**

Expose or use an internal test helper to evaluate the optimizer’s initial state and final state. Assert:

```ts
expect(compareLayoutScore(finalScore, initialScore)).toBeLessThanOrEqual(0);
```

- [ ] **Step 4: Add port uniqueness to all 20 scenarios**

For each node:

1. Collect every incident source and target `PortRef.point`.
2. Convert to `${x.toFixed(3)},${y.toFixed(3)}`.
3. Assert set size equals incidence count.

- [ ] **Step 5: Strengthen generated high-degree graphs**

For generated high-degree hub cases:

- Hard validation remains valid.
- No ordinary leaders.
- No duplicate port points.
- Input reversal remains deterministic.
- Optimization stats stay within configured bounds.

Do not require zero crossings for an arbitrary generated non-planar graph.

- [ ] **Step 6: Add a “crossings never worsen” property**

For every generated graph:

```ts
expect(final.metrics.crossingCount).toBeLessThanOrEqual(initial.metrics.crossingCount);
```

- [ ] **Step 7: Run focused regression**

Run:

```bash
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
bun test src/engine/layout/custom/generatedGraph.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
```

Expected: all pass.

- [ ] **Step 8: Run the entire automated gate**

Run:

```bash
bun test
bun run typecheck
bun run lint
bun run format:check
```

Expected:

- All tests pass.
- Typecheck exits `0`.
- Lint exits `0`.
- Format check exits `0`.

If formatting fails, run `bun run format` only on files modified by V3 agents, then rerun all four commands.

**Done when:** Legal, aesthetic, deterministic, and generated-graph tests all pass without weakened assertions.

**Commit:** `test: close v3 graph aesthetic acceptance`

## Task 14: Orchestrator Final Integration and Visual Verification

**Owner:** `O0-orchestrator`  
**Effort:** 4–6 hours  
**Parallel:** No writes by other agents.

**Files:**

- Modify: `docs/planning/custom-directed-graph-layout-routing-engine-v3-progress.md`

- [ ] **Step 1: Review every task commit**

For each commit:

1. Confirm only owned files changed.
2. Confirm the focused test was added before behavior.
3. Confirm no third-party layout dependency was added.
4. Confirm no scenario-ID branch exists in production code.
5. Confirm no hard validator rule was weakened.

- [ ] **Step 2: Run the final automated gate**

Run:

```bash
bun test
bun run typecheck
bun run lint
bun run format:check
bun run build:local
```

Record exact totals and exit codes.

- [ ] **Step 3: Record final metrics for all 20 scenarios**

At minimum record:

```text
scenario
hard errors
crossings
ordinary leaders
feedback leaders
hairpins
bends
length
area
optimization passes
```

- [ ] **Step 4: Visually inspect Scenario #5**

Verify:

- No crossing markers.
- Messages 5, 6, and 7 leave the Dispatcher in angular order.
- Message 3 does not use a three-corner route when a shorter two-bend route exists.
- Every source port is visibly distinct.

- [ ] **Step 5: Visually inspect Scenario #6**

Verify:

- Aggregator is centered beneath the sensors.
- Arrival points are distinct.
- At least two target sides are used.
- Horizontal trunks are nested without intersection.

- [ ] **Step 6: Visually inspect Scenarios #8, #14, and #16**

Verify:

- Scenario #8 expands peer spacing and places `horizontal sync` directly.
- Scenario #14 places all three protocol badges directly with distinct tracks.
- Scenario #16 routes A→B into B’s top side and shows all badges without leaders.

- [ ] **Step 7: Visually inspect Scenario #20**

Verify:

- No crossing markers.
- Ordinary badges have no dotted associations.
- Nearby service connections do not take graph-wide detours.
- Feedback edges use outer corridors only where a local route is worse or blocked.
- No edge has an unexplained three-or-more-corner path.

- [ ] **Step 8: Inspect graph expansion**

Confirm the SVG/view box contains the expanded graph and badges. Empty viewport space is acceptable. No layout may be compressed solely to reduce area.

- [ ] **Step 9: Run a determinism replay**

Reload the testing page and switch through `#5 → #6 → #8 → #14 → #16 → #20` twice. Metrics and geometry must not change.

- [ ] **Step 10: Complete the progress ledger**

Record:

- Every merged SHA.
- Final automated results.
- Final scenario metrics.
- Any unavoidable remaining crossings on generated graphs.
- Confirmation that the six named scenarios meet V3 targets.

**Done when:** Automated gates pass and the six named scenarios satisfy the visual checklist.

**Commit:** `docs: complete v3 graph aesthetic verification`

## Merge Gates

`O0` runs these after every production-code merge:

```bash
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun run typecheck
```

After Tasks 9, 10, and 11, also run:

```bash
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
```

After every wave:

```bash
bun test
bun run lint
```

Do not merge the next wave when a gate fails. Assign the failure back to the commit owner unless the failure is in a separately owned integration contract.

## Debugging Output Required from Workers

When an aesthetic test fails, the worker must report this exact data:

```ts
{
  scenarioId,
  edgeId,
  sourceSide,
  sourcePoint,
  targetSide,
  targetPoint,
  routePoints,
  crossingPartners,
  bends,
  hairpins,
  badgeRect,
  badgeHasLeader,
  layoutScore,
}
```

Do not report only a screenshot or “looks wrong.”

## Risks and Mitigations

| Risk                                                   | Impact | Mitigation                                                                                      |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------- |
| Port search becomes combinatorial                      | High   | Conflict-directed single-edge moves; fixed alternatives and state caps                          |
| Graph expands indefinitely                             | High   | Exact spacing minima, repeated-state detection, bounded passes; no arbitrary size cap           |
| Zero-crossing priority creates huge detours            | Medium | Bends and length decide after crossings; spacing and port moves are compared as complete states |
| Fan-in centering fix breaks variable-size nodes        | High   | Weighted isotonic projection includes node widths and existing gap overrides                    |
| Ordinary badge has no direct candidate                 | High   | Return a spacing request; never silently add a leader                                           |
| Feedback routes always use outer corridors             | Medium | Compare unrestricted, left corridor, and right corridor candidates                              |
| Parallel agents edit shared files                      | High   | Exclusive file ownership and orchestrator-mediated contract requests                            |
| Existing dirty worktree is lost                        | High   | Never reset/stash/delete; record state before worktree creation                                 |
| Aesthetic tests overfit coordinates                    | Medium | Assert topology, metrics, port sides, and monotonicity instead of full coordinate snapshots     |
| Non-planar generated graph cannot reach zero crossings | Low    | Require non-worsening, not zero, outside the named planar scenarios                             |

## Final Agent Grouping and Test Ownership

This section intentionally repeats the execution contract for the handoff model.

### Same-Agent Sequential Chains

- `C1`: Task 1 → Task 2.
- `S1`: Task 4 → Task 5.
- `P1`: Task 6 → Task 7.
- `R1`: Task 8 → Task 9.
- `T1`: Task 3 → wait for integration → Task 13.
- `O0`: Task 0 → all merge gates → Task 14.

Do not split any chain between different agents. The second task depends on implementation details and test knowledge from the first.

### Independent Parallel Work

- Wave 4: `S1` Task 4, `P1` Task 6, and `R1` Task 8.
- Wave 5: `S1` Task 5, `P1` Task 7, and `B1` Task 10.
- Wave 6: `R1` Task 9 and `U1` Task 12.

These tasks have separate writable files. They may run in parallel only after their entry gates are merged.

### Test Ownership by Scenario

| Scenario or property                         | Module reproduction owner | Acceptance owner      | Final visual owner |
| -------------------------------------------- | ------------------------- | --------------------- | ------------------ |
| #5 fan-out crossing and port order           | `P1`, `R1`                | `T1`                  | `O0`               |
| #6 fan-in centering and crossings            | `S1`, `R1`                | `T1`                  | `O0`               |
| #8 badge-aware peer gap                      | `S1`, `B1`                | `T1`                  | `O0`               |
| #14 parallel badges and unique tracks        | `S1`, `B1`, `R1`          | `T1`                  | `O0`               |
| #16 top arrival and direct badges            | `P1`, `B1`                | `T1`                  | `O0`               |
| #20 crossings, leaders, and feedback detours | `R1`, `B1`, `G1`          | `T1`                  | `O0`               |
| Objective priority                           | `C1`                      | `T1` non-regression   | `O0`               |
| Search bounds and convergence                | `G1`                      | `T1` generated graphs | `O0`               |
| UI metric accuracy                           | `U1`                      | Build gate            | `O0`               |

### Orchestrator Merge Order

Merge commits in this exact order:

```text
Task 0
Task 1
Task 2
Task 3
Task 4 / Task 6 / Task 8 in any order after all three focused tests pass
Task 5
Task 7
Task 10
Task 9
Task 12
Task 11
Task 13
Task 14
```

If a later task needs a contract change, the original contract owner makes a small dedicated patch first. Do not let the integrating agent edit another group’s file.

## Completion Definition

V3 is complete only when:

1. All automated tests pass.
2. Typecheck, lint, format check, and local build pass.
3. All 20 scenarios remain hard-valid and deterministic.
4. All 20 scenarios have zero ordinary badge leaders.
5. Scenarios #5, #6, #8, #14, #16, and #20 have zero crossings.
6. The named scenario-specific port, centering, bend, and badge requirements pass.
7. Generated graphs never regress from the initial layout score.
8. The testing page distinguishes hard legality from aesthetic completion.
9. The final progress ledger contains commits, commands, metrics, and visual verification.
