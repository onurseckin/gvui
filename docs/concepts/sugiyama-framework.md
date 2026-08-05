← [Concepts index](./README.md) | [Docs index](../README.md) | [Next: Node measurement →](./node-measurement.md)

# The Sugiyama Framework

## The problem: chaos to hierarchy

Suppose you have a set of steps where some steps depend on others, and you want to draw a diagram
showing what happens first.

If you scatter the steps on screen at random and connect them with arrows, you get a hairball.
Lines cross everywhere, arrows point in every direction, and nobody can tell where the process
starts or ends:

```text
        (deploy)
           ↖   ↘
    (test) ← (build) ──→ (notify)
       ↘  ↗      ↖  ↙
      (lint)   (checkout)
```

The goal of _hierarchical_ graph layout is to turn that into a diagram where arrows generally point
one way, related things sit near each other, and lines cross as little as possible.

## The aha moment: decompose the problem

In 1981, Kozo Sugiyama, Shojiro Tagawa and Mitsuhiko Toda observed that finding the _optimal_
hierarchical drawing in one step is hopeless: several of the sub-problems involved are NP-hard, and
they interact. Their contribution was to split the problem into **four phases run strictly in
sequence**, each responsible for exactly one kind of visual disorder, each handing a cleaner problem
to the next.

That decomposition is the skeleton of essentially every flowchart engine in existence, including
this one.

```text
   raw digraph
        │
        ▼
   ① cycle removal      ── make the arrows agree on a direction
        │
        ▼
   ② layer assignment   ── decide how far down each node sits
        │
        ▼
   ③ crossing reduction ── decide the left-to-right order within each layer
        │
        ▼
   ④ coordinate assignment ── turn ranks and orders into pixels
        │
        ▼
     drawing
```

Each phase makes a decision the later phases treat as settled. That is the whole trick — and also
the whole risk, which is why the ordering of the phases matters so much (see
[the pipeline chapter](../engine/02-the-pipeline.md)).

---

## The four phases, walked through

We will trace a six-node graph the whole way:

```text
edges:  A→B   B→C   C→A   C→D   D→E   A→F
```

Notice `A → B → C → A`. That is a cycle.

### ① Cycle removal — making it flow

**The problem.** We want to draw the graph top to bottom, which means every arrow should point
downward. A cycle makes that impossible: if `A` is above `B`, and `B` above `C`, then `C` cannot
also be above `A`.

```text
      A ──→ B
      ↑     │
      └─ C ←┘        the three of them form a loop
```

**The solution.** Find the cycles and _reverse_ just enough edges to break them. Remember which
edges were reversed, so the arrowhead can be put back at the very end.

Reversing `C → A` into `A → C` leaves a **DAG** — a directed acyclic graph — which is exactly what
the next phase needs.

