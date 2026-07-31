# Custom Directed Graph Layout and Orthogonal Routing Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free TypeScript layout engine that positions directed graphs from top to bottom, handles cycles and same-rank links, assigns ports on all four node sides, routes distinct obstacle-avoiding orthogonal edges, places collision-free edge badges, and validates every result before it is rendered.

**Architecture:** Implement a deterministic pipeline of small pure modules: normalize the graph, classify cycles, assign ranks, minimize crossings, place nodes, assign ports, route edges over a sparse rectilinear grid, reserve lanes, place badges, reroute conflicts, and validate the result. The Graph Testing page consumes the engine first; production uses it only after every hard invariant passes.

**Tech Stack:** TypeScript 7, React 19, SVG, Bun tests, Web Worker built from repository code. Do not add ELK, libavoid, Graphviz, yFiles, Cytoscape, WebCola, or any other layout/routing dependency.

---

## Locked Decisions

1. Existing Graph Testing algorithms are discarded trials. Do not copy logic from:
   - `src/features/GraphTesting/algorithm/shortestPathEngine.ts`
   - `src/features/GraphTesting/algorithm/dagreRankEngine.ts`
   - `src/features/GraphTesting/algorithm/legacyCollisionEngines.ts`
   - old routing code in Git history or planning patches
2. Reuse the `/testing` route and scenario shell only as a visual laboratory.
3. Version 1 uses strict orthogonal segments: horizontal and vertical only.
4. The primary layout direction is top to bottom.
5. All four node sides remain available to every non-self edge.
6. Bottom-to-top is a preference for forward edges, not a hard rule.
7. Left/right is preferred for edges whose endpoints occupy the same rank.
8. Feedback edges use local or outer side corridors.
9. Nodes and badges are rectangular hard obstacles.
10. Two different edges must never share a positive-length segment.
11. Crossings are minimized but cannot be forbidden for every arbitrary graph.
12. Unavoidable crossings are reported and rendered with a visible bridge.
13. One edge on a node side uses the exact center of that side.
14. Multiple edges on one side use deterministic equal spacing.
15. Incoming and outgoing edges share the same side-capacity calculation.
16. Badge midpoint placement is a soft preference. Collision freedom wins.
17. No arbitrary input node-count or edge-count limit is introduced.
18. Every search has deterministic tie-breaking and a documented termination rule.
19. Production keeps the current layout until the laboratory acceptance gate passes.
20. No unrelated UI or state refactor is part of this plan.

---

## Hard Invariants

The engine must not return a successful result unless all of these are true:

1. Node rectangles do not overlap.
2. Every edge endpoint lies on its assigned source or target boundary.
3. Every first and last edge segment leaves or enters perpendicular to that boundary.
4. No edge enters a node rectangle except at its own endpoint.
5. No two edges share a positive-length collinear segment.
6. Badge rectangles do not overlap nodes.
7. Badge rectangles do not overlap other badges.
8. Badge rectangles do not overlap unrelated edges.
9. Every directed edge has a non-zero final segment for its arrowhead.
10. Every returned coordinate is finite.
11. Repeating the same layout input and configuration returns identical output.

Crossing count, total length, bend count, side reuse, and graph area are soft metrics.

---

## Score Ordering

Never combine hard failures and aesthetics into one unstructured number. Compare layouts lexicographically in this order:

1. Invalid or non-finite geometry.
2. Node-node overlaps.
3. Edge-node penetrations.
4. Shared edge-segment length.
5. Badge-node overlaps.
6. Badge-badge overlaps.
7. Badge-unrelated-edge overlaps.
8. Edge crossing count.
9. Total bend count.
10. Total route length.
11. Direction-deviation penalty.
12. Port-side reuse penalty.
13. Total graph area.

A lower item may break a tie only when every higher item is equal.

---

## Small-Model Execution Rules

1. Execute one task at a time.
2. Do not begin a task until the previous task's tests pass.
3. Read only the files listed for the current task plus directly imported types.
4. Do not refactor unrelated code.
5. Do not add a package dependency.
6. Write the failing test before implementation.
7. Use exact node and edge IDs as deterministic tie-breakers.
8. Never use `Math.random()`.
9. Never silently drop an invalid node or edge.
10. Never return a layout that the validator marks invalid.
11. Commit after every task.
12. If an expected test fails for a different reason, stop and diagnose it before editing more files.

---

## Parallel-Agent Execution Rules

### Atomic delegation rule

One numbered task is the smallest writable delegation unit.

The same agent must perform every checkbox inside that task in order:

```text
write failing test
run focused test and confirm expected failure
implement the task
run focused tests
run the task's static checks
commit
return summary
```

Do not assign a test step to one agent and the implementation step to another. They share reasoning, files, and intermediate state.

### Single-owner chain rule

Some adjacent tasks must remain with one agent because their contracts are tightly coupled. That agent completes the tasks sequentially and creates one commit per task.

Required single-owner chains:

| Work package            | Tasks       | Why one agent owns the chain                                                                    |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `F0-foundation`         | 1, 1A       | Configuration, internal contracts, and node-size contracts must stabilize together.             |
| `A1-graph-analysis`     | 3, 4, 5, 6  | Normalization, SCC IDs, cycle roles, and rank semantics share the same graph model.             |
| `L1-layered-layout`     | 7, 8, 9, 10 | Virtual nodes, crossing order, coordinates, and orchestration share the layer graph.            |
| `P1-port-system`        | 11, 12, 13  | Candidate costs, selected sides, and exact port positions must agree.                           |
| `R1-route-search`       | 14, 15      | Grid edge identity and A* occupancy costs must use one representation.                          |
| `I1-engine-integration` | 21, 23      | Global optimization and the public synchronous pipeline share convergence and status behavior.  |
| `T1-public-adapter`     | 28, 29      | Public routed types and their adapter must be changed together.                                 |
| `C1-final-cleanup`      | 37, 38      | Trial removal and removal of the temporary gate happen only after the same acceptance evidence. |

Do not split one of these chains across agents even when another concurrency slot is free.

### Parallel delegation rule

Two work packages may run concurrently only when:

1. Every dependency in the execution wave table is already merged.
2. Their writable file sets are disjoint.
3. Neither package changes a contract consumed by the other.
4. Each agent works from the same wave base commit.
5. Each agent uses its own branch or isolated worktree.
6. Agents return commits to the orchestrator; they do not merge each other.

### Shared-worktree prohibition

Do not run parallel writing agents in one working tree. Use one of:

```text
one git worktree per work package
one isolated branch workspace per work package
one orchestrator-provided patch sandbox per work package
```

Read-only verification agents may share the same integrated commit, but they must not edit files.

### Contract freeze

Task 1 and Task 1A form the contract-freeze gate. After `F0-foundation` is merged:

- Parallel agents may consume the types.
- Parallel agents may not rename, remove, or reinterpret a frozen type.
- A required contract change must be returned to the orchestrator as a written request.
- The orchestrator makes or assigns the contract change once, merges it, and restarts affected packages from the new base.

This avoids several small agents inventing incompatible meanings for the same field.

### File-ownership rule

During a wave, an agent owns only the files in its assigned task's `Files` section.

An agent may read imported files, but must not edit them unless the task lists them. If an unlisted edit appears necessary:

1. Stop that work package.
2. Report the exact file and reason.
3. Let the orchestrator decide whether to expand ownership or create a prerequisite task.

### Merge rule

The orchestrator performs every wave merge:

1. Confirm the agent returned the expected commits.
2. Inspect the changed-file list.
3. Reject unexpected files.
4. Review the task's focused test output.
5. Merge or cherry-pick packages in the wave's listed merge order.
6. Run the wave merge gate.
7. Fix integration failures before starting the next wave.
8. Record the integrated commit as the next wave's base.

If two supposedly independent packages conflict, do not auto-resolve the conflict. Merge the lower-level package first and rerun the other package from the new base.

---

## Parallel Work Packages

| Package                 | Agent specialization      |  Tasks | Writable area                                                                     | Required input                     | Expected return                                         |
| ----------------------- | ------------------------- | -----: | --------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `F0-foundation`         | Contracts and migration   |  1, 1A | `custom/types.ts`, `custom/config*`, shared node dimensions, listed Dagre imports | Current main branch                | Two ordered commits; frozen contract summary            |
| `G1-geometry`           | Computational geometry    |      2 | `custom/geometry*`                                                                | `F0`                               | Geometry commit; epsilon behavior summary               |
| `B1-badge-size`         | Badge measurement         |     18 | `badgeMeasurement*`, `EdgeBadgeOverlay.tsx`                                       | `F0`                               | Badge measurement commit; visual parity note            |
| `Q1-scenarios`          | Test data                 |     24 | `customLayoutScenarios*`                                                          | `F0`                               | Scenario commit; scenario-purpose index                 |
| `A1-graph-analysis`     | Directed graph algorithms |    3–6 | normalization, SCC, cycle breaking, ranks and tests                               | `F0`, `G1`                         | Four ordered commits; final edge-role and rank contract |
| `V1-validator`          | Geometry validation       |     20 | `layoutValidator*`                                                                | `F0`, `G1`                         | Validator commit; invariant coverage matrix             |
| `S1-svg`                | SVG path serialization    |     22 | `svgPath*`                                                                        | `F0`, `G1`                         | Serializer commit; bridge-priority summary              |
| `L1-layered-layout`     | Sugiyama-style placement  |   7–10 | layer graph, crossing, coordinates, node layout and tests                         | `A1`                               | Four ordered commits; node-layout debug schema          |
| `P1-port-system`        | Port optimization         |  11–13 | port candidate, assignment, distribution files and tests                          | `L1`                               | Three ordered commits; side-cost breakdown              |
| `R1-route-search`       | Obstacle routing          |  14–15 | routing grid, A* search and tests                                                 | `P1`, `G1`                         | Two ordered commits; grid and occupancy contract        |
| `R2-special-routes`     | Cyclic routing            |     16 | `specialRoutes*`                                                                  | `R1`, `P1`, `G1`                   | Special-route commit; corridor policy summary           |
| `R3-global-router`      | Route integration         |     17 | `edgeRouter*`                                                                     | `R1`, `R2`                         | Router commit; lane and rip-up diagnostics              |
| `B2-badge-placement`    | Label optimization        |     19 | `badgePlacement*`                                                                 | `R3`, `B1`                         | Badge placement commit; candidate policy summary        |
| `I1-engine-integration` | Pipeline integration      | 21, 23 | optimizer, engine entry, index and tests                                          | `L1`, `P1`, `R3`, `B2`, `V1`, `S1` | Two ordered commits; engine status summary              |
| `Q2-generated-tests`    | Property-style QA         |     25 | `generatedGraph.test.ts`                                                          | `I1`                               | Generated-test commit; seed list                        |
| `U1-laboratory`         | React debug UI            |     26 | Graph Testing page, debug components, testing CSS                                 | `I1`, `Q1`, `V1`                   | Laboratory commit; control and metric inventory         |
| `T1-public-adapter`     | Public graph contracts    |  28–29 | public graph types, adapter and tests                                             | Task 27 acceptance                 | Two ordered commits; public API diff                    |
| `W1-worker`             | Worker transport          |     30 | worker, client and client tests                                                   | `T1`                               | Worker commit; stale-result behavior                    |
| `U2-renderer`           | SVG/React rendering       |     31 | GraphEdge files and component test                                                | `T1`, `S1`, `B1`                   | Renderer commit; markup assertions                      |
| `D1-dispatcher`         | Layout dispatch           |     32 | layout dispatcher and test                                                        | `T1`, `F0`                         | Dispatcher commit; rollback behavior                    |
| `E1-exporter`           | Static export             |     34 | HTML exporter and test                                                            | `T1`, `I1`, `F0`                   | Export commit; unresolved-result behavior               |
| `C0-canvas-integration` | Canvas async integration  |     33 | GraphCanvas and request test                                                      | `W1`, `D1`                         | Canvas commit; stale-request test result                |
| `C1-final-cleanup`      | Final integration cleanup |  37–38 | listed trial files and dispatcher gate                                            | Tasks 35–36                        | Two ordered commits; deletion list                      |

