← [Rank Assignment](./05-rank-assignment.md) | [Index](./README.md) | [Next: Crossing Minimization →](./07-crossing-minimization.md)

# Phase 4 — Layering and Labels

This is the chapter that carries the engine's central idea, so here it is up front:

> **An edge badge is an item in the layered graph, carrying its measured box.**

Everything else in this chapter follows from that sentence. Because a badge is an ordinary item, the
machinery that separates nodes separates badges too, the machinery that sizes a row sizes it around
badges too, and the space a badge needs is reserved *before any route exists*. It cannot fail to fit.
So there is nothing to retry — and v1's entire badge-placement subsystem, all 1,003 lines of it,
collapses into a lookup.

We get there in three steps: why long edges need dummy items, how a chain is built, and then the
label item itself.

See [the implementation](../../crates/gvui/src/3_crossing_minimization/3_1_layer_builder.rs).

---

## 1. The problem with a long edge

Phase 3 gave every node a rank. Most edges now join adjacent ranks, but some do not:

```text
rank 0    [ A ]
             |
rank 1    [ B ]   [ C ]        edge A -> D spans three ranks,
             |     |           passing straight through ranks 1 and 2
rank 2    [ E ]   [ F ]
             |     |
rank 3    [ D ] <-+
```

That long edge is a problem for every phase downstream, and the same problem each time: **the edge
occupies horizontal space on ranks 1 and 2, but nothing on rank 1 or 2 knows it is there.**

- **Ordering** (Phase 5) minimises crossings by comparing the order of items on rank $r$ against
  their neighbours on rank $r+1$. An edge that skips those ranks contributes nothing to the count,
  so the ordering that gets chosen is optimal for a graph that is not the one being drawn.
- **Coordinate assignment** (Phase 7) positions items in a rank with a separation constraint between
  each adjacent pair. A line passing between two nodes needs room; if it is not an item, no
  constraint reserves that room.
- **Routing** (Phase 8) would have to discover the line's path geometrically — which is exactly the
  pathfinding v2 exists to delete.

The classical fix, from Sugiyama's framework, is to **subdivide**: replace the long edge with a chain
of short ones by inserting a placeholder item on every rank it crosses.

```text
rank 0    [ A ]
           |  \
rank 1    [ B ] o           o = a dummy item: zero width, zero height,
           |     |              but a real position in rank 1's ordering
rank 2    [ E ]  o
           |     |
rank 3    [ D ] -+
```

A **dummy** has width 0 and height 0, so it costs no area, but it has a rank and an `order` like any
other item. Now the ordering phase can count the crossing between $A \to D$ and $B \to E$ properly,
coordinate assignment gives the dummy an $x$ and keeps its neighbours away from it by `node_gap`, and
the route is simply the polyline through the dummies' positions. The long edge became visible to
every phase that needed to see it.

---

## 2. One item type for three things

The layered graph is an arena of `Item`, and there is exactly one item type:

```rust
pub enum ItemKind {
    Real(u32),                       // an input node
    Dummy { edge: u32, seq: u16 },   // a bend point of a long edge
    Label(u32),                      // an edge badge occupying reserved area
}

pub struct Item {
    pub kind: ItemKind,
    pub rank: u16,
    pub order: u16,     // position within the rank; the sole output of Phase 5
    pub width: f64,
    pub height: f64,
    pub x: f64,         // top-left corner; filled by Phase 7
    pub y: f64,
}
```

The uniformity is deliberate and it is the whole trick. Every downstream phase treats a `Label`
exactly like a `Real`, so **no phase needs label special-casing**. There is no `if item is a badge`
branch in ordering, in separation, in rank height. There is nothing to get wrong, because there is
nothing to write.

See the type definitions in [`0_1_types.rs`](../../crates/gvui/src/0_common/0_1_types.rs).

---

## 3. Building a chain

