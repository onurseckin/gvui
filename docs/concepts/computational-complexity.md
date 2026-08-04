← [Quality model](./quality-model.md) | [Concepts index](./README.md) | [Docs index](../README.md)

# Computational Complexity

Graph layout is a place where an innocent-looking design decision can cost four orders of magnitude.
This document gives the per-phase and per-mode cost of the current engine, the measured figures that
back it, and — because the contrast is the most instructive thing here — what the previous engine
spent its time on instead.

**All measurements below are native `--release` from the audit harness:**

```sh
cargo run --release --manifest-path crates/gvui/Cargo.toml --example audit
```

The harness runs 5 engines × 8 datasets from `public/data/graphs/`, times the whole `compute_layout`
call, and fails if any combination exceeds a 50 ms budget. Native release is the *optimistic* bound;
WASM in a browser will be slower and **has not been measured** — a recorded open gap.

Notation: $V$ nodes, $E$ edges, $R$ ranks. $S$ is the number of segments in a route.

---

## The layered pipeline, phase by phase

| Phase | What it does | Complexity | Source |
| --- | --- | --- | --- |
| 0 Ingest | intern ids, build CSR adjacency, bundle parallel edges, find components | $O(V + E\,\alpha(V))$ | [`0_5_ingest.rs`](../../crates/gvui/src/0_common/0_5_ingest.rs) |
| 1 Measure | text → boxes, on the host | $O(\text{total characters})$ cold, $O(V + E)$ lookups warm | [`measurement/`](../../src/engine/layout/measurement/) |
| 2 Structure | Tarjan SCC, Eades FAS per component, Kahn verification | $O(V + E)$ | [`1_6_structure.rs`](../../crates/gvui/src/1_cycle_breaking/1_6_structure.rs) |
| 3 Rank | network simplex over $\sum \omega \cdot \text{span}$, then balancing | $O(V+E)$ per pivot; near-linear in practice | [`2_4_rank_facade.rs`](../../crates/gvui/src/2_rank_assignment/2_4_rank_facade.rs) |
| 4 Layer | one item per node, a dummy per intermediate rank, a label item per labelled edge | $O(V + \sum \text{span})$ | [`3_1_layer_builder.rs`](../../crates/gvui/src/3_crossing_minimization/3_1_layer_builder.rs) |
| 5 Order | $k$ seeds × $s$ median/transpose rounds, BMJ counting | $O(k \cdot s \cdot E \log V)$ | [`3_4_order_facade.rs`](../../crates/gvui/src/3_crossing_minimization/3_4_order_facade.rs) |
| 6 Demand | interval-graph colouring per channel and corridor | $O(E \log E)$ | [`4_1_lane_demand.rs`](../../crates/gvui/src/4_coordinate_assignment/4_1_lane_demand.rs) |
| 7 Coordinates | rank bands, then Brandes–Köpf (4 passes) | $O(V + E)$ | [`4_4_coordinate_facade.rs`](../../crates/gvui/src/4_coordinate_assignment/4_4_coordinate_facade.rs) |
| 8 Route | ports, then one polyline per chain by table lookup | $O(E \cdot S + \sum_v \deg(v) \log \deg(v))$ | [`5_6_route_facade.rs`](../../crates/gvui/src/5_edge_routing/5_6_route_facade.rs) |
| 9 Emit | packing, deterministic sorts, constraint checks, metrics | $O((V+E)\log(V+E))$ + linear-in-practice scans | [`6_3_emit.rs`](../../crates/gvui/src/6_validation/6_3_emit.rs) |

Nothing in that table is superlinear in a way that bites. The details worth spelling out:

### Phase 3 — network simplex

Simplex has no polynomial bound in general, but the Gansner et al. formulation for ranking is
well-behaved and near-linear in practice on graphs of this shape. The implementation detail that
keeps a pivot affordable: cut values for **all** tree arcs are computed in one $O(V+E)$ postorder
pass, rather than by re-splitting the tree once per arc. If simplex reports infeasibility it falls
back silently to longest-path ranking, which is unconditional $O(V+E)$.