---

## Parallel Execution Waves

### Wave 0 — Foundation, sequential

Run one agent:

```text
F0-foundation → Task 1 → Task 1A
```

Do not dispatch any other writing package until both commits are merged.

**Wave 0 merge gate:**

```bash
bun test src/engine/layout/custom/config.test.ts
bun test src/engine/layout/nodeDimensions.test.ts
bun test src/engine/layout/dagreLayout.test.ts
bun run typecheck
```

### Wave 1 — Independent primitives, three agents in parallel

Start from the Wave 0 integrated commit:

```text
Agent 1 → G1-geometry → Task 2
Agent 2 → B1-badge-size → Task 18
Agent 3 → Q1-scenarios → Task 24
```

Writable files are disjoint.

**Merge order:** `G1`, `B1`, `Q1`.

**Wave 1 merge gate:**

```bash
bun test src/engine/layout/custom/geometry.test.ts
bun test src/engine/layout/custom/badgeMeasurement.test.ts
bun test src/features/GraphTesting/data/customLayoutScenarios.test.ts
bun run typecheck
```

### Wave 2 — Graph analysis and independent consumers, three agents in parallel

Start from the Wave 1 integrated commit:

```text
Agent 1 → A1-graph-analysis → Tasks 3, 4, 5, 6 sequentially
Agent 2 → V1-validator → Task 20
Agent 3 → S1-svg → Task 22
```

The validator and serializer consume frozen geometry/types but do not edit graph-analysis files.

**Merge order:** `A1`, `V1`, `S1`.

**Wave 2 merge gate:**

```bash
bun test src/engine/layout/custom/normalizeGraph.test.ts
bun test src/engine/layout/custom/stronglyConnectedComponents.test.ts
bun test src/engine/layout/custom/cycleBreaking.test.ts
bun test src/engine/layout/custom/rankAssignment.test.ts
bun test src/engine/layout/custom/layoutValidator.test.ts
bun test src/engine/layout/custom/svgPath.test.ts
bun run typecheck
```

### Wave 3 — Layered placement, sequential

Run one agent:

```text
L1-layered-layout → Task 7 → Task 8 → Task 9 → Task 10
```

These tasks share virtual-node identity, rank ordering, and coordinate metadata. Do not parallelize them.

**Wave 3 merge gate:**

```bash
bun test src/engine/layout/custom/layerGraph.test.ts
bun test src/engine/layout/custom/crossingMinimization.test.ts
bun test src/engine/layout/custom/coordinateAssignment.test.ts
bun test src/engine/layout/custom/nodeLayout.test.ts
bun run typecheck
```

### Wave 4 — Port system, sequential

Run one agent:

```text
P1-port-system → Task 11 → Task 12 → Task 13
```

Do not parallelize candidate generation, side selection, and distribution; later tasks directly interpret earlier cost records.

**Wave 4 merge gate:**

```bash
bun test src/engine/layout/custom/portCandidates.test.ts
bun test src/engine/layout/custom/portAssignment.test.ts
bun test src/engine/layout/custom/portDistribution.test.ts
bun run typecheck
```

### Wave 5 — Routing engines, two sequential subwaves

#### Wave 5A — Routing grid and A*

Run one agent from the Wave 4 integrated commit:

```text
R1-route-search → Task 14 → Task 15 sequentially
```

Merge `R1` and run:

```bash
bun test src/engine/layout/custom/routingGrid.test.ts
bun test src/engine/layout/custom/routeSearch.test.ts
bun run typecheck
```

#### Wave 5B — Special routes

Start `R2` only after `R1` is merged:

```text
R2-special-routes → Task 16
```

Task 16 calls the route-search fallback defined by Task 15, so these packages must not run concurrently.

**Wave 5 merge gate:**

```bash
bun test src/engine/layout/custom/routingGrid.test.ts
bun test src/engine/layout/custom/routeSearch.test.ts
bun test src/engine/layout/custom/specialRoutes.test.ts
bun run typecheck
```

### Wave 6 — Global edge router, sequential integration

Run one integration agent:

```text
R3-global-router → Task 17
```

This task is the first owner allowed to combine normal routes, special routes, and atomic occupancy.

**Wave 6 merge gate:**

```bash
bun test src/engine/layout/custom/edgeRouter.test.ts
bun test src/engine/layout/custom
bun run typecheck
```

### Wave 7 — Badge placement, sequential

Run one agent:

```text
B2-badge-placement → Task 19
```

It consumes merged router output and the already merged badge-measurement contract.

**Wave 7 merge gate:**

```bash
bun test src/engine/layout/custom/badgePlacement.test.ts
bun test src/engine/layout/custom/layoutValidator.test.ts
bun run typecheck
```

### Wave 8 — Complete engine integration, sequential

Run one integration agent:

```text
I1-engine-integration → Task 21 → Task 23
```

Do not split these tasks. The optimizer's convergence states become the engine's success and unresolved statuses.

**Wave 8 merge gate:**

```bash
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun test src/engine/layout/custom/computeCustomLayout.test.ts
bun test src/engine/layout/custom
bun run typecheck
bun run lint
```

### Wave 9 — Automated stress tests and laboratory UI, two agents in parallel

Start from the Wave 8 integrated commit:

```text
Agent 1 → Q2-generated-tests → Task 25
Agent 2 → U1-laboratory → Task 26
```

`Q2` edits only generated tests. `U1` edits only laboratory UI files.

**Merge order:** `Q2`, then `U1`.

**Wave 9 merge gate:**

```bash
bun test src/engine/layout/custom/generatedGraph.test.ts
bun test src/features/GraphTesting
bun run typecheck
bun run lint
bun run build:local
```

### Wave 10 — Laboratory acceptance, orchestrator-owned

Task 27 is an integration gate and has one write owner: the orchestrator.

Read-only inspection may be parallelized:

```text
Inspector 1 → basic DAG, chain, fan-out, fan-in, diamond
Inspector 2 → reciprocal, SCC, self-loop, long-feedback scenarios
Inspector 3 → dense badges, parallel edges, central obstacle
Inspector 4 → disconnected, variable-size, agent trace, DevOps mesh
```

Each inspector returns:

```text
scenario ID
diagnostic codes
visible defect description
suspected owning module
no code changes
```

The orchestrator deduplicates reports, creates the smallest failing automated tests, and then dispatches fixes by independent owning module. Node-layout, route-search, badge-placement, and serializer fixes may run in parallel only when their writable files are disjoint. The orchestrator merges them one at a time and reruns the full Wave 10 gate after every merge.

**Wave 10 merge gate:** use every command and acceptance condition already listed in Task 27.

### Wave 11 — Public type adaptation, sequential

After Task 27 is approved, run one agent:

```text
T1-public-adapter → Task 28 → Task 29
```

The adapter must compile against the public fields created by the same agent.

**Wave 11 merge gate:**

```bash
bun test src/types/graphData.test.ts
bun test src/engine/layout/custom/computeCustomLayout.test.ts
bun run typecheck
```

### Wave 12 — Production adapters, four agents in parallel

Start all packages from the Wave 11 integrated commit:

```text
Agent 1 → W1-worker → Task 30
Agent 2 → U2-renderer → Task 31
Agent 3 → D1-dispatcher → Task 32
Agent 4 → E1-exporter → Task 34
```

These packages have disjoint writable files. None may edit `GraphCanvas/index.tsx`.

**Merge order:** `W1`, `U2`, `D1`, `E1`.

**Wave 12 merge gate:**

```bash
bun test src/engine/layout/custom/customLayoutClient.test.ts
bun test src/primitives/edges/GraphEdge/GraphEdge.test.tsx
bun test src/engine/layout/layoutDispatcher.test.ts
bun test src/utils/htmlExporter.test.ts
bun run typecheck
bun run build:local
```

### Wave 13 — Canvas integration, sequential

Run one integration agent:

```text
C0-canvas-integration → Task 33
```

It consumes both the merged worker client and dispatcher. Do not begin it from either parallel branch.

**Wave 13 merge gate:**

```bash
bun test src/engine/GraphCanvas/layoutRequest.test.ts
bun run typecheck
bun run build:local
```

### Wave 14 — Full verification

Task 35 remains orchestrator-owned.

The following read-only commands may run in parallel after all Wave 13 changes are merged:

```text
Verifier 1 → bun test src/engine/layout/custom
Verifier 2 → bun test src/features/GraphTesting
Verifier 3 → bun run typecheck
Verifier 4 → bun run lint && bun run format:check
```

Run `bun test` and `bun run build:local` after those focused checks pass. Do not edit code from verification agents; convert failures into focused repair packages.

### Wave 15 — Visual approval and cleanup, sequential

Run in this order:

```text
Task 36 visual verification
Task 37 obsolete trial cleanup
Task 38 production-gate removal
```

Tasks 37 and 38 stay with `C1-final-cleanup`. Do not parallelize deletion and gate removal because both rely on the same final acceptance state and dispatcher behavior.

---

## Parallel Agent Prompt Template

The orchestrator must create a self-contained prompt for every package:

```markdown
You own work package: <package-id>
Base commit: <integrated-wave-sha>
Plan file: docs/planning/GVUI/custom-directed-graph-layout-routing-engine-plan.md
Tasks to execute in order: <task numbers>

Writable files:

- <exact file list copied from the tasks>

Read-only context:

- <directly imported contracts>
- <preceding task outputs required to understand the work>

Constraints:

- Execute every checkbox in each assigned task in order.
- Write the failing test before implementation.
- Do not edit files outside the writable list.
- Do not add dependencies.
- Do not rename frozen contracts.
- Create one commit per numbered task.
- Stop and report if an unlisted edit or contract change is required.

Verification:

- <exact focused commands copied from the tasks>

Return:

- Commit hash for each task.
- Changed-file list.
- Focused test results.
- Short implementation summary.
- Any contract risk or follow-up needed.
```

Do not pass the entire conversation to a worker. Give it only this prompt, the plan path, its exact tasks, and the merged prerequisite files.

---

## Orchestrator Progress Ledger

The orchestrator keeps one ledger entry per package:

| Package         | Base commit | Agent    | Status                               | Returned commits | Focused checks | Merge result   |
| --------------- | ----------- | -------- | ------------------------------------ | ---------------- | -------------- | -------------- |
| `F0-foundation` | SHA         | agent ID | pending/running/review/merged/failed | SHAs             | pass/fail      | integrated SHA |