For each edge, Phase 4 computes $span = rank(target) - rank(source)$ using the endpoints **after**
Phase 2's reversal, and dispatches:

| case | what is built |
| --- | --- |
| `span == 1`, no label | a direct link — no intermediate items at all |
| `span >= 2`, no label | a `Dummy` on every intermediate rank |
| `span >= 2`, labelled | a `Dummy` on every intermediate rank **except one**, which is a `Label` |
| `span == 0` (flat) | no chain; a `FlatEdge` record instead (§7) |
| self-loop | no chain; carried through for Phase 8 to route against a fixed port pair |

There is no row for `span == 1, labelled`, and that is the point: Phase 3 guarantees it cannot happen
(§5). Such an edge falls through the table as a plain direct link and loses its reservation, which is
why the case is treated as a defect rather than a shape.

A reversed feedback edge is expanded exactly like a forward one. Nothing is dropped; only the
arrowhead learns the truth, at emit time. A span that still comes out negative is a Phase 2 bug — it
trips a `debug_assert` — but in release the endpoints are swapped so the chain is still built rather
than the process dying.

The result per edge is an `EdgeChain`:

```rust
pub struct EdgeChain {
    pub edge: u32,
    pub reversed: bool,
    pub role: EdgeRole,
    pub items: Vec<u32>,        // [source_real, dummy.., label?, dummy.., target_real]
    pub label_at: Option<usize>, // index within `items` of the Label item
}
```

`items` is **source-first** and includes both endpoints, so a span-4 edge has five entries (source,
three intermediates, target) and four links. `label_at` indexes into `items`, not into the intermediates, which is why the builder adds 1
when recording it — slot 0 is the source node.

`Dummy::seq` counts dummies along the chain from 0 and **skips the label**, so a span-4 labelled edge
produces `Dummy{seq: 0}`, `Label`, `Dummy{seq: 1}`.

---

## 4. Rank-major storage

Items live in one flat `Vec`, grouped by rank:

```rust
pub struct Layered {
    pub items: Vec<Item>,
    pub rank_ranges: Vec<Range<u32>>, // rank_ranges[r] slices `items` for rank r
    pub up: Csr,                      // predecessors, restricted to rank r-1
    pub down: Csr,                    // successors, restricted to rank r+1
    pub chains: Vec<EdgeChain>,
    pub flat_edges: Vec<FlatEdge>,
    pub self_loops: Vec<u32>,
    pub item_of_node: Vec<u32>,       // item index of each real node
}
```

Picture the arena for a three-rank graph:

```text
items:      [ A ][ B ][ C ][ D ][ o ][ E ][ F ]
             \________/  \________/  \______/
rank_ranges:   0 .. 2      2 .. 5     5 .. 7
                rank 0      rank 1     rank 2

order:          0    1     0    1    2    0    1
```

**`order` is an index into a contiguous slice, and that is not a coincidence.** The physical position
of an item inside `rank_ranges[r]` always equals its `order` field. Two things follow:

- `item_index(rank, order) = rank_ranges[rank].start + order` is a single addition. Phases that walk
  a rank left to right — crossing counting, lane demand, Brandes–Köpf — do so with sequential memory
  access rather than pointer chasing.
- Phase 5 reorders a rank by **permuting the slice in place** and rewriting `order` to match. It may
  never move an item between ranks. Physical position is the ground truth; `order` is repaired to
  agree with it, not the other way round.

The initial order inside a rank is *real nodes by ascending node index, then chain items by ascending
edge index*. That is a deterministic seed derived from input order, not a heuristic — Phase 5 will
replace it. It falls out of the construction: reals are placed in a first pass, chain items in a
second.

`up` and `down` are CSR adjacencies over **item** indices (never node indices), built from the same
ordered arc list, so `up` is the exact transpose of `down`. Both contain only rank-crossing links, so
flat edges and self-loops contribute nothing to them.

---

## 5. The label item

Now the part everything else was building towards.

