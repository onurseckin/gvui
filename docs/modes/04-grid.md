← [Radial](./03-radial.md) | [Index](./README.md) | [Next: Engine Pipeline →](../engine/README.md)

# Grid Mode

Grid mode places nodes in rows, left to right, in the order they arrived. It never looks at an edge.

That is the entire algorithm, and it is the point. This is the mode you switch to when you want to
see **what the data is** rather than what the layout engine thinks of it, and the mode you reach for
when you need a drawing whose output you can predict by hand.

```text
   ┌──────────┐  ┌──────┐  ┌──────────────┐  ┌────────┐
   │    n0    │  │  n1  │  │      n2      │  │   n3   │     row 0
   └──────────┘  └──────┘  └──────────────┘  └────────┘

   ┌──────────┐  ┌──────┐  ┌──────┐          ┌────────┐
   │    n4    │  │  n5  │  │  n6  │          │   n7   │     row 1
   └──────────┘  └──────┘  └──────┘          └────────┘
     column 0     column 1    column 2        column 3
```

See [the implementation](../../crates/gvui/src/7_engines/7_4_grid.rs).

---

## How it works

### Columns

$$\texttt{cols} = \left\lceil \sqrt{n \cdot \texttt{target\_aspect\_ratio}} \right\rceil,
\qquad \texttt{rows} = \left\lceil n / \texttt{cols} \right\rceil$$

clamped to $1 \le \texttt{cols} \le n$. The clamp is load-bearing: a hostile `target_aspect_ratio`
would otherwise produce a zero-column grid (a division by zero) or more columns than there are nodes
(empty rows).

At the default aspect of 1.6, eight nodes give $\lceil\sqrt{12.8}\rceil = 4$ columns and 2 rows;
nine nodes at a square target of 1.0 give 3 columns and 3 rows.

### Column widths and row heights come from the measured boxes

Node boxes are not uniform — GVUI measures real text (see
[node measurement](../concepts/node-measurement.md)), so widths range from `min_node_width` (120) to
`max_node_width` (420). A grid built on one global cell size would be as wide as its widest node
everywhere, wasting most of the canvas.

So each column is as wide as the widest box **in that column**, and each row as tall as the tallest
box **in that row**:

$$\texttt{col\_width}[c] = \max_{i \equiv c \ (\mathrm{mod}\ \texttt{cols})} w_i,
\qquad \texttt{row\_height}[r] = \max_{\lfloor i/\texttt{cols}\rfloor = r} h_i$$

Column origins accumulate left to right with `effective_node_gap` (56) between them; row origins
accumulate top to bottom with `effective_rank_gap` (120). Each node is **centred in its cell**, so a
narrow node in a wide column still reads as belonging to that column.

### Worked example

Eight nodes, widths $200, 140, 320, 180, 240, 140, 160, 220$; heights all 76 except `n2` at 120.
Defaults: aspect 1.6, `node_gap` 56, `rank_gap` 120. So `cols = 4`, `rows = 2`.

| column | members | width |
| ---: | --- | ---: |
| 0 | n0 (200), n4 (240) | **240** |
| 1 | n1 (140), n5 (140) | **140** |
| 2 | n2 (320), n6 (160) | **320** |
| 3 | n3 (180), n7 (220) | **220** |

| row | members | height |
| ---: | --- | ---: |
| 0 | n0–n3 | **120** (n2 is tall) |
| 1 | n4–n7 | **76** |

Column origins: $0,\ 296,\ 492,\ 868$ — each is the previous origin plus that column's width plus
56. Row origins: $0,\ 240$.

Placing `n0` (200×76) in cell (0, 0): centred, so
$x = 0 + (240-200)/2 = 20$ and $y = 0 + (120-76)/2 = 22$.
Placing `n6` (160×76) in cell (1, 2): $x = 492 + (320-160)/2 = 572$, $y = 240$.

The whole drawing is then translated so its top-left corner sits at `graph_padding` (80), the same
final step every geometric engine shares.

### Edges

Straight lines from boundary to boundary, clipped to the two node boxes — the same
[routing helper](../../crates/gvui/src/7_engines/7_2_organic.rs) organic and radial use. Self-loops
are a bracket off the node's right side. Badges are placed by the same local greedy pass, with a
leader line when nothing fits.

Note what this means: a grid edge between distant cells will cut straight across whatever lies
between them. That is a property of straight-line drawing, not a defect in the placement, and
`EDGE_NODE_PENETRATION` is reported here as a warning rather than an error.

---

## What it guarantees

Because it consults nothing, grid mode is the cheapest correctness oracle in the engine — these hold
for **any** input:

- **No two boxes overlap.** Columns are separated by `node_gap`, rows by `rank_gap`, and every cell
  is at least as large as the widest box in its column and the tallest in its row.
- **Every node is positioned and every edge is routed.**
- **Positions depend only on input order.** The same dataset always draws identically, so a diff of
  two runs is a diff of the data — which is exactly what you want when you are chasing a bug
  somewhere else in the pipeline.
- **Shape follows `target_aspect_ratio`.**

## What it costs

$O(n)$ placement plus $O(E)$ routing. Measured **0.24 ms** on `dense_kubernetes_mesh` (30 nodes,
45 edges) — the fastest of the five engines, and the timing is essentially a function of node count
alone.

The price is legibility on anything but small or unrelated data. On that same dense mesh, grid
produces **99 crossings** (against organic's 8 and layered's 44 geometric) and needs **23 leader
lines** for its badges, because edges between arbitrary cells cross everything in their path. Those
are not bugs — they are what "ignore the topology" looks like when the topology is dense.

## When to use it

1. **Debugging the rest of the engine.** If a drawing looks wrong in layered mode, rendering the
   same dataset in grid mode tells you instantly whether the problem is in the layout or in the
   data, the measurement, or the renderer.
2. **Inventory views.** When the graph is really a list — every server in a cluster, every file in a
   directory — a grid is the most efficient shape for human eyes to scan, and edges are incidental.
3. **Very large graphs you only want to see the size of.** Grid is the one mode whose cost is
   effectively independent of edge count.

---

## Config

| knob | default | effect |
| --- | ---: | --- |
| `target_aspect_ratio` | 1.6 | sets the column count |
| `node_gap` | 56 | horizontal gap between columns |
| `rank_gap` | 120 | vertical gap between rows |
| `compaction` | `balanced` | scales both gaps (0.65 / 1.0 / 1.45) |
| `graph_padding` | 80 | outer margin |
| `label_placement`, `badge_clearance` | `beside-edge`, 10 | badge placement, shared with organic |

`direction`, `edge_style` and every layered knob are ignored.

---

← [Radial](./03-radial.md) | [Index](./README.md) | [Next: Engine Pipeline →](../engine/README.md)
