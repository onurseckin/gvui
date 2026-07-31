# Custom Directed Graph Layout and Routing Engine — V2 Remediation Plan

**Date:** 2026-07-30  
**Repository:** `/Users/onurseckinsenoglu/repos/gvui`  
**Starting commit:** `8035f06`  
**Scope:** Repair the custom TypeScript engine. Do not replace it with Dagre, ELK, Graphviz, libavoid, or another layout runner.  
**Primary acceptance suite:** `src/engine/layout/custom/customLayoutValidatorStrict.test.ts`

## Start Here: Orchestrator and Agent Groups

One orchestrator owns the run. The orchestrator delegates tasks, merges results, runs gates, and resolves ownership. The orchestrator must not ask several agents to edit the same file.

| Group                   | Persistent owner                    | Sequential tasks                | Exclusive writable files                                                                                                    | Owned tests                                                           |
| ----------------------- | ----------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `O0-orchestrator`       | One orchestrator for the entire run | Task 0, merge gates, Task 14    | Progress ledger and this plan only                                                                                          | Runs every integration gate                                           |
| `C1-contract-validator` | One agent                           | Tasks 1 and 9                   | `types.ts`, `config.ts`, `normalizeGraph.ts`, `layoutValidator.ts`, `crossingDetection.ts`, and their tests                 | Contract, normalization, validator, and crossing tests                |
| `T1-acceptance`         | One agent                           | Tasks 2 and 12                  | Scenario fixtures, strict acceptance test, and generated-graph test                                                         | All 20 scenarios and generated-graph acceptance                       |
| `H1-hierarchy`          | One agent                           | Task 3                          | `cycleBreaking.ts`, `rankAssignment.ts`, `coordinateAssignment.ts`, and their tests                                         | Cross-edge inference, rank, coordinate tests; scenario #8 semantics   |
| `R1-routing`            | One agent                           | Tasks 4, 5, and 6 in that order | Port modules, `routeOccupancy.ts`, `routingGrid.ts`, `routeSearch.ts`, `specialRoutes.ts`, `edgeRouter.ts`, and their tests | Route failures in #19 and #20; route portions of #8, #9, #11, and #14 |
| `B1-badges`             | One agent                           | Tasks 7 and 8 in that order     | `badgePlacement.ts` and `badgePlacement.test.ts`                                                                            | Badge failures in #5, #6, #8, #9, #11, #14, #16, #19, and #20         |
| `G1-optimizer`          | One agent                           | Tasks 10 and 11                 | `optimizeLayout.ts`, `computeCustomLayout.ts`, `index.ts`, and their tests                                                  | Convergence and complete-pipeline tests                               |
| `U1-visual-lab`         | One agent                           | Task 13                         | Testing-page and testing-modal components                                                                                   | Leader, bridge, metric, and diagnostic rendering                      |
| `D1-dagre-baseline`     | One independent agent               | Optional Task D                 | `dagreLayout.ts` and `dagreLayout.test.ts` only                                                                             | Existing Dagre badge-repulsion regression                             |

### Mandatory Grouping Rules

1. Keep every task listed in one group with the same persistent agent.
2. Run only the tasks shown in the same parallel wave at the same time.
3. Give each agent an isolated branch or worktree.
4. Let only the owning group edit a listed file.
5. Write a failing test before changing behavior.
6. Make one commit per task.
7. Merge one commit at a time through the orchestrator.
8. Run the task's focused test before handoff.
9. Run the strict 20-scenario suite after every merged behavior commit.
10. Stop a worker if it needs a file owned by another group; send a contract request to the orchestrator.

### Parallel Waves

| Wave | Parallel work                                       | Must wait for                      |
| ---- | --------------------------------------------------- | ---------------------------------- |
| 0    | `O0` Task 0                                         | Nothing                            |
| 1    | `C1` Task 1; `D1` optional Task D                   | Wave 0                             |
| 2    | `T1` Task 2                                         | Task 1                             |
| 3    | `H1` Task 3; `R1` Task 4; `B1` Task 7               | Task 2 failing acceptance baseline |
| 4    | `R1` Task 5; `B1` Task 8; `C1` Task 9               | Each group's preceding task        |
| 5    | `R1` Task 6                                         | Tasks 4 and 5                      |
| 6    | `G1` Task 10                                        | Tasks 3, 6, 8, and 9 merged        |
| 7    | `G1` Task 11; `U1` Task 13                          | Task 10 and Task 9                 |
| 8    | `T1` Task 12                                        | Tasks 10 and 11 merged             |
| 9    | `O0` Task 14 with three read-only visual inspectors | Task 12                            |

