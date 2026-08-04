← [Modes Index](./README.md) | [Index](./README.md) | [Next: Organic →](./02-organic.md)

# Layered Mode

This is the default, and it is the mode most graphs should use. It draws a graph the way you would
draw a flowchart on a whiteboard: everything that happens first goes on the first row, everything
that follows goes on the row below, and edges run downhill.

```text
                    ┌──────────┐
                    │  ingest  │              rank 0
                    └────┬─────┘
              ┌──────────┴──────────┐
              ▼                     ▼
        ┌──────────┐          ┌──────────┐
        │  parse   │          │ validate │    rank 1
        └────┬─────┘          └────┬─────┘
             └──────────┬──────────┘
                        ▼
                  ┌──────────┐
                  │  store   │                rank 2
                  └──────────┘
```

The pipeline that produces this — cycle breaking, rank assignment, layering, crossing minimization,
routing demand, coordinate assignment, edge routing, emit — is nine phases and has its own section:
**[docs/engine/](../engine/README.md)**. Start there if you want to know *how* the drawing is
computed.

This page covers only what is specific to the mode as a user-facing choice: the `direction` knob,
and the `edge_style` knob.

See [the implementation](../../crates/gvui/src/7_engines/7_1_layered.rs).

---

## `direction`

Four values, declared in
[the config](../../crates/gvui/src/0_common/0_2_config.rs):

| value | ranks increase | reads as |
| --- | --- | --- |
| `top-down` (default) | downward | a flowchart |
| `bottom-up` | upward | a dependency tree, roots at the bottom |
| `left-right` | rightward | a timeline or swimlane |
| `right-left` | leftward | a timeline for a right-to-left script |

### The transposition trick

Here is the thing worth understanding, because v1 got it wrong and paid for it.

The pipeline is written to work in **exactly one frame**: ranks increase with $y$, and an item's
along-rank extent is its `width`. Every clamp, every separation, every lane count assumes that.
There is no `if direction == LeftRight` anywhere inside it.

To draw left-to-right, you do not write a second pipeline. You **swap the width and height of every
box on the way in**, run the one pipeline, and **reflect the result through the line $y = x$** on the
way out.

```text
  INPUT (what the caller measured)         TRANSPOSED (what the pipeline sees)

   ┌───────────────────────┐                     ┌────────┐
   │      "parse input"    │  76 tall            │        │
   │                       │                     │        │
   └───────────────────────┘                     │ "parse │  240 tall
            240 wide                             │ input" │
                                                 │        │
                                                 └────────┘
                                                  76 wide

  run Phases 0 → 9 in the top-down frame, then reflect through y = x:

        top-down result                         left-right result
   ┌───┐                                    ┌───┐    ┌───┐    ┌───┐
   │ A │  rank 0                            │ A │───▶│ B │───▶│ C │
   └─┬─┘                                    └───┘    └───┘    └───┘
     ▼                                      rank 0   rank 1   rank 2
   ┌───┐  rank 1
   │ B │
   └─┬─┘
     ▼
   ┌───┐  rank 2
   │ C │
   └───┘
```

The full table, from
[`layout_layered`](../../crates/gvui/src/7_engines/7_1_layered.rs):

| direction | on the way in | on the way out |
| --- | --- | --- |
| `top-down` | — | — |
| `bottom-up` | — | mirror on the vertical axis |
| `left-right` | swap every box's $(w, h)$ | transpose |
| `right-left` | swap every box's $(w, h)$ | transpose, then mirror on the horizontal axis |

**Why swap the boxes before ingest rather than after?** Because then every number the pipeline
computes is already expressed in the frame it will be drawn in. Node separation, port pitch, lane
counts, badge boxes, the rank-width cap — all of them come out correct without a single downstream
phase knowing which direction was asked for. If you transposed only the output, you would have laid
out 240-wide boxes side by side and then rotated them into a column 240 tall, and every horizontal
gap you carefully computed would now be a vertical one.

The mirror for `bottom-up`/`right-left` reflects across the **midline of the drawing's own bounding
box**, not across the origin. That keeps the result inside the same rectangle, so `graph_padding`
survives on all four sides and no renormalization pass is needed.

### What v1 did instead, and what it cost

v1 shipped `compute_left_right_layout`: a second, hand-written implementation of the whole layered
algorithm, plus a separate `transpose_layout_result` helper. Two implementations of the same idea
inevitably drift — a fix to one is not a fix to the other, and every new feature has to be written
twice or silently only works in one direction.

v2 has one pipeline plus a change of frame: swap the boxes in, map the coordinates out. The two
directions cannot disagree, because there is only one of them.

### One contract subtlety

Because the boxes are swapped *before* ingest, the clamps `min_node_width` (default 120) and
`max_node_width` (default 420), and the port-pitch driven width growth, all run **after** the swap.
In `left-right` and `right-left` they therefore constrain what the viewer perceives as node
**height**.

