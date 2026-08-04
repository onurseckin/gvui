← [Layering and Labels](./06-layering-and-labels.md) | [Index](./README.md) | [Next: Routing Demand →](./08-routing-demand.md)

# Crossing Minimization — Phase 5

At the end of [Phase 4](./06-layering-and-labels.md) the drawing is a stack of ranks. Every item —
real node, dummy bend point, or edge badge — sits in exactly one rank, and every edge has been
expanded into a chain of links, each connecting one rank to the next one down.

What is *not* yet decided is the left-to-right sequence within each rank. That is this phase's only
job, and it is the whole ballgame: the number of times edges cross each other is completely
determined by those sequences.

**This is the only search in the engine.** Every other phase computes its answer in one forward
pass. This one tries several candidate orderings and keeps the best, because the problem it solves
is NP-hard and no greedy rule is good enough. When you finish this chapter you should understand
what is being searched, why the search is affordable, and why it is bounded.

See [the ordering driver](../../crates/gvui/src/3_crossing_minimization/3_4_order_facade.rs), the
[counting](../../crates/gvui/src/3_crossing_minimization/3_2_crossing_counting.rs) and the
[primitives](../../crates/gvui/src/3_crossing_minimization/3_3_ordering.rs).

---

## 1. A crossing is decided by order, not by geometry

Start with the simplest possible picture: two ranks, two items each, two edges.

```text
rank 0:   [A]      [B]          order:  A=0   B=1
            \      /
             \    /
              \  /
               \/
               /\
              /  \
             /    \
rank 1:   [C]      [D]          order:  C=0   D=1

edges: A -> D   and   B -> C
```

Those two edges cross. Now swap `C` and `D` in the lower rank and change nothing else:

```text
rank 0:   [A]      [B]          order:  A=0   B=1
            |        |
            |        |
            |        |
rank 1:   [D]      [C]          order:  D=0   C=1

edges: A -> D   and   B -> C
```

They no longer cross. The nodes have the same sizes, the same ranks, the same edges. The only thing
that changed is a permutation. And notice what we did **not** need to know to decide this: no
pixel coordinate, no node width, no label size, no routing path. Just four integers.

### The rule, stated exactly

Take two edges in the same rank pair. Edge 1 goes from an item at order $u_1$ in the upper rank to
an item at order $v_1$ in the lower rank. Edge 2 goes from $u_2$ to $v_2$.

They cross if and only if the two orders **invert**:

$$(u_1 < u_2 \ \text{and}\ v_1 > v_2) \quad\text{or}\quad (u_1 > u_2 \ \text{and}\ v_1 < v_2)$$

Draw it once and it becomes obvious. If edge 1 starts to the left of edge 2 and ends to the right of
it, the two lines must have traded sides somewhere in between, and the only way to trade sides is to
meet.

Two consequences fall out for free:

- **Edges sharing an endpoint never cross.** If $u_1 = u_2$ the condition needs a strict inequality
  it cannot get. Two edges leaving the same node fan out; they do not cross each other.
- **Crossings are counted per rank pair, and the pairs are independent.** A crossing between rank 0
  and rank 1 cannot be created or removed by anything happening between rank 4 and rank 5. So the
  total is just a sum:

$$\text{crossings}(G) = \sum_{r=0}^{R-2} \text{crossings}(r, r+1)$$

This is what
[`count_all`](../../crates/gvui/src/3_crossing_minimization/3_2_crossing_counting.rs) computes, and
it is exact — not an estimate.

### Why this is *combinatorial* and not *geometric*

The count above is a property of a permutation. It is the number the search minimizes. It is not the
number of places where two ink lines happen to intersect in the final SVG, which is a different
quantity measured much later by `detect_geometric_crossings` for the metrics report only.

