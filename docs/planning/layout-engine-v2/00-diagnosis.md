# 00 — Diagnosis

Measured behaviour of the current engine, the structural reason for it, and a catalogue of
confirmed defects. Everything here is observed, not inferred; measurement method is at the bottom.

---

## 1. End-to-end timings

Native `--release`, Apple Silicon, `search_best_layout_state` (the `top-down` custom engine) versus
the two fast-path engines, on `public/data/graphs/*.json`:

| dataset                       |   N |   E |        custom | top-down-dagre | left-right | states | crossings | valid |
| ----------------------------- | --: | --: | ------------: | -------------: | ---------: | -----: | --------: | :---: |
| `ai_agent_trace`              |   6 |   6 |         13 ms |         0.6 ms |     0.5 ms |      1 |         0 |   ✓   |
| `decision_tree`               |   5 |   4 |         67 ms |         0.3 ms |     0.3 ms |      1 |         0 |   ✓   |
| `cyclic_mesh`                 |   5 |   6 |        155 ms |         1.1 ms |     0.9 ms |      8 |         0 |   ✓   |
| `clean_ring_10n_10e`          |  10 |  10 |        192 ms |         2.7 ms |     2.7 ms |      6 |         0 |   ✓   |
| `crossing_mesh_10n_10e`       |  10 |  10 |      1,571 ms |         2.6 ms |     2.2 ms |      6 |         3 |   ✓   |
| `distributed_saga_workflow`   |  10 |  11 |      1,789 ms |         4.2 ms |     4.0 ms |      6 |         0 |   ✓   |
| `kubernetes_cluster_topology` |  12 |  13 | **26,710 ms** |         5.7 ms |     5.6 ms |      6 |         2 |   ✓   |
| `dense_kubernetes_mesh`       |  30 |  45 | **47,336 ms** |        75.6 ms |    71.8 ms |      4 |   **191** |   ✗   |

The `states` column is decisive: the outer neighbourhood search evaluates only **4–8 states**.
26.7 seconds across 6 evaluations is ~4.4 s _per single pipeline pass_. **The outer search breadth
is not the problem. One pass is the problem.**

## 2. Where one pass goes

Phase-level instrumentation of a single pipeline pass:

```
distributed_saga_workflow (10n 11e)
  cycle=0.43  rank+layergraph=0.03  crossmin=0.01  layer-opt=0.26  coord=0.19
  ROUTE=76.2ms   BADGE=3.9ms   VALIDATE=0.1ms
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

Routing is **99.5 %+** of the cost. Everything else is noise.

### 2a. Inside routing

Isolating one clean routing pass (build grid once, route each edge once, commit to the ledger):

| dataset                       |  A\* total | ledger commits | occupancy clones | final reservations |
| ----------------------------- | ---------: | -------------: | ---------------: | -----------------: |
| `kubernetes_cluster_topology` |    91.6 ms |         2.2 ms |           0.2 ms |                374 |
| `dense_kubernetes_mesh`       | 1,621.3 ms |       352.6 ms |           6.2 ms |              3,276 |

Two separate problems:

**(a) A\* is 25–65 ms per edge.** The grid is a dense Cartesian product of every X and Y coordinate
derived from ports, obstacle bounds, and `lane_rings` concentric rings around every node
(`|X|=86, |Y|=65` → 4,934 live vertices for a _12-node_ graph). `max_astar_states_per_route` is
8,000 but the effective bound is `max(32000, endpoint_dist × 8)`. Each expansion does a
`String`-keyed hash lookup on `grid.vertices`, another on `grid.vertex_index_map`, a `String` clone
of the vertex id, and a linear scan over **all N node rectangles** for the forbidden test.

**(b) The occupancy ledger is quadratic.** `commit_reservations` builds a `split_points` vector of
`(|X| + |Y|) × segments` points, then re-splits **every existing reservation** against it via
`split_segment_at_points`, whose internal dedup is `internal_points.iter().any(...)` — O(k²).
Reservations grow to 3,276 for 45 edges; per-commit cost grows 0 ms → 24 ms monotonically.

**(c) Both are then multiplied.** `route_all_edges` runs up to `max_route_order_variants` (4) ×
`max_rip_up_passes` (12) × `max_conflict_permutations` (32) inner routings, each followed by a full
`validate_custom_layout`. Config sweep on the same fixed node positions:

| config                                    | k8s topology | dense mesh |
| ----------------------------------------- | -----------: | ---------: |
| default (4 variants, 12 rip-up, 32 perms) |     7,466 ms |  15,537 ms |
| 1 variant                                 |     1,810 ms |   3,044 ms |
| 1 variant + `maxConflictPermutations=1`   |   **150 ms** |   3,033 ms |

For `kubernetes_cluster_topology` the permutation loop costs **12×** and produces an _identical_
result (13 routes, 4 crossings, valid). The order-variant loop costs **4×** for no measured gain.
Crossing counts are also non-monotone in the knobs — on `dense_kubernetes_mesh`, dropping
`initial_lane_rings` from 2 to 1 _improved_ crossings from 206 to 146. A search whose quality moves
randomly with its budget knobs is not converging; it is sampling.

## 3. Root cause: the combinatorial stages never run

### 3a. Ranking is role-blind

`3_6_layout_optimizer_state.rs:109`

```rust
let layered = assign_ranks(nodes, &active_edges, None);
//                                               ^^^^ edge_role_map dropped
```

With `None`, `assign_ranks_longest_path` falls back to `!edge.is_cycle.unwrap_or(false)`. The
datasets do not set `isCycle`; Eades' classification is discarded. Every edge — including
cycle-closing ones — enters Kahn's topological sort. Nodes on a cycle never reach in-degree 0, never
enter `topo_order`, never get a rank, and fall through to `unwrap_or(&0)`.

Measured, per dataset:

```
                              ENGINE TODAY (None)          ROLE-AWARE (Some(roles))