Allowed status transitions:

```text
pending → running → review → merged
pending → running → failed
review → running
```

Do not start a dependent package until every required package says `merged`, not merely `review` or `passed`.

---

## Planned File Structure

### Core layout engine

- `src/engine/layout/custom/types.ts`
  - Internal geometry, graph, port, route, badge, diagnostic, metric, and configuration contracts.
- `src/engine/layout/custom/config.ts`
  - Default configuration and configuration validation.
- `src/engine/layout/custom/geometry.ts`
  - Points, rectangles, orthogonal segments, intersections, expansion, containment, and path simplification.
- `src/engine/layout/custom/normalizeGraph.ts`
  - Input validation, deterministic ordering, adjacency maps, and weak components.
- `src/engine/layout/custom/stronglyConnectedComponents.ts`
  - Tarjan strongly connected component analysis.
- `src/engine/layout/custom/cycleBreaking.ts`
  - Deterministic cycle breaking and edge-role classification.
- `src/engine/layout/custom/rankAssignment.ts`
  - Topological ordering and top-to-bottom rank assignment.
- `src/engine/layout/custom/layerGraph.ts`
  - Virtual nodes for long edges and layer adjacency.
- `src/engine/layout/custom/crossingMinimization.ts`
  - Barycenter sweeps, adjacent transposition, and crossing counts.
- `src/engine/layout/custom/coordinateAssignment.ts`
  - Collision-free node coordinates and disconnected-component packing.
- `src/engine/layout/custom/nodeLayout.ts`
  - Node-layout orchestration.
- `src/engine/layout/custom/portCandidates.ts`
  - Four-side port candidates, side-pair estimates, and stubs.
- `src/engine/layout/custom/portAssignment.ts`
  - Global side-pair selection and local improvement.
- `src/engine/layout/custom/portDistribution.ts`
  - Equal spacing and deterministic ordering on each side.
- `src/engine/layout/custom/routingGrid.ts`
  - Sparse rectilinear grid, obstacle expansion, visibility, and lane coordinates.
- `src/engine/layout/custom/routeSearch.ts`
  - Direction-aware A* search and route cost calculation.
- `src/engine/layout/custom/specialRoutes.ts`
  - Self-loops and feedback-edge corridors.
- `src/engine/layout/custom/edgeRouter.ts`
  - Route ordering, occupancy, lane reservation, and rip-up/reroute.
- `src/engine/layout/custom/badgePlacement.ts`
  - Badge measurement, candidate generation, placement, and leader anchors.
- `src/engine/layout/custom/layoutValidator.ts`
  - Hard-invariant checks and quality metrics.
- `src/engine/layout/custom/optimizeLayout.ts`
  - Badge-aware rerouting and best-result selection.
- `src/engine/layout/custom/svgPath.ts`
  - SVG serialization and crossing bridges.
- `src/engine/layout/custom/computeCustomLayout.ts`
  - Public synchronous engine entry point.
- `src/engine/layout/custom/index.ts`
  - Public exports only.
- `src/engine/layout/nodeDimensions.ts`
  - Shared node-size calculation used by Dagre during migration, the custom engine adapter, the worker request, and export.

### Worker and application adapters

- `src/engine/layout/custom/customLayout.worker.ts`
  - Repository-owned Web Worker entry point.
- `src/engine/layout/custom/customLayoutClient.ts`
  - Request IDs, cancellation-by-staleness, and worker result handling.
- `src/features/GraphTesting/data/customLayoutScenarios.ts`
  - Focused layout and routing fixtures.
- `src/features/GraphTesting/components/CustomLayoutDebugOverlay.tsx`
  - Optional ranks, ports, obstacles, grid, lanes, badges, crossings, and violations.
- `src/features/GraphTesting/components/CustomLayoutMetrics.tsx`
  - Invariant and quality metric display.
- `src/features/GraphTesting/components/GraphTestingPage.tsx`
  - Single-engine laboratory controls and rendering.

### Existing integration points

- `src/types/graphData.ts`
  - Add routed-point, port, badge-anchor, and crossing fields.
- `src/primitives/edges/GraphEdge/index.tsx`
  - Render final SVG path and crossing bridges.
- `src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx`
  - Consume centralized badge dimensions and optional leader anchor.
- `src/engine/layout/layoutDispatcher.ts`
  - Use custom layout for top-down mode after the acceptance gate.
- `src/engine/GraphCanvas/index.tsx`
  - Use the worker client for production top-down layout.
- `src/utils/htmlExporter.ts`
  - Use the synchronous custom engine during export.

---

## Phase A — Contracts, Geometry, and Graph Analysis

### Task 1: Define Internal Contracts and Configuration

**Files:**

- Create: `src/engine/layout/custom/types.ts`
- Create: `src/engine/layout/custom/config.ts`
- Create: `src/engine/layout/custom/config.test.ts`

- [ ] **Step 1: Write configuration validation tests**
  - Assert positive values for node gap, rank gap, port stub, obstacle clearance, lane spacing, and badge clearance.
  - Assert non-negative cost weights.
  - Assert invalid values throw `LayoutConfigurationError`.
  - Assert a partial configuration merges over defaults without mutating the defaults.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/config.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Define the contracts**

Define these exact public internal names:

```ts
type Side = "top" | "right" | "bottom" | "left";
type AxisDirection = "horizontal" | "vertical";
type EdgeRole = "forward" | "cross" | "feedback" | "self";
type SegmentDirection = "up" | "right" | "down" | "left";

interface Point {
  x: number;
  y: number;
}
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Segment {
  a: Point;
  b: Point;
}
type NodeSizeMap = Record<string, { width: number; height: number }>;
interface PortRef {
  nodeId: string;
  side: Side;
  index: number;
  point: Point;
  stub: Point;
}
interface RoutedPath {
  edgeId: string;
  points: Point[];
  sourcePort: PortRef;
  targetPort: PortRef;
}
interface LayoutDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  ids: string[];
}
```

Also define normalized graph types, SCC results, layer items, routing-grid vertices and edges, occupancy records, badge candidates, badge placements, crossing records, validation results, layout metrics, and the final `CustomLayoutResult`.

- [ ] **Step 4: Define `CustomLayoutConfig`**

Include explicit defaults for:

```text
nodeGap = 56
rankGap = 120
componentGap = 160
graphPadding = 80
portStubLength = 20
portEndpointPadding = 16
obstacleClearance = 16
laneSpacing = 12
initialLaneRings = 2
maxLaneRings = 8
bendPenalty = 40
crossingPenalty = 500
directionPenalty = 120
sideReusePenalty = 32
nearObstaclePenalty = 8
badgeClearance = 10
maxCrossingSweeps = 24
maxPortImprovementPasses = 12
maxRipUpPasses = 12
maxGlobalPasses = 8
epsilon = 0.001
```

The maximum values are search termination rules, not input-size limits.

- [ ] **Step 5: Implement immutable configuration merging and validation**
  - Export `DEFAULT_CUSTOM_LAYOUT_CONFIG`.
  - Export `resolveCustomLayoutConfig(partial?)`.
  - Freeze the default object in development.
  - Return a fresh resolved object.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/config.test.ts
bun run typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/types.ts src/engine/layout/custom/config.ts src/engine/layout/custom/config.test.ts
git commit -m "feat: define custom layout engine contracts"
```

---

### Task 1A: Centralize Node Dimension Calculation

**Files:**

- Create: `src/engine/layout/nodeDimensions.ts`
- Create: `src/engine/layout/nodeDimensions.test.ts`
- Modify: `src/engine/layout/dagreLayout.ts`
- Modify: `src/engine/layout/layoutDispatcher.ts`

- [ ] **Step 1: Write node-dimension characterization tests**
  - A short title receives the current minimum width.
  - A long title increases width.
  - Description content increases required height.
  - Badges, tools, model information, context, and metadata affect dimensions.
  - Every returned width and height is positive and finite.
  - `measureGraphNodes` returns a record keyed by every node ID.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/nodeDimensions.test.ts
```

Expected: FAIL because the shared module does not exist.

- [ ] **Step 3: Move the current calculation without changing behavior**
  - Move `calculateNodeDimensions` from `dagreLayout.ts` into `nodeDimensions.ts`.
  - Rename its public export to `measureNodeForLayout`.
  - Add `measureGraphNodes(nodes)` returning `NodeSizeMap`.
  - Do not redesign node sizing in this task.

- [ ] **Step 4: Update existing imports**
  - `dagreLayout.ts` imports `measureNodeForLayout`.
  - `layoutDispatcher.ts` imports `measureNodeForLayout`.
  - Preserve Dagre output during migration.

- [ ] **Step 5: Run focused and existing layout tests**

```bash
bun test src/engine/layout/nodeDimensions.test.ts
bun test src/engine/layout/dagreLayout.test.ts
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/layout/nodeDimensions.ts src/engine/layout/nodeDimensions.test.ts src/engine/layout/dagreLayout.ts src/engine/layout/layoutDispatcher.ts
git commit -m "refactor: centralize graph node dimensions"
```

---

### Task 2: Implement the Geometry Kernel

**Files:**

- Create: `src/engine/layout/custom/geometry.ts`
- Create: `src/engine/layout/custom/geometry.test.ts`

- [ ] **Step 1: Write tests for point and rectangle operations**
  - Finite-point validation.
  - Rectangle expansion.
  - Strict rectangle overlap.
  - Boundary touching without strict overlap.
  - Point inside, outside, and on boundary.

- [ ] **Step 2: Write tests for orthogonal segment operations**
  - Reject diagonal segments.
  - Segment length.
  - Horizontal and vertical intersection.
  - Positive-length collinear overlap.
  - Endpoint-only contact.
  - Segment versus rectangle interior.

- [ ] **Step 3: Write tests for path operations**
  - Remove duplicate points.
  - Remove collinear middle points.
  - Preserve a real bend.
  - Calculate total Manhattan length.
  - Locate a point at a requested path-distance ratio.

- [ ] **Step 4: Run the focused test**

```bash
bun test src/engine/layout/custom/geometry.test.ts
```

Expected: FAIL because `geometry.ts` does not exist.

- [ ] **Step 5: Implement pure geometry functions**

Export exact functions:

```ts
isFinitePoint;
expandRect;
rectsOverlapStrict;
pointInRectInterior;
pointOnRectBoundary;
isOrthogonalSegment;
segmentLength;
segmentsCross;
collinearOverlapLength;
segmentIntersectsRectInterior;
simplifyOrthogonalPath;
pathManhattanLength;
pointAtPathRatio;
canonicalSegmentKey;
```

