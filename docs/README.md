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
| [`modes/`](./modes/README.md) | The two layout engines, and the `direction` axis that is orthogonal to them. |
| [`concepts/`](./concepts/README.md) | Cross-cutting ideas referenced by several chapters. |
| [`planning/layout-engine-v2/`](./planning/layout-engine-v2/README.md) | The design record: diagnosis of the previous engine, the architecture decision, and the measured results. |
| [`planning/layout-engine-v3/`](./planning/layout-engine-v3/README.md) | The v3 pass: what the drawing looked wrong about, and what each fix cost. |
| [`planning/layout-engine-v4/`](./planning/layout-engine-v4/README.md) | The v4 pass: 148 geometric crossings down to 40, and the measured case against using all four node sides. |

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
| [01](./modes/01-layered.md) | Layered — the full pipeline, and the four values of `direction` it draws in |
| [03](./modes/02-radial.md) | Radial — concentric BFS rings with proportional wedges |

### The concepts

| Document | Topic |
| --- | --- |
| [Sugiyama framework](./concepts/sugiyama-framework.md) | The classical four-phase method, and where this engine departs from it |
| [Node measurement](./concepts/node-measurement.md) | How text becomes a box, and why estimating from character counts fails |
| [Determinism](./concepts/determinism.md) | Why the same input must always draw identically, and the rules that make it so |
| [Quality model](./concepts/quality-model.md) | Constraints are asserted, metrics are reported, and nothing is optimised |
| [Computational complexity](./concepts/computational-complexity.md) | Per-phase and per-mode cost, with measured figures |

---

## Two engines, one direction axis

`mode` selects an engine. `direction` selects the flow, independently of the engine. The
`LayoutMode` union in [`src/state/useGraphStore.ts`](../src/state/useGraphStore.ts) has exactly two
values, and [`EngineMode`](../crates/gvui/src/0_common/0_2_config.rs) mirrors them:

| mode | engine | honours `direction` | notes |
| --- | --- | :--: | --- |
| `layered` | the full pipeline in [`engine/`](./engine/README.md) | yes | The default. Orthogonal lane routing, badge space reserved in the layered graph, routing that cannot fail. |
| `radial` | concentric BFS rings with proportional wedges | no | Rings have no flow axis, so `direction` is ignored. Straight edges between boxes; edge–node grazing and badge overlap are best-effort, not guaranteed absent. See [the quality model](./concepts/quality-model.md#the-per-engine-constraint-policy). |

### `direction`

The edge `a → b`, drawn four ways:

```text
   top-down (default)      bottom-up          left-right        right-left

        [ a ]                [ b ]                              [ b ]◀──[ a ]
          │                    ▲            [ a ]──▶[ b ]
          ▼                    │
        [ b ]                [ a ]
```

| `direction` | ranks increase | how the pipeline gets there |
| --- | --- | --- |
| `top-down` | downward | the native frame; nothing is transformed |
| `bottom-up` | upward | mirrored along the rank axis on the way out |
| `left-right` | rightward | every box transposed on the way in, the drawing transposed on the way out |
| `right-left` | leftward | transposed, then mirrored |

`direction` being the **only** source of flow direction is a v3 correction, not a refactor. Flow
used to be half-encoded in the mode string as well (`left-right`, `right-left`, `bottom-up` were
"modes"), and because the client sends a *fully resolved* config, `direction` was always present and
the "explicit direction wins over mode" rule discarded the mode's direction every single time.
Choosing `left-right` silently drew top-down. `EngineMode::from_mode_str` now returns no direction
at all.

### `edgeStyle`

`layered-spline` was never a separate engine — it was the layered pipeline with a different
renderer. It is now a value of `edgeStyle`, which changes how a finished polyline is drawn and never
changes where anything is placed:

| `edgeStyle` | what it draws |
| --- | --- |
| `rounded` (default) | axis-aligned polyline, corners rounded to `cornerRadius` |
| `orthogonal` | the same polyline with sharp corners |
| `spline` | a smooth cubic through the chain waypoints |
| `octilinear` | each right-angle corner replaced by a 45° chamfer where the diagonal is collision-free — a post-pass, not a router. [Why](./engine/10-edge-routing.md) |
| `straight` | source to target, clipped to the node boundaries |

Legacy mode strings (`top-down`, `top-down-dagre`, `force`, `stress`, `right-left`, `organic`,
`grid`, `layered-spline`, …) are still accepted and normalized onto the surviving two engines; see
`normalizeLayoutMode`, and `directionFromLegacyLayoutMode` for the three that also carried a
direction worth recovering. There is no dagre in the build — the dependency was removed with the v2
rewrite, and `top-down-dagre` resolves to the layered engine.

The `organic` (stress majorization) and `grid` engines were **deleted** in v3. The shared helpers
they used — free box placement, overlap removal, straight-line routing, best-effort badge placement
— live in
[`7_engines/7_2_geometric_common.rs`](../crates/gvui/src/7_engines/7_2_geometric_common.rs), which
radial still uses. One measurement is recorded against the deletion rather than buried: on the old
`dense_kubernetes_mesh` fixture, organic drew 8 crossings against layered's 28, because that graph
has no real flow direction. The reasoning and the numbers are in
[`planning/layout-engine-v3/`](./planning/layout-engine-v3/README.md); the code is in git history.

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
5. [`engine/10-edge-routing.md`](./engine/10-edge-routing.md) — where the drawing stops being
   combinatorics and starts being lines. Port sides, straight-shot alignment, flat edges,
   octilinear. Almost everything v3 changed is in this chapter.
6. [`modes/03-radial.md`](./modes/02-radial.md) — the one case where layered is not the answer.

Two shortcuts for specific errands:

- **Changing behaviour rather than understanding it?** Start with
  [`concepts/quality-model.md`](./concepts/quality-model.md): it tells you which properties are
  guaranteed (and so are bugs when violated) and which are merely measured, and which of the two
  engines promises which.
- **Wondering why a setting exists?** Every field of `CustomLayoutConfig` is documented at its
  declaration in
  [`crates/gvui/src/0_common/0_2_config.rs`](../crates/gvui/src/0_common/0_2_config.rs), and the
  Settings panel exposes all of them. There are no presets: a preset is a named point in a space
  the user cannot see, and the space is small enough to show.

---

## Measured comparison

The layout engine was rewritten (v1 → v2). Both versions were measured on the same machine, in
native `--release`, over the same eight datasets. The full tables are in
[`planning/layout-engine-v2/00-diagnosis.md`](./planning/layout-engine-v2/00-diagnosis.md) (v1) and
[`planning/layout-engine-v2/06-results.md`](./planning/layout-engine-v2/06-results.md) (v2). Those
eight fixtures were replaced in v3 by ten harder ones, so the dataset names below no longer exist in
`public/data/graphs/`; they are kept here because the comparison is only meaningful run-for-run on
identical input.

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
- **Native release is the optimistic bound.** WASM in a browser will be meaningfully slower and has
  not been measured. That is a recorded open gap, not an oversight.

The speedup is not a micro-optimisation result. v1 spent 99.5 %+ of its time running A\* over a
~5,000-vertex routing grid, once per edge, inside a search loop that evaluated 4–8 states. v2 has
no routing grid, no A\*, and no search loop; routing is a table lookup over lanes that were already
counted. See [`concepts/computational-complexity.md`](./concepts/computational-complexity.md) for
the per-phase accounting.

**v3 changed none of that.** Every v3 change was aesthetic or usability — badge placement, port-side
choice, flat peer edges, octilinear corners, two modes instead of six, a Settings panel instead of
presets. Nothing was added to the hot path: the whole of v3's routing work is closed-form scoring
and polyline post-passes, and the slowest fixture in the native audit is 1.16 ms against the same
50 ms budget. What did change is the gate. It is now **108 fixture/mode runs with 0 failures** —
three mode/direction cases (`layered`/`top-down`, `layered`/`left-right`, `radial`) across 26
graph-testing scenarios and the 10 datasets in `public/data/graphs/`, run through the real WASM
build by [`scripts/runLayoutAudit.ts`](../scripts/runLayoutAudit.ts). The native harness covers 4
cases × the same 10 datasets = 40 combinations, all valid, all deterministic, all under budget. Zero
constraint violations is a pass condition, not a reported number.

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
| [`crates/gvui/src/7_engines/`](../crates/gvui/src/7_engines/) | The two engines, the shared geometric helpers, and the dispatch facade |
| [`src/engine/layout/measurement/`](../src/engine/layout/measurement/) | The measurement boundary — the only code that sees text |
| [`crates/gvui/examples/audit.rs`](../crates/gvui/examples/audit.rs) | The native audit harness — 4 mode/direction cases × 10 datasets |
| [`scripts/runLayoutAudit.ts`](../scripts/runLayoutAudit.ts) | The WASM regression gate — 3 cases × (26 scenarios + 10 datasets) = 108 runs |
