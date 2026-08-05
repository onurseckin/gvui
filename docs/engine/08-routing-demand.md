← [Crossing Minimization](./07-crossing-minimization.md) | [Index](./README.md) | [Next: Coordinate Assignment →](./09-coordinate-assignment.md)

# Routing Demand — Phase 6

This is the phase that makes the engine's organizing principle work, and it has no equivalent in v1.
Everything v1 did with a grid, a pathfinder, an occupancy ledger, a rip-up loop and a permutation
search over routing orders is replaced by one exact computation that runs before any coordinate
exists.

It is worth understanding what problem is actually being solved here, because on first reading it
looks like the phase is doing something impossible.

See [the implementation](../../crates/gvui/src/4_coordinate_assignment/4_1_lane_demand.rs).

---

## 1. The chicken-and-egg problem

Here is the bind every orthogonal layered layout engine hits.

Edges need space to run in. In a layered drawing, an edge leaving a node at rank $r$ and arriving at
a node at rank $r+1$ goes down, then sideways, then down again. The sideways part runs in the
horizontal band between the two ranks. If several edges need to run sideways through the same band
at the same time, they need to be at _different heights_ within it, or they overlap and become one
indistinguishable line.

So the band has to be tall enough. How tall? That depends on how many edges need to share it. How
many edges share it? That depends on where the edges run. Where do the edges run? That depends on
where the nodes are. Where are the nodes? That depends on how tall the bands are.

Round and round.

### How v1 broke the loop: guess, measure, retry

v1 assumed a gap, placed the nodes, then ran an A\* pathfinder over a routing grid to find each
edge's path. When paths collided it applied penalties; when an edge failed to route it ripped up
previously-routed edges and tried again; when that failed it re-ran the whole routing under a
different edge ordering — up to 4 order variants × 12 rip-up passes × 32 permutations, each scored
with an $O(E^2)$ validator. And because the routing outcome fed back into the outer optimizer, every
port-side mutation re-ran all of it.

The costs, measured: `kubernetes_cluster_topology` (12 nodes, 13 edges) took **26.7 seconds**.
`dense_kubernetes_mesh` (30 nodes, 45 edges) took **47.3 seconds**. And the searching did not buy
quality — an audit of the order-variant loop found it cost **4×** for byte-identical output on the
k8s topology. Worse, the loop could still fail: `distributed_saga_workflow` returned **10 routes for
11 edges** under default settings. One edge just did not get drawn.

That is the failure mode of guess-and-retry. It is slow _and_ it has no guarantee.

### How v2 breaks the loop: compute the requirement first

The key observation is this:

> Once the ordering is fixed, the **topology** of every route is already determined — even though no
> coordinate exists yet.

Look at it concretely. Take an edge link from item `a` at rank 2, order 1 to item `b` at rank 3,
order 4. Whatever coordinates get assigned later, that link's route is: leave `a` going down, run
rightward through the band below rank 2, descend into `b`. It passes over the columns of orders 1
through 4 and no others. It runs in the band below rank 2 and no other band.

Which band, and which columns — that is the _entire_ description of the route's topology, and it is
pure combinatorics on the integers Phase 5 just produced. No geometry required.

So compute the demand **now**, in order space, and hand it to Phase 7 as a set of minimum
separations. Phase 7 then produces coordinates in which every route provably fits, and Phase 8
materializes each polyline by table lookup. There is no rip-up, no reroute, no "widen the gap and
try again", and no possibility of a routing failure.

---

## 2. Channels and corridors

Two kinds of space are needed, and the phase computes both.

### Channels — horizontal space between ranks

A **channel** is the horizontal band between two consecutive ranks. Channel $r$ sits below rank $r$.
Edge links running from rank $r$ to rank $r+1$ do their sideways travel here.

```text
rank 2:      [A]        [B]        [C]        [D]        [E]
  order:      0          1          2          3          4
              │                                           │
  lane 0      └───────────────────────────────┐           │      A -> I  (heads right)
                                              │           │
  lane 1                  ┌───────────────────┼───────────┘      E -> G  (heads left)
                          │                   │
              ────────────┼───────────────────┼─────────────
rank 3:      [F]        [G]        [H]        [I]        [J]
  order:      0          1          2          3          4
```

A **lane** is one horizontal track within a channel. Two links may share a lane only if their
sideways runs do not overlap. Here `A → I` occupies orders 0 through 3 and `E → G` occupies orders 1
through 4. They share orders 1–3, so they cannot be at the same height, and the channel needs two
lanes.