Use `config.epsilon` or an explicit epsilon argument. Do not round geometry during calculation.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/geometry.test.ts
bun run typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/geometry.ts src/engine/layout/custom/geometry.test.ts
git commit -m "feat: add orthogonal geometry kernel"
```

---

### Task 3: Normalize and Validate Graph Input

**Files:**

- Create: `src/engine/layout/custom/normalizeGraph.ts`
- Create: `src/engine/layout/custom/normalizeGraph.test.ts`

- [ ] **Step 1: Write invalid-input tests**
  - Duplicate node ID is an error.
  - Duplicate edge ID is an error.
  - Missing source is an error.
  - Missing target is an error.
  - Empty node ID is an error.
  - Non-positive measured node width or height is an error.

- [ ] **Step 2: Write deterministic-output tests**
  - Shuffling input nodes does not change normalized node order.
  - Shuffling input edges does not change normalized edge order.
  - Incoming and outgoing adjacency lists are ID-sorted.
  - Weakly connected components are deterministic.

- [ ] **Step 3: Run the focused test**

```bash
bun test src/engine/layout/custom/normalizeGraph.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `normalizeGraph`**
  - Clone the input.
  - Sort nodes and edges by ID.
  - Build `nodeById`, `edgeById`, `incomingByNode`, `outgoingByNode`, and undirected adjacency.
  - Return structured diagnostics.
  - Throw `LayoutInputError` when an error diagnostic exists.
  - Never substitute the first node for a missing endpoint.

- [ ] **Step 5: Implement weak-component discovery**
  - Traverse undirected adjacency.
  - Sort nodes inside each component.
  - Sort components by their smallest node ID.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/normalizeGraph.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/normalizeGraph.ts src/engine/layout/custom/normalizeGraph.test.ts
git commit -m "feat: normalize graph layout input"
```

---

### Task 4: Detect Strongly Connected Components

**Files:**

- Create: `src/engine/layout/custom/stronglyConnectedComponents.ts`
- Create: `src/engine/layout/custom/stronglyConnectedComponents.test.ts`

- [ ] **Step 1: Write SCC tests**
  - A chain produces one SCC per node.
  - A reciprocal pair produces one two-node SCC.
  - A three-node cycle produces one SCC.
  - A self-loop marks a single-node cyclic SCC.
  - Two disconnected cycles produce two deterministic SCCs.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/stronglyConnectedComponents.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement deterministic Tarjan analysis**
  - Visit nodes in ID order.
  - Visit outgoing edges in edge-ID order.
  - Sort node IDs inside each completed SCC.
  - Assign stable SCC IDs from sorted member IDs.

- [ ] **Step 4: Return both directions**
  - `componentByNodeId`.
  - `components`.
  - `cyclicComponentIds`.
  - Condensation adjacency between SCCs.

- [ ] **Step 5: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/stronglyConnectedComponents.test.ts
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/layout/custom/stronglyConnectedComponents.ts src/engine/layout/custom/stronglyConnectedComponents.test.ts
git commit -m "feat: detect strongly connected graph regions"
```

---

### Task 5: Break Cycles and Classify Edge Roles

**Files:**

- Create: `src/engine/layout/custom/cycleBreaking.ts`
- Create: `src/engine/layout/custom/cycleBreaking.test.ts`

- [ ] **Step 1: Write edge-role tests**
  - Self-loop becomes `self`.
  - `directed: false` becomes `cross`.
  - Explicit `isCycle: true` becomes `feedback`.
  - A chain edge becomes `forward`.
  - Exactly one edge in a reciprocal pair becomes `feedback`.
  - Removing feedback and self edges leaves a DAG.
  - Classification is unchanged when input arrays are shuffled.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/cycleBreaking.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement deterministic Eades-style ordering inside each cyclic SCC**
  - Repeatedly remove sinks into a right list.
  - Repeatedly remove sources into a left list.
  - If neither exists, remove the node maximizing `outDegree - inDegree`.
  - Break equal scores by node ID.
  - Concatenate left list, remaining selection order, and reversed right list.

- [ ] **Step 4: Classify edges**
  - Self source/target: `self`.
  - Undirected: `cross`.
  - Explicit `isCycle: true`: `feedback`.
  - Directed edge following the chosen SCC order: `forward`.
  - Directed edge opposing the order: `feedback`.
  - Directed edge between SCCs: `forward`.

- [ ] **Step 5: Verify the non-feedback graph with Kahn's algorithm**
  - Throw an internal diagnostic if a cycle remains.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/cycleBreaking.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/cycleBreaking.ts src/engine/layout/custom/cycleBreaking.test.ts
git commit -m "feat: classify forward and feedback edges"
```

---

## Phase B — Layered Node Placement

### Task 6: Assign Top-to-Bottom Ranks

**Files:**

- Create: `src/engine/layout/custom/rankAssignment.ts`
- Create: `src/engine/layout/custom/rankAssignment.test.ts`

- [ ] **Step 1: Write rank tests**
  - All roots start at rank zero.
  - Every forward target rank is at least source rank plus one.
  - A diamond puts both middle nodes on the same rank.
  - Feedback, self, and cross edges do not force a new rank.
  - Disconnected components each start at rank zero.
  - Results are deterministic.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/rankAssignment.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement deterministic topological ordering**
  - Use only forward edges.
  - Keep the zero-indegree queue sorted by node ID.
  - Return an internal error if not every node is visited.

- [ ] **Step 4: Implement longest-path rank assignment**

For each node in topological order:

```text
rank(node) = max(rank(predecessor) + 1)
rank(root) = 0
```

Do not let feedback, self, or cross edges affect the rank.

- [ ] **Step 5: Return rank metadata**
  - Rank per node.
  - Nodes per rank.
  - Maximum rank.
  - Edge rank span.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/rankAssignment.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/rankAssignment.ts src/engine/layout/custom/rankAssignment.test.ts
git commit -m "feat: assign deterministic graph ranks"
```

---

### Task 7: Insert Virtual Nodes for Long Forward Edges

**Files:**

- Create: `src/engine/layout/custom/layerGraph.ts`
- Create: `src/engine/layout/custom/layerGraph.test.ts`

- [ ] **Step 1: Write virtual-node tests**
  - Rank-span one creates no virtual node.
  - Rank-span three creates two virtual nodes.
  - Virtual IDs include the edge ID and rank.
  - Every expanded segment connects adjacent ranks.
  - Removing virtual nodes restores the original edge identity.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/layerGraph.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Define `LayerItem`**
  - Real item: node ID, rank, width, height.
  - Virtual item: stable ID, original edge ID, rank, width zero, height zero.

- [ ] **Step 4: Build expanded forward-edge chains**
  - Insert one virtual item at every intermediate rank.
  - Store predecessor and successor adjacency for crossing minimization.
  - Exclude feedback, cross, and self edges.

- [ ] **Step 5: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/layerGraph.test.ts
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/layout/custom/layerGraph.ts src/engine/layout/custom/layerGraph.test.ts
git commit -m "feat: expand long edges across graph layers"
```

---

### Task 8: Minimize Crossings Between Ranks

**Files:**

- Create: `src/engine/layout/custom/crossingMinimization.ts`
- Create: `src/engine/layout/custom/crossingMinimization.test.ts`

- [ ] **Step 1: Write crossing-count tests**
  - Two parallel edges have zero crossings.
  - An inverted pair has one crossing.
  - Three inverted endpoints produce the expected inversion count.

- [ ] **Step 2: Write ordering tests**
  - A barycenter sweep fixes a simple inverted pair.
  - A downward sweep uses predecessors.
  - An upward sweep uses successors.
  - Adjacent transposition never increases crossings.
  - Ties preserve stable item IDs.

- [ ] **Step 3: Run the focused test**

```bash
bun test src/engine/layout/custom/crossingMinimization.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement inversion-based crossing count**
  - Count only expanded forward-edge segments between adjacent ranks.
  - Ignore edges sharing the same endpoint item.

- [ ] **Step 5: Implement alternating barycenter sweeps**
  - Downward pass from rank one to last rank.
  - Upward pass from penultimate rank to rank zero.
  - Missing neighbors keep the existing position.
  - Equal barycenters use previous order, then stable ID.

- [ ] **Step 6: Implement adjacent transposition**
  - Try swapping adjacent items.
  - Keep the swap only if total adjacent-rank crossings decrease.
  - Stop after a full pass without improvement or `maxCrossingSweeps`.
  - Preserve the best order seen.

- [ ] **Step 7: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/crossingMinimization.test.ts
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/engine/layout/custom/crossingMinimization.ts src/engine/layout/custom/crossingMinimization.test.ts
git commit -m "feat: minimize layered graph crossings"
```

---

### Task 9: Assign Collision-Free Node Coordinates

**Files:**

- Create: `src/engine/layout/custom/coordinateAssignment.ts`
- Create: `src/engine/layout/custom/coordinateAssignment.test.ts`

- [ ] **Step 1: Write vertical placement tests**
  - Every rank begins below the tallest previous rank plus `rankGap`.
  - Variable node heights do not overlap adjacent ranks.
  - Graph padding is respected.

- [ ] **Step 2: Write horizontal placement tests**
  - Nodes in one rank preserve the minimized order.
  - Adjacent rectangles have at least `nodeGap`.
  - A centered parent aligns near the median of its children when space allows.
  - Alignment never creates overlap.

- [ ] **Step 3: Write component-packing tests**
  - Weak components never overlap.
  - Component gap is respected.
  - Component order is deterministic.
  - Packing does not alter component-internal coordinates.

- [ ] **Step 4: Run the focused test**

```bash
bun test src/engine/layout/custom/coordinateAssignment.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement rank Y coordinates**
  - Compute maximum real-node height per rank.
  - Center shorter nodes vertically inside the rank band.
  - Place virtual nodes at the band center.

- [ ] **Step 6: Implement initial X coordinates**
  - Place each rank left to right using actual widths and `nodeGap`.
  - Treat virtual items as zero-width alignment points.

- [ ] **Step 7: Implement horizontal alignment sweeps**
  - Desired center is the median connected-neighbor center.
  - Move toward the desired center.
  - Scan left-to-right to enforce gaps.
  - Scan right-to-left to reduce unnecessary drift.
  - Keep the rank order fixed.
  - Stop when coordinates do not change beyond epsilon.

- [ ] **Step 8: Implement deterministic component packing**
  - Layout each weak component independently.
  - Calculate each component bounding box.
  - Use shelf packing with target width `sqrt(totalComponentArea) * 1.6`.
  - Keep at least `componentGap` between boxes.
  - Normalize the final graph to `graphPadding`.

