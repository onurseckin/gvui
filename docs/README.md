# GVUI Layout Documentation

This is the documentation for GVUI's graph layout engine: the code that takes a list of nodes and
a list of edges and decides where every box, every line and every edge label goes.

**No prior knowledge of graph theory is assumed.** The engine chapters build from "what is a
directed edge" up to the complete pipeline, one idea at a time.

---

## The one idea

The engine is organised around a single rule, stated at the top of
[`crates/gvui/src/lib.rs`](../crates/gvui/src/lib.rs):

> **Constraints flow forward. Nothing is retried.**

Every phase produces a result that is already correct with respect to the constraints its
successors cannot repair. There is no outer optimisation loop, no rip-up-and-reroute, no
"expand the gap and try again". Two consequences do most of the work:

1. **An edge label is an item in the layered graph**, carrying its measured box. Badge space is
   therefore allocated by the same machinery that separates nodes. A badge cannot fail to fit, so
   there is nothing to retry.
2. **Routing lane demand is computed from the fixed ordering before any geometry exists**, by
   interval-graph colouring, and is fed into node separation as a hard lower bound. One pass,
   exact, no pathfinding.

Everything else in these docs is a consequence of those two sentences.

---

## What a layout looks like

A layered drawing of a six-node graph, with one labelled edge:

```text
                        ┌──────────────┐
              rank 0     │   ingest     │
                        └──────┬───────┘
                               │
              ─────────────────┼──────────────────  routing channel
                          ┌────┴────┐
                          │         │
                    ┌─────▼────┐  ┌─▼────────┐
              rank 1 │ validate │  │  reject  │
                    └─────┬────┘  └──────────┘
                          │
                       ┌──┴───────────┐
              rank 2   │ [ retry x3 ] │   ← the label is an ITEM: it owns a rank
                       └──┬───────────┘      and is separated like a node
                          │
                    ┌─────▼────┐
              rank 3 │  persist │
                    └──────────┘
```

The badge `[ retry x3 ]` is not painted on top of the finished picture and nudged until it stops
overlapping something. It occupied a box on rank 2 before any coordinate existed.

---

## Documentation map

| Section | What it covers |
| --- | --- |
| [`engine/`](./engine/README.md) | The layered pipeline, phase by phase. The main body of the docs. |
| [`modes/`](./modes/README.md) | The four layout engines and the six selectable modes. |
| [`concepts/`](./concepts/README.md) | Cross-cutting ideas referenced by several chapters. |
| [`planning/layout-engine-v2/`](./planning/layout-engine-v2/README.md) | The design record: diagnosis of the previous engine, the architecture decision, and the measured results. |

### The engine chapters

| Chapter | Topic |
| --- | --- |
| [01](./engine/01-foundations.md) | Foundations — nodes, edges, directed graphs, cycles, from zero |
| [02](./engine/02-the-pipeline.md) | The pipeline — the ten phases and why the order is forced |
| [03](./engine/03-ingest-and-measurement.md) | Ingest and measurement — text becomes boxes, ids become indices |
| [04](./engine/04-structure.md) | Structure — SCC decomposition, feedback arcs, making the graph acyclic |
| [05](./engine/05-rank-assignment.md) | Rank assignment — network simplex, minimum lengths, balancing |
| [06](./engine/06-layering-and-labels.md) | Layering and labels — dummy chains, and the label as a first-class item |
| [07](./engine/07-crossing-minimization.md) | Crossing minimization — median sweeps, transpose, exact counting |
| [08](./engine/08-routing-demand.md) | Routing demand — interval-graph colouring before any geometry exists |
| [09](./engine/09-coordinate-assignment.md) | Coordinate assignment — rank bands and Brandes–Köpf |
| [10](./engine/10-edge-routing.md) | Edge routing — lanes to polylines, ports, badges |
| [11](./engine/11-emit-and-quality.md) | Emit and quality — packing, constraint checks, metrics |

### The modes

| Chapter | Topic |
| --- | --- |
| [01](./modes/01-layered.md) | Layered — the full pipeline; covers the `layered`, `layered-spline` and `left-right` modes |
| [02](./modes/02-organic.md) | Organic — stress majorization by SGD, then overlap removal |
| [03](./modes/03-radial.md) | Radial — concentric BFS rings with proportional wedges |
| [04](./modes/04-grid.md) | Grid — row-major placement in input order; the debug mode |

### The concepts

| Document | Topic |
| --- | --- |
| [Sugiyama framework](./concepts/sugiyama-framework.md) | The classical four-phase method, and where this engine departs from it |
| [Node measurement](./concepts/node-measurement.md) | How text becomes a box, and why estimating from character counts fails |
| [Determinism](./concepts/determinism.md) | Why the same input must always draw identically, and the rules that make it so |
| [Quality model](./concepts/quality-model.md) | Constraints are asserted, metrics are reported, and nothing is optimised |
| [Computational complexity](./concepts/computational-complexity.md) | Per-phase and per-mode cost, with measured figures |

---

## Six modes, four engines

`mode` selects an engine; `direction` is an independent configuration knob. The six values of the
`LayoutMode` union in [`src/state/useGraphStore.ts`](../src/state/useGraphStore.ts) map onto four
engines:

| mode | engine | direction | notes |
| --- | --- | --- | --- |
| `layered` | layered | `top-down` | The default. Orthogonal lane routing. |
| `layered-spline` | layered | `top-down` | Identical geometry; the renderer draws smooth curves instead of rounded corners. |
| `left-right` | layered | `left-right` | The same pipeline with every box transposed on the way in and the result transposed on the way out. |
| `organic` | organic | — | Stress majorization. For meshes with no strong flow direction. |
| `radial` | radial | — | Concentric rings around a root. For strongly centralized graphs. |
| `grid` | grid | — | Row-major in input order. Consults no topology at all. |

Legacy mode strings (`top-down`, `top-down-dagre`, `force`, `stress`, `right-left`, …) are still
accepted and normalized; see `normalizeLayoutMode`. There is no dagre in the build — the dependency
was removed with the v2 rewrite, and `top-down-dagre` now resolves to the layered engine.

---

## Start here

If you are new to this codebase, read in this order:

1. [`engine/01-foundations.md`](./engine/01-foundations.md) — the vocabulary. Skip only if you
   already know what a DAG and an edge crossing are.
2. [`engine/02-the-pipeline.md`](./engine/02-the-pipeline.md) — the ten phases on one page. After
   this you can read any later chapter out of order.
3. [`concepts/sugiyama-framework.md`](./concepts/sugiyama-framework.md) — the classical method the
   pipeline is a variant of, and the three places it deliberately differs.
4. [`engine/06-layering-and-labels.md`](./engine/06-layering-and-labels.md) and
   [`engine/08-routing-demand.md`](./engine/08-routing-demand.md) — the two chapters that carry the
   organizing idea. If you only read two, read these.
5. [`modes/README.md`](./modes/README.md) — when to reach for something other than layered.

If you are here to change behaviour rather than to understand it, start instead with
[`concepts/quality-model.md`](./concepts/quality-model.md): it tells you which properties are
guaranteed (and so are bugs when violated) and which are merely measured.

---

## Measured comparison

The layout engine was rewritten (v1 → v2). Both versions were measured on the same machine, in
native `--release`, over the same eight datasets in `public/data/graphs/`. The full tables are in
[`planning/layout-engine-v2/00-diagnosis.md`](./planning/layout-engine-v2/00-diagnosis.md) (v1) and
[`planning/layout-engine-v2/06-results.md`](./planning/layout-engine-v2/06-results.md) (v2).

Two datasets, as the headline:

| dataset | N | E | v1 | v2 | v1 valid | v2 valid |
| --- | ---: | ---: | ---: | ---: | :--: | :--: |
| `kubernetes_cluster_topology` | 12 | 13 | 26,710 ms | **0.14 ms** | ✓ | ✓ |
| `dense_kubernetes_mesh` | 30 | 45 | 47,336 ms | **1.79 ms** | ✗ | ✓ |

On the dense mesh the crossing count also fell from 191 to 28, and the layout went from failing its
own validity check to passing it.

**Method, so the numbers can be read honestly:**

- Native `--release` on Apple Silicon, timing the whole `compute_layout` call. Reproduce with:

  ```sh
  cargo run --release --manifest-path crates/gvui/Cargo.toml --example audit
  ```

- The v1 figures come from a harness that invoked the same pipeline phases directly; the repo was
  not modified to obtain them (method recorded at the bottom of `00-diagnosis.md`).
- The audit runs 5 engines × 8 datasets = 40 combinations. All 40 are valid, deterministic, and
  under the harness's 50 ms per-fixture budget; the slowest is 1.88 ms.
- **Native release is the optimistic bound.** WASM in a browser will be meaningfully slower and has
  not been measured. That is a recorded open gap, not an oversight.

The speedup is not a micro-optimisation result. v1 spent 99.5 %+ of its time running A\* over a
~5,000-vertex routing grid, once per edge, inside a search loop that evaluated 4–8 states. v2 has
no routing grid, no A\*, and no search loop; routing is a table lookup over lanes that were already
counted. See [`concepts/computational-complexity.md`](./concepts/computational-complexity.md) for
the per-phase accounting.

---

## Where the code is

| Path | Contents |
| --- | --- |
| [`crates/gvui/src/lib.rs`](../crates/gvui/src/lib.rs) | The phase table and the WASM entry point |
| [`crates/gvui/src/0_common/`](../crates/gvui/src/0_common/) | Shared types, config, geometry, ingest |
| [`crates/gvui/src/1_cycle_breaking/`](../crates/gvui/src/1_cycle_breaking/) | Phase 2 — structure |
| [`crates/gvui/src/2_rank_assignment/`](../crates/gvui/src/2_rank_assignment/) | Phase 3 — ranks |
| [`crates/gvui/src/3_crossing_minimization/`](../crates/gvui/src/3_crossing_minimization/) | Phases 4 and 5 — layering and ordering |
| [`crates/gvui/src/4_coordinate_assignment/`](../crates/gvui/src/4_coordinate_assignment/) | Phases 6 and 7 — demand and coordinates |
| [`crates/gvui/src/5_edge_routing/`](../crates/gvui/src/5_edge_routing/) | Phase 8 — routes, ports, badges |
| [`crates/gvui/src/6_validation/`](../crates/gvui/src/6_validation/) | Phase 9 — constraints, metrics, emit |
| [`crates/gvui/src/7_engines/`](../crates/gvui/src/7_engines/) | The four engines and the dispatch facade |
| [`src/engine/layout/measurement/`](../src/engine/layout/measurement/) | The measurement boundary — the only code that sees text |
| [`crates/gvui/examples/audit.rs`](../crates/gvui/examples/audit.rs) | The native audit harness |
