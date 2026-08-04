# Layout Engine v2 — Strategy

Planning documents for a from-scratch redesign of the GVUI graph layout engine.
**Design phase only.** No implementation is proposed here beyond sequencing.

| Doc | Contents |
| --- | --- |
| [00-diagnosis.md](./00-diagnosis.md) | Measured behaviour of the current engine; root causes; confirmed defects |
| [01-architecture.md](./01-architecture.md) | The three principles, the phase pipeline, the data model |
| [02-algorithms.md](./02-algorithms.md) | Per-phase algorithm specification |
| [03-modes.md](./03-modes.md) | The mode taxonomy and the non-hierarchical engines |
| [04-config-and-quality.md](./04-config-and-quality.md) | Settings surface, quality model, diagnostics |
| [05-roadmap.md](./05-roadmap.md) | Sequencing, milestones, decision points |

---

## Executive summary

### What is actually wrong

The current engine is a **generate-and-test search over an expensive black box**. Each candidate
layout is scored by re-running the entire pipeline — cycle breaking, ranking, ordering, coordinates,
A\* edge routing on a ~5,000-vertex grid, badge backtracking, and O(E²) validation. Measured, native
release build, on the repo's own datasets:

| Dataset | Nodes | Edges | Custom engine | Crossings produced |
| --- | ---: | ---: | ---: | ---: |
| `decision_tree` | 5 | 4 | 67 ms | 0 |
| `crossing_mesh_10n_10e` | 10 | 10 | 1,571 ms | 3 |
| `kubernetes_cluster_topology` | 12 | 13 | **26,710 ms** | 2 |
| `dense_kubernetes_mesh` | 30 | 45 | **47,336 ms** | **191** (invalid) |

WASM in a browser is slower still. `GraphCanvas` sets a 30 s worker timeout and then falls back to
running *the same computation synchronously on the main thread* — so the two worst datasets are
guaranteed to time out and then freeze the tab.

**99.5 % of the time is edge routing.** Phase breakdown for `kubernetes_cluster_topology`:

```
cycle=0.18ms  rank+layergraph=0.03ms  crossmin=0.02ms  layer-opt=0.19ms  coord=0.16ms
ROUTE=4979ms  BADGE=6.0ms  VALIDATE=0.1ms
```

But routing is not slow because routing is hard. It is slow because **the combinatorial stages that
are supposed to make routing easy are not running at all.**

### The root cause, in one line

`evaluate_search_state` calls `assign_ranks(nodes, &active_edges, None)` — passing `None` where the
edge-role map belongs. With `None`, the ranker's fallback treats every edge as forward, including
the ones Eades just identified as cycle-closing. Nodes inside cycles never reach in-degree 0 in
Kahn's sort, never get ranked, and silently default to rank 0.

Measured effect on `dense_kubernetes_mesh` (30 nodes, 45 edges):

```
ENGINE TODAY   assign_ranks(.., None)        ->  2 ranks | r0:28  r1:2
ROLE-AWARE     assign_ranks(.., Some(roles)) ->  8 ranks | r0:6 r1:3 r2:4 r3:6 r4:4 r5:3 r6:2 r7:2
```

Twenty-eight of thirty nodes are placed in a single row. Forty-five edges then have to snake
between them. That is where 191 crossings and 20 seconds of futile A\* come from — the router is
being asked to repair damage done four stages earlier.

Compounding it: `build_layer_graph` inserts **only** `EdgeRole::Forward` edges into the adjacency
maps, so feedback and cross edges are invisible to ordering. The crossing count the ordering stage
optimizes is therefore **0 on all eight datasets**, and `minimize_crossings` early-returns before
doing any work. *The crossing-minimization stage has never executed in production.*

Fifteen further confirmed defects are catalogued in [00-diagnosis.md](./00-diagnosis.md).

### The redesign, in one idea

> **Constraints flow forward. Nothing is retried.**

The current engine discovers that a badge does not fit, then expands a gap, then re-runs everything.
The new engine **reserves the badge's space before routing exists**, by making every edge label a
first-class node in the layered graph carrying its measured width and height. The ordering stage
orders it, the coordinate stage separates it, the rank-height stage makes room for it. The space is
allocated by construction, so *it cannot fail to fit, so there is nothing to retry*.

The same inversion applies to routing. Once the ordering is fixed, you know exactly which edges
traverse which inter-rank channel and which intra-rank corridor — pure combinatorics, computable
before any geometry exists. Lane counts come from **interval-graph colouring** (optimal, greedy,
O(k log k)), and those counts feed into node separations *before* coordinates are assigned. One
pass, exact, no iteration. Grid A\* disappears entirely.

### Target

| | Today | Target |
| --- | --- | --- |
| 12 n / 13 e | 26,710 ms | **< 5 ms** |
| 30 n / 45 e | 47,336 ms, invalid | **< 10 ms**, valid |
| 200 n / 400 e | does not complete | **< 25 ms** |

This is not a 2× optimization. It is roughly three orders of magnitude, and it comes from deleting
the search, not from tuning it. Aesthetic quality goes *up* at the same time, because lane-based
orthogonal routing produces the parallel, bus-like structure that hand-drawn diagrams have and that
per-edge A\* on a dense grid can never produce.

### What stays

The phase decomposition (`0_common` … `6_validation`), the Rust/WASM boundary, the worker
architecture, the developer settings panel, and the JSON input contract are all sound and are kept.
This is a replacement of the algorithms inside the phases and of the control flow between them — not
a rewrite of the application.

---

## Evidence

All figures above are from a native `--release` harness built against a copy of `crates/gvui`
(the repo was not modified). Reproduction notes are in
[00-diagnosis.md § Reproducing the measurements](./00-diagnosis.md#reproducing-the-measurements).
