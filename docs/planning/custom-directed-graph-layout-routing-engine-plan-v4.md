# Custom Directed Graph Layout Routing Engine V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `executing-plans` to implement this plan task by task. The orchestrator must also use `subagent-driven-development` and `verification-before-completion`. Every implementation task must follow `test-driven-development`; every unexpected failure must follow `systematic-debugging`.

**Goal:** Finish the V3 visual contract without scenario-specific production branches, eliminate the current cyclic-graph timeout, replace the nested greedy searches with one deterministic conflict-directed layout search, and contain any remaining slow or faulty computation so it can never freeze or crash the testing page.

**Architecture:** Keep the existing dependency-free TypeScript engine and top-to-bottom ranked layout. Preserve the current legality kernel, node rendering freedom, and orthogonal route representation. Introduce a canonical logical search state, a bounded best-first frontier, route-search telemetry, exact label-lane demands, joint endpoint moves, and local layer-order moves. Add cooperative computation checkpoints that return the best complete result and a Web Worker watchdog that can terminate non-cooperative or accidentally infinite code. Spatial expansion remains unbounded; computational work and interactive runtime are bounded.

**Tech Stack:** TypeScript, Bun test runner, React, Vite, existing custom geometry/routing modules. Do not add Dagre, ELK, Graphviz, libavoid, a third-party priority queue, or another layout runtime.

---

## Start Here: Orchestrator and Agent Groups

One persistent orchestrator owns the entire run. Workers operate in isolated worktrees or branches and may edit only their assigned files.

| Agent               | Persistent responsibility                                             | Tasks, in order           | Exclusive production ownership                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `O0-orchestrator`   | Baseline, merge gates, final visual audit                             | 0 → every merge gate → 13 | V4 progress ledger only                                                                                                                                                                            |
| `T1-acceptance`     | Immutable acceptance contract and final regression                    | 1 → wait → 12             | `customLayoutAestheticAcceptance.test.ts`, `generatedGraph.test.ts`, isolated test-runner helper                                                                                                   |
| `C1-contracts`      | Shared search types, score fields, and configuration                  | 2                         | `types.ts`, `config.ts`, `config.test.ts`, `layoutObjective.ts`, `layoutObjective.test.ts`                                                                                                         |
| `R1-routing-kernel` | A* performance and conflict-component rerouting                       | 3 → 4                     | `routeSearch.ts`, `routeSearch.test.ts`, `routingGrid.ts`, `routingGrid.test.ts`, `routeOccupancy.ts`, `routeOccupancy.test.ts`, `edgeRouter.ts`, `edgeRouter.test.ts`                             |
| `P1-port-state`     | Role-aware side selection and explicit attachment ordering            | 5                         | `portCandidates.ts`, `portCandidates.test.ts`, `portAssignment.ts`, `portAssignment.test.ts`, `portDistribution.ts`, `portDistribution.test.ts`, new `portOrdering.ts`, new `portOrdering.test.ts` |
| `B1-label-lanes`    | Direct badge association, best badge assignment, exact space requests | 6                         | `badgePlacement.ts`, `badgePlacement.test.ts`, `spacingDemand.ts`, `spacingDemand.test.ts`, new `labelLanePlanner.ts`, new `labelLanePlanner.test.ts`                                              |
| `L1-layer-state`    | Searchable rank-local ordering and coordinate preservation            | 7                         | `crossingMinimization.ts`, `crossingMinimization.test.ts`, `coordinateAssignment.ts`, `coordinateAssignment.test.ts`, `nodeLayout.ts`, `nodeLayout.test.ts`                                        |
| `G1-global-search`  | Logical search, optimization integration, cooperative recovery        | 8 → 9 → 10 → 11A          | `optimizeLayout.ts`, `optimizeLayout.test.ts`, `computeCustomLayout.ts`, `computeCustomLayout.test.ts`, `computationBudget.ts`, `computationBudget.test.ts`, search-state and neighborhood files   |
| `W1-worker-safety`  | Worker protocol, hard watchdog, stale-run and retry control           | 11B                       | new `worker/` directory and its tests; reusable worker client/controller                                                                                                                           |
| `U1-diagnostics-ui` | Accurate diagnostics and recoverable testing-page state               | 11                        | `CustomLayoutMetrics.tsx`, `GraphTestingPage.tsx`, `GraphTestingModal.tsx`, graph-testing hook and debug overlay files if required                                                                 |

### Mandatory Agent Rules

1. `O0` creates the progress ledger before any worker starts.
2. `T1` commits the restored failing acceptance contract before production changes.
3. No production agent may edit either acceptance file.
4. No agent may weaken, skip, widen, or delete an assertion to obtain green.
5. No production code may branch on scenario ID, scenario title, node ID such as `COL`, or label text such as `horizontal sync`.
6. Keep one persistent agent for every sequential chain in the table.
7. Parallel agents must use separate worktrees or branches.
8. `O0` merges only a focused green commit and then runs the integration gate.
9. If a task needs a shared type change, request it from `C1`; do not edit `types.ts` from another branch.
10. A timeout increase is not a performance fix.
11. A larger graph is allowed. A larger search budget is not the default answer.
12. Do not replace the custom engine with another renderer or runner.
13. Do not call `computeCustomLayout` synchronously from a React render path.
14. `Promise.race`, `setTimeout`, or `AbortController` alone is not hard containment for synchronous JavaScript.
15. A timed-out or failed run must never auto-retry in a loop.
16. Preserve the last complete valid result; never render a partial or malformed worker message as valid geometry.
17. During Task 11A only, checkpoint wiring in earlier agents’ hot-loop files transfers to `G1`. `G1` may add guard calls but may not change those algorithms; any required algorithm change returns to the original owner.

### Concurrency Limit

Use at most three workers at once, plus `O0`.

### Parallel Waves

| Wave | Work allowed in parallel              | Entry gate                                     | Exit gate                                                     |
| ---- | ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| 0    | `O0` Task 0 only                      | Clean checkout of current `main`               | Baseline and ledger committed                                 |
| 1    | `T1` Task 1 and `C1` Task 2           | Wave 0                                         | Restored contract fails only at recorded gaps; contracts pass |
| 2    | `R1` Task 3, `P1` Task 5, `B1` Task 6 | Tasks 1 and 2 merged                           | Kernel, port, and label focused tests pass                    |
| 3    | `R1` Task 4 and `L1` Task 7           | Task 3 merged for `R1`; Task 2 merged for `L1` | Router and layer-state contracts pass                         |
| 4    | `G1` Task 8 only                      | Tasks 4–7 merged                               | Logical state evaluator and cache pass                        |
| 5    | `G1` Task 9 only                      | Task 8                                         | Neighborhood and frontier tests pass                          |
| 6    | `G1` Task 10 only                     | Task 9                                         | Named acceptance is green without weakened assertions         |
| 7    | `G1` Task 11A only                    | Task 10                                        | Cooperative abort and best-result recovery pass               |
| 8    | `W1` Task 11B only                    | Task 11A                                       | Worker watchdog and recovery-controller tests pass            |
| 9    | `U1` Task 11 and `T1` Task 12         | Task 11B                                       | UI/build and regression/performance gates pass                |
| 10   | `O0` Task 13 only                     | All worker commits merged                      | Automated and visual completion gates pass                    |

### Hard Dependencies

```text
Task 0
├── Task 1 ─┐
└── Task 2 ─┴─┬── Task 3 → Task 4 ─┐
              ├── Task 5 ──────────┤
              ├── Task 6 ──────────┼→ Task 8 → Task 9 → Task 10 → Task 11A
              └── Task 7 ──────────┘                                     │
                                                                          └→ Task 11B
                                                                             ├→ Task 11 ─┐
                                                                             └→ Task 12 ─┴→ Task 13
```

---

## Confirmed Current Status

The old file `docs/failure_report_graph_layout_engine.md` is not the current source of truth. It says “9 fail” but lists seven failing scenario IDs, and it predates the V3 aesthetic implementation.

The V3 progress ledger also is not complete. It marks Tasks 1–13 complete but leaves the final visual Task 14 unverified.

### Fresh Automated Baseline

Run on commit `ae15614e7236b5b73b285467ab74990215762919`:

| Gate                         | Current result                                     |
| ---------------------------- | -------------------------------------------------- |
| `bun test`                   | **254 pass, 1 fail**                               |
| Failing test                 | Random cyclic graph seed `101` times out           |
| Failing test duration        | About `80.6s` before Bun reports the `60s` timeout |
| Strict 20-scenario validator | `20 pass, 0 fail`                                  |
| Typecheck                    | Pass                                               |
| Lint                         | Pass                                               |
| Local build                  | Pass                                               |
| Format check                 | **Fail: 20 files**                                 |

The seed-101 cyclic graph has eight nodes, seven forward chain edges, and two feedback edges.

Measured work:

- `maxGlobalPasses: 1`: about `4.5s`, 2 crossings, 2 hairpins.
- `maxGlobalPasses: 2`: about `30s`, 1 crossing, 3 hairpins, 9 evaluated port states.
- The generated test computes the same logical case four times: initial, normal, reversed, and normal again.

### Current Named Scenario Matrix

| Scenario         | What now works                                              | Still uncovered                                                                                                         |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| #5 Fan-Out       | Hard-valid, 0 crossings, 0 leaders                          | `msg 3` has 3 bends; V3 required at most 2                                                                              |
| #6 Fan-In        | Hard-valid, 0 crossings, collector centered, 3 target sides | One 3-bend route remains; retain as a non-regression watch item                                                         |
| #8 Same-Rank     | Direct `horizontal sync` badge; exact 149px peer gap        | 1 crossing and 1 hairpin remain                                                                                         |
| #14 Parallel     | Unique ports, 0 crossings, no leader records                | All three ordinary badges are offset from their own routes without leaders; “no leader” currently hides detached labels |
| #16 Dense Badges | Hard-valid, 0 crossings, no leader records                  | A→B enters B from the right, not the top; one badge is detached from its route                                          |
| #20 DevOps       | Hard-valid; 0 ordinary leaders; local feedback routes       | 2 crossings, 3 badge/unrelated-edge overlaps, one 4-bend ordinary route, and 2 feedback leader badges                   |

Scenario #20 crossing pairs:

1. `e-NOTIF-AUTH-11` × `e-ORDER-CACHE-9`
2. `e-ORDER-DB-8` × `e-USER-PAY-5`

Scenario #20 badge/unrelated-edge conflicts:

1. `e-NOTIF-AUTH-11` badge × `e-AUTH-CACHE-3`
2. `e-ORDER-DB-8` badge × `e-PAY-ORDER-7`
3. `e-ORDER-PAY-6` badge × `e-ORDER-NOTIF-10`

### The Current Acceptance Test Was Weakened

