← [Coordinate Assignment](./09-coordinate-assignment.md) | [Index](./README.md) | [Next: Emit and Quality →](./11-emit-and-quality.md)

# Chapter 10: Edge Routing

Every node has a final position. Every routing lane was reserved two phases ago. This chapter draws
the lines.

It is the shortest phase in the engine to explain and it used to be the longest by far, so it is
worth starting with what it replaced.

---

## 1. What v1 did, and why it collapsed

v1 treated routing as a **pathfinding problem**. Conceptually reasonable: you have obstacles (the
nodes), you have a start and an end (the ports), find a nice orthogonal path between them. In
practice it went like this.

### The grid

To search, you need a discrete space. v1 built a **routing grid**: the dense Cartesian product of
every X coordinate and every Y coordinate derived from ports, node bounds, and `lane_rings` —
concentric rings drawn around every node to give paths somewhere to go.

Measured on `kubernetes_cluster_topology`, a **12-node** graph:

```text
   |X| = 86 distinct x coordinates
   |Y| = 65 distinct y coordinates
   ────────────────────────────────
   4,934 live grid vertices
   10,294 grid edges
```

Roughly 400 grid vertices per node. Every A\* expansion did a `String`-keyed hash lookup on
`grid.vertices`, a second on `grid.vertex_index_map`, a `String` clone of the vertex id, and a
**linear scan over all N node rectangles** for the forbidden test — there was no spatial index
anywhere in the router.

### The search

A\* per edge, with a bend penalty folded into the state (the state was `(x, y, direction)`, so a
turn could cost more than a straight step). Measured cost: **25–65 ms per edge**. The nominal
budget `max_astar_states_per_route` was 8,000, but the effective bound was
`max(32000, endpoint_dist × 8)`, so it rarely bound anything.

### The ledger

Once an edge was routed it claimed grid cells, so later edges could be charged a crossing penalty
or refused an overlapping collinear run. `commit_reservations` built a split-point vector of
$(|X| + |Y|) \times \text{segments}$ points and then **re-split every existing reservation against
it**, with an $O(k^2)$ dedup inside. Reservations grew to 3,276 for 45 edges and per-commit cost
climbed monotonically from 0 ms to 24 ms.

### The retry loop

And then the killer: because routing edges one at a time makes the _order_ matter, v1 tried many
orders.

```text
   up to  4 order variants
        × 12 rip-up passes
        × 32 conflict permutations
        , each followed by a full O(E²) validate_custom_layout
```

Config sweep on fixed node positions:

| config                                    | k8s topology | dense mesh |
| ----------------------------------------- | -----------: | ---------: |
| default (4 variants, 12 rip-up, 32 perms) |     7,466 ms |  15,537 ms |
| 1 variant                                 |     1,810 ms |   3,044 ms |
| 1 variant + `maxConflictPermutations = 1` |   **150 ms** |   3,033 ms |

For `kubernetes_cluster_topology` the permutation loop cost **12×** and produced an _identical_
result: 13 routes, 4 crossings, valid. The order-variant loop cost **4×** for no measured gain.

### The totals

Phase-level instrumentation of a single v1 pipeline pass:

```text
   kubernetes_cluster_topology (12n 13e)
     cycle=0.18  rank=0.03  crossmin=0.02  layer-opt=0.19  coord=0.16
     ROUTE=4979.2ms   BADGE=6.0ms   VALIDATE=0.1ms

   dense_kubernetes_mesh (30n 45e)
     cycle=1.06  rank=0.05  crossmin=0.01  layer-opt=10.24  coord=0.31
     ROUTE=19605.4ms  BADGE=95.3ms  VALIDATE=0.4ms
```

**Routing was 99.5%+ of the cost.** Everything else was noise.

### The actual diagnosis

The interesting thing is not that A\* was slow. It is _why_ there was a search at all.

v1 searched because **it did not know how much space it had**. Node positions were fixed before
anyone asked how many edges would need to pass between them, so routing was handed a drawing that
might or might not have room, and had to discover the answer by trying. Rip-up and reroute is what
you build when a route can fail. Order variants are what you build when a route failing depends on
which route went first.

v2 removes the search by removing the uncertainty. [Phase 6](./08-routing-demand.md) computes the
exact lane demand from the fixed ordering _before any geometry exists_, and
[Phase 7](./09-coordinate-assignment.md) honours it exactly. By the time this phase runs, the space
is already there.

**v2 does no pathfinding at all.** There is no grid, no search, no occupancy ledger, no rip-up, no
reroute, and no fallback path.

---

## 2. What Phase 8 actually is

Three inputs, all already fixed:

```text
   ports            ← this phase, step 1: a scored choice, a sort, an alignment pass
   lane per link    ← Phase 6: interval-graph colouring
   item coordinates ← Phase 7: Brandes–Köpf
        │
        ▼
   polyline         ← pure evaluation. No decisions.
```

The module doc in
[`5_2_lane_router.rs`](../../crates/gvui/src/5_edge_routing/5_2_lane_router.rs) puts it as bluntly
as it can be put: _"This module contains no search, no grid, no collision test and no repair."_

---

## 3. Port sides are a scored choice, not a search

An edge has to attach _somewhere_ on its endpoints' boundaries. v1 tried all sixteen
`(source_side, target_side)` combinations per edge, then searched again to repair the crossings that
produced. v2 replaced the search with a fixed table: every chain edge left the source's **Bottom**
face and entered the target's **Top** face, always.

The table was too blunt, and it showed. A target that sits mostly _sideways_ of its source was still
made to leave downwards and come back up, so a route that wanted to be one straight segment became a
dog-leg:

```text
   fixed table (v2)                       scored sides

   ┌───────┐                              ┌───────┐
   │   A   │                              │   A   ├──┐   ← Right face + stub
   └───┬───┘                              └───────┘  │      (1 corner, here)
       │                                             │   ← descends at A.right + stub
   ════╧══════════════╗  ← channel        ═══════════╪═══  (no horizontal run)
                      ║                              │
                 ┌────╨──┐                      ┌────┴──┐
                 │   B   │                      │   B   │
                 └───────┘                      └───────┘

   2 corners                              1 corner
```

