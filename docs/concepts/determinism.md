← [Node measurement](./node-measurement.md) | [Concepts index](./README.md) | [Next: Quality model →](./quality-model.md)

# Determinism

**The guarantee:** the same graph, the same configuration and the same mode produce
**byte-identical output**, on every run and in every process.

Not "visually similar". Not "the same up to floating-point noise". Identical, down to the last
coordinate. This is a hard requirement of the engine, it is asserted by the audit harness, and it is
the reason several pieces of code are shaped the way they are.

---

## Why a layout engine must be deterministic

It is tempting to treat layout as a rendering detail where a bit of jitter is harmless. It is not.
Four things break immediately without it.

### 1. Caching stops being correct

Computed layouts are persisted, keyed by a dataset signature plus a configuration hash plus the
mode (see [`layoutCacheStorage.ts`](../../src/utils/layoutCacheStorage.ts)). A cache is a promise:
_"recomputing this would give you the same answer, so here is the stored one."_ If the engine is
non-deterministic that promise is false, and the user sees a different drawing depending on whether
the cache happened to be warm. The bug looks like "the layout randomly changes", which is one of the
hardest classes of bug to report.

### 2. Diffing stops being meaningful

Open the same dataset twice, or two datasets that differ by one node, and you want the difference in
the drawing to correspond to the difference in the data. Under non-determinism you cannot tell a
data change from a run-to-run wobble.

```text
   deterministic                     non-deterministic

   run 1 ─┐                          run 1 ─┐
          ├─ identical               run 2 ─┼─ all different
   run 2 ─┘                          run 3 ─┘

   data changed ──► drawing          data changed ──► drawing changed
   changed in exactly                (and so did everything else,
   the affected region)               so you learn nothing)
```

### 3. Bug reports stop being reproducible

"Edge `e17` cuts through node `svc-a`" is only actionable if running the same input reproduces it.
The whole Phase 9 constraint machinery is built on the premise that a violation is a **bug report**
about the engine ([quality model](./quality-model.md)) — and a bug report you cannot reproduce is a
rumour.

### 4. Snapshot tests stop working

The native audit fingerprints geometry and compares it. The TypeScript audit runs 168 fixture/mode
combinations. Both gates assume a stable answer; with jitter they either fail constantly or have to
be loosened until they test nothing. (Snapshotting each fixture's metrics so that an _aesthetic_
regression also fails the build is a planned extension, not something the harness does today — but
it is only possible at all because the output is stable.)

---

## The specific hazard: hash iteration order

In Rust, `HashMap` and `HashSet` use `RandomState` by default — a hasher seeded from a
process-local random source. That is a security feature (it defeats hash-flooding attacks), and it
has one consequence that matters here:

> **Iterating a `HashMap` yields a different order in every process.**

Not "unspecified but stable". Genuinely different, run to run, on the same binary with the same
input. So the moment any decision depends on iteration order, the output becomes process-dependent.

The dangerous part is that this usually _looks_ fine. Consider:

```rust
// The hazard, in the shape it actually appeared in v1:
let vertex_index_map: HashMap<&str, usize> =
    grid.vertices.keys().enumerate().map(|(i, k)| (k, i)).collect();
```

Those indices then broke ties in A\*'s priority queue. Two paths of equal cost — extremely common on
a routing grid — were resolved by whichever vertex happened to get the lower index, which is to say
by the hasher's seed.

The measured verdict at the time: output was byte-identical across five native runs, so this was
recorded as a **latent hazard** rather than an observed failure. That is the worst possible state
for a bug. It was not luck exactly — the same allocation pattern in the same binary can produce a
stable order for a while — but nothing _guaranteed_ it, and it would have shifted with any change to
the hasher, the map's capacity, or the insertion pattern. A test suite cannot catch this; it only
shows up as a user complaint after an unrelated refactor.

---

## The rules the codebase follows

### Rule 1 — iterate `Vec`s, not maps

Every phase's working data is a `Vec` indexed by a dense `u32`. Ingest interns string ids into
indices once and builds CSR adjacency; from Phase 0 onward, "iterate the nodes" means
`for n in 0..ir.node_count()`.

Ingest's own module documentation states the invariant directly:

> Every decision is driven by `Vec` iteration or an explicitly sorted key list. The one `HashMap`
> present is a lookup table that is never iterated, so output is byte-identical across processes.