The orchestrator counts as one active agent. Use at most three worker agents beside it in a wave.

## Test Ownership by Failure Scenario

The strict scenario file is owned only by `T1`. Module owners add smaller reproductions to their own test files.

| Scenario         | Actual current hard failure                                                | Module reproduction owner          | Strict acceptance owner |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------- | ----------------------- |
| #5 Fan-Out       | 1 badge-badge and 5 reported badge-edge overlaps                           | `B1`                               | `T1`                    |
| #6 Fan-In        | 6 reported badge-edge overlaps                                             | `B1`                               | `T1`                    |
| #8 Cross-Link    | 1 badge-edge overlap; peers are also incorrectly placed on different ranks | `H1` for rank; `B1` for badge      | `T1`                    |
| #9 Reciprocal    | 1 badge-badge overlap                                                      | `B1`; `R1` guards route separation | `T1`                    |
| #11 Cyclic Ring  | Feedback badge overlaps the middle node                                    | `B1`; `R1` guards feedback route   | `T1`                    |
| #14 Multi-Edge   | 2 badge-badge and 2 badge-edge overlaps                                    | `B1`; `R1` guards distinct tracks  | `T1`                    |
| #16 Dense Badges | 1 badge-node and 2 badge-edge overlaps                                     | `B1`                               | `T1`                    |
| #19 Agent Trace  | Feedback edge and its badge penetrate `EXEC1`                              | `R1` for route; `B1` for badge     | `T1`                    |
| #20 DevOps Mesh  | 2 node penetrations, 3 shared segments, and 9 badge conflicts              | `R1` for routes; `B1` for badges   | `T1`                    |

## Verified Baseline and Corrections to the Failure Report

Run on commit `8035f06`:

```bash
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
```

Observed result: **11 pass, 9 fail**.

The report's total is correct, but its detailed matrix is incomplete and partly stale:

- It omits failing scenarios #5 and #6.
- It lists 13 passing scenario IDs while calling the count 11.
- Scenario #8 currently fails `BADGE_UNRELATED_EDGE_OVERLAP`, not departure direction.
- Scenario #9 currently fails `BADGE_BADGE_OVERLAP`, not a shared segment.
- Scenario #11 currently fails `BADGE_NODE_OVERLAP`, not entry direction.
- The real failing set is `#5, #6, #8, #9, #11, #14, #16, #19, #20`.

Repository-wide baseline:

```bash
bun test
bun run typecheck
bun run lint
```

Observed result:

- `140` tests pass.
- The nine custom scenarios fail.
- One unrelated Dagre badge-repulsion test also fails.
- Typecheck and lint pass.

## Root-Cause Audit

### 1. Badge placement is a three-point greedy midpoint selector

`badgePlacement.ts`:

- Uses only the longest route segment.
- Tries only the segment's `40%`, `50%`, and `60%` points.
- Checks nodes and already placed badges.
- Does not check unrelated edge segments.
- Does not try perpendicular offsets or exterior label lanes.
- Keeps the least-bad invalid candidate when every candidate collides.
- Does not perform backtracking or conflict-component replacement.

This single defect explains the hard failures in #5, #6, #8, #9, #11, #14, and #16, plus part of #19 and #20.

### 2. Feedback paths are manually drawn doglegs, not obstacle-aware routes

`specialRoutes.ts`:

- Chooses left or right by edge index parity.
- Computes the corridor from only the source and target rectangles.
- Does not inspect intermediate nodes.
- Does not validate the horizontal escape and arrival legs.
- Does not use the routing grid or A* search.

In #20, increasing only the outer corridor X would not solve the problem. The source escape from `NOTIF` crosses `CACHE`, and the target arrival into `ORDER` crosses `USER`.

### 3. Endpoint stubs are outside the occupancy decision

`routeSearch.ts` searches only from source stub to target stub. The complete point-to-stub legs are added afterward. These forced legs are not checked against existing occupancy during search.

The three 20 px shared segments in #20 are endpoint-stub reuse:

- `NOTIF → AUTH` reuses the `ORDER → CACHE` target stub.
- `PAY → ORDER` reuses the `GW → USER` target stub.
- `PAY → ORDER` reuses the `USER → DB` source stub.

### 4. Routing convergence settings are declared but unused

- `maxRipUpPasses` is never read by the router.
- `maxGlobalPasses` is never read by the layout pipeline.
- Lane expansion retries only one additional ring per failed edge.
- No route conflict set is ripped up.
- No badge-aware global optimization module exists.

