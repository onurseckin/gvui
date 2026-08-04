← [Edge Routing](./10-edge-routing.md) | [Index](./README.md) | [Next: Layout Modes →](../modes/README.md)

# Chapter 11: Emit and Quality

The drawing is finished. Every node has coordinates, every edge has a polyline, every badge has a
rectangle.

This chapter is about the last phase, and it has exactly two jobs:

1. **Finish the payload** — undo the one illusion the pipeline was working under, arrange
   independently laid out components, and hand the renderer something well-formed and deterministic.
2. **Tell the truth about it** — verify the invariants the engine claims, and measure the things it
   does not claim.

The distinction in job 2 is the point of the whole chapter, and it is the thing v1 got most wrong:

> **Constraints are asserted. Metrics are reported.**
>
> A constraint violation is a bug report about the engine. A metric is an observation. Nothing in
> v2 reads a metric to make a decision, because v2 has no objective function and no search.

Nothing in this phase can change the drawing.

---

## 1. Positioned nodes

Nodes are emitted in **IR node-index order**, which is the order they arrived in, reading `x`, `y`,
`width`, `height`, `rank` and `order` straight off the `Real` item Phase 4 created for each of them.

If a node has no layered item, that cannot happen — Phase 4 creates one for every node. It is
reported anyway, as a `MISSING_NODE_ITEM` error, rather than silently dropped. A vanished node is
exactly the kind of bug this phase exists to surface.

Routes and badges are then sorted by IR edge index (ties broken by edge id), so the wire payload's
ordering depends only on the input, never on the order Phase 8 happened to produce things in.

---

## 2. Un-reversing feedback edges

This is the only place in the entire pipeline where something an earlier phase did is undone.

[Phase 2](./04-structure.md) breaks cycles by **reversing** feedback edges — swapping their source
and target — so that Phases 4 through 8 can work on a DAG. A reversed edge is not removed and not
special-cased anywhere: it gets a rank span, dummy chains, an ordering position, lanes and ports
exactly like a forward edge. Every phase between structure and routing believes it is looking at an
ordinary top-to-bottom edge.

Here that belief is dropped:

```rust
route.points.reverse();
std::mem::swap(&mut route.source_port, &mut route.target_port);
```

```text
   AS ROUTED (internal frame)             AS EMITTED

     ┌─────┐   B is the chain's             ┌─────┐   A is the original
     │  B  │   "source" because             │  B  │   target, so the
     └──┬──┘   Phase 2 swapped              └──▲──┘   arrowhead goes here
        │      the endpoints                   │
        ▼                                      │
     ┌─────┐                                ┌──┴──┐
     │  A  │                                │  A  │
     └─────┘                                └─────┘
```

The polyline is the same geometry walked backwards; only its direction and the source/target port
labels change. The renderer draws the arrowhead at the **original** target, which is what a reader
expects, while the drawing's shape still reflects the DAG the layout was computed on.

Keeping this in one place is deliberate. If any earlier phase knew about reversal it would have to
decide what to do about it, and there would be two definitions of "source" floating around the
codebase.

---

## 3. Component packing

A graph can be several disconnected pieces. Each **weakly connected component** was laid out
independently, which means every one of them starts at the same origin and they are drawn on top of
each other. `pack_components` separates them.

```text
   BEFORE (both components laid out at the origin)

        ┌───┐┌───┐
        │ A ││ C │      ← A/B and C/D occupy the same space
        └───┘└───┘
        ┌───┐┌───┐
        │ B ││ D │
        └───┘└───┘

   AFTER (shelf pack, union box top-left at graph_padding)

        ┌───┐          ┌───┐
        │ A │          │ C │
        └───┘          └───┘
        ┌───┐          ┌───┐
        │ B │          │ D │
        └───┘          └───┘
        └── component_gap ──┘
```

