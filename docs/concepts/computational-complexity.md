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

The harness runs 4 mode/direction cases (`layered` in top-down, left-right and bottom-up, plus
`radial`) × the 10 datasets in `public/data/graphs/`, times the whole `compute_layout` call, and
fails if any combination exceeds a 50 ms budget. Native release is the _optimistic_ bound; WASM in a
browser will be slower and **has not been measured** — a recorded open gap.

Notation: $V$ nodes, $E$ edges, $R$ ranks. $S$ is the number of segments in a route.

---

## The layered pipeline, phase by phase

| Phase         | What it does                                                                                                      | Complexity                                                 | Source                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0 Ingest      | intern ids, build CSR adjacency, bundle parallel edges, find components                                           | $O(V + E\,\alpha(V))$                                      | [`0_5_ingest.rs`](../../crates/gvui/src/0_common/0_5_ingest.rs)                                      |
| 1 Measure     | text → boxes, on the host                                                                                         | $O(\text{total characters})$ cold, $O(V + E)$ lookups warm | [`measurement/`](../../src/engine/layout/measurement/)                                               |
| 2 Structure   | Tarjan SCC, Eades FAS per component, Kahn verification                                                            | $O(V + E)$                                                 | [`1_6_structure.rs`](../../crates/gvui/src/1_cycle_breaking/1_6_structure.rs)                        |
| 3 Rank        | peer relaxation, network simplex over $\sum \omega \cdot \text{span}$, balancing, labelled-span repair            | $O(V+E)$ per pivot; near-linear in practice                | [`2_4_rank_facade.rs`](../../crates/gvui/src/2_rank_assignment/2_4_rank_facade.rs)                   |
| 4 Layer       | one item per node, a dummy per intermediate rank, a label item per labelled edge                                  | $O(V + \sum \text{span})$                                  | [`3_1_layer_builder.rs`](../../crates/gvui/src/3_crossing_minimization/3_1_layer_builder.rs)         |
| 5 Order       | $k$ seeds × $s$ median/transpose rounds, BMJ counting                                                             | $O(k \cdot s \cdot E \log V)$                              | [`3_4_order_facade.rs`](../../crates/gvui/src/3_crossing_minimization/3_4_order_facade.rs)           |
| 6 Demand      | interval-graph colouring per channel and corridor                                                                 | $O(E \log E)$                                              | [`4_1_lane_demand.rs`](../../crates/gvui/src/4_coordinate_assignment/4_1_lane_demand.rs)             |
| 7 Coordinates | rank bands, then Brandes–Köpf (4 passes)                                                                          | $O(V + E)$                                                 | [`4_4_coordinate_facade.rs`](../../crates/gvui/src/4_coordinate_assignment/4_4_coordinate_facade.rs) |
| 8 Route       | port sides scored, ports sorted, straight-shot alignment, one polyline per chain by table lookup, style post-pass | $O(E \cdot S + E \log E + \sum_v \deg(v) \log \deg(v))$    | [`5_6_route_facade.rs`](../../crates/gvui/src/5_edge_routing/5_6_route_facade.rs)                    |
| 9 Emit        | packing, deterministic sorts, constraint checks, metrics                                                          | $O((V+E)\log(V+E))$ + linear-in-practice scans             | [`6_3_emit.rs`](../../crates/gvui/src/6_validation/6_3_emit.rs)                                      |

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
adjacent ranks **exactly** in $O(E \log V)$. The naive count is $O(E^2)$; v1 used that, _and_ cloned
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
every violation _even when called as a scoring probe inside the router's inner loop_, which is why it
could not be run outside a debug build. v2's checks run on every layout by default.

---

## What v3 added, and what it cost

v3 was an aesthetic and usability pass. The bar it had to clear was that nothing it added could
reintroduce a search, because the whole performance argument above rests on there not being one.
Every addition below is either a closed-form evaluation, a sort, or a post-pass over a finished
polyline.

