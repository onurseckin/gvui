← [Determinism](./determinism.md) | [Concepts index](./README.md) | [Next: Computational complexity →](./computational-complexity.md)

# The Quality Model

## The question

How does a program decide whether a drawing is good?

The obvious answer is: count the flaws and add them up. Count crossings, count bends, count
overlaps, weight them, and minimise the total.

```text
   Score = 1000 * overlaps + 100 * crossings + 10 * bends + 1 * length
```

Then search: generate candidate layouts, score each one, keep the best.

This engine does none of that. **There is no objective function anywhere in the pipeline.** Instead
the quality of a drawing is split into two categories with completely different semantics:

| | Constraints | Metrics |
| --- | --- | --- |
| Status | Guaranteed by construction | Observed |
| When violated | It is a **bug in the engine** | It is information |
| Effect on the drawing | None — checked after the fact | None — measured after the fact |
| Consumed by | CI, the audit, bug reports | The developer panel, humans |

Understanding *why* it ended up this way requires looking at what came before.

---

## What v1 did, and why it failed

### Weighted sums are bad, and v1 knew it

The weighted-sum formula above has a well-known flaw. Suppose a layout has 0 overlaps and 11
crossings: penalty $11 \times 100 = 1100$. Another has 1 overlap and 0 crossings: penalty
$1 \times 1000 = 1000$. The arithmetic prefers the second — it would rather stack two nodes on top of
each other than draw eleven crossings. That is never what anyone wants. Certain flaws are *fatal* and
must not be tradeable for aesthetic gains, and no choice of weights fixes this in general; it only
moves the threshold at which the bad trade happens.

### So v1 used a lexicographic vector, which is a better idea

"Lexicographic" means sorting the way a dictionary does. Comparing "Apple" and "Axe", you do not
compute a weighted sum of letters — you look at the first letter, and only if it ties do you look at
the second. The first position has absolute priority over everything after it.

Apply that to a vector of flaws:

```text
   Layout A = [0 overlaps, 5 crossings]
   Layout B = [1 overlap,  0 crossings]

   position 0:  0 < 1   →  A wins, immediately.
                            The crossings are never even examined.
```

No weights, no tuning, no accidental trades. As a *comparator*, this is genuinely the right shape,
and it is why v1's `LayoutScore` was a 21-field lexicographic tuple with `hard_error_count` first,
then `unresolved_route_count`, node–node overlaps, edge–node penetrations, and so on down through
crossings, hairpins, bends, direction deviation, total length and total area.

### And that is exactly why it failed as a search objective

A comparator and an objective function are not the same thing. A search needs **gradient**: it needs
to be told that this candidate is *slightly better* than that one, so it knows which direction to
move. A lexicographic comparator gives no such signal.

Concretely, from the v1 diagnosis:

> `LayoutScore` is a 21-field lexicographic tuple compared field by field, with `hard_error_count`
> first. Until that is 0 the comparator is effectively a single boolean, so the search cannot
> distinguish "slightly better geometry" from "much worse geometry" and receives no gradient.

Picture the search space while `hard_error_count > 0`:

```text
   every candidate scores "BAD"
        ┌────────────────────────────────────────────┐
        │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │   ← a flat plateau:
        │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │     nothing to descend
        │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
        └────────────────────────────────────────────┘
                                 ▲
                    one lucky cell where it drops to 0
```

Twenty of the twenty-one fields are invisible until the first one reaches zero. The search is not
climbing a hill; it is wandering a plateau hoping to fall off it. Four supporting facts from the
measured diagnosis make the picture worse:

1. **The outer search evaluated only 4–8 states.** With 26.7 seconds spent across 6 evaluations,
   that is ~4.4 s per pipeline pass. The breadth was never the problem — one pass was.
2. **The neighbourhood generator had no direction either.** With no gradient to follow it rotated
   round-robin through unrelated move classes (flip a port side, swap two nodes in a rank, swap two
   ports, batch-repair a crossing component). Combined with 4–8 evaluations and a 4-second fitness
   function, this is random restart, not search.
3. **The objective was blind to most of the graph.** Only `Forward` edges entered the layer graph,
   so the crossing term was **0 on all eight datasets** — and `minimize_crossings` opened with an
   early return when crossings were 0. Crossing minimization never ran on real input. Separately,
   the crossing counter had no branch for edges spanning more than one rank, so long edges
   contributed 0 regardless.
4. **`state_hash: String` was one of the comparable fields.** A hash string as a tie-break inside an
   ordering used to select a drawing.