### 5. Scenario #8 does not exercise a same-rank cross edge

The type `EdgeRole` includes `cross`, but `classifyEdgeRoles` never assigns it. The `MID1 → MID2` edge is treated as forward, so `MID2` is pushed to the next rank. The testing page visibly stacks the two peer nodes.

### 6. Crossing data is counted but not returned

`layoutValidator.ts` counts perpendicular crossings, but `computeCustomLayout.ts` always returns `crossings: []`. The testing page therefore cannot assign one bridge owner per crossing.

### 7. Several unit tests assert existence instead of the behavior in their title

Examples:

- The badge placement test does not assert collision freedom.
- The edge router test does not calculate shared segment length.
- The feedback route test does not place an intermediate obstacle.
- Generated tests accept `invalid_hard_failure` as a successful outcome.

V2 must strengthen the tests before relying on them.

## Locked V2 Algorithm

1. Preserve the dependency-free TypeScript engine.
2. Preserve top-to-bottom layered layout.
3. Support explicit `layoutRole` hints and deterministic automatic cross-edge inference.
4. Include forward, cross, and feedback edges in one port-allocation system.
5. Route every non-self edge through one obstacle-aware orthogonal search.
6. Treat feedback corridors as search constraints, not prebuilt polylines.
7. Reserve every segment, including point-to-stub endpoint legs.
8. Forbid positive-length collinear sharing.
9. Allow perpendicular crossings with a cost and one visible bridge owner.
10. Place badges with a deterministic global candidate solver.
11. Treat nodes, other badges, unrelated edges, and label leaders as hard badge obstacles.
12. Expand local graph space when a legal badge or route cannot fit.
13. Use bounded rip-up, reroute, backtracking, and global passes.
14. Preserve the lexicographically best result and stop on repeated state.
15. Never silently return a known hard-invalid placement as success.

## V2 Hard Acceptance Criteria

Every one of the 20 scenarios must satisfy:

- All nodes and all input edges are present.
- All coordinates are finite.
- No node rectangles overlap.
- Every route segment is orthogonal.
- Every endpoint is on its node boundary.
- Every route leaves and enters perpendicular to its selected side.
- No edge penetrates any node interior.
- No two edges share a positive-length collinear segment.
- No badge overlaps a node, badge, or unrelated edge.
- No badge leader penetrates a node or badge.
- Every crossing is present in `result.crossings`.
- Exactly one edge owns the bridge at each crossing.
- The same input produces a deeply equal result.
- Scenario #8 places `MID1` and `MID2` on the same rank.
- The result status is `success`.

## Task 0: Bootstrap the Orchestrated Run

**Owner:** `O0-orchestrator`  
**Parallel:** No.

**Files:**

- Create: `docs/planning/custom-directed-graph-layout-routing-engine-v2-progress.md`

1. Record `git status`, `git rev-parse HEAD`, and the three baseline commands.
2. Copy the verified nine-scenario failure matrix into the progress ledger.
3. Create one isolated branch or worktree per active group.
4. Add columns for task, owner, branch, commit, focused test, strict gate, and merge state.
5. Mark Task 1 as the only unblocked behavior task.

**Handoff:** Share the ledger path and branch names with every worker.

## Task 1: Freeze V2 Contracts and Runtime Input Validation

**Owner:** `C1-contract-validator`  
**Parallel:** Optional Task D may run beside it.

**Files:**

- Modify: `src/engine/layout/custom/types.ts`
- Modify: `src/engine/layout/custom/config.ts`
- Modify: `src/engine/layout/custom/config.test.ts`
- Modify: `src/engine/layout/custom/normalizeGraph.ts`
- Modify: `src/engine/layout/custom/normalizeGraph.test.ts`

1. Add failing tests for valid and invalid edge layout roles and new positive limits.
2. Run the two focused tests and confirm failure.
3. Add `EdgeLayoutHint = "auto" | "forward" | "cross" | "feedback"`.
4. Add optional `layoutRole` to `NormalizedEdge`; default it to `auto` during normalization.
5. Add typed route reservations, route conflicts, spacing overrides, badge leaders, and crossing bridge ownership.
6. Add bounded badge-candidate and backtracking limits to `CustomLayoutConfig`.
7. Reject unknown layout roles and invalid limits at runtime.
8. Run focused tests and typecheck.

```bash
bun test src/engine/layout/custom/config.test.ts
bun test src/engine/layout/custom/normalizeGraph.test.ts
bun run typecheck
```