Restore these V3 requirements:

- #5 lost the per-edge 2-bend maximum.
- #6 lost the collector-center assertion.
- #8 changed `crossingCount === 0` to `crossingCount <= 1`.
- #8 lost the explicit peer-gap assertion.
- #16 changed the required B target side from `top` to `top | right`.
- #20 lost `validation.isValid`.
- #20 lost `crossingCount === 0`.
- #20 changed ordinary-edge maximum bends from 3 to 4.
- The all-20 loop does not assert hard validity.

Passing the current aesthetic file therefore does not mean V3 is complete.

---

## Confirmed Root Causes

### Root Cause A: The Router Stops at Legality

`edgeRouter.ts` stops route-order exploration when the result is hard-valid with zero penetration and zero shared segments. It does not require zero crossings.

The rip-up loop also hard-caps itself with:

```ts
const maxPasses = Math.min(2, config.maxRipUpPasses);
```

This ignores the configured value and often evaluates only the first hard-valid order.

### Root Cause B: The Global Optimizer Stops Before Lower Objectives

`optimizeLayout.ts` exits when hard errors, crossings, ordinary leaders, and hairpins are zero. It ignores excess bends, directed-flow port semantics, badge/unrelated-edge warnings, length, side balance, and feedback leader quality.

That is why Scenario #5 returns after one pass even though `msg 3` still has 3 bends.

### Root Cause C: Accepted Port State Is Not Fully Persisted

The evaluated result contains complete actual side assignments, but the optimizer stores only one accepted explicit override:

```ts
explicitPortOverrides.set(eId, newAlt);
```

The next child state is not based on the complete accepted assignment. Unspecified edges are greedily reassigned again.

The optimizer also compares alternatives against `cands[0]` when no explicit override exists, not against the actual side assignment in `bestEval`.

### Root Cause D: Only Single-Edge Moves Exist

Crossings in #8 and #20 can require two coordinated endpoint changes, an attachment-order swap, a route-order change, or a local rank-order swap. The current search changes only one edge side pair per candidate.

It accepts the first improving candidate instead of the best candidate in the pass and can starve later defect edges after the per-pass state limit is filled.

### Root Cause E: A Rejected Spacing Move Ends the Search

After no single-port improvement, the engine creates one generic spacing expansion. If that state does not immediately beat the current best, the optimizer breaks instead of retaining other frontier candidates.

### Root Cause F: Layer Order Is Frozen Before Real Routing

Barycenter sweeps optimize a simplified inter-rank crossing estimate once. The global optimizer never changes `orderedLayers` after it sees real orthogonal crossings, badge lanes, or side assignments.

### Root Cause G: Badge “No Leader” Does Not Mean Direct Association

For ordinary edges, `generateBadgeCandidates` allows offset rings 1–3 while omitting `leaderPoints`. The UI draws no association line, so detached badges can pass `ordinaryLeaderCount === 0`.

In Scenario #14, the HTTP and WebSocket badges are 10px away from their routes. The gRPC badge is farther away.

### Root Cause H: Badge Assignment Returns First Feasible, Not Best

The backtracker stops at the first complete badge assignment. Badge/unrelated-edge intersections add a local score penalty, but the complete assignment search does not minimize total candidate score.

This leaves three avoidable warning conflicts in Scenario #20.

### Root Cause I: Dynamic Badge Requests Are Not Consumed

`placeEdgeBadges` can return `spacingRequests`, but `EvaluatedState` drops them. The optimizer uses generic `+40` rank gaps or `+30` node gaps instead of applying the exact request.

### Root Cause J: Pre-Layout Badge Spacing Uses the Wrong Axis

Cross-rank parallel labels add their badge heights to `rankGap`. Their badges are horizontal rectangles on adjacent vertical tracks, so collision avoidance also needs horizontal lane separation based on badge widths.

### Root Cause K: Hairpins Are Not Role-Aware

A left-up-right feedback corridor is counted as a hairpin even when the reversal is structurally necessary. Self-loops and long feedback edges therefore keep the aesthetic search active without an achievable zero.

This contributes directly to cyclic-graph search explosion.

### Root Cause L: A* Uses Expensive Data Structures and Queries

- The open set is a sorted array using `splice` and `shift`.
- Every candidate segment scans every occupancy segment.
- Every step scans every obstacle.
- The default route cap is a hardcoded 50,000 states.
- No expanded-state or cache telemetry is returned.

### Root Cause M: Test Work Is Duplicated and Invalid Generated Results Can Escape

`generatedGraph.test.ts`:

- returns early when a result is invalid, skipping the important assertions;
- computes the normal graph twice in addition to initial and reversed runs;
- uses only a wall-clock timeout, with no deterministic work-budget assertion.

### Root Cause N: Status Reporting Is Incorrect

`evaluateLayoutState` returns `success` whenever the layout is hard-valid and the router says success. Scenario #20 therefore displays “Valid” despite crossings, badge conflicts, and an unfinished aesthetic search.

### Root Cause O: Browser Computation Has No Kill Boundary

`GraphTestingPage.tsx` and `GraphTestingModal.tsx` call `computeCustomLayout` synchronously from `useMemo`. While that call is running:

- React cannot render a loading or failure state;
- the browser event loop cannot process a timeout callback;
- `Promise.race` cannot settle;
- `AbortController` cannot deliver cancellation;
- a scenario switch cannot supersede the active run;
- an infinite loop or extreme search can freeze or crash the tab.

This is a process-isolation problem in addition to an algorithm-performance problem. The algorithm still must be repaired, but only a terminable Worker boundary can contain non-cooperative code.

### Root Cause P: The Test Timeout Detects but Cannot Preempt Synchronous Work

The seed-101 test is configured with a `60s` timeout but reports only after the synchronous computation returns at about `80.6s`. Bun cannot interrupt a JavaScript callback that never yields. The timeout therefore detects the violation but does not protect the test runner or keep the suite short.

Expensive regression calls need two separate controls:

1. an internal deterministic work budget that the normal engine checks cooperatively;
2. an external Worker or subprocess deadline that can terminate code which fails to cooperate.

---

## Locked V4 Behavior

### Legality

All existing hard-validity rules remain unchanged.

### Spatial Policy

There is no maximum graph width, height, rank gap, node gap, or feedback-corridor distance. The engine may expand the graph whenever that produces a lexicographically better layout.

### Computational Policy

Search must remain bounded by deterministic work counts:

- evaluated logical states;
- A* expanded states;
- route candidates;
- conflict permutations;
- badge backtrack states.

Deterministic counts choose geometry. Wall-clock deadlines are a safety boundary only: they may stop computation and return the best complete result, but they must never rank two candidate geometries.

Check deterministic counters on every bounded search iteration. Check cancellation and the monotonic clock at a fixed sampling interval, such as every 64 iterations, so the check itself does not become a hot-path bottleneck.

### Runtime Containment Policy

Use all four layers; none replaces another:

1. **Efficient bounded engine:** Tasks 3–10 remove repeated and superlinear work.
2. **Cooperative recovery:** Task 11A checks budgets and cancellation, then returns the best complete historical result.
3. **Hard isolation:** Task 11B runs interactive computation in a dedicated Web Worker which the main thread can terminate.
4. **Recoverable UI:** Task 11 preserves the last good graph, reports the failure, and requires an explicit user retry.

The default interactive policy is progressive:

- publish the first complete valid layout as soon as it exists;
- publish later improvements without clearing the visible graph;
- use a `3_000ms` hard interactive watchdog;
- terminate the active Worker when the scenario or configuration changes;
- after timeout, keep the best complete result and mark it as incomplete;
- if no complete result exists, show a structured timeout state instead of fabricated geometry.

The exhaustive laboratory mode may use a `10_000ms` hard watchdog. These values are configuration, not score inputs. Do not increase them until profiling proves the deterministic budgets are already being respected.

Give cooperative exit enough time to serialize its best result before hard termination:

| Mode          | Engine cooperative deadline | Main-thread hard watchdog |
| ------------- | --------------------------- | ------------------------- |
| `interactive` | `2_400ms`                   | `3_000ms`                 |
| `exhaustive`  | `8_000ms`                   | `10_000ms`                |
| `safe`        | `1_000ms`                   | `1_500ms`                 |

The hard watchdog always wins if the engine fails to stop or serialize within the remaining headroom.

### Failure and Recovery Contract

The reusable UI controller has these states:

```text
idle
running
partial
complete
timed_out
cancelled
failed
```

Every run has a monotonically increasing `runId` and a canonical graph-plus-config hash.

- Ignore every message whose `runId` is not active.
- Validate finite coordinates, protocol version, result completeness, and hard geometry validity before replacing the last good result.
- Preserve the last complete valid result through timeout, Worker error, malformed message, render error, scenario change, and user retry.
- Do not retry automatically after a hard timeout or Worker crash.
- A manual retry creates a fresh Worker and a new `runId`.
- Safe retry uses lower deterministic work limits, not reduced validity rules.
- Development diagnostics may log a stack; user-facing UI shows a stable error code, stage, counters, and recovery action.
- A React error boundary contains rendering defects separately from engine/Worker defects.

### Objective Order

Keep the existing legality-first order, with these clarifications:

1. Hard errors.
2. Node/node overlap.
3. Edge/node penetration.
4. Shared edge length.
5. Badge/node overlap.
6. Badge/badge overlap.
7. Badge/unrelated-edge overlap.
8. Ordinary badge association failure.
9. Edge crossings.
10. Ordinary badge leaders.
11. Avoidable hairpins.
12. Excess bends above the role limit.
13. Total bends.
14. Directed-flow deviation.
15. Total route length.
16. Port-side imbalance.
17. Feedback badge leaders.
18. Total leader length.
19. Total area.

One unavoidable turnback in a self-loop or feedback corridor is not an avoidable hairpin.

### Completion Status

- `success`: hard-valid and no configured aesthetic defect remains.
- `unresolved_soft_conflicts`: hard-valid, but the deterministic search budget or frontier ended with crossings, badge warnings, ordinary leaders, avoidable hairpins, excess bends, or directed-flow defects.
- `invalid_hard_failure`: at least one hard error remains.

### Named Acceptance Targets

| Scenario | V4 target                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #5       | 0 crossings; 0 ordinary leaders; each edge ≤2 bends; angular order preserved                                                                                                                          |
| #6       | 0 crossings; centered collector; ≥2 target sides; unique ports; 0 ordinary leaders                                                                                                                    |
| #8       | 0 crossings; 0 avoidable hairpins; direct `horizontal sync`; required peer gap                                                                                                                        |
| #14      | 0 crossings; unique tracks and ports; all three badges centered on their own route segments                                                                                                           |
| #16      | 0 crossings; A→B targets B from `top`; all badges directly associated                                                                                                                                 |
| #20      | 0 crossings; 0 badge/unrelated-edge overlaps; 0 ordinary leaders; ordinary edges ≤3 bends; feedback edges ≤4 bends; local feedback routing preferred; direct feedback badges preferred before leaders |

