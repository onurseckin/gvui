← [Coordinate Assignment](./09-coordinate-assignment.md) | [Index](./README.md) | [Next: Emit and Quality →](./11-emit-and-quality.md)

# Chapter 10: Edge Routing

Every node has a final position. Every routing lane was reserved two phases ago. This chapter draws
the lines.

It is the shortest phase in the engine to explain and it used to be the longest by far, so it is
worth starting with what it replaced.

---

## 1. What v1 did, and why it collapsed

v1 treated routing as a **pathfinding problem**. Conceptually reasonable: you have obstacles (the
nodes), you have a start and an end (the ports), find a nice orthogonal path between them. In
practice it went like this.

### The grid

To search, you need a discrete space. v1 built a **routing grid**: the dense Cartesian product of
every X coordinate and every Y coordinate derived from ports, node bounds, and `lane_rings` —
concentric rings drawn around every node to give paths somewhere to go.

Measured on `kubernetes_cluster_topology`, a **12-node** graph:

```text
   |X| = 86 distinct x coordinates
   |Y| = 65 distinct y coordinates
   ────────────────────────────────
   4,934 live grid vertices
   10,294 grid edges
```

Roughly 400 grid vertices per node. Every A\* expansion did a `String`-keyed hash lookup on
`grid.vertices`, a second on `grid.vertex_index_map`, a `String` clone of the vertex id, and a
**linear scan over all N node rectangles** for the forbidden test — there was no spatial index
anywhere in the router.

### The search

A\* per edge, with a bend penalty folded into the state (the state was `(x, y, direction)`, so a
turn could cost more than a straight step). Measured cost: **25–65 ms per edge**. The nominal
budget `max_astar_states_per_route` was 8,000, but the effective bound was
`max(32000, endpoint_dist × 8)`, so it rarely bound anything.

### The ledger

Once an edge was routed it claimed grid cells, so later edges could be charged a crossing penalty
or refused an overlapping collinear run. `commit_reservations` built a split-point vector of
$(|X| + |Y|) \times \text{segments}$ points and then **re-split every existing reservation against
it**, with an $O(k^2)$ dedup inside. Reservations grew to 3,276 for 45 edges and per-commit cost
climbed monotonically from 0 ms to 24 ms.

### The retry loop

And then the killer: because routing edges one at a time makes the *order* matter, v1 tried many
orders.

```text
   up to  4 order variants
        × 12 rip-up passes
        × 32 conflict permutations
        , each followed by a full O(E²) validate_custom_layout
```

Config sweep on fixed node positions:

| config | k8s topology | dense mesh |
| --- | ---: | ---: |
| default (4 variants, 12 rip-up, 32 perms) | 7,466 ms | 15,537 ms |
| 1 variant | 1,810 ms | 3,044 ms |
| 1 variant + `maxConflictPermutations = 1` | **150 ms** | 3,033 ms |

For `kubernetes_cluster_topology` the permutation loop cost **12×** and produced an *identical*
result: 13 routes, 4 crossings, valid. The order-variant loop cost **4×** for no measured gain.

### The totals

Phase-level instrumentation of a single v1 pipeline pass:

```text
   kubernetes_cluster_topology (12n 13e)
     cycle=0.18  rank=0.03  crossmin=0.02  layer-opt=0.19  coord=0.16
     ROUTE=4979.2ms   BADGE=6.0ms   VALIDATE=0.1ms

   dense_kubernetes_mesh (30n 45e)
     cycle=1.06  rank=0.05  crossmin=0.01  layer-opt=10.24  coord=0.31
     ROUTE=19605.4ms  BADGE=95.3ms  VALIDATE=0.4ms
```

**Routing was 99.5%+ of the cost.** Everything else was noise.

### The actual diagnosis

The interesting thing is not that A\* was slow. It is *why* there was a search at all.

v1 searched because **it did not know how much space it had**. Node positions were fixed before
anyone asked how many edges would need to pass between them, so routing was handed a drawing that
might or might not have room, and had to discover the answer by trying. Rip-up and reroute is what
you build when a route can fail. Order variants are what you build when a route failing depends on
which route went first.

v2 removes the search by removing the uncertainty. [Phase 6](./08-routing-demand.md) computes the
exact lane demand from the fixed ordering *before any geometry exists*, and
[Phase 7](./09-coordinate-assignment.md) honours it exactly. By the time this phase runs, the space
is already there.