**Commit:** `refactor: freeze v2 layout contracts`

**Freeze rule:** After merge, no group edits `types.ts` or `config.ts` without an orchestrator-approved contract patch owned by `C1`.

## Task 2: Turn the 20 Scenarios into a Real Acceptance Contract

**Owner:** `T1-acceptance`  
**Parallel:** No behavior work starts until this task is merged.

**Files:**

- Modify: `src/features/GraphTesting/types.ts`
- Modify: `src/features/GraphTesting/data/customLayoutScenarios.ts`
- Modify: `src/features/GraphTesting/data/customLayoutScenarios.test.ts`
- Modify: `src/engine/layout/custom/customLayoutValidatorStrict.test.ts`

1. Preserve `layoutRole` when a testing edge is converted to `NormalizedEdge`.
2. Mark `MID1 → MID2` in scenario #8 as an explicit `cross` edge.
3. Add a helper that asserts every hard metric is zero.
4. Assert route count, badge count, orthogonality, status, validity, and determinism for every scenario.
5. Add scenario-specific assertions for #8 same-rank peers, #9 reciprocal separation, and #14 distinct tracks.
6. Run the strict suite and record exactly nine failing scenarios.

```bash
bun test src/features/GraphTesting/data/customLayoutScenarios.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
```

Expected: fixture tests pass; strict suite still fails on the nine verified scenarios.

**Commit:** `test: define v2 graph layout acceptance`

## Task 3: Implement Cross-Edge Semantics and Stable Coordinates

**Owner:** `H1-hierarchy`  
**Parallel:** Tasks 4 and 7.

**Files:**

- Modify: `src/engine/layout/custom/cycleBreaking.ts`
- Modify: `src/engine/layout/custom/cycleBreaking.test.ts`
- Modify: `src/engine/layout/custom/rankAssignment.ts`
- Modify: `src/engine/layout/custom/rankAssignment.test.ts`
- Modify: `src/engine/layout/custom/coordinateAssignment.ts`
- Modify: `src/engine/layout/custom/coordinateAssignment.test.ts`

1. Add failing tests for explicit cross edges and shuffled input.
2. Add a failing auto-inference test shaped like scenario #8.
3. Honor role priority: self, explicit feedback, explicit cross, explicit forward, then auto.
4. For auto DAG edges, test removal in edge-ID order.
5. Infer `cross` only when removal gives equal endpoint ranks and the endpoints share an alternate predecessor or successor.
6. Exclude cross edges from rank constraints and layer virtual-node insertion.
7. Add local spacing overrides to coordinate assignment.
8. Translate final coordinates so the minimum node X and Y equal graph padding.
9. Run hierarchy tests, scenario #8, and typecheck.

```bash
bun test src/engine/layout/custom/cycleBreaking.test.ts
bun test src/engine/layout/custom/rankAssignment.test.ts
bun test src/engine/layout/custom/coordinateAssignment.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts --test-name-pattern "Scenario #8"
bun run typecheck
```

**Commit:** `feat: preserve same-rank cross links`

## Task 4: Add an Atomic Route Reservation Ledger

**Owner:** `R1-routing`  
**Parallel:** Tasks 3 and 7.  
**Sequential requirement:** The same `R1` agent continues with Tasks 5 and 6.

**Files:**

- Create: `src/engine/layout/custom/routeOccupancy.ts`
- Create: `src/engine/layout/custom/routeOccupancy.test.ts`
- Modify: `src/engine/layout/custom/routingGrid.ts`
- Modify: `src/engine/layout/custom/routingGrid.test.ts`

1. Add failing tests for commit, conflict query, release, and deterministic ordering.
2. Reproduce a 20 px endpoint-stub conflict from scenario #20.
3. Split committed segments at grid coordinates, intersections, and segment endpoints.
4. Reserve the complete route, including source and target point-to-stub legs.
5. Forbid positive collinear overlap; allow endpoint contact and perpendicular crossing.
6. Stop exempting a port or stub that lies inside an unrelated obstacle.
7. Add endpoint-leg preflight against node obstacles and current reservations.
8. Run focused tests and typecheck.

```bash
bun test src/engine/layout/custom/routeOccupancy.test.ts
bun test src/engine/layout/custom/routingGrid.test.ts
bun run typecheck
```

**Commit:** `feat: reserve complete orthogonal routes`

## Task 5: Route Feedback Edges Through the Obstacle-Aware Search

**Owner:** `R1-routing`  
**Parallel:** Tasks 8 and 9.  
**Depends on:** Task 4.

**Files:**

