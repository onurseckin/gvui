← [Docs Home](../README.md) | **Engine Index** | [Next: Foundations →](./01-foundations.md)

# The Layered Layout Engine

This section documents GVUI's layered graph layout engine: what each phase computes, which
algorithm it uses, and what that algorithm guarantees.

The engine takes a list of nodes and edges with no coordinates, and returns a drawing — node
positions, edge polylines, badge rectangles — in a single forward pass. It is written in Rust and
compiled to WebAssembly. The entry point is
[`compute_custom_layout_wasm`](../../crates/gvui/src/lib.rs).

If you are new to graphs, start with [Foundations](./01-foundations.md). If you want to understand
*why* the engine is shaped the way it is, [The Pipeline](./02-the-pipeline.md) is the chapter that
matters most; everything after it is detail.

---

## The three principles

Every design decision in the engine follows from one of three rules.

### P1 — Constraints flow forward. Nothing is retried.

Every phase produces a result that is **correct by construction** with respect to the constraints
its successors cannot repair. No phase is allowed to assume "an outer loop will call me again."

Two mechanisms carry almost all the weight:

- **An edge label is an item in the layered graph.** It carries its measured box and is ordered,
  separated and given vertical room by exactly the same machinery that handles nodes. Badge space
  therefore cannot fail to fit, so there is nothing to retry.
  See [Layering and Labels](./06-layering-and-labels.md).
- **Routing lane demand is computed before any geometry exists.** Once the order of items within
  each rank is fixed, the set of edges crossing each gap is pure combinatorics. Lane counts come
  from interval-graph colouring and are fed *into* node separation, not discovered after the fact.
  See [Routing Demand](./08-routing-demand.md).

### P2 — Discrete before continuous.

Every decision that can be made on integers is made on integers: which rank, which order within a
rank, which side of a node, which port index on that side, which lane in a channel. Geometry is a
final, deterministic evaluation of those integers.

There is no grid, no pathfinding, and no search in continuous space anywhere in the engine.

### P3 — Search only where greedy is provably insufficient.

Exactly one phase searches: **layer ordering**, because two-layer crossing minimization is NP-hard
and greedy genuinely is not enough. Its search is a bounded local one — median sweeps plus a
transpose pass — over a counting function that costs $O(E \log V)$, so hundreds of evaluations cost
well under a millisecond.

