← [Docs Index](../README.md) | [Index](./README.md) | [Next: Layered →](./01-layered.md)

# Layout Modes

GVUI ships **two layout engines**, and they are the two user-visible modes: **`layered`** and
**`radial`**. This section explains what each one draws, when it is the right answer, and what it
costs. The layered pipeline itself — the nine phases that produce a hierarchical drawing — is
documented separately in [docs/engine/](../engine/README.md); this section is about *choosing an
engine*, and about the one engine that does not use that pipeline at all.

The dispatch is one function, [`compute_layout`](../../crates/gvui/src/7_engines/7_5_facade.rs), and
one two-arm `match`. There is no fallback chain: a mode either draws your graph or the graph was
empty.

Flow direction is **not** part of the mode. Neither is edge rendering. Both used to be half-encoded
in the mode string, and both are now independent axes you set alongside the mode. That split is the
main change in v3 and it is covered below.

---

## The two modes

| Mode | Engine | Good for | Bad for |
| --- | --- | --- | --- |
| **`layered`** (default) | Sugiyama pipeline, orthogonal lane routing | Pipelines, system designs, sagas, decision trees, state machines — anything whose edges mean *before → after* | Dense meshes with no direction; wide flat fan-outs |
| **`radial`** | Concentric BFS rings, proportional wedges | Ego networks ("what depends on X"), taxonomies, single-root hierarchies | Multi-root graphs; graphs whose edges mostly do not belong to any spanning tree |

Two chapters follow, one per mode:

1. [Layered](./01-layered.md) — `direction` as a change of coordinate frame, and the five edge
   styles including octilinear.
2. [Radial](./02-radial.md) — polar coordinates, concentric rings, proportional wedge allocation.

---

## `direction` is an independent axis

`direction` is the **only** source of flow direction, and it applies only to the layered engine. It
is declared in [the config](../../crates/gvui/src/0_common/0_2_config.rs) and mirrored in
[the TypeScript config](../../src/engine/layout/custom/config.ts).

| value | ranks increase | reads as |
| --- | --- | --- |
| `top-down` (default) | downward | a flowchart |
| `bottom-up` | upward | a dependency tree, roots at the bottom |
| `left-right` | rightward | a timeline or swimlane |
| `right-left` | leftward | a timeline for a right-to-left script |

```text
   top-down          bottom-up          left-right              right-left

    ┌───┐              ┌───┐                                    ┌───┐  ┌───┐  ┌───┐
    │ A │              │ C │            ┌───┐ ┌───┐ ┌───┐       │ C │◀─│ B │◀─│ A │
    └─┬─┘              └─▲─┘            │ A │▶│ B │▶│ C │       └───┘  └───┘  └───┘
    ┌─▼─┐              ┌─┴─┐            └───┘ └───┘ └───┘
    │ B │              │ B │
    └─┬─┘              └─▲─┘            rank 0  1     2         rank  2      1      0
    ┌─▼─┐              ┌─┴─┐
    │ C │              │ A │
    └───┘              └───┘
   rank 0,1,2         rank 2,1,0
```

### Why this used to be broken

Until v3, direction was *also* encoded in the mode string: `left-right`, `bottom-up` and
`right-left` were "modes". The client sends a **fully resolved** config, so `direction` was always
present, and the resolution rule was "an explicit direction wins over the one implied by the mode".
The mode's direction was therefore discarded on every single call, and picking `left-right` silently
drew a top-down graph.

The fix is structural rather than a patched precedence rule:
[`EngineMode::from_mode_str`](../../crates/gvui/src/0_common/0_2_config.rs) no longer returns a
direction at all. There is nothing left to reconcile, so the two cannot disagree.

Old mode strings still resolve, from a bookmark or from `localStorage`:

| stored string | engine | direction recovered |
| --- | --- | --- |
| `layered`, `top-down`, `top-down-dagre`, `layered-spline` | Layered | — (config default) |
| `bottom-up` | Layered | `bottom-up` |
| `left-right` | Layered | `left-right` |
| `right-left` | Layered | `right-left` |
| `organic`, `force`, `stress`, `grid` | Layered | — |
| `radial` | Radial | — |
| anything else | Layered | — |

Both halves are needed and they live in different places. The Rust side
([`from_mode_str`](../../crates/gvui/src/0_common/0_2_config.rs)) maps the string onto an engine.
The client side ([`useGraphStore.ts`](../../src/state/useGraphStore.ts)) additionally maps it back
onto a `direction` through `directionFromLegacyLayoutMode`, because a persisted viewport stores only
the mode — never the config — so a user who saved `left-right` would otherwise come back to a
top-down drawing. `normalizeLayoutMode` alone is not enough; `setLayoutMode` does both.

Only the three non-default flows appear in that recovery map. Mapping `top-down` too would overwrite
a deliberate user choice with the value they would have got anyway.

## `edgeStyle` is an independent axis too