### General Acceptance Targets

For all 20 scenarios:

- hard-valid;
- zero ordinary leaders;
- zero detached ordinary badges;
- unique incident port points;
- deterministic under input reversal;
- final score no worse than the initial score;
- result status matches its metrics.

---

## Task 0: Freeze the V4 Baseline

**Owner:** `O0-orchestrator`  
**Parallel:** No  
**Files:**

- Create: `docs/planning/custom-directed-graph-layout-routing-engine-v4-progress.md`

- [ ] **Step 0.1: Record repository state**

Run:

```bash
git status --short
git rev-parse HEAD
git log -1 --oneline
```

Record output verbatim. Never reset, stash, delete, or reformat existing work.

- [ ] **Step 0.2: Record fresh gates**

Run separately:

```bash
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
bun test src/engine/layout/custom/generatedGraph.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run build:local
```

Do not write “all tests pass.” Record the generated seed-101 timeout and the format failures.

- [ ] **Step 0.3: Record all 20 metrics**

For every scenario record:

```text
status
hard errors
badge/unrelated-edge overlaps
crossings
ordinary leaders
feedback leaders
avoidable hairpins
total bends
maximum edge bends
length
area
global/evaluated state counts
```

- [ ] **Step 0.4: Record named route defects**

Include edge IDs, roles, side pairs, simplified points, bend counts, crossing partners, badge rects, and leader state for #5, #8, #14, #16, and #20.

- [ ] **Step 0.5: Commit only the ledger**

```bash
git add docs/planning/custom-directed-graph-layout-routing-engine-v4-progress.md
git commit -m "docs: freeze v4 graph layout baseline"
```

**Done when:** The next worker can reproduce every current failure without reading the stale failure report.

---

## Task 1: Restore the Unweakened Acceptance Contract

**Owner:** `T1-acceptance`  
**Parallel:** Yes, with Task 2  
**Files:**

- Modify: `src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`

- [ ] **Step 1.1: Add reusable route helpers**

Add helpers that find a normalized edge by label, then find its route by edge ID. Fail immediately if either is missing.

- [ ] **Step 1.2: Assert common named requirements**

For `[5, 6, 8, 14, 16, 20]` assert:

```ts
expect(result.validation.isValid).toBe(true);
expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
expect(result.validation.metrics.crossingCount).toBe(0);
```

- [ ] **Step 1.3: Restore Scenario #5 bend limits**

Every `msg 1` through `msg 7` route must have at most two bends after simplification.

- [ ] **Step 1.4: Restore Scenario #6 centering**

Assert the collector center is within the middle 20% of the source-center span. Retain the two-side and unique-port requirements.

- [ ] **Step 1.5: Restore Scenario #8 exact checks**

Assert:

- zero crossings;
- zero avoidable hairpins;
- no leader on `horizontal sync`;
- the peer boundary gap is at least badge width plus two clearances.

- [ ] **Step 1.6: Define direct badge association**

Add a helper that returns true only when:

1. `leaderPoints` is absent;
2. `anchorPoint` is inside or on the badge rectangle;
3. the anchor lies on one segment of the owning route.

Use this helper for every ordinary badge in #14 and #16.

- [ ] **Step 1.7: Restore Scenario #16 top arrival**

Require:

```ts
expect(routeAB.targetPort.side).toBe("top");
```

- [ ] **Step 1.8: Restore Scenario #20**

Assert:

- hard-valid;
- zero crossings;
- zero badge/unrelated-edge overlaps;
- zero ordinary leaders;
- ordinary edges have at most three bends;
- feedback edges have at most four bends;
- `PAY → ORDER` is shorter than either full outer boundary corridor.

- [ ] **Step 1.9: Strengthen the all-20 loop**

Add:

```ts
expect(result.validation.isValid).toBe(true);
expect(result.status).not.toBe("invalid_hard_failure");
```

Also assert no detached ordinary badge.

- [ ] **Step 1.10: Run and record the red matrix**

```bash
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
```

Expected failures must include:

- #5 `msg 3` bend count;
- #8 crossing/hairpin;
- #14 detached badge association;
- #16 target side and detached badge association;
- #20 crossings, badge/edge overlaps, and 4-bend ordinary route.

Do not change these assertions in Task 12.

- [ ] **Step 1.11: Commit the red contract**

```bash
git add src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
git commit -m "test: restore v4 graph aesthetic contract"
```

**Done when:** The test fails only for confirmed implementation gaps and cannot pass detached labels as “direct.”

---

## Task 2: Add Shared Search Contracts and Deterministic Budgets

**Owner:** `C1-contracts`  
**Parallel:** Yes, with Task 1  
**Files:**

- Modify: `src/engine/layout/custom/types.ts`
- Modify: `src/engine/layout/custom/config.ts`
- Modify: `src/engine/layout/custom/config.test.ts`
- Modify: `src/engine/layout/custom/layoutObjective.ts`
- Modify: `src/engine/layout/custom/layoutObjective.test.ts`

- [ ] **Step 2.1: Add failing objective tests**

Lock:

- one badge/unrelated-edge overlap beats any reduction in crossings;
- zero crossings beats fewer bends;
- zero excess bends beats shorter length;
- one necessary feedback turnback does not increment avoidable hairpins;
- an ordinary hairpin still increments avoidable hairpins.

- [ ] **Step 2.2: Define role-aware route metrics**

Add:

```ts
interface RouteAestheticMetrics {
  avoidableHairpinCount: number;
  excessBendCount: number;
  maximumOrdinaryEdgeBends: number;
  maximumFeedbackEdgeBends: number;
}
```

Use limits of three ordinary bends and four feedback bends for the general engine. Named #5 remains stricter in acceptance.

- [ ] **Step 2.3: Define a complete logical search state**

Add contracts for:

```ts
interface LayoutSearchState {
  orderedLayerIds: string[][];
  spacing: CanonicalSpacingOverrides;
  graphPadding: number;
  portSides: Record<string, PortSideAssignment>;
  portOrders: Record<string, string[]>;
  routeOrderStrategy: RouteOrderStrategy;
}
```

The `portOrders` key is `${nodeId}:${side}`. Each value contains endpoint keys `${edgeId}:src|tgt`.

- [ ] **Step 2.4: Define exact spacing demands**

Replace ambiguous demand data with a contract that can represent:

- gap between two adjacent ranks;
- gap between two adjacent nodes;
- lane separation on X or Y;
- outer padding;
- affected edge IDs;
- required minimum;
- reason.

Keep a compatibility adapter until Task 10.

- [ ] **Step 2.5: Define deterministic search statistics**

Extend `OptimizationStats` with:

```ts
evaluatedLayoutStates;
generatedNeighborStates;
routeSearchCalls;
aStarExpandedStates;
routeCacheHits;
stateCacheHits;
stopReason;
```

`stopReason` is:

```text
objective-target
frontier-exhausted
layout-state-budget
route-state-budget
badge-state-budget
conflict-permutation-budget
deadline-exceeded
cancelled
repeated-logical-state
hard-failure
```

Do not store elapsed milliseconds in `CustomLayoutResult`; it would break deterministic deep equality.

- [ ] **Step 2.6: Add configuration bounds**

Add and validate:

```text
maxLayoutStates
maxFrontierSize
maxNeighborsPerState
maxAStarStatesPerRoute
maxConflictPermutationSize
maxConflictPermutations
maxRouteCandidatesPerEdge
maxBadgeStates
```

Do not increase the existing defaults as a substitute for Tasks 3–10.

- [ ] **Step 2.7: Update score construction**

Use role-aware hairpins and excess bends. Preserve lexicographic comparison and state-hash tie breaking.

- [ ] **Step 2.8: Run focused tests**

```bash
bun test src/engine/layout/custom/config.test.ts
bun test src/engine/layout/custom/layoutObjective.test.ts
bun run typecheck
```

- [ ] **Step 2.9: Commit**

```bash
git add src/engine/layout/custom/types.ts src/engine/layout/custom/config.ts src/engine/layout/custom/config.test.ts src/engine/layout/custom/layoutObjective.ts src/engine/layout/custom/layoutObjective.test.ts
git commit -m "refactor: define bounded graph layout search contracts"
```

**Done when:** All later agents can exchange complete logical states, exact demands, and deterministic work statistics without editing shared types.

---

## Task 3: Make Route Search Fast Before Expanding Search Breadth

**Owner:** `R1-routing-kernel`  
**Parallel:** Yes, with Tasks 5 and 6  
**Files:**

- Modify: `src/engine/layout/custom/routeSearch.ts`
- Modify: `src/engine/layout/custom/routeSearch.test.ts`
- Modify: `src/engine/layout/custom/routingGrid.ts`
- Modify: `src/engine/layout/custom/routingGrid.test.ts`
- Modify: `src/engine/layout/custom/routeOccupancy.ts`
- Modify: `src/engine/layout/custom/routeOccupancy.test.ts`

- [ ] **Step 3.1: Add a deterministic expanded-state test**

Create a seed-101-sized routing fixture. Assert the search returns the same path while staying below a recorded expanded-state ceiling.

Do not assert milliseconds in this unit test.

- [ ] **Step 3.2: Implement an internal binary min-heap**

Replace sorted-array `splice`/`shift` with a small local binary heap using the existing deterministic comparator.

Do not add a dependency.

- [ ] **Step 3.3: Skip stale queue entries**

When a popped state no longer equals the best `gCost` for its state key, discard it before expanding neighbors.

- [ ] **Step 3.4: Index occupancy by orientation and coordinate**

Build maps for:

- horizontal intervals by Y;
- vertical intervals by X.

For a candidate segment, query only collinear intervals on the same coordinate and perpendicular intervals whose coordinate falls inside its span.

- [ ] **Step 3.5: Precompute obstacle contact**

During grid construction, store whether each grid edge:

- is blocked;
- touches an obstacle boundary;
- is clear.

Do not rescan every obstacle for every A* step.

- [ ] **Step 3.6: Respect the configured route-state limit**

Replace hardcoded `50000` with `config.maxAStarStatesPerRoute`, while still allowing a narrower explicit test override.

- [ ] **Step 3.7: Return route-search statistics**

Return or accumulate:

- expanded states;
- pushed states;
- occupancy interval queries;
- termination reason.

- [ ] **Step 3.8: Preserve exact route semantics**

Rerun:

```bash
bun test src/engine/layout/custom/routeSearch.test.ts
bun test src/engine/layout/custom/routingGrid.test.ts
bun test src/engine/layout/custom/routeOccupancy.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
```