### Phase 5 — the only search

$k = $ `ordering_seeds` (default 4), $s = $ `ordering_sweeps` (default 16), and a seed stops after 4
consecutive non-improving rounds. Both are constants, so the term is $O(E \log V)$ inside a bounded
loop — the whole phase is $O(E \log V)$ up to a constant of at most 64.

The $\log V$ comes from the Barth–Mutzel–Jünger accumulator tree, which counts crossings between two
adjacent ranks **exactly** in $O(E \log V)$. The naive count is $O(E^2)$; v1 used that, *and* cloned
a `Vec<String>` per layer per call.

`time_budget_ms` (default 250) is a soft cap that stops Phase 5 starting new sweeps. It is the only
wall-clock input to any decision in the engine.

### Phase 6 — where the pathfinding used to be

The segments crossing one inter-rank channel form an interval graph over the order axis. Interval
graphs are perfect, so greedy colouring by ascending left endpoint uses exactly $\omega$ colours,
$\omega$ being the maximum overlap depth. Implemented with a min-heap of lane end positions, giving
$O(m \log m)$ for $m$ segments in the channel; summed over channels, $O(E \log E)$.

For intra-rank corridors it is even simpler: every flat edge in one corridor overlaps every other
one, so the lane count is just the segment count.

This is the entire replacement for v1's routing grid, A\*, occupancy ledger and rip-up loop.

### Phase 9 — the checks that can now stay on

Every pairwise geometric question goes through a uniform `SpatialHash` with cells sized like the
objects being indexed, which keeps the expected candidate count per query $O(1)$. Geometric crossing
detection is a sweep in $O(n \log n + p)$, where $p$ is the number of x-overlapping segment pairs
rather than the $O(n^2)$ of an all-pairs scan.

The comparison is stark: v1's validator had no spatial index anywhere — $O(N^2)$ node–node,
$O(E \cdot S \cdot N)$ edge–node, $O(E^2 S^2)$ shared-segment — and allocated a `format!` string for
every violation *even when called as a scoring probe inside the router's inner loop*, which is why it
could not be run outside a debug build. v2's checks run on every layout by default.

---

## Measured: the layered engine

Same machine, same eight datasets, native `--release`:

| dataset | N | E | v1 ms | v2 ms | speedup | v1 crossings | v2 crossings | v1 valid | v2 valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--: | :--: |
| `decision_tree` | 5 | 4 | 66.6 | **0.04** | 1,665× | 0 | 0 | ✓ | ✓ |
| `cyclic_mesh` | 5 | 6 | 154.6 | **0.08** | 1,933× | 0 | 0 | ✓ | ✓ |
| `ai_agent_trace` | 6 | 6 | 13.1 | **0.36** | 36× | 0 | 0 | ✓ | ✓ |
| `clean_ring_10n_10e` | 10 | 10 | 192.3 | **0.11** | 1,748× | 0 | 0 | ✓ | ✓ |
| `crossing_mesh_10n_10e` | 10 | 10 | 1,571.1 | **0.35** | 4,489× | 3 | 6 | ✓ | ✓ |
| `distributed_saga_workflow` | 10 | 11 | 1,788.7 | **0.11** | 16,261× | 0 | 0 | ✓ | ✓ |
| `kubernetes_cluster_topology` | 12 | 13 | 26,710.0 | **0.14** | **190,785×** | 2 | 0 | ✓ | ✓ |
| `dense_kubernetes_mesh` | 30 | 45 | 47,335.8 | **1.79** | **26,445×** | 191 | **28** | ✗ | ✓ |

Slowest fixture across **all five engines** and all eight datasets: **1.88 ms**, against the
harness's 50 ms budget.

Two honest readings of this table:

