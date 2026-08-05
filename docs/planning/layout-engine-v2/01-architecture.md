# 01 — Architecture

The three principles, the phase pipeline, and the data model.

---

## 1. Three principles

### P1 — Constraints flow forward. Nothing is retried.

Every stage produces a result that is **correct by construction** with respect to constraints the
downstream stages cannot repair. No stage may rely on "the outer loop will call me again."

The current engine violates this in two places, and both are the source of its cost:

- It routes edges, _then_ discovers a badge does not fit, _then_ widens a gap, _then_ re-runs
  everything. (Designed but unreachable — defect #7.)
- It routes edges, _then_ counts geometric crossings, _then_ flips port sides to try to repair them,
  _then_ re-routes.

Both are inverted. A badge's space must be reserved **before** any route exists. Crossings must be
resolved at the combinatorial level **before** any geometry exists.

The mechanism for the first is the **label node**: every edge label becomes a real node in the
layered graph, carrying its measured width and height. The ordering stage orders it; the coordinate
stage separates it from its neighbours by `nodeGap`; the rank-height stage makes the rank tall
enough for it. _The space is allocated by construction, so it cannot fail to fit, so there is
nothing to retry._ (This is `dot`'s approach — `minlen` is doubled and labels occupy the odd ranks.)

The mechanism for the second is **lane demand pre-computation**: once ordering is fixed, the set of
edges traversing each inter-rank channel and each intra-rank corridor is pure combinatorics on the
layered structure. Compute lane counts by interval-graph colouring, then feed them into node
separations _before_ coordinate assignment runs. One pass, exact.

### P2 — Discrete before continuous.

Every decision that can be made on integers is made on integers: which rank, which order within a
rank, which side of a node, which port index on that side, which lane in a channel. Geometry is a
final, deterministic evaluation of those integers.

Nothing searches in continuous space. There is no grid, no A\*, no pathfinding.

### P3 — Search only where greedy is provably insufficient.

Exactly one stage searches: **layer ordering**, because two-layer crossing minimization is NP-hard
and greedy is genuinely not enough. Its search is a bounded local one (median sweeps + transpose)
over a counting function that is O(E log V), so hundreds of evaluations cost under a millisecond.

Everywhere else, use an algorithm with a guarantee:

| Problem            | Algorithm                            | Guarantee                                        |
| ------------------ | ------------------------------------ | ------------------------------------------------ |
| Feedback arc set   | Eades–Lin–Smyth greedy               | \|FAS\| ≤ m/2 − n/6, linear time                 |
| Ranking            | Network simplex (Gansner et al.)     | **optimal** for Σ ω·(rank(v)−rank(u))            |
| Two-layer ordering | Median + transpose                   | median is ≤ 3× optimal for the two-layer problem |
| Crossing counting  | Barth–Mutzel–Jünger accumulator tree | exact, O(E log V)                                |
| Lane assignment    | Greedy interval-graph colouring      | **optimal** (interval graphs are perfect)        |
| X coordinates      | Brandes–Köpf                         | ≤ 2 bends/edge, dummy chains straight, O(V+E)    |

---

## 2. The pipeline

```
┌── Phase 0 ── Ingest ─────────────────────────────────────────────────────────┐
│  JSON → GraphIR: interned ids, CSR adjacency, parallel-edge bundles          │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 1 ── Measure ────────────────────────────────────────────────────────┐
│  MeasurementProvider → node boxes, label boxes.                               │
│  ★ Nothing after this point ever sees text.                                   │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 2 ── Structure ──────────────────────────────────────────────────────┐
│  WCC split · Tarjan SCC · Eades FAS · edges REVERSED (not dropped)            │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 3 ── Rank ───────────────────────────────────────────────────────────┐
│  Network simplex with weights + per-edge minlen · aspect-ratio balancing      │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 4 ── Layer ──────────────────────────────────────────────────────────┐
│  Dummy chains for ALL long edges · ★ LABEL NODES carrying badge boxes         │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 5 ── Order ──────────────────────────────────────────────────────────┐
│  ★ the only search: k seeds × (median sweep + transpose), BMJ counting        │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 6 ── Demand ─────────────────────────────────────────────────────────┐
│  ★ the one and only feedback edge, resolved exactly:                          │
│  channel/corridor occupancy → interval colouring → lane counts → separations  │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 7 ── Coordinates ────────────────────────────────────────────────────┐
│  Rank bands (Y) · Brandes–Köpf (X) with the separations from Phase 6          │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 8 ── Route & Attach ─────────────────────────────────────────────────┐
│  Port sides (determined) · port order (sort, no search) · lane → polyline     │
│  · bundling · corner rounding                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 9 ── Emit ───────────────────────────────────────────────────────────┐
│  Component packing · translate to padding · typed-array payload · metrics     │
└──────────────────────────────────────────────────────────────────────────────┘
```

There is **no loop around this diagram.** Phase 6 is the only place where a downstream requirement
(routing space) influences an upstream decision (node separation), and it is resolved by
_computing the requirement ahead of time_, not by iterating.

## 3. Why this ordering is forced

The dependency structure is what makes the design non-negotiable, not taste:

- Label sizes must exist before ranking, because a labelled edge needs `minlen = 2`. → **Measure before Rank.**
- Label nodes must exist before ordering, because their position among siblings is an ordering
  decision. → **Layer before Order.**
- Lane demand depends only on ordering, not on coordinates. → **Order before Demand.**
- Node separation depends on lane demand. → **Demand before Coordinates.**
- A route's polyline is determined by (ordering, coordinates, lane index), all of which are already
  fixed. → **Coordinates before Route**, and routing is evaluation, not search.
- Badge geometry is its label node's box, already positioned. → **Labels need no phase of their own.**

Reversing any of these edges is what forces a retry loop. The current engine reverses three of them.

---

## 4. Data model

### 4.1 Interning and CSR

All string ids are interned exactly once in Phase 0:

```rust
struct Interner { names: Vec<Box<str>>, index: HashMap<Box<str>, u32> }
struct NodeIdx(u32);
struct EdgeIdx(u32);
```

Adjacency is compressed sparse row, not `HashMap<String, Vec<String>>`:

```rust
struct Csr { offsets: Vec<u32>, targets: Vec<u32>, edge_ids: Vec<EdgeIdx> }
// neighbours of n:  targets[offsets[n] .. offsets[n+1]]
```

This is not micro-optimization. Every hot loop in the current engine is dominated by string hashing
and cloning (defects #22, #23, #27); switching to dense indices removes an entire class of cost and
makes the remaining costs legible.

### 4.2 The layered graph

A single flat arena. Real nodes, dummy nodes and label nodes are the same type, distinguished by a
tag. This is what makes the label-node trick work: **every stage downstream treats a label
identically to a node**, so no stage needs special-case logic for labels.

```rust
enum ItemKind {
    Real   { node: NodeIdx },
    Dummy  { edge: EdgeIdx, seq: u16 },   // bend point of a long edge
    Label  { edge: EdgeIdx },             // ★ carries the badge box
}

struct Item {
    kind:   ItemKind,
    rank:   u16,
    order:  u16,          // position within rank; the ordering stage's only output
    w:  f32, h: f32,      // Real → node box · Label → badge box · Dummy → (0, 0)
    x:  f32, y: f32,      // filled by Phase 7
}

struct Layered {
    items:  Vec<Item>,
    ranks:  Vec<Range<u32>>,   // items are stored rank-major, so a rank is a slice
    up:     Csr,               // predecessors, rank r-1 only
    down:   Csr,               // successors,   rank r+1 only
}
```

Storing items rank-major means a rank is a contiguous slice and `order` is just an index — the
ordering stage permutes a slice in place instead of rebuilding `Vec<Vec<String>>` per candidate.

### 4.3 Edge model after Phase 4

```rust
struct EdgeChain {
    edge:     EdgeIdx,
    reversed: bool,        // was a feedback edge; flip arrowhead at render time
    bundle:   Option<BundleIdx>,
    items:    Vec<u32>,    // [src_real, dummy…, label, dummy…, tgt_real]
    label_at: Option<u32>, // index into `items`
}
```

`reversed` is carried, not acted on, until Phase 9. The whole pipeline sees a DAG; only the
arrowhead knows the truth. This is the fix for defect #3 — feedback edges participate fully in
ranking, ordering and crossing counting instead of vanishing.

### 4.4 Routing topology (Phase 6 output)

```rust
struct Channel {            // horizontal band between rank r and r+1
    rank: u16,
    lanes: u16,             // = max clique of the interval graph
    lane_of: Vec<u16>,      // per segment
}
struct Corridor {           // vertical band between order i and i+1 within rank r
    rank: u16, after_order: u16,
    lanes: u16,
    lane_of: Vec<u16>,
}
```

`Channel::lanes × laneSpacing` becomes a minimum for `rankGap(r)`.
`Corridor::lanes × laneSpacing` becomes a minimum for the separation between the two nodes.
Both are known **before** Phase 7 runs. That is the whole trick.

---

## 5. What this deletes

| Deleted                                                                  | Replaced by                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `search_best_layout_state`, `LayoutSearchState`, `StateEvaluationResult` | nothing — the outer search is gone                         |
| `3_4_trial_state_generator.rs` (1,111 lines)                             | nothing                                                    |
| `5_1_routing_grid.rs`, `5_3_bounded_astar.rs`, `5_2_route_occupancy.rs`  | Phase 6 lane assignment (~200 lines)                       |
| Rip-up / reroute / order variants / conflict permutations                | nothing                                                    |
| `LayoutScore` 21-field lexicographic comparator                          | constraints (asserted) + metrics (reported)                |
| `ExactSpacingDemand`, `BadgeSpacingRequest`, `SpacingOverrides`          | label nodes + lane demand                                  |
| ~15 search-budget config knobs                                           | see [04-config-and-quality.md](./04-config-and-quality.md) |

Net effect: the engine gets substantially _smaller_ as well as ~1000× faster.

## 6. What survives unchanged

- The `N_phase/` source layout and the numbered-file convention.
- The Rust ⇄ WASM boundary and the worker client protocol (`customLayoutWorkerClient.ts`).
- The JSON input contract (`GraphDataset`) — additive changes only, see
  [02-algorithms.md § Phase 0](./02-algorithms.md#phase-0--ingest).
- The developer settings panel, the layout cache, and the SQLite persistence layer.
- `1_2_tarjan_scc.rs`, `1_3_eades_fas.rs`, `2_2_network_simplex.rs` — good implementations that are
  currently either fed bad input or never called.

## 7. Performance model

Complexity per phase, and the target for a 200-node / 400-edge graph — roughly 7× larger than the
dataset that currently takes 47 seconds.

| Phase                                       | Complexity              |         Target |
| ------------------------------------------- | ----------------------- | -------------: |
| 0 Ingest                                    | O(V+E)                  |         0.5 ms |
| 1 Measure (canvas, warm cache)              | O(V+E) text ops         |         1–3 ms |
| 2 Structure (SCC + FAS)                     | O(V+E)                  |         0.5 ms |
| 3 Rank (network simplex)                    | near-linear in practice |         1–3 ms |
| 4 Layer                                     | O(V + Σ span)           |           1 ms |
| 5 Order (4 seeds × 16 sweeps, BMJ counting) | O(k · s · E log V)      |         3–8 ms |
| 6 Demand (interval colouring)               | O(E log E)              |           1 ms |
| 7 Coordinates (Brandes–Köpf, 4 passes)      | O(V+E)                  |           1 ms |
| 8 Route materialization                     | O(E · bends)            |           1 ms |
| 9 Emit (typed arrays)                       | O(V+E)                  |         1–2 ms |
| **Total**                                   |                         | **≈ 15–25 ms** |

Two structural notes:

- **The cost is now dominated by measurement and serialization**, not by layout. That is the correct
  shape for this problem, and both are cacheable across re-layouts of the same dataset.
- **Nothing is superlinear in a way that bites.** The only O(E log V) term is inside a loop bounded
  by a constant (sweeps × seeds). A 2,000-node graph should land around 150–250 ms, which is still
  interactive and is 200× more nodes than the engine currently handles in 47 seconds.

### Where parallelism actually belongs

Not in `optimize_layer_orders_parallel` (measured 0.19–10 ms — irrelevant). The one place with a
real parallel structure is **Phase 5's k independent ordering seeds**: 4 completely independent runs
whose results are compared at the end. Even that is only worth wiring up if wasm threading is
enabled (COOP/COEP headers + `wasm-bindgen-rayon`), and it buys at most ~5 ms.

**Recommendation: ship v2 single-threaded.** Revisit threading only if profiling on real 2,000-node
graphs shows Phase 5 dominating. The Rust port's value here is predictable performance and cheap
data structures, not thread-level parallelism.