| addition                    | where                                                                                       | cost                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| geometric port-side scoring | Phase 8, [`5_1_ports.rs`](../../crates/gvui/src/5_edge_routing/5_1_ports.rs)                | $O(16)$ per edge → $O(E)$                                 |
| straight-shot alignment     | Phase 8, `5_1_ports.rs`                                                                     | $O(E \log E)$                                             |
| same-rank peer detection    | Phase 3, [`2_4_rank_facade.rs`](../../crates/gvui/src/2_rank_assignment/2_4_rank_facade.rs) | $O(E)$ merges + a probe capped at 256 nodes per candidate |
| labelled-span repair        | Phase 3, `2_4_rank_facade.rs`                                                               | monotone, one or two passes in practice                   |
| octilinear chamfering       | Phase 8, [`5_5_edge_style.rs`](../../crates/gvui/src/5_edge_routing/5_5_edge_style.rs)      | $O(\text{bends})$, one spatial-hash lookup per corner     |

### Port-side scoring is 16 evaluations, not a search

`flexible_port_sides` lets either endpoint attach to any of four faces, which is $4 \times 4 = 16$
`(source_side, target_side)` combinations per edge. v1 also tried sixteen — and then searched again
to repair the crossings that produced, which is where the cost was. v3 _scores_ each combination
with a closed-form cost and takes the minimum:

```text
   (bends, flow_penalty + length/1000, congestion, candidate order)
     ↑                   ↑                  ↑            ↑
   integer      flow_side_bias keeps   ports already   fixed table,
                the hierarchy          committed to    so ties resolve
                reading top-down       that face       deterministically
```

Sixteen is a constant, the cost function is arithmetic on already-known coordinates, and there is no
second pass. The whole thing is $O(E)$ with a constant of 16. Nothing is retried, so the sixteen
evaluations are the _entire_ budget for the decision — which is the difference from v1, not the
number 16.

### Straight-shot alignment is one sort

`apply_straight_shot_alignment` snaps a source port and a target port onto a common coordinate when
that collapses a dog-leg into a single straight segment. Candidates are sorted once by descending
edge weight (edge index as the tie-break, for determinism) and applied greedily, each subject to
`port_pitch` against the ports already placed on that face. One sort dominates: $O(E \log E)$.

Greedy in weight order is deliberate rather than approximate. There is no ordering of the
alignments that satisfies all of them — two edges wanting the same port slot are a genuine conflict
— so the choice is between a greedy pass and a search, and a search here would cost more than the
bends it saves. Measured effect on a 24-node graph: **92 bends → 61**.

### Peer detection is a merge plus a bounded probe

An edge $u \to v$ is a _peer_ edge when $u$ and $v$ share a predecessor and masking the edge out
leaves no other directed path $u \to v$. Both halves are cheap:

- **Shared predecessor** is a linear merge of two sorted CSR rows — $O(\deg(u) + \deg(v))$, summing
  to $O(E)$ over all edges.
- **The path probe** is a FIFO reachability walk with the candidate edge masked by _index_, over the
  same CSR, capped by `PEER_PROBE_BUDGET = 256` visited nodes. When the budget runs out it answers
  "a path exists", which keeps the edge hierarchical — the cap can only ever cost a missed
  side-by-side placement, never an invalid ranking.

So the whole detection is $O(E)$ merges plus $O(E \cdot 256)$ worst-case probe work, and the 256 is
what turns an otherwise-quadratic reachability question into a linear one. Visited state is a
generation-stamp array rather than a fresh `visited` vector per probe: one allocation for the whole
scan, and clearing is a counter increment.

### Labelled-span repair, and why it runs last

`enforce_labelled_span` is the last thing in Phase 3 that touches the rank vector. A labelled edge
is drawable at span 0 (a flat edge, badge on the horizontal run) or span $\ge 2$ (an intermediate
rank carries the `Label` item), and at **no other value**. Span 1 has neither, so the badge falls
through to Phase 8's positional safety net, which is allowed to emit a leader line and is covered by
no reservation.

Peer relaxation makes span 0 reachable, and `balance_ranks` is then the step most likely to push one
endpoint down by exactly one and land on the bad case — which is precisely why the repair runs
_after_ balancing rather than before. An earlier revision ran it first and inspected a rank vector
that balancing then invalidated.

Each pass raises the `min_len` of any labelled arc found at span 1 to 2 and calls
`repair_feasibility`, which only ever raises ranks — so the loop is monotone and terminates; the
`node_count + 1` bound is belt-and-braces. In practice it converges in one or two passes, because
tightening only fires for a labelled edge that balancing happened to leave at span 1. The pass exists
because of one measured failure: scenario 17 ("Cyclic Agent Execution Trace") emitted a badge whose
leader line overlapped two nodes — the only constraint violation in the whole suite.