**v2 does no pathfinding at all.** There is no grid, no search, no occupancy ledger, no rip-up, no
reroute, and no fallback path.

---

## 2. What Phase 8 actually is

Three inputs, all already fixed:

```text
   ports            ← this phase, step 1: a table lookup and a sort
   lane per link    ← Phase 6: interval-graph colouring
   item coordinates ← Phase 7: Brandes–Köpf
        │
        ▼
   polyline         ← pure evaluation. No decisions.
```

The module doc in
[`5_2_lane_router.rs`](../../crates/gvui/src/5_edge_routing/5_2_lane_router.rs) puts it as bluntly
as it can be put: *"This module contains no search, no grid, no collision test and no repair."*

---

## 3. Port sides are determined by a table

An edge has to attach *somewhere* on its endpoints' boundaries. v1 tried all sixteen
`(source_side, target_side)` combinations per edge, then searched again to repair the crossings
that produced.

v2 looks the answer up. In the engine's internal top-down frame:

| edge kind | source side | target side |
| --- | --- | --- |
| chain edge (spans ≥ 1 rank) | **Bottom** | **Top** |
| flat edge (same rank) | **Right** if `from.x ≤ to.x`, else **Left** | the opposite side |
| self-loop | **Right** | **Right** |

That is the whole rule, and it is what a human would draw anyway.

Two things this table does *not* contain:

**Direction.** `LeftRight`, `BottomUp` and `RightLeft` are handled as a change of coordinate frame
applied around the entire pipeline — boxes are transposed before ingest, and results are transposed
and mirrored after emit. [`5_1_ports.rs`](../../crates/gvui/src/5_edge_routing/5_1_ports.rs) never
branches on direction.