Note where that one corner is: **stepping out of the vertical face is itself a turn.** A side
attachment can beat a dog-leg, but it can never beat a flow-face attachment that was already
straight — it costs exactly one corner more than that. §3.3 prices this, and §3.3's table shows what
happens when you overrule it.

The engine still evaluates sixteen combinations — it just **scores** them with a closed-form cost and
takes the minimum. One pass, no repair, no backtracking. `flexible_port_sides` (default `true`) turns
it on; with it off, the v2 table is used verbatim and nothing is scored.

The scorer lives in
[`plan_chain_sides` / `best_side_pair`](../../crates/gvui/src/5_edge_routing/5_1_ports.rs).

### 3.1 Which of the sixteen are legal at all

Infeasible combinations are skipped rather than scored, and there are two rules
(`face_is_feasible`). Both are about what the lane router will actually draw.

**A source may not use `Top`, and a target may not use `Bottom`.** The router always descends from
the source into the channel below its rank, and rises into the target out of that same channel. A
backward-facing stub would have to cross the node's own **interior** to get there — a line drawn
through the box it starts from.

```text
        ┌───────────┐
        │     A     │        source on Top:  the stub points up,
        └───────────┘        the channel is down, and the only way
              ↑              between them is straight through A.
              └── stub       Rejected before it is ever scored.
```

**A vertical face needs clearance for every port it carries.**

- `SIDE_FACE_CLEARANCE_FACTOR = 2.0`. A port on a `Left`/`Right` face makes the router descend at
  `port_stub_length` _outside_ that face, so the whole departure — the horizontal stub and the
  vertical run down to the channel — lives in the gap between this node and its rank neighbour. One
  stub length would put the descent exactly on the neighbour's boundary; requiring twice that keeps
  it clear of the neighbour by as much again. Phase 6 guarantees the gap is at least `node_gap`
  wide, but `node_gap` and `port_stub_length` are configured independently and can be set into
  conflict — `face_clearance` is the check that rejects that case rather than drawing through a
  node.
- `side_face_capacity` (default 2). Ports on a vertical face used to be capped at one, because they
  all descended at the _same_ x — that x is fixed by the stub contract the router reads — so a second
  port would run collinear with the first from its own y all the way down to the channel. The cap is
  now a setting because the descent lines are staggered: port _k_ reaches `port_stub_length + k *
port_pitch` outside the face, so each gets its own line. `face_clearance` is charged for the port
  about to be added, not for the configured capacity, so a node with one narrow-ish gap can still use
  its side once.

Flat edges claim their faces **first**. A flat edge has no side choice at all (it is routed through
the corridor between its endpoints, §9), so letting a chain edge take a vertical face a flat edge
needs would trade a free decision for a forced one.

`(Bottom, Top)` is always feasible, which is why the scorer needs no failure path.

### 3.2 What `bends` means under a lane router

The first and dominant cost key is the number of corners **the lane router will actually emit at the
two ends**, and it is only ever 0 or 2 per end. That is a property of the lane model, not an
estimate.

Every chain end is drawn as "drop from the port into the channel". Two ends that drop at the same x
need no horizontal run between them, and therefore no corners. Two ends that cannot agree on an x
need one horizontal run, which costs exactly two corners — one to turn into it, one to turn out.

So the question is whether the two ends' **drop-x intervals** meet (`drop_span`):

| face             | interval of x the port can drop at                                                  |
| ---------------- | ----------------------------------------------------------------------------------- |
| `Top` / `Bottom` | the whole padded face, `[x + padding, right − padding]` — it drops wherever it sits |
| `Left` / `Right` | a **single point**, `port_stub_length` outside the face                             |

```text
   intervals meet  ->  bends = 0            intervals disjoint  ->  bends = 2

   ┌───────┐                                ┌───────┐
   │   A   │                                │   A   │
   └───┬───┘                                └───┬───┘
       │  [────A's span────]                    │        [──A's span──]
       │   ∩  (the spans overlap)           ════╧════════════╗
       │  [────B's span────]                                 ║
   ┌───┴───┐                                            ┌────╨──┐
   │   B   │                                            │   B   │
   └───────┘                                            └───────┘
```

A multi-rank chain scores its two ends **independently**: they sit in different channels and never
have to agree with each other, so each end is tested against the x of the adjacent chain item it
meets (`head + tail`, each 0 or 2).

**Plus one corner per vertical face.** A port on `Left`/`Right` has to step _out_ of its face
horizontally before it can start descending, and that corner survives even when both ends agree on an
x. So a side attachment costs exactly one more bend than a flow-face one, always. This is the single
most important fact about side attachment in this engine and it is worth stating plainly:

> In a Z-router, attaching to a node's side never _saves_ a corner. It costs one.

### 3.3 The rest of the cost

Three keys, compared lexicographically:

| #   | key                                                 | what it prices                                                                                      |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `residual`                                          | crossings against already-committed runs in the same channel that **no lane order could remove**    |
| 2   | `bends + flow_side_bias · off_flow + length / 1000` | corners, the side-face trade, and path length — one comparable number                               |
| 3   | `congestion`                                        | ports already claimed on the two faces, so a fan-out spreads instead of piling onto one face        |
| 4   | candidate order                                     | `SOURCE_CANDIDATES × TARGET_CANDIDATES`, so the choice is total and byte-identical across processes |