The result was a search whose quality moved *non-monotonically* with its own budget knobs. On
`dense_kubernetes_mesh`, reducing `initial_lane_rings` from 2 to 1 *improved* crossings from 206 to
146. On `kubernetes_cluster_topology`, disabling the 32-way conflict permutation loop was a 12×
speedup for a bit-identical result. A process whose answer moves randomly with its budget is not
converging — it is sampling.

And it could still ship a broken drawing and call it a result: `dense_kubernetes_mesh` came out with
`valid = false` and 191 crossings, because "invalid" was a number the search had tried and failed to
reduce, not a failure.

### The conclusion that removed the score

The score existed to serve the search. Once the design established that each phase can be made
correct by construction — labels as items so badge space cannot fail to fit, lane demand computed
exactly so routing cannot fail — **there was no search left, and therefore no consumer for a
score**.

So the score was not replaced with a better score. It was deleted, and its two jobs were separated:

- The things it was *asserting* became **constraints**, checked exhaustively and reported as bugs.
- The things it was *measuring* became **metrics**, reported and never read back.

---

## Constraints: guaranteed, then verified

Phase 9 runs [`check_constraints`](../../crates/gvui/src/6_validation/6_1_constraints.rs). Its module
documentation states the relationship precisely:

> Every invariant checked here is *guaranteed by construction* by an earlier phase: Brandes–Köpf
> separations forbid node overlap, lane demand reserves the space every routed segment needs, and
> label items reserve badge area inside the layered graph itself. So a diagnostic produced by this
> module is a **bug report about the engine**, never an input to a score.

The checks and what guarantees each:

| Code | What it detects | Guaranteed by |
| --- | --- | --- |
| `NON_FINITE_COORDINATE` | a NaN or infinity in any node box, route point, port or badge | every phase's arithmetic |
| `NODE_NODE_OVERLAP` | two node boxes sharing interior area | Phase 7 Brandes–Köpf separations, fed by Phase 6 `separation_min` |
| `EDGE_NODE_PENETRATION` | a routed segment crossing a node's interior | Phase 6 reserving a lane for every segment |
| `BADGE_NODE_OVERLAP` | a badge box over a node box | Phase 4 label items + Phase 7 separation |
| `BADGE_BADGE_OVERLAP` | two badge boxes overlapping | same |
| `NON_ORTHOGONAL_SEGMENT` | a segment that is neither horizontal nor vertical | Phase 8 building polylines from axis-aligned steps |
| `ENDPOINT_OFF_BOUNDARY` | a port that is not on its node's boundary | Phase 8 deriving ports from the box |
| `MISSING_ROUTE` | an expected edge id with no route | Phase 8 totality — routing cannot fail |

`NON_FINITE_COORDINATE` is checked first on purpose: a NaN poisons every comparison below it, so
knowing it is present is what makes the rest of the report interpretable. `NON_ORTHOGONAL_SEGMENT`
is skipped for the three edge styles that are diagonal by design: `Spline`, `Straight` and
`Octilinear` — the last of these emits a 45° segment in place of every corner it managed to cut, so
"non-orthogonal" is the outcome it was asked for rather than a defect.

Three implementation details that follow from "this is a bug report, not a score":

- **Every diagnostic has severity `"error"`.** There is no such thing as a tolerable violation.
  (Ingest also emits `DUPLICATE_NODE`, `DUPLICATE_EDGE` and `UNKNOWN_ENDPOINT`, but those are
  `"warning"` — they describe bad *input*, not a bad engine, and they do not make a layout invalid.)
- **At most 32 diagnostics are formatted per code** (`MAX_REPORTS_PER_CODE`). A structurally broken
  layout can violate one invariant thousands of times, and formatting all of them would make the
  failure path cost more than the layout. The *counts* are unaffected — `LayoutMetrics` carries the
  full totals.
- **The checks are cheap enough to leave on.** v1's validator had no spatial index anywhere:
  $O(N^2)$ node–node, $O(E \cdot S \cdot N)$ edge–node, $O(E^2 S^2)$ shared-segment, and it allocated
  a `format!` diagnostic string for every violation *even when called purely as a scoring probe
  inside the router's inner loop*. v2 routes every pairwise question through a uniform
  `SpatialHash`, which makes the whole pass linear in practice. It runs on every layout.

  (The `assertConstraints` config field exists on the wire and is merged into `CustomLayoutConfig`,
  but no code currently reads it — the checks run unconditionally. The knob is a vestige of the
  design that expected them to be too expensive for release builds.)

### `is_valid` and `status`

```rust
let is_valid = !diagnostics.iter().any(|d| d.severity == "error");
```

and the three-state status:

| `status` | Meaning |
| --- | --- |
| `success` | Valid, and no fallback was needed. |
| `unresolved_soft_conflicts` | Valid, but `leader_count > 0` or `labels_truncated > 0` — the drawing is structurally sound and something was resolved by a fallback the design intends to be rare. |
| `invalid_hard_failure` | An invariant the engine guarantees was violated. Do not trust the drawing. |

Note what is *not* here: there is no "valid but ugly" state, because ugliness is not a constraint.

### The per-engine constraint policy

Not every engine makes every promise, and the audit encodes that split. This was the subtlest bug
found during integration: the original spec told the audit to fail on any non-zero constraint counter
**for every engine**, the TypeScript gate implemented that literally and reported 34 failures, the
native gate only checked `is_valid` and reported none. The two gates disagreed because the *policy*
was wrong, not because either was buggy.

Since v3 there are two engines, and the split is between them.

`EDGE_NODE_PENETRATION` and the badge overlaps are guaranteed absent in the **layered** pipeline
because Phase 6 reserves a routing lane for every segment and the label item reserves badge area.
**Radial** has neither mechanism. It places boxes on concentric rings and draws a direct line
between two of them, so a line grazing a third box is a property of straight-line drawing rather
than a defect; and its badge placement is an explicitly local pass that tries
`BADGE_CANDIDATES` positions and then announces its own failure with a leader line. See
[`7_2_geometric_common.rs`](../../crates/gvui/src/7_engines/7_2_geometric_common.rs).

```text
   layered                          radial

   [A]                              [A]
    │                                 ╲
    │  ← the lane was counted           ╲   ← a straight line between two
    │     before this channel had        ╲     boxes; a third box may sit
   [C]     any y coordinate         [C]   ╲    anywhere along it
    │                                      ╲
   [B]                                     [B]
```

Asserting a guarantee an engine never made would have made the gate useless; deleting the assertion
to make it pass would have made it dishonest. Both gates encode the same split:

| counter | `layered` (any `direction`) | `radial` |
| --- | --- | --- |
| `nodeNodeOverlaps` | **fail** | **fail** — ring sizing and overlap removal both prevent it, so a non-zero value is still a bug |
| `unresolvedRouteCount`, `unresolvedBadgeCount` | **fail** | **fail** — no engine may drop an edge or a badge |
| `edgeNodePenetrations` | **fail** | reported, best-effort |
| `badgeNodeOverlaps`, `badgeBadgeOverlaps` | **fail** | reported, best-effort |

Note that the split is by **engine**, not by direction. `left-right` and `bottom-up` are the layered
pipeline with the frame transposed and/or mirrored; they make every promise `top-down` makes and are
held to all of them.

The two gates and what each covers:

| gate | cases | fixtures | runs |
| --- | --- | --- | ---: |
| [`crates/gvui/examples/audit.rs`](../../crates/gvui/examples/audit.rs) | `layered`/`top-down`, `layered`/`left-right`, `layered`/`bottom-up`, `radial` | 10 datasets in `public/data/graphs/` | 40 |
| [`scripts/runLayoutAudit.ts`](../../scripts/runLayoutAudit.ts) | `layered`/`top-down`, `layered`/`left-right`, `radial` | the same 10 datasets **plus** 26 graph-testing scenarios | 108 |

The native harness runs the Rust directly and also checks a per-fixture time budget; the TypeScript
gate runs the compiled WASM through the same measurement path the browser uses, which is what makes
it the acceptance gate. Both currently report zero failures.

---

## Metrics: reported, never optimised

[`compute_metrics`](../../crates/gvui/src/6_validation/6_2_metrics.rs) measures the finished
drawing. Its first line of documentation is the whole contract: *"Nothing here influences the
drawing."*

Every field of `LayoutMetrics`:

### Quality

| field | meaning |
| --- | --- |
| `crossings` | Phase 5's exact combinatorial count, from the Barth–Mutzel–Jünger accumulator tree over the final item ordering. |
| `geometric_crossings` | Proper intersections between emitted polylines, found by a sweep over the actual geometry. |
| `bend_count` | Interior vertices of each route after collinear points are removed — a collinear vertex is an artefact of materialisation, not a bend a reader can see. |
| `total_length` | Manhattan length summed over all routes. |
| `straight_chain_ratio` | Fraction of multi-rank edge chains whose interior items all share one centre $x$. Chains with no interior item are excluded from both numerator and denominator; with no qualifying chain the value is 1.0. |
| `area`, `aspect_ratio` | Bounding box of nodes, route points and badges. `aspect_ratio` is 1.0 when the height is 0. |
| `lane_depth_max` | The widest routing channel or corridor. A large value means the ordering is fighting the topology. |
| `port_side_balance` | Mean over nodes of $1 - \lvert top - bottom \rvert / \max(1, total)$. 1.0 means every node's edges split evenly between its top and bottom; 0.0 means everything attaches to one side. A node with no ports scores 1.0. |