Every other phase uses an algorithm with a proof attached. Those proofs are tabulated in
[The Pipeline § The guarantee table](./02-the-pipeline.md#4-the-guarantee-table).

---

## The pipeline

```text
┌── Phase 0 ── Ingest ─────────────────────────────────────────────────────────┐
│  JSON → GraphIr: interned ids, CSR adjacency, parallel-edge bundles,         │
│  weakly connected components, degree-driven node width growth                │
│  0_common/0_5_ingest.rs                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 1 ── Measure ────────────────────────────────────────────────────────┐
│  MeasurementProvider (TypeScript) → node boxes, label boxes                  │
│  ★ Nothing after this point ever sees text.                                  │
│  src/engine/layout/measurement/                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 2 ── Structure ──────────────────────────────────────────────────────┐
│  Tarjan SCC · Eades FAS · edges REVERSED, never dropped · roles assigned     │
│  1_cycle_breaking/1_6_structure.rs                                           │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 3 ── Rank ───────────────────────────────────────────────────────────┐
│  Network simplex with weights and per-edge min_len · aspect-ratio balancing  │
│  2_rank_assignment/2_4_rank_facade.rs                                        │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 4 ── Layer ──────────────────────────────────────────────────────────┐
│  Dummy chains for every long edge · ★ LABEL ITEMS carrying badge boxes       │
│  3_crossing_minimization/3_1_layer_builder.rs                                │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 5 ── Order ──────────────────────────────────────────────────────────┐
│  ★ the only search: seeds × (median sweep + transpose), BMJ crossing counts  │
│  3_crossing_minimization/3_4_order_facade.rs                                 │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 6 ── Demand ─────────────────────────────────────────────────────────┐
│  ★ the one place a later need reaches an earlier decision — resolved exactly:│
│  channel/corridor occupancy → interval colouring → lane counts → separations │
│  4_coordinate_assignment/4_1_lane_demand.rs                                  │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 7 ── Coordinates ────────────────────────────────────────────────────┐
│  Rank bands (y) · Brandes–Köpf (x), honouring Phase 6's separations          │
│  4_coordinate_assignment/4_4_coordinate_facade.rs                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 8 ── Route ──────────────────────────────────────────────────────────┐
│  Port sides (determined) · port order (a sort) · lane index → polyline ·     │
│  bundling · corner rounding · badge rects read off their label items         │
│  5_edge_routing/5_6_route_facade.rs                                          │
└──────────────────────────────────────────────────────────────────────────────┘
                                     ▼
┌── Phase 9 ── Emit ───────────────────────────────────────────────────────────┐
│  Constraint checks · metrics · arrowheads un-reversed · wire payload         │
│  6_validation/6_3_emit.rs                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**There is no loop around this diagram.**

That is not a stylistic preference; it is the entire design. A loop would mean some phase is
allowed to produce a result that a later phase might reject — and once that is true, the cost of
every phase multiplies by the number of times the loop runs, while the loop itself has nothing to
steer by. The previous engine had three such loops and took 47 seconds on a 30-node graph, ending
with an invalid drawing. The current engine takes 1.79 ms on the same graph and the drawing is
valid. [The Pipeline](./02-the-pipeline.md) explains exactly how the loops were removed.

Phase 6 is the only place where a downstream requirement (space to route edges) influences an
upstream decision (how far apart nodes sit), and it is resolved by *computing the requirement ahead
of time* rather than by iterating.

---

## Phase table

| # | Phase | Chapter | Source module | Output |
| ---: | --- | --- | --- | --- |
| 0 | Ingest | [03 — Ingest and Measurement](./03-ingest-and-measurement.md) | [`0_common/0_5_ingest.rs`](../../crates/gvui/src/0_common/0_5_ingest.rs) | `GraphIr` |
| 1 | Measure | [03 — Ingest and Measurement](./03-ingest-and-measurement.md) | [`src/engine/layout/measurement/`](../../src/engine/layout/measurement/index.ts) | `Size[]`, `LabelBox` |
| 2 | Structure | [04 — Structure](./04-structure.md) | [`1_cycle_breaking/1_6_structure.rs`](../../crates/gvui/src/1_cycle_breaking/1_6_structure.rs) | `StructureResult` |
| 3 | Rank | [05 — Rank Assignment](./05-rank-assignment.md) | [`2_rank_assignment/2_4_rank_facade.rs`](../../crates/gvui/src/2_rank_assignment/2_4_rank_facade.rs) | `RankResult` |
| 4 | Layer | [06 — Layering and Labels](./06-layering-and-labels.md) | [`3_crossing_minimization/3_1_layer_builder.rs`](../../crates/gvui/src/3_crossing_minimization/3_1_layer_builder.rs) | `Layered` |
| 5 | Order | [07 — Crossing Minimization](./07-crossing-minimization.md) | [`3_crossing_minimization/3_4_order_facade.rs`](../../crates/gvui/src/3_crossing_minimization/3_4_order_facade.rs) | `OrderingOutcome` (+ `Item::order` in place) |
| 6 | Demand | [08 — Routing Demand](./08-routing-demand.md) | [`4_coordinate_assignment/4_1_lane_demand.rs`](../../crates/gvui/src/4_coordinate_assignment/4_1_lane_demand.rs) | `RoutingDemand` |
| 7 | Coordinates | [09 — Coordinate Assignment](./09-coordinate-assignment.md) | [`4_coordinate_assignment/4_4_coordinate_facade.rs`](../../crates/gvui/src/4_coordinate_assignment/4_4_coordinate_facade.rs) | `Vec<f64>` rank tops (+ `Item::x`/`y` in place) |
| 8 | Route | [10 — Edge Routing](./10-edge-routing.md) | [`5_edge_routing/5_6_route_facade.rs`](../../crates/gvui/src/5_edge_routing/5_6_route_facade.rs) | `RouteResult` |
| 9 | Emit | [11 — Emit and Quality](./11-emit-and-quality.md) | [`6_validation/6_3_emit.rs`](../../crates/gvui/src/6_validation/6_3_emit.rs) | `CustomLayoutResult` |

Phase 1 is the only phase that does not live in Rust. Measurement is where text becomes a box, and
it must happen where the fonts are — in the browser. Every type in the table is declared in
[`0_common/0_1_types.rs`](../../crates/gvui/src/0_common/0_1_types.rs).

The phases are numbered 0–9 and the source directories are numbered 0–7, which do not line up
one-to-one: directory `3_crossing_minimization/` holds Phases 4 and 5, directory
`4_coordinate_assignment/` holds Phases 6 and 7. The phase table in
[`lib.rs`](../../crates/gvui/src/lib.rs) is the authority.

---

## Chapters

| Chapter | What it covers |
| --- | --- |
| [01 — Foundations](./01-foundations.md) | Graphs from zero: nodes, edges, degree, paths, cycles, DAGs, components, planarity. Then ranks, layered drawings and dummy nodes. |
| [02 — The Pipeline](./02-the-pipeline.md) | The design argument. Why the naive loop fails, what replaces it, and why the phase order is forced. |
| [03 — Ingest and Measurement](./03-ingest-and-measurement.md) | Wire format to `GraphIr`. Interning, CSR adjacency, bundles, components, and the text/geometry boundary. |
| [04 — Structure](./04-structure.md) | Strongly connected components, the feedback arc set, and why feedback edges are reversed rather than dropped. |
| [05 — Rank Assignment](./05-rank-assignment.md) | Longest path, tight trees, and network simplex. What "optimal ranking" means and what it costs. |
| [06 — Layering and Labels](./06-layering-and-labels.md) | Dummy chains, and the label-item trick that makes badge space allocation impossible to fail. |
| [07 — Crossing Minimization](./07-crossing-minimization.md) | The only search. BMJ counting, median sweeps, transpose, seeds and dummy priority. |
| [08 — Routing Demand](./08-routing-demand.md) | Channels, corridors, interval graphs, greedy colouring, and the separations that make routing safe. |
| [09 — Coordinate Assignment](./09-coordinate-assignment.md) | Rank bands for $y$, Brandes–Köpf for $x$, and the four-candidate alignment. |
| [10 — Edge Routing](./10-edge-routing.md) | Port sides, port order, lane index to polyline, bundling, self-loops, and badge geometry. |
| [11 — Emit and Quality](./11-emit-and-quality.md) | Constraints that are asserted, metrics that are reported, and the difference between the two. |

Related reading:

- [Concepts](../concepts/README.md) — the Sugiyama framework, node measurement, determinism,
  complexity, and the quality model, treated independently of any one phase.
- [Modes](../modes/README.md) — the four non-layered engines (organic, radial, grid) and the
  layered mode's four directions.
- [Planning archive](../planning/layout-engine-v2/README.md) — the v2 design documents, the
  diagnosis of v1 that motivated them, and the measured results.

---

← [Docs Home](../README.md) | **Engine Index** | [Next: Foundations →](./01-foundations.md)