- [ ] **Step 3.9: Benchmark one seed-101 evaluation**

Run one public layout call with `maxGlobalPasses: 1`. Record work counts and wall time in the V4 ledger through `O0`.

Target: below `1.5s` on the baseline machine. If missed, profile the largest counter before continuing.

- [ ] **Step 3.10: Commit**

```bash
git add src/engine/layout/custom/routeSearch.ts src/engine/layout/custom/routeSearch.test.ts src/engine/layout/custom/routingGrid.ts src/engine/layout/custom/routingGrid.test.ts src/engine/layout/custom/routeOccupancy.ts src/engine/layout/custom/routeOccupancy.test.ts
git commit -m "perf: bound and index orthogonal route search"
```

**Done when:** Search work scales by deterministic counters and one seed-101 initial evaluation is no longer multi-second due to queue and full-scan overhead.

---

## Task 4: Route Conflict Components Instead of Stopping at First Legal Order

**Owner:** `R1-routing-kernel`  
**Parallel:** Yes, with Task 7  
**Depends on:** Task 3  
**Files:**

- Modify: `src/engine/layout/custom/edgeRouter.ts`
- Modify: `src/engine/layout/custom/edgeRouter.test.ts`

- [ ] **Step 4.1: Add failing early-stop tests**

Create fixtures proving:

1. first order is hard-valid with a crossing;
2. a later order is hard-valid with zero crossings;
3. the router must return the later order.

- [ ] **Step 4.2: Remove the legality-only order break**

Do not stop merely because penetration and shared length are zero.

An order can stop the router only when it reaches the router’s attainable lower bound:

- all edges routed;
- hard-valid;
- zero shared length;
- zero crossings;
- zero avoidable ordinary-route hairpins.

- [ ] **Step 4.3: Respect `maxRipUpPasses`**

Remove the hardcoded `Math.min(2, ...)`.

Termination is still bounded by:

- configured pass count;
- logical route signature;
- no-improvement frontier;
- route-state budget.

- [ ] **Step 4.4: Build crossing/conflict components**

Connect two edge IDs when they:

- cross;
- share positive collinear length;
- have an endpoint-stub conflict;
- participate in the same node penetration.

Reroute one connected component at a time.

- [ ] **Step 4.5: Evaluate bounded local permutations**

For a component of size up to `maxConflictPermutationSize`, evaluate deterministic edge-order permutations.

For larger components, evaluate:

- hardest-first;
- reverse;
- crossing-degree descending;
- longest-span first.

- [ ] **Step 4.6: Keep the best historical router state**

A rejected permutation must not destroy the best routes. Do not stop after the first non-improving permutation.

- [ ] **Step 4.7: Expose route-order strategy**

Allow `routeAllEdges` to evaluate one explicit `RouteOrderStrategy`. Task 9 will place this strategy in the global logical state.

Keep a compatibility default for direct callers.

- [ ] **Step 4.8: Add named router reproductions**

Before badges, assert:

- #8 can reach zero crossings under at least one bounded router state;
- #20 returns the best crossing count across all configured route-order strategies;
- no legality metric regresses.

- [ ] **Step 4.9: Run focused and strict gates**

```bash
bun test src/engine/layout/custom/edgeRouter.test.ts
bun test src/engine/layout/custom/routeSearch.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
```

- [ ] **Step 4.10: Commit**

```bash
git add src/engine/layout/custom/edgeRouter.ts src/engine/layout/custom/edgeRouter.test.ts
git commit -m "feat: reroute bounded edge conflict components"
```

**Done when:** The router cannot declare a crossing state final solely because it is legal.

---

## Task 5: Make Port Sides and Attachment Order Searchable Together

**Owner:** `P1-port-state`  
**Parallel:** Yes, with Tasks 3 and 6  
**Files:**

- Modify: `src/engine/layout/custom/portCandidates.ts`
- Modify: `src/engine/layout/custom/portCandidates.test.ts`
- Modify: `src/engine/layout/custom/portAssignment.ts`
- Modify: `src/engine/layout/custom/portAssignment.test.ts`
- Modify: `src/engine/layout/custom/portDistribution.ts`
- Modify: `src/engine/layout/custom/portDistribution.test.ts`
- Create: `src/engine/layout/custom/portOrdering.ts`
- Create: `src/engine/layout/custom/portOrdering.test.ts`

- [ ] **Step 5.1: Add role-aware side-cost tests**

Lock these defaults when higher-priority conflicts tie:

- forward downward edge: source bottom, target top;
- same-rank edge: mutually facing sides;
- local feedback edge: shortest legal facing sides;
- outer feedback corridor: outward sides only when local is blocked or worse.

- [ ] **Step 5.2: Use the edge role**

Remove the unused `_role` parameter. Add explicit flow-side deviation to the candidate cost.

Do not forbid side and top/bottom alternatives. They remain necessary for congestion relief.

- [ ] **Step 5.3: Preserve the full accepted assignment**

Provide conversion helpers between route results and a complete `Record<edgeId, PortSideAssignment>`.

No child search state may fall back to `cands[0]` when the parent has an actual assignment.

- [ ] **Step 5.4: Accept explicit endpoint order overrides**

Extend `distributePorts` so each `${nodeId}:${side}` may receive a full ordered endpoint-key array.

Unspecified sides continue using projected remote angle.

- [ ] **Step 5.5: Generate adjacent order-swap moves**

For each side with at least two endpoints, generate deterministic adjacent swaps.

Only generate swaps involving edges named in a current crossing, shared segment, or badge conflict.

- [ ] **Step 5.6: Generate coordinated pair-side moves**

Given a defect edge pair, enumerate:

- change edge A only;
- change edge B only;
- change both;
- swap their side choices where legal;
- keep sides and swap attachment order.

Deduplicate by canonical port-state hash.

- [ ] **Step 5.7: Preserve fan-out angular order**

The default projection for Dispatcher messages 5–7 must remain monotone. An explicit override may change it only when the complete layout score improves.

- [ ] **Step 5.8: Add Scenario #16 heuristic test**

For the A→B edge, when legality, crossings, leaders, hairpins, and bends tie, top entry must beat right entry due to directed-flow deviation.

- [ ] **Step 5.9: Run focused tests**

```bash
bun test src/engine/layout/custom/portCandidates.test.ts
bun test src/engine/layout/custom/portAssignment.test.ts
bun test src/engine/layout/custom/portDistribution.test.ts
bun test src/engine/layout/custom/portOrdering.test.ts
bun run typecheck
```

- [ ] **Step 5.10: Commit**

```bash
git add src/engine/layout/custom/portCandidates.ts src/engine/layout/custom/portCandidates.test.ts src/engine/layout/custom/portAssignment.ts src/engine/layout/custom/portAssignment.test.ts src/engine/layout/custom/portDistribution.ts src/engine/layout/custom/portDistribution.test.ts src/engine/layout/custom/portOrdering.ts src/engine/layout/custom/portOrdering.test.ts
git commit -m "feat: search joint graph port sides and ordering"
```

**Done when:** The optimizer can express the coordinated endpoint moves needed by #8, #16, and #20 without special cases.

---

## Task 6: Plan Real Label Lanes and Forbid Detached Ordinary Badges

**Owner:** `B1-label-lanes`  
**Parallel:** Yes, with Tasks 3 and 5  
**Files:**

- Modify: `src/engine/layout/custom/badgePlacement.ts`
- Modify: `src/engine/layout/custom/badgePlacement.test.ts`
- Modify: `src/engine/layout/custom/spacingDemand.ts`
- Modify: `src/engine/layout/custom/spacingDemand.test.ts`
- Create: `src/engine/layout/custom/labelLanePlanner.ts`
- Create: `src/engine/layout/custom/labelLanePlanner.test.ts`

- [ ] **Step 6.1: Add a failing detached-label test**

For an ordinary edge:

- ring 0 may be direct;
- any offset ring without `leaderPoints` is illegal;
- ordinary candidates never contain leader points.

- [ ] **Step 6.2: Define direct association**

An ordinary badge candidate is direct only if its anchor is inside the badge rectangle and lies on the owning route segment.

Generate only direct candidates for ordinary edges.

- [ ] **Step 6.3: Preserve feedback fallback order**

For feedback/self edges:

1. direct candidates;
2. local perpendicular leader candidates;
3. outer candidates.

Do not generate an outer leader before all legal local candidates.

- [ ] **Step 6.4: Minimize complete badge assignment cost**

Replace “first complete solution wins” with deterministic branch-and-bound.

The complete assignment cost compares:

1. unresolved badges;
2. badge/node overlap;
3. badge/badge overlap;
4. badge/unrelated-edge intersections;
5. ordinary association failures;
6. leader role/count;
7. leader length;
8. candidate offset;
9. midpoint deviation.

Keep `maxBadgeBacktrackSteps`.

- [ ] **Step 6.5: Calculate label demands by route orientation**

For a horizontal direct segment:

- required segment span uses badge width;
- separation along Y uses badge height.

For a vertical direct segment:

- required segment span uses badge height;
- separation along X uses badge width.

- [ ] **Step 6.6: Plan parallel label lanes**

Group edges by:

- endpoint pair;
- intended segment orientation;
- rank corridor.

Reserve pairwise lane separation using half widths/heights plus clearance, not only the sum of badge heights.

- [ ] **Step 6.7: Emit exact post-route demands**

When no direct ordinary candidate exists, return the smallest specific demand:

- rank gap;
- node gap;
- X lane separation;
- Y lane separation;
- graph padding.

Include all affected edge IDs.

- [ ] **Step 6.8: Add scenario tests**

Assert:

- #14 produces three direct, non-overlapping badge slots;
- #16 produces direct slots for all three labels;
- #20 badge assignment prefers zero unrelated-edge intersections when a legal candidate combination exists.

These tests may call the label planner with fixed routes. Global geometry remains Task 10.

- [ ] **Step 6.9: Run focused tests**

```bash
bun test src/engine/layout/custom/badgePlacement.test.ts
bun test src/engine/layout/custom/spacingDemand.test.ts
bun test src/engine/layout/custom/labelLanePlanner.test.ts
bun run typecheck
```

- [ ] **Step 6.10: Commit**

```bash
git add src/engine/layout/custom/badgePlacement.ts src/engine/layout/custom/badgePlacement.test.ts src/engine/layout/custom/spacingDemand.ts src/engine/layout/custom/spacingDemand.test.ts src/engine/layout/custom/labelLanePlanner.ts src/engine/layout/custom/labelLanePlanner.test.ts
git commit -m "feat: reserve direct graph edge label lanes"
```

**Done when:** “Zero leaders” can no longer hide a detached ordinary badge, and label collisions produce exact actionable space requests.