**Feedback edges.** Phase 2 reversed them — it swapped their endpoints — so by the time they reach
this phase they are ordinary `Bottom → Top` chains in the internal frame, and they are deliberately
*not* special-cased. [Phase 9](./11-emit-and-quality.md) flips the arrowhead back at the very end.
(The v2 design note proposed giving feedback edges a distinctive shape — out of the bottom and back
into the bottom via a side corridor. The implementation does not do that; feedback edges are drawn
like any other edge and are distinguished only by direction and by the renderer's styling.)

Flat-edge sides compare `from.x ≤ to.x`. Items within a rank never overlap, so comparing left edges
is the same as comparing centres and is stable under differing widths.

---

## 4. Port order along a side is a sort — and that is the whole crossing story

Once you know an edge uses a node's bottom side, you still have to pick *where* along that side.
This single rule does almost all the work:

> Sort the ports on a node's **bottom** side by the `order` of the item in rank `r+1` the chain
> runs to. Sort the ports on the **top** side by the `order` of the item in rank `r-1` it comes
> from.

Why it works: [Phase 5](./07-crossing-minimization.md) already minimized crossings *between* ranks.
If node A sends edges to items at orders 1, 4 and 6 in the next rank, and those ports are placed
left-to-right in that same sequence, then those three edges leave A in the same left-to-right order
they arrive in below. They cannot cross **each other** near the node.

```text
   UNSORTED (ports in edge-declaration order)     SORTED (ports by target order)

        ┌──────────────────┐                          ┌──────────────────┐
        │        A         │                          │        A         │
        └──┬─────┬─────┬───┘                          └──┬─────┬─────┬───┘
           │     │     │                                 │     │     │
           └──╲ ╱└─╲  ╱┘                                 │     │     │
              ╳    ╲╱                                    │     │     │
           ╱─╱ ╲   ╱╲                                    │     │     │
        ┌──┴┐ ┌─┴─┐ ┌┴──┐                            ┌───┴┐ ┌──┴─┐ ┌─┴──┐
        │ B │ │ C │ │ D │                            │ B  │ │ C  │ │ D  │
        └───┘ └───┘ └───┘                            └────┘ └────┘ └────┘
        order 0   1    2                             order 0    1     2

        three avoidable crossings                    zero
```

Cost: $O(\deg \log \deg)$ per node. Compare with v1, which searched port assignments in an outer
loop and re-ran the entire A\* router — grid, ledger, rip-up and all — for every candidate port
state.

Flat-edge ports on `Left`/`Right` sides sort by the **other endpoint's y** instead, using
`total_cmp` rather than `partial_cmp` so a NaN coordinate cannot make the comparator inconsistent
and the sort order implementation-defined. Every sort ends with the edge index as a tie-break, so
the result is byte-identical across runs.

---

## 5. Port spacing, and where node growth actually happens

With `n` ports to place on a side of length `L`:

$$\text{pitch} = \frac{L - 2 \cdot \text{portEndpointPadding}}{n + 1}, \qquad
\text{offset}_i = \text{portEndpointPadding} + (i+1) \cdot \text{pitch}$$

The `n + 1` divisor is what leaves a gap at both ends instead of parking the first and last port on
the corners.

**Worked example.** A node 300 wide with 3 bottom ports, default `portEndpointPadding = 16`:

$$\text{pitch} = \frac{300 - 32}{4} = 67$$

giving ports at x-offsets **83, 150, 217**. Symmetric, and 83px clear of each corner.

### When the node is too narrow

A node with 40 edges and a 120px side would need a pitch of under 3px. The right answer is to make
the node wider — and that happens in **Phase 0**, not here. Ingest computes each node's degree and
grows its box to fit its port count, clamped at `max_node_width` (default 420). Node width is an
input to ranking, ordering and separation, so it has to be final long before this phase runs.

Which means the crowded branch here only fires when Phase 0's growth **hit the clamp**. At that
point the coordinates are already final and the node cannot be widened, so ports are allowed to
crowd instead:

```rust
const CROWDED_MIN_PITCH: f64 = 2.0;
// pitch pinned at 2.0; the run is re-centred on the side:
//   base = side_length / 2.0 - (n + 1) * pitch / 2.0
```

Re-centring rather than overflowing keeps the invariant that **every port lies on the node
boundary** intact. Ports piled onto a corner would break that more visibly than dense ports do, and
downstream validation checks it exactly.

### Stubs

Every `PortRef` carries both the boundary `point` and a `stub` exactly `port_stub_length` (default
20) along the side's outward normal. A router can emit `point → stub` as its first segment without
re-deriving the direction, and the stub is what guarantees an edge leaves its node perpendicular
before it turns.

---

## 6. Materialising the polyline

Now the actual drawing, in
[`route_chain_with_bands`](../../crates/gvui/src/5_edge_routing/5_2_lane_router.rs).

### Where a channel lives

$$\text{bandBottom}(r) = \text{rankTop}(r) + \max_{i \in r} \text{height}(i)$$

$$\text{channelY} = \text{bandBottom}(r) + \text{portStubLength} + (\text{lane} + 0.5) \cdot
\text{laneSpacing}$$

The `+ 0.5` centres the run inside its lane. The lane index comes from
`demand.lane_of_link[(edge, link)]` — Phase 6's colouring. A missing entry defaults to lane 0,
which is the only choice that keeps the route inside the reserved gap.

`rank_band_bottoms` is computed **once** per phase and passed in. The naive alternative rescans a
rank for every link that starts in it, which is $O(\text{links} \times \text{rank width})$ over the
whole graph.

### The loop

For each link `(from, to)` of the chain:

```text
   from_x   = source stub x    if this is the first link, else pass_x(from)
   to_x     = target stub x    if this is the last link,  else pass_x(to)

   push (from_x, channelY)          ← drop into the channel
   push (to_x,   channelY)          ← run along the channel

   if last link:  push target stub, push target port point
   else:          push (to_x, bandEntryY(to)), push (to_x, to.y + to.height)
```

The two interior points traverse a dummy or label item vertically through its band. They are
usually collinear with the channel drops on either side and vanish in simplification; they exist so
that a label under `AboveEdge` placement can pull the traversal down to its bottom face without a
special case in the loop.

`pass_x` is where a chain crosses an item's band:

| item kind | `pass_x` |
| --- | --- |
| dummy | `center_x` — this is what keeps a Brandes–Köpf-aligned chain perfectly straight |
| label, `BesideEdge` (default) | `item.x + item.width / 4` — down the middle of the reserved **left half**; the badge occupies the right half |
| label, `OnEdge` / `AboveEdge` | `center_x` |

Under `BesideEdge`, Phase 4 reserves a **double-width** label item: the left half is the edge's own
lane, the right half is the badge. That is why `label_box_width()` exists — a caller wanting the
badge's own width must not read `item.width`.

### Simplification

`simplify_polyline` drops zero-length steps and interior points that lie on the straight run
through their neighbours. Two properties are load-bearing:

- **Endpoints are preserved bit-exactly.** The first and last elements of the result are
  bit-identical copies of the input's, never a deduplicated near-neighbour. Phase 9 checks that a
  route starts and ends on a node boundary by exact comparison against the port point, so a
  sub-epsilon drift here would read as a hard constraint violation.
- **A backtracking spike is preserved.** A point is only dropped when the path continues *forward*
  through it. Removing a spike would change the drawn shape, not simplify it.

Collinearity is measured as perpendicular distance from the segment `prev → next`, so the function
is correct for diagonal (spline / straight style) polylines too, not just axis-aligned ones.

### Two worked routes

**Aligned span-1 edge.** A above B, both 100 wide, both centred on the same x. Source port at
(50, 40), target port at (50, 200), and every intermediate point lands on x = 50. Simplification
collapses everything to **two points** — a straight vertical line, no bends.

**Span-2 edge through a dummy.** A at rank 0, a dummy at rank 1, B at rank 2, all at different x:

```text
                 ┌──────────┐
                 │    A     │
                 └────┬─────┘
                      │            ← stub, straight down
        ══════════════┴═══════╗    ← channel below rank 0, lane l
                              ║
                              •    ← dummy at rank 1, traversed at its centre x
                              ║
                  ╔═══════════╝    ← channel below rank 1
                  ║
                  │                ← stub, straight down
             ┌────┴─────┐
             │    B     │
             └──────────┘
```

Every emitted segment is axis-aligned. The dummy's centre is where the route crosses rank 1 — so if
Brandes–Köpf aligned that dummy with something above and below it, the two channel runs vanish and
this becomes a straight line too.

### Why the channel provably fits

This is the arithmetic that makes "routing cannot fail" a statement rather than a hope. Phase 6
sized the gap below rank `r` as

$$\text{gap} \ge \text{lanes} \cdot \text{laneSpacing} + 2 \cdot \text{portStubLength}$$

With defaults (`laneSpacing = 12`, `portStubLength = 20`) and `lanes` lanes in the channel:

| | value |
| --- | --- |
| shallowest lane (`l = 0`) | `bandBottom + 20 + 6` = **26 below the band bottom** |
| deepest lane (`l = lanes − 1`) | `bandBottom + 20 + 12·lanes − 6` = `bandBottom + 12·lanes + 14` |
| next rank's band top | `bandBottom + gap` ≥ `bandBottom + 12·lanes + 40` |
| clearance at the far end | ≥ **26** |

Both ends clear by at least 26px, and two links in the same channel with different lanes are always
exactly `laneSpacing` apart. **A route emitted here cannot overlap a node and cannot run collinearly
along another edge.**

(In practice the configured `rank_gap` of 120 dominates until about seven lanes:
$7 \times 12 + 40 = 124 > 120$. Below that, channels sit in space the layout already had.)

---

## 7. Self-loops

A self-loop has no ordering, no rank span and no lane. Its geometry is a direct function of the
node's rectangle and a stacking index, computed in
[`route_self_loop`](../../crates/gvui/src/5_edge_routing/5_3_special_routes.rs):

```rust
step   = max(effective_lane_spacing, MIN_LOOP_STEP)          // MIN_LOOP_STEP = 4.0
reach  = port_stub_length + (ring + 1) * step
spread = clamp(half_height/3 + ring * max(port_pitch, 4), 1, half_height - 1)
```

The loop leaves the right side **above** the node's centre and re-enters **below** it, so the two
ports are distinct and the arrow direction is legible.

```text
              ┌────────────────┐
              │                ├────────────┐   ← exit,  centre_y − spread
              │      node      │            │
              │                ├────────────┘   ← entry, centre_y + spread
              └────────────────┘
                               └── reach ───┘
```

Successive `ring` values grow **both** the outward reach and the vertical spread, so multiple loops
nest concentrically instead of overlapping. Port indices are `ring*2` and `ring*2 + 1`, so nothing
downstream collapses two loops into one.

**Worked example.** A node at (10, 20), 100 × 60, with default config. `half_height = 30`,
`centre_y = 50`, `step = 12`, `reach = 20 + 12 = 32`, `spread = 30/3 = 10`. The loop exits at
(110, 40), runs out to x = 142, comes back at (142, 60), and re-enters at (110, 60).

The vertical spread is capped at the node's own half-height. A node with more self-loops than it is
tall will eventually stack loops that share a port height — a degenerate case no amount of geometry
can fix, which the caller should surface as a diagnostic rather than route around.

---

## 8. Flat edges

A flat edge joins two items in the **same rank**. Its shape is always
`port → stub → corridor → stub → port`: two horizontal runs at the two port heights, joined by one
vertical jog in the corridor Phase 6 reserved between the two items' orders.

```text
   ┌────────┐                          ┌────────┐
   │        │                          │        │
   │   A    ├──────┐                   │        │
   │        │      │                   │   B    │
   └────────┘      └───────────────────┤        │
                   ↑                   │        │
                   corridor lane       └────────┘
```

The corridor x is

$$x = \text{gapLeft} + (\text{lane} + 0.5) \cdot \text{laneSpacing}$$

where `gapLeft` is the right edge of the item at `after_order`. Phase 6 widened that separation to
`max(node_gap, lanes · laneSpacing) + labelWidth`, so the lane lands inside the gap by construction.
The value is then clamped into the interval between the two stubs — a no-op on well-formed input,
present only to keep the polyline monotone (and therefore self-intersection-free) if a corridor were
ever assigned outside the span.

When both ports sit at the same height — the common case for equal-height neighbours — the jog has
zero length and simplification collapses the whole thing to a **straight two-point line**.

---

## 9. Badges are a lookup

In v1, badge placement was a ~1,000-line candidate generator: rotate the label through candidate
offsets, score each one, build a disjoint-set conflict graph over all candidate pairs (up to
$48^2 = 2{,}304$ geometric tests per badge pair), then **backtrack** when a set of badges could not
be simultaneously satisfied, building a `format!` state-key string at every DFS node.

In v2 it is a lookup, in
[`place_badges`](../../crates/gvui/src/5_edge_routing/5_4_badges.rs):

```rust
badge.rect   = the Label item's own box        // positioned by Phases 5 and 7
badge.anchor = nearest point on the polyline
```

Phase 4 turned the label into a `Label` item, Phase 5 ordered it among its rank's siblings, Phase 6
included it in the separations and Phase 7 gave it coordinates. The space is allocated by
construction, so there is nothing to search for and nothing to retry. Under `BesideEdge` the badge
takes the right half of the double-width item; `badge_clearance` is spent as a push away from the
edge's lane, and only as far as the spare width allows, so the badge is never shrunk below its
measured size.

Flat-edge badges centre on the corridor's vertical run — the corridor was already widened by the
label width. Self-loop badges hang off the loop's outer vertical run, which is the only part of a
loop guaranteed clear of the node.

### The safety net, and what a leader line means

There is one piece of search-shaped code, and it fires only for a **degenerate case**: an edge that
carries a label but never received a `Label` item. (That happens for a labelled edge with
`min_len = 1`, which Phase 3 is supposed to make impossible.) The net tries five fixed offsets
along the route — ratios `0.5, 0.35, 0.65, 0.2, 0.8`, most central first — perpendicular to the
segment at the midpoint, checking each against a uniform spatial hash of nodes and already-placed
badges. No rotation, no scoring, no backtracking. If none clears, the badge is left at the midpoint
offset and a **leader line** is drawn from the route to it.

So `leader_count` is not a crowding measure. It is a **signal that an upstream reservation was
missing**. A healthy layered layout reports zero, and every layered fixture in the audit does. See
[Chapter 11](./11-emit-and-quality.md#the-two-early-warning-signals).

One contract point: `BadgePlacement::label` is left **empty** here. `GraphIr` interns edge *ids* but
not label text — nothing after Phase 1 is allowed to see text — so Phase 9 joins placements back to
the wire edges by `edge_id` and fills the display string in.

---

## 10. Corner rounding happens at render time

The Rust engine emits axis-aligned waypoints and nothing else. Rounding is applied in TypeScript,
in [`edgePath.ts`](../../src/engine/layout/custom/edgePath.ts), by replacing each interior corner
with a quadratic Bézier of radius

$$r = \min(\text{cornerRadius}, \tfrac{1}{2}\text{len}_{\text{in}}, \tfrac{1}{2}\text{len}_{\text{out}})$$

The clamp against half of each adjacent segment guarantees two neighbouring corners can never claim
overlapping arcs on the segment between them, so the transform never has to look at more than one
vertex at a time. A vertex is left sharp when either adjacent segment has ~zero length or the two
are collinear.

The reason this lives on the client is not tidiness. `cornerRadius` and `edgeStyle` are **pure
rendering decisions** — they change no node position, no port assignment, no lane allocation. Moving
the slider re-derives the path string from the cached `points` array and re-renders immediately,
with no WASM call, no worker round trip, and no layout-cache invalidation.

The four styles:

| `edgeStyle` | rendering |
| --- | --- |
| `orthogonal` | `M`/`L` through every waypoint, sharp corners |
| `rounded` (default) | as above with quadratic corners at `cornerRadius = 8` |
| `spline` | Catmull–Rom through the waypoints, converted to cubic Béziers |
| `straight` | `M first L last` — interior waypoints ignored |

`EngineMode::LayeredSpline` is **not a different layout**. It resolves to the same
`layout_layered` function; only the path command differs. There is a test asserting the two produce
byte-identical node geometry.

Rust does keep a `points_to_svg_path` helper, at fixed three-decimal precision. It exists solely so
the native audit harness can render the same geometry the browser does and keep snapshots stable.

---

## 11. The guarantee, and why there is no fallback

Putting it together:

- **Phase 6** reserved a lane for every horizontal run and every vertical jog, by exact
  interval-graph colouring — the provable minimum number of lanes.
- **Phase 7** honoured those separations exactly, with an unconditional repair pass making it a
  property rather than a hope.
- **Phase 8** evaluates the polyline from the lane index.

Therefore **a route cannot fail and cannot overlap a node.** There is no rip-up, no reroute, no
`unresolved_soft_conflicts` state reachable from routing, and no fallback path.

This is why there is no collision check in the router. Adding one would be dead code that hides an
upstream bug rather than catching one — if a route ever did overlap a node, the correct response is
to fix Phase 6 or 7, not to nudge the line.

`route_chain` returns `None` only for **structurally impossible** input: an out-of-range index, a
chain with fewer than two items, an item index that does not resolve, a missing port. In a
well-formed pipeline every chain routes. A `None` is a defect signal, and it surfaces in Phase 9 as
`unresolved_route_count` and a `MISSING_ROUTE` diagnostic — never as a silently missing line.

### Determinism and totality

[`route_edges`](../../crates/gvui/src/5_edge_routing/5_6_route_facade.rs) visits chains, then flat
edges, then self-loops, each by ascending index, so the `routes` vector has the same order for the
same input in every process. The self-loop stacking counter is a dense `Vec` indexed by node, so the
stacking index depends only on the order of `layered.self_loops` and never on hashing.

---

## 12. What is recorded but not yet used

Ingest groups parallel edges between the same unordered node pair into `Bundle`s, and
`bundle_parallel_edges` defaults to `true`. Nothing in Phase 8 currently consumes them — bundled
edges are routed individually like any other. The grouping exists in the IR; the trunk-and-split
rendering the design note describes is not implemented.

---

## 13. Cost

| step | cost |
| --- | --- |
| Port collection | $O(E)$ |
| Port sorting | $O(\sum_v \deg(v) \log \deg(v))$ |
| `rank_band_bottoms` | $O(V)$, computed once |
| Polyline materialisation | $O(\text{bends})$ per edge — a table lookup per link |
| Simplification | $O(\text{points})$ per edge |
| Badge placement | $O(B)$ lookups; the safety net costs 5 spatial-hash queries per orphan |

No term in that table is quadratic and none of it iterates. Against v1's 4,979 ms of routing for a
12-node graph, the entire v2 pipeline for that fixture is **0.14 ms**.

---

← [Coordinate Assignment](./09-coordinate-assignment.md) | [Index](./README.md) | [Next: Emit and Quality →](./11-emit-and-quality.md)