- [ ] **Step 9: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/coordinateAssignment.test.ts
bun run typecheck
```

- [ ] **Step 10: Commit**

```bash
git add src/engine/layout/custom/coordinateAssignment.ts src/engine/layout/custom/coordinateAssignment.test.ts
git commit -m "feat: assign collision-free node coordinates"
```

---

### Task 10: Orchestrate the Node Layout Pipeline

**Files:**

- Create: `src/engine/layout/custom/nodeLayout.ts`
- Create: `src/engine/layout/custom/nodeLayout.test.ts`

- [ ] **Step 1: Write pipeline tests**
  - Chain is top to bottom.
  - Diamond is layered and symmetric enough for the parent to sit between children.
  - Reciprocal pair remains top to bottom with one feedback edge.
  - Variable-size nodes never overlap.
  - Disconnected graphs are packed.
  - Running twice returns deeply equal results.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/nodeLayout.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `computeNodeLayout`**

Call modules in this exact order:

```text
normalizeGraph
stronglyConnectedComponents
classifyEdgeRoles
assignRanks
buildLayerGraph
minimizeCrossings
assignCoordinates
packComponents
```

- [ ] **Step 4: Return all debug stages**
  - SCC membership.
  - Edge roles.
  - Rank membership.
  - Initial and final rank order.
  - Virtual node positions.
  - Component bounds.

- [ ] **Step 5: Run all Phase A and B tests**

```bash
bun test src/engine/layout/custom
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/layout/custom/nodeLayout.ts src/engine/layout/custom/nodeLayout.test.ts
git commit -m "feat: orchestrate custom layered node layout"
```

---

## Phase C — Ports and Orthogonal Routing

### Task 11: Generate Four-Side Port Candidates

**Files:**

- Create: `src/engine/layout/custom/portCandidates.ts`
- Create: `src/engine/layout/custom/portCandidates.test.ts`

- [ ] **Step 1: Write side geometry tests**
  - Center point for top, right, bottom, and left.
  - Stub extends outward perpendicular to the side.
  - Stub never lies inside its node.
  - Sixteen side pairs are generated for a normal edge.

- [ ] **Step 2: Write role-preference tests**
  - Forward edge prefers bottom-to-top when unobstructed.
  - Same-rank cross edge prefers the facing horizontal sides.
  - Feedback edge prefers left-left or right-right.
  - A blocked preferred pair can lose to an unblocked alternative.

- [ ] **Step 3: Run the focused test**

```bash
bun test src/engine/layout/custom/portCandidates.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement candidate generation**
  - Generate every source/target side pair except self edges.
  - Use center ports for the initial estimate.
  - Estimate Manhattan length between stubs.
  - Count expanded-node obstacles intersected by a two-bend estimate.

- [ ] **Step 5: Implement candidate base cost**

Add:

```text
estimated length
bend estimate
obstacle-intersection penalty
role-specific direction penalty
wrong-facing stub penalty
```

Do not add side-reuse cost yet.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/portCandidates.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/portCandidates.ts src/engine/layout/custom/portCandidates.test.ts
git commit -m "feat: generate graph port candidates"
```

---

### Task 12: Assign Port Sides Globally

**Files:**

- Create: `src/engine/layout/custom/portAssignment.ts`
- Create: `src/engine/layout/custom/portAssignment.test.ts`

- [ ] **Step 1: Write assignment tests**
  - A single forward edge selects its lowest-cost pair.
  - A three-edge fan-out may reuse bottom when that remains clearer than forcing top.
  - Nearby equal-cost edges spread across unused sides.
  - Incoming and outgoing edges contribute to the same side-use count.
  - Same-rank reciprocal edges use distinct side combinations.
  - Results are deterministic.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/portAssignment.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement regret-ordered initial assignment**
  - For each edge, sort candidates by base cost and stable side-pair key.
  - Regret is second-best cost minus best cost.
  - Assign edges by descending regret, then edge ID.
  - Add `sideReusePenalty * currentSideUse²` at both endpoints.

- [ ] **Step 4: Implement deterministic local improvement**
  - Visit edges in ID order.
  - Temporarily remove the current assignment's side counts.
  - Evaluate every alternative with current global counts.
  - Keep only a strict cost improvement.
  - Hash the assignment vector after each pass.
  - Stop on no improvement, repeated hash, or `maxPortImprovementPasses`.
  - Preserve the lowest-cost assignment seen.

- [ ] **Step 5: Return assignment diagnostics**
  - Selected candidate rank.
  - Base cost.
  - Reuse cost.
  - Direction penalty.
  - Reason string for debug UI.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/portAssignment.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/portAssignment.ts src/engine/layout/custom/portAssignment.test.ts
git commit -m "feat: optimize graph port side assignment"
```

---

### Task 13: Distribute Ports Along Node Sides

**Files:**

- Create: `src/engine/layout/custom/portDistribution.ts`
- Create: `src/engine/layout/custom/portDistribution.test.ts`

- [ ] **Step 1: Write equal-spacing tests**
  - One attachment uses alpha `0.5`.
  - Two attachments use alpha `1/3` and `2/3`.
  - Three attachments use alpha `1/4`, `2/4`, and `3/4`.
  - Incoming and outgoing attachments are distributed together.

- [ ] **Step 2: Write ordering tests**
  - Top/bottom ports sort by the other endpoint's X center.
  - Left/right ports sort by the other endpoint's Y center.
  - Equal remote coordinates break ties by edge ID and endpoint role.
  - Reciprocal edges receive distinct points.

- [ ] **Step 3: Run the focused test**

```bash
bun test src/engine/layout/custom/portDistribution.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement distribution**

For side length `L`, endpoint padding `p`, attachment count `m`, and one-based index `i`:

```text
usable = max(0, L - 2p)
offset = p + usable * i / (m + 1)
```

If `m = 1`, explicitly use the exact side center.

- [ ] **Step 5: Calculate ports and stubs**
  - Create unique `PortRef` values for both endpoints.
  - Use configured stub length.
  - Verify finite coordinates.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/portDistribution.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/portDistribution.ts src/engine/layout/custom/portDistribution.test.ts
git commit -m "feat: distribute graph ports with equal spacing"
```

---

### Task 14: Build the Sparse Rectilinear Routing Grid

**Files:**

- Create: `src/engine/layout/custom/routingGrid.ts`
- Create: `src/engine/layout/custom/routingGrid.test.ts`

- [ ] **Step 1: Write obstacle tests**
  - Every node becomes an expanded rectangle.
  - A port-to-stub segment is allowed for its own node.
  - Grid vertices inside an obstacle are removed.
  - Grid edges crossing an obstacle interior are removed.
  - Boundary-touching behavior uses epsilon consistently.

- [ ] **Step 2: Write coordinate tests**
  - Port and stub X/Y values are included.
  - Expanded obstacle sides are included.
  - Mid-gap coordinates between separated obstacles are included.
  - Outer graph corridors are included.
  - Lane offsets are included up to the requested ring.
  - Coordinates are sorted and epsilon-deduplicated.

- [ ] **Step 3: Run the focused test**

```bash
bun test src/engine/layout/custom/routingGrid.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Build candidate coordinates**
  - Collect X and Y coordinates from ports, stubs, expanded obstacle sides, gap midpoints, and graph bounds.
  - Around corridor coordinates, add `±laneSpacing * ring`.
  - Do not add coordinates inside an obstacle unless they are an authorized endpoint boundary.

- [ ] **Step 5: Build sparse visibility edges**
  - Create valid intersections of candidate X and Y coordinates.
  - For each row, connect consecutive visible vertices.
  - For each column, connect consecutive visible vertices.
  - Reject any edge entering an obstacle interior.
  - Store canonical grid-edge IDs.

- [ ] **Step 6: Return debug data**
  - Obstacles.
  - X/Y coordinates.
  - Vertices.
  - Visibility edges.
  - Removed edge reasons.

- [ ] **Step 7: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/routingGrid.test.ts
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/engine/layout/custom/routingGrid.ts src/engine/layout/custom/routingGrid.test.ts
git commit -m "feat: build obstacle-aware routing grid"
```

---

### Task 15: Implement Direction-Aware A* Route Search

**Files:**

- Create: `src/engine/layout/custom/routeSearch.ts`
- Create: `src/engine/layout/custom/routeSearch.test.ts`

- [ ] **Step 1: Write search tests**
  - Direct visible ports produce the shortest orthogonal route.
  - A central rectangle is routed around.
  - Fewer bends win when lengths are equal.
  - An occupied grid edge is never reused.
  - A high crossing penalty selects a non-crossing detour.
  - No route returns a structured failure, not an empty path.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/routeSearch.test.ts
```

Expected: FAIL.

- [ ] _*Step 3: Define A* state_*

State identity must include:

```text
grid vertex ID
incoming segment direction
```

This is required because bend cost depends on the previous direction.

- [ ] **Step 4: Implement deterministic priority ordering**
  - Lowest `f = g + h`.
  - Then lowest `h`.
  - Then fewest bends.
  - Then state key.

- [ ] **Step 5: Implement route cost**
  - Segment Manhattan length.
  - Bend penalty when direction changes.
  - Infinite cost for occupied collinear grid edges.
  - Crossing penalty for perpendicular intersections with occupied segments.
  - Near-obstacle penalty for narrow channels.
  - Direction penalty for an immediately undesirable departure or arrival.

- [ ] **Step 6: Use Manhattan heuristic**
  - Do not include penalties in the heuristic.
  - Keep the heuristic admissible.

- [ ] **Step 7: Reconstruct and simplify the path**
  - Include exact source port, source stub, searched vertices, target stub, and target port.
  - Remove duplicates and collinear middle points.
  - Reject any diagonal result.

- [ ] **Step 8: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/routeSearch.test.ts
bun run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add src/engine/layout/custom/routeSearch.ts src/engine/layout/custom/routeSearch.test.ts
git commit -m "feat: add orthogonal edge route search"
```

---

### Task 16: Route Self-Loops and Feedback Corridors

**Files:**

- Create: `src/engine/layout/custom/specialRoutes.ts`
- Create: `src/engine/layout/custom/specialRoutes.test.ts`

- [ ] **Step 1: Write self-loop tests**
  - A self-loop uses two distinct ports.
  - The loop stays outside its node rectangle.
  - Multiple loops on one node use different loop distances.
  - Loop selection is deterministic.

- [ ] **Step 2: Write feedback-corridor tests**
  - Reciprocal forward/feedback edges do not share a segment.
  - Overlapping feedback vertical spans use different lanes.
  - Non-overlapping spans may reuse a lane.
  - Left/right corridor choice minimizes added distance, then occupancy.

- [ ] **Step 3: Run the focused test**

```bash
bun test src/engine/layout/custom/specialRoutes.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement self-loop routing**
  - Score top-right, bottom-right, bottom-left, and top-left loop quadrants.
  - Penalize nearby nodes, assigned ports, existing lanes, and badges.
  - Use a rectangular loop outside the expanded node.
  - Increase loop distance by `laneSpacing` for each additional loop.

- [ ] **Step 5: Implement feedback interval coloring**
  - Represent every feedback edge by its vertical rank span.
  - Sort by span start, span end, then edge ID.
  - Assign the smallest lane whose occupied interval does not overlap.
  - Evaluate both left and right outer corridors.
  - Pick lower total length, then fewer lanes, then left.

- [ ] **Step 6: Build local feedback routes**
  - For feedback edges within nearby ranks, test node-local left and right corridors before graph-outer corridors.
  - Use the global route search if neither local corridor is clear.

- [ ] **Step 7: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/specialRoutes.test.ts
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/engine/layout/custom/specialRoutes.ts src/engine/layout/custom/specialRoutes.test.ts
git commit -m "feat: route graph loops and feedback corridors"
```

---

### Task 17: Route All Edges with Lane Reservation

**Files:**

- Create: `src/engine/layout/custom/edgeRouter.ts`
- Create: `src/engine/layout/custom/edgeRouter.test.ts`

- [ ] **Step 1: Write route-order tests**
  - Self-loops use the special router.
  - Feedback edges reserve corridors before normal edges.
  - Remaining edges sort by descending rank span, candidate regret, then edge ID.

- [ ] **Step 2: Write occupancy tests**
  - Split every committed segment at global grid coordinates and existing segment endpoints.
  - Committing a path occupies every resulting atomic grid edge.
  - Removing a path releases only that edge's occupancy.
  - Collinear overlap is forbidden.
  - Endpoint contact is allowed.
  - Perpendicular crossing remains possible with a penalty.