---

## Task 7: Add Rank-Local Layer Order to the Search State

**Owner:** `L1-layer-state`  
**Parallel:** Yes, with Task 4  
**Files:**

- Modify: `src/engine/layout/custom/crossingMinimization.ts`
- Modify: `src/engine/layout/custom/crossingMinimization.test.ts`
- Modify: `src/engine/layout/custom/coordinateAssignment.ts`
- Modify: `src/engine/layout/custom/coordinateAssignment.test.ts`
- Modify: `src/engine/layout/custom/nodeLayout.ts`
- Modify: `src/engine/layout/custom/nodeLayout.test.ts`

- [ ] **Step 7.1: Add explicit-order coordinate tests**

Given an `orderedLayerIds` state, coordinate assignment must:

- preserve that exact within-rank order;
- preserve node gaps;
- preserve rank gaps;
- remain deterministic.

- [ ] **Step 7.2: Export canonical layer-order helpers**

Add helpers to:

- serialize layer order;
- validate every node appears exactly once in its assigned rank;
- rebuild `LayerNode[][]` from IDs.

- [ ] **Step 7.3: Generate local adjacent swaps**

Given defect node IDs or edge endpoints, generate adjacent swaps only in affected ranks.

Never move a node to a different rank.

- [ ] **Step 7.4: Include real-route hints**

Allow the move generator to prioritize swaps involving endpoints of actual crossing pairs rather than only barycenter-estimated crossings.

- [ ] **Step 7.5: Preserve fan-in centering**

After any order or spacing move, a single high-degree collector beneath a source rank must remain within the middle 20% of the source span unless a higher-priority legality constraint makes it impossible.

- [ ] **Step 7.6: Preserve deterministic components**

Disconnected component ordering remains stable by canonical component ID. Rank-local swaps may not interleave unrelated components.

- [ ] **Step 7.7: Add #20 local-order fixture**

Prove the module can generate the adjacent rank-local swaps around `ORDER`, `USER`, `PAY`, and `DB` without encoding those IDs in production.

- [ ] **Step 7.8: Run focused tests**

```bash
bun test src/engine/layout/custom/crossingMinimization.test.ts
bun test src/engine/layout/custom/coordinateAssignment.test.ts
bun test src/engine/layout/custom/nodeLayout.test.ts
bun run typecheck
```

- [ ] **Step 7.9: Commit**

```bash
git add src/engine/layout/custom/crossingMinimization.ts src/engine/layout/custom/crossingMinimization.test.ts src/engine/layout/custom/coordinateAssignment.ts src/engine/layout/custom/coordinateAssignment.test.ts src/engine/layout/custom/nodeLayout.ts src/engine/layout/custom/nodeLayout.test.ts
git commit -m "feat: expose searchable rank-local node order"
```

**Done when:** Real routing conflicts can request a local layer-order move without recomputing or discarding the rest of the graph.

---

## Task 8: Evaluate and Cache Complete Logical Layout States

**Owner:** `G1-global-search`  
**Parallel:** No  
**Depends on:** Tasks 4–7  
**Files:**

- Create: `src/engine/layout/custom/layoutSearchState.ts`
- Create: `src/engine/layout/custom/layoutSearchState.test.ts`
- Modify: `src/engine/layout/custom/optimizeLayout.ts`
- Modify: `src/engine/layout/custom/optimizeLayout.test.ts`

- [ ] **Step 8.1: Add state-hash tests**

Assert the logical hash changes for:

- layer order;
- exact spacing;
- graph padding;
- one port side;
- one port order;
- route-order strategy.

Map insertion order and object property order must not change the hash.

- [ ] **Step 8.2: Separate logical and rendered hashes**

Keep the rendered geometry hash for output diagnostics.

Use the logical-state hash for:

- visited-state detection;
- state cache;
- neighbor deduplication.

- [ ] **Step 8.3: Build an immutable initial state**

The initial state contains:

- barycenter layer order;
- pre-layout exact badge demands;
- no explicit port overrides;
- default projected port order;
- initial route-order strategy.

- [ ] **Step 8.4: Evaluate one state exactly once**

The evaluator performs:

```text
logical layer order
→ coordinates with exact spacing
→ full port sides and endpoint orders
→ one explicit route-order strategy
→ route result
→ minimum-cost badge assignment
→ validation
→ complete score
→ exact unresolved spacing requests
```

- [ ] **Step 8.5: Persist the complete evaluated port state**

The evaluated object must contain every actual port side and every actual attachment order.

All child states copy the complete parent state before applying a move.

- [ ] **Step 8.6: Preserve badge spacing requests**

Store `badgeResult.spacingRequests` in the evaluated state. Do not convert them to generic increments.

- [ ] **Step 8.7: Add state and route caches**

At minimum:

- logical state → evaluated result;
- node geometry + complete port state + route strategy → router result.

Count cache hits in `OptimizationStats`.

- [ ] **Step 8.8: Add non-regression tests**

Assert:

- repeated logical evaluation returns deep-equal geometry;
- the second evaluation hits the cache;
- changing one state field misses the correct cache;
- the best historical result is never overwritten by a worse state.

- [ ] **Step 8.9: Run focused tests**

```bash
bun test src/engine/layout/custom/layoutSearchState.test.ts
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun run typecheck
```

- [ ] **Step 8.10: Commit**

```bash
git add src/engine/layout/custom/layoutSearchState.ts src/engine/layout/custom/layoutSearchState.test.ts src/engine/layout/custom/optimizeLayout.ts src/engine/layout/custom/optimizeLayout.test.ts
git commit -m "refactor: evaluate complete graph layout search states"
```

**Done when:** The optimizer no longer loses accepted port state or reevaluates identical logical states.

---

## Task 9: Replace First-Improvement Loops with a Conflict-Directed Frontier

**Owner:** `G1-global-search`  
**Parallel:** No  
**Depends on:** Task 8  
**Files:**

- Create: `src/engine/layout/custom/layoutNeighborhood.ts`
- Create: `src/engine/layout/custom/layoutNeighborhood.test.ts`
- Modify: `src/engine/layout/custom/optimizeLayout.ts`
- Modify: `src/engine/layout/custom/optimizeLayout.test.ts`

- [ ] **Step 9.1: Add failing local-minimum tests**

Create fixtures where:

1. neither single-edge move improves;
2. a coordinated pair move removes a crossing;
3. the search must retain both candidates until the pair move is evaluated.

Add a second fixture where one rejected spacing move must not terminate the frontier.

- [ ] **Step 9.2: Build a defect index**

For each evaluated state, index:

- hard diagnostics;
- badge/unrelated-edge pairs;
- crossing edge pairs;
- ordinary leaders;
- detached badges;
- avoidable hairpins;
- excess-bend edges;
- directed-flow deviations.

- [ ] **Step 9.3: Generate neighbors in priority order**

For the highest-priority remaining defect generate:

1. exact badge/lane spacing demands;
2. single port-side moves;
3. crossing-pair port moves;
4. attachment-order swaps;
5. route-order changes;
6. local conflict permutations;
7. rank-local adjacent swaps;
8. graph-padding expansion for true outer-corridor demand.

- [ ] **Step 9.4: Use a bounded best-first frontier**

The frontier sorts by:

1. complete `LayoutScore`;
2. logical state hash.

Keep at most `maxFrontierSize`. Evaluate at most `maxLayoutStates`.

- [ ] **Step 9.5: Select the best candidates, not the first improvement**

Evaluate the bounded neighbor set. Enqueue every unseen state that is:

- better than its parent; or
- a permitted plateau bridge involved in a coordinated move.

Never immediately replace the global best with the first improvement and break.

- [ ] **Step 9.6: Bound plateau bridges**

A plateau bridge must:

- keep all higher-priority score fields equal;
- change the targeted port/order/layer state;
- consume one explicit plateau allowance;
- never re-enter a seen logical state.

- [ ] **Step 9.7: Stop for explicit reasons**

Do not use the current partial early-exit condition.

Stop only for:

- objective target reached and finishing neighbors exhausted;
- frontier exhausted;
- layout-state budget;
- route-state budget;
- hard failure with no legal neighbor.

- [ ] **Step 9.8: Add defect starvation tests**

When `maxNeighborsPerState` is smaller than all possible moves, allocate at least one candidate per defect pair before allocating second alternatives to the first edge.

- [ ] **Step 9.9: Add deterministic replay**

Run the same graph twice and reverse input order. Results and work counters must match.

- [ ] **Step 9.10: Run focused tests**

```bash
bun test src/engine/layout/custom/layoutNeighborhood.test.ts
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun run typecheck
```

- [ ] **Step 9.11: Commit**

```bash
git add src/engine/layout/custom/layoutNeighborhood.ts src/engine/layout/custom/layoutNeighborhood.test.ts src/engine/layout/custom/optimizeLayout.ts src/engine/layout/custom/optimizeLayout.test.ts
git commit -m "feat: search conflict-directed graph layout frontier"
```

**Done when:** A coordinated improvement can cross a one-move plateau without unbounded enumeration.

---

## Task 10: Integrate Exact Expansion, Status, and Named Scenario Closure

**Owner:** `G1-global-search`  
**Parallel:** No  
**Depends on:** Task 9  
**Files:**

- Modify: `src/engine/layout/custom/optimizeLayout.ts`
- Modify: `src/engine/layout/custom/optimizeLayout.test.ts`
- Modify: `src/engine/layout/custom/computeCustomLayout.ts`
- Modify: `src/engine/layout/custom/computeCustomLayout.test.ts`

- [ ] **Step 10.1: Consume exact spacing demands**

Apply each demand to the smallest affected state field.

Do not add `+30` or `+40` generically.

- [ ] **Step 10.2: Re-evaluate after demand application**

After coordinates expand:

- preserve layer order;
- preserve the full parent port state when legal;
- recompute physical port points;
- reroute;
- replace the badge demand only if the new evaluation proves it satisfied.

- [ ] **Step 10.3: Continue after a rejected expansion**

A rejected expansion is one evaluated neighbor. It does not empty the frontier and does not end the search.

- [ ] **Step 10.4: Calculate correct public status**

Implement the locked three-state semantics.

Add tests where:

- hard-valid + crossing → `unresolved_soft_conflicts`;
- hard-valid + badge warning → `unresolved_soft_conflicts`;
- hard-valid + excess bend → `unresolved_soft_conflicts`;
- completed aesthetic target → `success`.

- [ ] **Step 10.5: Close Scenario #5**

Confirm the search sees `msg 3` as an excess-bend defect even when crossings and leaders are already zero.

Do not add a Scenario #5 branch.

- [ ] **Step 10.6: Close Scenario #8**

Use the crossing pair to evaluate joint ports, endpoint order, route order, and local spacing. Return zero crossings and zero avoidable hairpins.

