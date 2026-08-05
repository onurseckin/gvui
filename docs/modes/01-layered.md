← [Modes Index](./README.md) | [Index](./README.md) | [Next: Radial →](./02-radial.md)

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
**[docs/engine/](../engine/README.md)**. Start there if you want to know _how_ the drawing is
computed.

This page covers only what is specific to the mode as a user-facing choice: the `direction` knob,
the `edge_style` knob, and the v3 routing knobs that change what the drawing looks like without
changing which engine ran.

See [the implementation](../../crates/gvui/src/7_engines/7_1_layered.rs).

---

## `direction`

Four values, declared in
[the config](../../crates/gvui/src/0_common/0_2_config.rs):

| value                | ranks increase | reads as                               |
| -------------------- | -------------- | -------------------------------------- |
| `top-down` (default) | downward       | a flowchart                            |
| `bottom-up`          | upward         | a dependency tree, roots at the bottom |
| `left-right`         | rightward      | a timeline or swimlane                 |
| `right-left`         | leftward       | a timeline for a right-to-left script  |

**`direction` is a config field and nothing else.** It is not part of the mode. Until v3 it was
both — `left-right` and `bottom-up` were also mode strings — and because the client sends a fully
resolved config in which `direction` is always present, the rule "explicit direction wins over the
mode's" discarded the mode's direction every single time. Selecting `left-right` drew a top-down
graph. [`EngineMode::from_mode_str`](../../crates/gvui/src/0_common/0_2_config.rs) now returns no
direction at all, which is the only version of the fix that cannot regress: there is no second copy
left to disagree with the first. Legacy strings are still recovered — see
[the modes index](./README.md#why-this-used-to-be-broken).

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

| direction    | on the way in             | on the way out                                |
| ------------ | ------------------------- | --------------------------------------------- |
| `top-down`   | —                         | —                                             |
| `bottom-up`  | —                         | mirror on the vertical axis                   |
| `left-right` | swap every box's $(w, h)$ | transpose                                     |
| `right-left` | swap every box's $(w, h)$ | transpose, then mirror on the horizontal axis |

**Why swap the boxes before ingest rather than after?** Because then every number the pipeline
computes is already expressed in the frame it will be drawn in. Node separation, port pitch, lane
counts, badge boxes, the rank-width cap — all of them come out correct without a single downstream
phase knowing which direction was asked for. If you transposed only the output, you would have laid
out 240-wide boxes side by side and then rotated them into a column 240 tall, and every horizontal
gap you carefully computed would now be a vertical one.

The mirror for `bottom-up`/`right-left` reflects across the **midline of the drawing's own bounding
box**, not across the origin. That keeps the result inside the same rectangle, so `graph_padding`
survives on all four sides and no renormalization pass is needed. A mirror also has to move the port
_sides_ — a `Bottom` port becomes a `Top` port under a vertical mirror — but it deliberately does
**not** reverse polyline point order, because source-to-target is a property of the edge, not of the
frame it is drawn in.

### What v1 did instead, and what it cost

v1 shipped `compute_left_right_layout`: a second, hand-written implementation of the whole layered
algorithm, plus a separate `transpose_layout_result` helper. Two implementations of the same idea
inevitably drift — a fix to one is not a fix to the other, and every new feature has to be written
twice or silently only works in one direction.

Today there is one pipeline plus a change of frame: swap the boxes in, map the coordinates out. The
two directions cannot disagree, because there is only one of them.

### One contract subtlety

Because the boxes are swapped _before_ ingest, the clamps `min_node_width` (default 120) and
`max_node_width` (default 420), and the port-pitch driven width growth, all run **after** the swap.
In `left-right` and `right-left` they therefore constrain what the viewer perceives as node
**height**.

That is deliberate, not an oversight. Those knobs bound the _along-rank extent_ — the axis that
ports are distributed along, and therefore the axis that has to grow when a node is busy. A caller
who wants a hard bound on the drawn horizontal size in LR mode must clamp the input boxes
themselves. This is documented on
[`transpose_nodes`](../../crates/gvui/src/7_engines/7_1_layered.rs).

### LR and TD do not produce mirror-image quality

`bottom-up` is a pure output mirror, so it produces **the same metrics as `top-down` on every
dataset in the audit** — identical rank counts, crossings and bends. A reflection cannot change how
many times two lines cross.

`left-right` is a different story, because it transposes the input:

| dataset                          | `top-down`             | `left-right`           |
| -------------------------------- | ---------------------- | ---------------------- |
| `multi_component_tenants`        | 7 ranks, 24 bends      | **5 ranks, 12 bends**  |
| `feedback_retry_state_machine`   | 2 geometric crossings  | 6 geometric crossings  |
| `microservice_platform_topology` | 22 geometric crossings | 24 geometric crossings |
| `peer_mesh_service_registry`     | 78 bends               | 76 bends               |

That spread is expected rather than a defect. `balance_ranks` derives its rank-width cap from the
_average box aspect ratio_, and LR transposes every box — so a 240×76 box becomes a 76×240 box and
the balancer legitimately reaches a different conclusion about how wide a rank should be. A drawing
that is wide by nature should not be balanced like a tall one. On `multi_component_tenants` that
conclusion happens to be much better; on `feedback_retry_state_machine` it is worse. Neither is a
bug, and neither direction dominates.

---

## `edge_style`

Five values. **Four of them do not change the layout.** The engine emits a list of waypoints; the
style decides what SVG path command joins them, and that decision is made on the client by
[`buildEdgePath`](../../src/engine/layout/custom/edgePath.ts) from the stored `points` array.
Changing `edge_style` or `corner_radius` in the settings panel therefore re-renders instantly, with
no WASM call, no worker round trip, and no cache invalidation.

`octilinear` is the exception, and it is the interesting one: it changes the emitted points, so it
runs in Rust and does cost a re-layout.

```text
  orthogonal        rounded (default)   octilinear          spline              straight
  sharp corners     corners arced       corners chamfered   Catmull-Rom         chord only

   ┌───┐             ┌───┐               ┌───┐               ┌───┐               ┌───┐
   │ A │             │ A │               │ A │               │ A │               │ A │
   └─┬─┘             └─┬─┘               └─┬─┘               └─┬─┘               └─┬─┘
     │                 │                   │                   │                   ╲
     │                 │                   ╲                    ╲                   ╲
     └────┐            ╰────╮               ╲───╮                ╰───╮               ╲
          │                 │                   │                    ╲                ╲
          ▼                 ▼                   ▼                     ▼                ▼
        ┌───┐             ┌───┐               ┌───┐                 ┌───┐            ┌───┐
        │ B │             │ B │               │ B │                 │ B │            │ B │
        └───┘             └───┘               └───┘                 └───┘            └───┘
```

The same single corner, zoomed in, is what actually distinguishes them:

```text
     orthogonal              rounded                 octilinear

     ──────────┐             ──────────╮             ────────╮
               │                       │                      ╲
               │                       │                       │
               │                       │                       │

     one vertex,             one vertex, drawn as    TWO vertices, each `c`
     drawn as an             a quadratic arc of      back along its own leg;
     `L` command             radius r                the join is a real 45° segment
```

| value               | what the renderer emits                                                                                                                                  | notes                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `orthogonal`        | `M`/`L` through every waypoint                                                                                                                           | crispest; every segment axis-aligned                                                                                                          |
| `rounded` (default) | `M`/`L` with each interior corner replaced by a quadratic arc of radius $\min(\texttt{corner\_radius},\ \tfrac{1}{2}\ell_{in},\ \tfrac{1}{2}\ell_{out})$ | `corner_radius` defaults to 8; clamping against half of each adjacent segment means two neighbouring corners can never claim overlapping arcs |
| `spline`            | Catmull-Rom through the waypoints, converted to cubic Béziers                                                                                            | smooth; the waypoints are unchanged, so the edge still respects its routing lane                                                              |
| `octilinear`        | `M`/`L` through every waypoint — **a plain polyline**                                                                                                    | the diagonals are already _in_ the points; see below                                                                                          |
| `straight`          | `M first L last`, interior waypoints discarded                                                                                                           | draws the chord; will cut through whatever the router was avoiding                                                                            |

The renderer draws `octilinear` with the same code path as `orthogonal`, and that is not a
shortcut. The engine has already replaced each right-angle corner with a 45-degree chamfer, so the
chamfer segments **are** the corners. Rounding them a second time would eat the geometry that makes
the style look different, and would round the chamfer's own two shallow joints into a wobble. The
reasoning is on [`buildEdgePath`](../../src/engine/layout/custom/edgePath.ts).

### Octilinear: why it is a post-pass and not a router

`EdgeStyle::Octilinear` is implemented by
[`chamfer_corners`](../../crates/gvui/src/5_edge_routing/5_5_edge_style.rs), which runs **after** the
orthogonal polyline is finished. For a corner `prev → cur → next`, the vertex `cur` becomes two
vertices, each offset from it along its own leg by

$$c = \min\bigl(\max(\texttt{corner\_radius},\ 12),\ \tfrac{1}{2}\min(\ell_{in}, \ell_{out})\bigr)$$

and the two are joined by a true 45-degree segment. The corner is left square when it is not a right
angle, when the chamfer would be sub-epsilon, or when the resulting diagonal would touch a node's
box (grown by 2 px, so a diagonal that merely grazes a corner is refused — it is geometrically
outside but reads as a collision).

The floor of 12 px exists so one knob drives both looks: an 8 px chamfer on a 120 px node reads as a
rendering artefact rather than as a diagonal.

**Why not build an eight-direction router instead?** Because of what the lane model buys.

```text
   the lane model                            an octilinear channel

   ┌───────┐   ┌───────┐                     ┌───────┐   ┌───────┐
   └───────┘   └───────┘                     └───────┘   └───────┘
   ═══════════════════════  lane 0             ╲    ╱  ╲      ╱
   ═══════════════════════  lane 1              ╲  ╱    ╲    ╱
   ═══════════════════════  lane 2               ╲╱      ╲  ╱
   ┌───────┐   ┌───────┐                     ┌───────┐   ┌───────┐
   └───────┘   └───────┘                     └───────┘   └───────┘

   every segment is an interval on            a diagonal is an interval on
   one axis; the conflict graph is an         NEITHER axis, and the conflict
   interval graph, and interval graphs        graph of a set of diagonals is
   are optimally colourable in one sweep      not perfect — no exact colouring
```

That colouring is why Phase 6 can reserve the exact space every segment will need _before any
geometry exists_, and therefore why routing in this engine **cannot fail**: there is no rip-up, no
reroute, no budget to exhaust. A true eight-direction router would replace that exact reservation
with a search, and hand back the guarantee that every edge routes.

The chamfer buys most of the visual benefit while keeping the guarantee, because every rejection is
local and independent. A blocked chamfer leaves one square corner; it does not roll anything back
and has no way to report failure. Total path length never increases either — each applied chamfer
trades $2c$ of axis-aligned travel for $c\sqrt{2}$, a saving of $c(2 - \sqrt{2})$ per corner.

If it looks good, the door to a real octilinear router is still open. It is just not open for free.

### One place the style is not purely cosmetic

Phase 9's validation includes a `NON_ORTHOGONAL_SEGMENT` check: it verifies that every emitted
segment really is axis-aligned. That check is skipped when `edge_style` is `spline`, `straight` or
`octilinear`, because those styles are diagonal by design. See
[the constraint checks](../../crates/gvui/src/6_validation/6_1_constraints.rs).

The radial engine exploits the same rule from the other side: it evaluates its own constraints
against a config clone whose `edge_style` is forced to `straight`, so a caller's `rounded` setting —
which is about how the _layered_ engine renders — cannot turn a correct radial drawing into a hard
failure.

---

## The v3 routing knobs

These three changed what a layered drawing looks like without touching the pipeline's shape. All
default **on**; each is explained where it is implemented, in
[docs/engine/10-edge-routing.md](../engine/10-edge-routing.md).

### `flexible_port_sides` and `flow_side_bias`

Before v3, port side was a fixed table: every forward edge left the source's `Bottom` face and
entered the target's `Top` face. A target that is mostly _sideways_ therefore had to dog-leg to get
there. Now all four faces are candidates and
[`best_side_pair`](../../crates/gvui/src/5_edge_routing/5_1_ports.rs) scores the sixteen
`(source_side, target_side)` combinations with a closed-form cost, lexicographically by
`(bends, flow_penalty + length/1000, congestion, candidate order)`, and takes the minimum. Sixteen
combinations _evaluated_, not searched — v1 also tried sixteen, then searched again to repair the
crossings that produced.

`flow_side_bias` (default 1.0) is what keeps a hierarchy reading top-to-bottom: it charges one unit
per end that is not on the rank-flow face, and one unit is worth a kilopixel of path. In practice a
side face is chosen only when it strictly _reduces_ the bend count.

**Why this cannot break Phase 6's reservation.** A side port still descends into the channel below
its own rank — Step 5.2 drops from the port stub straight to the channel and runs horizontally from
there. The travel through the layered structure is unchanged; only the last few pixels before the
node boundary move. What does change is _where_ the descent happens: outside a vertical face rather
than inside the node's own width, i.e. in the gap between the node and its rank neighbour. That gap
is Phase 6's corridor, and a vertical face is refused unless the corridor is at least two stub
lengths wide, which keeps the descent out of the neighbour's interior by construction.

### `straight_shot_alignment`

Slides a source and a target port onto a common coordinate when that collapses a dog-leg into one
straight segment. A `Top`/`Bottom` port is _free_ — it drops wherever it sits along the face — while
a `Left`/`Right` port is _fixed_, dropping exactly `port_stub_length` outside its face. So both-free
ends meet in the middle, one-free ends move onto the fixed drop, and both-fixed ends do nothing.

It is the other half of `flexible_port_sides`: a vertical face is only ever chosen because the
scorer expects the _other_ end to come and meet the x it drops at, and this is the pass that makes
it do so. Measured during the v3 pass: **92 → 61 bends on a 24-node graph.**

A snap is refused unless the moved port stays inside the face's padding and at least `port_pitch`
from its neighbours on that face. Those neighbours were sorted into a crossing-free order by Phase
8b, so keeping the port strictly between them is what stops alignment from re-introducing the
crossings the sort removed.

### `same_rank_peer_edges`

Two siblings joined by an edge used to be forced onto different ranks and connected vertically,
because every edge carried `min_len >= 1`. Peer edges — endpoints that share a predecessor, with no
other directed path between them — now get `min_len = 0`, so the ranker is _allowed_ to put them
side by side and join them with a straight horizontal line.

This made `FlatEdge` reachable for the first time. It was dead code: `span == 0` was impossible, so
the flat-edge router had never run on a real graph.

Measured, by turning it off:

| dataset                        |           peers on |          peers off |
| ------------------------------ | -----------------: | -----------------: |
| `peer_mesh_service_registry`   |  7 ranks, 78 bends | 15 ranks, 98 bends |
| `heavy_label_data_contracts`   |            4 bends |           12 bends |
| `ai_agent_trace`               |           28 bends |           36 bends |
| `feedback_retry_state_machine` | 15 ranks, 44 bends | 17 ranks, 50 bends |

**The subtlety worth documenting.** A labelled edge is drawable at span 0 or span ≥ 2, and at no
other value:

```text
   span 0                     span 1                    span 2

   ┌───┐  ┌────┐  ┌───┐       ┌───┐                     ┌───┐
   │ A │──│ ×2 │──│ B │       │ A │                     │ A │
   └───┘  └────┘  └───┘       └─┬─┘                     └─┬─┘
                                │   ← nowhere to put    ┌─┴──┐
   flat edge; the badge          │     the badge        │ ×2 │  ← a `Label` item
   rides the horizontal        ┌─▼─┐                    └─┬──┘    with a reserved box
   run, and Phase 6 widened    │ B │                     ┌─▼─┐
   the corridor to fit it      └───┘                     │ B │
                                                         └───┘
```

At span 1 there is no intermediate rank to carry the `Label` item, so `build_layered` degrades to
`label_at = None` and the badge falls through to Phase 8's positional safety net — which is allowed
to emit a leader line and is covered by no reservation.
[`enforce_labelled_span`](../../crates/gvui/src/2_rank_assignment/2_4_rank_facade.rs) pushes any
labelled edge left at span 1 back apart.

It runs as the **last** step of Phase 3, after balancing, and the ordering is load-bearing: a
labelled edge relaxed to `min_len = 0` can legitimately land at span 0, and it is `balance_ranks`
that then pushes the target down one and creates the bad case. An earlier revision ran the check
before balancing, i.e. against a rank vector that balancing went on to invalidate. The symptom was
one badge with a leader line overlapping two nodes in scenario 17 — the only constraint violation in
the whole suite.

---

## Config knobs that matter most here

All defaults from [the config](../../crates/gvui/src/0_common/0_2_config.rs).

| knob                      |           default | effect                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ----------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `direction`               |        `top-down` | flow direction; the only place it is set                                                                                                                                                                                                                                                               |
| `edge_style`              |         `rounded` | how waypoints are joined; only `octilinear` costs a re-layout                                                                                                                                                                                                                                          |
| `corner_radius`           |                 8 | arc radius for `rounded`; also the chamfer size for `octilinear`, floored at 12                                                                                                                                                                                                                        |
| `label_placement`         |         `on-edge` | badge centred on the edge, the line passing behind it. The old `beside-edge` default put the badge in the right half of a double-width label item and needed a dashed connector to reach the anchor; the renderer now draws that connector only when the anchor genuinely falls outside the badge rect |
| `node_gap`                |                56 | minimum separation between adjacent items in a rank                                                                                                                                                                                                                                                    |
| `rank_gap`                |               120 | minimum separation between rank bands; routing channels may raise it                                                                                                                                                                                                                                   |
| `compaction`              |        `balanced` | multiplies every gap by 0.65 (`tight`), 1.0, or 1.45 (`airy`)                                                                                                                                                                                                                                          |
| `target_aspect_ratio`     |               1.6 | drives the rank-width cap when `max_nodes_per_rank` is 0                                                                                                                                                                                                                                               |
| `balance_ranks`           |            `true` | whether rank balancing runs at all                                                                                                                                                                                                                                                                     |
| `flexible_port_sides`     |            `true` | score all four faces per endpoint instead of forcing Bottom → Top                                                                                                                                                                                                                                      |
| `flow_side_bias`          |               1.0 | how strongly a forward edge still prefers the rank-flow faces                                                                                                                                                                                                                                          |
| `straight_shot_alignment` |            `true` | snap two ports to a common coordinate to collapse a dog-leg                                                                                                                                                                                                                                            |
| `same_rank_peer_edges`    |            `true` | let peer edges relax to `min_len = 0` and route flat                                                                                                                                                                                                                                                   |
| `bundle_parallel_edges`   |            `true` | route parallel edges between one node pair as a single bus                                                                                                                                                                                                                                             |
| `ranker`                  | `network-simplex` | rank assignment algorithm                                                                                                                                                                                                                                                                              |
| `ordering`                |          `median` | two-layer ordering heuristic                                                                                                                                                                                                                                                                           |
| `coordinator`             |    `brandes-kopf` | horizontal coordinate assignment                                                                                                                                                                                                                                                                       |

Each is explained where it is used, in [docs/engine/](../engine/README.md).

---

← [Modes Index](./README.md) | [Index](./README.md) | [Next: Radial →](./02-radial.md)