### Corridors — vertical space between adjacent items

A **corridor** is the vertical gap between two adjacent items in the _same_ rank. Corridor
$(r, o)$ sits between the items at orders $o$ and $o+1$ of rank $r$.

Corridors carry **flat edges** — edges whose two endpoints landed on the same rank. A flat edge has
no dummy chain; it goes up out of one node, across through every corridor between its endpoints, and
down into the other.

```text
rank 4:   [ P ]  │  [ Q ]  │  [ R ]  │  [ S ]
            0    │    1    │    2    │    3
                 │         │         │
            corridor 0  corridor 1  corridor 2

flat edge P → S spans corridors 0, 1 and 2
flat edge Q → R spans corridor 1 only
```

Both `P → S` and `Q → R` need to pass through corridor 1, and they cannot be at the same $x$, so
corridor 1 needs two lanes and must be at least two lane-widths wide.

---

## 3. Segments are order intervals

Now make it precise. For each consecutive pair `(a, b)` in an edge chain, where `a` sits at rank $r$
and `b` at rank $r+1$, the phase emits one **channel segment**:

```rust
ChannelSeg {
    edge, link,
    rank:     min(a.rank, b.rank),          // which channel
    lo_order: min(a.order, b.order),        // left end of the sideways run
    hi_order: max(a.order, b.order),        // right end
    lane:     0,                            // filled in by the colouring
}
```

That is it. An interval $[\text{lo}, \text{hi}]$ over the integer order axis, plus which channel it
lives in. These are **order intervals, not pixel intervals** — which is the whole point, because
order intervals exist right now and pixel intervals do not.

A parallel `heads_left` flag records whether the link travels toward a _smaller_ order, because
`ChannelSeg` stores only the sorted interval and the travel direction is needed later for the
aesthetic relabel.

Two guards worth knowing:

- Links whose two items are **not on consecutive ranks** are skipped rather than trusted. A
  malformed chain must not be able to index a channel that does not exist. (This is the contract that
  v2's dummy-chain cap violated during development — see §7 below.)
- A link with `lo_order == hi_order` is **perfectly vertical**. It needs no sideways run at all, so
  it is excluded from the colouring. It still gets an entry in the per-link lane table, reporting
  lane 0, so Phase 8's lookup never misses — but it contributes nothing to the channel's lane count.
  Straight edges must not inflate a channel.

---

## 4. Interval graphs, from scratch

The heart of the phase is a small piece of graph theory that happens to fit this problem perfectly.

### 4.1 The setup

You have a set of intervals on a line. Some pairs overlap; some do not. You want to assign each
interval a "lane" such that overlapping intervals never share a lane, using as few lanes as possible.

Turn it into a graph: one vertex per interval, an edge between two vertices whenever their intervals
overlap. This is called an **interval graph**. Assigning lanes without conflicts is exactly **graph
colouring** — assigning colours to vertices so no edge joins two same-coloured vertices.

Graph colouring is NP-hard in general. But interval graphs are not general graphs, and they have a
property that makes this easy.

### 4.2 The lower bound

Pick any point $x$ on the line and count how many intervals contain it. Call the largest such count
over all $x$ the **maximum overlap depth**, written $\omega$.

If $\omega$ intervals all contain the same point, they all pairwise overlap, so no two of them may
share a lane. That is $\omega$ distinct lanes needed, immediately.

$$\text{lanes} \geq \omega$$

In graph terms: those $\omega$ mutually-overlapping intervals form a **clique**, and you can never
colour a clique of size $\omega$ with fewer than $\omega$ colours.

### 4.3 The upper bound: greedy by left endpoint achieves it

Here is the beautiful part. Interval graphs are **perfect graphs**, which for our purposes means the
lower bound above is also achievable — the minimum number of colours equals the largest clique
size, exactly. And you reach it with a completely naive algorithm:

> Sort the intervals by ascending left endpoint. Process them in that order, giving each one any
> lane not currently occupied by an interval that overlaps it.

Why does this never need more than $\omega$ lanes? When you process interval $I$ with left endpoint
$\ell$, the only intervals already placed that can conflict with $I$ are those still "active" at
$\ell$ — the ones you have already started and not yet finished. All of them contain the point
$\ell$, and so does $I$. So if $k$ lanes are busy at that moment, then $k+1$ intervals share the
point $\ell$, which means $\omega \geq k+1$, which means lane index $k$ was always going to be
needed. The greedy algorithm never opens a lane the optimum could have avoided.

**No search, no backtracking, provably optimal.** That is why this phase can be a single forward
pass and still guarantee that routing cannot fail.

### 4.4 The sweep

Implemented with two min-heaps:

```text
sort members by (lo_order, hi_order, edge, link)
active    = min-heap keyed by (hi_order, lane)   # intervals in progress
free_lanes = min-heap of lane ids                # retired lanes, reusable
next_lane  = 0

for each segment in sorted order:
    while active.peek().hi_order < segment.lo_order:
        free_lanes.push(active.pop().lane)       # this one is finished; recycle its lane
    lane = free_lanes.pop()  or  (next_lane, next_lane += 1)
    segment.lane = lane
    active.push((segment.hi_order, lane))

return next_lane          # == ω
```

`next_lane` is only ever incremented when the free list is empty, i.e. when every existing lane is
occupied by something overlapping the current segment — so the returned count is exactly $\omega$.
A test asserts this against an independent brute-force sweep over 40 randomized interval sets.

Cost: $O(k \log k)$ for a channel with $k$ segments, dominated by the sort.

### 4.5 A worked example

Five links in one channel, with these order intervals:

```text
order:    0    1    2    3    4    5    6    7    8    9
          |    |    |    |    |    |    |    |    |    |
A:        ●────────●
B:             ●───────────────────●
C:                       ●────●
D:                                      ●─────────●
E:                                           ●─────────●
```

$A = [0,2]$, $B = [1,5]$, $C = [3,4]$, $D = [6,8]$, $E = [7,9]$. Already sorted by left endpoint.

| step | segment | retire (hi < lo)            | free lanes | assigned | active after |
| ---- | ------- | --------------------------- | ---------- | -------: | ------------ |
| 1    | A [0,2] | —                           | {}         |    **0** | (2,lane 0)   |
| 2    | B [1,5] | none (2 ≥ 1)                | {}         |    **1** | (2,0) (5,1)  |
| 3    | C [3,4] | A (2 < 3) → free 0          | {0}        |    **0** | (5,1) (4,0)  |
| 4    | D [6,8] | C (4<6), B (5<6) → free 0,1 | {0,1}      |    **0** | (8,0)        |
| 5    | E [7,9] | none (8 ≥ 7)                | {1}        |    **1** | (8,0) (9,1)  |

Two lanes total. Check against the lower bound: the deepest point is anywhere in $[1,2]$ (A and B),
or $[3,4]$ (B and C), or $[7,8]$ (D and E) — depth 2 everywhere. $\omega = 2$, and the greedy used 2. Optimal.

Note step 3 and step 4: lane 0 is recycled twice. Freed lanes come off a **min-heap**, so the lowest
free id is always taken. That is not just tidiness — it makes the assignment a function of the
interval set alone, never of allocation history, which is what keeps the output byte-identical
across runs.

### 4.6 Why touching intervals must not share a lane

The sweep retires an active segment only when `active_hi < lo` **strictly**. Two intervals that meet
at exactly one point — say $[0,2]$ and $[2,4]$ — are _not_ considered disjoint, and they get
different lanes.

This looks over-cautious until you draw it. Both segments have an endpoint at order 2, meaning both
of them turn vertically at the $x$ of the item in column 2. If they shared a lane, they would share
a $y$ too:

```text
        order 0        order 1        order 2        order 3        order 4
           │                             │                             │
   lane 0  └─────────────────────────────┴─────────────────────────────┘
                                         ▲
                    both segments meet here, on the same y, at the same x
                    and render as one continuous line from 0 to 4
```

The reader sees a single horizontal run from order 0 to order 4. Two edges have visually merged into
one. Collinear overlap is worse than a crossing, because a crossing is at least legible. So touching
counts as conflict, and the test `touching_intervals_do_not_share_a_lane` pins it.

---

## 5. Choosing _which_ lane: the bus look

The colouring says how many lanes are needed and guarantees no two conflicting segments share one.
It says nothing about _which_ lane number each segment should get — any permutation of the lane ids
is an equally valid colouring.

That freedom is worth spending. The rule comes from VLSI channel routing and is called the left-edge
rule, adapted here to be direction-aware:

- Segments travelling **left** take the outer (higher-numbered, deeper) lanes.
- Segments travelling **right** take the inner (lower-numbered, shallower) lanes.
- Within each group, the **longest** runs sit outermost.

The result is that parallel runs align instead of weaving, and the channel reads as a bus rather than
a tangle — the look hand-drawn diagrams have.

Take three nested runs in one channel, all heading right, with spans 5, 3 and 1:

```text
   longest OUTERMOST (what the rule does)      longest INNERMOST (the mistake)

   lane 0          ●───────●                   lane 0  ●───────────────────────●
   lane 1      ●───────────────●               lane 1      ●───────────────●
   lane 2  ●───────────────────────●           lane 2          ●───────●

   order   0   1   2   3   4   5               order   0   1   2   3   4   5
```

Every run has to descend from the top of the channel to its own lane at each end. On the left, the
lane-2 run descends at orders 0 and 5 — both outside the intervals of the shallower lanes — so it
crosses nothing. Same for lane 1 at orders 1 and 4. **Zero crossings.**

On the right, the lane-1 run descends at orders 1 and 4, both of which sit inside lane 0's run
`[0,5]`: two crossings. The lane-2 run descends at 2 and 3, inside both shallower runs: four more.
**Six crossings**, from the same segments, the same lane count, and an equally valid colouring. Lane
_assignment_ is free; lane _choice_ is not.

That said, the win is in avoiding the pathological choice, not in fine-tuning a good one. Swapping
this rule for a different sensible rule barely moves the needle — measured in [§8](#8-the-measured-consequence).

Crucially, **the permutation is applied to whole lanes, never to individual segments.** Two segments
that were in different lanes stay in different lanes, so the colouring remains valid by construction.
The sort key ends with the old lane id, which makes the ordering strictly total and the result
reproducible. A randomized test with 200 intervals asserts that after the relabel the assignment is
still a proper colouring and still a bijection onto $0..\omega$.

### 5.1 Why this is not the final word

Everything above reasons in **order** space, because order is all Phase 6 has. The worked example is
sound there — and the drawing can still come out looking like the right-hand picture, because _order
is not a proxy for x across ranks_.

Item 0 of a rank holding fifteen shards and item 0 of the next rank holding the single reducer they
all feed are both "order 0", and they are a thousand pixels apart. Two segments whose order intervals
are disjoint can therefore overlap for most of the drawing's width, and — worse — a segment whose two
items share an order index looks perfectly _vertical_ to the sweep in §3, gets excluded from the
colouring as needing no lane at all, and lands in lane 0 on top of whatever is already there.

Both failures were real. On the sample corpus this phase's assignment produced **148 geometric
crossings against 28 combinatorial ones**, plus **14 pairs of edges drawn along the same line**, one
of them overlapping for 1226 px.

The fix is not to make this phase cleverer, because it cannot be: no amount of order-space reasoning
recovers information that only coordinates carry. Instead the two questions are separated.

| question                                           | phase                                                                        | why there                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| **How much** routing space does this channel need? | 6 (here)                                                                     | Phase 7 needs the answer _before_ it can place anything |
| **Which** lane does each segment take?             | 8, [§5.5](10-edge-routing.md#55-lane-assignment-happens-in-coordinate-space) | needs the coordinates Phase 7 produces                  |

The count computed here is unchanged and still binding — it is an upper bound on the lanes needed,
and Phase 8 only ever permutes and packs _within_ the space it bought. So the reservation guarantee
is untouched, and the drawn assignment is made where the geometry is known. Same corpus after the
split: **40 crossings and 0 merged pairs.**

---

## 6. Corridors are easier

Flat edges get the same treatment with a simplification. Every flat edge in a rank occupies the
_whole_ rank band vertically — it has to clear the tops or bottoms of the nodes it passes. So inside
one corridor, every segment conflicts with every other one. There is nothing to compute:

$$\text{corridor lanes}(r, o) = \text{number of flat-edge segments crossing that corridor}$$

Lanes are handed out by ascending `(span, edge)`, so the longest flat edge ends up outermost — the
same aesthetic rule the channel relabel applies.

Flat edges also carry their **badge** in this space. A flat edge's label box sits in the band between
its endpoints, so every corridor the edge spans must be wide enough for it. `corridor_label_widths`
records the widest label covering each corridor. Phase 4 normally copies the measured box onto the
`FlatEdge`; the IR is consulted as a fallback so a flat edge never silently loses its badge
reservation.

---

## 7. Turning lanes into separations

The phase's actual output is not lane numbers — those are for Phase 8. Its output _to Phase 7_ is a
set of minimum distances.

### Rank gaps

```rust
rank_gap_min[r] = effective_rank_gap().max(lanes[r] * effective_lane_spacing() + 2*port_stub_length)
```

The `2 × port_stub_length` covers one straight run leaving the node above and one entering the node
below, before and after the lanes. `rank_gap_min[r]` is the gap **below** rank $r$; the final entry
is populated for uniform indexing and is meaningless.

Note this is a `max`, not a sum. The lanes live _inside_ the configured gap. If the configured gap is
already generous, the lanes cost nothing extra.

Real numbers, at defaults (`rank_gap` 120, `lane_spacing` 12, `port_stub_length` 20, `compaction`
balanced so the scale is 1.0):

| lanes in the channel |      lane demand |                             gap |
| -------------------: | ---------------: | ------------------------------: |
|                    0 |    $0 + 40 = 40$ | **120** (configured floor wins) |
|                    3 |   $36 + 40 = 76$ |        **120** (still absorbed) |
|                    7 |  $84 + 40 = 124$ | **124** (routing starts to pay) |
|                   10 | $120 + 40 = 160$ |                         **160** |

Below about seven lanes the default rank gap already has room; past that the drawing grows to fit,
which is the correct behaviour — a channel carrying ten parallel edges genuinely needs more vertical
room than one carrying two.

### Item separations

```rust
separation_min[(r, o)] = effective_node_gap().max(corridor_lanes * effective_lane_spacing())
                       + flat_edge_label_width
```

Same `max` for the same reason. The label width is **added on top**, because a badge and a routing
lane cannot occupy the same pixels.

At defaults (`node_gap` 56, `lane_spacing` 12):

| corridor contents               |                      separation |
| ------------------------------- | ------------------------------: |
| nothing                         |     $\max(56, 0) + 0 = $ **56** |
| 2 flat edges                    |    $\max(56, 24) + 0 = $ **56** |
| 6 flat edges                    |    $\max(56, 72) + 0 = $ **72** |
| 1 flat edge with a 300 px badge | $\max(56, 12) + 300 = $ **356** |

Two contract subtleties Phase 7 relies on:

- `separation_min[(r, o)]` is the gap between the **facing edges** of the two items, not a
  centre-to-centre distance. Phase 7 adds the half-widths itself.
- The map is populated **densely** — one entry for every adjacent pair of every rank, every one of
  them already at least `effective_node_gap()`. A missing key therefore means "no such pair", not
  "use the default". There is also a defensive union pass over the corridor segments, so an order
  value that somehow fell outside its rank's slice cannot lose its demand entirely.

### This is the one backward-flowing constraint in the engine

Everywhere else, information moves strictly forward: measurement feeds structure, structure feeds
ranking, ranking feeds layering, layering feeds ordering. `RoutingDemand` is the single exception —
it is a requirement generated by a _downstream_ concern (Phase 8 needs somewhere to draw) reaching an
_upstream_ decision (Phase 7 choosing coordinates).

And the way that dependency is discharged is the whole thesis of v2 in miniature: instead of letting
Phase 8 discover it has no room and asking Phase 7 to try again, the requirement is **computed ahead
of time, exactly**, and delivered as a hard lower bound. The cycle is broken by ordering the work
correctly rather than by iterating.

The guarantee that makes it sound is the optimality of the interval colouring. Because $\omega$ is
the provable minimum, the separation derived from it is _exactly sufficient_: never too small, so
routing cannot fail; never larger than necessary, so no whitespace is wasted. A heuristic lane count
would have given up one of those two properties.

### What Phase 8 does with it

Phase 8 never searches. For each link it looks up the lane and computes:

```rust
let lane = demand.lane_of_link[&(edge, link)];
let channel_y = band_bottom + stub_length + (lane as f64 + 0.5) * lane_spacing;
```

Lane $k$'s centre line sits at $\text{stub} + (k + 0.5) \cdot \text{spacing}$ below the band bottom.
With $\text{gap} \geq \text{lanes} \cdot \text{spacing} + 2 \cdot \text{stub}$, the deepest lane
still clears the next rank's top by at least one stub length. The arithmetic closes.

Measured result across all fixtures: **zero** `MISSING_ROUTE` diagnostics, **zero**
`unresolved_route_count`. Every edge gets drawn, every time — which is what
`distributed_saga_workflow` could not manage under v1.

---

## 8. The measured consequence

One property of this design is worth stating plainly rather than hiding, because it is real and it
is characterised.

The _combinatorial_ crossing count from [Phase 5](./07-crossing-minimization.md) and the _geometric_
crossing count measured on the emitted polylines are not always equal. Measured across the layered
fixtures, grouped by how deep the channels got:

| channel lanes |   1 |   1 |   2 |   3 |   3 |   6 |  10 |
| ------------- | --: | --: | --: | --: | --: | --: | --: |
| combinatorial |   0 |   0 |   0 |   0 |   0 |   6 |  28 |
| geometric     |   0 |   0 |   0 |   2 |   2 |   6 |  44 |

The excess is **zero at 1–2 lanes** and grows to **+16 at 10 lanes**. That shape is the signature of
a structural property, not a bug.

Here is the mechanism. An edge assigned to lane $k$ must descend from the top of the channel to lane
$k$ before running sideways. On the way down it passes through lanes $0$ through $k-1$. If any
shallower lane carries a horizontal run whose $x$-interval spans the descent point, the two lines
cross:

```text
              ┌──── edge X descending to lane 2
              │
   lane 0  ───┼──────────────────────  edge Y's horizontal run
              │                         (crossing #1)
   lane 1  ───┼──────────────────────  edge Z's horizontal run
              │                         (crossing #2)
   lane 2     └──────────────────────  edge X's horizontal run
```

The combinatorial count models **order inversions between ranks**. It cannot see these, because they
are not inversions — they are an artefact of stacking parallel horizontal runs at different depths.
Any orthogonal lane router has them; they are the price of the bus aesthetic.

**The lever is lane depth, not lane order.** This was tested rather than assumed. Swapping the
lane-ordering heuristic (direction-aware left-edge → plain ordering by left endpoint) moved the total
across all layered fixtures from **121 to 122** — a null result. The lane _order_ does not matter.
The lane _count_ does, and it is already the provable minimum, so it cannot be reduced by any change
to this phase.

Reducing it means producing shorter horizontal runs in the first place, which means changing **Phase
5's objective** to include horizontal span alongside crossings: shorter spans → shallower channels →
fewer descent artefacts. That is a change to the ordering objective, not to the router, and it is
recorded as future work rather than done.

---

## 9. What the phase costs and what it guarantees

**Cost.** One pass over every chain link, one sort and one heap sweep per channel, one grouped sort
for the corridors. $O(S \log S)$ where $S$ is the number of chain links — the same order as reading
the input. Against the tens of seconds v1 spent in A\* on the same graphs, this does not register:
the whole layered pipeline for the 30-node, 45-edge mesh runs in **1.79 ms**.

**Guarantees.**

1. Lane counts are the **exact minimum** for the fixed ordering (optimal interval-graph colouring,
   verified against a brute-force overlap sweep).
2. The separations derived from them are **exactly sufficient**, so Phase 8 cannot fail to route.
3. Every flat-edge badge has reserved corridor width.
4. Output is **deterministic**: membership is grouped into dense `Vec`s rather than maps so nothing
   depends on hash iteration order; both heaps are keyed on totally-ordered tuples; the relabel sort
   key ends with the old lane id. Byte-identical across processes, asserted by test.

**Non-guarantees.** The phase says nothing about geometric crossings (§8), and it assumes the chain
structure it is handed is well-formed — links spanning more than one rank are skipped, not repaired.
That assumption is load-bearing enough that it caught a real bug during development: an early spec
for the `max_dummy_chain_length` pathology guard proposed keeping "only the first and last `cap/2`
intermediate ranks", which deliberately creates one link spanning many ranks. Three phases depend on
`up`/`down` being _adjacent-rank_ adjacencies — the accumulator tree indexes by order within rank
$r+1$, this phase derives channel intervals from a single rank gap, and Brandes–Köpf's type-1
conflict marking assumes single-rank segments. The cap is now advisory: chains are always contiguous
and an over-long span is reported as a diagnostic instead.

---

← [Crossing Minimization](./07-crossing-minimization.md) | [Index](./README.md) | [Next: Coordinate Assignment →](./09-coordinate-assignment.md)