### Octilinear is linear in bend count

`chamfer_corners` walks the finished polyline once. For each interior right-angle corner it computes
the two chamfer vertices and asks a local `NodeRectIndex` — a uniform spatial hash over the node
boxes, pre-grown by the clearance — whether the diagonal would clip a node. That is one hash lookup
with $O(1)$ expected candidates per corner, so the pass is linear in bend count.

Two properties make it free of any global reasoning. The cut is clamped to half the shorter leg, so
two neighbouring corners can each claim at most half of the leg they share and **no lookahead is
needed**; and every rejection is local, so the worst case is the unmodified orthogonal polyline.
Octilinear cannot fail — it degrades to a square corner one corner at a time.

That is the whole reason it is a post-pass rather than a router, and the reason is a complexity
argument, not a scheduling one. The exactness of Phase 6 comes from channels being **axis-aligned
intervals**: the set of segments competing for a channel is an interval graph, interval graphs are
perfect, and greedy colouring therefore uses exactly $\omega$ lanes in one sweep. A diagonal corridor
is not an interval on either axis, and the conflict graph of a set of diagonals is not perfect — so
an eight-direction lane model has no equivalent exact colouring. Building one would mean replacing
an exact $O(E \log E)$ reservation with a search, and giving up the guarantee that every edge routes.
The chamfer buys softer turns and slightly shorter paths (each applied cut trades $2c$ of
axis-aligned travel for $c\sqrt{2}$) without touching that guarantee.

---

## Measured: v1 against v2

