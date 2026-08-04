← [Foundations](./01-foundations.md) | [Index](./README.md) | [Next: Ingest and Measurement →](./03-ingest-and-measurement.md)

# The Pipeline

This is the chapter that explains the engine. Everything after it is detail.

The engine is ten phases in a straight line with no loop around them. That sounds like a modest
architectural preference. It is not — it is the difference between a 30-node graph taking 47
seconds and producing an invalid drawing, and the same graph taking 1.79 ms and producing a valid
one. Both numbers were measured on the same machine with the same dataset. This chapter explains
where the 26,000× went.

---

## 1. The obvious way to draw a graph

Suppose you have never done this before and you write down the steps you would take. They come out
something like this:

```text
   1. Decide which row each node goes in.
   2. Decide where in the row each node goes.
   3. Turn that into pixels: give every node an (x, y).
   4. Draw a line from each source node to each target node,
      going around any node that gets in the way.
   5. Put each edge's label somewhere on or near its line.
   6. Look at the result. Did anything overlap?
        - a label landed on top of a node        → widen the gap and go back to 3
        - two labels landed on top of each other → widen the gap and go back to 3
        - an edge could not find a way through   → widen the gap and go back to 3
        - too many edges crossed                 → change some choices and go back to 2
```

Every instinct says this is right. It is how a person would do it by hand: draw, look, adjust,
redraw. And steps 1 through 5 are all genuinely necessary. The problem is step 6.

Here is the same thing as a picture, which makes the shape of the problem visible:

```text
       ┌──────────────────────────────────────────────────────┐
       │                                                      │
       ▼                                                      │
   ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐   ┌──────┴──────┐
   │  rank  │──▶│ order  │──▶│ coords │──▶│ route  │──▶│   validate  │
   └────────┘   └────────┘   └────────┘   └────────┘   └─────────────┘
       ▲                                       │              │
       │                                       ▼              │
       │                                  ┌────────┐          │
       └──────────────────────────────────│ labels │◀─────────┘
                                          └────────┘
```

That is the previous version of this engine, drawn honestly. Three back-edges. Everything that
follows is about why each one had to go.

## 2. Why the loop is fatal

### 2a. The costs multiply instead of adding

In a straight pipeline, total cost is the *sum* of the phases. A slow phase costs you what it
costs.

In a pipeline with a retry loop, the phases inside the loop are multiplied by the number of
iterations, and if loops are nested, by the product of all of them. v1 had three nested retry
mechanisms inside routing alone:

```text
   for each of up to 4 edge-orderings:          ×4
     for each of up to 12 rip-up passes:        ×12
       for each of up to 32 conflict perms:     ×32
         route every edge with A*
         validate the whole drawing             ← O(E²), allocating a diagnostic string
                                                  per violation, called as a scoring probe
```

That is up to 1,536 full routings and 1,536 full validations for a single evaluation of a single
candidate layout. Measured by sweeping the budget knobs against *fixed* node positions on
`kubernetes_cluster_topology` — **12 nodes, 13 edges** — so that only routing varies:

| configuration | routing time |
| --- | ---: |
| defaults (4 variants × 12 rip-up × 32 permutations) | 7,466 ms |
| 1 variant | 1,810 ms |
| 1 variant, 1 permutation | **150 ms** |

The permutation loop cost **12×** and produced a byte-identical result: the same 13 routes, the
same 4 crossings, equally valid. It was doing nothing except being expensive.

The single-pipeline-pass number is the one that really matters. On that 12-node graph the whole
engine took **26,710 ms** while its outer search evaluated only **6 candidate states**. That is
about 4.4 seconds *per single pass*. The outer search breadth was never the problem. One pass was
the problem.

Phase-level instrumentation of one pass:

```text
   kubernetes_cluster_topology (12 nodes, 13 edges)
     cycle    0.18 ms
     rank     0.03 ms
     crossmin 0.02 ms
     layer    0.19 ms
     coord    0.16 ms
     ROUTE    4979.20 ms      ← 99.5 % of everything
     badge    6.00 ms
     validate 0.10 ms
```