- [ ] **Step 3: Write lane-expansion tests**
  - If the initial grid cannot route without sharing, add another lane ring.
  - Preserve already valid routes when they do not participate in the failure.
  - Stop at `maxLaneRings` with a structured unresolved diagnostic.

- [ ] **Step 4: Run the focused test**

```bash
bun test src/engine/layout/custom/edgeRouter.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement global routing**
  - Create occupancy from an empty map.
  - Route edges in deterministic difficulty order.
  - Normalize special and searched paths into the same atomic occupancy representation.
  - Commit each successful route.
  - Rebuild the grid with one more lane ring only when required.
  - Preserve the best partial result for diagnostics.

- [ ] **Step 6: Implement conflict-set rip-up**
  - Build a conflict graph from shared-segment or unresolved-route diagnostics.
  - Remove only involved edges from occupancy.
  - Increase congestion cost for their previous failed channels.
  - Reroute hardest edge first.
  - Stop on zero routing failures, no score improvement, repeated layout hash, or `maxRipUpPasses`.

- [ ] **Step 7: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/edgeRouter.test.ts
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/engine/layout/custom/edgeRouter.ts src/engine/layout/custom/edgeRouter.test.ts
git commit -m "feat: reserve distinct graph edge lanes"
```

---

## Phase D — Badges, Validation, and Global Optimization

### Task 18: Centralize Badge Measurement

**Files:**

- Create: `src/engine/layout/custom/badgeMeasurement.ts`
- Create: `src/engine/layout/custom/badgeMeasurement.test.ts`
- Modify: `src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx`

- [ ] **Step 1: Write badge-size tests**
  - Empty non-cycle label returns no badge.
  - Cycle-only badge returns a badge.
  - Minimum width is 60.
  - Width grows deterministically from display text.
  - Height is 28.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/badgeMeasurement.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `measureEdgeBadge`**
  - Centralize display text, width, and height.
  - Keep current visual sizing in one function.
  - Return `null` when no badge should render.

- [ ] **Step 4: Update `EdgeBadgeOverlay`**
  - Import `measureEdgeBadge`.
  - Remove its duplicated width and height formula.
  - Keep visual output unchanged.

- [ ] **Step 5: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/badgeMeasurement.test.ts
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/layout/custom/badgeMeasurement.ts src/engine/layout/custom/badgeMeasurement.test.ts src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx
git commit -m "refactor: centralize edge badge measurement"
```

---

### Task 19: Generate and Select Badge Candidates

**Files:**

- Create: `src/engine/layout/custom/badgePlacement.ts`
- Create: `src/engine/layout/custom/badgePlacement.test.ts`

- [ ] **Step 1: Write candidate tests**
  - Exact 50% arc-length point is the first preference.
  - Ratios 0.35 and 0.65 are generated next.
  - Long segment centers become candidates.
  - Normal-offset candidates retain an anchor on the owning route.
  - Candidates overlapping a node are rejected.

- [ ] **Step 2: Write global placement tests**
  - Two labels with the same midpoint choose different candidates.
  - Labels do not overlap nodes.
  - Labels do not overlap unrelated edge segments.
  - Long labels are placed before flexible short labels.
  - Results are deterministic.

- [ ] **Step 3: Run the focused test**

```bash
bun test src/engine/layout/custom/badgePlacement.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Generate candidates**
  - Candidate ratios: `0.5`, `0.35`, `0.65`, `0.2`, `0.8`.
  - Add every segment midpoint.
  - For blocked on-path candidates, add both normal offsets by `badgeClearance + badgeHeight / 2`.
  - Store `anchorPoint` separately from badge center.
  - Prefer horizontal segments, then fewer leader pixels.

- [ ] **Step 5: Score candidates**

Score:

```text
distance from 50% path location
distance from owning path
leader length
proximity to bends
proximity to source or target node
outer graph expansion required
```

Node, badge, and unrelated-edge overlap are hard rejections.

- [ ] **Step 6: Select candidates globally**
  - Sort badges by fewest valid candidates.
  - Then sort by descending badge area.
  - Then edge ID.
  - Choose the lowest-score non-conflicting candidate.
  - If no candidate works, remove placements for directly conflicting badges and retry that local set.
  - Stop on a repeated placement hash or when every candidate combination in the local set has been tested.

- [ ] **Step 7: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/badgePlacement.test.ts
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/engine/layout/custom/badgePlacement.ts src/engine/layout/custom/badgePlacement.test.ts
git commit -m "feat: place collision-free edge badges"
```

---

### Task 20: Implement the Layout Validator and Metrics

**Files:**

- Create: `src/engine/layout/custom/layoutValidator.ts`
- Create: `src/engine/layout/custom/layoutValidator.test.ts`

- [ ] **Step 1: Write one failing fixture per hard invariant**
  - Overlapping nodes.
  - Endpoint off boundary.
  - Wrong endpoint departure direction.
  - Edge through unrelated node.
  - Shared collinear edge segment.
  - Badge over node.
  - Badge over badge.
  - Badge over unrelated edge.
  - Zero-length arrow segment.
  - Non-finite coordinate.

- [ ] **Step 2: Write soft-metric tests**
  - Crossing count.
  - Bend count.
  - Total route length.
  - Port-side reuse.
  - Graph bounding area.

- [ ] **Step 3: Run the focused test**

```bash
bun test src/engine/layout/custom/layoutValidator.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement validation**
  - Return every violation, not only the first.
  - Include involved node, edge, and badge IDs.
  - Include exact segment or rectangle geometry.
  - Separate `errors` and `warnings`.

- [ ] **Step 5: Implement lexicographic score**
  - Follow the exact Score Ordering section.
  - Export `compareLayoutScores(a, b)`.
  - Never hide a hard error with a shorter route.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/layoutValidator.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/layoutValidator.ts src/engine/layout/custom/layoutValidator.test.ts
git commit -m "feat: validate graph layout invariants"
```

---

### Task 21: Add Badge-Aware Global Optimization

**Files:**

- Create: `src/engine/layout/custom/optimizeLayout.ts`
- Create: `src/engine/layout/custom/optimizeLayout.test.ts`

- [ ] **Step 1: Write convergence tests**
  - A badge-edge collision causes only involved edges to reroute.
  - A badge-badge conflict triggers local badge replacement first.
  - Failed local replacement adds badge rectangles as routing obstacles.
  - Best valid result is preserved if a later pass is worse.
  - Repeated state terminates.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/optimizeLayout.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement one global pass**

Perform:

```text
validate routes
place badges
validate complete layout
build conflict set
try local badge replacement
try the next port-side candidate for unresolved route conflicts
redistribute ports on affected nodes
reroute only edges conflicting with fixed badge obstacles
validate again
```

- [ ] **Step 4: Implement bounded convergence**
  - Hash node coordinates, port assignments, routes, and badge placements.
  - Stop at zero hard violations.
  - Stop on repeated state.
  - Stop after `maxGlobalPasses`.
  - Preserve the lexicographically best result.
  - Return an unresolved error result if hard violations remain.

- [ ] **Step 5: Add space-expansion fallback**
  - Increase graph outer padding by `laneSpacing * 2`.
  - Increase relevant rank or node gap only around the conflicting band.
  - Re-run the affected downstream stages.
  - Do not globally scale node cards.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/optimizeLayout.ts src/engine/layout/custom/optimizeLayout.test.ts
git commit -m "feat: optimize badge-aware graph routes"
```

---

### Task 22: Serialize SVG Paths and Crossing Bridges

**Files:**

- Create: `src/engine/layout/custom/svgPath.ts`
- Create: `src/engine/layout/custom/svgPath.test.ts`

- [ ] **Step 1: Write plain-path tests**
  - One move command.
  - Orthogonal line commands.
  - No duplicate commands.
  - Stable numeric formatting.

- [ ] **Step 2: Write crossing-bridge tests**
  - Crossing records are sorted by distance along the path.
  - Exactly one of two crossing edges receives a bridge.
  - Feedback edge loses bridge priority to a selected or primary forward edge.
  - Bridge arc does not change edge endpoints.
  - Multiple close crossings merge or keep minimum separation.

- [ ] **Step 3: Run the focused test**

```bash
bun test src/engine/layout/custom/svgPath.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement deterministic crossing priority**
  - Selected-state rendering is not available during layout; use role first.
  - Forward edge stays straight over feedback edge.
  - Lower edge ID stays straight for equal roles.
  - Record which edge receives the bridge.

- [ ] **Step 5: Serialize paths**
  - Use `M` and `L` for normal segments.
  - Insert a small SVG arc only at an assigned bridge point.
  - Keep arrowhead final segment unchanged.
  - Round only serialized output to at most three decimals.

- [ ] **Step 6: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/svgPath.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/svgPath.ts src/engine/layout/custom/svgPath.test.ts
git commit -m "feat: serialize routed edges with crossing bridges"
```

---

### Task 23: Expose the Complete Synchronous Engine

**Files:**

- Create: `src/engine/layout/custom/computeCustomLayout.ts`
- Create: `src/engine/layout/custom/computeCustomLayout.test.ts`
- Create: `src/engine/layout/custom/index.ts`

- [ ] **Step 1: Write end-to-end engine tests**
  - Empty graph returns empty valid output.
  - Single node returns one positioned node.
  - Directed chain is valid.
  - Fan-out is valid.
  - Reciprocal cycle is valid.
  - Obstacle scenario is valid.
  - Repeated run is deeply equal.

- [ ] **Step 2: Run the focused test**

