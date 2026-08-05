# 02 — Algorithms

Step-by-step specification of each phase. Every phase states its input, its output, the algorithm,
its guarantee, and the invariant it establishes for downstream phases.

---

## Phase 0 — Ingest

**In:** `GraphDataset` JSON. **Out:** `GraphIR`.

1. Intern every node and edge id → dense `u32`.
2. Drop edges whose endpoints do not resolve; emit an `UNKNOWN_ENDPOINT` diagnostic. (Today these
   are silently skipped inside the router.)
3. Build forward and reverse CSR adjacency.
4. **Bundle parallel edges.** Group edges by unordered endpoint pair `{u,v}`. A group of size > 1
   becomes a `Bundle`. Bundles are laid out as one logical edge with a stack of labels, then split
   at the ports. This removes the single biggest source of badge collisions — parallel edges whose
   labels land on top of each other — at the structural level rather than by collision resolution.
5. Split into weakly connected components; each is laid out independently and packed in Phase 9.

**Input contract additions** (all optional, all backward compatible):

```jsonc
{
  "nodes": [
    {
      "id": "n1",
      "name": "…",
      "w": 240,
      "h": 96, // explicit size, skips measurement
      "rank": 3, // pin to a rank
      "group": "control-plane", // future: cluster/subgraph support
    },
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "target": "n2",
      "label": "…",
      "role": "forward|cross|feedback", // override classification
      "weight": 2, // ranking + ordering priority
      "minlen": 2, // force ≥2 ranks of span
    },
  ],
}
```

**Invariant:** downstream sees dense indices, a valid endpoint for every edge, and no parallel-edge
ambiguity.

---

## Phase 1 — Measure

**In:** `GraphIR` + a `MeasurementProvider`. **Out:** `Vec<Size>` for nodes, `Vec<Option<LabelBox>>`
for edges.

This directly answers _"know our boundaries and the size of the elements upfront before drawing
them"_. The key architectural decision is that **measurement is a pluggable, cacheable phase whose
output is a flat array of boxes, and the layout engine never sees text.** Changing the node card
design cannot break the layout engine — you change the measurer, not the algorithm.

```ts
interface MeasurementProvider {
  measureNodes(nodes: GraphNodeData[]): Size[];
  measureLabel(text: string, opts: LabelOpts): LabelBox;
}
```

### 1a. Canvas measurer (default)

`OffscreenCanvas` 2D context, `ctx.font` built from the resolved CSS custom properties that the real
node card uses, then `ctx.measureText()`. Exact for the actual font, correct for CJK, emoji and
proportional metrics, and costs microseconds — measuring 500 strings is well under a millisecond.

Node height is then computed from a **declarative template descriptor** rather than the current
hand-rolled arithmetic:

```ts
const NODE_TEMPLATE = {
  padding: 12,
  rows: [
    { key: "name", font: "--font-node-title", minH: 24 },
    { key: "description", font: "--font-node-body", wrap: true, maxLines: 3 },
    { key: "badges", font: "--font-node-badge", flow: "wrap", gap: 6 },
    { key: "tools", font: "--font-node-badge", flow: "wrap", gap: 6 },
  ],
};
```

Width = max row width + padding, clamped to `[minNodeWidth, maxNodeWidth]`; height = Σ row heights
after wrapping at the clamped width. This is a two-pass shrink-to-fit, ~10 lines, and it replaces
`calculateNodeDimensions`'s `node.name.length * 11 + 90` — which is wrong for any non-monospace font
and silently drifts every time the card design changes.

### 1b. DOM-probe measurer (opt-in)

For node templates too complex to model declaratively. Render each distinct template once into a
hidden container, **write all, then read all** in a single forced reflow (never interleave), and
read `getBoundingClientRect()`. One reflow for the whole batch: ~2–5 ms for 100 nodes.

Selected per template via `measure: "dom"`. Not the default, because the canvas path is 100× faster
and sufficient for the current card.

