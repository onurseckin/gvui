← [The Pipeline](./02-the-pipeline.md) | [Index](./README.md) | [Next: Structure →](./04-structure.md)

# Ingest and Measurement

Phases 0 and 1. Two questions have to be answered before a single coordinate exists:

1. **What exactly is this graph?** Which nodes are real, which edges connect things that exist, and
   what does the connectivity look like in a form that can be walked millions of times without
   allocating.
2. **How big is everything?** Not roughly. Exactly. Every box that will be placed must have its
   final width and height *before* the first ranking decision, because ranking, ordering and
   separation all consume those numbers and none of them can be re-run.

This chapter covers both. Phase 0 is
[`0_5_ingest.rs`](../../crates/gvui/src/0_common/0_5_ingest.rs) in Rust; Phase 1 is the TypeScript
[measurement module](../../src/engine/layout/measurement/), which runs on the host side before the
graph ever crosses into WebAssembly.

---

## Part 1 — Ingest

### What the host sends

The wire format is deliberately dull. Two flat arrays of plain records, defined in
[`0_1_types.rs`](../../crates/gvui/src/0_common/0_1_types.rs):

```jsonc
{
  "nodes": [
    { "id": "api", "label": "API Gateway", "width": 240, "height": 96,
      "rank": 3, "group": "control-plane" }
  ],
  "edges": [
    { "id": "e1", "source": "api", "target": "db", "label": "queries",
      "isCycle": false, "layoutRole": "auto", "weight": 2,
      "minLen": 2, "labelWidth": 84, "labelHeight": 28 }
  ]
}
```

Only `id`, `width`, `height` on a node and `id`, `source`, `target` on an edge are required.
Everything else is optional and has a defined default.