Routing was 99.5 % of the cost, and routing was inside the loop.

### 2b. The search had nothing to steer by

The second failure is subtler and, in the long run, worse.

A retry loop only helps if each retry is *better informed* than the last. v1's loop scored a
candidate drawing with a 21-field lexicographic tuple, compared field by field, with
`hard_error_count` first. Until that field reaches zero, the comparator is effectively a single
boolean: "still broken" versus "still broken". It cannot distinguish *slightly* worse geometry from
*catastrophically* worse geometry, so it gives the search no gradient — no sense of which direction
is uphill.

With no gradient and a budget of 4 to 8 evaluations of a 4-second fitness function, what remains is
random restart. And the tell is measurable: **quality moved non-monotonically with the budget
knobs.** On `dense_kubernetes_mesh`, lowering `initial_lane_rings` from 2 to 1 — strictly *less*
routing freedom — *improved* the crossing count from 206 to 146.

> A search whose quality moves randomly with its budget knobs is not converging. It is sampling.

### 2c. The bottom line

The two datasets that hurt most, measured end to end:

| dataset | N | E | v1 | v2 | speedup | v1 crossings | v2 crossings | v1 valid | v2 valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--: | :--: |
| `kubernetes_cluster_topology` | 12 | 13 | 26,710 ms | **0.14 ms** | 190,785× | 2 | 0 | ✓ | ✓ |
| `dense_kubernetes_mesh` | 30 | 45 | 47,336 ms | **1.79 ms** | 26,445× | **191** | 28 | **✗** | ✓ |

The second row is the important one. After 47.3 seconds, the 30-node graph came out with 191
crossings **and was still invalid** — it had overlaps the engine had detected, tried to fix, and
failed to fix. Spending 47 seconds and failing is the honest summary of what a retry loop buys you.

There is a third thing that number hides. Because ranking had been fed the wrong input, that
dataset was laid out as **2 ranks with 28 of its 30 nodes in a single row**. Almost all of those
191 crossings and almost all of those 20 seconds of routing existed because 28 boxes in one row
means every edge has to travel enormous horizontal distances past every other edge. The router was
being asked to rescue a layout that the combinatorial phases should have gotten right and never
did. With the same data ranked correctly, the drawing has **15 ranks**.

That is the general shape of the failure. **A retry loop lets earlier phases be sloppy, because
"the loop will fix it".** The loop cannot fix it. It can only pay for it.

---

## 3. The inversion: constraints flow forward

The v2 rule is one sentence:

> **Every phase produces a result that is correct by construction with respect to the constraints
> its successors cannot repair.**

No phase may rely on being called again. If a later phase would have to reject a decision, the
decision must be made with enough information not to need rejecting.

Applying that to the three back-edges in the diagram above:

| v1 back-edge | Why it existed | What replaces it |
| --- | --- | --- |
| "a badge does not fit → widen and re-run" | Badge area was discovered only after routing | **Label items** — badge area is allocated during layering, §3a |
| "an edge could not route → rip up and retry" | Routing space was discovered only by trying | **Lane demand** — space is computed before coordinates, §3b |
| "too many crossings → flip a port and re-route" | Crossings were measured on geometry | Crossings are resolved **combinatorially**, before geometry exists |

The third is the easiest to state: crossings are a property of the *order* of items within ranks,
not of pixels. Fix the order first, count the crossings on integers, and there is nothing for the
geometry to repair. That is [Phase 5](./07-crossing-minimization.md), and it is the only phase in
the engine that searches.

The first two are the interesting ones.

### 3a. The label-item trick

The naive model of an edge label is "decoration attached to a line". Under that model, you route
the line first and then hunt for somewhere the label will fit — which means the hunt can fail,
which means you need a retry.