Same machine, same eight datasets, native `--release`. **This is a historical table.** Those eight
fixtures were retired in v3 and replaced by ten harder ones, so the dataset names below no longer
exist in `public/data/graphs/`; a v1-vs-v2 comparison is only meaningful run-for-run on identical
input, so the original run is reproduced rather than re-derived. Current figures are in
[the next section](#measured-today).

| dataset                       |   N |   E |    v1 ms |    v2 ms |      speedup | v1 crossings | v2 crossings | v1 valid | v2 valid |
| ----------------------------- | --: | --: | -------: | -------: | -----------: | -----------: | -----------: | :------: | :------: |
| `decision_tree`               |   5 |   4 |     66.6 | **0.04** |       1,665× |            0 |            0 |    ✓     |    ✓     |
| `cyclic_mesh`                 |   5 |   6 |    154.6 | **0.08** |       1,933× |            0 |            0 |    ✓     |    ✓     |
| `ai_agent_trace`              |   6 |   6 |     13.1 | **0.36** |          36× |            0 |            0 |    ✓     |    ✓     |
| `clean_ring_10n_10e`          |  10 |  10 |    192.3 | **0.11** |       1,748× |            0 |            0 |    ✓     |    ✓     |
| `crossing_mesh_10n_10e`       |  10 |  10 |  1,571.1 | **0.35** |       4,489× |            3 |            6 |    ✓     |    ✓     |
| `distributed_saga_workflow`   |  10 |  11 |  1,788.7 | **0.11** |      16,261× |            0 |            0 |    ✓     |    ✓     |
| `kubernetes_cluster_topology` |  12 |  13 | 26,710.0 | **0.14** | **190,785×** |            2 |            0 |    ✓     |    ✓     |
| `dense_kubernetes_mesh`       |  30 |  45 | 47,335.8 | **1.79** |  **26,445×** |          191 |       **28** |    ✗     |    ✓     |

Slowest fixture across every engine and all eight datasets at the time: **1.88 ms**, against the
harness's 50 ms budget.

Two honest readings of this table:

- **The v1 timings are not monotone in graph size.** `clean_ring_10n_10e` (10 nodes) took 192 ms;
  `kubernetes_cluster_topology` (12 nodes) took 26,710 ms. That is not a scaling curve — it is a
  search whose cost depends on how many times its inner loops happened to fire. Predictability was
  as much of the problem as the absolute number.
- **`crossing_mesh_10n_10e` reports more crossings under v2** (6 vs 3), the only fixture that does.
  It is not a regression in the drawing: v1 produced 3 _geometric_ crossings by routing through a
  2-rank layout in which half the edges are feedback edges, and spent 1.5 seconds of A\* doing it.
  v2 reports 6 crossings genuinely present in a graph whose forward DAG is only 2 ranks deep. A
  graph with no flow direction is the case a hierarchical engine is structurally worst at, and at
  the time the stress engine drew it better. That engine was removed in favor of a clean dual-engine
  architecture (`layered` and `radial`), so cyclic dense meshes without clear hierarchy are best routed
  with radial mode or clustered DAG decomposition.

---

## Measured today

The two engines, and what the layered one costs to give you a routed drawing.

| mode                        | dominant cost          | complexity                    | notes                                                          |
| --------------------------- | ---------------------- | ----------------------------- | -------------------------------------------------------------- |
| `layered` (any `direction`) | Phase 5 ordering       | $O(k \cdot s \cdot E \log V)$ | $k, s$ constant → effectively $O(E \log V)$                    |
| `radial`                    | BFS + wedge allocation | $O(V + E)$                    | plus overlap removal and the shared straight-line routing path |

### Radial

BFS from the root to get ring depth, a leaf-count pass to size wedges proportionally, then ring radii
derived from the boxes actually on rings $k-1$ and $k$. All linear. Followed by overlap removal and
the shared routing/badge/emit path in
[`7_2_geometric_common.rs`](../../crates/gvui/src/7_engines/7_2_geometric_common.rs).

Overlap removal is two stages, and the split matters: `overlap_removal_passes` (default 6) cheap
symmetric relaxation passes through a spatial hash, then **one exact scan-line pass** that closes
whatever is left. Relaxation alone would need $O(V)$ passes — $O(V^2)$ work — to drive overlaps to
zero; the scan-line pass alone would produce a drawing skewed to one side, because it resolves every
conflict by moving boxes in one direction.

Radial does **not** consult `time_budget_ms`. Its cost is a deterministic function of node count, and
clipping on wall-clock time would make the drawing depend on machine load. Only Phase 5 of the
layered pipeline reads the clock.

Badge placement is `BADGE_CANDIDATES = 5` trial positions per badge, then a leader line. That is a
best-effort local pass, not a reservation, and the audit treats its failures as reported rather than
fatal — see [the quality model](./quality-model.md#the-per-engine-constraint-policy).

### The full audit run

Reproduced verbatim from `cargo run --release --manifest-path crates/gvui/Cargo.toml --example
audit`:

```text
dataset                        engine         N    E        ms  ranks  cross    geo lanes  bends straight  ldr valid   det
--------------------------------------------------------------------------------------------------------------------------
ai_agent_trace                 layered       12   16      0.66     17      0      0     2     28    1.00    0   yes   yes
ai_agent_trace                 left-right    12   16      0.31     17      0      0     2     28    1.00    0   yes   yes
ai_agent_trace                 bottom-up     12   16      0.27     17      0      0     2     28    1.00    0   yes   yes
ai_agent_trace                 radial        12   16      0.14      0      5      5     0      5    1.00    0   yes   yes
deep_release_pipeline          layered       14   13      0.10     27      0      0     0      0    1.00    0   yes   yes
deep_release_pipeline          left-right    14   13      0.09     27      0      0     0      0    1.00    0   yes   yes
deep_release_pipeline          bottom-up     14   13      0.09     27      0      0     0      0    1.00    0   yes   yes
deep_release_pipeline          radial        14   13      0.09      0      0      0     0      0    1.00    0   yes   yes
fanout_fanin_scatter_gather    layered       17   30      0.19      5      0     82    14     56    1.00    0   yes   yes
fanout_fanin_scatter_gather    left-right    17   30      0.18      5      0     82    14     56    1.00    0   yes   yes
fanout_fanin_scatter_gather    bottom-up     17   30      0.17      5      0     82    14     56    1.00    0   yes   yes
fanout_fanin_scatter_gather    radial        17   30      0.19      0     52     52     0     14    1.00    0   yes   yes
feedback_retry_state_machine   layered       10   17      0.65     15      2      2     5     44    1.00    0   yes   yes
feedback_retry_state_machine   left-right    10   17      0.59     15      2      6     5     44    1.00    0   yes   yes
feedback_retry_state_machine   bottom-up     10   17      0.58     15      2      2     5     44    1.00    0   yes   yes
feedback_retry_state_machine   radial        10   17      0.09      0     10     10     0      6    1.00    1   yes   yes
heavy_label_data_contracts     layered        6    6      0.05      9      0      0     1      4    1.00    0   yes   yes
heavy_label_data_contracts     left-right     6    6      0.04      9      0      0     1      4    1.00    0   yes   yes
heavy_label_data_contracts     bottom-up      6    6      0.04      9      0      0     1      4    1.00    0   yes   yes
heavy_label_data_contracts     radial         6    6      0.03      0      0      0     0      1    1.00    0   yes   yes
long_span_bypass_network       layered       10   14      0.56     19      3      5     4     34    1.00    0   yes   yes
long_span_bypass_network       left-right    10   14      0.51     19      3      5     4     34    1.00    0   yes   yes
long_span_bypass_network       bottom-up     10   14      0.50     19      3      5     4     34    1.00    0   yes   yes
long_span_bypass_network       radial        10   14      0.08      0      2      2     0      4    1.00    0   yes   yes
microservice_platform_topology layered       18   31      1.16     17     14     22     8    108    0.79    0   yes   yes
microservice_platform_topology left-right    18   31      1.10     17     14     24     8    108    0.79    0   yes   yes
microservice_platform_topology bottom-up     18   31      1.07     17     14     22     8    108    0.79    0   yes   yes
microservice_platform_topology radial        18   31      0.20      0     30     30     0     14    1.00    0   yes   yes
multi_component_tenants        layered       12   12      0.12      7      0      0     4     24    1.00    0   yes   yes
multi_component_tenants        left-right    12   12      0.09      5      0      0     4     12    1.00    0   yes   yes
multi_component_tenants        bottom-up     12   12      0.09      7      0      0     4     24    1.00    0   yes   yes
multi_component_tenants        radial        12   12      0.08      0      4      4     0      9    1.00    0   yes   yes
parallel_bundle_transports     layered        5   14      0.11      9      0      8     5     56    1.00    0   yes   yes
parallel_bundle_transports     left-right     5   14      0.09      9      0      8     5     56    1.00    0   yes   yes
parallel_bundle_transports     bottom-up      5   14      0.09      9      0      8     5     56    1.00    0   yes   yes
parallel_bundle_transports     radial         5   14      0.06      0      0      0     0      2    1.00    4   yes   yes
peer_mesh_service_registry     layered        8   22      0.61      7      9     29     7     78    1.00    0   yes   yes
peer_mesh_service_registry     left-right     8   22      0.48      7      9     29     7     76    1.00    0   yes   yes
peer_mesh_service_registry     bottom-up      8   22      0.45      7      9     29     7     78    1.00    0   yes   yes
peer_mesh_service_registry     radial         8   22      0.12      0     12     12     0     15    1.00    0   yes   yes

slowest fixture: 1.16 ms (budget 50 ms)
AUDIT PASSED: 40 fixture/engine combinations clean
```

Reading notes:

- **Slowest fixture: 1.16 ms**, on `microservice_platform_topology` (18 nodes, 31 edges), against a
  50 ms budget. Every one of the 40 combinations is valid and deterministic. Everything v3 added is
  inside these numbers.
- **The three layered directions agree to within noise.** `layered`, `left-right` and `bottom-up`
  are the _same code_ on the same input — LR transposes every box on the way in and the drawing on
  the way out, BU mirrors the rank axis — and their timings differ by tens of microseconds. Where
  they differ is in the drawing: `feedback_retry_state_machine` reports 2 geometric crossings
  top-down and 6 left-right, and `multi_component_tenants` packs into 7 ranks top-down but 5
  left-right, because component packing is aspect-driven and the aspect target does not transpose
  with the frame.
- **`straight_chain_ratio` is 1.00 on nine of the ten datasets**, and `leader_count` is 0 on every
  layered run. Those are the two numbers to watch: the first dropping means Brandes–Köpf's dummy-chain
  alignment is being defeated, the second rising means a label item's reserved area was not
  respected.
- **Radial is 3–6× cheaper on most fixtures** (0.20 ms against 1.16 ms on
  `microservice_platform_topology`, 0.09 against 0.65 on `feedback_retry_state_machine`) and that
  gap is what orthogonal routing, straight dummy chains and reserved badge space cost. It is not
  cheaper everywhere: on `fanout_fanin_scatter_gather` both land at 0.19 ms, because a 17-node
  scatter-gather is small enough that ingest and emit dominate both engines.
- **The two crossing counts are different questions.** `fanout_fanin_scatter_gather` reports 0
  combinatorial crossings under layered and 82 geometric ones: the ordering is optimal, and the 82
  are edges descending through a 14-lane channel and crossing the horizontal runs above them. Radial
  reports 52 of each, because it has no channels. Neither number is a defect count on its own — see
  [the quality model](./quality-model.md#combinatorial-versus-geometric-crossings).
- Radial's three non-zero `ldr` values (1, 2 and 4) are its badge fallback firing, which is expected:
  radial reserves no badge space, so a leader line is the designed outcome, not a defect.

The WASM gate in [`scripts/runLayoutAudit.ts`](../../scripts/runLayoutAudit.ts) covers a wider
fixture set at the cost of not timing anything: 3 cases × (26 graph-testing scenarios + the same 10
datasets) = **108 fixture/mode runs, 0 failures**.

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

**Routing was 99.5 %+ of the cost. Everything else was noise.** And that is _one_ pass; the outer
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

| config                                    | k8s topology | dense mesh |
| ----------------------------------------- | -----------: | ---------: |
| default (4 variants, 12 rip-up, 32 perms) |     7,466 ms |  15,537 ms |
| 1 variant                                 |     1,810 ms |   3,044 ms |
| 1 variant + `maxConflictPermutations=1`   |   **150 ms** |   3,033 ms |

On `kubernetes_cluster_topology` the permutation loop cost **12×** and produced an _identical_
result. The order-variant loop cost **4×** for no measured gain.

### The shape of the change

|                 | v1                                                           | v2                                                           |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| dominant term   | per-edge A\* over a ~5,000-vertex grid, inside a search loop | Phase 5 ordering, $O(E \log V)$                              |
| routing         | search, with rip-up and reroute                              | table lookup over pre-counted lanes                          |
| badge placement | backtracking search after routing                            | a box reserved in the layered graph before coordinates exist |
| validation      | $O(N^2)$/$O(E^2 S^2)$, debug builds only                     | spatial-hash scans, on by default                            |
| outer loop      | 4–8 full pipeline passes                                     | none                                                         |

The engine did not get faster by being optimised. It got faster by no longer doing the expensive
thing.

---

## What dominates now

Layout itself is under 1.2 ms on every audit fixture, which means the remaining costs in a real
browser are the two things _outside_ the Rust pipeline:

1. **Measurement** — canvas `measureText` on the host, cached per `(font, text)`.
2. **Serialization** — `serde_wasm_bindgen::to_value` materialises one JS object per node, edge,
   badge, crossing and diagnostic.

Both are cacheable across re-layouts of the same dataset, which is the correct shape for this
problem. But note the honesty boundary: this is the _design expectation_, following from the fact
that layout has become too cheap to dominate. **It has not been measured in the browser.** The WASM
module builds at 663 KB (239 KB gzipped) with verified exports; its browser timings are unverified,
and that is listed as a known gap in the results.

---

## Scaling projection

The architecture note projects, for a 200-node / 400-edge graph — roughly 7× the dataset that took
47 seconds under v1 — a total of **≈ 15–25 ms**, of which measurement (1–3 ms) and emit (1–2 ms) are
a meaningful share. A 2,000-node graph should land around 150–250 ms.

Those are projections, not measurements. The measured points today are: 18 nodes / 31 edges →
1.16 ms layered, which is the slowest of the current forty combinations, and 30 nodes / 45 edges →
1.79 ms layered on the retired v2 fixture set. Everything larger is extrapolation from the
complexity table.

Three structural reasons to expect the extrapolation to hold:

- The only $O(E \log V)$ term sits inside a loop bounded by a constant (`ordering_seeds` ×
  `ordering_sweeps`).
- Nothing anywhere in the pipeline is quadratic in $E$. The two places v1 was — the occupancy ledger
  and the validator — have been replaced by an interval colouring and a spatial hash respectively.
- Nothing v3 added changes the leading term. Port-side scoring is $O(E)$ with a constant of 16,
  straight-shot alignment is one $O(E \log E)$ sort, peer detection is bounded by a 256-node probe,
  and octilinear is linear in bend count. The dominant term is still Phase 5.

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