- [ ] **Step 10.7: Close Scenario #14**

Use direct label lanes. Do not pass by offsetting labels without association.

- [ ] **Step 10.8: Close Scenario #16**

Ensure the directed-flow objective makes top entry win after higher-priority fields tie.

- [ ] **Step 10.9: Close Scenario #20**

The conflict frontier must address both crossing pairs and all three badge/edge pairs.

Reject a state that shortens the graph while reintroducing any higher-priority conflict.

- [ ] **Step 10.10: Verify search bounds**

For every named scenario:

```ts
expect(stats.evaluatedLayoutStates).toBeLessThanOrEqual(config.maxLayoutStates);
expect(stats.aStarExpandedStates).toBeLessThanOrEqual(derivedRouteBudget);
```

- [ ] **Step 10.11: Run integration gates**

```bash
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun test src/engine/layout/custom/computeCustomLayout.test.ts
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun run typecheck
```

Expected: named aesthetic and strict suites pass unchanged.

- [ ] **Step 10.12: Commit**

```bash
git add src/engine/layout/custom/optimizeLayout.ts src/engine/layout/custom/optimizeLayout.test.ts src/engine/layout/custom/computeCustomLayout.ts src/engine/layout/custom/computeCustomLayout.test.ts
git commit -m "feat: complete bounded graph layout optimization"
```

**Done when:** All named geometry requirements pass and the result status honestly reports remaining soft defects.

---

## Task 11A: Add Cooperative Budgets and Best-Complete-Result Recovery

**Owner:** `G1-global-search`  
**Parallel:** No; keep this with the agent that implemented Tasks 8–10  
**Depends on:** Task 10  
**Files:**

- Create: `src/engine/layout/custom/computationBudget.ts`
- Create: `src/engine/layout/custom/computationBudget.test.ts`
- Modify: `src/engine/layout/custom/optimizeLayout.ts`
- Modify: `src/engine/layout/custom/optimizeLayout.test.ts`
- Modify: `src/engine/layout/custom/computeCustomLayout.ts`
- Modify: `src/engine/layout/custom/computeCustomLayout.test.ts`
- Modify hot-loop files from Tasks 3–10 only to wire the shared guard; this is the phase-specific ownership transfer from Rule 17

- [ ] **Step 11A.1: Add failing budget-guard tests**

Cover:

- each deterministic counter limit;
- an already-aborted `AbortSignal`;
- a deadline using an injected fake monotonic clock;
- fixed-interval clock sampling;
- the exact abort reason and checkpoint counters.

- [ ] **Step 11A.2: Define execution-only control**

Create:

```ts
interface LayoutExecutionControl {
  maxElapsedMs?: number;
  signal?: AbortSignal;
  now?: () => number;
  checkpointEvery?: number;
  onBestCompleteResult?: (result: CustomLayoutResult) => void;
}
```

This is an optional final argument to the public computation call. Do not put the clock, signal, callback, or elapsed time in `CustomLayoutResult`.

- [ ] **Step 11A.3: Define one internal abort**

Create `LayoutComputationAbort` with:

- reason;
- active stage;
- deterministic counters;
- whether a complete result exists.

Allowed reasons are `cancelled`, `deadline-exceeded`, `layout-state-budget`, `route-state-budget`, `badge-state-budget`, and `conflict-permutation-budget`.

- [ ] **Step 11A.4: Centralize all counter increments**

The budget guard owns increments for:

- layout states;
- route states;
- A* expansions;
- badge states;
- conflict permutations.

Do not maintain shadow counters in individual loops.

- [ ] **Step 11A.5: Place checkpoints in every hot loop**

Check the guard in:

- logical frontier expansion;
- neighborhood generation;
- A* expansion;
- route-order and rip-up permutations;
- port-pair enumeration;
- badge backtracking;
- layer-order enumeration;
- exact-spacing retries.

Check deterministic counts every iteration. Sample signal and clock every `64` iterations by default.

- [ ] **Step 11A.6: Capture only complete candidates**

A recoverable candidate must already contain:

- coordinates for every node;
- a route for every edge;
- placed or explicitly failed badges;
- validation diagnostics;
- score and optimization statistics.

Never publish a half-routed or internally inconsistent state.

- [ ] **Step 11A.7: Publish progressive improvements**

Call `onBestCompleteResult`:

1. for the first complete candidate;
2. whenever the lexicographic global best improves;
3. once for the final result.

Use deterministic improvement events. Do not publish on a wall-clock cadence.

- [ ] **Step 11A.8: Recover from a cooperative stop**

If a best complete candidate exists:

- return it;
- set `status` to `unresolved_soft_conflicts` unless it already satisfies `success`;
- set the exact `stopReason`;
- preserve all diagnostics and work counters.

If no complete candidate exists, throw `LayoutComputationAbort`. Do not fabricate a valid result.

- [ ] **Step 11A.9: Keep geometry deterministic**

Normal acceptance tests omit `maxElapsedMs` and use deterministic work limits only. Deadline tests use the injected clock. A real clock may stop an interactive run, but it may not compare or score candidates.

- [ ] **Step 11A.10: Add recovery regressions**

Assert:

- a tiny layout-state budget returns the best complete result;
- a tiny route budget returns the best complete result;
- a fake deadline returns the latest complete result;
- a stop before the first complete candidate throws the structured abort;
- returned recovery geometry passes result-shape validation;
- two deterministic-budget runs remain deeply equal.

- [ ] **Step 11A.11: Run focused gates**

```bash
bun test src/engine/layout/custom/computationBudget.test.ts
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun test src/engine/layout/custom/computeCustomLayout.test.ts
bun run typecheck
```

- [ ] **Step 11A.12: Commit**

```bash
git add src/engine/layout/custom
git commit -m "feat: recover bounded graph computation safely"
```

**Done when:** Every known engine loop has a deterministic guard, deadline testing is deterministic, and a cooperative stop returns only a complete best-known layout.

---

## Task 11B: Isolate Layout Computation Behind a Hard Worker Watchdog

**Owner:** `W1-worker-safety`  
**Parallel:** No  
**Depends on:** Task 11A  
**Files:**

- Create: `src/engine/layout/custom/worker/layoutWorkerProtocol.ts`
- Create: `src/engine/layout/custom/worker/layoutWorkerProtocol.test.ts`
- Create: `src/engine/layout/custom/worker/customLayout.worker.ts`
- Create: `src/engine/layout/custom/worker/layoutWorkerClient.ts`
- Create: `src/engine/layout/custom/worker/layoutWorkerClient.test.ts`
- Create: `src/engine/layout/custom/worker/layoutRunController.ts`
- Create: `src/engine/layout/custom/worker/layoutRunController.test.ts`
- Create a non-responsive test Worker fixture only if the runner supports terminating it reliably

- [ ] **Step 11B.1: Add a versioned protocol**

Use serializable messages:

```ts
type LayoutWorkerRequest = {
  type: "start";
  protocolVersion: 1;
  runId: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  config: CustomLayoutConfig;
  mode: "interactive" | "exhaustive" | "safe";
};

type LayoutWorkerResponse =
  | { type: "progress"; protocolVersion: 1; runId: number; result: CustomLayoutResult }
  | { type: "complete"; protocolVersion: 1; runId: number; result: CustomLayoutResult }
  | {
      type: "aborted";
      protocolVersion: 1;
      runId: number;
      reason: string;
      bestResult?: CustomLayoutResult;
      checkpoint: object;
    }
  | { type: "failed"; protocolVersion: 1; runId: number; errorCode: string; message: string };
```

Reject unsupported protocol versions explicitly.

- [ ] **Step 11B.2: Add result-boundary validation**

Before accepting a Worker result, verify:

- matching active `runId`;
- supported protocol version;
- all requested node and edge IDs appear exactly once;
- all coordinates and route points are finite;
- required result fields and diagnostics exist;
- a result labeled complete is hard-valid.

Malformed messages become `failed`; they never replace the last good result.

- [ ] **Step 11B.3: Run one computation per Worker**

Create a fresh Worker for each run. The Worker:

1. accepts one `start`;
2. maps the mode to the locked cooperative deadline and deterministic limits;
3. calls the existing custom engine;
4. forwards best-complete callbacks as `progress`;
5. posts one terminal response;
6. closes itself.

This avoids cross-run state leakage and makes termination unambiguous.

- [ ] **Step 11B.4: Implement the hard watchdog**

The main thread owns the timer:

- `3_000ms` for `interactive`;
- `10_000ms` for `exhaustive`;
- `1_500ms` for `safe`.

On expiry:

1. mark the `runId` terminal;
2. call `worker.terminate()` exactly once;
3. clear listeners and timer;
4. return the latest validated progress result if available;
5. otherwise return structured `timed_out`.

Do not implement this as `Promise.race` without termination.

- [ ] **Step 11B.5: Terminate superseded runs**

On scenario change, config change, unmount, or retry:

- mark the old `runId` stale;
- terminate its Worker immediately;
- clear its watchdog;
- ignore all late messages;
- start the replacement with a larger `runId`.

Do not rely on a `cancel` message: a busy Worker cannot process it while synchronous code is running.

- [ ] **Step 11B.6: Implement the recovery state machine**

Add transitions for:

```text
idle → running
running → partial | complete | timed_out | cancelled | failed
partial → partial | complete | timed_out | cancelled | failed
timed_out | failed | cancelled → running only through a new explicit run
```

Illegal or duplicate terminal transitions are ignored and recorded in development diagnostics.

- [ ] **Step 11B.7: Preserve last good and best current results**

The controller stores:

- `lastGoodResult` keyed by canonical graph-plus-config hash;
- `bestCurrentResult` for the active `runId`;
- terminal reason and checkpoint;
- whether the visible result is stale, partial, or complete.

Do not clear a valid visible graph merely because refinement started.

- [ ] **Step 11B.8: Add a circuit breaker**

After a timeout or crash for a graph-plus-config hash:

- do not automatically restart;
- expose `retry` and `retrySafe`;
- use lower deterministic limits for `retrySafe`;
- clear the breaker only after a successful terminal run or an explicit graph/config change.

- [ ] **Step 11B.9: Handle Worker failures**

Convert `error`, `messageerror`, thrown engine errors, malformed responses, and protocol mismatches into stable error codes. Clean up the Worker and timer in every branch. Log stacks only in development.

- [ ] **Step 11B.10: Test a non-responsive Worker**

Use an injectable `WorkerLike`, fake scheduler, and fake clock. Assert:

- hard timeout calls `terminate()` once;
- the returned state is `timed_out`;
- the promise/controller settles;
- no live timer remains;
- no late message can mutate state.

- [ ] **Step 11B.11: Test progress followed by a hang**