```bash
bun test src/engine/layout/custom/computeCustomLayout.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `computeCustomLayout`**

Use this exact entry-point signature:

```ts
function computeCustomLayout(
  dataset: GraphDataset,
  nodeDimensions: NodeSizeMap,
  config?: Partial<CustomLayoutConfig>,
): CustomLayoutResult;
```

Require one valid size entry for every node. A missing, non-positive, or non-finite size is an `invalid-input` diagnostic.

Call stages in this exact order:

```text
resolve config
normalize input
compute node layout
generate port candidates
assign port sides
distribute exact ports
route all edges
place badges
optimize conflicts
validate
serialize paths
return result and debug data
```

- [ ] **Step 4: Enforce successful-result validity**
  - `status: "success"` requires zero hard errors.
  - `status: "unresolved"` returns best geometry plus diagnostics.
  - `status: "invalid-input"` returns input diagnostics without geometry.
  - Never label an unresolved result successful.
  - At this task, `nodes` and `edges` are internal immutable result records; Task 29 adapts them to `PositionedNode[]` and `PositionedEdge[]`.

- [ ] **Step 5: Export only the supported surface**

From `index.ts`, export:

```ts
computeCustomLayout;
DEFAULT_CUSTOM_LAYOUT_CONFIG;
resolveCustomLayoutConfig;
CustomLayoutConfig;
CustomLayoutResult;
LayoutDiagnostic;
LayoutMetrics;
```

- [ ] **Step 6: Run all engine tests**

```bash
bun test src/engine/layout/custom
bun run typecheck
bun run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout/custom/computeCustomLayout.ts src/engine/layout/custom/computeCustomLayout.test.ts src/engine/layout/custom/index.ts
git commit -m "feat: expose custom graph layout engine"
```

---

## Phase E — Adversarial Scenarios and Visual Laboratory

### Task 24: Add Comprehensive Scenario Fixtures

**Files:**

- Create: `src/features/GraphTesting/data/customLayoutScenarios.ts`
- Create: `src/features/GraphTesting/data/customLayoutScenarios.test.ts`

- [ ] **Step 1: Define these named scenarios**

```text
empty
single-node
two-node-forward
three-node-chain
fan-out-8
fan-in-8
diamond
same-rank-cross-link
reciprocal-pair
self-loop-stack
three-node-cycle
multiple-sccs
long-feedback-edge
parallel-multi-edge
central-obstacle
dense-badges
variable-node-sizes
disconnected-components
cyclic-agent-trace
devops-orchestration-mesh
```

- [ ] **Step 2: Give every scenario an explicit purpose**
  - Add a short expected-behavior string.
  - Add expected minimum counts for feedback edges, crossings, or components where applicable.

- [ ] **Step 3: Add fixture integrity tests**
  - Unique scenario IDs.
  - Unique node and edge IDs inside each scenario.
  - Valid endpoints.
  - At least one scenario for every hard invariant.

- [ ] **Step 4: Run fixture tests**

```bash
bun test src/features/GraphTesting/data/customLayoutScenarios.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/GraphTesting/data/customLayoutScenarios.ts src/features/GraphTesting/data/customLayoutScenarios.test.ts
git commit -m "test: add adversarial graph layout scenarios"
```

---

### Task 25: Add Deterministic Generated-Graph Tests

**Files:**

- Create: `src/engine/layout/custom/generatedGraph.test.ts`

- [ ] **Step 1: Implement a test-only seeded generator**
  - Use a small linear congruential generator.
  - Seed is an integer stored in the test name.
  - Generate node dimensions, directed edges, optional reciprocal edges, and labels.
  - Never use `Math.random()`.

- [ ] **Step 2: Test multiple topology families**
  - Sparse DAG.
  - Dense DAG.
  - DAG plus feedback edges.
  - Several SCCs.
  - Disconnected directed components.
  - High-degree hub.

- [ ] **Step 3: Assert hard invariants**
  - For every successful result, validator error count is zero.
  - Re-running the same seed is deeply equal.
  - Unresolved results include at least one error diagnostic and never claim success.

- [ ] **Step 4: Record reproducible failures**
  - When a seed fails, print only seed, node count, edge count, and diagnostics.
  - Add any failing seed as a permanent explicit test before fixing it.

- [ ] **Step 5: Run generated tests**

```bash
bun test src/engine/layout/custom/generatedGraph.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/layout/custom/generatedGraph.test.ts
git commit -m "test: validate generated custom graph layouts"
```

---

### Task 26: Replace the Graph Testing Comparison UI

**Files:**

- Modify: `src/features/GraphTesting/components/GraphTestingPage.tsx`
- Create: `src/features/GraphTesting/components/CustomLayoutDebugOverlay.tsx`
- Create: `src/features/GraphTesting/components/CustomLayoutMetrics.tsx`
- Modify: `src/features/GraphTesting/GraphTesting.css`

- [ ] **Step 1: Remove trial-algorithm imports and labels**
  - Remove Option A and Option B execution.
  - Remove “16-Pair Geometric” and “Rank-Based Flow” labels.
  - Do not delete trial files in this task.

- [ ] **Step 2: Render one full-width custom-engine canvas**
  - Build `NodeSizeMap` from the fixture node `w` and `h` values.
  - Use `computeCustomLayout` directly in the laboratory.
  - Render result nodes using existing test cards.
  - Render serialized routed paths.
  - Render badges and optional leaders.
  - Show unresolved geometry in red with diagnostics.

- [ ] **Step 3: Add stage controls**

Add toggles for:

```text
ranks
SCC regions
virtual nodes
port candidates
selected ports and stubs
expanded obstacles
routing grid
occupied lanes
badge rectangles and anchors
crossing bridges
validator violations
```

- [ ] **Step 4: Add configuration controls**
  - Node gap.
  - Rank gap.
  - Obstacle clearance.
  - Lane spacing.
  - Bend penalty.
  - Crossing penalty.
  - Direction penalty.
  - Side-reuse penalty.
  - Reset-to-default button.

- [ ] **Step 5: Add metric display**

Show:

```text
status
nodes
edges
SCCs
feedback edges
self-loops
node overlaps
edge-node penetrations
shared segment length
badge collisions
crossings
bends
route length
graph area
layout duration
```

- [ ] **Step 6: Keep scenario selection deterministic**
  - Use fixtures from `customLayoutScenarios.ts`.
  - Preserve the selected scenario during hot reload.
  - Do not mutate fixture objects from UI controls.

- [ ] **Step 7: Run quality checks**

```bash
bun run typecheck
bun run lint
bun run build:local
```

- [ ] **Step 8: Commit**

```bash
git add src/features/GraphTesting/components/GraphTestingPage.tsx src/features/GraphTesting/components/CustomLayoutDebugOverlay.tsx src/features/GraphTesting/components/CustomLayoutMetrics.tsx src/features/GraphTesting/GraphTesting.css
git commit -m "feat: rebuild graph layout testing laboratory"
```

---

### Task 27: Complete the Laboratory Acceptance Gate

**Files:**

- Modify only when a failing invariant has a reproducible test in the responsible engine module.

- [ ] **Step 1: Run every named scenario**
  - Open `http://localhost:5173/?page=testing`.
  - Inspect each scenario with violations overlay enabled.
  - Record the scenario name and diagnostic code for every problem.

- [ ] **Step 2: Convert every visual defect into a failing automated test**
  - Add the smallest topology that reproduces it.
  - Put the test in the module responsible for the failure.
  - Confirm the test fails before changing implementation.

- [ ] **Step 3: Fix one diagnostic class at a time**
  - Node placement.
  - Port assignment.
  - Route search.
  - Lane reservation.
  - Badge placement.
  - SVG serialization.

- [ ] **Step 4: Re-run all custom-engine tests after every fix**

```bash
bun test src/engine/layout/custom
bun test src/features/GraphTesting
```

- [ ] **Step 5: Require these acceptance results**
  - Zero hard-invariant errors in every named scenario.
  - Zero shared positive-length edge segments.
  - Zero badge collisions.
  - Zero node collisions.
  - All remaining crossings display a bridge.
  - Repeated rendering does not move nodes, ports, routes, or badges.

- [ ] **Step 6: Run the repository quality gate**

```bash
bun test
bun run typecheck
bun run lint
bun run format:check
bun run build:local
```

- [ ] **Step 7: Commit acceptance fixes**

Use one focused commit per diagnostic class. Do not combine unrelated visual fixes.

---

## Phase F — Public Types, Worker, and Production Integration

### Task 28: Extend Public Positioned Graph Types

**Files:**

- Modify: `src/types/graphData.ts`
- Create: `src/types/graphData.test.ts`

- [ ] **Step 1: Add public routed geometry types**

Add:

```ts
export interface GraphPoint {
  x: number;
  y: number;
}
export type GraphPortSide = "top" | "right" | "bottom" | "left";
export interface GraphPortPosition {
  side: GraphPortSide;
  point: GraphPoint;
  stub: GraphPoint;
}
export interface GraphCrossing {
  point: GraphPoint;
  bridge: boolean;
}
```

- [ ] **Step 2: Extend `PositionedEdge`**

Add optional:

```ts
points?: GraphPoint[]
sourcePort?: GraphPortPosition
targetPort?: GraphPortPosition
labelAnchorX?: number
labelAnchorY?: number
crossings?: GraphCrossing[]
```

Keep existing `path`, `labelX`, and `labelY` for renderer compatibility.

- [ ] **Step 3: Add type-level construction tests**
  - Construct the smallest valid positioned node and edge.
  - Construct an edge containing every new optional field.

- [ ] **Step 4: Run tests and typecheck**

```bash
bun test src/types/graphData.test.ts
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/types/graphData.ts src/types/graphData.test.ts
git commit -m "feat: expose routed graph geometry types"
```

---

### Task 29: Adapt Custom Results to Public Graph Types

**Files:**

- Modify: `src/engine/layout/custom/computeCustomLayout.ts`
- Modify: `src/engine/layout/custom/computeCustomLayout.test.ts`

- [ ] **Step 1: Add adapter tests**
  - Node data fields survive positioning.
  - Edge data fields survive routing.
  - Public path matches routed points.
  - Public label anchor matches badge placement.
  - Cycle metadata survives.

- [ ] **Step 2: Implement the adapter**
  - Return `PositionedNode[]`.
  - Return `PositionedEdge[]`.
  - Keep debug and diagnostics beside public arrays in `CustomLayoutResult`.
  - Do not leak mutable internal maps.

- [ ] **Step 3: Run tests and typecheck**

```bash
bun test src/engine/layout/custom/computeCustomLayout.test.ts
bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/layout/custom/computeCustomLayout.ts src/engine/layout/custom/computeCustomLayout.test.ts
git commit -m "feat: adapt custom layout to graph renderer"
```

---

### Task 30: Add the Repository-Owned Layout Worker

**Files:**

- Create: `src/engine/layout/custom/customLayout.worker.ts`
- Create: `src/engine/layout/custom/customLayoutClient.ts`
- Create: `src/engine/layout/custom/customLayoutClient.test.ts`

- [ ] **Step 1: Define request and response messages**

```ts
interface CustomLayoutRequest {
  requestId: number;
  dataset: GraphDataset;
  nodeDimensions: Record<string, { width: number; height: number }>;
  config?: Partial<CustomLayoutConfig>;
}

interface CustomLayoutResponse {
  requestId: number;
  result: CustomLayoutResult;
}
```

- [ ] **Step 2: Implement the worker entry**
  - Receive one request.
  - Call the synchronous pure engine.
  - Post one serializable response.
  - Convert thrown errors to `invalid-input` diagnostics.

- [ ] **Step 3: Write client tests with a fake worker**
  - Increment request IDs.
  - Resolve matching response.
  - Ignore stale responses.
  - Reject on worker error.
  - Terminate and clear pending requests on dispose.

- [ ] **Step 4: Implement the client**
  - Create the worker with `new URL("./customLayout.worker.ts", import.meta.url)`.
  - Keep only the newest requested layout relevant to a canvas.
  - Do not cancel engine logic through shared mutable state.

- [ ] **Step 5: Run tests and build**

```bash
bun test src/engine/layout/custom/customLayoutClient.test.ts
bun run typecheck
bun run build:local
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/layout/custom/customLayout.worker.ts src/engine/layout/custom/customLayoutClient.ts src/engine/layout/custom/customLayoutClient.test.ts
git commit -m "feat: run custom layout in repository worker"
```

---

### Task 31: Render Badge Leaders and Crossing Bridges

**Files:**

- Modify: `src/primitives/edges/GraphEdge/index.tsx`
- Modify: `src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx`
- Modify: `src/primitives/edges/GraphEdge/GraphEdge.css`
- Create: `src/primitives/edges/GraphEdge/GraphEdge.test.tsx`

- [ ] **Step 1: Add server-rendered component tests**
  - Create `src/primitives/edges/GraphEdge/GraphEdge.test.tsx`.
  - Use `renderToStaticMarkup` from `react-dom/server`.
  - Assert the leader is absent when badge center equals anchor.
  - Assert the leader is present when the badge is offset.
  - Assert the routed path is used without recomputation.
  - Assert cycle and selected CSS classes remain present.

