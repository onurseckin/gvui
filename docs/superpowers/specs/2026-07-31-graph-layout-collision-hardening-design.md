# Graph Layout Collision Hardening Design

## Purpose

Make every rendered edge, port, and edge badge visually distinct across the 20 testing scenarios while keeping cyclic graphs responsive and preserving the custom, dependency-free layout engine.

## Confirmed Defects

1. `portDistribution.ts` uses `(index + 1) / (count + 1)`. Two attachments therefore land at 33/67%, and three at 25/50/75%, which clusters endpoints toward the middle.
2. `layoutValidator.ts` skips badge-versus-edge checks whenever the two edges share any endpoint node. This hides the visible conflicts in scenarios #8, #9, #12, #14, #19, and #20.
3. Scenario #13 returns three routes for four input edges, and scenario #20 returns ten routes for twelve input edges. Missing routes are not passed into validation, so both results can be labeled `success`.
4. Feedback discovery in `neighborhoodSearch.ts` searches edge IDs for the words `cycle` and `loop`. Generated IDs do not contain those words, even when `isCycle` is true.
5. `labelLanePlanner.ts` emits global node-gap demands even when every affected rank contains one node. The resulting coordinates are unchanged, but the optimizer repeats all routing work.
6. Scenario #11 takes approximately 159 ms and #13 approximately 318 ms in the synchronous public API. Routing/A* accounts for nearly all of that time.
7. `GraphTestingPage.tsx` and `GraphTestingModal.tsx` call the synchronous engine from `useMemo`. The existing Worker hook is unused.
8. `customLayoutWorkerClient.ts` terminates its Worker on timeout and then runs the expensive fallback synchronously on the browser main thread, defeating crash containment.

## Design Decisions

### Uniform Port Distribution

Use one formula for every attachment count:

```ts
offset = padding + usableLength * ((index + 0.5) / attachmentCount);
```

This places attachments at the centers of equal-width bins:

- one: 50%;
- two: 25%, 75%;
- three: 16.67%, 50%, 83.33%;
- four: 12.5%, 37.5%, 62.5%, 87.5%.

Sorting remains based on projected remote position or the explicit port order. Source and target attachments share the same distribution mechanism.

### Collision Truth

An edge badge may intersect only its own edge. Any intersection with another edge is a scored conflict, including:

- reciprocal edges;
- parallel edges;
- edges sharing a source;
- edges sharing a target;
- feedback and forward edges sharing an endpoint.

No validator exception may hide a collision based on graph relationship.

Badge candidates intersecting another edge are illegal rather than merely expensive. If direct placement is impossible, the engine may try a legal offset/leader candidate and must expose a spacing demand for ordinary labels instead of fabricating an overlapping default candidate.

### Complete Results

Validation receives the expected input-edge set. A missing route produces a hard `MISSING_ROUTE` diagnostic. A missing required badge produces a soft `MISSING_BADGE` diagnostic and prevents `success`.

The router and optimizer compare complete results before aesthetics. A partial route set can never beat a complete route set by appearing shorter or conflict-free.

### Feedback Routing and Side Selection

Feedback identity comes from classified edge role and `isCycle`, never edge-ID text.

For an upward feedback edge spanning intervening ranks, prioritize outer same-side corridors (`left→left` and `right→right`) before an interior `top→bottom` chord. Both outer sides remain candidates; scoring selects the side with fewer collisions and shorter legal routing.

Neighborhood generation receives edge metadata, targets all IDs named by a diagnostic, and generates a small deterministic set of relevant side-pair alternatives. It does not enumerate all 15 alternatives for the first defect while starving later defects.

The state’s explicit port order must be passed through `stateEvaluator.ts` into `routeAllEdges` and `distributePorts`.

### Conflict-Driven Expansion

Spacing changes are generated from measured conflicts, not from every badge.

- Same-rank labels request node gap only for ranks containing at least two nodes.
- Cross-rank labels request rank gap only when their measured height does not fit.
- Parallel/sibling badge-edge conflicts first trigger alternative port sides and route tracks.
- If all direct route-track alternatives fail, the demand targets the smallest relevant rank/node gap or outer corridor.
- A demand is enqueued only when applying it changes an effective override and can move at least one coordinate or route lane.

This keeps graph dimensions unbounded while preventing no-op expansion loops.

### Responsive Browser Execution

The testing page and modal use `useCustomLayoutWorker`; neither calls the synchronous engine during rendering.

Browser timeout behavior:

1. terminate the Worker;
2. reject with a typed timeout error;
3. keep the last valid result visible if one exists;
4. show retry controls;
5. never run a synchronous fallback on the main thread.

The direct synchronous API remains available for deterministic unit tests and non-browser callers.

## Acceptance Requirements

1. All 20 scenarios return exactly one route per input edge.
2. Every labeled/cycle edge returns one badge or reports a non-success status.
3. Scenarios #8, #9, #12, #14, #19, and #20 have zero badge-versus-other-edge intersections.
4. Port points follow the equal-bin formula for one, two, three, and four attachments.
5. Scenario #11’s feedback edge uses an outer corridor and does not touch Node B.
6. Scenarios #11 and #13 do not enqueue ineffective global node-gap states.
7. Scenario #13’s feedback route exists.
8. The testing page stays interactive while #11 and #13 calculate.
9. A non-responsive Worker is terminated without any synchronous retry.
10. Existing legality, zero-crossing, unique-port, and deterministic-output requirements remain green.

## Test Strategy

- Unit tests lock equal-bin port coordinates.
- Validator tests reproduce sibling badge/edge intersections and missing expected routes/badges.
- Scenario acceptance tests calculate geometric badge/edge intersections independently of validator metrics.
- Feedback tests assert role-based neighborhood selection and outer-corridor routing.
- Spacing tests prove single-node-rank demands are discarded as ineffective.
- Worker-client tests use an injectable Worker/timer seam to verify termination, timeout rejection, cancellation, and stale-result behavior.
- Browser verification repeats #8, #9, #11, #12, #13, #14, #19, and #20 after automated gates pass.

## Scope Limits

- Do not add Dagre, ELK, Graphviz, libavoid, or another renderer.
- Do not branch production behavior on scenario number, node ID, edge label, or fixture title.
- Do not cap graph width or height.
- Do not increase search budgets to conceal inefficient work.
- Do not redesign node cards or unrelated application UI.