Send one valid `progress` message, then never finish. Assert the watchdog preserves that result, marks it partial/timed out, and does not claim aesthetic completion.

- [ ] **Step 11B.12: Test race and recovery cases**

Cover:

- #20 starts, then #5 starts before #20 completes;
- late #20 completion is ignored;
- unmount terminates the Worker;
- `error` and `messageerror` preserve last good;
- malformed and non-finite results are rejected;
- manual retry creates a new Worker and `runId`;
- circuit breaker prevents automatic retry loops.

- [ ] **Step 11B.13: Run focused gates**

```bash
bun test src/engine/layout/custom/worker
bun run typecheck
bun run build:local
```

- [ ] **Step 11B.14: Commit**

```bash
git add src/engine/layout/custom/worker
git commit -m "feat: contain graph layout in a watched worker"
```

**Done when:** Even a Worker that never responds is terminated predictably, stale results cannot render, and a valid progressive result survives timeout or crash.

---

## Task 11: Make the Testing Page Report the Real Search State

**Owner:** `U1-diagnostics-ui`  
**Parallel:** Yes, with Task 12  
**Depends on:** Task 11B  
**Files:**

- Modify: `src/features/GraphTesting/components/CustomLayoutMetrics.tsx`
- Modify: `src/features/GraphTesting/components/GraphTestingPage.tsx`
- Modify: `src/features/GraphTesting/components/GraphTestingModal.tsx`
- Create: `src/features/GraphTesting/hooks/useCustomLayoutWorker.ts`
- Create: `src/features/GraphTesting/components/GraphTestingErrorBoundary.tsx`
- Modify debug overlay files only if required

- [ ] **Step 11.1: Split legality and aesthetics**

Show separate badges:

- `Legal` or `Hard Failure`;
- `Aesthetic Complete` or `Soft Defects Remain`.

Do not display a single green “Valid” badge when crossings or badge warnings remain.

- [ ] **Step 11.2: Display uncovered metrics**

Add:

- badge/unrelated-edge overlap count;
- avoidable hairpins;
- excess bends;
- maximum ordinary bends;
- detached badge count if nonzero.

- [ ] **Step 11.3: Display deterministic search work**

Add:

- evaluated layout states;
- generated neighbors;
- route searches;
- A* expanded states;
- route/state cache hits;
- explicit stop reason.

- [ ] **Step 11.4: Remove misleading stop text**

Do not map every non-repeated stop to “Pass Limit.”

- [ ] **Step 11.5: Keep route and badge diagnostics selectable**

For each crossing or badge/edge warning, show the exact edge IDs. Preserve the current visual overlays.

- [ ] **Step 11.6: Remove synchronous render-path computation**

Delete direct `computeCustomLayout` calls from `useMemo` in both the page and modal. Use `useCustomLayoutWorker` and the Task 11B controller.

- [ ] **Step 11.7: Keep the last valid graph visible**

While refining the same graph-plus-config hash, continue showing its previous valid graph. After a scenario change, show a cached valid result only for the new hash; never present the previous scenario’s geometry as the selected scenario. Replace visible geometry only after a validated progress or complete message.

- [ ] **Step 11.8: Render every recovery state**

Show distinct, non-blocking states for:

- computing;
- partial result while refining;
- timed out with best-known result;
- timed out without a result;
- cancelled by scenario change;
- Worker/protocol failure.

Never label a partial or timed-out result `Aesthetic Complete`.

- [ ] **Step 11.9: Add explicit recovery actions**

For timeout or failure, show:

- `Retry`;
- `Retry in safe mode`;
- the stage, stop reason, and deterministic counters;
- whether the displayed graph is the previous or current best result.

Do not automatically trigger either action.

- [ ] **Step 11.10: Contain render failures**

Wrap graph laboratory rendering in `GraphTestingErrorBoundary`. Its reset action:

- remounts the visual subtree;
- preserves the selected scenario;
- preserves the controller’s last validated result;
- does not automatically restart failed computation.

- [ ] **Step 11.11: Report latency outside deterministic output**

Display:

- time to first complete result;
- terminal elapsed time;
- selected watchdog mode.

Keep those UI-only values out of `CustomLayoutResult` and score comparisons.

- [ ] **Step 11.12: Add a rapid-switch UI regression**

Switch #20 → #5 before #20 finishes. Assert only #5 can become visible and the superseded Worker is terminated.

- [ ] **Step 11.13: Run UI gates**

```bash
bun run typecheck
bun run lint
bun run build:local
```

- [ ] **Step 11.14: Commit**

```bash
git add src/features/GraphTesting
git commit -m "feat: make graph testing recover from slow layouts"
```

**Done when:** The laboratory cannot call a crossing layout aesthetically complete, never computes synchronously on the main thread, and remains usable after timeout, stale response, Worker failure, or render failure.

---

## Task 12: Repair Generated Regressions and Enforce Performance

**Owner:** `T1-acceptance`  
**Parallel:** Yes, with Task 11  
**Depends on:** Task 11B  
**Files:**

- Modify: `src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`
- Modify: `src/engine/layout/custom/generatedGraph.test.ts`
- Create: `src/engine/layout/custom/testSupport/runLayoutIsolated.ts`
- Create: `src/engine/layout/custom/testSupport/runLayoutIsolated.test.ts`
- Create a test-only isolated runner entry if Bun requires one
- Modify: `package.json` only for named layout test scripts

- [ ] **Step 12.1: Run the unchanged restored contract**

```bash
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
```

If it fails, report the implementation defect. Do not relax the threshold.

- [ ] **Step 12.2: Remove the invalid-result escape**

Replace:

```ts
if (!result.validation.isValid) return;
```

with explicit expected behavior. Generated fixtures intended to be supported must assert:

```ts
expect(result.validation.isValid).toBe(true);
```

- [ ] **Step 12.3: Remove duplicate normal computation**

Per generated fixture compute only:

1. initial bounded result;
2. optimized result;
3. reversed-input optimized result.

Delete the second identical normal computation.

- [ ] **Step 12.4: Assert deterministic work bounds**

For every generated graph:

- evaluated logical states within config;
- expanded A* states within derived route budget;
- stop reason is known;
- repeated input yields equal work counters.

- [ ] **Step 12.5: Add seed-101 focused regression**

Assert:

- hard-valid;
- no missing routes;
- no ordinary leaders;
- final crossings do not exceed initial crossings;
- deterministic output under reversal;
- no work budget exceeded.

- [ ] **Step 12.6: Add a hard isolated test runner**

For expensive generated cases, run the public layout computation in a Worker or child process which the parent can forcibly terminate.

The helper must:

- accept a graph, config, and deadline;
- return one structured result;
- kill the isolated execution on deadline;
- settle with a stable timeout error;
- clear timers and listeners;
- never rely on Bun’s per-test timeout as its kill mechanism.

- [ ] **Step 12.7: Prove hard timeout termination**

Use a test-only non-responsive Worker/process fixture. Assert:

- the deadline fires using a fake or very short controlled clock;
- termination happens exactly once;
- the helper settles promptly;
- the remaining test suite continues;
- no orphan Worker/process remains.

- [ ] **Step 12.8: Test cooperative timeout recovery**

Use an injected fake clock to make the engine exceed its deadline:

- after a complete candidate: assert a best-known result and `deadline-exceeded`;
- before any complete candidate: assert a structured abort;
- never wait for real seconds in this unit test.

- [ ] **Step 12.9: Add a loose wall-clock smoke gate**

Measure one optimized seed-101 call only.

Target on the baseline machine: less than `5s`.

Keep deterministic work counters as the primary performance contract. The wall-clock check is a smoke alarm, not a geometry input.

- [ ] **Step 12.10: Add named scenario work budgets**

Targets:

- #5, #6, #8, #14, #16: each below `1s`;
- #20: below `2s`;
- no browser laboratory selection should block for the current 7–24 seconds.

If CI variance makes direct timing unstable, keep these in a dedicated serial performance describe block and retain strict deterministic counters in normal tests.

- [ ] **Step 12.11: Bound total suite time**

Add named scripts:

```json
"test:layout:unit": "bun test src/engine/layout/custom/computationBudget.test.ts src/engine/layout/custom/worker/layoutWorkerProtocol.test.ts",
"test:layout:timeouts": "bun test src/engine/layout/custom/worker/layoutWorkerClient.test.ts src/engine/layout/custom/worker/layoutRunController.test.ts src/engine/layout/custom/testSupport/runLayoutIsolated.test.ts",
"test:layout:stress": "bun test src/engine/layout/custom/generatedGraph.test.ts"
```

Requirements:

- unit and timeout suites never use multi-second sleeps;
- stress cases run serially to prevent CPU contention from disguising regressions;
- the full command has an outer CI deadline that kills the command, not merely a test callback;
- slow tests remain visible and are not silently skipped from `bun test`.

- [ ] **Step 12.12: Add all-20 status consistency**

For each result:

- `success` implies no configured soft defect;
- `unresolved_soft_conflicts` implies hard-valid and at least one soft defect;
- `invalid_hard_failure` implies at least one error diagnostic.

- [ ] **Step 12.13: Add UI-controller timeout acceptance**

Through the reusable controller, cover:

- non-responsive Worker → `timed_out`;
- progress then timeout → visible best result plus warning;
- timeout then manual retry → new `runId`;
- timeout then automatic state update → no restart;
- scenario switch during slow run → old Worker terminated and stale output ignored.

`W1` owns the controller test file. `T1` invokes it as a read-only gate and must return new failures to `W1`, not edit that file.

- [ ] **Step 12.14: Run the full focused suite**

```bash
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
bun test src/engine/layout/custom/generatedGraph.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun run test:layout:timeouts
```

- [ ] **Step 12.15: Commit**

```bash
git add src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts src/engine/layout/custom/generatedGraph.test.ts src/engine/layout/custom/testSupport package.json
git commit -m "test: enforce graph layout quality and hard timeouts"
```

**Done when:** Seed 101 finishes within deterministic limits, a non-responsive computation is forcibly terminated without blocking the suite, invalid generated layouts cannot silently pass, and all restored named assertions remain intact.

---

## Task 13: Final Integration and Visual Verification

**Owner:** `O0-orchestrator`  
**Parallel:** No writes by other agents  
**Files:**

- Modify: `docs/planning/custom-directed-graph-layout-routing-engine-v4-progress.md`

- [ ] **Step 13.1: Audit every commit**

For each task verify:

- only owned files changed;
- a failing focused test preceded behavior;
- no acceptance threshold was weakened;
- no scenario-specific branch exists;
- no layout dependency was added;
- no search cap was merely increased to hide architecture problems.
- no React render path calls the synchronous engine;
- no “timeout” is implemented without Worker/process termination;
- every Worker path clears its timer, listeners, and stale run.