**Why `residual` and not a raw crossing count.** [§5.5](#55-lane-assignment-happens-in-coordinate-space)
deletes every crossing the lane order can reach. Charging the side choice for those too would be
double-counting, and would push it into contortions to avoid crossings that were about to disappear
anyway. What is left is the pairwise minimum — the cost of putting `a` above `b` versus `b` above `a`,
whichever is smaller — and that is the only part a side choice can still influence. This is the key
that makes an edge arrive on a node's _side_ when arriving at its top would have to cut across
something.

**Why keys 1 and 2 are one number each, not four.** They used to be lexicographic, with `bends`
first. That made `flow_side_bias` unreachable: a horizontal face has a whole interval to drop from
and a vertical face has a single point, so the horizontal face won the bend key essentially always
and nothing after it was ever consulted. Folding bends, the side trade and length into one weighted
score is what gives the setting a reachable effect.

**`flow_side_bias` is signed, and the sign is the switch.** It prices a side attachment in corners.
Since a side always costs exactly one more corner, nothing at or above zero can ever choose one —
including `0`, which means "price the corner honestly and let geometry decide", and geometry decides
against. Negative values buy side attachment at the price of that corner. Measured over the corpus:

| `flow_side_bias`  | ports on a side face | geometric crossings | bends   |
| ----------------- | -------------------- | ------------------- | ------- |
| **1.0 (default)** | **5.1 %**            | **40**              | **368** |
| 0.0               | 5.1 %                | 40                  | 368     |
| −1.0              | 15.4 %               | 69                  | 404     |
| −1.5              | 44.0 %               | 146                 | 508     |

Using all four sides costs crossings rather than saving them, and the reason is not subtle: with
[destination affinity](#6-port-spacing-and-where-node-growth-actually-happens) a flow-face port is
placed at very nearly the x the edge is heading for, so its channel run is short or absent. A side
port is _forced_ to drop at a fixed x outside the node, which is generally further from where it is
going — a longer run, and a longer run is a wider window for other edges' drops to cut. The setting
is offered as an aesthetic choice, not an optimisation, and it is documented here with numbers so the
choice can be made with open eyes.

The candidate lists lead with the rank-flow face (`Bottom` first for a source, `Top` first for a
target) because the last key decides only genuine ties, and when the geometry does not care, a
hierarchy should read top-to-bottom.

Chains are visited in ascending **edge index** — not in `layered.chains` order — so the congestion
term is a function of the graph alone and not of how Phase 4 happened to emit chains.

### 3.4 The two edge kinds that do not get a choice

| edge kind             | source side                                 | target side       |
| --------------------- | ------------------------------------------- | ----------------- |
| flat edge (same rank) | **Right** if `from.x ≤ to.x`, else **Left** | the opposite side |
| self-loop             | **Right**                                   | **Right**         |

Flat-edge sides compare `from.x ≤ to.x`. Items within a rank never overlap, so comparing left edges
is the same as comparing centres and is stable under differing widths.

### 3.5 Why a side port cannot break Phase 6's reservation

This is the part that makes flexible sides safe rather than merely nicer.

[Phase 6](./08-routing-demand.md) reserved routing space in **order space**, before any coordinate
existed: a channel below each rank sized by an interval colouring, and a corridor between each
adjacent pair of items in a rank. Moving an attachment point from the bottom face to a side face does
not touch either reservation, because **a side port still descends into the channel below its own
rank**. The router drops from `port.stub` straight to the channel y and runs horizontally from there.
The travel direction through the layered structure is unchanged; only the last few pixels before the
node boundary move.

What _does_ change is where the descent happens: `stub.x` is now `port_stub_length` outside a
vertical face rather than somewhere inside the node's own width, so the descent lives in the gap
between the node and its rank neighbour. That gap is Phase 6's corridor — and the two-stub-length
clearance test of §3.1 is exactly what keeps the descent out of the neighbour's interior, and the
"no edge–node penetration" invariant intact by construction.

### 3.6 Two things the sides do not encode

**Direction.** `left-right`, `bottom-up` and `right-left` are handled as a change of coordinate frame
applied around the entire pipeline — boxes are transposed before ingest, and results are transposed
and mirrored after emit. [`5_1_ports.rs`](../../crates/gvui/src/5_edge_routing/5_1_ports.rs) never
branches on direction, and since v3 `direction` is the **only** source of flow direction anywhere in
the engine: `EngineMode::from_mode_str` no longer returns one. It used to, and the result was that
`left-right` silently did nothing — the client sends a fully resolved config, so `direction` was
always present, and the "explicit direction wins over the mode" rule discarded the mode's direction
every single time.

**Feedback edges.** Phase 2 reversed them — it swapped their endpoints — so by the time they reach
this phase they are ordinary `Bottom → Top` chains in the internal frame, and they are deliberately
_not_ special-cased. [Phase 9](./11-emit-and-quality.md) flips the arrowhead back at the very end.
(The v2 design note proposed giving feedback edges a distinctive shape — out of the bottom and back
into the bottom via a side corridor. The implementation does not do that; feedback edges are drawn
like any other edge and are distinguished only by direction and by the renderer's styling.)

---

## 4. Straight-shot alignment

Choosing a side is only half of the decision, and on its own it is the _wrong_ half.

Look again at the zero-bend case in §3.2. The scorer says a `Right` source face costs no bends
because its drop x — a single point, `port_stub_length` outside the face — falls inside the target's
port range. But "falls inside the range" is not the same as "the target's port is actually there".
Port distribution (§6) spreads ports evenly along a face; the odds of one landing exactly on that x
are nil. Without something to close the gap, the route drops at the side's x, still needs its
horizontal run and its two corners, **and** has paid for a stub sticking out sideways as well. The
flexible side would have _added_ a bend rather than removing one.

`apply_straight_shot_alignment` is the pass that redeems the prediction. It slides ports onto a
common x wherever the slack allows, which is also the single largest bend reducer in the phase in its
own right — measured **92 → 61 bends on a 24-node graph**. It is on by default
(`straight_shot_alignment`).

A port on `Top`/`Bottom` is **free**: it drops wherever it sits along its face, so it can be slid. A
port on `Left`/`Right` is **fixed**: it drops exactly `port_stub_length` outside its face and there is
nothing to slide. Three cases follow, and the mixed one matters as much as the symmetric one:

| source face | target face | what happens                                                                                               |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| free        | free        | both move to a shared x between them (the midpoint, clamped into the overlap of their two slidable ranges) |
| free        | fixed       | the **free end moves onto the fixed end's drop x**                                                         |
| fixed       | free        | mirror image                                                                                               |
| fixed       | fixed       | nothing to do                                                                                              |

```text
   before                                  after

   ┌───────┐                               ┌───────┐
   │   A   ├──┐  fixed at A.right+stub     │   A   ├──┐
   └───────┘  │                            └───────┘  │
              │                                       │
   ═══════╗   │                                       │
          ║   │                                       │
   ┌──────╨┐  │   B's top port is free       ┌────────┴┐
   │   B   │  ┘                              │    B    │
   └───────┘                                 └─────────┘

   2 bends                                   0 bends
```

### When a snap is refused

A snap is refused unless the moved port stays inside `[x + portEndpointPadding, x + width −
portEndpointPadding]` **and** at least `port_pitch` away from the ports on either side of it.

That second condition is load-bearing. Those neighbours are what §5 sorted into a locally
crossing-free order; keeping the moved port strictly between them is what stops the alignment from
re-introducing the crossings the sort removed. A face already packed tighter than `port_pitch` —
which happens when Phase 0's degree-driven width growth clamped at `max_node_width` — therefore never
straightens at all, because crowding it further is worse than a dog-leg.

### Order, and multi-rank chains

Chains are processed by **descending edge `weight`, then ascending edge index**. Weight is the
caller's statement of which edges matter, and the ordering is total, so the result is byte-identical
across processes.

Multi-rank chains straighten too — each free end snaps onto the centre x of its adjacent chain item —
but only when **every interior item is a `Dummy`**. A `Label` item is traversed at an x that depends
on `label_placement` (§7), and that rule belongs to the router rather than being worth duplicating
here for an alignment that would rarely fire.

---

## 5. Port order along a side is a sort — and that is the whole crossing story

Once you know an edge uses a node's bottom side, you still have to pick _where_ along that side.
This single rule does almost all the work:

> Sort the ports on a node's **bottom** side by the `order` of the item in rank `r+1` the chain
> runs to. Sort the ports on the **top** side by the `order` of the item in rank `r-1` it comes
> from.

Why it works: [Phase 5](./07-crossing-minimization.md) already minimized crossings _between_ ranks.
If node A sends edges to items at orders 1, 4 and 6 in the next rank, and those ports are placed
left-to-right in that same sequence, then those three edges leave A in the same left-to-right order
they arrive in below. They cannot cross **each other** near the node.

```text
   UNSORTED (ports in edge-declaration order)     SORTED (ports by target order)

        ┌──────────────────┐                          ┌──────────────────┐
        │        A         │                          │        A         │
        └──┬─────┬─────┬───┘                          └──┬─────┬─────┬───┘
           │     │     │                                 │     │     │
           └──╲ ╱└─╲  ╱┘                                 │     │     │
              ╳    ╲╱                                    │     │     │
           ╱─╱ ╲   ╱╲                                    │     │     │
        ┌──┴┐ ┌─┴─┐ ┌┴──┐                            ┌───┴┐ ┌──┴─┐ ┌─┴──┐
        │ B │ │ C │ │ D │                            │ B  │ │ C  │ │ D  │
        └───┘ └───┘ └───┘                            └────┘ └────┘ └────┘
        order 0   1    2                             order 0    1     2

        three avoidable crossings                    zero
```

Cost: $O(\deg \log \deg)$ per node. Compare with v1, which searched port assignments in an outer
loop and re-ran the entire A\* router — grid, ledger, rip-up and all — for every candidate port
state.

Flat-edge ports on `Left`/`Right` sides sort by the **other endpoint's y** instead, using
`total_cmp` rather than `partial_cmp` so a NaN coordinate cannot make the comparator inconsistent
and the sort order implementation-defined. Every sort ends with the edge index as a tie-break, so
the result is byte-identical across runs.

### 5.5 Lane assignment happens in coordinate space

The sort above makes attachment locally crossing-free. It says nothing about what happens once two
edges are in the same channel — and that turns out to be where every crossing this engine draws
comes from.

**Every route crosses a channel as a Z.** It drops at `from_x` from the band above, runs horizontally
at its lane's y, then drops again at `to_x` into the band below. Two such Zs can only meet in one
place: where a _horizontal run_ of one passes a _vertical drop_ of the other. Horizontal runs never
meet each other — different lanes are different y, and same-lane runs are x-disjoint by construction.
Vertical drops never meet each other — different x.

This is not a claim, it is a measurement. Classifying all 148 geometric crossings the corpus produced
before this pass existed: **148 horizontal×vertical, 0 horizontal×horizontal, 0 vertical×vertical.**

That makes the crossing count a pure function of the lane **order**. With `a` in the shallower lane,
exactly two crossings are possible, and the mirror pair if you swap them:

```text
    a shallower                            b shallower
    ────────────────────────────           ────────────────────────────
    band above                             band above
      │ a          │ b                       │ a          │ b
      └──── a's run ┼─────                    │      ┌──── b's run ────┐
                    │              <─ b drops │      │                 │
      ┌──── b's run ┘                  through└──────┼──── a's run ────┘
      │                                a's run       │
    band below                             band below

    cost = [b.from_x inside a's span]       cost = [a.from_x inside b's span]
         + [a.to_x   inside b's span]            + [b.to_x   inside a's span]
```

A **fan-in** — fifteen shards converging on one reducer — wants its longest run _deepest_: every
other segment drops somewhere inside it, so anything shallower gets cut by all fourteen. A
**fan-out** wants the exact opposite. Any single hand-picked sort key gets one of those two right and
the other catastrophically wrong, which is why the order is derived from the pair cost itself:
adjacent-swap descent, where exchanging two neighbours changes the total by exactly
`cost(b,a) − cost(a,b)`, so a sweep that exchanges every improving pair is a descent step.

The cost also charges a **merge**: when the shallower edge _leaves_ the channel at the same x the
deeper one _enters_ it, their two verticals run along one line between the lanes and the deeper edge
is hidden. Weighted at 4 — worse than the two crossings a pair can otherwise produce, because a
crossing stays readable and a merge does not. That term was missing from the first version of this
pass, and the audit's collinear-overlap check found it within one run.

**Two tiers, and a floor.**

1. **Order, then pack.** Walk the crossing-optimal order and open a new lane only on a genuine
   overlap. Merging only ever joins segments adjacent in the order, so lane index stays monotone in
   it and the ordering's count is realised exactly.
2. **Colour, then permute.** If tier 1 needs more lanes than the channel has room for, colour by
   ascending left endpoint instead — greedy colouring of an interval graph uses exactly the maximum
   overlap depth, the provable minimum — then permute whole lanes by the same descent. Coarser, since
   a lane moves as a unit, but it fits whenever the drawing has room at all.
3. If even tier 2 does not fit, Phase 6's assignment is kept untouched, so this pass can never make a
   channel worse than it was before it existed.

Capacity is measured from the **realised** gap between the band bottom and the next rank's top, not
from Phase 6's count — `rank_gap` frequently makes the actual gap larger, and the optimiser should
have the room the drawing actually has. Phase 6's count is folded in with a `max` so float error can
never report less room than was reserved.

Channels with more than `laneOrderMaxSegments` (default 1024) segments keep Phase 6's assignment; the
optimiser is quadratic in one channel's segment count and this bounds it. The default is set where
the cap stops being free rather than where it stops being cheap: on a 10 600-edge mesh and an
800-edge double fan, raising it from 256 to 1024 cost no measurable time and cut the fan's crossings
by 15%.

---

## 6. Port spacing, and where node growth actually happens

### 6.1 Destination affinity — the default

Even distribution treats a node's face as a row of identical pigeonholes. For routing that is exactly
backwards: it puts a port at the far end of a node from the thing it connects to, and the channel run
then has to travel all the way back. That run is what other edges' drops cut, so a longer one is not
merely uglier — it is measurably more crossings.

So each port instead states a **want**: the x at which the route will traverse the adjacent chain item
(`pass_x`, not the item's plain centre — the two differ for a badge under `beside-edge`, where the
line runs down the reserved left half). The face then places every port as near its want as two
constraints allow: the sorted order from §5 must survive, and consecutive ports must stay
`port_pitch` apart inside `[x + padding, right − padding]`.

**This is a projection, not a heuristic.** Substituting $q_i = p_i - i \cdot \text{pitch}$ turns "at
least pitch apart" into plain "non-decreasing", so the problem becomes _find the non-decreasing
sequence closest to the shifted wants_ — isotonic regression, solved exactly in one pass by
pool-adjacent-violators. It is therefore the **optimal** placement for the given order, and because
the result is monotone in the input index it cannot permute the ports and undo the sort that made the
attachment crossing-free.

Measured effect on the corpus: bends **432 → 368**, geometric crossings **44 → 40**.

Set `portDestinationAffinity` off to get the even distribution below, which is also what a face too
crowded to hold `CROWDED_MIN_PITCH` falls back to.

### 6.2 Even distribution — the fallback

With `n` ports to place on a side of length `L`:

$$ \text{pitch} = \frac{L - 2 \cdot \text{portEndpointPadding}}{n + 1}, \qquad
\text{offset}_i = \text{portEndpointPadding} + (i+1) \cdot \text{pitch}$$

The `n + 1` divisor is what leaves a gap at both ends instead of parking the first and last port on
the corners.

**Worked example.** A node 300 wide with 3 bottom ports, default `portEndpointPadding = 16`:

$$\text{pitch} = \frac{300 - 32}{4} = 67$$

giving ports at x-offsets **83, 150, 217**. Symmetric, and 83px clear of each corner.

### When the node is too narrow

A node with 40 edges and a 120px side would need a pitch of under 3px. The right answer is to make
the node wider — and that happens in **Phase 0**, not here. Ingest computes each node's degree and
grows its box to fit its port count, clamped at `max_node_width` (default 420). Node width is an
input to ranking, ordering and separation, so it has to be final long before this phase runs.

Which means the crowded branch here only fires when Phase 0's growth **hit the clamp**. At that
point the coordinates are already final and the node cannot be widened, so ports are allowed to
crowd instead:

```rust
const CROWDED_MIN_PITCH: f64 = 2.0;
// pitch pinned at 2.0; the run is re-centred on the side:
//   base = side_length / 2.0 - (n + 1) * pitch / 2.0
```

Re-centring rather than overflowing keeps the invariant that **every port lies on the node
boundary** intact. Ports piled onto a corner would break that more visibly than dense ports do, and
downstream validation checks it exactly.

### Stubs

Every `PortRef` carries both the boundary `point` and a `stub` exactly `port_stub_length` (default
20) along the side's outward normal. A router can emit `point → stub` as its first segment without
re-deriving the direction, and the stub is what guarantees an edge leaves its node perpendicular
before it turns.

---

## 7. Materialising the polyline

Now the actual drawing, in
[`route_chain_with_bands`](../../crates/gvui/src/5_edge_routing/5_2_lane_router.rs).

### Where a channel lives

$$\text{bandBottom}(r) = \text{rankTop}(r) + \max_{i \in r} \text{height}(i)$$

$$\text{channelY} = \text{bandBottom}(r) + \text{portStubLength} + (\text{lane} + 0.5) \cdot
\text{laneSpacing}$$

The `+ 0.5` centres the run inside its lane. The lane index comes from
the lane table [§5.5](#55-lane-assignment-happens-in-coordinate-space) refined from Phase 6's
colouring, keyed by `(edge, link)`. A missing entry defaults to lane 0,
which is the only choice that keeps the route inside the reserved gap.

`rank_band_bottoms` is computed **once** per phase and passed in. The naive alternative rescans a
rank for every link that starts in it, which is $O(\text{links} \times \text{rank width})$ over the
whole graph.

### The loop

For each link `(from, to)` of the chain:

```text
   from_x   = source stub x    if this is the first link, else pass_x(from)
   to_x     = target stub x    if this is the last link,  else pass_x(to)

   push (from_x, channelY)          ← drop into the channel
   push (to_x,   channelY)          ← run along the channel

   if last link:  push target stub, push target port point
   else:          push (to_x, bandEntryY(to)), push (to_x, to.y + to.height)
```

The two interior points traverse a dummy or label item vertically through its band. They are
usually collinear with the channel drops on either side and vanish in simplification; they exist so
that a label under `AboveEdge` placement can pull the traversal down to its bottom face without a
special case in the loop.

`pass_x` is where a chain crosses an item's band:

| item kind | `pass_x` |
| --- | --- |
| dummy | `center_x` — this is what keeps a Brandes–Köpf-aligned chain perfectly straight |
| label, `OnEdge` (default) / `AboveEdge` | `center_x` |
| label, `BesideEdge` | `item.x + item.width / 4` — down the middle of the reserved **left half**; the badge occupies the right half |

Under `BesideEdge`, Phase 4 reserves a **double-width** label item: the left half is the edge's own
lane, the right half is the badge. That is why `label_box_width()` exists — a caller wanting the
badge's own width must not read `item.width`. Under the default `OnEdge` the item is single-width,
the line runs straight through its centre, and the badge is drawn over the line — see
[chapter 06 §7](./06-layering-and-labels.md#7-the-three-placements).

### Simplification

`simplify_polyline` drops zero-length steps and interior points that lie on the straight run
through their neighbours. Two properties are load-bearing:

- **Endpoints are preserved bit-exactly.** The first and last elements of the result are
  bit-identical copies of the input's, never a deduplicated near-neighbour. Phase 9 checks that a
  route starts and ends on a node boundary by exact comparison against the port point, so a
  sub-epsilon drift here would read as a hard constraint violation.
- **A backtracking spike is preserved.** A point is only dropped when the path continues *forward*
  through it. Removing a spike would change the drawn shape, not simplify it.

Collinearity is measured as perpendicular distance from the segment `prev → next`, so the function
is correct for diagonal (spline / straight style) polylines too, not just axis-aligned ones.

### Two worked routes

**Aligned span-1 edge.** A above B, both 100 wide, both centred on the same x. Source port at
(50, 40), target port at (50, 200), and every intermediate point lands on x = 50. Simplification
collapses everything to **two points** — a straight vertical line, no bends.

**Span-2 edge through a dummy.** A at rank 0, a dummy at rank 1, B at rank 2, all at different x:

```text
                 ┌──────────┐
                 │    A     │
                 └────┬─────┘
                      │            ← stub, straight down
        ══════════════┴═══════╗    ← channel below rank 0, lane l
                              ║
                              •    ← dummy at rank 1, traversed at its centre x
                              ║
                  ╔═══════════╝    ← channel below rank 1
                  ║
                  │                ← stub, straight down
             ┌────┴─────┐
             │    B     │
             └──────────┘
```

Every emitted segment is axis-aligned. The dummy's centre is where the route crosses rank 1 — so if
Brandes–Köpf aligned that dummy with something above and below it, the two channel runs vanish and
this becomes a straight line too.

### Why the channel provably fits

This is the arithmetic that makes "routing cannot fail" a statement rather than a hope. Phase 6
sized the gap below rank `r` as

$$\text{gap} \ge \text{lanes} \cdot \text{laneSpacing} + 2 \cdot \text{portStubLength}$$

With defaults (`laneSpacing = 12`, `portStubLength = 20`) and `lanes` lanes in the channel:

| | value |
| --- | --- |
| shallowest lane (`l = 0`) | `bandBottom + 20 + 6` = **26 below the band bottom** |
| deepest lane (`l = lanes − 1`) | `bandBottom + 20 + 12·lanes − 6` = `bandBottom + 12·lanes + 14` |
| next rank's band top | `bandBottom + gap` ≥ `bandBottom + 12·lanes + 40` |
| clearance at the far end | ≥ **26** |

Both ends clear by at least 26px, and two links in the same channel with different lanes are always
exactly `laneSpacing` apart. **A route emitted here cannot overlap a node and cannot run collinearly
along another edge.**

(In practice the configured `rank_gap` of 120 dominates until about seven lanes:
$7 \times 12 + 40 = 124 > 120$. Below that, channels sit in space the layout already had.)

---

## 8. Self-loops

A self-loop has no ordering, no rank span and no lane. Its geometry is a direct function of the
node's rectangle and a stacking index, computed in
[`route_self_loop`](../../crates/gvui/src/5_edge_routing/5_3_special_routes.rs):

```rust
step   = max(effective_lane_spacing, MIN_LOOP_STEP)          // MIN_LOOP_STEP = 4.0
reach  = port_stub_length + (ring + 1) * step
spread = clamp(half_height/3 + ring * max(port_pitch, 4), 1, half_height - 1)
```

The loop leaves the right side **above** the node's centre and re-enters **below** it, so the two
ports are distinct and the arrow direction is legible.

```text
              ┌────────────────┐
              │                ├────────────┐   ← exit,  centre_y − spread
              │      node      │            │
              │                ├────────────┘   ← entry, centre_y + spread
              └────────────────┘
                               └── reach ───┘
```

Successive `ring` values grow **both** the outward reach and the vertical spread, so multiple loops
nest concentrically instead of overlapping. Port indices are `ring*2` and `ring*2 + 1`, so nothing
downstream collapses two loops into one.

**Worked example.** A node at (10, 20), 100 × 60, with default config. `half_height = 30`,
`centre_y = 50`, `step = 12`, `reach = 20 + 12 = 32`, `spread = 30/3 = 10`. The loop exits at
(110, 40), runs out to x = 142, comes back at (142, 60), and re-enters at (110, 60).

The vertical spread is capped at the node's own half-height. A node with more self-loops than it is
tall will eventually stack loops that share a port height — a degenerate case no amount of geometry
can fix, which the caller should surface as a diagnostic rather than route around.

---

## 9. Flat edges

A flat edge joins two items in the **same rank**. Its shape is always
`port → stub → corridor → stub → port`: two horizontal runs at the two port heights, joined by one
vertical jog in the corridor Phase 6 reserved between the two items' orders.

```text
   ┌────────┐                          ┌────────┐
   │        │                          │        │
   │   A    ├──────┐                   │        │
   │        │      │                   │   B    │
   └────────┘      └───────────────────┤        │
                   ↑                   │        │
                   corridor lane       └────────┘
```

The corridor x is

$$x = \text{gapLeft} + (\text{lane} + 0.5) \cdot \text{laneSpacing}$$

where `gapLeft` is the right edge of the item at `after_order`. Phase 6 widened that separation to
`max(node_gap, lanes · laneSpacing) + labelWidth`, so the lane lands inside the gap by construction.
The value is then clamped into the interval between the two stubs — a no-op on well-formed input,
present only to keep the polyline monotone (and therefore self-intersection-free) if a corridor were
ever assigned outside the span.

When both ports sit at the same height — the common case for equal-height neighbours — the jog has
zero length and simplification collapses the whole thing to a **straight two-point line**.

---

## 10. Badges are a lookup

In v1, badge placement was a ~1,000-line candidate generator: rotate the label through candidate
offsets, score each one, build a disjoint-set conflict graph over all candidate pairs (up to
$48^2 = 2{,}304$ geometric tests per badge pair), then **backtrack** when a set of badges could not
be simultaneously satisfied, building a `format!` state-key string at every DFS node.

In v2 it is a lookup, in
[`place_badges`](../../crates/gvui/src/5_edge_routing/5_4_badges.rs):

```rust
badge.rect   = the Label item's own box        // positioned by Phases 5 and 7
badge.anchor = nearest point on the polyline
```

Phase 4 turned the label into a `Label` item, Phase 5 ordered it among its rank's siblings, Phase 6
included it in the separations and Phase 7 gave it coordinates. The space is allocated by
construction, so there is nothing to search for and nothing to retry. Under the default `OnEdge` the
badge *is* the item box inset by `badge_clearance`, and the route runs through its centre. Under
`BesideEdge` the badge takes the right half of the double-width item; `badge_clearance` is spent as a
push away from the edge's lane, and only as far as the spare width allows, so the badge is never
shrunk below its measured size.

Flat-edge badges centre on the corridor's vertical run — the corridor was already widened by the
label width. A flat edge between two rank *neighbours* has no vertical run at all, because it
collapses to one straight horizontal segment; its badge then sits at the segment's midpoint, which is
the middle of a gap Phase 6 widened by the badge width, so it clears both nodes by the same argument.
Self-loop badges hang off the loop's outer vertical run, which is the only part of a loop guaranteed
clear of the node.

### The dashed connector is drawn only when it is honest

The renderer ([`EdgeBadgeOverlay.tsx`](../../src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx))
joins a badge to its anchor with a dashed connector **only when the anchor falls outside the badge
rect**. The test is containment, not distance from the badge centre: under `on-edge` the anchor is
the point of the edge the badge covers, so it lies inside the rect and a connector would point at the
thing it starts from. A wide badge whose anchor sits well off-centre but still under the rect is the
same case, and a distance test would miss it.

That rule is what makes `on-edge` the right default. The old `beside-edge` default put the badge in
the right half of a double-width item and unconditionally drew a leader to the anchor — a drawing
full of dotted connectors, every one of them redundant.

### The safety net, and what a leader line means

There is one piece of search-shaped code, and it fires only for a **degenerate case**: an edge that
carries a label but never received a `Label` item. That means a labelled edge drawn at **span 1** —
the one span at which a badge has no home — which
[Phase 3's `enforce_labelled_span`](./05-rank-assignment.md#8-the-span-1-rule-for-labelled-edges)
exists to make impossible. The net tries five fixed offsets
along the route — ratios `0.5, 0.35, 0.65, 0.2, 0.8`, most central first — perpendicular to the
segment at the midpoint, checking each against a uniform spatial hash of nodes and already-placed
badges. No rotation, no scoring, no backtracking. If none clears, the badge is left at the midpoint
offset and a **leader line** is drawn from the route to it.

So `leader_count` is not a crowding measure. It is a **signal that an upstream reservation was
missing**. A healthy layered layout reports zero, and every layered fixture in the audit does. See
[Chapter 11](./11-emit-and-quality.md#the-two-early-warning-signals).

One contract point: `BadgePlacement::label` is left **empty** here. `GraphIr` interns edge *ids* but
not label text — nothing after Phase 1 is allowed to see text — so Phase 9 joins placements back to
the wire edges by `edge_id` and fills the display string in.

---

## 11. Octilinear edges are a post-pass, not a router

`edgeStyle: "octilinear"` is the "8-direction" look: each right-angle corner of the finished route
becomes a 45-degree chamfer.

```text
   orthogonal corner                 chamfered corner

        │                                 │
        │                                 │
        │                                 ╲            entry = cur − c along the incoming leg
        └────────────                      ╲───────    exit  = cur + c along the outgoing leg

        2c of axis-aligned travel   →   c·√2 of diagonal, a saving of c(2 − √2) ≈ 0.59c
```

It is implemented in
[`chamfer_corners`](../../crates/gvui/src/5_edge_routing/5_5_edge_style.rs), and it is deliberately
**not** an eight-direction router. That distinction is the whole design decision, so it is worth
being explicit about the alternative and what it would cost.

### Why not a real octilinear router

The lane model is what makes routing exact. Channels between rank bands are **axis-aligned
intervals**; the set of edges wanting to share a channel is therefore an interval graph; and interval
graphs are optimally colourable in a single sweep. That is the entire reason
[Phase 6](./08-routing-demand.md) can reserve the exact space every segment will need *before any
geometry exists*, and therefore the reason routing in this engine cannot fail — no rip-up, no
reroute, no budget to exhaust (§13).

Octilinear channels have no equivalent exact colouring. A diagonal corridor is not an interval on
either axis, and the conflict graph of a set of diagonals is not perfect. A true eight-direction
router would mean replacing an exact reservation with a search, and **giving up the guarantee that
every edge routes** — which is the one property the whole v2/v3 architecture was built to obtain. A
chamfer post-pass buys most of the visual benefit — softer turns, shorter paths — while keeping it.

### Why the post-pass cannot fail

For a corner `prev → cur → next`, the vertex `cur` becomes two vertices, each offset along its own
leg by

$$c = \min\bigl(\text{cornerCut},\; \tfrac{1}{2}\min(\text{len}_{\text{in}}, \text{len}_{\text{out}})\bigr)$$

The "half the shorter leg" clamp is what lets every corner be decided **in isolation**: two
neighbouring corners each claim at most half of the leg they share, so their chamfers can meet but
never overlap, and the pass needs no lookahead. `prev` is read from the *input* polyline rather than
from the output being built, which is what preserves that bound.

A corner is left square when

- it is not a right angle — either leg is diagonal, or the two legs are collinear;
- the chamfer would be sub-epsilon; or
- the resulting diagonal would touch a node's box, grown by `CHAMFER_NODE_CLEARANCE = 2.0`.

Every rejection is local and independent, so **the worst case is the unmodified orthogonal
polyline**. There is no state to roll back and no way for the pass to report failure; it degrades to
plain orthogonal one corner at a time.

The collision test uses a uniform spatial hash local to Phase 8 (`NodeRectIndex`) rather than Phase
9's — routing must not depend on validation, because validation is allowed to be compiled out of a
release build and routing is not. Every uncertain answer is `true` (blocked): a non-finite endpoint, a
query box too large to bucket, or an index poisoned by a non-finite input rectangle. Over-reporting
only leaves a corner square.

Two smaller contract points:

- **Endpoints survive bit-exactly.** `c` never exceeds half a leg, so the chamfer of the corner at
  index 1 stops at the midpoint of the stub and can never reach the port point — which Phase 9
  compares by exact equality.
- **Length never increases.** Each applied chamfer trades `2c` of axis-aligned travel for `c·√2`.

### Where it runs, and what drives its size

The chamfer is the **last** thing the routing facade does, deliberately *after* badge placement.
Badges are positioned against the orthogonal geometry Phase 4 reserved item space for, and a chamfer
only ever removes area from inside the corner triangle it replaces, so no anchor a badge was measured
against moves. Running it here also keeps badge output byte-identical between the orthogonal styles
and this one.

The chamfer size is `max(corner_radius, MIN_CORNER_CUT = 12.0)`. One knob drives both the rounded and
the octilinear look; the floor exists because `corner_radius` defaults to 8, and an 8px chamfer on a
120px-wide node reads as a rendering artefact rather than a diagonal.

The renderer draws octilinear routes as a **plain polyline** and ignores `cornerRadius`: the engine
has already replaced each right-angle corner with a chamfer, so the chamfer segments *are* the
corners. Rounding them again would eat the very geometry that makes the style look different, and
would round the chamfer's own two shallow joints into a wobble.

---

## 12. Corner rounding happens at render time

The Rust engine emits axis-aligned waypoints and nothing else — `octilinear` (§11) excepted, and it
is the only exception. Rounding is applied in TypeScript,
in [`edgePath.ts`](../../src/engine/layout/custom/edgePath.ts), by replacing each interior corner
with a quadratic Bézier of radius

$$r = \min(\text{cornerRadius}, \tfrac{1}{2}\text{len}_{\text{in}}, \tfrac{1}{2}\text{len}_{\text{out}})$$

The clamp against half of each adjacent segment guarantees two neighbouring corners can never claim
overlapping arcs on the segment between them, so the transform never has to look at more than one
vertex at a time. A vertex is left sharp when either adjacent segment has ~zero length or the two
are collinear.

The reason this lives on the client is not tidiness. `cornerRadius` and `edgeStyle` are **pure
rendering decisions** — they change no node position, no port assignment, no lane allocation. Moving
the slider re-derives the path string from the cached `points` array and re-renders immediately,
with no WASM call, no worker round trip, and no layout-cache invalidation.

The five styles:

| `edgeStyle` | rendering |
| --- | --- |
| `orthogonal` | `M`/`L` through every waypoint, sharp corners |
| `rounded` (default) | as above with quadratic corners at `cornerRadius = 8` |
| `spline` | Catmull–Rom through the waypoints, converted to cubic Béziers |
| `octilinear` | `M`/`L` through every waypoint — the chamfers of §11 *are* the corners, so `cornerRadius` is ignored |
| `straight` | `M first L last` — interior waypoints ignored |

Only `octilinear` changes the points the engine emits; the other four are pure render-time reads of
the same array.

**`edgeStyle` is not a mode.** v2 shipped a separate `layered-spline` engine mode that resolved to
the same `layout_layered` function and differed only in the path command. v3 deletes it: there are
[two modes](../modes/README.md), `layered` and `radial`, and the spline look is now just
`edgeStyle: "spline"`.

Rust does keep a `points_to_svg_path` helper, at fixed three-decimal precision. It exists solely so
the native audit harness can render the same geometry the browser does and keep snapshots stable.

---

## 13. The guarantee, and why there is no fallback

Putting it together:

- **Phase 6** reserved a lane for every horizontal run and every vertical jog, by exact
  interval-graph colouring — the provable minimum number of lanes.
- **Phase 7** honoured those separations exactly, with an unconditional repair pass making it a
  property rather than a hope.
- **Phase 8** evaluates the polyline from the lane index.

Therefore **a route cannot fail and cannot overlap a node.** There is no rip-up, no reroute, no
`unresolved_soft_conflicts` state reachable from routing, and no fallback path.

This is why there is no collision check in the router. Adding one would be dead code that hides an
upstream bug rather than catching one — if a route ever did overlap a node, the correct response is
to fix Phase 6 or 7, not to nudge the line.

`route_chain` returns `None` only for **structurally impossible** input: an out-of-range index, a
chain with fewer than two items, an item index that does not resolve, a missing port. In a
well-formed pipeline every chain routes. A `None` is a defect signal, and it surfaces in Phase 9 as
`unresolved_route_count` and a `MISSING_ROUTE` diagnostic — never as a silently missing line.

### Determinism and totality

[`route_edges`](../../crates/gvui/src/5_edge_routing/5_6_route_facade.rs) visits chains, then flat
edges, then self-loops, each by ascending index, so the `routes` vector has the same order for the
same input in every process. The self-loop stacking counter is a dense `Vec` indexed by node, so the
stacking index depends only on the order of `layered.self_loops` and never on hashing.

---

## 14. What is recorded but not yet used

Ingest groups parallel edges between the same unordered node pair into `Bundle`s, and
`bundle_parallel_edges` defaults to `true`. Nothing in Phase 8 currently consumes them — bundled
edges are routed individually like any other. The grouping exists in the IR; the trunk-and-split
rendering the design note describes is not implemented.

---

## 15. Cost

| step | cost |
| --- | --- |
| Port collection | $O(E)$ |
| Side scoring | $O(16E)$ — sixteen closed-form evaluations per chain, no search |
| Port sorting | $O(\sum_v \deg(v) \log \deg(v))$ |
| Straight-shot alignment | $O(E \log E)$ for the weight sort, then $O(1)$ per chain |
| `rank_band_bottoms` | $O(V)$, computed once |
| Polyline materialisation | $O(\text{bends})$ per edge — a table lookup per link |
| Simplification | $O(\text{points})$ per edge |
| Badge placement | $O(B)$ lookups; the safety net costs 5 spatial-hash queries per orphan |
| Octilinear chamfering | $O(\text{points})$ per edge, one spatial-hash query per corner; skipped entirely for the other styles |

No term in that table is quadratic and none of it iterates. The sixteen combinations are the constant
16, not a branching factor: nothing is expanded, scored again, or revisited. Against v1's 4,979 ms of
routing for a 12-node graph, the entire pipeline for that fixture is **0.14 ms**.

---

← [Coordinate Assignment](./09-coordinate-assignment.md) | [Index](./README.md) | [Next: Emit and Quality →](./11-emit-and-quality.md)
$$