The v2 model is: **a label is a box that needs area, so make it an item in the layered graph.**

Recall from [Foundations](./01-foundations.md#dummy-nodes) that a long edge is already broken into
a chain of dummy items, one per intermediate rank. Ingest gives every labelled edge
$\texttt{min\_len} = 2$ instead of the usual 1, and Phase 3 honours that as a hard constraint — so a
labelled edge always spans at least two ranks and always has at least one intermediate rank to work
with. Phase 4 then puts the label on the middle one — not as a zero-size dummy, but as an item
carrying the badge's measured width and height:

```text
   BEFORE  (edge A → B carries the label "retry ×3")

     rank 0     [    A    ]
                     │
                     │                    where does the badge go?
                     │                    only the router knows, and only afterwards
     rank 1     [    B    ]


   AFTER   (min_len = 2 forces an intermediate rank; the label lives on it)

     rank 0     [    A    ]
                     │
     rank 1     ┌────┴───────────────┐
                │   ┌──────────────┐ │    a Label item:
                │   │  "retry ×3"  │ │    an ordinary item with a real measured box
                │   └──────────────┘ │
                └────┬───────────────┘
                     │
     rank 2     [    B    ]
```

Every consequence of that is free, because the machinery already exists and does not know it is
looking at a label:

| Machinery that already existed | What it now does for badges |
| --- | --- |
| Phase 5 orders items within a rank | Chooses the badge's horizontal position to minimize crossings |
| Phase 7 separates adjacent items by `node_gap` | Keeps the badge clear of its neighbours |
| Rank height is $\max(\text{item.height})$ over the rank | Makes the row tall enough for the badge by definition |
| Phase 8 needs badge geometry | Reads it off the item's box — a lookup, not a search |

**The area is reserved by construction. A badge therefore cannot fail to fit. There is nothing to
retry.** In v1 the equivalent code — candidate generation, geometric scoring, a disjoint-set
conflict graph doing up to $48^2 = 2{,}304$ conflict tests per badge pair, and a backtracking search
that built a formatted state-key string at every node of its DFS — was 1,003 lines. It is now a
table lookup.

The item is deliberately *larger* than the badge, which is what lets the badge sit beside the line
rather than on top of it. With $lw = \text{label.width} + 2 \times \texttt{badge\_clearance}$ and
$lh = \text{label.height} + 2 \times \texttt{badge\_clearance}$:

| `label_placement` | item size | edge passes through | badge occupies |
| --- | --- | --- | --- |
| `on-edge` | $(lw,\ lh)$ | the item's centre | the whole box, inset |
| `beside-edge` *(default)* | $(2 \cdot lw,\ lh)$ | the item's **left face** | the **right half**, inset |
| `above-edge` | $(lw,\ 2 \cdot lh)$ | the item's **bottom face** | the **top half**, inset |

Drawn, for the default `beside-edge`:

```text
                ┆  the polyline runs down the item's LEFT face
                ▼
                ┌─────────────────┬─────────────────┐
                │                 │  ┌───────────┐  │
                │   left half     │  │ "retry ×3"│  │   ← the badge, inset by
                │   stays empty   │  └───────────┘  │     badge_clearance (10 px)
                │                 │                 │
                └─────────────────┴─────────────────┘
                ┆
                ▼  and continues down to rank r+1

                │←───── lw ─────→│←───── lw ─────→│
                          item width = 2 · lw
```

See [the implementation](../../crates/gvui/src/3_crossing_minimization/3_1_layer_builder.rs), and
[06 — Layering and Labels](./06-layering-and-labels.md) for the full treatment including flat edges
and self-loops, which get their badge space by a different but equally forward mechanism.

The measured claim: `leader_count` — the number of badges that needed a fallback leader line
because their reservation was defeated — is **0 on every layered fixture**. Not "small". Zero. So is
`spacing_expansions`, the counter that used to record how many times the engine widened a gap and
started over; it is now structurally always 0 and survives only for renderer compatibility.

### 3b. Lane demand: computing routing space before geometry exists

The second trick is the one that deletes the router.

v1's router was a bounded A\* search over a grid built from the Cartesian product of every
interesting $x$ and $y$ coordinate: node bounds, port positions, and concentric "lane rings" around
every node. For a **12-node** graph that grid had 86 distinct $x$ values and 65 distinct $y$ values,
giving **4,934 live vertices**; instrumented end to end on the same dataset it reported 5,328
vertices and 10,294 grid edges. Each A\* expansion did a string-keyed hash
lookup, a second hash lookup, a string clone, and a linear scan over every node rectangle to test
whether the cell was blocked. One edge cost 25–65 ms. Then the results were committed to an
occupancy ledger whose commit routine re-split *every existing reservation* against a fresh point
set, with an $O(k^2)$ dedup inside; per-commit cost grew from 0 ms to 24 ms as the reservation count
climbed to 3,276.

And all of that machinery existed to answer one question: *how much room do the edges need?*

The v2 answer is that you do not need geometry to answer it. Consider what a route between two
adjacent ranks actually is, once the ordering is fixed:

```text
       order:   0        1        2        3

   rank r    [ A ]    [ B ]    [ C ]    [ D ]
               │        │        │        │
               │        │        │        │        ← every route leaves downward,
     ══════════╪════════╪════════╪════════╪══        runs horizontally somewhere in
     CHANNEL r │        │        │        │          the channel between the two ranks,
     ══════════╪════════╪════════╪════════╪══        then descends into its target
               │        │        │        │
   rank r+1  [ W ]    [ X ]    [ Y ]    [ Z ]
```

The route for edge `A → Z` has to run horizontally across the channel from order 0 to order 3. The
route for `B → X` runs from order 1 to order 2. The route for `C → W` runs from order 0 to order 2.
Those horizontal extents are **intervals on the order axis** — and orders are integers that already
exist. No pixel is involved.

Now the whole problem becomes: *how many horizontal lines do I need to stack in this channel so
that no two of them overlap?* Which is exactly graph colouring on the intervals:

```text
   order:        0        1        2        3

   A → Z    [════════════════════════════════]     interval [0, 3]
   C → W    [══════════════════════]                interval [0, 2]
   B → X             [═════════════]                interval [1, 2]

   maximum overlap depth at any point = 3   →   3 lanes needed

   the channel, coloured:

                 ┌────────────────────────────┐
     lane 0      │════════════════════════════│   A → Z
     lane 1      │══════════════════════      │   C → W
     lane 2      │         ═════════════      │   B → X
                 └────────────────────────────┘
                 3 lanes × lane_spacing (12 px)  +  2 × port_stub_length (20 px)
                 = 76 px of channel height required by routing
```

76 px is what the *routes* demand. The gap actually used below rank $r$ is
$\max(\texttt{rank\_gap},\ 76)$, and at the default `rank_gap = 120` the aesthetic gap wins here —
which is the normal case. The routing figure only takes over once a channel is deep: at 9 lanes it
reaches $9 \times 12 + 40 = 148$ px and the band grows to accommodate it. Either way the value is
known **before** any $y$ coordinate is chosen.

This computation is **exact, not a heuristic**, and the reason is a fact about interval graphs.
An interval graph is a graph whose nodes are intervals and whose edges join overlapping intervals.
Interval graphs are **perfect**, which means their chromatic number equals their maximum clique
size. For intervals the maximum clique is just the deepest point of overlap, $\omega$. So greedy
colouring in order of left endpoint uses exactly $\omega$ colours — and $\omega$ is a lower bound,
because $\omega$ intervals mutually overlapping obviously cannot share fewer than $\omega$ lanes.

$$\text{lanes needed} = \text{lanes used by greedy} = \omega$$

Not "close to". Equal. So the space derived from it is **exactly sufficient — never too small, so
routing cannot fail, and never larger than necessary, so no whitespace is wasted.**

The algorithm is a sweep, $O(k \log k)$ per channel:

```text
   sort segments by left endpoint
   active = min-heap keyed by right endpoint, holding freed lane ids
   for each segment in order:
       pop every active segment whose right endpoint < this one's left endpoint,
           returning its lane to the free list
       lane = free_list.pop()  or  lanes++
       lane_of[segment] = lane
```

The same idea handles the sideways direction. A **corridor** is the vertical band between two
adjacent items *within* a rank, where flat edges (both endpoints on the same rank) run:

```text
   rank r    [ A ]  ║  [ B ]  ║  [ C ]
                    ║         ║
                    ║ corridor between orders 1 and 2
                    ║  — every flat edge here overlaps every other,
                    ║    so lanes = segment count, trivially exact
```

The output of all this is [`RoutingDemand`](../../crates/gvui/src/0_common/0_1_types.rs), and its
two load-bearing fields are minimum separations handed to Phase 7:

$$\texttt{rank\_gap\_min}[r] = \max\big(\texttt{rank\_gap},\ \text{lanes}_r \times \texttt{lane\_spacing} + 2 \times \texttt{port\_stub\_length}\big)$$

$$\texttt{separation\_min}[(r, o)] = \max\big(\texttt{node\_gap},\ \text{corridor lanes} \times \texttt{lane\_spacing}\big) + \text{flat-edge label width}$$

Phase 7 treats both as hard lower bounds. Because it does, **Phase 8 can materialize every polyline
by table lookup**: the lane index is already assigned, the band coordinates are already known, and
the polyline is a fixed sequence of turns. There is no pathfinding, no grid, no occupancy ledger, no
rip-up, and no possibility of a routing failure.

See [the implementation](../../crates/gvui/src/4_coordinate_assignment/4_1_lane_demand.rs) and
[08 — Routing Demand](./08-routing-demand.md).

The measured claim: zero `MISSING_ROUTE` diagnostics and zero `unresolved_route_count` across all
40 fixture/engine combinations in the audit.

### 3c. What the two tricks have in common

Both take a question that v1 answered by *trying and checking* — "does the badge fit?", "can the
edge get through?" — and answer it by *computing* instead, at a point in the pipeline where the
answer is cheap and certain.

Both are only possible because of P2, **discrete before continuous**. The label fits because
ordering and separation are decided on integers before any box is placed. The lanes are exactly
right because the intervals are order intervals, not pixel intervals. Once you commit to making
every decision that *can* be made on integers *on* integers, the continuous phase becomes a
deterministic evaluation with nothing left to discover — and a phase with nothing left to discover
is a phase that cannot fail, and therefore a phase you never have to run twice.

---

## 4. The guarantee table

The design rule for every phase except ordering is: **use an algorithm with a proof attached.**
Where the proof gives an optimum, take the optimum; where it gives a bound, know the bound.

| # | Phase | Algorithm | Guarantee | Cost |
| ---: | --- | --- | --- | --- |
| 0 | Ingest | Interning + CSR construction | Exact; node order is input order; no hash iteration anywhere | $O(V + E)$ |
| 1 | Measure | Canvas `measureText` against the card's real fonts | Exact for the actual font, including CJK and emoji | $O(V + E)$ text ops |
| 2 | Structure | Tarjan SCC, then Eades–Lin–Smyth greedy FAS | $\lvert FAS \rvert \le m/2 - n/6$; reversing the returned arcs **provably** yields a DAG | $O(V + E)$ |
| 3 | Rank | Network simplex (Gansner et al.) | **Optimal** for $\sum_{(u,v)} \omega_{uv}(\text{rank}(v) - \text{rank}(u))$ subject to every $\text{minlen}$ | near-linear in practice |
| 4 | Layer | Chain expansion + label items | Every link spans exactly one rank; every label has reserved area | $O(V + \sum \text{span})$ |
| 5 | Order | Median sweeps + transpose, BMJ counting | Median is $\le 3\times$ optimal for the two-layer problem; the count is **exact** | $O(k \cdot s \cdot E \log V)$ |
| 6 | Demand | Greedy interval-graph colouring | **Optimal** — interval graphs are perfect, so greedy uses exactly $\omega$ lanes | $O(E \log E)$ |
| 7 | Coordinates | Brandes–Köpf | $\le 2$ bends per edge; dummy chains straight where no type-1 conflict forbids it | $O(V + E)$ |
| 8 | Route | Lane index → polyline; ports sorted, not searched | Deterministic evaluation; cannot fail, because Phase 6 reserved the space | $O(E \cdot \text{bends})$ |
| 9 | Emit | Constraint assertion + metric computation | Constraints are asserted, never scored | $O(V + E)$ |

Two notes on reading this table.

**Phase 5 is the only line without an exact answer, and that is not a shortcoming.** Two-layer
crossing minimization is NP-hard. A $3\times$ bound from a linear-time heuristic, refined by a local
transpose pass over an *exact* $O(E \log V)$ counting function, is the right trade. Because counting
is exact and cheap, the search can evaluate hundreds of candidates in well under a millisecond —
which is why the one search in the engine costs less than the phases that do not search. The
defaults are `ordering_seeds = 4` and `ordering_sweeps = 16`.

**Phase 2's bound is not the interesting part.** $\lvert FAS \rvert \le m/2 - n/6$ is a quality
bound on how few edges get reversed, and it is nice to have. The *load-bearing* property is the
other one: Eades' guarantee that reversing exactly the arcs it returns yields a DAG. That guarantee
comes from deriving the arcs from a total vertex sequence covering **every arc it was shown** — so
if you hide arcs from it, the guarantee evaporates. v2 learned this the hard way. An early version
treated a caller's `isCycle` hint as a mandate and excluded those edges from the FAS pass. Six of
the eight test datasets carry such hints; the result was a graph that was still cyclic, which sent
longest-path ranking into unbounded relaxation along a live cycle — **249 ranks for 30 nodes** — and
an out-of-bounds panic three phases later. The fix was to let hints set the *starting orientation*
only, and then show the FAS pass every non-self arc in its current orientation. Acyclicity became a
property of the algorithm instead of an assumption.

---

## 5. Why the phase order is forced

The order of the ten phases is not a taste decision. It is what the data dependencies allow, and
almost every pair is forced.

```text
   Measure ──────▶ Rank          a labelled edge needs min_len = 2, so the engine must
                                 know an edge HAS a label before it ranks

   Rank ─────────▶ Layer         you cannot build chains until you know the spans

   Layer ────────▶ Order         a label item's position among its siblings IS an
                                 ordering decision, so it must exist before ordering runs

   Order ────────▶ Demand        lane demand depends on order intervals — and on
                                 nothing else; it is available the instant order is fixed

   Demand ───────▶ Coordinates   node separation depends on lane counts

   Coordinates ──▶ Route         a polyline is determined by (order, coordinates, lane),
                                 all three of which are already fixed, so routing is
                                 evaluation rather than search

   Route ────────▶ Emit          nothing left to decide
```

The instructive exercise is to reverse each of these and watch a retry loop reappear.

**Reverse `Measure → Rank`.** Now ranking runs without knowing which edges carry labels, so
labelled edges get $\text{minlen} = 1$ and land on adjacent ranks. There is no intermediate rank to
host the badge. The only remaining options are to squeeze the badge in afterwards — which can fail,
which needs a retry — or to re-run ranking with the labels known, which *is* the retry.

**Reverse `Layer → Order`.** Now ordering runs before label items exist, and the label has to be
inserted into an already-fixed row afterwards. Its horizontal position is then chosen by a local
collision search rather than by the crossing-minimizing sweep, and inserting it can push its
neighbours, which invalidates the crossing count that ordering just produced. Retry.

**Reverse `Order → Demand`.** Lane demand is computed from order intervals. Without a fixed order
there are no intervals — the best you can do is estimate. An estimate that is too small produces
routes that do not fit (retry); an estimate that is too large wastes whitespace on every drawing
forever.

**Reverse `Demand → Coordinates`.** This is the one v1 got wrong, and it is the expensive one.
Coordinates get assigned with no knowledge of how much room the edges will need, so routing
discovers the shortfall by *failing to route*, and the only recovery is to widen a gap and re-run
coordinate assignment — plus everything downstream of it. That is the 47-second loop.

**Reverse `Coordinates → Route`.** Routing before coordinates exist means routing in some abstract
space and then trying to make the coordinates match, which is coordinate assignment with extra
steps and no guarantee it can be satisfied.

There is exactly one dependency in the whole engine that points *backwards* — routing needs space,
and space is decided by an earlier phase. That is the pressure that produced v1's loop. v2 resolves
it by moving the *computation* of the requirement earlier rather than by moving the *decision*
later:

```text
    v1:   coordinates ──▶ route ──▶ "it didn't fit" ──▶ widen ──▶ coordinates ──▶ …

    v2:   order ──▶ compute exactly how much space the routes will need ──▶ coordinates ──▶ route
                    (interval colouring; optimal; one pass)
```

Same dependency. No loop. That is the whole idea, and it is why the pipeline diagram in the
[engine index](./README.md#the-pipeline) has no arrow going back up.

---

## 6. What this bought, and what it cost

**Bought**, measured across eight datasets and five engines
([full table](../planning/layout-engine-v2/06-results.md)):

- Median speedup ≈ 1,700×; worst-case fixtures 26,445× and 190,785×.
- Slowest fixture across all 40 fixture/engine combinations: **1.88 ms**, against the audit's 50 ms
  per-fixture budget (and a `time_budget_ms` default of 250 ms, which no fixture approaches).
- All 40 combinations valid, and byte-identical across separate processes.
- `leader_count` 0, `unresolved_route_count` 0, `spacing_expansions` structurally 0.
- The engine got substantially *smaller*. The A\* router, the routing grid, the occupancy ledger,
  the rip-up loop, the 1,111-line trial-state generator, the 21-field lexicographic comparator and
  the badge backtracking search were all deleted, not replaced.

**Cost**, stated plainly:

- **Ordering is a heuristic with a $3\times$ bound, not an optimum.** On the dense mesh it reports
  28 combinatorial crossings. Some of those are genuinely unavoidable; some are not.
- **Geometric crossings can exceed combinatorial crossings, and the excess grows with channel
  depth.** The excess is zero on every fixture whose channels are 1–2 lanes deep, and reaches 44
  geometric against 28 combinatorial on the deepest. This is structural rather than a defect: an
  edge descending to lane $k$ must cross the horizontal run of any shallower lane whose interval
  spans its descent, and a combinatorial count of order inversions cannot see that. It was tested
  rather than assumed — swapping the lane-ordering heuristic moved the total across all layered
  fixtures from 121 to 122, so lane *order* is not the lever. Lane *count* is, and it is already
  the proven minimum.
- **The layered engine is not right for every graph.** On `dense_kubernetes_mesh` — 13 of 45 edges
  are feedback edges, so the data has no dominant flow direction — organic mode produces 8
  crossings where layered produces 28. Forcing a mesh into ranks costs crossings. That is an
  argument for [choosing the right mode](../modes/README.md), not for adding a retry loop.

None of those three costs is recoverable by iterating. They are properties of the problem, and the
honest response is to name them rather than to spend 47 seconds pretending otherwise.

---

← [Foundations](./01-foundations.md) | [Index](./README.md) | [Next: Ingest and Measurement →](./03-ingest-and-measurement.md)