ai_agent_trace                4 ranks  r0:2 r1:1 r2:2 r3:1   4 ranks  (identical)
clean_ring_10n_10e           10 ranks  1 node per rank      10 ranks  (identical)
crossing_mesh_10n_10e         2 ranks  r0:5 r1:5             2 ranks  (identical)
cyclic_mesh                   3 ranks  r0:1 r1:2 r2:2        3 ranks  (identical)
decision_tree                 3 ranks  r0:1 r1:2 r2:2        3 ranks  (identical)
distributed_saga_workflow     6 ranks  r0:2 r1:2 r2:2 …      6 ranks  (identical)
kubernetes_cluster_topology   6 ranks  r0:2 r1:4 r2:2 …      6 ranks  (identical)
dense_kubernetes_mesh         2 ranks  r0:28 r1:2            8 ranks  r0:6 r1:3 r2:4 r3:6 r4:4 r5:3 r6:2 r7:2
```

On the dataset that matters most — the dense mesh, the "complex graph / web mesh" case — the engine
puts **28 of 30 nodes in one row**. That is the origin of the 191 crossings and the 20 s of routing.
It is a single dropped argument.

### 3b. Ordering is blind to half the graph, and never runs

`2_3_layer_graph_builder.rs` only inserts edges whose role is `Forward`:

```rust
let is_forward = match edge_role_map {
    Some(map) => map.get(&edge.id) == Some(&EdgeRole::Forward),
    ...
};
if !is_forward { continue; }
```

Feedback and cross edges are therefore absent from `successors_map`/`predecessors_map`. The
barycenter sweeps never see them and `count_total_graph_crossings` never counts them. Measured:

| dataset                       | forward | cross | feedback | adjacency entries in layer graph | crossings ordering sees | crossings rayon optimizer sees |
| ----------------------------- | ------: | ----: | -------: | -------------------------------: | ----------------------: | -----------------------------: |
| `ai_agent_trace`              |       4 |     0 |        2 |                                4 |                       0 |                              0 |
| `clean_ring_10n_10e`          |       9 |     0 |        1 |                                9 |                       0 |                              0 |
| `crossing_mesh_10n_10e`       |       5 |     0 |        5 |                                5 |                   **0** |                              7 |
| `cyclic_mesh`                 |       4 |     0 |        2 |                                4 |                       0 |                              0 |
| `decision_tree`               |       4 |     0 |        0 |                                4 |                       0 |                              0 |
| `dense_kubernetes_mesh`       |      30 |     2 |       13 |                               30 |                   **0** |                        **433** |
| `distributed_saga_workflow`   |       9 |     0 |        2 |                               12 |                       0 |                              1 |
| `kubernetes_cluster_topology` |      11 |     0 |        2 |                               13 |                       0 |                              2 |

`minimize_crossings` opens with:

```rust
if best_crossings == 0 || has_custom_orders { return ...; }
```

The count is **0 on every dataset**. Crossing minimization returns immediately, every time.
It has never executed on real input.

### 3c. The objective is directionless

`LayoutScore` is a 21-field lexicographic tuple compared field by field, with
`hard_error_count` first. Until that is 0 the comparator is effectively a single boolean, so the
search cannot distinguish "slightly better geometry" from "much worse geometry" and receives no
gradient. The struct also carries `state_hash: String` as a comparable field.

The neighbourhood generator compensates by rotating round-robin through unrelated move classes
(flip a port side, swap two nodes in a rank, swap two ports on a side, batch-repair a crossing
component). With no gradient and 4–8 evaluations of budget, this is random restart with a
4-second fitness function.

---

## 4. Confirmed defects

Ordered by impact. Each was verified against the code and, where marked _(measured)_, against a
running harness.

### Correctness

| #   | Location                                               | Defect                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `3_6_layout_optimizer_state.rs:109`                    | `assign_ranks(.., None)` discards the edge-role map; cyclic nodes silently collapse to rank 0. _(measured: 30-node mesh → 2 ranks, 28 nodes in one row)_                                                                                                                                                                                                         |
| 2   | `2_2_network_simplex.rs:262`                           | `assign_ranks` unconditionally delegates to `assign_ranks_longest_path`. The 268-line `run_network_simplex` is unreachable dead code.                                                                                                                                                                                                                            |
| 3   | `2_3_layer_graph_builder.rs`                           | Only `Forward` edges enter the layer graph. Feedback edges should be **reversed and included**, not dropped; they need dummy chains and must influence ordering.                                                                                                                                                                                                 |
| 4   | `3_1_barycenter_median_ordering.rs:99`                 | Early return when `best_crossings == 0`; because of #3 that holds on all 8 datasets, so crossing minimization never runs. _(measured)_                                                                                                                                                                                                                           |
| 5   | `3_1_barycenter_median_ordering.rs:199`                | The transpose pass accepts a swap only if it beats the **global best**, not the **current** count. After the first best is recorded it stops accepting improvements. Standard Sugiyama transpose compares against the current count.                                                                                                                             |
| 6   | `3_2_crossing_counting.rs:141`                         | `calculate_crossing_count` has no branch for edges spanning >1 rank between distinct ranks — the interval-overlap test passes, then every `else if` misses, so long edges contribute 0. The rayon optimizer's objective is blind to exactly the edges most likely to cross.                                                                                      |
| 7   | `3_6_layout_optimizer_state.rs:210`                    | `badge_result.spacing_requests` is computed and discarded. Nothing else ever writes `LayoutSearchState::exact_demands`. The entire "expand spacing until badges fit" feature is unreachable.                                                                                                                                                                     |
| 8   | `types.rs:369` / `4_5_coordinate_assignment_facade.rs` | `LayoutSearchState::layer_shifts` is `HashMap<usize, f64>`; `assign_coordinates` takes `Option<&HashMap<String, f64>>` and is always passed `None`. Dead field, mismatched type.                                                                                                                                                                                 |
| 9   | `5_10_edge_router_facade.rs`                           | Can return fewer routes than edges and report only `unresolved_soft_conflicts`. _(measured: `distributed_saga_workflow` returned 10 routes for 11 edges under defaults, 11 under `initial_lane_rings=1`)_                                                                                                                                                        |
| 10  | `GraphCanvas/index.tsx`                                | `timeoutMs: 30000` on the worker, with `.catch(() => computeGraphLayout(...))` — the fallback re-runs the **same** computation **synchronously on the main thread**. The two slowest datasets are guaranteed to time out and then freeze the tab.                                                                                                                |
| 11  | `5_1_routing_grid.rs:308`                              | `vertex_index_map` is built from `vertices.keys().enumerate()` — HashMap iteration order. A\* tie-breaking depends on it. Output was byte-identical across 5 native runs, so this is a **latent hazard** rather than an observed failure, but the ordering is not contractually stable and will shift with any change to hasher, capacity, or insertion pattern. |

### Performance

| #   | Location                                | Defect                                                                                                                                                                                                                                                     |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | `5_3_bounded_astar.rs:371`              | `combined_occupancy = occupancy.to_vec()` + `IndexedOccupancy::new(...)` rebuilt **per edge**, on an occupancy set materialised by `ledger.to_occupancy_records()` — also per edge. O(E²) copies and index builds.                                         |
| 13  | `5_3_bounded_astar.rs:454`              | Forbidden-rect test scans all N node rects per grid expansion (no spatial index). With ~30 k expansions × 30 nodes ≈ 900 k rect tests per edge.                                                                                                            |
| 14  | `5_3_bounded_astar.rs:543`              | On window-filtered failure, recurses into a **full unbounded** search, then still falls through to dogleg. A failed route costs ~2× a successful one.                                                                                                      |
| 15  | `5_2_route_occupancy.rs:337`            | `commit_reservations` re-splits **every** existing reservation against a `(\|X\|+\|Y\|)×segments` point set, with an O(k²) dedup inside `split_segment_at_points`. _(measured: per-commit cost 0 ms → 24 ms as reservations grow to 3,276)_                |
| 16  | `5_10_edge_router_facade.rs:438`        | Up to 4 order variants × 12 rip-up passes × 32 permutations, each with a full O(E²) `validate_custom_layout`. _(measured: 12× cost, identical output on k8s topology)_                                                                                     |
| 17  | `5_10_edge_router_facade.rs:528`        | `get_routes_signature` builds a `format!`-concatenated string of every point of every route, once per rip-up pass, purely as a visited-set key.                                                                                                            |
| 18  | `5_7_badge_placement.rs:738`            | `unrelated_segments` rebuilt per edge by cloning every other edge's segments — O(E²) segment clones.                                                                                                                                                       |
| 19  | `5_7_badge_placement.rs:795`            | DSU conflict graph does all-pairs **candidate × candidate** comparison: up to 48² = 2,304 geometric conflict tests per badge pair.                                                                                                                         |
| 20  | `5_7_badge_placement.rs:871`            | Backtracking builds a `format!` state-key string at every DFS node.                                                                                                                                                                                        |
| 21  | `6_1_layout_validator.rs`               | No spatial index anywhere: O(N²) node-node, O(E·S·N) edge-node, O(E²·S²) shared-segment, O(B·E·S) badge-edge. Also allocates a `format!` diagnostic message for every violation even when called purely as a scoring probe inside the router's inner loop. |
| 22  | `3_6_layout_optimizer_state.rs:158`     | `nodes.iter().find(\|n\| n.id == node.id)` inside a per-node loop — O(N²) — repeated in several places.                                                                                                                                                    |
| 23  | `3_3_rayon_parallel_search.rs:73`       | `current_ranks.clone()` (a `Vec<Vec<String>>`) per candidate swap.                                                                                                                                                                                         |
| 24  | `customLayoutAdapter.ts`                | `layoutResult.edges.find(...)` inside `dataset.edges.map(...)` — O(E²) on the JS side.                                                                                                                                                                     |
| 25  | `3_6_layout_optimizer_state.rs:102-141` | Cycle breaking, ranking, layer-graph construction and graph normalization are **invariant** across all search states, yet re-run for every state evaluation.                                                                                               |

### Architecture

| #   | Observation                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26  | Rayon appears in exactly one place (`optimize_layer_orders_parallel`), measured at 0.19–10 ms. The app serves no COOP/COEP headers, so `SharedArrayBuffer` — and therefore wasm threading — is unavailable in the browser. Whatever rayon does there, it cannot be the source of a speedup. The parallelism motivation for the Rust port is currently unrealized. |
| 27  | String-keyed everything: `HashMap<String, Vec<String>>` adjacency, `format!("{:.3},{:.3}")` vertex keys, `GridEdge` cloned with three owned `String`s into both directions of the adjacency list.                                                                                                                                                                 |
| 28  | `serde_wasm_bindgen::to_value` materialises one JS object per node, edge, badge, crossing and diagnostic. At the target sizes this becomes a leading cost once layout itself is fast.                                                                                                                                                                             |
| 29  | `compute_force_layout` is not a force layout — it is a staggered grid with straight centre-to-centre lines. The mode most relevant to "web meshes and network diagrams" is the least real.                                                                                                                                                                        |
| 30  | 38 flat config knobs, of which ~15 exist only to bound a search.                                                                                                                                                                                                                                                                                                  |

---

## Reproducing the measurements

The repo was **not modified**. Measurements came from a native harness in the session scratchpad:

1. `crates/gvui/` copied to a scratch directory; its `Cargo.toml` `crate-type` changed from
   `["cdylib"]` to `["cdylib", "rlib"]` so it can be linked as a library.
2. A small `bin` crate depending on it by path, built `--release`.
3. Datasets loaded from `public/data/graphs/*.json` with the same normalization the audit script
   uses (`width: 140, height: 70`, `label` from `name`).
4. Phases invoked directly (`break_cycles`, `assign_ranks`, `build_layer_graph`,
   `minimize_crossings`, `assign_coordinates`, `route_all_edges`, `place_edge_badges`,
   `validate_custom_layout`) and timed with `std::time::Instant`.

Native release is the _optimistic_ bound; `wasm32` in a browser will be meaningfully slower.