That is deliberate, not an oversight. Those knobs bound the *along-rank extent* — the axis that
ports are distributed along, and therefore the axis that has to grow when a node is busy. A caller
who wants a hard bound on the drawn horizontal size in LR mode must clamp the input boxes
themselves. This is documented on
[`transpose_nodes`](../../crates/gvui/src/7_engines/7_1_layered.rs).

### LR and TB do not produce mirror-image quality

On `dense_kubernetes_mesh` the two directions measure differently: 44 geometric crossings top-down
against 57 left-right, and a straight-chain ratio of 0.96 against 0.87.

That is expected rather than a defect. `balance_ranks` derives its rank-width cap from the *average
box aspect ratio*, and LR transposes every box — so a 240×76 box becomes a 76×240 box and the
balancer legitimately reaches a different conclusion about how wide a rank should be. A drawing that
is wide by nature should not be balanced like a tall one.

---

## `edge_style`

Four values. **None of them change the layout.** The engine emits a list of waypoints; the style
decides what SVG path command joins them, and that decision is made on the client by
[`buildEdgePath`](../../src/engine/layout/custom/edgePath.ts) from the stored `points` array.

Changing `edge_style` or `corner_radius` in the developer panel therefore re-renders instantly, with
no WASM call, no worker round trip, and no cache invalidation.

```text
  orthogonal                rounded (default)          spline                    straight
  sharp corners             corners arced              Catmull-Rom               ignore waypoints

   ┌───┐                     ┌───┐                      ┌───┐                     ┌───┐
   │ A │                     │ A │                      │ A │                     │ A │
   └─┬─┘                     └─┬─┘                      └─┬─┘                     └─┬─┘
     │                         │                         │                         └──┐
     └──────┐                  ╰──────╮                   ╰─────╮                     └──╮
            │                         │                          ╲                       ╲
            ▼                         ▼                           ▼                       ▼
          ┌───┐                     ┌───┐                       ┌───┐                    ┌───┐
          │ B │                     │ B │                       │ B │                    │ B │
          └───┘                     └───┘                       └───┘                    └───┘
```

| value | what the renderer emits | notes |
| --- | --- | --- |
| `orthogonal` | `M`/`L` through every waypoint | crispest; every segment axis-aligned |
| `rounded` (default) | `M`/`L` with each interior corner replaced by a quadratic arc of radius $\min(\texttt{corner\_radius},\ \tfrac{1}{2}\ell_{in},\ \tfrac{1}{2}\ell_{out})$ | `corner_radius` defaults to 8; clamping against half of each adjacent segment means two neighbouring corners can never claim overlapping arcs |
| `spline` | Catmull-Rom through the waypoints, converted to cubic Béziers | smooth; the waypoints are unchanged, so the edge still respects its routing lane |
| `straight` | `M first L last`, interior waypoints discarded | draws the chord; will cut through whatever the router was avoiding |

The `layered-spline` mode is nothing more than `layered` with `edge_style` set to `spline`. Both
resolve to the same `layout_layered` function, and a test in
[the facade](../../crates/gvui/src/7_engines/7_5_facade.rs) asserts that the two modes produce
byte-identical node geometry.

### One place the style is not purely cosmetic

Phase 9's validation includes a `NON_ORTHOGONAL_SEGMENT` check: it verifies that every emitted
segment really is axis-aligned. That check is skipped when `edge_style` is `spline` or `straight`,
because those styles are diagonal by design. See
[the constraint checks](../../crates/gvui/src/6_validation/6_1_constraints.rs).

The geometric engines exploit the same rule from the other side: they evaluate their own constraints
against a config clone whose `edge_style` is forced to `straight`, so a caller's `rounded` setting —
which is about how the *layered* engine renders — cannot turn a correct organic drawing into a hard
failure.

---

## Config knobs that matter most here

All defaults from [the config](../../crates/gvui/src/0_common/0_2_config.rs).

| knob | default | effect |
| --- | ---: | --- |
| `node_gap` | 56 | minimum separation between adjacent items in a rank |
| `rank_gap` | 120 | minimum separation between rank bands; routing channels may raise it |
| `compaction` | `balanced` | multiplies every gap by 0.65 (`tight`), 1.0, or 1.45 (`airy`) |
| `target_aspect_ratio` | 1.6 | drives the rank-width cap when `max_nodes_per_rank` is 0 |
| `balance_ranks` | `true` | whether rank balancing runs at all |
| `ranker` | `network-simplex` | rank assignment algorithm |
| `ordering` | `median` | two-layer ordering heuristic |
| `coordinator` | `brandes-kopf` | horizontal coordinate assignment |

Each is explained where it is used, in [docs/engine/](../engine/README.md).

---

← [Modes Index](./README.md) | [Index](./README.md) | [Next: Organic →](./02-organic.md)