- **The v1 timings are not monotone in graph size.** `clean_ring_10n_10e` (10 nodes) took 192 ms;
  `kubernetes_cluster_topology` (12 nodes) took 26,710 ms. That is not a scaling curve — it is a
  search whose cost depends on how many times its inner loops happened to fire. Predictability was
  as much of the problem as the absolute number.
- **`crossing_mesh_10n_10e` reports more crossings under v2** (6 vs 3), the only fixture that does.
  It is not a regression in the drawing: v1 produced 3 *geometric* crossings by routing through a
  2-rank layout in which half the edges are feedback edges, and spent 1.5 seconds of A\* doing it.
  v2 reports 6 crossings genuinely present in a graph whose forward DAG is only 2 ranks deep. That
  dataset is an organic-mode candidate, not a layered one.

---

## The five engines

| mode | dominant cost | complexity | notes |
| --- | --- | --- | --- |
| layered / left-right | Phase 5 ordering | $O(k \cdot s \cdot E \log V)$ | $k, s$ constant → effectively $O(E \log V)$ |
| organic | stress SGD | $O(\text{epochs} \cdot \lvert P \rvert)$ | $\lvert P \rvert = V(V-1)/2$ below 400 nodes, $\approx V \cdot 100$ above |
| radial | BFS + wedge allocation | $O(V + E)$ | plus overlap removal |
| grid | placement | $O(V + E)$ | consults no topology at all |

### Organic

The pair set is built by all-pairs BFS while $V \le 400$ (`PIVOT_THRESHOLD`), which is
$O(V(V+E))$ time and $V(V-1)/2$ pairs. Above that it switches to **sparse stress**: roughly 100
pivots (`PIVOT_TARGET`) chosen by arithmetic stride, giving $O(V \cdot P)$ pairs instead of
$O(V^2)$. The cut-off is about memory and pair count, not time — at 400 nodes the full set is
already ~80,000 pairs per epoch.

SGD then runs `stress_iterations` (default 30) epochs over the shuffled pair set. Overlap removal is
`overlap_removal_passes` (default 6) cheap symmetric relaxation passes through a spatial hash,
followed by **one exact scan-line pass** that closes whatever is left. The split matters: relaxation
alone would need $O(V)$ passes, i.e. $O(V^2)$ work, to drive overlaps to zero; the scan-line pass
alone would produce a drawing skewed to one side, because it resolves everything by moving boxes in
one direction.

Notably, organic does **not** consult `time_budget_ms`: its cost is a deterministic function of node
count and epoch count, and clipping on wall-clock time would make the drawing depend on machine load.

### Radial

BFS from the root to get ring depth, a leaf-count pass to size wedges proportionally, then ring radii
derived from the boxes actually on rings $k-1$ and $k$. All linear. Followed by overlap removal and
the shared routing/badge/emit path.

### Grid

`cols = ceil(sqrt(n * target_aspect_ratio))`, then row-major placement in input order. Cell sizes are
the widest box in the column and the tallest in the row, so no two boxes can overlap for any input.
This is the cheapest correctness oracle in the engine.

### Measured, all five

Two fixtures at opposite ends of the range:

```text
dataset                        engine         N    E        ms  ranks  cross    geo  bends  ldr valid  det
ai_agent_trace                 layered        6    6      0.36      8      0      0     20    0   yes  yes
ai_agent_trace                 left-right     6    6      0.09      8      0      0     20    0   yes  yes
ai_agent_trace                 organic        6    6      0.07      0      0      0      0    2   yes  yes
ai_agent_trace                 radial         6    6      0.03      0      0      0      1    0   yes  yes
ai_agent_trace                 grid           6    6      0.03      0      0      0      0    1   yes  yes
dense_kubernetes_mesh          layered       30   45      1.79     15     28     44    234    0   yes  yes
dense_kubernetes_mesh          left-right    30   45      1.82     15     27     57    234    0   yes  yes
dense_kubernetes_mesh          organic       30   45      0.43      0      8      8      0   18   yes  yes
dense_kubernetes_mesh          radial        30   45      0.30      0     32     32     14    0   yes  yes
dense_kubernetes_mesh          grid          30   45      0.27      0     99     99      0   23   yes  yes
```