> In this engine: Phase 2, [`1_6_structure.rs`](../../crates/gvui/src/1_cycle_breaking/1_6_structure.rs).
> A feedback edge is **reversed, never dropped** — see [the departures](#where-this-engine-departs)
> below, because v1 dropped them and it cost a great deal.

### ② Layer assignment — vertical position

**The problem.** Every node needs a _rank_: an integer saying which horizontal band it belongs to.
The constraint is that an arrow must always go from a lower rank to a higher one.

**The solution.** The simplest ranking is "longest path": push each node down until it is strictly
below every one of its parents. Better rankers minimise the total edge span instead, so the drawing
does not get needlessly tall.

For our graph, after the reversal:

```text
rank 0:  [A]
rank 1:  [B]  [C]  [F]
rank 2:  [D]
rank 3:  [E]
```

An edge that spans more than one rank (say `A → E`, if we had one) is a problem for phase ③, which
only knows how to reason about neighbouring layers. The classical fix is a **dummy node** on every
intermediate rank, turning one long edge into a chain of short ones:

```text
rank 0    [A]
           │
rank 1     ●     ← dummy
           │
rank 2     ●     ← dummy
           │
rank 3    [E]
```

The dummies are invisible in the final drawing; their positions become the bend points of the edge.

> In this engine: Phase 3, [`2_4_rank_facade.rs`](../../crates/gvui/src/2_rank_assignment/2_4_rank_facade.rs),
> and Phase 4, [`3_1_layer_builder.rs`](../../crates/gvui/src/3_crossing_minimization/3_1_layer_builder.rs).

### ③ Crossing reduction — horizontal order

**The problem.** The nodes are in the right bands, but their left-to-right order within a band is
still arbitrary — and that order is what decides how many times edges cross.

```text
   bad order                    good order
   [A]   [B]                    [A]   [B]
     ╲   ╱                       │     │
      ╲ ╱                        │     │
      ╱ ╲                        │     │
     ╱   ╲                       │     │
   [C]   [D]                    [C]   [D]
   one crossing                 no crossings
```

**The solution.** Sweep down the layers, and in each layer sort the nodes by the average (or the
median) position of their neighbours in the layer above. Then sweep back up. Repeat. Finish each
sweep with a _transpose_ pass that tries swapping adjacent pairs and keeps a swap when it reduces
the count.

This is a heuristic — minimising crossings even between just two adjacent layers is NP-hard — but
the median heuristic is provably within a factor of 3 of optimal for the two-layer problem, which
is why it is the default.

> In this engine: Phase 5, [`3_4_order_facade.rs`](../../crates/gvui/src/3_crossing_minimization/3_4_order_facade.rs).
> Crossings are counted exactly with the Barth–Mutzel–Jünger accumulator tree in $O(E \log V)$, in
> [`3_2_crossing_counting.rs`](../../crates/gvui/src/3_crossing_minimization/3_2_crossing_counting.rs).

### ④ Coordinate assignment — actual pixels

**The problem.** We have ranks and orders, which are integers. A screen needs $x$ and $y$ in
pixels, and the boxes have different sizes.

**The solution.** The $y$ of a rank follows from the heights of the items in the ranks above it. The
$x$ within a rank is more interesting: you want each node roughly centred on its neighbours, you
want a chain of dummies to line up perfectly vertically (otherwise a long edge renders as an ugly
staircase), and you must never let two boxes overlap.

```text
   staircase (bad)              straight (good)

   [A]                          [A]
    │                            │
    └──●                         ●
        │                        │
        └──●                     ●
            │                    │
           [E]                  [E]
```

> In this engine: Phase 7,
> [`4_4_coordinate_facade.rs`](../../crates/gvui/src/4_coordinate_assignment/4_4_coordinate_facade.rs),
> using Brandes–Köpf in
> [`4_3_brandes_kopf.rs`](../../crates/gvui/src/4_coordinate_assignment/4_3_brandes_kopf.rs). It
> runs in $O(V + E)$, guarantees at most two bends per edge, and is built specifically to keep
> dummy chains straight. The measured `straight_chain_ratio` is 1.00 on seven of the eight audit
> fixtures and 0.96 on the densest.

---

## How the ten phases map onto the four

The engine has ten numbered phases. Four of them are Sugiyama's; the other six exist because a real
drawing has text, boxes, ports and a wire format, none of which the 1981 paper had to deal with.

| Sugiyama phase          | GVUI phases             | Source                                                                                                                                                                                         |
| ----------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —                       | 0 Ingest                | [`0_5_ingest.rs`](../../crates/gvui/src/0_common/0_5_ingest.rs)                                                                                                                                |
| —                       | 1 Measure               | [`src/engine/layout/measurement/`](../../src/engine/layout/measurement/)                                                                                                                       |
| ① Cycle removal         | 2 Structure             | [`1_6_structure.rs`](../../crates/gvui/src/1_cycle_breaking/1_6_structure.rs)                                                                                                                  |
| ② Layer assignment      | 3 Rank, 4 Layer         | [`2_4_rank_facade.rs`](../../crates/gvui/src/2_rank_assignment/2_4_rank_facade.rs), [`3_1_layer_builder.rs`](../../crates/gvui/src/3_crossing_minimization/3_1_layer_builder.rs)               |
| ③ Crossing reduction    | 5 Order                 | [`3_4_order_facade.rs`](../../crates/gvui/src/3_crossing_minimization/3_4_order_facade.rs)                                                                                                     |
| ④ Coordinate assignment | 6 Demand, 7 Coordinates | [`4_1_lane_demand.rs`](../../crates/gvui/src/4_coordinate_assignment/4_1_lane_demand.rs), [`4_4_coordinate_facade.rs`](../../crates/gvui/src/4_coordinate_assignment/4_4_coordinate_facade.rs) |
| —                       | 8 Route                 | [`5_6_route_facade.rs`](../../crates/gvui/src/5_edge_routing/5_6_route_facade.rs)                                                                                                              |
| —                       | 9 Emit                  | [`6_3_emit.rs`](../../crates/gvui/src/6_validation/6_3_emit.rs)                                                                                                                                |

The split of ② into two phases, and of ④ into two phases, is where the interesting departures live.

---

## Where this engine departs

Textbook Sugiyama is the backbone, not the specification. Three deliberate differences:

### 1. An edge label is an item in the layered graph

**Textbook.** Labels are a post-process. You draw the graph, then you find somewhere for each label
to sit, then you shove labels around until they stop colliding with nodes, edges and each other.

**Here.** A labelled edge is given `min_len = 2` during ingest, so it is guaranteed to span at least
two ranks. Phase 4 then materialises a `Label` item on the intermediate rank, carrying the badge box
the host measured. From that moment it is an ordinary item: Phase 5 orders it among its rank
siblings, Phase 6 counts lanes around it, Phase 7 separates it from its neighbours by `node_gap`,
and the rank's height is `max(item.height)` over the rank — so the band is tall enough by
definition.

```text
   textbook                       here

   [A]                            [A]
    │                              │
    │   ┌────────┐            ┌────┴─────┐
    │   │ retry  │  ← where   │ [ retry ]│  ← an item on its own rank,
    │   └────────┘    does    └────┬─────┘     ordered and separated like a node
    │                 this go?     │
   [B]                            [B]
```

**What the alternative cost.** v1 placed badges after routing, with a DSU conflict graph doing
all-pairs candidate comparisons (up to $48^2 = 2{,}304$ geometric tests per badge pair), a
backtracking search over placements, and a "compute a spacing request, expand the gap, re-run the
pipeline" loop that — because the spacing requests were computed and then discarded — never actually
ran. In v2 the measured `leader_count` (badges that needed a fallback leader line) is **0 on every
layered fixture**. There is nothing to retry because there is nothing that can fail.

See [engine chapter 06](../engine/06-layering-and-labels.md).

### 2. Lane-based orthogonal routing, not splines and not pathfinding

**Textbook.** Once coordinates exist, an edge is drawn as a polyline or spline through its dummy
positions. Where that produces overlaps, implementations either accept them or bolt on a router.

**Here.** Phase 6 computes, _before any coordinate exists_, exactly how many parallel routing lanes
each inter-rank channel and each intra-rank corridor needs. The segments crossing one channel form
an **interval graph** over the order axis; interval graphs are perfect, so greedy colouring by
ascending left endpoint uses exactly $\omega$ colours, where $\omega$ is the maximum overlap depth —
the provable minimum. Those lane counts become hard lower bounds on rank gaps and node separations,
which Phase 7 must honour. Phase 8 then materialises each polyline by table lookup: ordering,
coordinates and lane index are all already fixed, so routing is _evaluation_, not search.

```text
   channel between rank 0 and rank 1, three overlapping segments:

   order axis ──────────────────────────────────────────►
      a────────────────b
              c──────────────d
                                e──────f

   greedy colouring by left endpoint:  a-b → lane 0
                                       c-d → lane 1   (overlaps a-b)
                                       e-f → lane 0   (overlaps nothing live)

   → this channel needs 2 lanes → rank_gap_min rises by 2 * lane_spacing
```

**What the alternative cost.** v1 built a dense Cartesian routing grid (4,934 live vertices for a
_12-node_ graph) and ran bounded A\* per edge, inside a rip-up/reroute loop bounded by
4 order variants × 12 rip-up passes × 32 conflict permutations. Routing was measured at **99.5 %+**
of total runtime: 4,979 ms of A\* for a single pass over a 12-node graph, and 26,710 ms end to end.
On `kubernetes_cluster_topology`, disabling the permutation loop was a 12× speedup for a _bit-identical_
result. Worse, quality moved non-monotonically with the budget knobs — on `dense_kubernetes_mesh`,
_reducing_ `initial_lane_rings` from 2 to 1 improved crossings from 206 to 146. A search whose
quality moves randomly with its budget is not converging; it is sampling.

See [engine chapter 08](../engine/08-routing-demand.md) and [chapter 10](../engine/10-edge-routing.md).

### 3. No global iteration

**Textbook.** Phase ③ iterates sweeps until crossings stop improving. Some implementations wrap the
whole framework in an outer loop, trying variations and keeping the best.

**Here.** There is exactly one search in the engine, and it is _inside_ Phase 5: `ordering_seeds`
(default 4) independent restarts, each of at most `ordering_sweeps` (default 16) median+transpose
rounds, stopping a seed after 4 consecutive non-improving rounds. Nothing outside Phase 5 is ever
re-run, and nothing is rolled back except Phase 5's own candidate orderings. The seeds are
deterministic traversal orders (identity, DFS pre-order, BFS level order, reversed, then rotations)
— not random restarts.

Two supporting details make the single pass sufficient:

- **Feedback edges are reversed and kept.** v1 admitted only `Forward` edges into the layer graph,
  so the sweeps and the crossing counter never saw the rest. The measured consequence: the crossing
  count the ordering phase observed was **0 on all eight datasets**, and `minimize_crossings` opened
  with `if best_crossings == 0 { return; }` — so crossing minimization had _never executed on real
  input_. A second counter elsewhere in v1, reading the same dense mesh, reported 433.
- **Ranking sees every edge's role.** v1 called `assign_ranks(.., None)`, discarding the edge-role
  map. Nodes on a cycle never reached in-degree 0 in the topological sort and silently fell back to
  rank 0. On the 30-node dense mesh this put **28 of 30 nodes in a single row** — 2 ranks instead of
  15 — which is where the 191 crossings and the 20 seconds of routing came from. One dropped
  argument.

### 4. Boxes, not points

A smaller but pervasive difference. Classical presentations treat nodes as points or as uniform
boxes. Every item here — real node, dummy, or label — carries a measured `(width, height)`, and
Phase 6 emits a **per-adjacent-pair** minimum separation rather than one global gap. That is what
lets a 420 px node and a 120 px node sit in the same rank without either wasting space or colliding.

---

## What is kept, unchanged

The parts of the framework that are simply correct:

| Problem            | Algorithm                            | Guarantee                                                         |
| ------------------ | ------------------------------------ | ----------------------------------------------------------------- |
| Feedback arc set   | Eades–Lin–Smyth greedy               | $\lvert FAS \rvert \le m/2 - n/6$, linear time                    |
| Ranking            | Network simplex (Gansner et al.)     | optimal for $\sum \omega \cdot (\text{rank}(v) - \text{rank}(u))$ |
| Two-layer ordering | Median + transpose                   | median is $\le 3\times$ optimal for the two-layer problem         |
| Crossing counting  | Barth–Mutzel–Jünger accumulator tree | exact, $O(E \log V)$                                              |
| Lane assignment    | Greedy interval-graph colouring      | optimal (interval graphs are perfect)                             |
| $x$ coordinates    | Brandes–Köpf                         | $\le 2$ bends per edge, dummy chains straight, $O(V+E)$           |

Every one of these is a single-pass algorithm with a stated guarantee. That is the criterion: search
is used only where greedy is _provably_ insufficient, which in this pipeline means Phase 5 and
nowhere else.

---

← [Concepts index](./README.md) | [Docs index](../README.md) | [Next: Node measurement →](./node-measurement.md)
