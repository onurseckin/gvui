← [Engine Index](./README.md) | [Index](./README.md) | [Next: The Pipeline →](./02-the-pipeline.md)

# Graph Theory Foundations

Before we can build an engine that draws graphs, we have to agree on what a graph is. This chapter
assumes zero prior knowledge. If you already know what a DAG and a strongly connected component
are, skip to [Layered drawings](#layered-drawings) — the last three sections define *rank*,
*layered drawing* and *dummy node*, and every later chapter depends on those three words.

We build everything on one running example: a small microservice architecture.

---

## What is a graph?

A **graph** is a collection of things and the connections between them.

- The things are called **nodes** (or vertices).
- The connections are called **edges** (or links).

Here is a tiny graph of two services:

```text
  [ API ]
     |
     |
  [ Auth ]
```

Two nodes, one edge. That is the whole object. A graph has no coordinates, no shape and no pixels —
it is a list of relationships:

```javascript
nodes = ["API", "Auth"];
edges = [{ source: "API", target: "Auth" }];
```

**Graph layout** is the computational problem of turning that list into $(x, y)$ coordinates that a
human can read.

## Directed vs undirected

Graphs come in two flavours.

An **undirected** graph represents symmetric relationships, like friendship. If Alice is friends
with Bob, Bob is friends with Alice; the edge has no direction.

A **directed** graph (a *digraph*) represents asymmetric relationships, like dependency or data
flow. If `API` calls `Auth` to verify a user, `API` depends on `Auth` and not the reverse. We draw
directed edges with an arrowhead:

```text
  [ API ]
     |
     v
  [ Auth ]
```

The layered engine is built **exclusively for directed graphs**. Direction is what tells us which
way the drawing should flow — which node belongs above which. Without it there is no "top".

## Adjacency, predecessors, successors

Let's grow the example:

```text
          [ API ]
          /     \
         v       v
   [ Auth ]    [ Cache ]
         \       /
          v     v
          [ DB ]
```

Two nodes joined by an edge are **adjacent**. In a directed graph we name the two directions:

- A **predecessor** of $v$ is a node that points *to* $v$.
- A **successor** of $v$ is a node that $v$ points *to*.

For `Cache`: its predecessor is `API`, its successor is `DB`.

The engine stores both directions explicitly, as
[`GraphIr::out_csr` and `GraphIr::in_csr`](../../crates/gvui/src/0_common/0_1_types.rs), because
several phases walk the graph backwards and rebuilding the reverse adjacency on demand would be the
single most expensive thing in the pipeline.

## In-degree, out-degree, degree

Count the edges at a node and you get its **degree**.

- **In-degree**: edges pointing *to* the node.
- **Out-degree**: edges pointing *away from* the node.
- **Degree**: the sum of the two.

| Node | In-degree | Out-degree | What it means |
| --- | ---: | ---: | --- |
| API | 0 | 2 | A **source**. Nothing depends on it being drawn first; everything else follows from it. |
| Auth | 1 | 1 | An intermediary. |
| Cache | 1 | 1 | An intermediary. |
| DB | 2 | 0 | A **sink**. Flow ends here. |

Sources naturally want to live at the top of a top-down drawing; sinks at the bottom.

Degree matters to the engine for a second, less obvious reason: **every edge at a node needs
somewhere to attach.** A node with 8 edges needs 8 attachment points, and those need physical
room along the node's border. The engine therefore grows a node's box during ingest if its degree
demands it — before ranking, because node width is an *input* to ranking. `IrNode::degree` exists
for exactly that.

## Paths and reachability

A **path** is a sequence of nodes in which every consecutive pair is joined by a directed edge.

In our graph there are two paths from `API` to `DB`:

1. `API → Auth → DB`
2. `API → Cache → DB`

Because a path exists, `DB` is **reachable** from `API`.

The **length** of a path is its number of edges. The two paths above both have length 2. That
number will turn out to matter enormously: it is what decides how many rows apart two nodes end up.

## Cycles

Suppose `DB` needs to report errors back to `API`. Add an edge `DB → API`:

```text
          [ API ] <----------------+
          /     \                  |
         v       v                 |
   [ Auth ]    [ Cache ]           |
         \       /                 |
          v     v                  |
          [ DB ] ------------------+
```

Now there is a path that returns to where it started: `API → Auth → DB → API`. That is a **cycle**.

Cycles break the notion of "above". Every node on a cycle is reachable from every other node on it,
so there is no answer to "does `API` go above `DB` or below it?" — both are true.

Handling cycles is the job of [Phase 2, Structure](./04-structure.md). The short version, which you
need now: the engine picks a small set of edges and **pretends they point the other way** for the
duration of the layout, then flips the arrowheads back at the very end. Nothing is deleted.

## Directed acyclic graphs (DAGs)

A directed graph with **no cycles at all** is a **directed acyclic graph**, or DAG.

DAGs are the well-behaved case, and almost every layout algorithm in this engine assumes one. A DAG
has a **topological order**: an arrangement of its nodes in a line such that every edge points
forward. `API, Auth, Cache, DB` is a topological order of our acyclic example — check every edge
and you will find none pointing backwards.

The whole point of Phase 2 is to hand the rest of the pipeline a DAG. After it runs, every phase
from ranking to routing sees a graph with no cycles, and only the arrowhead knows otherwise. The
engine verifies this rather than assuming it, with Kahn's algorithm in
[`1_5_kahn_dag_verifier.rs`](../../crates/gvui/src/1_cycle_breaking/1_5_kahn_dag_verifier.rs).

## Connected components

What if the system also has a background worker that talks only to a logger?

```text
          [ API ]                 [ Worker ]
          /     \                     |
         v       v                    v
   [ Auth ]    [ Cache ]          [ Logger ]
         \       /
          v     v
          [ DB ]
```

There is no path between the two clusters in either direction. These separate islands are
**weakly connected components** — "weakly" because we ignore edge direction when deciding whether
two nodes are in the same island.

The engine finds them during ingest and stores them in `GraphIr::components`, so that they can be
laid out and then packed side by side instead of being tangled together.

### Strongly connected components

There is a stricter version. A **strongly connected component** (SCC) is a maximal set of nodes in
which *every* node can reach *every* other node **following edge directions**.

Weak connectivity asks "is there a route if I am allowed to walk edges backwards?". Strong
connectivity asks "is there a route if I must respect every arrow?". The second is much harder to
satisfy:

```text
   [ A ] --> [ B ] --> [ D ]
     ^         |
     |         v
     +------ [ C ]
```

- `{A, B, C}` is one SCC. `A → B → C → A` returns to its start, so each of the three reaches each
  of the three respecting direction.
- `{D}` is an SCC all by itself. You can get *to* `D`, but there is no edge out of `D`, so `D`
  reaches nothing and belongs with nobody.

All four nodes are in the same *weakly* connected component; they form two *strongly* connected
components.

Why this matters: **every cycle lives entirely inside one SCC.** An edge that joins two different
SCCs can never be part of a cycle, so it never needs to be reversed. Computing SCCs first
(with [Tarjan's algorithm](../../crates/gvui/src/1_cycle_breaking/1_2_tarjan_scc.rs), in linear
time) shrinks the cycle-breaking problem from "the whole graph" to "each SCC separately", and
single-node SCCs — usually most of them — are free.

## Planarity, and why zero crossings is often impossible

An **edge crossing** is a point where two drawn edges intersect somewhere other than at a shared
node. Crossings are the single biggest readability cost in a graph drawing: a reader tracing an edge
has to decide, at every crossing, which line is theirs.

Some crossings are an accident of how we ordered the nodes. Here are two ranks with edges
`A → Y` and `B → X`:

```text
   rank 0    [ A ]        [ B ]
                \          /
                 \        /
                  \      /
                   \    /
                    \  /
                     \/       <- one crossing
                     /\
                    /  \
                   /    \
                  /      \
   rank 1    [ X ]        [ Y ]
```

Swap `X` and `Y` within rank 1 and the crossing disappears entirely:

```text
   rank 0    [ A ]        [ B ]
                |            |
                |            |
   rank 1    [ Y ]        [ X ]
```

That is the whole business of [crossing minimization](./07-crossing-minimization.md): the drawing
did not change, only the left-to-right order within a row, and a crossing vanished.

But not every crossing is removable. A graph is **planar** if it can be drawn in the plane with no
crossings at all, and many graphs simply are not. The smallest examples are $K_5$ — five nodes with
every pair joined, 10 edges — and $K_{3,3}$ — three nodes each joined to the same other three,
9 edges. Neither can be drawn without at least one crossing, no matter how you arrange the nodes.
Kuratowski's theorem says these two are the *only* obstructions: a graph is planar if and only if it
contains no subdivision of $K_5$ or $K_{3,3}$ inside it.

$K_{3,3}$ is worth picturing, because it is exactly a two-rank layered drawing:

```text
   rank 0    [ A ]      [ B ]      [ C ]

                 every A, B, C connects to every X, Y, Z
                 — 9 edges through one channel, and at
                 least one pair must cross whatever order
                 you choose for either row

   rank 1    [ X ]      [ Y ]      [ Z ]
```

There are $3! \times 3! = 36$ possible orderings of the two rows. Every single one of them produces
at least one crossing.

Two consequences shape the engine:

1. **"Zero crossings" is not a goal we can promise.** The honest goal is *few* crossings.
2. **Even the reduced problem is hard.** Once nodes are assigned to rows, deciding the left-to-right
   order within two adjacent rows so as to minimize crossings between them is NP-hard. That is why
   ordering is the one phase in the engine that searches — see
   [Crossing Minimization](./07-crossing-minimization.md).

There is one more subtlety worth internalizing early. There are two different things called
"crossings" in this codebase:

- **Combinatorial crossings** — pairs of edges whose endpoints are *inverted* between two adjacent
  rows. Counted on integers, before any geometry exists.
- **Geometric crossings** — actual intersections of the drawn polylines, measured afterwards.

They are not the same number, and the engine reports both (`crossings` and `geometric_crossings` in
`LayoutMetrics`). Chapter [11 — Emit and Quality](./11-emit-and-quality.md) explains where the gap
comes from.

---

## Layered drawings

Everything above is standard graph theory. The next three definitions are specific to how this
engine draws, and every later chapter uses them constantly.

A **layered drawing** (also called a *hierarchical* or *Sugiyama* drawing) places every node into
one of a series of parallel rows, and draws every edge so that it travels from an earlier row to a
later one. In a top-down drawing the rows are horizontal bands and every arrow points downward.

```text
  row 0     [ API ]
               |    \
               |     \
  row 1     [ Auth ]  [ Cache ]
               |      /
               |     /
  row 2     [ DB ]
```

This is the shape of an architecture diagram, a build-dependency chart, a state machine, a CI
pipeline. It is not the right shape for everything — a dense mesh with no dominant flow direction
draws better as a force layout, see [Modes](../modes/README.md) — but when the data has a
direction, a layered drawing shows it.

## Ranks

A **rank** is the index of a row. Rank 0 is the first row, rank 1 the next, and so on.

Assigning ranks is a discrete problem with an exact statement. Given a DAG, choose an integer
$\text{rank}(v)$ for every node such that for every edge $u \to v$:

$$\text{rank}(v) - \text{rank}(u) \ge \text{minlen}(u \to v)$$

where $\text{minlen}$ is the minimum number of rows the edge must span (normally 1). Among all
assignments satisfying that, the engine picks one minimizing the total weighted edge length:

$$\sum_{(u,v) \in E} \omega_{uv} \cdot \big(\text{rank}(v) - \text{rank}(u)\big)$$

In words: *keep every arrow pointing downward, and make the arrows as short as you can.* Short
edges are easier to follow, and a drawing with short edges is compact.

Working the example by hand, with every $\text{minlen} = 1$ and every $\omega = 1$:

| Node | Constraints | Rank |
| --- | --- | ---: |
| API | none (no incoming edges) | 0 |
| Auth | $\text{rank} \ge \text{rank(API)} + 1$ | 1 |
| Cache | $\text{rank} \ge \text{rank(API)} + 1$ | 1 |
| DB | $\ge \text{rank(Auth)} + 1$ and $\ge \text{rank(Cache)} + 1$ | 2 |

Total weighted edge length: $1 + 1 + 1 + 1 = 4$. No assignment does better, because every edge
already spans the minimum of one row.

Now change one thing — give `Cache` an extra hop:

```text
  row 0     [ API ]
               |    \
  row 1     [ Auth ] \
               |       \
  row 2     [ DB ] <-- [ Cache ]
```

Here `API → Cache` spans two rows instead of one, and the total edge length is 5. Ranking is the
phase that decides *which* of the many legal assignments you get. Two nodes end up on the same rank
precisely when neither constrains the other. See
[Rank Assignment](./05-rank-assignment.md).

Three properties of ranks are worth stating explicitly, because later chapters rely on them:

- Ranks are **integers**, decided before any pixel exists. The conversion from "rank 2" to "y =
  418.0" happens much later, in [Phase 7](./09-coordinate-assignment.md).
- An edge whose two endpoints land on the **same** rank is called a **flat edge**. It cannot point
  downward, so it is drawn sideways, and it needs its own handling everywhere.
- The number of ranks is the *height* of the drawing, and the widest rank is roughly its *width*.
  The engine can trade one against the other; that is what `balance_ranks` and
  `target_aspect_ratio` do.

## Dummy nodes

Here is the problem that dummy nodes solve.

Once ranks exist, an edge can span more than one row. Look at `API → DB` in this drawing:

```text
  rank 0     [ API ]
               |   \
               |    \
  rank 1     [ Auth ]\        [ Cache ]
               |      \       /
               |       \     /
  rank 2     [ Log ]    \   /
                         \ /
  rank 3                [ DB ]
```

The `API → DB` edge crosses ranks 1 and 2 without stopping. Every phase downstream now has an
awkward special case:

- **Ordering** works by comparing two adjacent rows at a time. What position does `API → DB` occupy
  in row 1? It has no node there, but it certainly occupies horizontal space there.
- **Crossing counting** counts inversions between adjacent rows. A three-rank edge is invisible to
  a pairwise-rows counter, so it contributes zero crossings — even though it is precisely the kind
  of edge most likely to cross something.
- **Coordinate assignment** aligns nodes with their neighbours. A long edge has no neighbour to
  align with in the middle.

The fix is beautifully simple. Replace the long edge with a **chain of invisible nodes**, one on
every rank it passes through:

```text
  rank 0     [ API ]
               |   \
               |    \
  rank 1     [ Auth ] (d1)     [ Cache ]
               |       |       /
               |       |      /
  rank 2     [ Log ]  (d2)   /
                       |    /
                       |   /
  rank 3                [ DB ]
```

`d1` and `d2` are **dummy nodes** (in this codebase, `ItemKind::Dummy`). They have zero size, they
are never drawn, and they are discarded at emit time. What they buy is that **every edge in the
layered graph now spans exactly one rank.** No special cases survive:

- Ordering places `d1` among row 1's items just like a real node, so the long edge's horizontal
  position is a first-class ordering decision.
- Crossing counting sees two single-rank edges and counts them correctly.
- Coordinate assignment lines `d1` up under `API` and `d2` under `d1`, which is exactly what makes
  a long edge draw as one straight line instead of a zigzag. The
  `straight_chain_ratio` metric measures how often that succeeds; it is 1.00 on seven of the eight
  test datasets.
- The final polyline for the edge is simply the sequence of positions of `API`, `d1`, `d2`, `DB`.

The cost is real and worth naming: a graph with many long edges gets many dummy items, and every
later phase runs over items, not nodes. A single edge spanning $k$ ranks adds $k-1$ dummies. This is
why ranking tries to keep edges short — a shorter edge is not just prettier, it is cheaper.

One more use of the same idea, and it is the load-bearing one in this engine: **an edge's label is
also an item in the layered graph.** Instead of a zero-size dummy in the middle of the chain, the
engine puts an item there carrying the *measured box of the badge*:

```text
  rank 0     [ API ]
               |
  rank 1    [ "retry x3" ]     ← a Label item: a real box, ordered and spaced like a node
               |
  rank 2     [ DB ]
```

Because it is an ordinary item, it is ordered by the ordering phase, separated from its neighbours
by the coordinate phase, and counted in its rank's height. Space for the badge is therefore
allocated by construction — it cannot fail to fit, so there is nothing to retry. That single trick
deletes an entire retry loop from the engine, and it is the subject of the
[next chapter](./02-the-pipeline.md).

---

## Vocabulary summary

| Term | Meaning |
| --- | --- |
| node / vertex | A thing to draw. |
| edge / link | A directed connection between two nodes. |
| in-degree / out-degree | Number of edges entering / leaving a node. |
| path | A sequence of nodes joined by consecutive directed edges. |
| cycle | A path that returns to its starting node. |
| DAG | A directed graph with no cycles. |
| topological order | A linear order of a DAG's nodes with every edge pointing forward. |
| weakly connected component | An island of nodes, ignoring edge direction. |
| strongly connected component | A maximal set where every node reaches every other, respecting direction. Every cycle lives inside one. |
| planar | Drawable with zero crossings. Most real graphs are not. |
| crossing | Two edges intersecting away from a shared node. |
| rank | The row index a node is assigned to. |
| flat edge | An edge whose endpoints share a rank. |
| span | $\text{rank}(v) - \text{rank}(u)$ for an edge $u \to v$. |
| dummy node | A zero-size placeholder on an intermediate rank of a long edge. |
| label item | Like a dummy, but carrying the edge badge's measured box. |
| item | The union of the three: real node, dummy, or label. What every phase after Phase 4 actually operates on. |

---

← [Engine Index](./README.md) | [Index](./README.md) | [Next: The Pipeline →](./02-the-pipeline.md)