An edge that carries a label reaches this phase with `minlen = 2` already applied by Phase 0
([chapter 05 §6](./05-rank-assignment.md#minlen-and-why-a-labelled-edge-gets-2)), so it spans at
least two ranks and has at least one intermediate rank available — or it reaches this phase at span
**0**, which is a flat edge and is drawable too (§8). Those are the only two possibilities, and that
is a rule Phase 3 enforces rather than a coincidence:

> **A labelled edge arrives at span 0 or span ≥ 2, never at span 1.**

Span 1 has no intermediate rank to carry the item and no horizontal run to ride, so it is the one
span at which a badge has nowhere to live. Phase 3 pushes any labelled edge left sitting there apart
as its very last act — see
[chapter 05 §8](./05-rank-assignment.md#8-the-span-1-rule-for-labelled-edges).

The rest of this section is the span ≥ 2 case; the span 0 case is [§8 of this
chapter](#8-flat-edges); and "the degenerate case" below is what the builder does if the invariant is
ever broken upstream.

For span ≥ 2 the builder picks the **middle** intermediate rank:

$$label\_rank = \operatorname{clamp}\bigl(rank_{from} + \lfloor span/2 \rfloor,\; rank_{from}+1,\; rank_{to}-1\bigr)$$

and, instead of a zero-sized dummy, puts an item there carrying the **measured badge box**.

```text
                 span = 2                          span = 4

rank 0        [ source ]                        [ source ]
                  |                                 |
rank 1     [====== label ======]                    o           <- Dummy
                  |                                 |
rank 2        [ target ]                   [====== label ======]  <- Label, rank 0 + 4/2
                                                    |
rank 3                                              o           <- Dummy
                                                    |
rank 4                                          [ target ]
```

That is the entire mechanism. Everything below is a consequence.

### Consequence 1 — ordering positions it among its siblings

The label is in `rank_ranges[label_rank]`, so Phase 5 sorts it along with everything else on that
rank. Its horizontal position is chosen to minimise crossings, by the same median sweep that places
nodes — not by a local collision search that has no idea what the rest of the drawing looks like.

```text
before ordering              after ordering
---------------              --------------
rank 1  [X] [==lbl==] [Y]    rank 1  [X] [Y] [==lbl==]
          \    |      /                \  |     |
rank 2    [Y] ... [X]        rank 2    [Y] [X]  ...
```

The ordering phase gives a `Label` a high displacement priority — above every real node, below
dummies — so a badge is not shoved off the line it annotates when two items contest a position. See
[the ordering implementation](../../crates/gvui/src/3_crossing_minimization/3_3_ordering.rs).

### Consequence 2 — coordinate assignment separates it by `node_gap`

Phase 7 enforces, for every adjacent pair in a rank:

$$x[o+1] - x[o] \;\ge\; \frac{width[o]}{2} + \frac{width[o+1]}{2} + separation\_min[(rank, o)]$$

with `separation_min` defaulting to `node_gap`. The label's `width` is in that inequality like any
other width, so its neighbours are pushed apart by exactly the amount it occupies. Nobody wrote code
to make room for a badge. Room is made for items, and the badge is an item.

```text
rank 1   |<-- w/2 -->|<-gap->|<-------- label width -------->|<-gap->|<-- w/2 -->|
            [ X ]              [========== label ==========]            [ Y ]
```

### Consequence 3 — the rank band is tall enough by definition

A rank's height is `max(item.height)` over its members, and the label item is a member. So the band
is tall enough for the badge **by construction**; there is no pass that grows a band to fit a label,
because there is no situation in which it would not already fit.

Dummies have height 0, so they sit exactly on the band's centre line, and a chain of them shares one
$y$ per rank and renders as a single straight vertical run rather than a staircase.

See [rank bands](../../crates/gvui/src/4_coordinate_assignment/4_2_rank_bands.rs).

### The conclusion

The badge's area is reserved before a single route exists. Routing is handed a rectangle that is
already empty and already the right size, and its job is to look up where that rectangle is. **A
badge cannot fail to fit, so there is nothing to retry.**

The measured confirmation is `leader_count`, the metric counting badges that needed a fallback leader
line because their reservation was defeated. It is **0 on every layered fixture**.

---

## 6. What v1 did instead

v1 placed badges *after* routing, which meant discovering free space in a drawing that was already
finished. `5_7_badge_placement.rs` did it like this:

1. **Generate up to 48 candidate positions per edge** — offsets along and around the routed polyline.
2. **Build a DSU conflict graph** over candidate pairs. Two badges conflict if any of their candidates
   overlap, so this is an all-pairs candidate × candidate comparison: up to $48^2 = 2{,}304$ geometric
   conflict tests **per badge pair**.
3. **Backtrack** through the conflict components looking for an assignment with no overlaps.
4. If it could not find one, emit a **spacing request** — "please make this gap wider and run the
   whole layout again".

Step 4 is the interesting failure. Those spacing requests were computed and then **discarded**:
nothing in the codebase ever wrote the `exact_demands` field they were supposed to land in. The
entire "expand the spacing until the badges fit" retry loop was unreachable. A subsystem whose
fallback path does not exist is a subsystem with no fallback, and it was carrying the correctness of
every labelled edge in the drawing.

v2 has no candidates, no conflict graph, no DSU, no backtracking and no retry. It has a rectangle
that was reserved three phases earlier. `OptimizationStats::spacing_expansions` is a field that is
always `0`, kept only for renderer compatibility.

---

## 7. The three placements

`label_placement` decides how the item is sized, and there are two boxes to keep straight:

- the **item box**, which is the reservation — inflated by `badge_clearance` on every side, and
  doubled on one axis for the offset placements so the polyline has somewhere to run that is *not*
  underneath the badge;
- the **badge box**, which is what actually gets drawn.

With $lw = label.width + 2 \cdot badge\_clearance$ and $lh = label.height + 2 \cdot badge\_clearance$:

| `label_placement` | item $(w, h)$ | edge passes through | badge occupies |
| --- | --- | --- | --- |
| `on-edge` (default) | $(lw,\; lh)$ | the item centre | the whole box, inset by `badge_clearance` |
| `beside-edge` | $(2lw,\; lh)$ | the item's **left face** | the **right half**, inset |
| `above-edge` | $(lw,\; 2lh)$ | the item's **bottom face** | the **top half**, inset |

```text
on-edge (default)       beside-edge                    above-edge
                                                       +---------------+
+-----------+           +-------+-----------+          |   [ badge ]   |
|  [badge]  |           |       |  [badge]  |          +-------|-------+
+-----|-----+           +-------+-----------+          |       |       |
      |                 ^       ^                      +-------|-------+
      |                 |       badge, inset                   |
   the line runs        the line runs down             the line runs along
   through the centre   the LEFT face                  the BOTTOM face
```

### Why `on-edge` is the default

`beside-edge` was the v2 default, and it was the wrong choice.

A badge that sits *beside* its edge is not self-explaining: the reader has to be told which line it
belongs to, so the renderer has to draw a **leader line** from the badge to the anchor on the edge.
One dotted connector is fine. A drawing where every labelled edge has one is worse than a drawing
where each label simply sits on the line it describes — the connectors are visual noise carrying
information the geometry could have carried for free.

Under `on-edge` the item is single-width, the edge runs through its centre, and the badge is drawn
over the line. The anchor is then *inside* the badge rect, and the renderer's rule is containment:
[a connector is drawn only when the anchor genuinely falls outside the badge
rect](./10-edge-routing.md#the-dashed-connector-is-drawn-only-when-it-is-honest), which for
`on-edge` never happens. The offset placements remain available for callers who want the line kept
clear.

### Worked example

A badge measured at 60 × 20, with the default `badge_clearance` of 10:

$$lw = 60 + 20 = 80, \qquad lh = 20 + 20 = 40$$

| placement | item box | if the item lands at $(100, 200)$ |
| --- | --- | --- |
| `on-edge` | 80 × 40 | badge at $(110, 210)$, 60 × 20; anchor $(140, 220)$ — the centre |
| `beside-edge` | **160** × 40 | badge at $(190, 210)$, 60 × 20; anchor $(100, 220)$ — the left face |
| `above-edge` | 80 × **80** | badge at $(110, 210)$, 60 × 20; anchor $(140, 280)$ — the bottom face |

In every case the badge width comes back out as exactly 60. The reservation is the badge plus its
clearance plus, for the offset placements, an equal-sized empty half for the line.

`badge_rect` and `edge_anchor` in the layer builder are the canonical readers of this contract. Phase
8 calls them rather than re-deriving the halves, so the space reserved here and the geometry drawn
there cannot drift apart.

### The degenerate case

If a labelled edge somehow arrives with span 1 there is no intermediate rank, so no `Label` item can
exist. The builder degrades: `label_at` stays `None`, and Phase 8's leader-line safety net places the
badge locally against a spatial hash — with no reservation behind it, and possibly with a leader line
drawn to it.

That is a **defect signal, not a supported mode**. Phase 3's `enforce_labelled_span` exists precisely
to make span 1 unreachable, including for a host that sent an explicit `minLen: 1` on a labelled edge
(the one case where an explicit `minLen` is overridden — a badge with no reservation is the worse
outcome). If this branch ever fires, `leader_count` goes above zero and the audit reports it.

The builder does **not** insert a rank to make room. Inserting a rank here would invalidate the
ranking that five other phases have already treated as settled, and it would paper over a Phase 3 bug
in a phase that cannot see it.

---

## 8. Flat edges

An edge whose endpoints landed on the same rank has $span = 0$. It gets no chain, no dummies and no
`Label` item — there is no intermediate rank to put one on, because there is no intermediate rank.

```text
rank 2      [ A ]  |  [ X ]  |  [ B ]
              +----+----------+----+
                   the flat edge A -> B runs through the
                   vertical corridors between A|X and X|B
```

Until v3 this code had never run. Every edge carried `minlen ≥ 1`, so $span = 0$ was arithmetically
impossible and `FlatEdge` was unreachable. It became reachable when Phase 3 started relaxing
[peer edges](./05-rank-assignment.md#7-peer-edges-and-the-same-rank-relaxation) to `minlen = 0`,
which is what lets two siblings sit side by side joined by a straight horizontal line.

A `FlatEdge` record is emitted instead, carrying the rank, both endpoint item indices, and the
measured `LabelBox`. Its badge lives in the **vertical corridor** between the endpoints, and so its
width becomes a *separation constraint* rather than an item width. Phase 6 computes, for each
corridor the flat edge spans:

$$separation = \max\bigl(node\_gap,\; lanes \times lane\_spacing\bigr) + label\_width$$

The routing lanes and the base node gap are a `max`, because the lanes live *inside* the gap. The
label width is **added on top**, because the badge and the lanes cannot share space. Every corridor
the edge spans gets the widest label covering it.

Different mechanism, same guarantee: the space is computed from the fixed ordering before any
geometry exists, and the coordinate phase is told about it as a constraint it must satisfy. Nothing
is placed and then checked.

So a flat edge carries its badge **on its horizontal run**, not on a rank of its own. The common case
— two rank *neighbours*, with nothing standing between them — collapses to a single straight
horizontal segment, and the badge sits at its midpoint: the middle of a gap this same formula already
widened by the label width, so it clears both nodes by construction. When the endpoints are not
neighbours, the run steps out of the rank band to get past the items in between and comes back down
in the reserved corridor beside the far endpoint; the badge then centres on that corridor's vertical
run, which is again exactly where the width was reserved. Either way the badge sits on the line it
describes and needs no leader.

See [lane demand](../../crates/gvui/src/4_coordinate_assignment/4_1_lane_demand.rs) and
[flat-edge routing](../../crates/gvui/src/5_edge_routing/5_3_special_routes.rs).

Self-loops are handled the same way — no chain, no items — and the edge list is copied straight
through for Phase 8 to route against a fixed port pair on one side of the node.

---

## 9. The consecutive-rank contract

Here is the invariant this phase must never break, and the story of what happened when it did.

> **Every link in a chain connects consecutive ranks.** If items $i$ and $j$ are adjacent in a
> chain's `items`, then $rank(j) = rank(i) + 1$. No exceptions.

`up` and `down` are *declared* as adjacent-rank adjacencies, and three separate phases read that
declaration as a guarantee:

1. **Barth–Mutzel–Jünger crossing counting** (Phase 5) indexes its accumulator tree by the target
   item's `order` within rank $r+1$. A link to rank $r+4$ indexes that tree with a position from the
   wrong rank's index space.
2. **Lane demand** (Phase 6) derives each channel's order intervals from a single rank gap. A link
   spanning several gaps belongs to no single channel.
3. **Brandes–Köpf type-1 conflict marking** (Phase 7) assumes segments span one rank when it decides
   which alignments are legal.

None of the three can detect a violation. They will all happily compute a wrong answer, or index out
of bounds, depending on the data.

An earlier revision of this phase honoured `max_dummy_chain_length` by keeping only the first and
last few intermediate ranks of a very long chain, to bound allocation. That deliberately creates one
link spanning many ranks. The first symptom was **an out-of-bounds index inside the crossing
counter's accumulator tree** — three phases away from the code that caused it, in a module that was
correct.

So the cap is now advisory. `select_intermediate_ranks` returns **every** rank in
`first..=last`, unconditionally, and the layer builder does not consult `max_dummy_chain_length` at
all; the config field survives as a budget knob for callers that want to reason about allocation. A
very long chain costs memory. A broken adjacency contract costs correctness in phases that cannot
notice it is broken. That trade is not close.

A unit test pins this down directly: with `max_dummy_chain_length = 4` and a span of 20, all 19
intermediate ranks must still be present, and every consecutive pair in the chain must be exactly one
rank apart.

---

## 10. Cost, totality and output

**Cost.** One pass over nodes, one over edges, one flatten. Items created:

$$\lvert items \rvert = N + \sum_{\text{non-flat edges}} (span_e - 1)$$

so the phase is $O(V + E + D)$ in time and memory, where $D$ is the dummy count. `dummy_count` is
reported in the output metrics; a large one usually means the ranking is taller than it needs to be,
which points back at [chapter 05](./05-rank-assignment.md), not at this one.

**Totality.** The function never fails. Out-of-range endpoints are dropped, a missing rank entry is
read as 0, a truncated `reversed` vector degrades to "not reversed", and a `NaN` or negative
measurement is clamped to 0.0 — a `NaN` width would poison every separation computed downstream, and
there is no phase left that could notice. Degrading matters more here than elsewhere precisely
because there is no retry to fall back on.

**Output.** The `Layered` arena, with:

- items stored rank-major, `order` equal to physical slice position;
- one chain per non-flat, non-self edge, source-first, links between consecutive ranks;
- one `Label` item per labelled edge of span ≥ 2, on the middle intermediate rank, sized per the
  placement table;
- `up` the exact transpose of `down`, both over item indices;
- flat edges and self-loops recorded but absent from the adjacencies.

Next, [Phase 5](./07-crossing-minimization.md) permutes each rank to minimise crossings — the only
search in the engine — and the label items go along for the ride like everything else.

---

← [Rank Assignment](./05-rank-assignment.md) | [Index](./README.md) | [Next: Crossing Minimization →](./07-crossing-minimization.md)