- Modify: `src/engine/layout/custom/routeSearch.ts`
- Modify: `src/engine/layout/custom/routeSearch.test.ts`
- Modify: `src/engine/layout/custom/specialRoutes.ts`
- Modify: `src/engine/layout/custom/specialRoutes.test.ts`

1. Add intermediate-node reproductions from scenarios #19 and #20.
2. Add tests that validate escape legs and arrival legs, not only the outer vertical segment.
3. Change route search to accept edge role, reservations, forbidden rectangles, and an optional required corridor X.
4. Include `visitedRequiredCorridor` in the A* state.
5. Generate left and right feedback corridor X values from the global expanded node envelope.
6. Search to the target only after the chosen corridor has been visited.
7. Let A* choose obstacle-free access to and from the corridor.
8. Keep manual special routing only for self-loops.
9. Try every lane ring through `maxLaneRings`, not one extra ring.
10. Run focused tests and typecheck.

```bash
bun test src/engine/layout/custom/routeSearch.test.ts
bun test src/engine/layout/custom/specialRoutes.test.ts
bun run typecheck
```

**Commit:** `feat: route feedback edges through constrained astar`

## Task 6: Unify Ports, Routing Order, and Rip-Up/Reroute

**Owner:** `R1-routing`  
**Parallel:** No edits to routing files from another group.  
**Depends on:** Tasks 4 and 5.

**Files:**

- Modify: `src/engine/layout/custom/portCandidates.ts`
- Modify: `src/engine/layout/custom/portCandidates.test.ts`
- Modify: `src/engine/layout/custom/portAssignment.ts`
- Modify: `src/engine/layout/custom/portAssignment.test.ts`
- Modify: `src/engine/layout/custom/portDistribution.ts`
- Modify: `src/engine/layout/custom/portDistribution.test.ts`
- Modify: `src/engine/layout/custom/edgeRouter.ts`
- Modify: `src/engine/layout/custom/edgeRouter.test.ts`

1. Add failing full-router reproductions for #19 and #20.
2. Include forward, cross, and feedback edges in one side assignment and distribution pass.
3. Prefer left/right pairs for cross and feedback edges without making the choice mandatory.
4. Reject a port candidate when either endpoint leg conflicts.
5. Sort edges by feedback constraint, rank span, candidate regret, badge area, then edge ID.
6. Commit complete routes through the reservation ledger.
7. On failure, expand lane rings to the configured maximum.
8. Build a conflict set from failed routes and reservation conflicts.
9. Release only conflict-set routes and reroute the hardest edge first.
10. Stop on success, repeated state, no score improvement, or `maxRipUpPasses`.
11. Assert #19 and #20 have zero node penetration and zero shared length before badges.
12. Run all routing tests and typecheck.

```bash
bun test src/engine/layout/custom/portCandidates.test.ts
bun test src/engine/layout/custom/portAssignment.test.ts
bun test src/engine/layout/custom/portDistribution.test.ts
bun test src/engine/layout/custom/edgeRouter.test.ts
bun run typecheck
```

**Commit:** `feat: unify graph ports and reroute conflicts`

## Task 7: Generate Complete Badge Candidate Sets

**Owner:** `B1-badges`  
**Parallel:** Tasks 3 and 4.  
**Sequential requirement:** The same `B1` agent continues with Task 8.

**Files:**

- Modify: `src/engine/layout/custom/badgePlacement.ts`
- Modify: `src/engine/layout/custom/badgePlacement.test.ts`

1. Add failing tests for path ratios `0.5`, `0.35`, `0.65`, `0.2`, and `0.8`.
2. Add tests for every-segment centers and both perpendicular directions.
3. Add a long-label reproduction from scenario #16.
4. Generate candidates across the entire path, not only the longest segment.
5. Add perpendicular offset rings based on badge half-size, clearance, and lane spacing.
6. Keep the anchor on the owning route and store a separate badge center.
7. Generate both orthogonal leader shapes and reject illegal leaders.
8. Reject candidates that hit nodes or unrelated edge segments.
9. Add deterministic exterior candidates beyond the graph envelope.
10. Run focused tests and typecheck.

```bash
bun test src/engine/layout/custom/badgePlacement.test.ts
bun run typecheck
```

**Commit:** `feat: generate collision-free badge candidates`

## Task 8: Select Badges with Deterministic Conflict-Component Search

**Owner:** `B1-badges`  
**Parallel:** Tasks 5 and 9.  
**Depends on:** Task 7.

**Files:**