### 1c. Label boxes and wrapping

Measured with the same text measurer:

```
LabelBox { w, h, lines: string[] }
```

**Wrapping is mandatory, not optional.** Today a 200-character edge label becomes a ~1,400 px badge
that can never fit anywhere, and the engine then burns its entire budget failing to place it. Bound
it: wrap at `maxLabelWidth` (default ~220 px) up to `maxLabelLines` (default 3), then ellipsize with
the full text in a tooltip. A label that cannot fit is a _content_ problem; solving it in the layout
search is solving the wrong problem.

### 1d. Caching

Key on `(text, fontKey, maxWidth)`. Persist per session. Re-layouts triggered by a config change
(`nodeGap`, `rankGap`, …) — which is the common interactive case — reuse the cache entirely and skip
Phase 1.

**Invariant:** every node and every label has a final, exact box. No downstream phase reads text.

---

## Phase 2 — Structure

**In:** `GraphIR`. **Out:** per component, a DAG with a `reversed` flag per edge.

1. **Weak components** → independent layout problems.
2. **Tarjan SCC** → condensation. Trivial SCCs need no cycle breaking.
3. **Eades–Lin–Smyth greedy FAS** per non-trivial SCC. Linear; `|FAS| ≤ m/2 − n/6`.
4. **Reverse, do not drop.** Each FAS edge becomes `(v → u, reversed = true)` and participates in
   every downstream phase exactly like a forward edge.

This is the fix for defect #3. Today feedback edges are excluded from the layer graph entirely, so
they get no dummy nodes, contribute nothing to ordering, and are invisible to crossing counting —
then the router has to invent a path for them through a layout that never accounted for them.

5. **Do not pre-classify "cross" edges.** Let ranking decide. An edge whose endpoints happen to land
   on the same rank is a flat edge, handled by the flat-edge rule in Phase 8. Pre-classifying it
   (as `1_4_auto_cross_inference.rs` does) removes it from ranking, which is one of the reasons the
   mesh flattens.

**Invariant:** a DAG in which every original edge is present exactly once.

---

## Phase 3 — Rank

**In:** DAG. **Out:** `rank: u16` per node.

### 3a. Network simplex

Minimize `Σ ω(u,v) · (rank(v) − rank(u))` subject to `rank(v) − rank(u) ≥ minlen(u,v)`.