### Rule 2 — a `HashMap` may be _queried_, never _iterated for order_

This is the pattern used throughout. `port_side_balance` builds a
`HashMap<&str, (usize, usize, usize)>` and annotates it:

> Only ever looked up by key, never iterated, so the map's ordering cannot reach the result.

Where a map genuinely must be reduced, the reduction is chosen to be **order-independent**. Phase 9
computes lane depth as a maximum over map values, with the reason written down:

```rust
.max(demand.corridor_lanes.values().copied().max().unwrap_or(0))
// Taking a max over HashMap values is order-independent, so this stays deterministic.
```

`max` over a set is the same whatever order you visit it in. A `sum` of floats would _not_ be, since
floating-point addition is not associative.

### Rule 3 — sort before use, with a total key ending in a stable id

Wherever an order has to be derived, it is derived by an explicit sort whose key is **total** — no
two distinct items can compare equal — and whose final component is a stable identity like an item
index or an input position. A tie broken by "whichever came first" is a tie broken by memory layout.

Concrete examples in the engine:

| Site                                                                                  | Sort key                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Item ordering](../../crates/gvui/src/3_crossing_minimization/3_3_ordering.rs)        | `(traversal position, current order, discriminator, item index)`, where `discriminator` is `(kind rank, primary index, secondary index)` with `Real < Label < Dummy` |
| [Lane members](../../crates/gvui/src/4_coordinate_assignment/4_1_lane_demand.rs)      | `(lo_order, hi_order, edge, link)`                                                                                                                                   |
| [Corridor segments](../../crates/gvui/src/4_coordinate_assignment/4_1_lane_demand.rs) | `(rank, after_order, span, edge)` — "a total order, so the result never depends on hash iteration"                                                                   |
| [Emit](../../crates/gvui/src/6_validation/6_3_emit.rs)                                | routes and badges by `(input edge index, edge id)`                                                                                                                   |
| [Component packing](../../crates/gvui/src/6_validation/6_3_emit.rs)                   | descending height, then width, then component index — "so the order never depends on a hash"                                                                         |
| [Eades FAS](../../crates/gvui/src/1_cycle_breaking/1_3_eades_fas.rs)                  | returns edge indices sorted ascending and deduplicated                                                                                                               |
| [Tarjan SCC](../../crates/gvui/src/1_cycle_breaking/1_2_tarjan_scc.rs)                | members sorted ascending, components ordered by their minimum node — "so `comp_of` is a function of the arc _set_"                                                   |
| [Spatial hash queries](../../crates/gvui/src/6_validation/6_1_constraints.rs)         | results sorted and deduplicated before being returned                                                                                                                |

The discriminator is worth a second look, because it shows what "total" means in practice:

```rust
fn discriminator(kind: ItemKind) -> (u8, u32, u16) {
    match kind {
        ItemKind::Real(node)        => (0, node, 0),
        ItemKind::Label(edge)       => (1, edge, 0),
        ItemKind::Dummy { edge, seq } => (2, edge, seq),
    }
}
```

Every item in the layered graph maps to a distinct triple, derived only from its identity — no
pointer, no address, no insertion counter. Two items can never tie.

### Rule 4 — no wall-clock input to a decision

`config.time_budget_ms` is consulted in exactly one place: Phase 5 stops starting new sweeps once it
is exceeded. Everywhere else, elapsed time is measured and reported but never _read_.

The organic engine states this explicitly:

> `config.time_budget_ms` is **not** consulted. The cost here is a deterministic function of the
> node count and `stress_iterations`, and clipping the epochs on wall-clock time would make the
> drawing depend on machine load.

That is the general principle. A budget that changes the answer turns "the same graph" into "the
same graph on an unloaded machine".

> **Caveat, stated honestly.** Phase 5's time budget _is_ a decision input, so a layered layout on a
> heavily loaded machine could in principle stop sweeping earlier and install a different ordering.
> With `time_budget_ms: 250` and a measured worst case of 1.88 ms across all forty audit
> combinations, the budget is nowhere near binding on any real fixture — but it is the one place
> where determinism rests on headroom rather than on construction.

### Rule 5 — single-threaded

