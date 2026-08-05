← [Ingest and Measurement](./03-ingest-and-measurement.md) | [Index](./README.md) | [Next: Rank Assignment →](./05-rank-assignment.md)

# Structure

Phase 2. One job: turn the input digraph into a **directed acyclic graph** without losing a single
edge.

Implemented in [`1_cycle_breaking/`](../../crates/gvui/src/1_cycle_breaking/), four files:
Tarjan's strongly connected components, the Eades–Lin–Smyth feedback arc set, a Kahn verifier, and
the [facade](../../crates/gvui/src/1_cycle_breaking/1_6_structure.rs) that sequences them.

---

## Why cycles break layered drawing

A layered drawing assigns every node an integer **rank**, and draws rank 0 at the top, rank 1 below
it, and so on. The whole point is that an edge always points _down_: if you see an arrow, you know
the thing it points at is later.

For that to be possible, every edge $u \to v$ must satisfy

$$\text{rank}(v) \ge \text{rank}(u) + 1$$

Now take three nodes in a loop:

```text
        a ──► b
        ▲     │
        │     ▼
        └──── c
```

The three constraints are $\text{rank}(b) > \text{rank}(a)$, $\text{rank}(c) > \text{rank}(b)$, and
$\text{rank}(a) > \text{rank}(c)$. Chain them: $\text{rank}(a) > \text{rank}(a)$. There is no
assignment of integers that satisfies all three. Not "a bad one exists" — **none exists.**

So a layered engine must decide what to do about the cycle before ranking runs. There are only two
options: remove an edge from consideration, or turn one around. v2 turns it around, and the rest of
this chapter is about why that distinction is the most consequential one in the phase.

### What happens if you don't

Ranking algorithms do not politely report the contradiction. They loop, or they lie.

- **Kahn's algorithm** peels off nodes with in-degree 0. A node on a cycle never reaches in-degree
  0, so it never gets peeled, never gets a rank, and falls through to whatever the default is —
  usually 0.
- **Longest-path relaxation** repeatedly pushes a node down when a predecessor is too close. On a
  cycle, every push creates another violation, and it relaxes until it hits an iteration cap.

Both failures were measured on this codebase. v1 passed `None` where the edge-role map belonged, so
every cycle-closing edge entered the topological sort. On `dense_kubernetes_mesh` — 30 nodes, 45
edges — the cyclic nodes all defaulted to rank 0 and the result was **2 ranks with 28 of the 30
nodes in a single row**. That single dropped argument is the origin of that dataset's 191 crossings
and 20 seconds of routing time.

