← [Structure](./04-structure.md) | [Index](./README.md) | [Next: Layering and Labels →](./06-layering-and-labels.md)

# Phase 3 — Rank Assignment

Phase 2 handed us a graph with no cycles in it: every edge now points "downhill". This phase decides
_how far_ downhill each one goes.

A **rank** is an integer depth. Rank 0 is the top row of the drawing, rank 1 the row below it, and
so on. Assigning ranks is the moment the drawing acquires a shape, because from here on nothing can
move a node from one row to another — Phase 4 builds items per rank, Phase 5 sorts within a rank,
Phase 6 counts routing lanes between consecutive ranks. All three read the ranking as settled fact.

```text
rank 0        [ build ]
                 |
rank 1        [ test  ]        [ lint ]
                 |                 |
rank 2        [ package ] --------+
                 |
rank 3        [ deploy ]
```

Two invariants leave this phase, and they must be true on the way out because there is no later
phase that could repair them:

1. **Totality.** Every node has a rank, including nodes with no edges at all.
2. **Feasibility.** For every arc $u \to v$, $\;rank(v) - rank(u) \ge minlen(u,v)$.

The `minlen` in that second invariant is the one **this phase decides**, not the one Phase 0 wrote:
peer edges are relaxed to 0 before anything is ranked ([§7](#7-peer-edges-and-the-same-rank-relaxation)),
and labelled edges left at span 1 are pushed apart after everything else has run
([§8](#8-the-span-1-rule-for-labelled-edges)).

See [the facade](../../crates/gvui/src/2_rank_assignment/2_4_rank_facade.rs) for the phase entry
point, `assign_ranks`.

---

## 1. The constraint system

Every edge that survives into ranking contributes one inequality:

$$rank(v) - rank(u) \ge minlen(u,v)$$

`minlen` is the **minimum rank span** of the edge. It defaults to 1 — "the target must be at least
one row below the source" — and Phase 0 raises it to 2 for any edge that carries a label. We will
come back to why in [§6](#6-the-two-parameters-that-matter); the short version is that a labelled
edge needs an empty row in between for its badge to live on. A `minlen` of **0** is also legal, and
means "the target may sit on the same row as the source"; [§7](#7-peer-edges-and-the-same-rank-relaxation)
is where the engine hands that out.

Not every edge takes part. [`rank_arc`](../../crates/gvui/src/2_rank_assignment/2_3_rank_balancing.rs)
is the single definition of "an arc ranking cares about", and it excludes four kinds:

- **self-loops** (classified by Phase 2) — a node cannot be below itself;
- **edges whose endpoints coincide after reversal** — same reason;
- **edges naming a node index that does not exist** — nothing to constrain;
- **edges Phase 2 never classified**, which are read in their original direction rather than
  dropped, so a truncated `StructureResult` degrades instead of panicking.

The balancer and the ranker both build their arc lists through that one function, so the two can
never disagree about which constraints exist.

A ranking that satisfies every inequality is called **feasible**. There are usually many of them.
The rest of this chapter is about choosing a good one.

---

## 2. Longest-path layering — the simple answer

Start with the simplest rule that works: _put every node as high as its constraints allow._

Equivalently: the rank of a node is the length of the longest constrained path ending at it. Sources
(nodes with no incoming arc) land on rank 0; everyone else is pushed down by the deepest ancestor
chain above them.

That is computed by a single topological sweep — Kahn's algorithm — in $O(V + E)$:

```text
1. in_degree[v] = number of arcs into v
2. queue = every node with in_degree 0, in ascending index order
3. pop u from the front of the queue:
     for each arc u -> v:
         rank[v] = max(rank[v], rank[u] + minlen(u,v))
         in_degree[v] -= 1
         if in_degree[v] == 0: push v
4. shift everything so the minimum rank is 0
```

### Worked example

Take the four-node diamond $0 \to \{1, 2\} \to 3$ with every `minlen` = 1.

```text
  in_degree: 0:0  1:1  2:1  3:2      queue = [0]

  pop 0 -> rank[1] = max(0, 0+1) = 1, in_degree[1] = 0, push 1
        -> rank[2] = max(0, 0+1) = 1, in_degree[2] = 0, push 2
  pop 1 -> rank[3] = max(0, 1+1) = 2, in_degree[3] = 1
  pop 2 -> rank[3] = max(2, 1+1) = 2, in_degree[3] = 0, push 3
  pop 3 -> no outgoing arcs

  ranks = [0, 1, 1, 2]
```

```text
rank 0     [0]
          /   \
rank 1  [1]   [2]
          \   /
rank 2     [3]
```

Which is exactly what you would draw by hand.

### Its weakness

Longest path produces the **tallest** feasible ranking, and it has no notion of edge length at all.
The classic failure is a late-joining source:

```text
graph:   0 -> 1 -> 2   and   3 -> 2

longest path                      what we want
------------                      ------------
rank 0   [0]   [3]                rank 0   [0]
          |     |                           |
rank 1   [1]    |                 rank 1   [1]  [3]
          |     |                           |   /
rank 2   [2] <-+                  rank 2   [2]
```

Node 3 has exactly one arc, to node 2. Longest path pins it to rank 0 because it has no incoming
arcs, and its single edge is then stretched across two ranks for no reason. The drawing is taller
than it needs to be and the long edge will need a dummy node, an extra routing lane, and a chance
to cross something.

Measure both rankings with total edge length $\sum (rank(v) - rank(u))$:

| ranking      | $0\to1$ | $1\to2$ | $3\to2$ | total |
| ------------ | ------: | ------: | ------: | ----: |
| longest path |       1 |       1 |   **2** | **4** |
| optimum      |       1 |       1 |   **1** | **3** |

Longest path is still worth having. It is $O(V+E)$, it cannot fail, and every other ranker in the
engine starts from it: network simplex needs a feasible starting point before it can evaluate a
single improvement, and the facade falls back to it if simplex reports infeasibility. It is also
selectable directly as `ranker: "longest-path"`.

See [the implementation](../../crates/gvui/src/2_rank_assignment/2_1_longest_path.rs).

---

## 3. Network simplex — the good answer

The default ranker minimises weighted edge length:

$$ \min \sum_{(u,v)} \omega(u,v),\bigl(rank(v) - rank(u)\bigr)
\quad\text{subject to}\quad rank(v) - rank(u) \ge minlen(u,v)$$

This is Gansner et al. (1993) §2, the ranker `dot` uses. It is a linear program, and this
implementation solves it **exactly** — not approximately, not by a search that might or might not
converge. That matters more than it sounds: because the solve is exact, a weight is a *coefficient*
rather than a hint. Doubling an edge's weight has a predictable, monotone effect on how hard that
edge is pulled taut.

### Slack

The **slack** of an arc is how much room it has to spare:

$$slack(u,v) = rank(v) - rank(u) - minlen(u,v)$$

Slack is never negative in a feasible ranking. An arc with slack 0 is **tight** — its endpoints are
as close as the constraints permit. The whole algorithm is a story about which arcs get to be tight.

### The tight spanning tree

Simplex works over a **spanning tree of tight arcs**. Building one is a greedy loop:

```text
visited = { }                       # nothing in the tree yet
until every node is visited:
    among arcs with exactly one endpoint visited (the "frontier"),
    pick the one with the least slack
    shift the unvisited endpoint's whole connected component so that arc becomes tight
    mark that endpoint visited, add the arc to the tree
if there is no frontier arc at all (disconnected graph), seed a new root
```

Shifting a whole component rather than a single node is what keeps the ranking feasible throughout:

- arcs **inside** the moved component keep their slack exactly, because everything moves together;
- an arc with one end inside and one end in the tree is itself a frontier arc, so its slack was at
  least the minimum we shifted by;
- any other arc touching the component has its far end unvisited, and is therefore inside the same
  component by definition of connectivity.

On the late-source graph above, this alone fixes the problem: growing the tree from node 0 reaches
the frontier arc $3 \to 2$ with slack 1, and shifting node 3's component down by 1 lands it on rank
1, next to the node it actually connects to. That is why the engine offers this as a ranker of its
own — `ranker: "tight-tree"` runs the tree build and stops, optimising nothing and ignoring weights
entirely. It exists for A/B comparison, and it never fails: an infeasible constraint set falls back
to longest path.

### Cut values

Deleting one arc from a spanning tree splits it into two components. Call the piece containing the
arc's tail the **tail side** and the piece containing its head the **head side**. The arc's
**cut value** is the net weight crossing that split:

$$cut(u,v) \;=\; \sum_{\text{tail side} \to \text{head side}} \omega \;-\; \sum_{\text{head side} \to \text{tail side}} \omega$$

The cut value is exactly the derivative of the objective. Push the head side down by $\delta$ rows
and every tail→head arc gets $\delta$ longer while every head→tail arc gets $\delta$ shorter, so

$$\Delta\text{cost} = \delta \cdot cut(u,v)$$

**A negative cut value means the drawing gets shorter if that arc's head side moves away.** Nothing
in the tree stops it — the tree arc simply stretches. That is an improvement waiting to be taken.

Computing cut values naively means re-splitting the tree once per tree arc: $O(V)$ arcs times
$O(V+E)$ per split. The implementation gets all of them in **one** $O(V+E)$ postorder pass, using a
cancellation trick. Give every node a signed weight

$$flux(n) = \sum_{\text{arcs out of } n} \omega \;-\; \sum_{\text{arcs into } n} \omega$$

and then sum $flux$ over each subtree, bottom-up. An arc with **both** ends inside the subtree
contributes $+\omega$ at its tail and $-\omega$ at its head, so it cancels; what survives is exactly
the boundary flow. The cut value of the tree arc joining a node to its parent is then just that
node's accumulated flux, negated when the arc points *into* the subtree rather than out of it.

### The pivot

```text
repeat, up to 4 * node_count times:
    compute cut values for all tree arcs        (one O(V+E) pass)
    leaving  = tree arc with the most negative cut value
               (ties broken by lowest arc index)
    if there is none: the ranking is optimal, stop
    entering = non-tree arc running from the head side back to the tail side
               with the least slack   (ties broken by lowest arc index)
    delta    = that slack
    add delta to the rank of every node on the head side
    swap: leaving arc leaves the tree, entering arc joins it
```

The entering arc's slack is precisely how far the head side may move before *something* goes short,
so after the shift the entering arc is tight and the leaving arc has slack `delta`. Feasibility is
preserved at every step, which is why exhausting the pivot budget is **not** a failure: a truncated
solve returns a valid, merely sub-optimal ranking. The facade gives it $4\lvert V \rvert$ pivots and
only falls back to longest path when simplex reports genuine infeasibility — in practice, a cycle
that survived Phase 2.

Cut values are sums of `f64`. A comparison tolerance of `1e-9` guards the pivot rule, because a
pivot triggered by rounding noise can be undone by the next one and the pair will cycle until the
budget runs out.

### Worked example

Nodes 0, 1, 2 with arcs $0 \to 1$ (`minlen` 1, $\omega$ 1), $0 \to 2$ (`minlen` **3**, $\omega$ 1),
and $1 \to 2$ (`minlen` 1, $\omega$ **8**).

Node 1 may legally sit on rank 1 or rank 2 — nothing about feasibility decides it, so the weights
decide it alone.

```text
   node 1 on rank 1                     node 1 on rank 2
   (what longest path gives)            (the optimum)

rank 0   [0]--+                      rank 0   [0]--+
          |   |                               |    |
rank 1   [1]  | (w=1)                rank 1   |    | (w=1)
          |   | minlen 3             rank 2  [1]   | minlen 3
rank 2    | (w=8)                             |  (w=8)
          |   |                               |    |
rank 3   [2]--+                      rank 3  [2]---+

  0->1 : w 1 x span 1 =  1              0->1 : w 1 x span 2 =  2
  0->2 : w 1 x span 3 =  3              0->2 : w 1 x span 3 =  3
  1->2 : w 8 x span 2 = 16              1->2 : w 8 x span 1 =  8
  --------------------------            --------------------------
  total                 20              total                 13
```

The heavy arc is worth eight ordinary rank-lengths, so the solver spends two cheap ones to make it
tight. Longest path cannot see this at all — it has no objective.

The unit tests check this the hard way, by enumerating every feasible assignment in a small box and
confirming that none beats what simplex returned. The claim is optimality, not improvement.

### What it costs

| step | cost |
| --- | --- |
| feasible start (longest path) | $O(V + E)$ |
| tight tree build | $O(V \cdot E)$ — each round rescans every arc for the minimum-slack frontier |
| one pivot | $O(V + E)$ |
| pivot budget | $4\lvert V \rvert$ |

The tree build is the naive version rather than the incremental one; at the graph sizes this
renderer deals with (tens of nodes, occasionally hundreds) the whole solve does not register against
the 250 ms budget. The measured Phase 3 time on the 30-node, 45-edge mesh is a fraction of that
graph's 1.79 ms total.

See [the implementation](../../crates/gvui/src/2_rank_assignment/2_2_network_simplex.rs).

### Determinism

Every choice is broken by an explicit index rule: the leaving arc by (most negative cut value,
lowest arc index), the entering arc by (least slack, lowest arc index), the tight-tree frontier by
(least slack, lowest arc index), and disconnected components by lowest unvisited node index. No hash
container is iterated anywhere in this phase, so two runs of the same input produce byte-identical
ranks.

---

## 4. Hostile input

Ranking is the first phase where a single bad number could make the whole drawing nonsense, so the
inputs are sanitised rather than trusted:

- an arc whose endpoints are equal, or which names a node index out of range, is dropped;
- a non-finite weight is read as the default 1.0;
- a negative weight is clamped to 0.0 — a negative coefficient would invert the pivot rule and could
  make the solve diverge;
- ranks saturate at `u16::MAX` instead of wrapping. A graph deep enough to reach that is already far
  outside what the renderer can draw, and a saturated rank is a survivable artefact where a wrapped
  one would silently invert the flow direction.

Longest path additionally carries a bounded relaxation fallback: if the topological sweep fails to
settle every node — which means a cycle reached it despite Phase 2 — it relaxes to a fixpoint with a
pass limit instead of leaving nodes unranked. Phase 4 can survive a badly *shaped* ranking; it
cannot survive a *missing* one.

---

## 5. Pinned ranks

A caller may pin a node to a rank by sending `rank` on the node. When any node does, `GraphIr`
records `has_pinned_ranks` and the facade takes a different branch: it runs the ranker as usual,
overwrites the pinned nodes' ranks, and then runs `repair_feasibility` — a raise-only relaxation
that lifts heads until every `minlen` holds again.

Two consequences worth knowing:

- **A pin that contradicts a `minlen` loses.** If you pin the head of a chain level with its tail,
  the successor is raised. Phase 4 can survive a moved node; it cannot survive a violated `minlen`,
  because a labelled edge with span 1 has no rank to put its badge on.
- **Pins disable rank balancing entirely** ([§9](#9-aspect-ratio-rank-balancing)). A pin is an explicit instruction about where a node
  goes, and a heuristic that quietly overrides it would be worse than useless.

Normalisation happens after pinning, so if repair lifts *every* node above rank 0 the whole drawing
slides back up to start at 0. The pins stay correct relative to each other, which is what a rank pin
means to a layered layout.

---

## 6. The two parameters that matter

### Weight, and the 8× bundle boost

`weight` on an incoming edge becomes $\omega$ in the objective, defaulting to 1.0. Then the facade
applies one automatic adjustment:

```rust
pub const BUNDLE_WEIGHT_BOOST: f64 = 8.0;
```

Every member of a **parallel-edge bundle** — the group Phase 0 forms when several edges join the
same unordered pair of nodes — gets its weight multiplied by 8. Because the objective is minimised
exactly, this is a statement with teeth: pulling one member of a bundle away from the others would
have to save eight ordinary edge-ranks to be worth doing. In practice bundle members stay on the
same pair of ranks, which is what lets Phase 8 route them as a single bus.

This is the general shape of steering in v2. You do not nudge a search and hope; you change a
coefficient in a program that is solved to optimality.

### `minlen`, and why a labelled edge gets 2

`minlen` defaults to 1. Phase 0 sets it to **2 for every edge that carries a label**, unless the
host sent an explicit `minLen`, which always wins.

```text
minlen = 1                      minlen = 2

rank 0   [ source ]             rank 0   [ source ]
             |                               |
rank 1   [ target ]             rank 1       |     <- a whole rank exists here,
                                             |        with nothing else forced onto it
                                rank 2   [ target ]
```

That empty intermediate rank is where the badge goes. [Chapter 06](./06-layering-and-labels.md)
turns it into an ordinary item in the layered graph carrying the measured badge box, which is the
single idea the whole engine is organised around. It only works if there is a rank to put the item
on, and this is where that rank is bought.

Note the cost model: `dot` achieves the same thing by doubling *all* ranks. Doing it per-edge is
cheaper here, because it only pays the extra vertical space where a label actually needs it.

See [ingest](../../crates/gvui/src/0_common/0_5_ingest.rs) for where the 2 is applied.

---

## 7. Peer edges and the same-rank relaxation

Everything so far assumes an edge means "below". Some edges do not.

```text
   minlen = 1 on every edge                 minlen = 0 on a -> b

rank 0        [ root ]                     rank 0        [ root ]
              /      \                                   /      \
rank 1     [ a ]      |                    rank 1     [ a ]───[ b ]
              |       |
rank 2     [ b ]------+                             a -> b becomes one straight
                                                    horizontal segment
```

`root → a`, `root → b`, `a → b`. The third edge is not a hierarchy step; it joins two *siblings*.
Forcing it to span a rank makes the drawing a row taller and turns a straight horizontal line into a
vertical one with two corners.

v3 detects that shape and relaxes it. `same_rank_peer_edges` (default `true`) lowers every **peer
edge** to `minlen = 0`, so the ranker is *permitted* — never forced — to put the two endpoints on one
rank. When it does, Phase 4 emits a [`FlatEdge`](./06-layering-and-labels.md#8-flat-edges) instead of
a chain, and Phase 8 draws it as one horizontal segment through the corridor between them.

This made `FlatEdge` reachable **for the first time**. Every edge previously carried `minlen ≥ 1`, so
`span == 0` was arithmetically impossible and the entire flat-edge path — the record, the corridor
reservation, the router, the badge case — was dead code that had never executed on real input.

### What counts as a peer edge

An edge $u \to v$ of the cycle-broken DAG is a peer edge when **all three** hold:

1. **It still carries the `minlen` ingest would have defaulted to** — 2 with a badge, 1 without. A
   host that sent an explicit `minLen` is giving an instruction about rank separation, and peer
   detection must not silently override it.
2. **$u$ and $v$ share at least one predecessor.** They hang off a common parent, which is the shape
   a reader expects to see side by side.
3. **Masking this edge out leaves no other directed path $u \to v$.**

Condition 3 is what makes the relaxation *safe* rather than merely optimistic. `minlen = 0` only ever
**permits** equality; it can never create a cycle, because the constraint system is still a system of
inequalities over a DAG. But if some other path $u \to x \to v$ existed, that path already forces
$rank(v) \ge rank(u) + 2$, so relaxing this edge would achieve nothing except to spend a scan
pretending the edge might be flat.

```text
   peer                               not a peer — rule 3 fails

        [ root ]                          [ root ]
        /      \                          /      \
     [ a ]───[ b ]                     [ a ]     [ b ]
                                          | \      ^
     a -> b relaxed to 0                  |  [ x ]-+
                                          +--------+   <- a -> b, the candidate

                                       a -> x -> b already forces
                                       rank(b) >= rank(a) + 2, so
                                       relaxing a -> b would buy nothing
```

### The bounded reachability probe

Condition 3 is a forward BFS from $u$ looking for $v$, with the candidate edge masked out. Two
details matter.

**It masks by edge index, not by endpoint pair.** One of two parallel $u \to v$ edges therefore still
sees the other, and neither is mistaken for a peer.

**It has a visit budget — `PEER_PROBE_BUDGET = 256` — and exhausting it answers "a path exists".**
That is the conservative answer, and the asymmetry is the reason it is safe to answer it that way:

| the probe is wrong… | cost |
| --- | --- |
| wrong **yes** (says a path exists when none does) | the edge keeps `minlen = 1` and is drawn hierarchically. Nothing is broken; one edge is less pretty. |
| wrong **no** (says no path exists when one does) | the ranker is permitted to collapse a genuine hierarchy onto a single rank. |

Since one direction is cosmetic and the other is a wrong drawing, running out of budget must resolve
to the cosmetic side. That is what lets the cap be small enough to keep the whole scan effectively
linear on real graphs.

Determinism: arcs are visited in ascending edge order, both adjacency structures are built from that
same ordered list, and the probe is FIFO — so the budget cut-off, the only order-sensitive part of the
answer, lands in the same place on every run. Visited marks are generation stamps over one allocation
rather than a fresh `visited` vector per probe, so clearing is a counter bump.

### The relaxation is written into the IR, not just handed to the ranker

`relax_peer_edges` returns a `Cow<GraphIr>` — borrowed when nothing is relaxed, so only graphs that
actually contain peers pay for the clone — and **every** later step of the phase reads its constraints
from that relaxed IR.

That is not tidiness. Rank balancing ([§9](#9-aspect-ratio-rank-balancing)) re-derives the constraint
set from the IR itself rather than taking one, and closes with a feasibility repair. Handed the
caller's original IR, that repair would read `minlen = 1` for a peer edge and pull an equal-ranked
pair straight back apart — silently undoing the whole feature, with no error and no diagnostic.

---

## 8. The span-1 rule for labelled edges

Relaxing an edge to 0 opens a case that could not previously arise, and it needs closing before the
ranking leaves this phase.

> A labelled edge is drawable at **span 0** or **span ≥ 2**, and at no other value.

| span | where the badge lives |
| --- | --- |
| 0 | a flat edge: the badge rides the horizontal run, and Phase 6 widened the corridor by the label width to fit it |
| 1 | **nowhere** |
| ≥ 2 | the middle intermediate rank carries a `Label` item whose box *is* the badge reservation |

Span 1 is the hole. There is no intermediate rank, so Phase 4 degrades to `label_at = None` and the
badge falls through to [Phase 8's positional safety net](./10-edge-routing.md#the-safety-net-and-what-a-leader-line-means)
— which is allowed to emit a leader line and is covered by no reservation at all.

`enforce_labelled_span` closes it. For every arc with `minlen ≤ 1` that is **currently sitting at**
exactly span 1 and carries a label, it tightens that arc's `minlen` to 2 and runs
`repair_feasibility`, which only ever raises ranks. Each pass is therefore monotone and the loop
terminates; the `node_count + 1` bound is belt-and-braces.

Two deliberate asymmetries:

- **An edge resting at span 0 is left alone.** That is the same-rank placement §7 exists to produce,
  and it is drawable.
- **This is the one place a host's explicit `minLen: 1` loses**, for a labelled edge that lands at
  span 1. A badge with no reservation is a worse outcome than a rank separation the host asked for
  and did not get.

### Why it has to run last

```text
   relax peers → rank → park isolates → pins+repair | balance → ENFORCE SPAN → normalise
                                                         ▲           ▲
                                                         │           └── fixes it
                                                         └── creates the bad case
```

The failure mode is concrete. A labelled edge relaxed to `minlen = 0` legitimately lands at span 0 —
a flat edge, everything fine. Then `balance_ranks` pushes its target down one rank to respect the
width cap, and the edge is at span 1 with a badge and nowhere to put it. An earlier revision ran the
check *before* balancing, which inspects a rank vector that balancing then invalidates.

The measured symptom of getting this wrong: scenario 17 ("Cyclic Agent Execution Trace") emitted a
badge with a leader line overlapping two nodes — **the only constraint violation in the whole audit
suite**. Which is also the point of `leader_count` as a metric: it is not a crowding measure, it is a
signal that a reservation upstream of Phase 8 went missing.

---

## 9. Aspect-ratio rank balancing

Network simplex minimises edge length. It has no opinion whatsoever about the *shape* of the
drawing, and that produces two visible failure modes.

The bad one is a wide fan. One node into twelve sinks is an optimal ranking with two ranks:

```text
rank 0                              [ 0 ]
                     ______________/ /|\ \______________
                    /   /   /   /   / | \   \   \   \   \
rank 1           [1] [2] [3] [4] [5] [6] [7] [8] [9] [10] [11] [12]
```

Every edge has length 1. You cannot do better on the objective, and the result is a drawing you have
to scroll sideways to read.

### The derived cap

The balancer caps how many items a rank may hold. `max_nodes_per_rank` sets it directly; when it is
`0` (the default) the cap is **derived** from `target_aspect_ratio`, whose default is 1.6:

```rust
box_aspect = avg_w / avg_h
denom      = max(box_aspect / target_aspect_ratio, 0.05)
cap        = max(ceil(sqrt(node_count / denom)), 1)
```

The reasoning: treat the drawing as `node_count` boxes of average aspect $avg\_w / avg\_h$. A rank
holding $\sqrt{node\_count \cdot target / box\_aspect}$ boxes produces an overall drawing whose
aspect approaches the target.

Worked, for the 30-node mesh with the default 120×60 boxes:

$$box\_aspect = \frac{120}{60} = 2.0,\qquad
denom = \frac{2.0}{1.6} = 1.25,\qquad
cap = \left\lceil \sqrt{\frac{30}{1.25}} \right\rceil = \lceil 4.90 \rceil = 5$$

So no rank may hold more than 5 items. For the twelve-sink fan above (13 nodes), the same formula
gives $\lceil \sqrt{10.4} \rceil = 4$.

See [`resolved_max_nodes_per_rank`](../../crates/gvui/src/0_common/0_2_config.rs).

### The loop

```text
repeat (bounded):
    count the members of every rank
    target = the non-retired rank with the greatest excess over cap
             (ties -> the lowest rank index)
    if there is none: done
    movers = members of that rank whose downward slack is >= 1
    if movers is empty: retire the rank and continue
    sort movers by (greatest slack, fewest same-rank neighbours, lowest node index)
    move the first `excess` of them down exactly one rank
finally: repair feasibility, then normalise so the minimum rank is 0
```

**Downward slack** is how far a node may descend before one of its outgoing arcs goes short — the
minimum of $rank(to) - rank(n) - minlen$ over its out-arcs, and `u16::MAX` for a sink, which is free
to fall as far as the layout wants. An already-violated arc reports slack 0, so a node is never moved
on the strength of a constraint that is already broken.

The three sort keys, in order: greatest slack is the cheapest node to move; fewest same-rank
neighbours means moving it away from its siblings costs the ordering phase the least; lowest index
is the determinism tie-break.

The fan, at cap 4:

```text
rank 0                    [ 0 ]
rank 1        [1] [2] [3] [4]
rank 2        [5] [6] [7] [8]
rank 3        [9] [10] [11] [12]
```

### The invariant it must never break

**No `minlen` is ever violated.** That holds structurally, not by checking afterwards:

- a node moves down only when its downward slack is at least 1, so no outgoing arc can go short;
- moving a node down can only *increase* the slack of its incoming arcs;
- the balancer only ever moves nodes **down**, so it can widen the rank below but can never merge
  two ranks or invert an arc.

The closing `repair_feasibility` pass is belt-and-braces, not load-bearing.

Termination is likewise structural: each round either moves at least one node, retires one rank, or
stops. Rounds are additionally capped at both $4 \cdot rank\_count$ and $4N + 4$, so a graph whose
sinks have unbounded slack cannot be pushed down forever. And no rank ever empties — a round always
leaves `cap ≥ 1` behind — so the rank count cannot exceed the node count.

See [the implementation](../../crates/gvui/src/2_rank_assignment/2_3_rank_balancing.rs).

### The limit: it caps width, it cannot compact height

This is the honest part, and it is a documented limitation rather than a bug.

A ten-node chain is ten ranks because $rank(v) \ge rank(u) + 1$ says so, ten times over. No
rearrangement short of violating `minlen` can shorten it, and violating `minlen` would hand Phase 4 a
labelled edge with no rank for its badge. **Height is set by the graph's longest constrained path,
full stop.** The knob here is width.

The measured consequence is on the `clean_ring_10n_10e` fixture: 10 nodes, 10 edges, all labelled.
Every label forces `minlen = 2`, so the ring's spine is twice as deep as its node count, and the
graph draws as **19 ranks** — a very tall column, one item wide most of the way down. The ranking is
correct. The shape is not what you would draw by hand, and the balancer has no lever that reaches it.
Compacting height needs a different mechanism (merging ranks that no arc separates), and that does
not exist in v2.

---

## 10. What v1 did here, and what it cost

Two defects, both in ranking, both single lines.

**The 268-line network simplex was never called.** `assign_ranks` unconditionally delegated to
`assign_ranks_longest_path`. `run_network_simplex` existed, compiled, and was unreachable dead code.
Every drawing the engine ever produced used the maximally-tall ranking described in §2.

**The call site dropped the edge-role map.** The optimizer invoked
`assign_ranks(nodes, &active_edges, None)`, and with `None` the ranker fell back to
`!edge.is_cycle.unwrap_or(false)` to decide which edges were forward. The datasets did not set
`isCycle`, so Phase 2's cycle classification was discarded entirely and every edge — including
cycle-closing ones — entered the topological sort. Nodes on a cycle never reached in-degree 0, never
entered the topological order, never received a rank, and fell through to a default of `0`.

The measured effect on the 30-node, 45-edge mesh: **2 ranks, with 28 of the 30 nodes in one row.**
That single row is the origin of that fixture's 191 crossings and roughly 20 seconds of A\* routing,
because the router was asked to thread 45 edges through a layout with essentially no vertical
structure to use.

v2 draws the same graph on 15 ranks with 28 crossings in 1.79 ms. Almost none of that improvement is
a better algorithm; most of it is the algorithm that was already written being allowed to run on the
data it was supposed to see.

---

## 11. Output

```rust
pub struct RankResult {
    pub rank_of: Vec<u16>,          // indexed by node
    pub max_rank: u16,
    pub rank_members: Vec<Vec<u32>>, // node indices per rank
}
```

`rank_members` comes back sorted ascending by node index. That is a stable, arbitrary order and
explicitly *not* a layout decision — [Phase 5](./07-crossing-minimization.md) owns the order within
a rank and will permute it.

Next, [Phase 4](./06-layering-and-labels.md) turns this ranking into the layered graph, and puts
every edge badge into it as a first-class item.

---

← [Structure](./04-structure.md) | [Index](./README.md) | [Next: Layering and Labels →](./06-layering-and-labels.md)
$$