Reading notes:

- The layered pipeline costs roughly 4–6× the geometric engines on the dense mesh, which is what you
  are paying for orthogonal routing, straight dummy chains and reserved badge space.
- `layered` and `left-right` are the *same code* on the same input — the LR variant just transposes
  every box on the way in and the result on the way out — yet report 0.36 ms and 0.09 ms on the
  6-node fixture. At a tenth of a millisecond that gap is measurement noise and first-call warm-up,
  not an algorithmic difference. Treat sub-0.1 ms figures as "too small to measure".
- On the dense mesh, **organic produces 8 crossings against layered's 28**. That dataset has 13
  feedback edges out of 45; it has no strong flow direction, and forcing it into ranks costs
  crossings. This is the argument for having a real stress engine rather than only a hierarchical
  one.

---

## What v1 spent its time on

The contrast is the lesson, so here is where 26.7 seconds went. Phase-level instrumentation of a
**single** v1 pipeline pass:

```text
distributed_saga_workflow (10n 11e)
  cycle=0.43  rank+layergraph=0.03  crossmin=0.01  layer-opt=0.26  coord=0.19
  ROUTE=76.2ms    BADGE=3.9ms   VALIDATE=0.1ms
  grid: 4,372 vertices / 8,405 grid-edges

kubernetes_cluster_topology (12n 13e)
  cycle=0.18  rank+layergraph=0.03  crossmin=0.02  layer-opt=0.19  coord=0.16
  ROUTE=4979.2ms  BADGE=6.0ms   VALIDATE=0.1ms
  grid: 5,328 vertices / 10,294 grid-edges

dense_kubernetes_mesh (30n 45e)
  cycle=1.06  rank+layergraph=0.05  crossmin=0.01  layer-opt=10.24  coord=0.31
  ROUTE=19605.4ms BADGE=95.3ms  VALIDATE=0.4ms
  grid: 5,638 vertices / 10,708 grid-edges
```

**Routing was 99.5 %+ of the cost. Everything else was noise.** And that is *one* pass; the outer
search ran 4–8 of them.

Three multiplied factors produced that number.

### (a) The routing grid

The grid was the dense Cartesian product of every $x$ and every $y$ coordinate derived from ports,
obstacle bounds, and concentric `lane_rings` around every node. For a **12-node** graph that is
$\lvert X \rvert = 86$, $\lvert Y \rvert = 65$ → 4,934 live vertices. Twelve nodes.

Per A\* expansion, the inner loop did: a `String`-keyed hash lookup on `grid.vertices`, another on
`grid.vertex_index_map`, a `String` clone of the vertex id, and a **linear scan over all $N$ node
rectangles** for the forbidden test. At ~30,000 expansions × 30 nodes that is ~900,000 rectangle
tests per edge. Measured cost: **25–65 ms per edge**.

```text
      v1: search a discretized plane            v2: count intervals on an axis

   ┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐
   ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤            a────────b
   ├─┼─┼─█─█─█─┼─┼─┼─┼─┼─┼─┼─┼─┤                 c─────────d
   ├─┼─┼─█─█─█─┼─┼─┼─┼─┼─┼─┼─┼─┤                                e────f
   ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─█─█─┼─┼─┤
   ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─█─█─┼─┼─┤            → 2 lanes, one sort + one heap
   └─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘
   ~5,000 vertices, per edge, per pass
```

### (b) A quadratic occupancy ledger

`commit_reservations` built a `split_points` vector of $(\lvert X \rvert + \lvert Y \rvert) \times
\text{segments}$ points, then re-split **every existing reservation** against it, with an $O(k^2)$
dedup inside the splitter. Reservations grew to 3,276 for 45 edges, and the per-commit cost grew
monotonically from 0 ms to 24 ms as they did.