### Health

| field | meaning |
| --- | --- |
| `leader_count` | Badges that needed a fallback leader line. Should be 0; a non-zero value means a Phase 4 reservation was defeated. |
| `labels_truncated` | Labels that hit `max_label_lines` and were ellipsized. Detected by the trailing `…` on the badge's display string — by Phase 9 the original text is long gone. |

### Shape

| field | meaning |
| --- | --- |
| `node_count`, `edge_count` | Nodes emitted, routes emitted. |
| `rank_count`, `dummy_count` | 0 under `radial`, which builds no layered graph. |

### Constraint counters

`node_node_overlaps`, `edge_node_penetrations`, `badge_node_overlaps`, `badge_badge_overlaps`,
`unresolved_route_count`, `unresolved_badge_count`. These duplicate the constraint checks as *full*
counts (the diagnostics are capped at 32 per code). Their documented status in the source is blunt:
*"any nonzero value is a bug, not a score."*

### The two to watch

`straight_chain_ratio` and `leader_count`, and the reason they are separate numbers rather than
blended into one:

> `straight_chain_ratio` dropping means Brandes–Köpf's dummy-chain alignment is being defeated, and
> `leader_count` rising means a label item's reserved area was not respected. Both are structural
> failures that a single aggregate score would hide, which is precisely why they are reported
> separately instead of being blended into one figure.

Measured today, from the native audit: `straight_chain_ratio` is 1.00 on nine of the ten layered
datasets and 0.79 on `microservice_platform_topology` (identically in all three directions);
`leader_count` is **0 on every layered fixture in every direction**. Radial reports leaders on three
datasets — 1, 2 and 4 — which is expected rather than a regression: radial has no layered structure
in which to reserve label space, so its badge pass is allowed to fall back, and the fallback is
exactly what `leader_count` exists to make visible.

---

## Combinatorial versus geometric crossings

The two crossing counts measure different things and are reported separately rather than reconciled.

`crossings` counts **order inversions between adjacent ranks**: given the final item ordering, how
many pairs of edges must cross. `geometric_crossings` counts **actual intersections of the emitted
polylines**.

The source comment in `6_2_metrics.rs` says the two are expected to agree and that a large gap means
routing introduced crossings the ordering had resolved. Measurement refined that. From
[`06-results.md`](../planning/layout-engine-v2/06-results.md), across the layered fixtures:

| channel lanes | 1 | 1 | 2 | 3 | 3 | 6 | 10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| combinatorial | 0 | 0 | 0 | 0 | 0 | 6 | 28 |
| geometric | 0 | 0 | 0 | 2 | 2 | 6 | 44 |

The excess is **zero on every shallow-channel fixture** and only appears as channels deepen. That is
the signature of a structural property, not a defect:

```text
   an edge descending to lane 2 must cross the horizontal run of lane 0,
   if lane 0's x-interval spans its descent:

   ───────────────┬────────────────────  lane 0   ← this run
                  │
   ───────────────┼────────────────────  lane 1
          ╷       │
   ───────┼───────┼────────────────────  lane 2
          │       │
          ▼       ▼
        the descent crosses lane 0's run — a real crossing in the drawing,
        invisible to a count of order inversions between ranks
```

This was tested rather than assumed. Swapping the lane-ordering heuristic (direction-aware left-edge
→ ordering by left endpoint) moved the total across all layered fixtures from 121 to 122 — so the
lane *order* is not the lever. The lever is lane *count*, which is already the provable minimum from
interval-graph colouring.

The real improvement available is to make Phase 5's objective include horizontal span, not just
crossings: shorter spans mean shallower channels mean fewer routing artefacts. That is a change to
the *ordering* objective, not to the router.

---

## The rule, restated

> **Constraints are asserted. Metrics are reported. Nothing is optimised.**

If a number can change the drawing, it is a constraint and it is enforced by construction upstream.
If it cannot, it is a metric and it exists for a human to read. There is no third category, and
there is no function anywhere that a candidate layout is scored against — because there are no
candidate layouts.

`OptimizationStats::spacing_expansions` is a good epitaph. The field is still on the wire for
renderer compatibility, and it is documented as: *"Always 0 in v2; spacing is exact, never expanded
by retry."*

---

← [Determinism](./determinism.md) | [Concepts index](./README.md) | [Next: Computational complexity →](./computational-complexity.md)