- [ ] **Step 2: Render the badge leader**
  - Draw from `labelAnchorX/Y` to `labelX/Y`.
  - Place it below the badge and above the primary edge.
  - Use non-scaling stroke.
  - Do not add a leader when distance is below epsilon.

- [ ] **Step 3: Render the serialized bridge path**
  - Continue using `edge.path` as the source of truth.
  - Do not recompute custom paths in `computeEdgePath`.
  - Preserve arrow markers.

- [ ] **Step 4: Verify pointer behavior**
  - Badge remains clickable.
  - Leader does not capture pointer events.
  - Edge selection behavior does not change.

- [ ] **Step 5: Run quality checks**

```bash
bun test src/primitives/edges/GraphEdge/GraphEdge.test.tsx
bun run typecheck
bun run lint
bun run build:local
```

- [ ] **Step 6: Commit**

```bash
git add src/primitives/edges/GraphEdge/index.tsx src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx src/primitives/edges/GraphEdge/GraphEdge.css src/primitives/edges/GraphEdge/GraphEdge.test.tsx
git commit -m "feat: render routed badge leaders and crossings"
```

---

### Task 32: Gate Top-Down Production Layout Behind the Custom Engine

**Files:**

- Modify: `src/engine/layout/layoutDispatcher.ts`
- Modify: `src/engine/layout/layoutDispatcher.test.ts`

- [ ] **Step 1: Add dispatcher tests**
  - Top-down calls the custom engine.
  - Left-right keeps its current behavior.
  - Force keeps its current behavior.
  - Radial keeps its current behavior.
  - Invalid custom input returns a controlled error result.

- [ ] **Step 2: Add a temporary feature constant**

Use a repository constant, not local storage:

```ts
const USE_CUSTOM_TOP_DOWN_LAYOUT = true;
```

This provides one-line rollback during initial production verification.

- [ ] **Step 3: Route top-down through `computeCustomLayout`**
  - Build `NodeSizeMap` with `measureGraphNodes`.
  - Return public positioned nodes and edges.
  - Change the dispatcher return contract to `GraphLayoutResult`.
  - Define `GraphLayoutResult` in `layoutDispatcher.ts` with `nodes`, `edges`, `status`, and `diagnostics`.
  - Return `status: "success"` and an empty diagnostic list for unchanged non-custom modes.
  - Surface unresolved custom diagnostics to the caller.
  - Do not silently fall back to Dagre for a hard-invalid result.

- [ ] **Step 4: Keep other modes unchanged**
  - No force-layout rewrite.
  - No radial-layout rewrite.
  - No left-right rewrite in this task.

- [ ] **Step 5: Run tests and typecheck**

```bash
bun test src/engine/layout/layoutDispatcher.test.ts
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/layout/layoutDispatcher.ts src/engine/layout/layoutDispatcher.test.ts
git commit -m "feat: use custom top-down graph layout"
```

---

### Task 33: Use the Worker from GraphCanvas

**Files:**

- Modify: `src/engine/GraphCanvas/index.tsx`
- Create: `src/engine/GraphCanvas/layoutRequest.test.ts`

- [ ] **Step 1: Extract a layout request helper**
  - Input: dataset, layout mode, measured dimensions.
  - Custom top-down: worker client.
  - Other modes: current synchronous dispatcher.
  - Output: the `GraphLayoutResult` contract from `layoutDispatcher.ts`.

- [ ] **Step 2: Write stale-result tests**
  - Request A starts.
  - Request B starts.
  - A resolves after B.
  - A is ignored.
  - B updates the store.

- [ ] **Step 3: Update the effect**
  - Keep a monotonically increasing request ID.
  - Do not update state after unmount.
  - Preserve auto-fit after the accepted result.
  - Preserve current dataset and layout-mode dependencies.

- [ ] **Step 4: Add unresolved-result behavior**
  - Keep the prior valid graph visible.
  - Store or display diagnostics.
  - Do not replace the canvas with invalid overlapping geometry.

- [ ] **Step 5: Run tests and build**

```bash
bun test src/engine/GraphCanvas/layoutRequest.test.ts
bun run typecheck
bun run build:local
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/GraphCanvas/index.tsx src/engine/GraphCanvas/layoutRequest.test.ts
git commit -m "feat: compute graph layout without blocking canvas"
```

---

### Task 34: Integrate Synchronous HTML Export

**Files:**

- Modify: `src/utils/htmlExporter.ts`
- Create or modify: `src/utils/htmlExporter.test.ts`

- [ ] **Step 1: Add export tests**
  - Export uses custom top-down node coordinates.
  - Export includes routed edge paths.
  - Export includes badge coordinates.
  - Export rejects unresolved hard-invalid layout.

- [ ] **Step 2: Use the synchronous engine**
  - Workers are unavailable or undesirable during static export.
  - Build `NodeSizeMap` with `measureGraphNodes`.
  - Call `computeCustomLayout` directly with that map.
  - Serialize only successful results.

- [ ] **Step 3: Preserve current export styling**
  - Do not redesign exported nodes.
  - Do not change unrelated HTML controls.

- [ ] **Step 4: Run tests and build**

```bash
bun test src/utils/htmlExporter.test.ts
bun run typecheck
bun run build:local
```

- [ ] **Step 5: Commit**

```bash
git add src/utils/htmlExporter.ts src/utils/htmlExporter.test.ts
git commit -m "feat: export custom routed graph layouts"
```

---

## Phase G — Final Verification and Cleanup

### Task 35: Run Full Automated Verification

**Files:**

- Modify only files required by a reproduced failure.

- [ ] **Step 1: Run custom engine tests**

```bash
bun test src/engine/layout/custom
```

- [ ] **Step 2: Run graph testing tests**

```bash
bun test src/features/GraphTesting
```

- [ ] **Step 3: Run the full repository suite**

```bash
bun test
```

- [ ] **Step 4: Run static checks**

```bash
bun run typecheck
bun run lint
bun run format:check
```

- [ ] **Step 5: Run the production build**

```bash
bun run build:local
```

- [ ] **Step 6: Stop on any failure**
  - Do not weaken a hard invariant.
  - Add a regression test before fixing.
  - Re-run the smallest test first, then the full gate.

- [ ] **Step 7: Commit only verified fixes**

Use one commit per independent regression class.

---

### Task 36: Perform Final Visual Verification

**Files:**

- No planned edits.

- [ ] **Step 1: Inspect every laboratory scenario**
  - Test default configuration.
  - Enable validator overlay.
  - Enable port and lane overlay for dense cases.

- [ ] **Step 2: Inspect production samples**
  - Top-down agent trace.
  - Decision tree.
  - Cyclic mesh.
  - Variable-width node content.
  - Collapsed and expanded node states.

- [ ] **Step 3: Verify interactions**
  - Pan.
  - Zoom.
  - Fit view.
  - Node selection.
  - Edge selection.
  - Badge click.
  - Search and filtering.
  - Collapse persistence.

- [ ] **Step 4: Verify visual direction**
  - Forward edges read top to bottom.
  - Same-rank edges read horizontally.
  - Feedback edges are visually distinct.
  - Arrowheads are not covered by nodes or badges.
  - Every unavoidable crossing has a bridge.

- [ ] **Step 5: Record approval**
  - Save verification screenshots under `docs/verification/graph-layout/`.
  - Record final metric values for the two dense scenarios in the implementation PR or commit message.

---

### Task 37: Remove Obsolete Trial Wiring

**Files:**

- Delete only after final visual approval:
  - `src/features/GraphTesting/algorithm/shortestPathEngine.ts`
  - `src/features/GraphTesting/algorithm/dagreRankEngine.ts`
  - `src/features/GraphTesting/algorithm/legacyCollisionEngines.ts`
  - obsolete tests that import only those files
- Modify:
  - imports remaining in `src/features/GraphTesting`

- [ ] **Step 1: Search for every obsolete import**

```bash
rg -n "shortestPathEngine|dagreRankEngine|legacyCollisionEngines" src
```

- [ ] **Step 2: Confirm no production import depends on a trial file**
  - If one exists, replace it with the custom engine before deletion.

- [ ] **Step 3: Delete only obsolete trial files**
  - Do not delete scenario data still used by regression tests.
  - Do not delete Dagre while left-right mode still imports it.

- [ ] **Step 4: Run the full quality gate**

```bash
bun test
bun run typecheck
bun run lint
bun run format:check
bun run build:local
```

- [ ] **Step 5: Commit**

```bash
git add -A src/features/GraphTesting
git commit -m "chore: remove obsolete graph routing trials"
```

---

### Task 38: Remove the Temporary Production Gate

**Files:**

- Modify: `src/engine/layout/layoutDispatcher.ts`
- Modify: `src/engine/layout/layoutDispatcher.test.ts`

- [ ] **Step 1: Confirm final acceptance conditions**
  - Every named scenario has zero hard errors.
  - Full test suite passes.
  - Production build passes.
  - Visual verification is approved.

- [ ] **Step 2: Remove `USE_CUSTOM_TOP_DOWN_LAYOUT`**
  - Make the custom engine the only top-down implementation.
  - Keep other layout modes unchanged.

- [ ] **Step 3: Remove dead top-down Dagre branches**
  - Do not remove shared dimension helpers until their callers are migrated.
  - Do not remove Dagre if left-right still requires it.

- [ ] **Step 4: Run the final quality gate**

```bash
bun test
bun run typecheck
bun run lint
bun run format:check
bun run build:local
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/layout/layoutDispatcher.ts src/engine/layout/layoutDispatcher.test.ts
git commit -m "refactor: finalize custom top-down graph layout"
```

---

## Dependency Order

```text
Contracts
  ↓
Geometry ──→ Normalization ──→ SCCs ──→ Cycle Breaking
                                      ↓
Ranks ──→ Virtual Nodes ──→ Crossing Minimization ──→ Coordinates
                                                        ↓
Port Candidates ──→ Side Assignment ──→ Port Distribution
                                                        ↓
Routing Grid ──→ A* Search ──→ Special Routes ──→ Global Edge Router
                                                        ↓
Badge Measurement ──→ Badge Placement ──→ Validator ──→ Global Optimizer
                                                        ↓
SVG Serialization ──→ Complete Engine ──→ Testing Laboratory
                                                        ↓
Public Types ──→ Worker ──→ Renderer ──→ Production ──→ Export
```

Production integration must not start before Task 27 passes.

---

## Completion Criteria

The project is complete only when:

1. No third-party layout or routing runner was added.
2. The custom engine is composed of the focused modules in this plan.
3. Every named and generated successful scenario has zero hard-invariant errors.
4. No two routed edges share positive-length geometry.
5. Nodes and badges never collide.
6. Same-rank edges can use horizontal sides.
7. Forward edges normally read top to bottom.
8. Feedback and self-loop edges remain distinct.
9. Every remaining crossing is counted and visually bridged.
10. Results are deterministic.
11. The laboratory exposes intermediate layout and routing state.
12. Production top-down mode uses the custom engine.
13. The HTML exporter uses the same engine.
14. Full tests, typecheck, lint, formatting check, and production build pass.