The other failure mode showed up in v2 itself, during integration, and is described at the
[end of this chapter](#the-iscycle-hint-is-a-bias-not-a-mandate).

---

## Step 1 — Find the cycles: Tarjan's SCC algorithm

You could break cycles by searching for them directly, but there are exponentially many. The useful
question is not "where are the cycles" but "which _regions_ of the graph contain any".

That region is a **strongly connected component** (SCC): a maximal set of nodes in which every node
can reach every other node by following arrows.

```text
      ┌───────────────┐
      │   a ──► b     │      SCC {a, b, c}: from any of the three
      │   ▲     │     │      you can reach the other two.
      │   └──── c     │
      └───────┬───────┘
              │
              ▼
              d              SCC {d}: alone. No way back.
```

Two facts make this the right decomposition:

1. **Every directed cycle lies entirely inside one SCC.** If a cycle spanned two components they
   would be mutually reachable and would therefore be the same component.
2. **A component with one node and no self-loop can contain no cycle at all.**

So cycle breaking only has to run inside non-trivial components, and every arc _between_ components
can be left alone — those arcs form the _condensation_, which is a DAG by construction. Running the
breaking heuristic on them anyway would be wasted work that could only make the drawing worse, by
reversing an edge that was fine.

### How Tarjan works

A single depth-first search, with two numbers per node:

- **`index[v]`** — the order `v` was first visited. Assigned once, never changes.
- **`lowlink[v]`** — the smallest `index` reachable from `v` using tree edges plus _at most one_
  arc back to a node still on the DFS stack.

Nodes are pushed onto a stack when first visited and stay there until their component is emitted.
When a node finishes exploring and `lowlink[v] == index[v]`, `v` is the **root** of a component:
everything above it on the stack (including it) is popped off as one SCC.

The intuition: `lowlink[v] < index[v]` means "from `v` I can get back to something discovered
earlier, which is still open" — i.e. `v` is on a cycle with that earlier node. If `v` cannot get
back to anything earlier, the search below `v` is self-contained and closes here.

### Worked example

Graph: `0→1`, `1→2`, `2→0`, `2→3`.

| step | action                             | index | lowlink                    | stack       | emitted     |
| ---- | ---------------------------------- | ----- | -------------------------- | ----------- | ----------- |
| 1    | visit 0                            | `0:0` | `0:0`                      | `[0]`       |             |
| 2    | 0→1, visit 1                       | `1:1` | `1:1`                      | `[0,1]`     |             |
| 3    | 1→2, visit 2                       | `2:2` | `2:2`                      | `[0,1,2]`   |             |
| 4    | 2→0, 0 is on stack                 |       | `2:0` ← min(2, index[0]=0) | `[0,1,2]`   |             |
| 5    | 2→3, visit 3                       | `3:3` | `3:3`                      | `[0,1,2,3]` |             |
| 6    | 3 done, `lowlink==index`           |       |                            | `[0,1,2]`   | **{3}**     |
| 7    | back in 2: `lowlink[2]=min(0,3)=0` |       | `2:0`                      | `[0,1,2]`   |             |
| 8    | 2 done, `0 ≠ 2` → not a root       |       | `1:min(1,0)=0`             | `[0,1,2]`   |             |
| 9    | 1 done, `0 ≠ 1` → not a root       |       | `0:min(0,0)=0`             | `[0,1,2]`   |             |
| 10   | 0 done, `lowlink==index` → root    |       |                            | `[]`        | **{0,1,2}** |

Result: components `{3}` and `{0,1,2}`, with `cyclic = [false, true]` respectively. Only `{0,1,2}`
goes to the next step. The arc `2→3` leaves its component and is never touched.

### Two implementation details that are not incidental

**Components are sorted by their minimum member.** Tarjan naturally emits components in reverse
topological order of the condensation, which depends on which node the outer loop happened to start
from. Sorting by minimum member makes the component numbering a function of the _arc set_ rather
than of a traversal accident, which is what lets every downstream phase index by component and still
be reproducible. Member lists are sorted ascending too.

**The traversal is explicitly stacked, not recursive.** A recursive Tarjan on a 50,000-node chain
recurses 50,000 frames deep. On the small wasm stack that is a trap — and a wasm stack overflow is
an unrecoverable trap, not a catchable panic, so the whole module dies. The implementation carries
its own `Vec<(node, cursor)>` frame stack; there is a unit test at exactly that size.

Cost: $O(V + E)$, one pass.

---

## Step 2 — Choose what to reverse: the feedback arc set problem

Inside a cyclic component, which arcs should be turned around?

**Definition.** A _feedback arc set_ (FAS) of a digraph is a set of arcs whose removal (or here,
reversal) leaves no directed cycle. The **minimum** FAS is the smallest such set.

You want the minimum, because every reversed arc is an arrow that points the wrong way in the final
drawing. Two reversed edges look deliberate; twenty look broken.

**And you cannot have it.** Minimum feedback arc set is **NP-hard** — one of Karp's original 21
NP-complete problems in its decision form. No polynomial-time exact algorithm is known, and if one
were found it would settle P vs NP. For a graph with a few dozen nodes on a cycle you would be
looking at exponential search.

That is a hard stop, and it is _why_ this phase uses a heuristic rather than an optimum. Which is
fine, because a heuristic with a proven bound is available and runs in linear time.

### The Eades–Lin–Smyth greedy heuristic

Published in 1993. The idea is a change of viewpoint: instead of choosing arcs, choose an **order of
the vertices**, then declare every arc that points backwards in that order to be a feedback arc.

That reframing is what makes the result safe. Whatever sequence you end up with, reversing exactly
the backward arcs makes _every_ arc point forward along the sequence — and a graph whose arcs all
agree with a total order cannot have a cycle. Acyclicity is a property of the construction, not
something you have to check afterwards. (Hold on to that sentence; it is the crux of the last
section of this chapter.)

The sequence is built by repeatedly peeling one vertex off the remaining graph:

```text
while vertices remain:
    1. if some vertex has out-degree 0 (a SINK)   → append it to the RIGHT end
    2. else if some vertex has in-degree 0 (a SOURCE) → append it to the LEFT end
    3. else → take the vertex maximising (out-degree − in-degree), append LEFT
    remove it, and update its neighbours' degrees
```

Why those three rules:

- A **sink** has no outgoing arcs, so putting it last cannot create a backward arc _from_ it. Every
  arc it touches is incoming, and all of those now point forward.
- A **source** is the mirror image: no incoming arcs, so putting it first is free.
- Otherwise every remaining vertex has arcs in both directions and something must be sacrificed.
  Take the vertex with the greatest **excess** of out-arcs over in-arcs and put it on the left: its
  many out-arcs all become forward arcs, and only its few in-arcs become backward.

**Guarantee:** $|FAS| \le m/2 - n/6$ for a simple digraph with $m$ arcs and $n$ vertices, in linear
time. That bound is asserted directly in the unit tests
([`1_3_eades_fas.rs`](../../crates/gvui/src/1_cycle_breaking/1_3_eades_fas.rs)).

Linear time matters here for a specific reason: **Phase 2 has no retry loop.** There is no outer
search that will call it again with a different seed if the result is poor. It has to be right the
first time, cheaply.

### Worked trace

Take a 5-ring with one chord: `0→1`, `1→2`, `2→3`, `3→4`, `4→0`, `3→1`.

```text
        0 ──► 1 ──► 2
        ▲     ▲     │
        │     └──┐  ▼
        4 ◄────── 3
```

Degrees to begin with:

| v   |   out |  in | out − in |
| --- | ----: | --: | -------: |
| 0   |     1 |   1 |        0 |
| 1   |     1 |   2 |       −1 |
| 2   |     1 |   1 |        0 |
| 3   | **2** |   1 |   **+1** |
| 4   |     1 |   1 |        0 |

| step | no sink? | no source? | pick               | side  | remaining degrees after removal      |
| ---- | -------- | ---------- | ------------------ | ----- | ------------------------------------ |
| 1    | none     | none       | **3** (max Δ = +1) | LEFT  | 2 becomes a sink; 4 becomes a source |
| 2    | **2**    |            | 2                  | RIGHT | 1 becomes a sink                     |
| 3    | **1**    |            | 1                  | RIGHT | 0 becomes a sink                     |
| 4    | **0**    |            | 0                  | RIGHT | 4 becomes a sink                     |
| 5    | **4**    |            | 4                  | RIGHT | —                                    |

`left = [3]`, sinks collected as `[2, 1, 0, 4]` and reversed to `[4, 0, 1, 2]`, giving the sequence

```text
position:   0     1     2     3     4
vertex:     3     4     0     1     2
```

Now classify every arc by comparing positions:

| arc | pos(from) | pos(to) | verdict            |
| --- | --------: | ------: | ------------------ |
| 0→1 |         2 |       3 | forward            |
| 1→2 |         3 |       4 | forward            |
| 2→3 |         4 |       0 | **backward → FAS** |
| 3→4 |         0 |       1 | forward            |
| 4→0 |         1 |       2 | forward            |
| 3→1 |         0 |       3 | forward            |

One arc out of six. Reverse `2→3` into `3→2` and the graph becomes `3→4→0→1→2`, plus `3→1` and
`3→2` as shortcuts — a DAG.

### Keeping it linear

Rule 3 — "the vertex maximising out−in" — is where a naive implementation goes quadratic, by
rescanning every remaining vertex on every peel. The implementation instead keeps a `DeltaIndex`:
an array of buckets indexed by `out − in` (offset by the arc count so negatives fit), plus separate
lists for sinks and sources.

Deletion is **lazy**. When a vertex's degree changes it is re-filed into its new bucket, and the
stale entry is simply skipped when a cursor reaches it and finds the vertex removed or re-classed.
Every collection is append-only with a forward cursor, so total work is bounded by the number of
filings, which is $n + 2m$.

A binary heap would also work and would cost an extra $\log n$ per degree update; re-scanning the
live set would cost $O(n)$ per peel. Buckets with lazy deletion cost $O(1)$ amortised.

Ties inside a bucket resolve by ascending index, because the initial fill walks vertices in
ascending order and the cursor never goes backwards. Deterministic, with no sort.

Two contract details worth knowing:

- **A self-loop is always returned as a feedback arc.** It is a cycle of length one and no vertex
  sequence can order it away. (Phase 2 removes self-loops before this point, so in practice this
  branch protects other callers.)
- **A pair of anti-parallel arcs contributes exactly one feedback arc.** Each arc is judged on its
  own direction against the sequence, and only one of the two can point backwards.

---

## Step 3 — Reverse, do not drop

This is the single most important contract in the phase, and the clearest illustration of what v2
changed.

### What v1 did

`build_layer_graph` inserted an edge into the layer graph only if its role was `Forward`:

```rust
let is_forward = match edge_role_map {
    Some(map) => map.get(&edge.id) == Some(&EdgeRole::Forward),
    ...
};
if !is_forward { continue; }
```

Feedback edges were classified correctly and then **excluded from the layered graph entirely**. They
got no dummy chain. They contributed nothing to `successors_map` or `predecessors_map`. The
barycenter sweeps never saw them. And `count_total_graph_crossings` never counted them.

### The measured consequence

From [00-diagnosis §3b](../planning/layout-engine-v2/00-diagnosis.md):

| dataset                       | forward | feedback | adjacency entries in layer graph | crossings the ordering stage saw |
| ----------------------------- | ------: | -------: | -------------------------------: | -------------------------------: |
| `ai_agent_trace`              |       4 |        2 |                                4 |                                0 |
| `clean_ring_10n_10e`          |       9 |        1 |                                9 |                                0 |
| `crossing_mesh_10n_10e`       |       5 |        5 |                                5 |                            **0** |
| `cyclic_mesh`                 |       4 |        2 |                                4 |                                0 |
| `dense_kubernetes_mesh`       |      30 |       13 |                               30 |                            **0** |
| `distributed_saga_workflow`   |       9 |        2 |                               12 |                                0 |
| `kubernetes_cluster_topology` |      11 |        2 |                               13 |                                0 |

Zero. On every dataset. And `minimize_crossings` opened with:

```rust
if best_crossings == 0 || has_custom_orders { return ...; }
```

**The crossing minimisation stage returned immediately, every time, on every input.** The most
important combinatorial stage in a Sugiyama pipeline had never executed on real data. On the dense
mesh, the separate parallel optimiser — which counted differently — saw 433 crossings in the same
drawing the ordering stage scored at 0.

Then the router, which _did_ have to draw those edges, had to invent a path for each one through a
layout that had never accounted for it. A* on a 5,000-vertex grid, rip-up, reroute, permutation
search — an enormous amount of machinery spent solving a problem created three phases earlier by an
omission.

### What v2 does

`roles`, `reversed` and `ir.edges` are index-aligned and the same length. **No edge is ever
dropped.** A cycle-closing edge gets `reversed[e] = true`, and every later phase reads its endpoints
through one accessor:

```rust
pub fn arc(&self, ir: &GraphIr, e: u32) -> (u32, u32) {
    let edge = &ir.edges[e as usize];
    if self.reversed[e as usize] { (edge.target, edge.source) }
    else                         { (edge.source, edge.target) }
}
```

That is the whole mechanism. The IR itself is never mutated, so the original direction is still
there when it is needed. Everything in between sees a DAG:

```text
input                       what phases 3–8 see           what is drawn
─────────────                ───────────────────           ─────────────
 a ──► b                      a ──► b   rank 0 → 1          a ──► b
 b ──► c                      b ──► c   rank 1 → 2          b ──► c
 c ──► a   (closes)           a ──► c   reversed=true       c ──► a
                              ↑ ranked, layered, ordered,   ↑ same polyline,
                                dummy-chained, lane-        points reversed,
                                assigned, crossing-counted  ports swapped
```

A reversed edge:

- takes part in **ranking**, so it constrains where its endpoints land;
- takes part in **layering**, so it gets dummy items on every intermediate rank;
- takes part in **ordering**, so its crossings are counted and minimised like anyone else's;
- takes part in **routing demand**, so lanes are reserved for its segments.

Only at emit time does anything learn the truth. In
[`6_3_emit.rs`](../../crates/gvui/src/6_validation/6_3_emit.rs), for each chain with
`reversed == true`, the finished route's point list is reversed and its source and target ports are
swapped — so the arrowhead renders at the node the author actually pointed at. Nine phases of work
happen on the flipped orientation, and the flip back is four lines.

This is what "constraints flow forward" means concretely: the drawing is _complete_ at every stage,
so no stage has to guess about work another stage skipped.

### Nothing here is `Cross`

`EdgeRole` has a `Cross` variant, meaning "both endpoints on the same rank". Phase 2 never assigns
it, and the accompanying test asserts that.

The reason: whether two nodes end up on the same rank is a **ranking outcome**, and ranking has not
run yet. Pre-classifying an edge as `Cross` takes it out of ranking — which is exactly how v1's
dense meshes flattened. Same-rank edges are discovered later, in
[Chapter 6](./06-layering-and-labels.md), and recorded as `FlatEdge` entries with their own
handling.

A caller can send `layoutRole: "cross"` as a hint. It is accepted and treated as `Forward`, for the
same reason: honouring it literally would remove the edge from the process that decides whether it
is a cross edge at all.

### Self-loops

An edge whose source equals its target gets `EdgeRole::SelfLoop`, `reversed = false`, and a slot in
`self_loops`. It takes no part in ranking, layering or ordering — there is nothing for it to
constrain — and is routed directly in Phase 8 as a fixed port pair on one side of its node.

Critically, it does not make the graph _look_ cyclic. It is a genuine cycle, but reversing it
achieves nothing, so it is excluded from the arc set the DAG check runs on. Excluding it is what
lets the check be a real assertion instead of a permanent false alarm.

---

## The `isCycle` hint is a bias, not a mandate

An edge can arrive with `isCycle: true`, meaning "in my mental model, this is the edge that closes
the loop". Ingest folds that into `IrEdge.hint = Feedback`, unless an explicit `layoutRole`
overrides it — with the subtlety that `layoutRole: "auto"` means _no opinion_ and must not shadow
`isCycle`.

The question is what Phase 2 should do with that hint. This is where v2 shipped a real bug, and the
lesson is worth more than the fix.

### The wrong answer, and what it cost

The original design spec said: a feedback hint **pins** the edge — reverse it, and exclude it from
SCC and FAS analysis, so the heuristic cannot overrule an explicit instruction from the caller.

That sounds respectful of the caller. It is unsound.

Recall why Eades is safe: it derives its arc set from a **total vertex sequence covering every arc
it was shown**, and reversing exactly the backward arcs makes every arc agree with that sequence. If
an arc is hidden from it, the sequence says nothing about that arc — and reversing a hidden arc can
create a brand-new cycle that the heuristic had no opportunity to fix. Then, because the arc is
pinned, no repair is permitted either. The graph stays cyclic, and Phase 2 reports success.

`isCycle` is a _human_ claim about a mental model. It is not a proof about the arc set, and it is
frequently wrong at the level of precision an algorithm needs — an author marks the edge that feels
like the back edge, not the one whose reversal happens to leave a DAG.

Six of the eight datasets carry `isCycle` flags; the dense mesh carries 12 of them across 45 edges.
The measured result:

- `is_dag = false` — Phase 2's own verifier said so, and nothing stopped the pipeline;
- longest-path ranking then relaxed along a live cycle, terminating only on its iteration cap;
- **249 ranks for a 30-node graph**, 559 layered items;
- an out-of-bounds panic three phases later, inside the accumulator tree.

(The note left in the source records 129 ranks for the same dataset — the exact figure depends on
which build was measured. Either number is nonsense for 30 nodes.)

### The right answer

Hints choose the **starting orientation**. Nothing else.

```rust
if edge.hint == Some(EdgeLayoutHint::Feedback) {
    reversed[e] = true;
}
```

Then **every** non-self edge — hinted or not — enters the SCC decomposition and the FAS pass **in
its current orientation**. The FAS result is applied by _toggling_:

```rust
for e in eades_feedback_arc_set(comp, &per_comp[ci]) {
    reversed[idx] = !reversed[idx];   // toggle, not set
}
```

Toggling rather than setting is the other half of the fix. The arc list handed to Eades is already
in its current orientation, so if Eades wants a hinted edge pointing the _other_ way, toggling flips
it back. Setting `reversed = true` unconditionally would refuse to undo a hint, which reintroduces
exactly the pin that caused the problem.

The outcome: the hint biases the answer — and usually survives, because a genuinely cycle-closing
edge is exactly the kind of arc Eades also wants to reverse — while acyclicity is guaranteed by the
algorithm rather than assumed.

One more consequence follows. `EdgeRole` is derived from the **final** `reversed` flag, not from the
hint:

```rust
roles[e] = if reversed[e] { EdgeRole::Feedback } else { EdgeRole::Forward };
```

So the role can never claim an edge is feedback while the pipeline is treating it as forward. Phase
8 keys its loop-around routing off the role; a mismatch would draw the wrong shape.

### Why this is a lesson and not a footnote

This bug passed 393 unit tests. Every module implemented its written contract faithfully; **the
contract was wrong**, and every unit test was written against the same wrong contract. It surfaced
within minutes of running real datasets through the whole pipeline with invariant assertions
enabled.

The generalisable form: _when an algorithm's guarantee depends on the completeness of its input,
letting a caller withhold input silently destroys the guarantee._ Eades does not promise "reversing
these arcs helps". It promises "reversing these arcs yields a DAG, because they are precisely the
arcs that disagree with a sequence covering all of them". Take away the coverage and there is no
promise left — only a heuristic that happens to work most of the time, which is the worst kind of
dependency to have in a phase with no retry loop.

---

## Step 4 — Verify, and repair directly

The contract Phase 2 owes everything downstream is one sentence: _after reversal, the non-self arc
set is a DAG._ Ranking, layering and ordering all assume it, and none of them can detect or repair a
violation — it shows up as an unbounded rank chain or a silently truncated layering, three phases
away from the cause.

So Phase 2 checks its own work, using
[`1_5_kahn_dag_verifier.rs`](../../crates/gvui/src/1_cycle_breaking/1_5_kahn_dag_verifier.rs).

**Kahn's algorithm**, taught in one paragraph: compute every node's in-degree; repeatedly take a
node with in-degree 0, emit it, and decrement the in-degree of everything it points at. If you emit
all $n$ nodes, the arcs form a DAG and the emission order is a topological order. If you run out of
in-degree-0 nodes early, whatever is left is on a cycle. The implementation pops from a **min-heap
over node indices**, so ties break by ascending index and the order is a function of the arc set
alone.

If the check fails, the repair is _direct_, not a retry:

```text
loop at most (node_count + 1) times:
    if is_dag(arcs) → done
    back = find_residual_back_edges(arcs)     # DFS, WHITE/GREY/BLACK
    toggle reversed[back.first()]             # lowest index, deterministic
    recompute the role from the new flag
```

`find_residual_back_edges` is a three-colour DFS: WHITE = unvisited, GREY = on the current DFS path,
BLACK = finished. An arc into a GREY node closes a cycle, so its edge index is recorded. As with
Tarjan, the DFS carries its own frame stack rather than recursing, for the same wasm-stack reason.

Two things to be precise about:

- **This is verification with repair, not a second attempt at the heuristic.** It does not re-run
  Eades and hope for a different answer. It names the exact arcs that still close a cycle and flips
  one, then re-checks. Because it reverses one arc per iteration and the back-edge set is only
  guaranteed to be a valid set _as a whole_, it must re-scan after each flip — hence the loop.
- **It toggles.** Same reason as before: the arc that has to move may be one this pass already
  flipped, and refusing to flip it back is precisely what left `is_dag = false` in the failure
  above.

With step 3 done correctly, acyclicity is already guaranteed before this point, so reaching the
repair branch means a bug upstream rather than an awkward input. The safety net stays because the
downstream phases cannot survive a violation, and a check that never fires costs one $O(V+E)$ pass.

### A note on `is_dag`

`StructureResult.is_dag` is set to `true` when the verification loop succeeds. No phase in the
current pipeline branches on it — ranking assumes the DAG. That is safe only because the loop above
cannot exit with a live cycle except through its own bail-out, and it is worth knowing that the flag
is presently a _report_, not a guard.

---

## What Phase 2 hands on

```rust
pub struct StructureResult {
    pub roles:     Vec<EdgeRole>,  // indexed by edge, same length as ir.edges
    pub reversed:  Vec<bool>,      // indexed by edge
    pub self_loops: Vec<u32>,      // excluded from ranking/layering/ordering
    pub is_dag:    bool,
}
```

Guarantees, in the order later phases depend on them:

1. `roles`, `reversed` and `ir.edges` are index-aligned and equal in length — **no edge is dropped**,
   so `arc(ir, e)` is valid for every `e`.
2. Every self-loop is in `self_loops`, with role `SelfLoop` and `reversed = false`.
3. No edge is labelled `Cross`; that determination belongs to Phase 4.
4. The arc set $\{\,\text{arc}(e) \mid \text{role}(e) \ne \text{SelfLoop}\,\}$ has no directed cycle.

### Cost

| step                                   | algorithm                         | cost                   |
| -------------------------------------- | --------------------------------- | ---------------------- |
| SCC decomposition                      | Tarjan, explicit stack            | $O(V + E)$             |
| Feedback arc set, per cyclic component | Eades–Lin–Smyth, bucketed         | $O(V + E)$             |
| Verification                           | Kahn, min-heap ties               | $O(V + E \log V)$      |
| Repair (should never fire)             | DFS back edges, ≤ 1 per iteration | $O(V(V+E))$ worst case |

In the measured runs the whole phase is a rounding error next to ordering. It is not fast because it
was optimised; it is fast because nothing in it searches.

← [Ingest and Measurement](./03-ingest-and-measurement.md) | [Index](./README.md) | [Next: Rank Assignment →](./05-rank-assignment.md)
