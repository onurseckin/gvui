# Layout Engine v4 — Edge Crossing Reduction

v2 fixed performance and correctness. v3 fixed the drawing's appearance and the controls. This round
is about one number: how many edges cut across each other.

The request was specific — _"minimize the number of edges intersecting on their path to one another
as much as possible"_ — and came with a proposed mechanism: use all four sides of every node, and let
an edge change where it departs and arrives when it is about to cut another edge.

The mechanism turned out to be wrong for this router. The goal turned out to be very achievable
anyway, by a different route. Both halves are recorded here, because the negative result is the more
useful one to keep.

---

## 1. Measure first

The engine already reported two crossing counts: `crossings` (Phase 5's exact combinatorial count)
and `geometricCrossings` (measured from the emitted polylines). They are supposed to agree. They did
not.

| dataset                          | combinatorial | geometric |   excess |
| -------------------------------- | ------------: | --------: | -------: |
| `fanout_fanin_scatter_gather`    |         **0** |    **82** |      +82 |
| `peer_mesh_service_registry`     |             9 |        29 |      +20 |
| `microservice_platform_topology` |            14 |        22 |       +8 |
| `parallel_bundle_transports`     |             0 |         8 |       +8 |
| `long_span_bypass_network`       |             3 |         5 |       +2 |
| **total (layered)**              |        **28** |   **148** | **+120** |

A pure scatter-gather — one coordinator, fifteen shards, one reducer — has **zero** crossings in the
layered ordering and **eighty-two** in the drawing. The ordering phase was doing its job perfectly and
routing was manufacturing crossings out of nothing.

Classifying all 148 by the orientations of the two segments that met:

```
H×V = 148     H×H = 0     V×V = 0
```

Every single one is a horizontal channel run cut by another edge's vertical drop. That is not a
distribution, it is a mechanism, and it made the rest of the work tractable.

## 2. The diagnosis

Every route crosses a channel as a Z: drop at `from_x`, run horizontally at its lane's y, drop again
at `to_x`. Two Zs in one channel can only meet where one's run passes the other's drop — runs never
meet runs (different lanes are different y; same-lane runs are x-disjoint), drops never meet drops
(different x). **So the crossing count is a pure function of the lane order.**

Phase 6 assigns lanes by colouring intervals in **order** space, because it runs before any
coordinate exists — and that is the bug. Order is not a proxy for x _across_ ranks: item 0 of a
fifteen-wide rank of shards and item 0 of the one-wide rank holding their reducer are both "order 0"
and a thousand pixels apart. Two segments Phase 6 believes are disjoint can overlap for most of the
drawing's width.

Worse: a segment whose two items share an order index looks _vertical_ to the sweep, is excluded from
the colouring as needing no lane, and lands in lane 0 on top of whatever is already there. That
produced **14 pairs of edges drawn along the same line**, one overlapping for 1226 px — a defect the
crossing detector could not see at all, because two collinear edges do not _intersect_, they _merge_.

## 3. The fix

Split the two questions Phase 6 was answering at once:

| question                                        | phase | why there                                     |
| ----------------------------------------------- | ----- | --------------------------------------------- |
| **How much** routing space does a channel need? | 6     | Phase 7 needs it before it can place anything |
| **Which** lane does each segment take?          | 8     | needs the coordinates Phase 7 produces        |

Phase 6's count is unchanged and still binding. The new pass only permutes and packs _within_ the
space that reservation bought, so the "routing cannot fail" guarantee is untouched.

Three pieces, in order of contribution:

1. **Coordinate-space lane assignment** (`5_7_lane_order.rs`). Order the segments by the exact
   pairwise cost via adjacent-swap descent, then pack. A fan-in wants its longest run deepest; a
   fan-out wants the exact opposite — so the order is derived from the cost function rather than from
   any hand-picked sort key. The cost also charges a **merge** (weight 4) when one edge leaves the
   channel at the x another enters it.
2. **Port destination affinity** (`5_1_ports.rs`). Place each port as near the x it is heading for as
   the sorted order and `port_pitch` allow, instead of spreading ports evenly. Optimal, not
   heuristic: shifting by `i · pitch` turns the separation constraint into monotonicity, making it
   isotonic regression, solved exactly by pool-adjacent-violators.
3. **A crossing-aware side score**. The side choice is charged only for the crossings the lane phase
   _cannot_ remove — the pairwise minimum. Charging it for the rest would be double-counting.

## 4. Result

|                               |  before |   after |
| ----------------------------- | ------: | ------: |
| geometric crossings (layered) |     148 |  **40** |
| combinatorial crossings       |      28 |      28 |
| merged (collinear) edge pairs |      14 |   **0** |
| bends                         |     432 | **368** |
| slowest fixture               | 1.17 ms | 1.21 ms |

`fanout_fanin_scatter_gather` goes 82 → **0**. `parallel_bundle_transports` 8 → **0**. The remaining
40 sit against a measured pairwise lower bound of 28 for the given port positions, so most of what is
left is genuinely structural.

Collinear overlap is now a reported metric (`collinearEdgeOverlaps`) and a hard gate in the audit for
the layered engines, so this class of defect cannot come back silently.

## 5. The negative result: four-side attachment

The proposed mechanism was to use all four node sides. It is now implemented, configurable, and
**measurably counterproductive**:

| `flowSideBias`    | ports on a side face | geometric crossings |   bends |
| ----------------- | -------------------: | ------------------: | ------: |
| **1.0 (default)** |            **5.1 %** |              **40** | **368** |
| 0.0               |                5.1 % |                  40 |     368 |
| −1.0              |               15.4 % |                  69 |     404 |
| −1.5              |               44.0 % |                 146 |     508 |

Two independent reasons, both structural rather than incidental:

- **A side attachment always costs one more corner.** The route has to step out of the face
  horizontally before it can descend into its channel. In a Z-router, attaching to a node's side never
  saves a corner — it costs one. So at any bias `>= 0`, including `0`, the flow faces win.
- **A side port cannot hug its destination.** It is forced to drop at a fixed x just outside the
  node, while a flow-face port is placed at very nearly the x the edge is heading for. Longer run,
  and a longer run is a wider window for other edges' drops to cut it. This is why side usage makes
  crossings _worse_ — it directly undoes §3.2.

The setting is shipped anyway, defaulting to the measured-best value, because "which of these looks
better" is not a question the numbers can settle. What the numbers can settle is what it costs, and
that is now documented at the setting itself rather than left to be rediscovered.

Two things did survive from that line of work and are worth keeping:

- `sideFaceCapacity` — vertical faces used to be capped at one port because they all descended at the
  same x. Descent lines are now staggered by `port_pitch`, so the cap is a setting.
- The `residual` term in the side score genuinely helps _when sides are in play_: at bias −1.0 it
  saves 17 crossings (86 → 69). It is inert at the default only because one face is feasible there.

## 6. What was not attempted

Genuine four-side routing — where an edge can leave sideways, travel at its own y, and route _around_
intervening nodes — is a different router. It would mean giving up the lane model, and with it the
interval colouring that guarantees the drawing has room for every edge before any geometry exists.
That guarantee is what makes this engine one-pass and unable to fail. Trading it for side attachment
that measurably increases crossings is not a trade worth making, and this document exists so that
conclusion has evidence attached rather than being re-litigated from intuition.

## 7. New settings

| setting                   | default | effect                                                                  |
| ------------------------- | ------- | ----------------------------------------------------------------------- |
| `crossingAwareLanes`      | `true`  | the §3.1 pass; off restores order-space assignment                      |
| `laneOrderMaxSegments`    | `1024`  | per-channel size above which the optimiser is skipped                   |
| `portDestinationAffinity` | `true`  | the §3.2 placement; off restores even distribution                      |
| `sideFaceCapacity`        | `2`     | ports one left/right face may carry                                     |
| `flowSideBias`            | `1.0`   | now **signed** — negative buys side attachment at the price of a corner |