The two numbers agree for shallow drawings and diverge slightly for dense ones. That gap is a real,
characterised property of orthogonal lane routing, and it is explained at the end of
[the next chapter](./08-routing-demand.md#8-the-measured-consequence). What matters here is that the
combinatorial count is the *only* thing Phase 5 optimizes, and that no later phase can change it.

> **Invariant leaving Phase 5:** every rank is a fixed permutation. All crossing decisions are
> final. Phase 6 derives lane demand from the ordering, Phase 7 derives coordinates from that, and
> Phase 8 only draws. No later phase creates or removes a combinatorial crossing.

---

## 2. Why this has to be a search

Given a fixed upper rank, finding the lower-rank permutation that minimizes crossings is called the
**one-sided two-layer crossing minimization problem**, and it is NP-hard (Eades & Whitesides). The
two-sided version, where both ranks are free, is harder still. And a real graph has many ranks that
all interact.

That is not a statement about implementation effort. It means there is no known rule of the form
"sort each rank by *X*" that is guaranteed to produce the optimum, and — unless P = NP — there never
will be. Anything short of exhaustive enumeration is a heuristic, and enumeration is $O(n!)$ per
rank.

So the engine does what you do when a problem is genuinely hard and you have a millisecond budget:

1. Pick a heuristic with a **proven approximation bound** (the median rule).
2. Apply it repeatedly, alternating direction, until it stops improving.
3. Polish with a cheap local move (adjacent swaps).
4. Do all of that from several different starting permutations and keep the best result.
5. Never spend the budget anywhere else.

Point 5 is the design rule of the whole engine restated. v1 wrapped a search around the *entire*
pipeline — route everything, score it, mutate a port, route everything again. v2 confines search to
this one phase, where the objective is exact and costs $O(E \log V)$ to evaluate, and lets every
other phase run once.

---

## 3. Counting crossings cheaply

Everything above is affordable only if you can evaluate the objective quickly, because the search
evaluates it thousands of times. So counting comes first.

### 3.1 The naive way

Collect every arc between rank $r$ and rank $r+1$ as a pair `(source order, target order)`, then
test every pair of arcs against the inversion rule:

```text
count = 0
for i in 0..arcs.len():
    for j in (i+1)..arcs.len():
        (u1, v1) = arcs[i]
        (u2, v2) = arcs[j]
        if (u1 < u2 and v1 > v2) or (u1 > u2 and v1 < v2):
            count += 1
```

This is correct, obvious, and $O(E^2)$ per rank pair. It still exists in the codebase as
`brute_force_between`, used exclusively as a test oracle: 200 randomized bipartite layers are
counted both ways and the results must match.

For a rank pair with 40 arcs that is 780 comparisons. Run it once per candidate swap in a transpose
pass over a 30-node graph and you are into the millions.

### 3.2 The Barth–Mutzel–Jünger accumulator tree

There is a much better way, and it comes from noticing that the naive loop is really counting
**inversions** in a sequence.

Sort the arcs by `(source order, target order)`. Now read off just the target orders, in that sorted
sequence. A pair of arcs crosses exactly when an earlier entry in this sequence is *strictly
greater* than a later one. That is the textbook inversion count — and counting inversions is a
solved problem with a binary indexed tree.

Sorting by source-then-target is doing double duty. It puts the arcs in the order the inversion
count needs, *and* it makes shared endpoints handle themselves: two arcs from the same source appear
consecutively with non-decreasing targets, so the earlier one is never strictly greater than the
later one, so they are never counted. No special case needed.

The tree is a complete binary tree over $2^{\lceil \log_2 q \rceil}$ leaves, where $q$ is the number
of items in the lower rank. Leaf $k$ counts how many arcs with target order $k$ have been inserted
so far; each internal node holds the sum of its subtree. Insertion walks from a leaf to the root,
and **every time the walk stands on a left child, the entire right-sibling subtree holds targets
strictly greater than ours — all of them already inserted.** Adding those sibling counts on the way
up gives the answer for this arc exactly.

That is the whole algorithm:

```rust
let mut index = target_order as usize + size - 1;   // leaf position
tree[index] += 1;
while index > 0 {
    if index % 2 == 1 {                  // we are a left child
        crossings += tree[index + 1];    // ...so the right sibling subtree is all greater
    }
    index = (index - 1) / 2;             // move to the parent
    tree[index] += 1;
}
```

One arc costs one root-to-leaf walk, so the whole rank pair is $O(E \log V)$.

### 3.3 A worked example

Two ranks of four items each, five arcs. Sorted by `(source, target)`:

| arc | source order | target order |
| --- | ---: | ---: |
| a | 0 | 2 |
| b | 1 | 0 |
| c | 1 | 3 |
| d | 2 | 1 |
| e | 3 | 1 |

The target sequence is `[2, 0, 3, 1, 1]`. Brute force says 5 crossings: `a×b`, `a×d`, `a×e`, `c×d`,
`c×e`. (`b` and `c` share source 1, so they never cross; `d` and `e` share target 1, likewise.)

Now the tree. $q = 4$, so `size = 4` and leaf $k$ lives at array index $k + 3$:

```text
                    node 0
                   /      \
             node 1        node 2
             /    \        /    \
        leaf0    leaf1  leaf2   leaf3
        idx 3    idx 4  idx 5   idx 6
        (t=0)    (t=1)  (t=2)   (t=3)
```

Insert the targets in sequence:

| step | target | leaf idx | walk | sibling sums added | running total |
| --- | ---: | ---: | --- | --- | ---: |
| 1 | 2 | 5 | 5 (left) → 2 → 0 | `tree[6] = 0` | 0 |
| 2 | 0 | 3 | 3 (left) → 1 (left) → 0 | `tree[4] = 0`, `tree[2] = 1` | 1 |
| 3 | 3 | 6 | 6 (right) → 2 (right) → 0 | — | 1 |
| 4 | 1 | 4 | 4 (right) → 1 (left) → 0 | `tree[2] = 2` | 3 |
| 5 | 1 | 4 | 4 (right) → 1 (left) → 0 | `tree[2] = 2` | 5 |

Total **5**, matching brute force, in five short walks instead of ten pairwise tests. Read step 4
carefully because it is the crux: inserting target 1 arrives at leaf index 4, which is a *right*
child, so nothing is added there — but its parent (node 1) is a *left* child, and node 2's subtree
covers leaves 2 and 3, both strictly greater than 1. At that moment node 2 holds 2 (arc `a` at
target 2 and arc `c` at target 3). Those are exactly the two crossings `a×d` and `c×d`.

### 3.4 Why cheap counting is the load-bearing decision

v1's counter was the $O(E^2)$ double loop **and** it cloned a `Vec<String>` of node ids per layer on
every call. Each individual call was slow enough that the crossing-minimization stage could not
afford to run its configured 24 sweeps. So it was paired with an early return:

```rust
if best_crossings == 0 || has_custom_orders { return ...; }
```

And then a separate bug made that condition always true. v1's layer graph only admitted edges whose
role was `Forward`; feedback and cross edges were dropped entirely, so the counter never saw them.
Measured across all eight datasets, the number of crossings the ordering stage *saw* was:

| dataset | forward | cross | feedback | crossings ordering saw | crossings the optimizer saw |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ai_agent_trace` | 4 | 0 | 2 | 0 | 0 |
| `crossing_mesh_10n_10e` | 5 | 0 | 5 | **0** | 7 |
| `dense_kubernetes_mesh` | 30 | 2 | 13 | **0** | **433** |
| `kubernetes_cluster_topology` | 11 | 0 | 2 | 0 | 2 |

Zero on every dataset. The early return fired every time. **Crossing minimization never executed on
real input, ever.** The 191 crossings v1 produced on the dense mesh were not the result of a search
that did badly; they were the result of no search at all.

v2's counter is fast enough that no early return is needed and no allocation happens per call, which
is why the transpose pass below can afford to re-count after every candidate swap. Cheap counting is
not an optimization here — it is the precondition for the rest of the phase existing.

---

## 4. The sweep: median and barycenter

The core move is beautifully simple. Assume the rank above you is fixed. For each item in your rank,
look at where its neighbours sit in that fixed rank, reduce those positions to a single number, and
sort your rank by that number.

```text
                    fixed rank above (orders 0..4)
rank r-1:   [P0]   [P1]   [P2]   [P3]   [P4]
              \     |  \    |     /
               \    |   \   |    /
rank r:        [ X ]      [ Y ]        <- X's neighbours are at orders {0,1}
                                          Y's neighbours are at orders {1,3}

median(X) = 0.5      median(Y) = 2.0     ->  X before Y
```

Two reduction rules are available, selected by `config.ordering`:

**Median** (`OrderingHeuristic::Median`, the default) takes the middle neighbour order. For an even
number of neighbours it uses the Gansner et al. interpolated median, which leans toward whichever
half is more tightly packed:

$$\text{pos} = \frac{\text{lo} \cdot \text{right} + \text{hi} \cdot \text{left}}{\text{left} + \text{right}}$$

where `lo` and `hi` are the two middle values, $\text{left} = \text{lo} - \min$, and
$\text{right} = \max - \text{hi}$. For neighbour orders $\{0, 4, 5, 6\}$: `lo` = 4, `hi` = 5,
$\text{left} = 4$, $\text{right} = 1$, giving $(4 \cdot 1 + 5 \cdot 4)/5 = 4.8$ — pulled toward 5,
because the neighbours are dense on that side. When every neighbour order is identical the
denominator is zero and the code falls back to the plain midpoint; a `NaN` position would make the
sort comparison order-dependent and destroy determinism.

**Barycenter** (`OrderingHeuristic::Barycenter`) takes the arithmetic mean instead.

### Why median is the default

The median heuristic has a **proven approximation bound**: for the one-sided two-layer problem its
output is at most 3× the optimal number of crossings. Barycenter has no such bound — its worst case
is unbounded relative to the optimum. Barycenter is sometimes visually smoother on very regular
graphs, so it stays available as a Tier-2 knob, but a rule with a guarantee beats a rule without one
as a default.

### Items with no neighbours hold station

An item with no neighbours in the adjacent rank takes **its current order** as its position, not
zero. This matters more than it sounds: collapsing every unattached item to position 0 would drag
them all to the left edge of the rank and shove everything else sideways for no reason at all.

### Alternating direction

One downward sweep positions rank 1 from rank 0, rank 2 from the freshly-positioned rank 1, and so
on. It propagates information from the top of the drawing to the bottom — and nothing in the other
direction. So sweeps alternate: even sweeps go down, odd sweeps go up. Rank 0 is a fixed point of a
downward sweep (it has no rank above), and the last rank is a fixed point of an upward one.

### The two-representation problem

One implementation detail worth knowing because it shapes the code. `Layered` stores items
rank-major, so a rank is a contiguous slice and `Item::order` is an index into it. But the CSR
adjacencies, the edge chains, and `item_of_node` all address items by their **global slice index**.
Physically permuting a rank would invalidate every one of them.

So every pass here works in two steps: mutate `Item::order` only, then call `materialize` once at
the end, which permutes the slices *and* rewrites every item-index reference to match. Crossing
counting deliberately reads `order` and never the slice position, so the graph stays countable the
whole time a pass is mid-permutation. That is what makes the transpose pass's local re-count legal.

---

## 5. Transpose: adjacent swaps

Median sweeps converge to something decent and then stop, because they only ever look one rank away.
The transpose pass cleans up what they leave behind, with the simplest move available: take each
adjacent pair of items in a rank, swap them, and keep the swap if it did not make things worse.

```text
before:  [A] [B] [C] [D]      local crossings = 7
swap B,C: [A] [C] [B] [D]      local crossings = 5   -> keep
swap B,D: [A] [C] [D] [B]      local crossings = 6   -> revert
```

Two details make this both correct and cheap.

### 5.1 The count is local

Swapping two items *within* rank $r$ can only change crossings in the two rank pairs that touch
rank $r$: $(r-1, r)$ and $(r, r+1)$. Every other rank pair is untouched. So a candidate swap costs
two calls to `count_between_ranks`, not a full-graph recount:

```rust
fn local_pair_count(layered: &Layered, rank: usize) -> usize {
    let above = if rank > 0 { count_between_ranks(layered, (rank - 1) as u16) } else { 0 };
    above.saturating_add(count_between_ranks(layered, rank as u16))
}
```

`count_between_ranks` returns 0 for an out-of-range rank rather than panicking, which is exactly why
the caller can probe rank boundaries without branching. And because the count *after* accepting a
decision is the count *before* the next candidate, the running value is carried forward — each
candidate costs one re-count, not two. v1 recounted the entire graph for every candidate swap.

### 5.2 The comparison bug, in detail

This is subtle, v1 had it, and it silently disabled the pass. Here is the correct form:

```rust
swap_slots(layered, &mut slot_to_item, i);
let after = local_pair_count(layered, r);

if after > current {
    swap_slots(layered, &mut slot_to_item, i);   // strictly worse: undo
} else if after < current {
    changed = true;
    current = after;                              // better: accept, and move the bar
} else {
    current = after;                              // tie: accept
}
```

The candidate is judged against **`current`** — the count of the state we are actually standing in,
right now, recomputed as we go. v1 judged it against **`best_crossings`**, a running global minimum
across the whole search.

Walk through why that fails. Suppose the rank starts at local count 7. A swap takes it to 5, and 5
is recorded as the global best. The next candidate swap takes 5 down to 4 — a genuine improvement —
but it is compared against `best = 5`… and it is only accepted if it beats the best, which it does,
so `best` becomes 4. Fine so far. Now consider a *different* rank whose local count is 9, and a swap
that would bring it to 6. That is a two-crossing improvement to a real part of the drawing. But
$6 > 4$, so measured against the global best it looks like a regression, and it is rejected.

The global best is monotonically non-increasing, so the bar only ever rises. After the first good
pass it sits below the local count of almost every rank in the graph, and from then on **nothing is
ever accepted anywhere**. The pass becomes a no-op that still costs full price to run.

Two further points:

- **Ties are accepted.** A swap that leaves the count unchanged is kept. This is not sloppiness — it
  is what lets the search walk across plateaus, where several equally-good orderings sit between the
  current one and a better one. Rejecting ties strands the search on the first plateau it hits.
- **The pass holds no state between calls.** There is a regression test asserting exactly this: run
  transpose on a fully-reversed 4×4 rank pair (6 crossings), re-scramble the same graph object back
  to the worst ordering, run transpose again, and the second pass must reach the same local optimum
  as the first. Under the v1 comparison it does not.

---

## 6. Dummy priority: turning staircases into lines

An edge spanning several ranks was expanded in Phase 4 into a chain of dummy items, one per
intermediate rank. If those dummies drift to different orders on their way down, the edge renders as
a staircase:

```text
rank 1:   [N]  (d)                    rank 1:   [N]  (d)
rank 2:   (d)  [N]                    rank 2:   [N]  (d)
rank 3:   [N]  [N]  (d)               rank 3:   [N]  [N]  (d)   <- drifts
rank 4:   (d)  [N]                    rank 4:   [N]  [N]  (d)
rank 5:   [N]                         rank 5:        [N]

        staircase: 4 bends                 straight: 1 bend
        the eye cannot follow it           the eye follows it instantly
```

Keeping a chain at one order index across all its ranks is the single largest aesthetic win
available in this phase, and it is bought with a priority ordering
([`priority`](../../crates/gvui/src/3_crossing_minimization/3_3_ordering.rs)):

| item kind | priority | reasoning |
| --- | ---: | --- |
| `Dummy` | `u32::MAX` | immovable — a straight long edge is worth more than any local nudge |
| `Label` | `1_000_000` | a badge must not be pushed off the line it annotates |
| `Real` | `min(degree, 999_999)` | high-degree nodes are more expensive to move |

The clamp is deliberate: a real node with a million neighbours still cannot outrank a badge.

**Priority only decides contests.** When two items compute the *same* position, the higher-priority
one takes the lower slot. It explicitly does **not** let a high-priority item claim a slot away from
an item with a strictly better position. The reason is worth stating, because it looks like a missed
opportunity: positions live in the *adjacent* rank's index space. A rank of 3 fed by a rank of 10
produces positions in $[0, 9]$ that must be interpreted as slots in $[0, 2]$, and any rescale that
does so re-invents the very ordering the median heuristic just computed. Making a dummy chain
perfectly vertical is [Phase 7's job](./09-coordinate-assignment.md) — Brandes–Köpf marks type-1
conflicts precisely so inner segments stay straight. This phase only has to avoid handing Phase 7 an
ordering that makes straightness impossible.

Priority appears in one more place: in transpose, when a swap leaves the crossing count *unchanged*,
it is rejected if it strictly worsens how well a dummy or label lines up with its chain neighbours.
An equal-crossing swap that bends a long edge is pure loss.

The knob is `config.dummy_priority`, default `true`. A test pins the behaviour both ways: with
priority on, a four-dummy chain running alongside a parallel chain of real nodes comes out straight;
with it off, the real node's earlier current order wins the tie and the chain starts one slot over.

---

## 7. Seeds: four independent starts

Local search gets stuck in local minima. The standard cure is restarts, and the standard mistake is
restarting from where the last attempt converged — which is not a restart at all, just a longer
chain.

`apply_seed` overwrites the within-rank order from one of several deterministic starting
permutations. Items never move between ranks; only the order within a rank changes.

| seed | permutation |
| ---: | --- |
| 0 | keep the current order (i.e. whatever Phase 4 produced) |
| 1 | DFS pre-order over `down`, from the rank-0 items sorted by descending out-degree |
| 2 | BFS level order from the same roots |
| 3 | reverse of seed 1 |
| ≥ 4 | rotate rank $r$ by $(\text{seed} + r) \bmod \text{len}$ |

`config.ordering_seeds` defaults to 4, so the default run uses exactly seeds 0–3. The rotation seeds
exist so that raising the knob produces structurally unrelated starting permutations without ever
needing a random number generator — determinism is a hard requirement, so there is no RNG anywhere
in the engine.

Items unreachable from rank 0 are picked up by a second traversal in item-index order, so every item
gets a defined position and no seed silently degenerates on a graph with disconnected upper ranks.

---

## 8. The driver

[`order_layers`](../../crates/gvui/src/3_crossing_minimization/3_4_order_facade.rs) puts the pieces
together:

```text
renumber_orders()                       # make `order` agree with slice position
best_crossings = count_all()

if ranks < 2 or best_crossings == 0 or budget is zero:
    return                              # nothing to search for

input = clone(layered)                  # every seed restarts from HERE
best  = clone(layered)

for seed in 0..ordering_seeds:          # default 4
    layered = clone(input)
    apply_seed(layered, seed)
    stalled = 0

    for sweep in 0..ordering_sweeps:    # default 16
        position_sweep(down if sweep even else up)
        transpose()

        crossings = count_all()
        if crossings < best_crossings:
            best_crossings = crossings
            best = clone(layered)
            stalled = 0
        else:
            stalled += 1
            if stalled >= 4: break      # STALL_LIMIT — abandon this seed

        if best_crossings == 0:      break out of everything
        if elapsed > time_budget_ms: break out of everything

layered = best
```

Things to notice:

- **Each seed restarts from `input`**, not from where the previous seed landed. That is what makes
  the seeds independent samples of the search space.
- **`STALL_LIMIT` is 4 and deliberately small.** Median sweeps converge fast; a seed that has stalled
  for four rounds is better abandoned in favour of the next restart than ground on further in the
  same basin.
- **A planar drawing short-circuits.** If the input already has zero crossings there is nothing to
  find, and the phase returns having done nothing but repair the `order` field. This is the same
  early-return shape v1 had — but v1's counter reported zero because it could not see feedback
  edges, whereas v2's zero is a true zero.
- **The reported count describes what is installed**, not the last candidate tried. `best` is a whole
  `Layered` clone rather than a bare `Vec<u16>` of orders, because materializing a permutation
  renumbers item indices; an orders-only snapshot taken before one materialization is meaningless
  after the next.
- **The search can never make a graph worse.** The input ordering is itself one of the candidates
  (seed 0 with zero sweeps applied is the starting `best_crossings`), so the installed result is at
  worst what arrived.

### Cost and determinism

Worst case the phase runs $\text{seeds} \times \text{sweeps} = 4 \times 16 = 64$ rounds, each a
median sweep plus a transpose pass plus one $O(E \log V)$ full count. In practice `STALL_LIMIT` and
the zero-crossing exit cut it far shorter. Measured on the `dense_kubernetes_mesh` fixture (30 nodes,
45 edges, 15 ranks), the *entire* layered pipeline runs in 1.79 ms.

Identical input yields byte-identical output, with exactly one documented exception:
`config.time_budget_ms` (default 250 ms). If that fires, the search stops at a machine-dependent
point. It is a safety rail against pathological graphs, not a tuning dial — the whole phase is
budgeted at single-digit milliseconds, so reaching 250 ms means the graph is far outside the design
envelope. See [Determinism](../concepts/determinism.md) for the full contract.

### What the phase achieved

On the eight audit fixtures, v1 versus v2 combinatorial crossings:

| dataset | N | E | v1 | v2 |
| --- | ---: | ---: | ---: | ---: |
| `kubernetes_cluster_topology` | 12 | 13 | 2 | **0** |
| `dense_kubernetes_mesh` | 30 | 45 | 191 | **28** |

The dense mesh number has two causes, and it is worth separating them. Part of the improvement is
this phase actually running. The other part is upstream: v1 dropped the edge-role map on the way
into rank assignment, which put 28 of 30 nodes into a single rank. A 2-rank layout of a 30-node mesh
has nowhere to *put* the crossings but on top of each other. With the role map passed through, the
same graph ranks into 15 ranks — and then Phase 5 has something it can actually improve. See
[Rank Assignment](./05-rank-assignment.md).

---

← [Layering and Labels](./06-layering-and-labels.md) | [Index](./README.md) | [Next: Routing Demand →](./08-routing-demand.md)