- Modify: `src/engine/layout/custom/badgePlacement.ts`
- Modify: `src/engine/layout/custom/badgePlacement.test.ts`

1. Add small reproductions for scenarios #5, #6, #8, #9, #11, #14, and #16.
2. Build candidate conflicts for node, badge, unrelated edge, and leader collisions.
3. Order badges by fewest legal candidates, descending area, then edge ID.
4. Choose candidates with bounded depth-first backtracking per conflict component.
5. Stop on a complete assignment, repeated component state, or the backtrack limit.
6. Return `unresolvedEdgeIds` instead of committing the least-bad invalid candidate.
7. Keep results deterministic when route and edge arrays are shuffled.
8. Assert all seven badge-only scenario reproductions have zero hard badge conflicts.
9. Run focused tests and typecheck.

```bash
bun test src/engine/layout/custom/badgePlacement.test.ts
bun run typecheck
```

**Commit:** `feat: solve badge conflict components`

## Task 9: Make Validation and Crossing Records Exact

**Owner:** `C1-contract-validator`  
**Parallel:** Tasks 5 and 8.  
**Depends on:** Task 1 only.

**Files:**

- Modify: `src/engine/layout/custom/layoutValidator.ts`
- Modify: `src/engine/layout/custom/layoutValidator.test.ts`
- Create: `src/engine/layout/custom/crossingDetection.ts`
- Create: `src/engine/layout/custom/crossingDetection.test.ts`

1. Add failing tests for missing routes, non-orthogonal internal segments, and leader collisions.
2. Add a duplicate-diagnostic test shaped like scenario #5.
3. Emit one diagnostic per code and canonical entity pair.
4. Attach the offending segment, rectangle, or crossing point to each diagnostic.
5. Count shared length once per edge pair.
6. Detect only interior perpendicular crossings; exclude endpoint contacts.
7. Assign one deterministic bridge owner using edge-role priority and edge ID.
8. Return crossing records and make `crossingCount` equal their length.
9. Run focused tests and typecheck.

```bash
bun test src/engine/layout/custom/layoutValidator.test.ts
bun test src/engine/layout/custom/crossingDetection.test.ts
bun run typecheck
```

**Commit:** `fix: make layout diagnostics and crossings exact`

## Task 10: Implement Bounded Badge-Aware Global Optimization

**Owner:** `G1-optimizer`  
**Parallel:** No. This is the integration point.  
**Depends on:** Tasks 3, 6, 8, and 9.

**Files:**

- Create: `src/engine/layout/custom/optimizeLayout.ts`
- Create: `src/engine/layout/custom/optimizeLayout.test.ts`

1. Add failing tests for local badge retry, route retry, spacing expansion, best-result preservation, and repeated-state termination.
2. Run the focused test and confirm failure.
3. Perform one pass: route, route-validate, place badges, full-validate, and build conflict sets.
4. Retry a badge conflict component before moving nodes or routes.
5. Rip up only routes named by route or badge-edge conflicts.
6. Try the next port-side candidate for an unresolved route.
7. If a badge still has no legal candidate, expand only its rank gap, adjacent node gap, or outer padding.
8. Recompute downstream stages after a spacing change.
9. Hash node positions, ports, routes, badges, and leaders.
10. Preserve the lexicographically best result.
11. Stop on zero hard errors, repeated hash, no improvement, or `maxGlobalPasses`.
12. Return a structured hard failure if the bound is exhausted.
13. Run the focused test and typecheck.

```bash
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun run typecheck
```

**Commit:** `feat: optimize badge-aware graph layouts`

## Task 11: Route the Public Engine Through the Optimizer

**Owner:** `G1-optimizer`  
**Parallel:** Task 13 may prepare testing-page rendering changes.  
**Depends on:** Task 10.

**Files:**

- Modify: `src/engine/layout/custom/computeCustomLayout.ts`
- Modify: `src/engine/layout/custom/computeCustomLayout.test.ts`
- Modify: `src/engine/layout/custom/index.ts`

1. Add a failing complete-pipeline test with one route conflict and one badge conflict.
2. Measure badges before routing so difficulty ordering can use badge area.
3. Compute node layout once, then call the bounded optimizer.
4. Return optimizer routes, badges, leaders, crossings, validation, and status.
5. Remove the hardcoded empty crossing array.
6. Assert `maxGlobalPasses` is exercised by a bounded failure test.
7. Export only the supported V2 entry points.
8. Run the focused tests, strict suite, and typecheck.

```bash
bun test src/engine/layout/custom/computeCustomLayout.test.ts
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun run typecheck
```

