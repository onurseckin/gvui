# 05 — Roadmap

Sequencing, with a working engine at every step. No milestone requires the next one to be useful.

---

## Milestone 0 — Stop the bleeding (small, immediate)

Five changes against the current engine. Independent of the redesign; ship first.

| # | Change | Expected effect |
| --- | --- | --- |
| 1 | `assign_ranks(nodes, &active_edges, Some(&edge_role_map))` | **Measured:** `dense_kubernetes_mesh` 2 ranks → 8 balanced ranks. Largest single quality win in the codebase. |
| 2 | `build_layer_graph`: include reversed feedback edges | Ordering and crossing counting stop being blind to a third of the graph |
| 3 | `minimize_crossings`: remove the `best_crossings == 0` early return | The crossing-minimization stage runs for the first time |
| 4 | `minimize_crossings` transpose: compare against current, not global best | The transpose pass stops giving up after its first improvement |
| 5 | `GraphCanvas`: delete the synchronous main-thread fallback on worker timeout | A 30 s wait stops becoming a multi-minute browser freeze |

Also worth doing here, purely defensively, until Milestone 3 removes the router:
`maxRouteOrderVariants: 1`, `maxConflictPermutations: 1`. **Measured:** 12× faster on
`kubernetes_cluster_topology` with byte-identical output.

**Exit:** all 8 datasets produce `valid = true`; no dataset exceeds ~2 s native.

**Risk:** low. Changes 1–4 make stages that currently no-op start working, so *some* fixture
geometry will shift. Snapshot metrics before and after and inspect the diffs; the ranking change in
particular is a large visual change on cyclic graphs (correctly so).

---

## Milestone 1 — Measurement and the data model

No behaviour change to layout quality; sets up everything else.

- `MeasurementProvider` interface + canvas implementation + `NODE_TEMPLATE` descriptor.
- Label wrapping (`maxLabelWidth`, `maxLabelLines`).
- Measurement cache keyed on `(text, fontKey, maxWidth)`.
- `GraphIR`: interning, CSR adjacency, parallel-edge bundling, WCC split.
- Input contract additions (`w`/`h`, `rank`, `role`, `weight`, `minlen`) — all optional.

**Exit:** node and label boxes are exact for the real font; a config-only re-layout skips measurement
entirely.

**Why first:** every later phase consumes boxes, and getting a 200-character label bounded here is
what stops it poisoning ranking and ordering downstream.

---

## Milestone 2 — Structure, ranking, layering, ordering

The combinatorial core. Still uses the **existing** router at the end, so the engine keeps working.

- Phase 2: reverse-don't-drop feedback edges; drop pre-classification of cross edges.
- Phase 3: route `assign_ranks` to `run_network_simplex`; per-edge `minlen` (2 for labelled edges);
  weighted edges; aspect-ratio balancing post-pass.
- Phase 4: `Layered` arena; dummy chains for all long edges; **label nodes**.
- Phase 5: Barth–Mutzel–Jünger counting; median sweeps; corrected local transpose; dummy priority;
  k seeds.

**Exit:** crossing count on `dense_kubernetes_mesh` drops from 191 to a small number *before routing
runs at all*. This is the checkpoint that proves the thesis — if crossings do not fall here, the
routing rewrite will not save it.

**Measurement to take:** geometric crossings after the old router, with the new ordering. Compare to
the combinatorial count from Phase 5. They should be close; a large gap means the router is
introducing crossings the ordering already resolved, which is further evidence for Milestone 3.

---

## Milestone 3 — Coordinates and routing

The performance payoff.

- Phase 6: channel/corridor occupancy from ordering; interval colouring; lane assignment; separation
  emission.
- Phase 7: Brandes–Köpf X, rank bands Y.
- Phase 8: determined port sides; port ordering by neighbour order; port spacing with node growth;
  polyline materialization; corner rounding; bundling.
- Phase 8g: badges read straight from label-node boxes.

**Delete:** `5_1_routing_grid.rs`, `5_2_route_occupancy.rs`, `5_3_bounded_astar.rs`,
`5_10_edge_router_facade.rs` rip-up machinery, `5_7_badge_placement.rs` candidate/DSU/backtracking,
`3_4_trial_state_generator.rs`, `3_6_layout_optimizer_state.rs` outer search, `LayoutScore`.