`layered-spline` was never an engine. It was the layered engine with the renderer emitting a
different SVG path command through the same waypoints. It is now `edgeStyle: "spline"`, one of five
values — `orthogonal`, `rounded`, `spline`, `octilinear`, `straight` — described in
[01-layered §edge_style](./01-layered.md#edge_style).

Four of the five are pure rendering and cost no re-layout. `octilinear` is the exception: it changes
the emitted waypoints, because the chamfer happens in Rust.

---

## Measured cost

Every dataset in `public/data/graphs/` against every engine, native `--release`:

```sh
cargo run --release --manifest-path crates/gvui/Cargo.toml --example audit
```

`layered`, `left-right` and `bottom-up` in the audit are all the **same engine** with a different
`direction`; they are listed separately because direction is the axis most likely to change a
result. `cross` is the combinatorial crossing count (order inversions between adjacent ranks) and
`geo` is the geometric one (emitted polylines actually intersected).

| dataset | N | E | engine | ms | ranks | cross | geo | bends | leaders |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `ai_agent_trace` | 12 | 16 | layered | 0.66 | 17 | 0 | 0 | 28 | 0 |
| | | | radial | 0.13 | — | — | 5 | 5 | 0 |
| `deep_release_pipeline` | 14 | 13 | layered | 0.10 | 27 | 0 | 0 | 0 | 0 |
| | | | radial | 0.09 | — | — | 0 | 0 | 0 |
| `fanout_fanin_scatter_gather` | 17 | 30 | layered | 0.20 | 5 | 0 | 82 | 56 | 0 |
| | | | radial | 0.19 | — | — | 52 | 14 | 0 |
| `feedback_retry_state_machine` | 10 | 17 | layered | 0.65 | 15 | 2 | 2 | 44 | 0 |
| | | | radial | 0.09 | — | — | 10 | 6 | 1 |
| `heavy_label_data_contracts` | 6 | 6 | layered | 0.06 | 9 | 0 | 0 | 4 | 0 |
| | | | radial | 0.03 | — | — | 0 | 1 | 0 |
| `long_span_bypass_network` | 10 | 14 | layered | 0.57 | 19 | 3 | 5 | 34 | 0 |
| | | | radial | 0.08 | — | — | 2 | 4 | 0 |
| `microservice_platform_topology` | 18 | 31 | layered | 1.17 | 17 | 14 | 22 | 108 | 0 |
| | | | radial | 0.20 | — | — | 30 | 14 | 0 |
| `multi_component_tenants` | 12 | 12 | layered | 0.12 | 7 | 0 | 0 | 24 | 0 |
| | | | radial | 0.08 | — | — | 4 | 9 | 0 |
| `parallel_bundle_transports` | 5 | 14 | layered | 0.11 | 9 | 0 | 8 | 56 | 0 |
| | | | radial | 0.06 | — | — | 0 | 2 | 4 |
| `peer_mesh_service_registry` | 8 | 22 | layered | 0.51 | 7 | 9 | 29 | 78 | 0 |
| | | | radial | 0.11 | — | — | 12 | 15 | 2 |

Ten datasets × four engine/direction combinations = **40 fixtures, all valid, all deterministic
across processes**, slowest **1.17 ms** against a 50 ms budget. For comparison the v1 engine took
**47,336 ms** on a 30-node mesh and emitted a drawing that failed validation
([00-diagnosis.md](../planning/layout-engine-v2/00-diagnosis.md)).

Radial reports no *combinatorial* crossing count because it has no layered graph to count order
inversions in; the number in the `geo` column is the only one it can honestly produce. Reporting 0
there would fake a perfect score. See [the quality model](../concepts/quality-model.md).

Two things in that table are worth reading carefully:

- **`bottom-up` is metric-identical to `top-down` on all ten datasets** — same ranks, same crossings,
  same bends — so it is omitted above. That is the correct outcome: `bottom-up` is a *mirror of the
  output*, and a mirror cannot change how many times two lines cross.
- **`left-right` is not.** It transposes every input box, so the rank balancer legitimately reaches a
  different conclusion. See [01-layered](./01-layered.md#lr-and-td-do-not-produce-mirror-image-quality).

---

## Choosing a mode

### Does the graph have a direction?

This is the only question that matters. Everything else is taste.

A graph has a direction when its edges mean *before → after*, *causes*, *depends on*, *calls*. A
graph has no direction when its edges mean *is related to*, *talks to*, *is near*. The layered
engine is built entirely around the first meaning: it assigns every node an integer rank and draws
rank $r$ above rank $r+1$. If your edges do not mean anything by pointing, that structure is a
fiction the drawing has to pay for.

**Heuristic worth offering to a user, but not imposing:** if the forward DAG is fewer than **3**
levels deep while the graph has more than **a dozen** nodes, there is no meaningful hierarchy to
show. Everything lands in two or three enormous rows and the ordering phase is being asked to
untangle a mesh with an algorithm that only ever compares adjacent ranks.

The converse is also worth saying: a graph *with* depth should stay layered even when it is dense.
`long_span_bypass_network` is 10 nodes over 19 ranks; it is tangled, but the depth is real.

### Is there a single node the reader cares about?

That is radial's question. Radial does not draw flow; it draws *neighbourhood*. If the useful
sentence about the graph is "what does X touch, and what do those touch", radial says it in one
picture and layered does not.

Radial's failure mode is visible in the table above: `microservice_platform_topology` costs it 30
geometric crossings against layered's 22, because most of that graph's edges are not in any spanning
tree and every one of them becomes a chord across the rings.

---

## Guarantees, by engine

Not every engine promises the same things, and pretending otherwise makes the quality gate useless.

| property | `layered` | `radial` |
| --- | --- | --- |
| every node positioned, every edge routed | guaranteed | guaranteed |
| deterministic across processes | guaranteed | guaranteed |
| no two node boxes overlap | guaranteed | guaranteed (an exact scan-line pass closes whatever the push-apart relaxation leaves) |
| no edge crosses through a node box | guaranteed — a lane is reserved for every segment | **best-effort** — a straight chord between two boxes may graze a third |
| no badge overlaps a node or another badge | guaranteed — the label is an item in the layered graph | **best-effort** — reported, and announced with a leader line |

A violation of a guaranteed property is a bug and fails the audit. A violation of a best-effort
property is a quality metric on a drawing that never promised otherwise. Both are reported; only the
first is an error. The reasoning is in
[06-results.md §4d](../planning/layout-engine-v2/06-results.md).

Radial's best-effort halves are not theoretical. Across the ten datasets it records **9 edge–node
penetrations, 1 badge–node overlap, 7 badge–badge overlaps and 7 leader lines**; layered records
**zero of each**. The breakdown is in [02-radial §6](./02-radial.md#6-badges). None of those fail the
audit, and that is the point of the distinction — radial never promised them.

---

## What was removed in v3, and what it cost

Four modes were deleted. Three of the deletions were cheap; one was not, and pretending otherwise
would make this page useless.

**`layered-spline` → `edgeStyle: "spline"`.** Free. It was never a separate engine — same
`layout_layered` call, same node geometry, different SVG path command. Keeping it as a mode meant
the mode list implied a choice that did not exist.

**`left-right` (and `bottom-up`, `right-left`) → `direction`.** Not merely free but a bug fix; see
above. These were the same engine and the mode string's copy of the direction was being thrown away.

**`grid` — removed because it collided.** Grid placed nodes row-major in input order and drew
straight centre-to-centre lines. It never looked at an edge, so on anything past a handful of nodes
the lines ran straight through the boxes. It was useful as a "just show me the data" debug view and
nothing else, and it was reachable from the same menu as the modes that actually draw a graph.

**`organic` — removed because its purpose was unclear, and this is the real trade-off.** Organic was
a genuine stress-majorization engine: SGD on a stress objective, then overlap removal. On the v2
audit set it measured **8 geometric crossings on `dense_kubernetes_mesh` against layered's 28** —
because that graph has no real flow direction, and forcing a mesh into ranks costs crossings that a
free 2-D placement simply does not pay.

Removing it means **mesh-shaped graphs are now drawn by an engine that is structurally wrong for
them.** That is not a footnote. Nothing in the current line-up recovers that 8; radial is not a
substitute, because radial is a tree layout and a mesh has no tree. The present-day echo of the same
gap is `peer_mesh_service_registry`, where layered emits 29 geometric crossings and 78 bends on 8
nodes.

The decision was the user's and it was made on the grounds that a mode nobody knows when to pick is
worse than no mode. It is recorded here rather than buried so that it stays reversible: the engine is
in git history, its shared helpers survive in
[`7_2_geometric_common.rs`](../../crates/gvui/src/7_engines/7_2_geometric_common.rs) (radial uses
them), and the reasoning is in
[the v3 plan](../planning/layout-engine-v3/README.md).

**Presets went too.** The settings panel is now just "Settings" and exposes every field of
`CustomLayoutConfig` directly — Layout, Edges, Labels, Algorithms, Budgets. A preset is a saved point
in a config space; once the whole space is one panel away, the preset is a shortcut to somewhere the
user can already see.

The test material was replaced along with the modes: ten sample graphs chosen to exercise real
structure (deep hierarchy, wide fan-out, peer mesh, multiple components, long spans, heavy labels,
parallel bundles), and **26** graph-testing scenarios after the empty and single-node ones were
dropped. Every scenario and every dataset must produce zero constraint violations.

---

Related reading: [the engine pipeline](../engine/README.md),
[node measurement](../concepts/node-measurement.md),
[determinism](../concepts/determinism.md),
[the quality model](../concepts/quality-model.md),
[computational complexity](../concepts/computational-complexity.md).

---

← [Docs Index](../README.md) | [Index](./README.md) | [Next: Layered →](./01-layered.md)