**Commit:** `feat: expose optimized custom graph layout`

## Task 12: Close Every Strict Scenario

**Owner:** `T1-acceptance`  
**Parallel:** No.  
**Depends on:** Tasks 10 and 11.

**Files:**

- Modify only if a missing assertion is found:
  - `src/engine/layout/custom/customLayoutValidatorStrict.test.ts`
  - `src/features/GraphTesting/data/customLayoutScenarios.test.ts`
- Modify: `src/engine/layout/custom/generatedGraph.test.ts`

1. Run scenarios individually in numeric order.
2. For a failure, report the exact diagnostic and owning group.
3. Do not fix engine code in the `T1` branch.
4. Send route defects to `R1`, badge defects to `B1`, hierarchy defects to `H1`, and validator defects to `C1`.
5. Let the original owner add the smallest module reproduction and fix.
6. Merge each owner fix separately and rerun all 20 scenarios.
7. Stop only when all 20 pass with `status: "success"`.
8. Require valid success, edge-count preservation, and determinism for supported generated fixtures.
9. Shuffle generated node and edge arrays and require deep equality.
10. Record, shrink, and retain every newly failing random seed.
11. Do not accept `invalid_hard_failure` as a passing generated property.

```bash
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun test src/engine/layout/custom/generatedGraph.test.ts
```

Expected: strict suite `20 pass, 0 fail`; supported generated fixtures all pass.

**Commit:** `test: close all custom layout scenarios`

## Task 13: Render Leaders and One Bridge per Crossing in the Testing Lab

**Owner:** `U1-visual-lab`  
**Parallel:** May start beside Task 11 after V2 contracts are frozen.

**Files:**

- Modify: `src/features/GraphTesting/components/GraphTestingPage.tsx`
- Modify: `src/features/GraphTesting/components/GraphTestingModal.tsx`
- Modify: `src/features/GraphTesting/components/CustomLayoutDebugOverlay.tsx`
- Modify: `src/features/GraphTesting/components/CustomLayoutMetrics.tsx`

1. Preserve `layoutRole` in both page and modal adapters.
2. Draw badge `leaderPoints` as orthogonal polylines.
3. Pass only crossings owned by the current bridged edge into the SVG serializer.
4. Draw debug crossing markers from `result.crossings`.
5. Highlight diagnostic geometry when diagnostics are enabled.
6. Show unresolved route and badge counts in metrics.
7. Verify scenarios #8, #14, #19, and #20 in the existing testing page.
8. Run typecheck and build.

```bash
bun run typecheck
bun run build:local
```

**Commit:** `feat: visualize v2 layout diagnostics`

## Optional Task D: Restore the Independent Dagre Baseline

**Owner:** `D1-dagre-baseline`  
**Parallel:** Any wave after Wave 0.  
**Dependency on custom engine:** None.

The repository-wide suite currently has one pre-existing failure:

```text
dagreLayout multi-port equal spacing
applies badge repulsion so edge badges do not overlap each other or nodes
```

`dagreLayout.ts` currently calculates label midpoints but contains no repulsion pass.

**Files:**

- Modify: `src/engine/layout/dagreLayout.ts`
- Modify: `src/engine/layout/dagreLayout.test.ts`

1. Add a node-collision assertion to the existing two-edge badge test.
2. Confirm the focused test fails before editing implementation.
3. Add deterministic label displacement for parallel Dagre edges.
4. Do not import or call the custom engine from Dagre.
5. Do not weaken or delete the separation assertion.
6. Run the focused test and typecheck.

```bash
bun test src/engine/layout/dagreLayout.test.ts
bun run typecheck
```

**Commit:** `fix: restore dagre badge repulsion`

This task is required only for a fully green repository-wide `bun test`. It is not part of the custom engine's 20-scenario acceptance result.

## Task 14: Final Orchestrator Verification

**Owner:** `O0-orchestrator`  
**Parallel:** Read-only visual inspection may be divided among three inspectors.

### Automated Gate

Run in this order:

```bash
git status --short
bun test src/engine/layout/custom/geometry.test.ts
bun test src/engine/layout/custom/cycleBreaking.test.ts
bun test src/engine/layout/custom/rankAssignment.test.ts
bun test src/engine/layout/custom/routeOccupancy.test.ts
bun test src/engine/layout/custom/routingGrid.test.ts
bun test src/engine/layout/custom/routeSearch.test.ts
bun test src/engine/layout/custom/specialRoutes.test.ts
bun test src/engine/layout/custom/edgeRouter.test.ts
bun test src/engine/layout/custom/badgePlacement.test.ts
bun test src/engine/layout/custom/layoutValidator.test.ts
bun test src/engine/layout/custom/crossingDetection.test.ts
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun test src/engine/layout/custom/computeCustomLayout.test.ts
bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts
bun test src/engine/layout/custom/generatedGraph.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run build:local
bun test
```

