← [Docs Index](../README.md) | [Index](./README.md) | [Next: Layered →](./01-layered.md)

# Layout Modes

GVUI ships **five layout engines** behind **six user-visible modes**. This section explains what
each one draws, when it is the right answer, and what it costs. The layered pipeline itself — the
nine phases that produce a hierarchical drawing — is documented separately in
[docs/engine/](../engine/README.md); this section is about *choosing between engines*, and about the
three geometric engines that do not use that pipeline at all.

The dispatch is one function, [`compute_layout`](../../crates/gvui/src/7_engines/7_5_facade.rs), and
one `match`. There is no fallback chain: a mode either draws your graph or the graph was empty.

---

## The six modes

Six modes, five engines. `left-right` is not an engine — it is the layered engine with the input
boxes transposed (see [01-layered](./01-layered.md)) — and `layered-spline` produces *byte-identical
geometry* to `layered`, differing only in the SVG path command the renderer emits.

| Mode | Engine | Good for | Bad for |
| --- | --- | --- | --- |
| **`layered`** (default) | Layered pipeline, orthogonal lane routing | Pipelines, system designs, sagas, decision trees, state machines — anything with a real flow direction | Dense meshes with no direction; wide flat fan-outs |
| **`layered-spline`** | Same layout, splined rendering | Same as `layered`, softer look; presentations | Same as `layered`; the smoothing can hide which lane an edge is in |
| **`left-right`** | Layered pipeline on the transposed problem | Wide flows, timelines, org charts, "swimlane" reading order | Deep hierarchies — a 19-rank graph becomes a 19-screen-wide drawing |
| **`organic`** | Stress majorization by SGD + overlap removal | Meshes, network topologies, undirected relationship maps, "what clusters with what" | Anything with a genuine flow direction — there is no up |
| **`radial`** | Concentric BFS rings, proportional wedges | Ego networks ("what depends on X"), taxonomies, single-root hierarchies | Multi-root graphs, graphs with many non-tree edges |
| **`grid`** | Row-major placement in input order | Debugging, inventory views, "just show me the data" | Reading structure of any kind — it never looks at an edge |

### Measured cost

All five engines on `dense_kubernetes_mesh` (30 nodes, 45 edges), native `--release`, from

```sh
cargo run --release --manifest-path crates/gvui/Cargo.toml --example audit
```

| engine | ms | crossings (combinatorial) | crossings (geometric) | bends | leader lines |
| --- | ---: | ---: | ---: | ---: | ---: |
| `layered` | 1.70 | 28 | 44 | 234 | 0 |
| `left-right` | 1.77 | 27 | 57 | 234 | 0 |
| `organic` | 0.41 | — | **8** | 0 | 18 |
| `radial` | 0.29 | — | 32 | 14 | 0 |
| `grid` | 0.24 | — | 99 | 0 | 23 |

The whole audit — 8 datasets × 5 engines = 40 combinations — has a slowest fixture of **1.77 ms**
against a 50 ms budget, and every combination is valid and byte-identical across processes. For
comparison, the v1 engine took **47,336 ms** on this same dataset and emitted 191 crossings in a
drawing that failed validation ([00-diagnosis.md](../planning/layout-engine-v2/00-diagnosis.md)).

The geometric engines report no *combinatorial* crossing count because they have no layered graph to
count order inversions in; the number reported is the geometric one, counted by actually
intersecting the emitted polylines. Reporting 0 there would fake a perfect score. See
[the quality model](../concepts/quality-model.md).

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
show. Everything lands in two or three enormous rows, every row is a wall of boxes, and the ordering
phase is being asked to untangle a mesh with an algorithm that only ever compares adjacent ranks.
That graph is an organic-mode candidate.

The converse is also worth saying: a graph *with* depth should stay layered even when it is dense.
`dense_kubernetes_mesh` ranks 15 deep. It is dense, but the depth is real.

### The argument for having a real stress engine

On `dense_kubernetes_mesh` — 45 edges, 13 of which are feedback edges pointing against the flow —
the two engines produce:

```
layered   28 crossings, 234 bends, 15 ranks     organic   8 crossings, 0 bends
```

**8 crossings against 28.** The layered engine is not doing badly here; it is doing the best that a
ranked drawing of this graph allows. The graph simply does not have a strong enough flow direction
to justify ranks, and forcing it into them costs crossings that a free 2-D placement does not pay.

That gap is the entire justification for the organic engine's existence. v1 also had an "organic"
mode — but it was a staggered grid that never looked at an edge (see
[02-organic](./02-organic.md)), so switching to it made a mesh *worse*, not better. There was no
mode a mesh could escape to.

### Guarantees, by engine

Not every engine promises the same things, and pretending otherwise makes the quality gate useless.

| property | `layered` / `left-right` | `organic` / `radial` / `grid` |
| --- | --- | --- |
| every node positioned, every edge routed | guaranteed | guaranteed |
| deterministic across processes | guaranteed | guaranteed |
| no two node boxes overlap | guaranteed | guaranteed |
| no edge crosses through a node box | guaranteed (a lane is reserved for every segment) | **best-effort** — these engines draw a straight line between two boxes by design |
| no badge overlaps a node or another badge | guaranteed (the label is an item in the layered graph) | **best-effort** — reported, and announced with a leader line |

A violation of a guaranteed property is a bug and fails the audit. A violation of a best-effort
property is a quality metric on a drawing that never promised otherwise. Both are reported; only the
first is an error. The reasoning is in
[06-results.md §4d](../planning/layout-engine-v2/06-results.md).

---

## Mode strings

The mode arrives from the client as a string and is resolved by
[`EngineMode::from_mode_str`](../../crates/gvui/src/0_common/0_2_config.rs). Legacy strings from
older clients and saved URLs still resolve, so a stale bookmark degrades to a sensible layout rather
than an error:

| string | engine | implied direction |
| --- | --- | --- |
| `layered`, `top-down`, `top-down-dagre` | Layered | `top-down` |
| `bottom-up` | Layered | `bottom-up` |
| `left-right` | Layered | `left-right` |
| `right-left` | Layered | `right-left` |
| `layered-spline` | Layered | `top-down` |
| `organic`, `force`, `stress` | Organic | — |
| `radial` | Radial | — |
| `grid` | Grid | — |
| anything else | Layered | `top-down` |

An explicit `direction` in the options object wins over the one implied by the mode string.
`direction` is honoured **only** by the layered engine; organic, radial and grid have no flow axis,
so setting one for them is ignored rather than rejected.

---

## Chapters

1. [Layered](./01-layered.md) — the default; direction as a change of coordinate frame, and edge
   styles.
2. [Organic](./02-organic.md) — stress majorization, SGD, deterministic shuffling, overlap removal.
3. [Radial](./03-radial.md) — polar coordinates, concentric rings, proportional wedge allocation.
4. [Grid](./04-grid.md) — row-major placement; the mode that is instant and predictable.

Related reading: [the engine pipeline](../engine/README.md),
[node measurement](../concepts/node-measurement.md),
[determinism](../concepts/determinism.md),
[computational complexity](../concepts/computational-complexity.md).