`2_2_network_simplex.rs` already implements this and is **never called** (defect #2). Make
`assign_ranks` dispatch to it, with longest-path as an explicit fallback if it fails to converge
within `4·|V|` pivots.

Two parameters that matter here:

- **`ω` (weight).** Default 1. Set `ω = 8` for the chain edges of a bundle so parallel edges stay
  adjacent. Honour a per-edge `weight` from JSON. Network simplex is _optimal_ for this objective,
  so weights are a precise, predictable steering mechanism — unlike the current penalty knobs, which
  feed a search that does not converge.

- **`minlen`.** Default 1. **`minlen = 2` for every labelled edge**, so there is an intermediate
  rank to host the label node. Honour a per-edge `minlen` from JSON.

  In `dot` this is done by doubling all ranks; doing it per-edge is better here because it only pays
  the extra vertical space where a label actually needs it.

### 3b. Aspect-ratio balancing

Network simplex minimizes edge length; it does not care about shape. Two failure modes visible in
the current datasets:

- `clean_ring_10n_10e` → 10 ranks of 1 node: a 10-node vertical line.
- `dense_kubernetes_mesh` (once ranked correctly) → 8 ranks, widest 6.

Add a bounded post-pass:

```
target_width = ceil( sqrt( N · avg_node_w / avg_node_h ) · aspectBias )
for each rank r with |r| > maxNodesPerRank:
    move the excess nodes with the greatest slack (i.e. those whose rank can
    increase without violating any minlen) down one rank, preferring nodes with
    fewer intra-rank neighbours
```

Slack is already available from the simplex tight tree, so this is O(V log V) and does not disturb
optimality of the edges it does not touch. It is `dot`'s `ratio`/`-Gsize` behaviour and it is what
makes wide meshes and long chains both look reasonable.

**Invariant:** every node has a rank; `rank(v) ≥ rank(u) + minlen` for every DAG edge.

---

## Phase 4 — Layer

**In:** ranked DAG + boxes + label boxes. **Out:** `Layered` (see
[01-architecture § 4.2](./01-architecture.md#42-the-layered-graph)).

For each edge `u → v` with `span = rank(v) − rank(u)`:

| case                  | expansion                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `span == 1`, no label | direct `up`/`down` link                                                                                                       |
| `span == 1`, labelled | cannot occur — Phase 3 forced `minlen = 2`                                                                                    |
| `span ≥ 2`, no label  | `Dummy` at every intermediate rank                                                                                            |
| `span ≥ 2`, labelled  | `Dummy` at every intermediate rank **except** the middle one, which is a `Label` item carrying `(label.w, label.h)`           |
| `span == 0` (flat)    | no chain; recorded as a flat edge for Phase 6/8. Its label's **width becomes a separation constraint** between the two nodes. |
| self-loop             | no chain; a fixed port pair on the right side, routed in Phase 8                                                              |

### The label-node trick, stated precisely

A `Label` item is an ordinary item with a real box. Consequences, all free:

- **Phase 5 orders it** among its rank's siblings, so its horizontal position is chosen to minimize
  crossings, not by a local collision search.
- **Phase 7 separates it** from its neighbours by `nodeGap` via Brandes–Köpf's per-pair separation.
- **Rank height** is `max(item.h)` over the rank, so the rank is tall enough for the badge by
  definition.
- **Badge geometry in Phase 8 is just the item's box.** No candidate generation, no scoring, no DSU,
  no backtracking. `5_7_badge_placement.rs` (1,003 lines) reduces to a lookup.

**Half-width variant.** To get "badge beside the line" instead of "badge on the line", give the
label item width `2·w` and route the edge through its left edge. `labelPlacement` selects between
`on-edge` (width `w`, line through centre) and `beside-edge` (width `2·w`, line through the left
edge).

**Invariant:** every rank is a flat list of boxed items; every edge is a chain of adjacent-rank
links; every label has reserved area.

---

## Phase 5 — Order

**In:** `Layered`. **Out:** `order` per item. **This is the only search in the engine.**

### 5a. Counting: Barth–Mutzel–Jünger

Two-layer crossing count in **O(E log V)**, not O(E²):

```
sort edges by (order of north endpoint, order of south endpoint)
build an accumulator tree (BIT) of size 2^ceil(log2(|south|))
for each edge in order:
    count += number of already-inserted edges with strictly greater south index
    insert(south index)
```

Cheap counting is what makes everything else affordable. The current `count_layer_crossings` is
O(E²) _and_ clones a `Vec<String>` per layer per call (defect from §2 of the diagnosis), which is
why `max_crossing_sweeps = 24` had to be paired with an early-return that made it a no-op.

### 5b. Initialization: k seeds

Run the whole ordering from `orderingSeeds` (default 4) distinct starting permutations:

1. DFS pre-order from the highest-out-degree roots
2. BFS level order
3. reverse of (1)
4. input order

Keep the best. These are independent, cheap, and diverse — the _correct_ place for the "try several
things and pick the best" instinct that the current outer search applies to a 4-second black box.

### 5c. Sweep

```
for sweep in 0..orderingSweeps:            # default 16
    dir = if sweep even { down } else { up }
    for each rank in dir order:
        for each item: pos[item] = median of neighbour orders in the adjacent rank
                                   (fallback: keep current order)
        stable-sort the rank by pos
    transpose()
    if total_crossings < best: best = snapshot()
    if 4 consecutive sweeps without improvement: break
```

**Median, not barycenter.** Median has a proven ≤3× bound for the two-layer problem; barycenter has
none. Keep `minimize_crossings_median` and delete the barycenter variant, or expose the choice as a
Tier-2 knob defaulting to median.

**`transpose()` compares against the CURRENT count, not the global best.** This is defect #5. The
current code compares to `best_crossings`, which is monotonically decreasing, so once a best is
recorded the pass stops accepting any improvement:

```
for each rank r, for each adjacent pair (i, i+1):
    c0 = crossings(r-1, r) + crossings(r, r+1)          # local, two layer pairs only
    swap(i, i+1)
    c1 = crossings(r-1, r) + crossings(r, r+1)
    if c1 > c0 { swap back }                            # accept ties → escapes plateaus
```

Note the count is **local** — only the two adjacent layer pairs change, so a transpose test is
O(deg log V), not a full-graph recount. The current code recounts the entire graph for every
candidate swap.

### 5d. Dummy priority (straight long edges)

During median and transpose, weight each item by how reluctant it should be to move:

```
priority(Dummy) = ∞    # never displaced by a real node
priority(Label) = high
priority(Real)  = degree
```

This is dagre's scheme. It converts long edges from staircases into straight vertical lines and is
one of the largest single aesthetic wins available — a chain of dummies that stays aligned renders
as one clean line through the diagram.

**Invariant:** every rank is a fixed permutation. All crossing decisions are now final; no later
phase creates or removes a crossing.

---

## Phase 6 — Demand

**In:** ordered `Layered`. **Out:** lane counts and lane indices for every channel and corridor.

**This is the phase that replaces the retry loop.** The insight: once ordering is fixed, the
_topology_ of every route is determined, even though no coordinates exist yet. Which channel each
segment traverses, and in which corridor it turns, is combinatorics on the layered structure.

### 6a. Collect segment intervals

For each consecutive pair `(a, b)` in an edge chain, `a` at rank `r` and `b` at rank `r+1`, the
route is: leave `a` downward, run horizontally somewhere in **channel r**, run vertically down into
`b`. Its horizontal extent in the channel is the order-interval `[min(order(a), order(b)), max(…)]`.

Flat edges (`span == 0`) contribute a vertical interval to the **corridor** between their endpoints'
orders.

Crucially these are **order intervals, not pixel intervals** — available now, before coordinates.

### 6b. Colour each interval set

Each channel's segment set is an interval graph. Interval graphs are perfect, so **greedy colouring
in order of left endpoint uses exactly ω colours, where ω = maximum overlap depth**. Optimal, and
O(k log k) by a sweep:

```
sort segments by left endpoint
active = min-heap keyed by right endpoint, storing freed lane ids
for each segment:
    pop all active whose right < this.left, returning their lanes to a free list
    lane = free_list.pop() or lanes++
    lane_of[segment] = lane
```

### 6c. Lane ordering for aesthetics

Which lane a segment gets is free within the colouring. Choosing it well removes the remaining
visual noise. Order lanes within a channel by the **destination order** of the segment: segments
heading left take outer lanes, segments heading right take inner ones, monotonically. This is the
left-edge algorithm from VLSI channel routing and it is what produces the parallel bus appearance
that hand-drawn diagrams have.

### 6d. Emit separations

```
rankGap(r)         ≥ channel[r].lanes  × laneSpacing + 2 × portStubLength
sep(item_i, item_{i+1}) ≥ corridor.lanes × laneSpacing
                        + (flat-edge label width, if any)
                        + nodeGap
```

**Invariant:** Phase 7 receives exact minimum separations. Every route that Phase 8 will draw has
guaranteed space. There is no possibility of a routing failure, so there is no rip-up, no reroute,
no permutation search, and no `unresolved_soft_conflicts` state.

---

## Phase 7 — Coordinates

**In:** ordered `Layered` + separations from Phase 6. **Out:** `(x, y)` per item.

### 7a. Y — rank bands

```
h(r)     = max over items in rank r of item.h     # Label items included by construction
y(0)     = padding
y(r + 1) = y(r) + h(r) + rankGap(r)               # rankGap from Phase 6d
item.y   = y(rank) + (h(rank) − item.h) / 2       # or top-aligned, per config
```

### 7b. X — Brandes–Köpf

Replace the current PAVA/isotonic sweep with Brandes–Köpf. Four passes over
{upward, downward} × {leftmost, rightmost}:

1. **Mark type-1 conflicts.** An _inner segment_ has dummy nodes at both ends. Mark any
   non-inner segment that crosses an inner segment. Marked segments are forbidden from aligning —
   this is precisely what guarantees dummy chains stay straight.
2. **Vertical alignment.** Sweep the ranks; align each item with its median upper (or lower)
   neighbour if that does not create a marked conflict and does not violate the order. Builds
   _blocks_ of items that will share an x coordinate.
3. **Horizontal compaction.** Place blocks by longest-path in the block graph, respecting per-pair
   separations `sep(i, i+1)` from Phase 6d; then merge classes.
4. **Balance.** Align the four candidate assignments to a common reference and take the average of
   the two innermost values per item.

Guarantees: **at most 2 bends per edge**, dummy chains perfectly vertical, arbitrary per-item widths
and per-pair separations respected, **O(V + E)**.

`bkAlign` is exposed as a Tier-2 knob (`median` default, or pin to `leftmost`/`rightmost` for a
deliberately asymmetric look).

**Invariant:** no two items in a rank overlap; every separation constraint holds exactly.

---

## Phase 8 — Route & Attach

**In:** coordinates + lane assignments. **Out:** polylines, ports, badge rects.

Nothing here searches. Every decision is a sort or a table lookup.

### 8a. Port sides — determined, not searched

| edge kind (TB mode) | source side                | target side                          |
| ------------------- | -------------------------- | ------------------------------------ |
| forward, `span ≥ 1` | Bottom                     | Top                                  |
| flat (`span == 0`)  | Right / Left by relative x | the other one                        |
| reversed (feedback) | Bottom                     | Bottom, entering via a side corridor |
| self-loop           | Right                      | Right                                |

Feedback edges deliberately exit and re-enter from the bottom and loop around the side. That is a
_semantic_ signal — "this goes backwards" should be visible — and it is the standard convention.
LR mode is TB on the transposed problem with sides rotated (see [03-modes.md](./03-modes.md)).

The current engine searches over 16 `(src_side, tgt_side)` combinations per edge, then searches
again to repair the crossings that produces. Determining the side removes both searches, and the
determined choice is what a human would draw anyway.

### 8b. Port order along a side — a sort

**This single rule removes nearly all attachment-point crossings:**

> Sort the ports on a node's bottom side by the `order` of the corresponding item in the next rank.
> Sort the ports on the top side by the `order` of the corresponding item in the previous rank.

O(deg log deg). Two edges leaving the same node toward targets at orders 3 and 7 attach in that
left-to-right sequence, so they cannot cross each other at the node. Because Phase 5 already
minimized crossings _between_ ranks, this makes the attachment locally crossing-free too.

### 8c. Port spacing — and node growth

```
pitch = (w − 2·portEndpointPadding) / (deg + 1)
port_i.x = node.x + portEndpointPadding + (i + 1) · pitch
```

If `pitch < minPortPitch`, the node is too narrow for its degree. Options, in order:

1. **Grow the node** to `deg · minPortPitch + 2·portEndpointPadding`, up to `maxNodeWidth`.
   The node box is ours; growing it is the same "expand to fit content" principle that the label
   node applies to badges.
2. Beyond `maxNodeWidth`, **fan into a trunk**: ports converge to a single stub a short distance
   from the node, then split. Visually a bus; structurally one segment in the channel.

Note that (1) must happen in **Phase 1**, not here — node width is an input to ranking and ordering.
So degree is computed in Phase 2 and fed back into the measurement clamp. That is a data dependency,
not a loop: degree is known before measurement finalizes.

### 8d. Materialize the polyline

For each consecutive chain pair `(a, b)`:

```
p0 = port on a
p1 = p0 + (0, portStubLength)                      # stub
p2 = (p1.x, channelY(r) + lane_of[seg] · laneSpacing)
p3 = (b_port.x, p2.y)
p4 = b_port − (0, portStubLength)
p5 = port on b
```

Then run a single `simplify_orthogonal_path` to drop collinear points. Total cost O(bends).
For a `span == 1` edge whose ports are already x-aligned, this collapses to a straight line.

### 8e. Corner rounding

Emit the polyline, then at each bend replace the corner with a quadratic Bézier of radius
`min(cornerRadius, halfLen(prev), halfLen(next))`. Zero layout cost, purely a path-string
transformation — and it is most of the perceived difference between "generated" and "designed".

### 8f. Bundling

Edges sharing `(source node, side)` and the same channel lane merge into a trunk and split late.
Detected by grouping, not by search. This is what makes a 45-edge mesh readable.

### 8g. Badges

```
badge.rect = label_item.box            # already positioned by Phases 5 and 7
badge.anchor = nearest point on the edge polyline
```

For flat edges, the badge sits in the corridor at the edge's lane; the corridor width already
accounts for it (Phase 6d).

**Safety net only** — for the rare case where a badge overlaps an _unrelated_ edge passing nearby:
slide it along the edge across ~5 discrete positions and take the first clear one; if none, keep the
midpoint and draw a short leader. Candidates are found via a uniform spatial hash, not all-pairs.
This should fire rarely enough that its frequency is a **quality metric**, not a routine path.

**Invariant:** every edge has a polyline; every label has a rect; no badge overlaps a node or
another badge.

---

## Phase 9 — Emit

1. **Pack components.** Per-component bounding boxes → shelf/strip packing at `targetAspectRatio`.
2. **Translate** so the top-left of the union box sits at `graphPadding`.
3. **Un-reverse** feedback edges: swap the polyline's direction so the arrowhead renders at the
   original target.
4. **Compute metrics** (see [04-config-and-quality.md](./04-config-and-quality.md)).
5. **Serialize to typed arrays**, not a JS object graph:

```
nodes_xywh : Float32Array(4·V)
edge_pts   : Float32Array(2·ΣP)
edge_off   : Uint32Array(E+1)          # edge i occupies edge_pts[2·off[i] .. 2·off[i+1]]
badge_xywh : Float32Array(4·B)
```

`serde_wasm_bindgen::to_value` currently materialises one JS object per node, edge, badge, crossing
and diagnostic. Once layout drops to ~15 ms, that allocation becomes a leading cost. Typed arrays
also transfer cleanly out of the worker.

6. **Assert constraints in dev builds** (`debug_assertions`): no node-node overlap, no edge-node
   penetration, all segments orthogonal, all ports on boundary, all edges routed. In release these
   are guaranteed by construction and the checks compile out. This replaces
   `validate_custom_layout` running inside the router's inner loop as a scoring probe.

---

## Correctness fixes worth landing before v2

These are independent of the redesign and can ship immediately against the current engine
(see [05-roadmap.md](./05-roadmap.md) Milestone 0):

1. `assign_ranks(nodes, &active_edges, Some(&edge_role_map))` — one argument. **Measured: dense mesh
   goes from 2 ranks (28 nodes in one row) to 8 balanced ranks.** Largest single quality win
   available anywhere in the codebase.
2. `build_layer_graph` — include reversed feedback edges.
3. `minimize_crossings` — remove the `best_crossings == 0` early return, or make it correct by
   fixing (2) first so the count is meaningful.
4. `minimize_crossings` transpose — compare against current, not global best.
5. `GraphCanvas` — remove the synchronous main-thread fallback on worker timeout. It converts a
   30-second wait into a multi-minute browser freeze.