The arrangement is a **shelf pack**: components are ordered by descending height (ties broken by
width, then by component index, so the order never depends on a hash) and filled left-to-right into
rows whose width target is $\sqrt{\text{total area} \times \text{targetAspectRatio}}$. A new shelf
starts below the tallest box on the current one. The union box's top-left lands at
`config.graph_padding`.

There is no search here and nothing to converge to — a shelf pack of fixed boxes is one pass.

Three contract details:

- **`component_of_node` is parallel to `nodes`**, not indexed by IR node index. Entry `i` is the
  component of `nodes[i]`.
- **Attribution.** A route belongs to the component of its source port's node (falling back to the
  target's). A badge belongs to the component of its edge's route, because a badge carries no node
  reference of its own. Anything unattributable is left where it is rather than moved to an
  arbitrary component.
- **It is idempotent.** Placement depends only on per-component box *sizes* and component indices,
  both translation-invariant, so packing an already-packed arrangement reproduces it exactly. A
  caller who cannot tell whether packing already ran may simply run it.

Components that produce no box (empty, or entirely non-finite) get a zero offset and are kept out of
the pack entirely. A phantom zero-size box would still consume a `component_gap` and skew the
arrangement of the real ones.

---

## 4. Geometric crossings

`detect_geometric_crossings` measures where the emitted polylines actually intersect. It is a
left-to-right sweep with an active list keyed on `max_x`, so the cost is $O(n \log n + p)$ where
$p$ is the number of x-overlapping segment pairs — not the $O(n^2)$ of an all-pairs scan.

Only **proper** intersections count. Two routes that merely touch at a shared port, or run
collinearly, are not crossings.

Each crossing records a `bridgeOwnerEdgeId`: which of the two edges draws the little hop-over arc.
The rule is that the **lower-priority** edge hops, so the more structurally important line stays
straight:

| role | priority |
| --- | ---: |
| `Forward` | 4 |
| `Cross` | 3 |
| `Feedback` | 2 |
| self-loop | 1 |
| unknown | 0 |

Ties break on edge id, so the choice is stable regardless of the order the pair was discovered in.

---

## 5. Constraints — asserted, never scored

[`check_constraints`](../../crates/gvui/src/6_validation/6_1_constraints.rs) verifies the invariants
the engine guarantees by construction. Every diagnostic it produces has severity `"error"`: there is
no such thing as a tolerable violation here.

| code | what it means |
| --- | --- |
| `NON_FINITE_COORDINATE` | a NaN or infinity in a node box, route point, port, badge rect, anchor or leader |
| `NODE_NODE_OVERLAP` | two node boxes overlap. Phase 7's separations forbid it |
| `EDGE_NODE_PENETRATION` | a routed segment passes through a node's interior. Phase 6's lanes forbid it |
| `BADGE_NODE_OVERLAP` | a badge box overlaps a node box |
| `BADGE_BADGE_OVERLAP` | two badge boxes overlap |
| `NON_ORTHOGONAL_SEGMENT` | a segment is not axis-aligned. Skipped for the `spline` and `straight` styles, which are diagonal by design |
| `ENDPOINT_OFF_BOUNDARY` | a route's port point is not on its node's boundary |
| `MISSING_ROUTE` | an input edge produced no polyline |
| `MISSING_NODE_ITEM` | an input node produced no positioned node (raised by emit itself) |

Ingest diagnostics — unknown endpoints, dropped edges — are prepended to the list, because they are
older than anything produced here and they explain any downstream surprise.

Two deliberate choices in the scanners:

- **A route's own endpoint nodes are not excluded from the penetration check.** A correctly built
  polyline leaves its port outward along the boundary normal, so it touches the boundary without
  entering the interior. Excluding those nodes would blind the check to exactly the failure it
  exists to catch — and it is exactly the failure that
  [the stale coordinate space](./09-coordinate-assignment.md#the-coordinate-space-trap) produced,
  184 times.
- **Diagnostics are capped at 32 per code, but scanning continues.** A structurally broken layout
  can violate one invariant thousands of times, and formatting all of them would make the failure
  path cost more than the layout. The counts in `LayoutMetrics` carry the full totals; only the
  human-readable messages are capped, and `format!` runs only when a violation actually fires.

Diagnostics are emitted check by check in a fixed order, and within a check in slice order, so the
output is byte-identical across processes for identical input.

### Why these checks can be on by default now

v1's validator had **no spatial index anywhere**: $O(N^2)$ node-node, $O(E \cdot S \cdot N)$
edge-node, $O(E^2 \cdot S^2)$ shared-segment, $O(B \cdot E \cdot S)$ badge-edge. It also allocated a
`format!` message for every violation *even when called purely as a scoring probe inside the
router's inner loop* — which it was, up to 4 × 12 × 32 times per layout. It could not realistically
be run outside a debug build.

v2 puts a uniform `SpatialHash` in front of every pairwise question, so each one is answered against
its local neighbourhood and the whole pass is linear in practice. Two properties of the index matter
to callers:

- **It may over-report and must never under-report.** Anything it cannot bucket — a non-finite
  rectangle, or one spanning more than `MAX_AXIS_CELLS = 512` cells on an axis — is returned by
  *every* query rather than dropped. Callers still run the exact predicate on each candidate; the
  hash only shrinks the candidate set.
- **Results are sorted and deduplicated**, so iteration order never depends on the backing
  `HashMap`. The index is on the decision path of every constraint check, and determinism is a hard
  requirement.

Cell size is picked from the mean extent of the population being indexed. Cells sized like the
objects keep the expected candidate count per query $O(1)$; much smaller cells cost iteration, much
larger ones cost false candidates.

---

## 6. Metrics — reported, never optimized

### What v1 did

v1 had a `LayoutScore`: a **21-field lexicographic tuple**, compared field by field, with
`hard_error_count` first. Everything the engine could measure was folded into that one comparator,
and the outer state-space search optimized against it.

Lexicographic ordering with a hard-error count in front means that **until that count reaches zero,
the comparator is effectively a single boolean**. Two candidate layouts with 4 errors each compare
equal on the first field and only then get to look at geometry — but a candidate with 4 errors and
a candidate with 3 errors compare on nothing else at all. The search received no gradient. The
struct even carried `state_hash: String` as a comparable field.

The neighbourhood generator compensated by rotating round-robin through unrelated move classes —
flip a port side, swap two nodes in a rank, swap two ports on a side, batch-repair a crossing
component. With no gradient, 4–8 state evaluations of budget, and a fitness function that took four
seconds to run, this was random restart wearing a search's clothes. Crossing counts were also
non-monotone in the budget knobs: on `dense_kubernetes_mesh`, dropping `initial_lane_rings` from 2
to 1 *improved* crossings from 206 to 146. A search whose quality moves randomly with its budget is
not converging; it is sampling.

### What v2 does

**v2 has no objective function at all.** There is nothing to score, because there is nothing to
choose between. Every phase produces its output in one pass and hands it forward.

That is what makes the split possible:

| | constraints | metrics |
| --- | --- | --- |
| produced by | `check_constraints` | `compute_metrics` |
| severity | `error` — a bug report | none — an observation |
| effect on the drawing | none (already final) | none |
| a nonzero value means | the engine is broken | this is what the drawing looks like |
| may it be traded off? | never | there is nothing to trade against |

Because no search can game them, the checks may be exhaustive and strict, and the metrics may be
honest about things the engine does not promise.

---

## 7. Every metric

From [`LayoutMetrics`](../../crates/gvui/src/0_common/0_1_types.rs), computed in
[`6_2_metrics.rs`](../../crates/gvui/src/6_validation/6_2_metrics.rs).

### Shape and structure

| field | meaning |
| --- | --- |
| `crossings` | **combinatorial** count from Phase 5's exact Barth–Mutzel–Jünger algorithm — order inversions between adjacent ranks |
| `geometricCrossings` | **measured** proper intersections between the emitted polylines |
| `bendCount` | interior vertices of the *simplified* polyline, summed. A collinear vertex is an artefact of materialisation, not a bend a reader can see |
| `totalLength` | total Manhattan path length over all routes |
| `area` | bounding-box area over nodes, route points and badges |
| `aspectRatio` | bbox width / height. `1.0` when the height is zero — the neutral report, not a division by zero |
| `nodeCount`, `edgeCount` | emitted nodes; emitted routes |
| `rankCount`, `dummyCount` | `0` for the non-layered engines, which have no layered graph |

### Routing and attachment

| field | meaning |
| --- | --- |
| `laneDepthMax` | the widest routing channel — `max` over `channel_lanes` and `corridor_lanes`. Large values mean the ordering is fighting the topology |
| `portSideBalance` | mean over nodes of $1 - \frac{\lvert \text{top} - \text{bottom} \rvert}{\max(1, \text{total})}$. `1.0` = every node's edges split evenly between its top and bottom; `0.0` = everything on one side. A node with no ports scores `1.0` — it is not unbalanced. Left/right ports (flat edges, self-loops) count toward `total` only, so a node dominated by side attachments reads as balanced rather than as an outlier |

### Badges

| field | meaning |
| --- | --- |
| `leaderCount` | badges that needed a fallback leader line |
| `labelsTruncated` | badges whose display string ends in `…` or `...` — the host's measurer ellipsized it at `maxLabelLines`. The engine never sees text, so this string is the only surviving evidence |

### Constraint counters — any nonzero value is a bug, not a score

`nodeNodeOverlaps`, `edgeNodePenetrations`, `badgeNodeOverlaps`, `badgeBadgeOverlaps`,
`unresolvedRouteCount`, `unresolvedBadgeCount`.

These are the same scans `check_constraints` runs, invoked for their counts rather than their
messages — the scanners are callback-driven precisely so the two callers can share one
implementation without either allocating for the other's needs. `unresolvedRouteCount` counts routes
with fewer than two points or a non-finite coordinate; `unresolvedBadgeCount` counts badges with a
non-finite or non-positive rectangle.

---

## The two early-warning signals

Two of these numbers are not aesthetics. They are the tripwires for structural failure, and they are
reported **separately** rather than blended into an aggregate precisely because an aggregate would
hide them.

### `straightChainRatio`

The fraction of edge chains whose interior items all share one centre x.

```rust
// chains with fewer than 3 items are excluded from BOTH numerator and denominator
// (an adjacent-rank edge is straight by definition; counting it would dilute the signal
//  until it stopped moving). With no qualifying chain at all, the ratio is 1.0.
```

It is measured in **layered space** — the item's own `center_x` — which is where Brandes–Köpf makes
its alignment guarantee, so the number stays comparable across `Direction` values even though the
emitted geometry is transposed for `LR`/`RL`.

**Why it is a tripwire:** a drop means [Brandes–Köpf's dummy-chain alignment is being
defeated](./09-coordinate-assignment.md#step-1--type-1-conflicts-and-what-an-inner-segment-is) —
either type-1 conflict marking is not firing or the block structure is being broken by separations.
It is also the best single proxy the engine has for "looks designed": a drawing where long edges run
straight reads as intentional, and one where they staircase does not.

Measured: **1.00 on seven of eight fixtures**, 0.96 on `dense_kubernetes_mesh`. The left-right
variant of that fixture reports 0.87, which is expected rather than a defect — rank balancing
derives its rank-width cap from the average box aspect, and LR transposes every box, so the two
directions genuinely balance differently.

### `leaderCount`

Badges that needed a leader line.

A leader is drawn only by [the Phase 8 safety net](./10-edge-routing.md#the-safety-net-and-what-a-leader-line-means),
which fires only for a labelled edge that never received a `Label` item. So a nonzero value does not
mean "the drawing is crowded". It means **a Phase 4 reservation was missing** — the mechanism that
makes badge space correct by construction did not run for that edge.

Measured: **0 on every layered fixture.** No badge in the audit has ever needed a fallback.

---

## Where combinatorial and geometric crossings disagree

`crossings` and `geometricCrossings` are expected to agree, and a large gap used to be documented as
a bug. It is not, and the correction is worth recording because the reasoning generalizes.

Measured across the layered fixtures, sorted by channel depth:

| channel lanes | 1 | 1 | 2 | 3 | 3 | 6 | 10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| combinatorial | 0 | 0 | 0 | 0 | 0 | 6 | 28 |
| geometric | 0 | 0 | 0 | 2 | 2 | 6 | 44 |

The excess is **zero on every shallow-channel fixture** and appears only as channels deepen. That is
the signature of a structural property, not a defect: an edge descending to lane *k* must cross the
horizontal run of any shallower lane whose x-interval spans its descent. The combinatorial count
models order inversions between ranks and cannot see those crossings, because they happen inside a
channel that does not exist yet when the count is taken.

```text
   lane 0  ══════════════════════════════   another edge's horizontal run
                        │
   lane 1  ─────────────┼──────────────     this edge is still descending
                        │                   ↑ unavoidable crossing
                        ▼
```

This was **tested rather than assumed**. Swapping the lane-ordering heuristic — from the
direction-aware left-edge rule to plain ordering by left endpoint — moved the total across all
layered fixtures from 121 to 122. The lane *order* is not the lever. The lever is lane *count*, and
that is already the provable minimum (optimal interval-graph colouring).

The real improvement available is to make Phase 5's objective include horizontal span, not just
crossings: shorter spans mean shallower channels mean fewer routing artefacts. That is a change to
the ordering objective, not to the router.

---

## 8. Per-engine constraint policy

Here is the part that is easy to get wrong, and the v2 design got it wrong first.

The original spec said: fail on any nonzero constraint counter, for every engine. The TypeScript
audit implemented that literally and reported **34 failures**. The native audit, which only checked
`is_valid`, reported **none**. The gates disagreed — and the reason was that the policy was wrong,
not that one of the gates was buggy.

`EDGE_NODE_PENETRATION` and `BADGE_*_OVERLAP` are absent from the **layered** pipeline because
Phase 6 reserves a routing lane for every segment and the label item reserves badge area inside the
layered graph. Organic, radial and grid have neither. They draw a **straight line between two
boxes** — that is the specification for all three — so a line grazing a third box is a property of
straight-line drawing, not a defect in the layout.

So the two gates now encode the same split:

| counter | layered / left-right | organic / radial / grid |
| --- | --- | --- |
| `nodeNodeOverlaps` | **fail** | **fail** (overlap removal, grid, ring sizing all prevent it) |
| `unresolvedRouteCount`, `unresolvedBadgeCount` | **fail** | **fail** (no engine may drop an edge) |
| `edgeNodePenetrations` | **fail** | reported as best-effort |
| `badgeNodeOverlaps`, `badgeBadgeOverlaps` | **fail** | reported as best-effort |

The implementation is a small, explicit list in
[`7_2_organic.rs`](../../crates/gvui/src/7_engines/7_2_organic.rs), applied by the shared emit path
the three geometric engines use:

```rust
const SOFT_FOR_GEOMETRIC_ENGINES: [&str; 3] = [
    "EDGE_NODE_PENETRATION",
    "BADGE_NODE_OVERLAP",
    "BADGE_BADGE_OVERLAP",
];
```

Those diagnostics are **rewritten to `"warning"`** rather than deleted. The information is real and
useful — a reader may well want to know that three edges graze nodes — it just is not a failure. The
count of rewrites is what tells the status resolver the difference between "nothing went wrong" and
"something went wrong that this engine never promised to prevent". Everything else still fails hard:
overlapping node boxes, a port off its boundary, a missing route, a NaN. Those *are* invariants
these engines claim.

**Why this matters more than it looks.** Asserting a guarantee an engine never made would make the
gate useless — the default grid drawing of any wide graph would read as a broken layout, and after
the third false alarm nobody reads the gate at all. But "fixing" it by deleting the assertion would
make the gate dishonest, because the layered engine really does guarantee those things and a
regression there really is a bug. The only correct answer is to say which engine promises what, and
check each against its own promise.

---

## 9. Status

`resolve_status` maps the outcome onto three wire values:

| status | when |
| --- | --- |
| `invalid_hard_failure` | any diagnostic still has severity `"error"` — the drawing should not be trusted |
| `unresolved_soft_conflicts` | structurally sound, but something used a fallback the design intends to be rare: a leader line, or an ellipsized label (for the geometric engines, also any softened diagnostic or unresolved count) |
| `success` | neither |

Invalidity outranks any soft signal.

Alongside it, `OptimizationStats` carries execution metadata. The field names are preserved for
renderer compatibility and one of them is a fossil worth calling out:

| field | v2 meaning |
| --- | --- |
| `globalPasses` | ordering sweeps actually executed |
| `evaluatedPortStates` | ordering seeds evaluated |
| `spacingExpansions` | **always 0.** Spacing is exact — Phase 6 reserves it before any geometry exists — so nothing is ever widened after the fact. In v1 this counted retries |
| `stopReason` | `ordering-converged` (zero crossings), `time-budget`, or `local-optimum` |
| `timings` | per-phase milliseconds |

The time budget is measured against the **whole pipeline** rather than asked of the ordering phase.
"We ran out of time" is a property of the run, and measuring it this way keeps the reason honest
even when a later phase is the slow one.

---

## 10. What the gate caught

Four defects were found at integration that **393 passing unit tests did not see**, because each
unit tested its module against the same contract the module was built from — and in three of the
four cases the contract itself was wrong.

| # | defect | how it surfaced |
| --- | --- | --- |
| a | `isCycle` treated as a mandate rather than a bias → 249 ranks for 30 nodes and an out-of-bounds panic | first real dataset through the whole pipeline |
| b | the dummy-chain cap broke the adjacent-rank adjacency contract three phases relied on | first real dataset |
| c | [stale coordinate space](./09-coordinate-assignment.md#the-coordinate-space-trap) → 184 `EDGE_NODE_PENETRATION` errors | invariant assertions turned on |
| d | the constraint policy was wrong for the straight-line engines | **two independent gates disagreed** |

Three surfaced within minutes of running real data with the invariant assertions on. The fourth
surfaced only because two gates that should have agreed did not. That is the argument for having
both: a single gate can be confidently, silently wrong.

Final state:

```text
   1. Rust unit tests ........... 393 passed, 0 failed
   2. Rust audit ................ 40 fixture/engine combinations clean, slowest 1.74 ms
   3. WASM build ................ 663 KB (239 KB gzipped), exports verified
   4. TypeScript typecheck ...... 0 errors
   5. Lint (oxlint) ............. clean
   6. Frontend tests ............ 99 passed, 0 failed
   7. TS layout audit ........... 168 fixture/mode runs, 0 failures
   8. Production build .......... 172 ms, dagre chunk gone
```

Every one of the 40 fixture/engine combinations is valid, deterministic across processes, and within
budget. The slowest layout across all five engines and all eight datasets is **1.88 ms**.

---

## Further reading

- [The quality model](../concepts/quality-model.md) — the constraint/metric split stated on its own
- [Determinism](../concepts/determinism.md) — why every sort has a tie-break and no `HashMap` is
  ever iterated on a decision path
- [Computational complexity](../concepts/computational-complexity.md) — the cost of each phase

---

← [Edge Routing](./10-edge-routing.md) | [Index](./README.md) | [Next: Layout Modes →](../modes/README.md)
