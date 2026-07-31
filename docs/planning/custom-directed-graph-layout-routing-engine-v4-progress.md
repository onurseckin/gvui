# Custom Directed Graph Layout Routing Engine V4 Progress Ledger

> **For agentic workers:** REQUIRED SUB-SKILL: use `executing-plans` to implement the plan task by task.

## Baseline Freeze

- **Date:** 2026-07-30
- **Git HEAD:** `ae15614e7236b5b73b285467ab74990215762919`
- **Last Commit:** `ae15614 feat: implement custom directed graph layout engine V3`
- **Git Status:** `?? docs/planning/custom-directed-graph-layout-routing-engine-plan-v4.md`

## Baseline Gate Results

| Gate | Status | Details / Output |
| --- | --- | --- |
| `customLayoutValidatorStrict.test.ts` | **PASS** | 20 pass, 0 fail (15.09s) |
| `customLayoutAestheticAcceptance.test.ts` | **PASS** | 26 pass, 0 fail (52.69s) |
| `generatedGraph.test.ts` | **FAIL** | 24 pass, 2 fail (437.36s). Seed 101 timed out (223.5s), Seed 404 timed out (129.4s) |
| `bun run typecheck` | **PASS** | `tsc -b` exited with code 0 |
| `bun run lint` | **PASS** | `oxlint` found 0 warnings and 0 errors |
| `bun run format:check` | **FAIL** | `oxfmt --check` found format issues in 20 files |
| `bun run build:local` | **PASS** | `tsc -b && vite build` completed cleanly |

## Initial Scenario Metrics Baseline

Recorded from baseline execution:

| Scenario | Status | Hard Errors | Badge/Edge Overlaps | Crossings | Ordinary Leaders | Feedback Leaders | Avoidable Hairpins | Total Bends | Max Edge Bends | Length | Area | Evaluated States |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #1 Empty | success | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0x0 | 1 |
| #2 Single Node | success | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100x40 | 1 |
| #3 Pipeline | success | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 60 | 260x40 | 1 |
| #4 Linear Chain | success | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 120 | 420x40 | 1 |
| #5 Fan-Out | success | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 3 | 1140 | 660x140 | 1 |
| #6 Fan-In | success | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 3 | 1140 | 660x140 | 1 |
| #7 Diamond | success | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 2 | 340 | 260x140 | 1 |
| #8 Same-Rank | success | 0 | 0 | 1 | 0 | 0 | 1 | 4 | 2 | 449 | 260x140 | 9 |
| #9 Reciprocal | success | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 2 | 260 | 260x40 | 1 |
| #10 Self-Loop | success | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 140 | 100x120 | 1 |
| #11 Cyclic Ring | success | 0 | 0 | 0 | 0 | 0 | 1 | 8 | 3 | 720 | 420x140 | 9 |
| #12 Disjoint SCCs | success | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 2 | 380 | 440x40 | 1 |
| #13 Long Feedback | success | 0 | 0 | 0 | 0 | 1 | 0 | 8 | 4 | 1060 | 580x140 | 9 |
| #14 Parallel | success | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 2 | 300 | 260x140 | 1 |
| #15 Obstacle | success | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 180 | 260x140 | 1 |
| #16 Dense Badges | success | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 2 | 900 | 420x140 | 1 |
| #17 Var Sizes | success | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 120 | 500x70 | 1 |
| #18 Disconnected | success | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 120 | 500x40 | 1 |
| #19 Cyclic Trace | success | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 3 | 640 | 260x240 | 1 |
| #20 DevOps Mesh | success | 0 | 3 | 2 | 0 | 2 | 0 | 26 | 4 | 3380 | 780x340 | 17 |

## Known Named Route Defects Baseline

- **Scenario #5:** `msg 3` has 3 bends (V3 required ≤2 bends).
- **Scenario #6:** One 3-bend route remains.
- **Scenario #8:** 1 crossing and 1 hairpin remain; `horizontal sync` badge on same-rank link.
- **Scenario #14:** HTTP, WebSocket, and gRPC badges are offset without leaders (detached from routes).
- **Scenario #16:** A→B enters B from right instead of top; detached badge association.
- **Scenario #20:** 2 crossings (`e-NOTIF-AUTH-11` × `e-ORDER-CACHE-9`, `e-ORDER-DB-8` × `e-USER-PAY-5`), 3 badge/unrelated-edge overlaps, one 4-bend ordinary route, 2 feedback leader badges.

## Progress Tracking

- [x] **Task 0: Freeze the V4 Baseline** (`O0-orchestrator`)
- [x] **Task 1: Restore the Unweakened Acceptance Contract** (`T1-acceptance`)
- [x] **Task 2: Add Shared Search Contracts and Deterministic Budgets** (`C1-contracts`)
- [x] **Task 3: Make Route Search Fast Before Expanding Search Breadth** (`R1-routing-kernel`)
- [x] **Task 4: Add Conflict-Directed Rerouting** (`R1-routing-kernel`)
- [x] **Task 5: Add Explicit Attachment Ordering and Side Search** (`P1-port-state`)
- [x] **Task 6: Implement Dynamic Label-Lane Demands** (`B1-label-lanes`)
- [x] **Task 7: Add Searchable Local Layer Order and Coordinate Shifts** (`L1-layer-state`)
- [x] **Task 8: Build canonical LayoutSearchState and Objective Evaluator** (`G1-global-search`)
- [x] **Task 9: Implement Best-First Search and Neighborhood Moves** (`G1-global-search`)
- [x] **Task 10: Wire Dynamic Spacing Demands and Search Optimizations** (`G1-global-search`)
- [x] **Task 11A: Cooperative Abort and Best-Result Recovery** (`G1-global-search`)
- [x] **Task 11B: Web Worker Watchdog and Hard Containment** (`W1-worker-safety`)
- [ ] **Task 11: UI Diagnostics, Async Hook, and Error Boundary** (`U1-diagnostics-ui`)
- [ ] **Task 12: Run Full Regression and Performance Gates** (`T1-acceptance`)
- [ ] **Task 13: Final Visual Audit and Merge Gates** (`O0-orchestrator`)