### (c) Both multiplied by a search that did not converge

`route_all_edges` ran up to `max_route_order_variants` (4) × `max_rip_up_passes` (12) ×
`max_conflict_permutations` (32) inner routings, each followed by a full $O(E^2)$ validation. A
config sweep on identical node positions:

| config | k8s topology | dense mesh |
| --- | ---: | ---: |
| default (4 variants, 12 rip-up, 32 perms) | 7,466 ms | 15,537 ms |
| 1 variant | 1,810 ms | 3,044 ms |
| 1 variant + `maxConflictPermutations=1` | **150 ms** | 3,033 ms |

On `kubernetes_cluster_topology` the permutation loop cost **12×** and produced an *identical*
result. The order-variant loop cost **4×** for no measured gain.

### The shape of the change

| | v1 | v2 |
| --- | --- | --- |
| dominant term | per-edge A\* over a ~5,000-vertex grid, inside a search loop | Phase 5 ordering, $O(E \log V)$ |
| routing | search, with rip-up and reroute | table lookup over pre-counted lanes |
| badge placement | backtracking search after routing | a box reserved in the layered graph before coordinates exist |
| validation | $O(N^2)$/$O(E^2 S^2)$, debug builds only | spatial-hash scans, on by default |
| outer loop | 4–8 full pipeline passes | none |

The engine did not get faster by being optimised. It got faster by no longer doing the expensive
thing.

---

## What dominates now

Layout itself is under 2 ms on every audit fixture, which means the remaining costs in a real
browser are the two things *outside* the Rust pipeline:

1. **Measurement** — canvas `measureText` on the host, cached per `(font, text)`.
2. **Serialization** — `serde_wasm_bindgen::to_value` materialises one JS object per node, edge,
   badge, crossing and diagnostic.

Both are cacheable across re-layouts of the same dataset, which is the correct shape for this
problem. But note the honesty boundary: this is the *design expectation*, following from the fact
that layout has become too cheap to dominate. **It has not been measured in the browser.** The WASM
module builds at 663 KB (239 KB gzipped) with verified exports; its browser timings are unverified,
and that is listed as a known gap in the results.

---

## Scaling projection

The architecture note projects, for a 200-node / 400-edge graph — roughly 7× the dataset that took
47 seconds under v1 — a total of **≈ 15–25 ms**, of which measurement (1–3 ms) and emit (1–2 ms) are
a meaningful share. A 2,000-node graph should land around 150–250 ms.

Those are projections, not measurements. The measured points today are: 30 nodes / 45 edges →
1.79 ms layered, and a slowest-of-forty of 1.88 ms. Everything above 30 nodes is extrapolation from
the complexity table.

Two structural reasons to expect the extrapolation to hold:

- The only $O(E \log V)$ term sits inside a loop bounded by a constant (`ordering_seeds` ×
  `ordering_sweeps`).
- Nothing anywhere in the pipeline is quadratic in $E$. The two places v1 was — the occupancy ledger
  and the validator — have been replaced by an interval colouring and a spatial hash respectively.

### On parallelism

The engine is single-threaded, deliberately. v1's one use of rayon was measured at 0.19–10 ms, i.e.
irrelevant, and the app serves no COOP/COEP headers, so `SharedArrayBuffer` — and therefore WASM
threading — is unavailable in the browser regardless.

The one place with a genuinely parallel structure is Phase 5's $k$ independent ordering seeds: four
completely independent runs compared at the end. Even wired up, that buys at most a few milliseconds,
and it would have to be reconciled with the [determinism](./determinism.md) guarantee. The value of
the Rust port here is predictable performance and cheap data structures, not thread-level
parallelism.

---

← [Quality model](./quality-model.md) | [Concepts index](./README.md) | [Docs index](../README.md)