Nothing in the pipeline is parallelised. The one place v1 used rayon was measured at 0.19–10 ms,
i.e. irrelevant, and the app serves no COOP/COEP headers so `SharedArrayBuffer` — and therefore WASM
threading — is unavailable in the browser anyway. Beyond the performance argument, a parallel float
reduction is a classic source of run-to-run variation: the same numbers summed in a different order
give a different last bit.

Floating point _is_ deterministic when the same operations happen in the same order, which is what
single-threaded, `Vec`-ordered traversal gives.

---

## The one random number generator

The organic engine's stress optimizer visits its pair set in a shuffled order each epoch — SGD needs
that to avoid a systematic sweep bias. So it needs randomness, and it gets it from a fixed-seed LCG
([`7_2_organic.rs`](../../crates/gvui/src/7_engines/7_2_geometric_common.rs)):

```rust
/// Fixed LCG seed. **Never** replace this with a clock or `Math::random`: the pair visiting order
/// is an input to the optimizer, so a varying seed would make the same graph lay out differently
/// on every run and break the engine's determinism guarantee.
const SGD_SEED: u64 = 0x9E37_79B9_7F4A_7C15;
```

The generator is a 64-bit LCG with Knuth's MMIX constants, driving an in-place Fisher–Yates shuffle:

```rust
self.0 = self.0.wrapping_mul(6364136223846793005)
               .wrapping_add(1442695040888963407);
```

It is deliberately unsophisticated. The sequence only has to be well mixed and reproducible, not
statistically excellent — the modulo bias in `below()` is noted in the source and does not matter for
a visiting order.

Two related points:

- **The LCG is the only randomness in the whole engine.** Grep for it: the other occurrences are
  test-local generators for property tests. The layered pipeline has no RNG at all — its
  "`ordering_seeds`" are _deterministic traversal orders_ (identity, DFS pre-order, BFS level order,
  a reversed variant, then rotations), not random restarts.
- **Even the degenerate case is made reproducible.** When two nodes land exactly on top of each
  other during SGD there is no direction to separate them along, so the code picks one from the pair
  indices rather than from float noise:

  ```rust
  dx = if p.i <= p.j { 1.0 } else { -1.0 };
  ```

---

## How it is enforced

### The native audit

[`crates/gvui/examples/audit.rs`](../../crates/gvui/examples/audit.rs) runs every engine over every
dataset in `public/data/graphs/`. For each combination it lays the graph out **twice** and compares
an FNV-1a fingerprint of the emitted geometry:

```rust
let res   = gvui::compute_layout(nodes, edges, cfg, mode);
let again = gvui::compute_layout(nodes, edges, cfg, mode);
let deterministic = fingerprint(&res) == fingerprint(&again);
```

The fingerprint feeds node ids and positions (sorted by id, to three decimal places) and then every
point of every route (sorted by edge id). A mismatch is a hard failure that exits non-zero, so it can
be wired straight into CI:

```sh
cargo run --release --manifest-path crates/gvui/Cargo.toml --example audit
```

The `det` column of the audit table is that check, per fixture per engine. All 40 combinations report
`yes`.

### Across processes

Two runs inside one process share a hasher seed, so the in-process check alone would not catch a
hash-order dependency. The cross-process property is established by running the audit in a **second
process** and comparing: the result recorded in
[`06-results.md`](../planning/layout-engine-v2/06-results.md) is that every fixture is byte-identical
across two processes.

### In unit tests

Determinism is also asserted at module level. The engine facade tests every mode:

```rust
#[test]
fn every_mode_is_deterministic() { /* serialize both runs, assert equal */ }
```

and the constraint checker asserts its diagnostics are stable across repeated calls. Those tests
catch a regression at the module that caused it, rather than as a mysterious audit failure.

---

## What determinism does _not_ promise

Worth stating, so the guarantee is not over-read:

- **It is not stability under input change.** Adding one node can legitimately change the whole
  drawing — a different rank assignment leads to a different ordering leads to different
  coordinates. Incremental stability is a separate (and much harder) property that this engine does
  not claim.
- **It is not stability across versions.** Changing an algorithm changes the output, on purpose.
  That is what the metric snapshots in the audit are for: they make such a change visible instead of
  silent.
- **It is not stability across configurations.** `compaction: tight` draws differently from
  `balanced`. Obviously.

The promise is exactly: _same input, same config, same mode, same build → same bytes._

---

← [Node measurement](./node-measurement.md) | [Concepts index](./README.md) | [Next: Quality model →](./quality-model.md)