- [ ] **Step 13.2: Run formatting**

Format only files changed by V4. Do not mechanically rewrite unrelated files.

Then run:

```bash
bun run format:check
```

If pre-existing V3 format failures remain outside V4 ownership, list them exactly instead of claiming success.

- [ ] **Step 13.3: Run final automated gates**

```bash
bun test
bun run test:layout:timeouts
bun run test:layout:stress
bun run typecheck
bun run lint
bun run format:check
bun run build:local
```

Record exact pass totals, exit codes, and total duration.

- [ ] **Step 13.4: Record final all-20 metrics**

Use the same fields as Task 0. Add before/after deltas for named scenarios.

- [ ] **Step 13.5: Visually inspect #5**

Verify:

- no crossing marker;
- `msg 3` has at most two bends;
- messages 5–7 use monotone angular order;
- every source point is distinct.

- [ ] **Step 13.6: Visually inspect #6**

Verify:

- collector is centered;
- no intersections;
- at least two arrival sides;
- no duplicate arrival point;
- nested trunks do not reverse order.

- [ ] **Step 13.7: Visually inspect #8**

Verify:

- no crossing bridge or marker;
- `horizontal sync` sits directly on its edge;
- peer spacing fits the full label;
- no unnecessary U-shaped detour.

- [ ] **Step 13.8: Visually inspect #14**

Verify all three protocol badges sit on their own distinct track. A badge floating beside a track without a leader is a failure.

- [ ] **Step 13.9: Visually inspect #16**

Verify:

- A→B enters B from the top;
- all three badges are directly associated;
- no label is squeezed or clipped.

- [ ] **Step 13.10: Visually inspect #20**

Verify:

- no crossing marker;
- no badge intersects an unrelated route;
- no ordinary dotted leader;
- local service edges do not take graph-wide detours;
- ordinary routes have at most three bends;
- feedback badges use leaders only if direct placement is genuinely unavailable.

- [ ] **Step 13.11: Exercise the browser repeatedly**

Switch:

```text
#5 → #6 → #8 → #14 → #16 → #20
```

twice. Geometry, metrics, stop reason, and work counters must remain identical. The page must remain responsive and must not crash.

- [ ] **Step 13.12: Visually verify recovery**

Use a development-only tiny watchdog or non-responsive test mode:

1. start a slow graph;
2. confirm the loading state renders;
3. confirm timeout terminates the Worker;
4. confirm the page remains interactive;
5. confirm a last best/last good graph remains visible when available;
6. confirm no automatic retry begins;
7. select another scenario and confirm it can complete;
8. use safe retry once and confirm a fresh `runId`.

Restore normal watchdog configuration before the final build.

- [ ] **Step 13.13: Complete the ledger**

Record:

- every merged SHA;
- focused and integration commands;
- final scenario metrics;
- performance counters;
- visual result;
- any remaining generated non-planar soft conflicts;
- Worker timeout, termination, stale-run, retry, and cleanup evidence.

- [ ] **Step 13.14: Commit**

```bash
git add docs/planning/custom-directed-graph-layout-routing-engine-v4-progress.md
git commit -m "docs: complete v4 graph layout verification"
```

**Done when:** All automated gates are green, the browser remains responsive through normal and forced-timeout runs, recovery works without an automatic retry loop, and every named visual target is visibly satisfied.

---

## Merge Gates

After every production merge, `O0` runs:

```bash
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts
bun run typecheck
bun run lint
```

After Tasks 3, 4, 8, 9, 10, and 11A also run the seed-101 focused test. After Task 11B run `bun run test:layout:timeouts`.

Reject a merge if:

- a restored assertion changed;
- a hard diagnostic became a warning;
- a timeout increased;
- a default search cap increased without a work-count explanation;
- status says `success` with a configured soft defect;
- an ordinary badge is detached;
- a production branch names a test scenario or fixture entity;
- the same logical state is evaluated twice without a documented cache miss reason;
- the UI still calls `computeCustomLayout` synchronously;
- a timeout leaves its Worker/process alive;
- a stale `runId` can change visible state;
- failure starts an automatic retry;
- a malformed or partial result replaces the last validated result.

---

## Expected Failure-to-Task Mapping

| Failure                        | Primary owner | Supporting owner | Acceptance owner |
| ------------------------------ | ------------- | ---------------- | ---------------- |
| #5 3-bend `msg 3`              | `G1`          | `R1`, `P1`       | `T1`             |
| #8 crossing and hairpin        | `G1`          | `R1`, `P1`, `L1` | `T1`             |
| #14 detached protocol badges   | `B1`          | `G1`             | `T1`             |
| #16 wrong B entry side         | `P1`          | `G1`             | `T1`             |
| #16 detached badge             | `B1`          | `G1`             | `T1`             |
| #20 crossing pair 1            | `G1`          | `R1`, `P1`       | `T1`             |
| #20 crossing pair 2            | `G1`          | `R1`, `P1`, `L1` | `T1`             |
| #20 badge/edge warnings        | `B1`          | `G1`             | `T1`             |
| #20 4-bend ordinary route      | `G1`          | `R1`, `P1`       | `T1`             |
| Seed-101 timeout               | `R1`          | `G1`, `T1`       | `T1`             |
| Cooperative budget not checked | `G1`          | `R1`, `B1`       | `T1`             |
| Browser freeze or tab crash    | `W1`          | `G1`, `U1`       | `T1`             |
| Non-responsive Worker          | `W1`          | `U1`             | `T1`             |
| Stale scenario result          | `W1`          | `U1`             | `T1`             |
| Retry/crash loop               | `W1`          | `U1`             | `T1`             |
| Malformed Worker result        | `W1`          | `U1`             | `T1`             |
| False `success` status         | `G1`          | `U1`             | `T1`             |
| Stale/inconsistent diagnostics | `O0`          | `U1`             | `T1`             |

---

## Final Agent Grouping and Test Ownership

This section intentionally repeats the execution contract for a smaller orchestration model.

### Same-Agent Sequential Chains

- `O0`: Task 0 → all merge gates → Task 13.
- `T1`: Task 1 → wait for Task 11B → Task 12.
- `R1`: Task 3 → Task 4.
- `G1`: Task 8 → Task 9 → Task 10 → Task 11A.

Do not split these chains. The later task depends on the earlier task’s internal contracts and failure knowledge.

`W1` performs Task 11B only after `G1` finishes 11A. Do not run them in parallel: the Worker protocol depends on the final cooperative-result and stop-reason contract.

### Independent Parallel Work

- Wave 1: `T1` Task 1 and `C1` Task 2.
- Wave 2: `R1` Task 3, `P1` Task 5, and `B1` Task 6.
- Wave 3: `R1` Task 4 and `L1` Task 7.
- Wave 9: `U1` Task 11 and `T1` Task 12.

All other tasks are sequential integration work.

### Test Ownership

| Test file                                                                                                          | Sole write owner                           |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `customLayoutAestheticAcceptance.test.ts`                                                                          | `T1`                                       |
| `generatedGraph.test.ts`                                                                                           | `T1`                                       |
| `config.test.ts`, `layoutObjective.test.ts`                                                                        | `C1`                                       |
| `routeSearch.test.ts`, `routingGrid.test.ts`, `routeOccupancy.test.ts`, `edgeRouter.test.ts`                       | `R1`                                       |
| `portCandidates.test.ts`, `portAssignment.test.ts`, `portDistribution.test.ts`, `portOrdering.test.ts`             | `P1`                                       |
| `badgePlacement.test.ts`, `spacingDemand.test.ts`, `labelLanePlanner.test.ts`                                      | `B1`                                       |
| `crossingMinimization.test.ts`, `coordinateAssignment.test.ts`, `nodeLayout.test.ts`                               | `L1`                                       |
| `layoutSearchState.test.ts`, `layoutNeighborhood.test.ts`, `optimizeLayout.test.ts`, `computeCustomLayout.test.ts` | `G1`                                       |
| `computationBudget.test.ts`                                                                                        | `G1`                                       |
| `worker/layoutWorkerProtocol.test.ts`, `worker/layoutWorkerClient.test.ts`, `worker/layoutRunController.test.ts`   | `W1`                                       |
| test-only isolated layout runner and termination tests                                                             | `T1`                                       |
| Strict suite                                                                                                       | Read-only integration gate for all workers |

### Exact Merge Order

```text
Task 0
Task 1
Task 2
Task 3 / Task 5 / Task 6 in any order after all focused tests pass
Task 4 / Task 7 in any order after their own entry gates
Task 8
Task 9
Task 10
Task 11A
Task 11B
Task 11 / Task 12 in either order
Task 13
```

### Orchestrator Recovery Rules

If a worker cannot solve its focused failure:

1. Keep the failing test.
2. Record the exact logical state, score, work counters, and stop reason.
3. Determine whether the required move is representable.
4. If not representable, return the contract gap to the owning agent.
5. Do not ask another agent to tune weights around a missing state dimension.
6. Do not run the same unsuccessful search with a larger cap more than once.
7. After three failed fixes, stop and review the state architecture before another patch.
8. If the engine fails to cooperate with its deadline, reproduce it through hard isolation; do not run it again on the browser main thread.
9. If a run times out or crashes, preserve its best validated result and exact checkpoint.
10. Do not auto-retry a failed graph/config hash. Require explicit retry or a changed input.
11. If the page crashes during manual verification, first confirm all interactive calls cross the Worker boundary before tuning any algorithm.

---

## Completion Definition

V4 is complete only when:

1. The restored acceptance file passes without weakened assertions.
2. All 20 named scenarios remain hard-valid.
3. #5, #6, #8, #14, #16, and #20 have zero crossings.
4. All 20 scenarios have zero ordinary leaders and zero detached ordinary badges.
5. #5 has no route above two bends.
6. #16 A→B targets B from the top.
7. #20 has zero badge/unrelated-edge overlaps and no ordinary route above three bends.
8. The generated seed-101 cyclic test finishes inside deterministic and wall-clock budgets.
9. Full `bun test`, typecheck, lint, applicable format check, and local build pass.
10. `status` agrees with legality and soft metrics.
11. The testing page stays responsive through repeated scenario switching.
12. A non-responsive Worker is terminated by the hard watchdog and cannot crash the page.
13. Timeout with progress preserves the best complete result and reports incomplete status.
14. Timeout without progress shows a recoverable error and no fabricated geometry.
15. Stale, malformed, and late Worker messages cannot replace the visible valid result.
16. Timeout/failure does not cause an automatic retry loop.
17. Unit timeout tests use injected clocks; hard-timeout tests prove actual termination without multi-second sleeps.
18. The V4 ledger contains exact commits, metrics, work counters, timeout evidence, and visual verification.