Notice what is **not** in there: no colours, no fonts, no text metrics to compute. `width` and
`height` arrive already measured. That is Phase 1's job, and it happens on the other side of this
boundary — see [Part 2](#part-2--measurement).

### Interning: strings in, integers out

The host speaks in string ids because humans wrote them. The engine cannot afford to.

Ingest walks `nodes` in input order and assigns each surviving node the next dense index:

```text
input                      interned
─────────────────────      ──────────────────────────────
{ id: "api",   … }    →    0    node_names[0] = "api"
{ id: "db",    … }    →    1    node_names[1] = "db"
{ id: "cache", … }    →    2    node_names[2] = "cache"
{ id: "api",   … }    →    ✗    DUPLICATE_NODE, skipped
{ id: "queue", … }    →    3    node_names[3] = "queue"
```

From here on, a node *is* the number `2`. The string survives only in `node_names`, which is read
exactly once more, at emit time, to label the output.

**Contract subtlety worth internalising:** index `i` is the `i`-th *surviving* node, so a dropped
duplicate shifts every later index. In the trace above, `"queue"` is index 3, not 4. Anything that
needs to map back resolves through `node_names`, never by position in the caller's array.

#### Why this matters more than it looks

v1 kept its adjacency as `HashMap<String, Vec<String>>`. Every neighbour lookup hashed a string;
every candidate ordering cloned a `Vec<Vec<String>>`; the routing grid keyed its vertices with
`format!("{:.3},{:.3}")` and cloned three owned `String`s per grid edge into both directions of the
adjacency list. The diagnosis catalogued this as three separate defects (#22, #23, #27) but it is
really one: *the data structure made the cheap operations expensive.*

Dense indices are not a micro-optimisation here. They remove an entire category of cost and make
the remaining costs legible. When ordering is a permutation of `u32`s, "try 4 seeds × 16 sweeps"
becomes a rounding error instead of a budget item.

One `HashMap` does survive in ingest — `index_of: HashMap<&str, u32>`, used to resolve edge
endpoints in O(1). It is **never iterated**, only probed, so hash order cannot leak into the output.
That distinction is what keeps the engine byte-deterministic across processes; see
[Determinism](../concepts/determinism.md).

### CSR adjacency, from scratch

Once nodes are numbers, "who are node 5's successors?" has to be answered fast and without
allocating. The structure for that is **compressed sparse row** (CSR).

Start with the obvious representation, an array of lists:

```text
0 → [1, 2]
1 → [3]
2 → [3]
3 → []
```

Four separate heap allocations, four pointer chases, and the neighbour data scattered across
memory. Now flatten it. Concatenate all the lists into one array, and keep a second array recording
where each node's slice begins:

```text
graph:   0→1  0→2  1→3  2→3

targets  [ 1 , 2 , 3 , 3 ]
           └─0─┘  │   │
                  └1──┘
                      └2┘
offsets  [ 0 , 2 , 3 , 4 , 4 ]
           n0  n1  n2  n3  end
```

The neighbours of node `n` are `targets[offsets[n] .. offsets[n+1]]`. For node 0 that is
`targets[0..2] = [1, 2]`. For node 3, `targets[4..4] = []`. One allocation for the whole graph,
neighbours contiguous in memory, and `degree(n)` is a subtraction.

The real struct carries a third parallel array so a neighbour can be traced back to the edge that
produced it:

```rust
pub struct Csr {
    pub offsets: Vec<u32>,   // length node_count + 1
    pub targets: Vec<u32>,   // length arc_count
    pub edges:   Vec<u32>,   // length arc_count, parallel to `targets`
}
```

`Csr::build` is a counting sort and runs in $O(V + E)$: count the arcs leaving each node, prefix-sum
the counts into `offsets`, then place each arc at its node's advancing cursor. Entries stay stable
within a group, so two runs over the same arc list produce byte-identical arrays.

Ingest builds **two** of these:

| CSR | keyed by | answers |
| --- | --- | --- |
| `out_csr` | source | "what does this node point at?" |
| `in_csr` | target | "what points at this node?" |

Both are needed. Tarjan's SCC walk only uses successors; the Eades sequence heuristic needs both
in- and out-degree; the ordering sweeps go down using one and up using the other.

A **self-loop appears in both**, so it counts twice toward `degree`. That is deliberate — a loop has
two ends, and both need port space reserved on the node boundary.

### Diagnostics: fail loudly, at the boundary

Ingest never fails. A single malformed edge must not cost the user the whole drawing. Instead it
drops the offending record and appends a `LayoutDiagnostic` that rides all the way out to
`validation.diagnostics` in the result payload.

| code | trigger | action |
| --- | --- | --- |
| `DUPLICATE_NODE` | node id already interned | keep the first, skip this one |
| `DUPLICATE_EDGE` | edge id already seen | keep the first, skip this one |
| `UNKNOWN_ENDPOINT` | `source` or `target` is not a known node id | drop the edge |

All three are `severity: "warning"` and carry the offending ids:

```text
UNKNOWN_ENDPOINT  Edge 'e17' references unknown node id(s) [ghost]; edge dropped.
                  ids: ["e17", "ghost"]
```

#### Why the loud version is better

v1 also dropped unresolvable edges — silently, deep inside the router. The consequence was that a
typo in the caller's data presented as a *layout* bug: an edge that simply was not drawn, with
nothing anywhere saying why. The diagnosis measured a related symptom on
`distributed_saga_workflow`, where the router returned 10 routes for 11 edges and reported only
`unresolved_soft_conflicts` — a status that describes a routing difficulty, for something that was
never a routing problem at all.

The rule that follows: **a data error must be named at the boundary where the data arrives.** By the
time the router is running, the edge no longer exists to complain about, and every explanation the
engine can offer is wrong.

### Parallel-edge bundling

Two edges between the same pair of nodes will be drawn on top of each other unless something
notices. Ingest notices, when `bundle_parallel_edges` is on (it is, by default).

Edges are grouped by their **unordered** endpoint pair, so `a → b` and `b → a` land in the same
bundle — visually they occupy the same corridor regardless of direction. Self-loops are excluded.

Worked example. Four edges over three nodes:

```text
ab1 : a → b        keys sorted as (a, b, edge):
ac  : a → c          (0, 1, 0)   ab1
ba  : b → a          (0, 1, 2)   ba      ← group of 3 → Bundle 0
ab2 : a → b          (0, 1, 3)   ab2
                     (0, 2, 1)   ac      ← group of 1 → no bundle
```

`Bundle { a: 0, b: 1, edges: [0, 2, 3] }`, and each of those three edges gets `bundle: Some(0)`.
The lone `a → c` edge is left alone.

The triples are **sorted before grouping**, which is the entire reason bundle indices are
reproducible: grouping by iterating a hash map would number the bundles differently on a different
run of the same input.

Bundling matters because parallel edges are the single biggest source of badge collisions. Handling
them structurally — one logical route, split at the ports — removes the collision rather than
resolving it afterwards.

### Weakly connected components

A graph handed to the engine may be several graphs wearing a trenchcoat. Ingest finds the pieces
with a union-find over all non-self edges, **ignoring direction** (hence *weakly* connected):

```text
edges: b→a, c→d          nodes: a b c d lonely

           a ──── b            c ──── d          lonely

components = [[0, 1], [2, 3], [4]]
```

Two implementation choices are load-bearing:

- **Path halving, not recursion.** `find` rewrites each node's parent to its grandparent as it
  walks. No recursion, no allocation, effectively flat trees.
- **Union by index, and an ascending final scan.** The lower index always becomes the
  representative, and components are created in ascending node order. Both guarantees fall out at
  once: each member list is sorted, and components are numbered by their smallest member. Nothing
  depends on the order edges arrived in.

Isolated nodes each form their own single-element component. Components are laid out in the same
coordinate space and then separated at emit time by
[`pack_components`](../../crates/gvui/src/6_validation/6_3_emit.rs), a shelf pack ordered by
descending height with `component_gap` between shelves.

### Two constraints decided here because nothing downstream can repair them

Ingest is not just translation. Two decisions are made at this point precisely because every phase
that could care about them runs later.

#### 1. A labelled edge gets `min_len = 2`

`min_len` is the minimum number of ranks an edge must span. Default 1 — source and target on
adjacent ranks.

An edge that carries a label gets 2 instead. The reason becomes obvious in
[Chapter 6](./06-layering-and-labels.md): the badge is materialised as an *item on an intermediate
rank*. A span of 1 has no intermediate rank, so there would be nowhere to put it, and the whole
"badge space cannot fail to fit" guarantee would have a hole in it.

An explicit `minLen` from the host always wins:

```rust
let min_len: u16 = match edge.min_len {
    Some(m) if m >= 1 => m.min(u16::MAX as usize) as u16,
    _ if label.is_some() => 2,
    _ => 1,
};
```

This costs vertical space, and it costs it honestly: `clean_ring_10n_10e`, a 10-node ring with
labelled edges, draws as 19 ranks. That is correct given the rule, and it is a known open question
(see [06-results §5.2](../planning/layout-engine-v2/06-results.md)), not an accident.

#### 2. A node too narrow for its degree is widened

Edges attach to a node at **ports** spaced `port_pitch` apart along one side, with
`port_endpoint_padding` of clearance at each corner. A node with 10 outgoing edges needs a bottom
side wide enough to hold 10 ports. If it is not, the ports either overlap or spill off the corner.

So ingest grows it:

```text
required = side_degree × port_pitch + 2 × port_endpoint_padding
width    = clamp(measured_width, min_node_width, max_node_width)
width    = min(max(width, required), max_node_width)
```

where `side_degree = max(in_degree, out_degree)` — the busier side dictates the width.

With the defaults (`port_pitch = 18`, `port_endpoint_padding = 16`, `min_node_width = 120`,
`max_node_width = 420`):

| out-degree | required | measured 100 | final width |
| ---: | ---: | ---: | ---: |
| 1 | 50 | 100 | **120** (min floor) |
| 10 | $10 \times 18 + 32 = 212$ | 100 | **212** |
| 30 | $30 \times 18 + 32 = 572$ | 100 | **420** (max ceiling) |

Beyond `max_node_width` the node stops growing and the ports get tighter than `port_pitch`; that is
the accepted trade, because a 572-pixel-wide box would distort the whole drawing to accommodate one
hub.

**Why here and not at routing time?** Because width is an *input* to ranking, ordering and
coordinate assignment. By the time the router runs, every x coordinate is already fixed; widening a
node then would mean invalidating them and re-running — exactly the retry loop the design exists to
avoid. v1's plan put this in the routing phase, which is why it read as a data dependency problem.
It is not: degree is known from the edge list, and the edge list is known before boxes are
finalised. Constraints flow forward.

### Pinned ranks

A node may carry `rank: 3`, pinning it. Ingest saturates the value into a `u16` and sets
`has_pinned_ranks` if *any* node used it. That flag disables rank balancing for the whole graph —
balancing works by moving nodes between ranks, and a graph with pins is a graph where the caller has
said not to.

### What Phase 0 hands on

```rust
pub struct GraphIr {
    node_names:  Vec<String>,        // read once more, at emit
    edge_names:  Vec<String>,
    node_labels: Vec<Option<String>>,// carried, never read by layout
    nodes:       Vec<IrNode>,        // width, height, pinned_rank, degree
    edges:       Vec<IrEdge>,        // source, target, label BOX, weight, min_len, hint, bundle
    out_csr:     Csr,
    in_csr:      Csr,
    bundles:     Vec<Bundle>,
    components:  Vec<Vec<u32>>,
    has_pinned_ranks: bool,
    diagnostics: Vec<LayoutDiagnostic>,
}
```

Everything after this point indexes into that struct. Cost: one pass over nodes, one over edges, one
sort for bundling, one union-find pass — $O(V + E \log E)$, dominated in practice by the sort.

---

## Part 2 — Measurement

### The question

You cannot place a box until you know how big it is. You cannot know how big a card is until you
know how many lines its description wraps to. You cannot know that until you know how wide the card
is. And the card's width depends on how wide its title renders in the actual font at the actual
weight.

That is a self-referential little problem, and it has to be solved *completely* before layout starts
— not approximately, and not later. The answer is a separate phase with a hard boundary.

### The boundary

```text
   GraphNodeData                                        NormalizedNode
   (name, description,        ┌────────────────────┐    { id, width: 248,
    badges, tools,       ───► │ MeasurementProvider │──► height: 132 }
    metadata, …)              └────────────────────┘
   edge.label: "retries       measureNodes()             { labelWidth: 84,
    on 5xx"                   measureLabel()               labelHeight: 30 }

   ══════════════════ text lives above this line ══════════════════
   ══════════════════ boxes live below it ═════════════════════════

                        Rust engine: ranks, orders,
                        separates, routes — all on boxes
```

The interface, from [`types.ts`](../../src/engine/layout/measurement/types.ts):

```ts
interface MeasurementProvider {
  measureNodes(nodes: GraphNodeData[], opts?: MeasureNodesOptions): Size[];
  measureLabel(text: string, opts: LabelOptions): LabelBox;
  clearCache(): void;
}
```

`Size` is `{ width, height }`. `LabelBox` is `{ width, height, lines, truncated }` — the extra
fields are for the renderer, which draws the wrapped lines; the engine only ever receives the two
numbers.

### The engine never sees text

This is worth stating precisely, because it is the property that lets the node card be redesigned
without touching a line of layout code.

- `IrEdge.label` is a `LabelBox { width, height }`. There is no text field.
- `GraphIr` interns edge *ids*. It does not intern edge label text at all — which is why
  [`5_4_badges.rs`](../../crates/gvui/src/5_edge_routing/5_4_badges.rs) leaves
  `BadgePlacement::label` as an empty string and the host fills it back in from its own dataset.
- `node_labels` is carried through as an opaque payload and copied into the output; no phase reads
  it.

There is exactly one exception, and it is at the boundary rather than inside it:
[`0_4_badge_measurement.rs`](../../crates/gvui/src/0_common/0_4_badge_measurement.rs) contains a
character-count estimator used **only** when the host supplied no `labelWidth`/`labelHeight`:

```rust
width  = max(60, text.len() × 7 + 24)
height = 28
```

`resolve_label_box` prefers the host's measured numbers whenever both are finite and positive; the
estimate exists so that a host with no canvas at all still gets a box rather than no badge. It
produces a box like everything else, and once it has, nothing reads the string again.

### Three measurement backends

[`canvasMeasurer.ts`](../../src/engine/layout/measurement/canvasMeasurer.ts) tries three, in order:

1. **`OffscreenCanvas`.** Works on the layout worker thread, where there is no DOM. This is the
   normal path in the browser.
2. **A detached `<canvas>`.** Main thread fallback, for hosts that declare `OffscreenCanvas` but
   refuse a 2D context.
3. **A per-character estimate.** The only path available under `bun test` and SSR.

Backends 1 and 2 both reduce to `ctx.font = "…"; ctx.measureText(text).width`, which is exact for
the real font — correct for proportional metrics, CJK, and emoji, and costs microseconds.

The estimate is not a degenerate case, it is a supported path, so it must be finite, positive and
stable. It sums a per-character width ratio:

| character class | ratio (× font size) |
| --- | ---: |
| any character in a mono font | 0.60 |
| space | 0.28 |
| narrow glyphs — i j l t I f . , : ; ' backtick pipe ! ( ) [ ] { } - / \\ | 0.33 |
| `mwMW@%&` | 0.90 |
| code point > `0x2000` (CJK, emoji) | 1.00 |
| `A`–`Z` | 0.66 |
| `0`–`9` | 0.55 |
| everything else | 0.52 |

with a ×1.04 bump at weight ≥ 600. The buckets are coarse on purpose. The estimate only has to be
stable and must never *under*-report badly, because under-reporting is what makes text overflow its
reserved box and collide with a neighbour. Treating an emoji as a latin letter would under-reserve
by nearly half on a tool chip, which routinely carries an icon glyph.

### Fonts are named roles, not strings

A card does not declare `"600 14px system-ui"`. It declares a *role*:

| key | weight | size | family |
| --- | ---: | ---: | --- |
| `node-title` | 600 | 14 | sans |
| `node-type-tag` | 700 | 10 | mono |
| `node-body` | 400 | 11 | sans |
| `node-chip` | 600 | 11 | mono |
| `edge-label` | 600 | 11 | mono |

The concrete family stack is resolved once, at first use, by reading the `--font-sans` /
`--font-mono` custom properties off `document.documentElement` — the same properties the cards are
actually styled with. A theme that swaps the font is therefore followed by measurement instead of
silently measuring a font nobody renders. (`resetDefaultMeasurer()` drops the cached stacks when
that happens.)

These numbers mirror `NodeCard.css` and `GraphEdge.css`. Drift between the two shows up as clipped
text, which is the honest failure mode: too-small boxes are visible immediately, whereas too-large
boxes just quietly waste space forever.

### The declarative node template

The card is described as data, in
[`nodeTemplate.ts`](../../src/engine/layout/measurement/nodeTemplate.ts), in the same order the DOM
renders it:

```text
┌─ .node-card ────────────────────────────── padding: 10 ─┐
│ ┌─ header (34px) ──────────────────────────────────────┐ │
│ │ ● [Fetch Orders]  [TOOL]        ← row "name" (flow)  │ │  inHeader: contributes
│ │                                    maxLines 1        │ │  WIDTH but not HEIGHT
│ └──────────────────────────────────────────────────────┘ │
│ Retries on 5xx and backs off exponentially…              │  row "description" (wrap)
│                                            lineHeight 15 │  maxLines 3
│ [retry] [idempotent]                       lineHeight 22 │  row "badges" (flow), maxLines 3
│ [⚙ http-get] [⚙ jq]                        lineHeight 22 │  row "tools"  (flow), maxLines 3
│ gpt-4o · harness-v2                        lineHeight 16 │  row "model"  (wrap), maxLines 1
│ Repo Path: /srv/api                        lineHeight 15 │  row "context"(wrap), maxLines 4
└──────────────────────────────── rowGap: 8 between rows ──┘
```

Two row kinds:

- **`wrap`** — prose. Each selected string is wrapped independently and the lines stack vertically.
- **`flow`** — pills. Items sit side by side and spill onto further lines when they run out of room.

Each row declares its `lineHeight`, a hard `maxLines` cap, the per-item `itemChrome` (pill padding,
border, leading icon and its gap) and any `fixedChrome` that always reserves width regardless of
wrapping — for the `name` row that is 50 px: an 8 px status dot, an 8 px gap, a 26 px collapse
button and another 8 px gap.

`inHeader: true` on the `name` row means it contributes width but not height, because
`headerHeight: 34` already accounts for the whole band. Counting it twice would inflate every card
in the graph by 18 px.

**Why declarative matters.** v1 computed node size with hand-rolled arithmetic —
`node.name.length * 11 + 90`, plus a per-section pile of magic constants. That is wrong for any
non-monospace font (an `i` and an `M` are not the same width) and it drifted silently every time the
card gained a row: the card grew, the reserved box did not, and text spilled over the border.
Here, adding a row to `NodeCard` means adding one entry to the template array and nothing else.

### Two-pass shrink-to-fit

Measuring a card is two passes, because width has to be decided before height can be.

**Pass 1 — natural width.** For every row, measure what it would take with no wrapping at all. For a
`flow` row that is the sum of item widths plus gaps plus fixed chrome; for a `wrap` row it is the
widest single item. Take the maximum across rows, add padding on both sides, clamp:

$$\text{width} = \left\lceil \mathrm{clamp}\big(\max_r \text{natural}_r + 2p,\; w_{\min},\; w_{\max}\big) \right\rceil$$

**Pass 2 — height at that width.** Re-wrap every non-header row at
`contentWidth = width − 2 × padding`, count the lines it actually produced, and stack:

$$\text{height} = \text{headerHeight} + p + \sum_{r \notin \text{header}} \big(\text{lines}_r \times \text{lineHeight}_r + \text{rowGap}\big)$$

Only the *bottom* padding is charged, because the header's negative top margin cancels the card's
top padding.

Worked example. A node named `Fetch Orders` of type `TOOL`, description
`Retries on 5xx and backs off exponentially before giving up`, two badges, no tools, no model, no
context. Defaults: `padding = 10`, `headerHeight = 34`, `rowGap = 8`, `minNodeWidth = 120`,
`maxNodeWidth = 420`.

```text
Pass 1
  name    (flow) : 50 fixed + "Fetch Orders"@node-title  ≈  82
                        + 8 gap + "TOOL"@node-type-tag ≈ 26 + 14 chrome
                 → 50 + 82 + 8 + 40                    = 180
  descr   (wrap) : one long string, unwrapped          ≈ 305
  badges  (flow) : "retry" ≈ 33 + 20, "idempotent" ≈ 66 + 20, + 4 gap
                 → 53 + 4 + 86                         = 143
  widest = 305   →  width = ceil(clamp(305 + 20, 120, 420)) = 325
  contentWidth = 325 − 20 = 305

Pass 2
  descr wraps to 2 lines at 305 px   → 2 × 15 + 8 = 38
  badges fit on 1 line at 305 px     → 1 × 22 + 8 = 30
  height = 34 + 10 + 38 + 30 = 112
```

Result: `{ width: 325, height: 112 }`. That box, and nothing else about this node, crosses into the
engine.

### Label wrapping, and why an unbounded label is a *layout* hazard

Edge labels go through `measureLabel(text, { maxWidth, maxLines })` with the defaults
`maxLabelWidth = 220` and `maxLabelLines = 3`.

The wrap is greedy word wrap with two refinements:

- **Line widths are summed from token widths plus space widths**, not re-measured on each growing
  prefix. Measuring prefixes would flood the text cache with strings nobody ever asks for again, and
  the kerning difference across a space is sub-pixel.
- **A token wider than the whole line is broken by character.** URLs, hashes and file paths are the
  common case, and a word-only wrapper would emit one enormous line for them.

If the text does not fit in `maxLines`, the last line is **ellipsized**: characters are dropped
until the line plus `…` fits, and `truncated: true` is reported so the renderer can offer the full
text in a tooltip.

Now the important part. Consider a 200-character edge label with no bound:

$$200 \text{ chars} \times 7 \text{ px} + 24 = 1{,}424 \text{ px}$$

In v1 that badge could never fit anywhere, and the engine burned its entire budget failing to place
it — badge backtracking searching a space with no solution in it.

In v2 it would not fail. That is the problem. The badge becomes an item in the layered graph with a
1,424-pixel box, and the same machinery that guarantees it fits would dutifully push the entire rank
apart to make room. The drawing would be valid, deterministic, produced in under a millisecond —
and useless, a diagram whose scale is set by one sentence somebody typed into a label field.

So: **a label that cannot fit is a content problem, and bounding it is a content decision.** Wrap at
220 px, cap at 3 lines, ellipsize, keep the full string in a tooltip. Making the layout absorb
unbounded content is solving the wrong problem — expensively in v1, silently in v2.

### Caching

Two caches, both keyed on everything that can change the answer:

| cache | key | value |
| --- | --- | --- |
| text runs | `fontKey \| text` | width in px |
| labels | `fontKey \| maxWidth \| maxLines \| text` | frozen `LabelBox` |

The measurer is a process-wide singleton (`getDefaultMeasurer()`) precisely so the caches persist:
node labels repeat heavily across re-layouts of the same dataset, and the common interactive case —
dragging `nodeGap` or `rankGap` — changes no text at all and reuses the cache in full, skipping
Phase 1 entirely.

`LabelBox` values are `Object.freeze`d because they are handed out **by reference** on every cache
hit; a caller mutating one would silently corrupt every later measurement of the same label.

### Crossing the boundary

[`customLayoutAdapter.ts`](../../src/engine/layout/customLayoutAdapter.ts) is where the two halves
meet:

```ts
const measurer  = getDefaultMeasurer();
const nodeSizes = measurer.measureNodes(dataset.nodes);

// … per node:  width: size.width, height: size.height
// … per edge:  labelWidth: labelBox?.width, labelHeight: labelBox?.height
```

One call for all nodes, one call per labelled edge, and then a flat array of boxes goes over the
wire. The Rust side prefers those numbers over its own estimate every time.

### Cost

Measuring 500 strings with `measureText` is well under a millisecond, and the cache means most
re-layouts measure nothing at all. In the phase timings reported by the engine, `ingest` is
routinely the smallest non-zero entry. Neither of these phases is where time goes — which is the
point of doing all the irreversible work in them.

---

## What the next phase receives

- Dense `u32` indices with both CSR directions built.
- A valid, existing endpoint for every surviving edge.
- An exact box for every node, already grown for its port demand.
- An exact box for every badge, already bounded and wrapped.
- `min_len = 2` on every labelled edge.
- Weakly connected components, bundles, and a diagnostic list naming everything that was dropped.

No later phase re-reads the caller's input, and no later phase reads text. What follows is pure
combinatorics on integers.

← [The Pipeline](./02-the-pipeline.md) | [Index](./README.md) | [Next: Structure →](./04-structure.md)