Required custom result: `20 pass, 0 fail`.

Required repository result:

- `0` failures if optional Task D was included.
- Otherwise, only the already recorded Dagre baseline failure may remain.

### Generated-Graph Gate

Confirm Task 12 made `generatedGraph.test.ts` require:

- `validation.isValid === true`.
- `status === "success"`.
- Input edge count preservation.
- Deep equality after shuffled input.
- Fixed, source-controlled seeds for every regression.

### Read-Only Visual Inspection Split

These inspectors do not edit code:

| Inspector | Scenarios |
| --------- | --------- |
| Visual A  | #1–#7     |
| Visual B  | #8–#14    |
| Visual C  | #15–#20   |

Each inspector reports:

- Incorrect hierarchy.
- Node collisions.
- Edge-node penetration.
- Shared visible tracks.
- Hidden arrowheads.
- Badge collisions.
- Excessive leaders.
- Missing crossing bridges.
- Non-deterministic movement after repeat selection.

The orchestrator deduplicates the reports and sends each defect back to its original module owner.

## Merge Gates

After every task commit:

1. Confirm the diff contains only owned files.
2. Run the task's focused test.
3. Run `bun run typecheck`.
4. Merge or cherry-pick the single task commit.
5. Run the strict 20-scenario suite.
6. Record the new pass/fail count in the ledger.
7. Revert the merge if it regresses a previously passing scenario.

Do not merge several worker commits before running the strict suite.

## Worker Handoff Format

Every worker returns:

```text
Group:
Task:
Commit:
Files changed:
Failing test added:
Focused command:
Focused result:
Strict scenarios improved:
Strict scenarios regressed:
Contract request:
Remaining risk:
```

## End-of-Plan Agent Grouping Summary

The following grouping is mandatory at the end as well as the start:

- `O0-orchestrator` stays active from bootstrap through final verification.
- `C1` performs Task 1, pauses, then performs Task 9 with the same agent.
- `T1` performs Task 2, pauses, then performs Task 12 with the same agent.
- `H1` performs all hierarchy work in Task 3; no other agent edits hierarchy files.
- `R1` performs Tasks 4 → 5 → 6 sequentially with the same agent.
- `B1` performs Tasks 7 → 8 sequentially with the same agent.
- `G1` performs Tasks 10 → 11 sequentially after routing, badges, hierarchy, and validation merge.
- `U1` performs Task 13 and edits only visual-lab files.
- `D1` is independent and touches only Dagre files.
- Visual inspectors are read-only and report to `O0`.

### Final Test-to-Group Map

| Test area                                          | Owning group |
| -------------------------------------------------- | ------------ |
| Input roles and limits                             | `C1`         |
| Same-rank semantics                                | `H1`         |
| Ports, endpoint legs, lanes, feedback, rip-up      | `R1`         |
| Badge candidates, leaders, global label assignment | `B1`         |
| Diagnostics and crossing records                   | `C1`         |
| Global convergence                                 | `G1`         |
| Scenario #1–#20 strict suite                       | `T1`         |
| Generated graphs                                   | `T1`         |
| Testing-page visual output                         | `U1`         |
| Full integration gates                             | `O0`         |
| Existing Dagre regression                          | `D1`         |

### Orchestrator Closing Checklist

- [ ] Exactly one orchestrator managed the run.
- [ ] All parallel work used disjoint writable files.
- [ ] Tasks 4–6 stayed with one routing agent.
- [ ] Tasks 7–8 stayed with one badge agent.
- [ ] Tasks 10–11 stayed with one optimizer agent.
- [ ] Every behavior change started with a failing test.
- [ ] Every merge passed its focused test and typecheck.
- [ ] Every merge reran the strict suite.
- [ ] All 20 custom scenarios pass.
- [ ] Scenario #8 actually renders peers on one rank.
- [ ] Scenarios #19 and #20 have no route hard failures.
- [ ] All badges and leaders are collision-free.
- [ ] Crossing records and visible bridges agree.
- [ ] Generated supported graphs require valid success.
- [ ] The testing page was visually inspected.
- [ ] The repository-wide Dagre baseline was fixed or explicitly recorded.
- [ ] No third-party layout runner was added.