**Exit:** the target table in [README](./README.md#target). 30 n/45 e under 10 ms, valid.

**Risk:** highest of any milestone, and the one to prototype behind a flag. Mitigation: keep the old
router reachable via `engine: "v1" | "v2"` for one release so the two can be compared on the same
input in the developer panel.

---

## Milestone 4 — Emit, quality gate, config

- Typed-array payload; `mapLayoutResultToPositioned` rewritten to O(E) with a Map.
- Constraint assertions under `debug_assertions`.
- Metrics panel: `crossings`, `bends`, `straightChainRatio`, `leaderCount`, per-phase timings.
- Config restructured into the three tiers; presets.
- `runLayoutAudit` upgraded to a real gate (constraints, metric bands, time budget, determinism).

**Exit:** a regression in aesthetic quality fails the build.

---

## Milestone 5 — Organic mode

Independent of 1–4; can be done in parallel or deferred.

- APSP by BFS (pivot-based beyond ~2,000 nodes).
- Stress majorization by SGD.
- PRISM or VPSC overlap removal.
- Straight/bundled edges, local label placement.
- Depth heuristic that suggests organic mode for flow-less graphs.

**Exit:** `crossing_mesh_10n_10e` (2 ranks, half its edges in the feedback set) looks better in
organic mode than layered.

---

## Deferred / explicitly not now

| Item | Why not |
| --- | --- |
| WASM threading (COOP/COEP + `wasm-bindgen-rayon`) | The only parallelizable phase is Phase 5's seeds, worth ≤5 ms. Revisit only if profiling on 2,000-node graphs shows it dominating. |
| Incremental / animated re-layout | Needs a stable identity mapping across layouts. Valuable, but only once one layout is fast. |
| Clusters / nested subgraphs (`group` field) | A real feature with its own design (compound ranking, cluster-aware ordering). The `group` field is reserved in the contract so it can land without a breaking change. |
| Interactive node dragging with constraint preservation | Depends on Phase 7 exposing its constraint graph. |
| Edge label placement by ILP | The label-node approach makes it unnecessary. |

---

## Decision points to resolve before Milestone 2

Three choices worth settling explicitly, since they change the design rather than the schedule.

1. **`labelPlacement` default: `on-edge` or `beside-edge`?** `beside-edge` (double-width label node,
   edge through the left face) reads better in dense graphs and matches how most hand-drawn diagrams
   annotate a flow, at the cost of ~1.6× more horizontal space. Recommendation: `beside-edge`, but
   this is a taste call and the reasonable place to want a look at both.

2. **Feedback-edge rendering.** Exit bottom and loop around the outside (explicit, unmistakable, uses
   side corridors) versus route like any other edge with only an arrow direction to distinguish it
   (compact, subtler). Recommendation: loop-around, because "this closes a cycle" is usually the most
   interesting thing on the diagram.

3. **Aspect-ratio balancing on by default?** It makes `clean_ring_10n_10e` stop being a 10-node
   vertical line, but it also breaks the property that rank == semantic depth, which matters if the
   graphs represent staged pipelines. Recommendation: on, with `maxNodesPerRank` available to pin it,
   and off automatically when any node carries an explicit `rank`.

---

## Estimated shape of the work

Rough relative sizing, not calendar time:

| Milestone | Size | New code | Deleted code |
| --- | --- | --- | --- |
| 0 — bleeding | XS | ~20 lines | ~0 |
| 1 — measurement + IR | M | ~600 lines | ~200 |
| 2 — combinatorial core | L | ~1,200 lines | ~800 |
| 3 — coordinates + routing | L | ~1,000 lines | **~4,500** |
| 4 — emit + gate + config | M | ~600 lines | ~400 |
| 5 — organic | M | ~700 lines | ~120 |

Net: the engine ends up roughly 30–40 % smaller than it is today, with better guarantees and around
three orders of magnitude more speed. Milestone 3 is the one that carries the risk and also the one
that removes the most code — both because it deletes the search rather than optimizing it.
