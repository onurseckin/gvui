← [Layered](./01-layered.md) | [Index](./README.md) | [Docs Index →](../README.md)

# Radial Mode

Radial mode answers one question: **"what surrounds X?"** Pick a node, put it in the middle, and
arrange everything else in rings by how many hops away it is.

```text
                        ring 2
              ○      ○         ○      ○
                  ╲   │        │   ╱
           ○        ○─┼────────┼──○         ring 1
                ╲   ╱ │        │
        ○─────────●───┼────────┼──○
                ╱   ╲ │   root │
           ○        ○─┴────────┘
                  ╱   ╲
              ○      ○         ○      ○
```

It is the natural shape for an ego network ("what does this service touch, and what do *those*
touch"), a taxonomy, or a dependency neighbourhood. It is a poor shape for a graph with several
equally important roots, or one whose edges mostly do not belong to any tree.

It is also, since v3, **the only engine that is not the layered pipeline**. The organic
(stress-majorization) engine that used to share its plumbing was removed; see
[what was removed and why](./README.md#what-was-removed-in-v3-and-what-it-cost).

See [the implementation](../../crates/gvui/src/7_engines/7_3_radial.rs).

---

## 1. Polar coordinates from scratch

A circle is the set of points all the same distance — the **radius** — from a middle point. To
pinpoint a location on it you need one more number: an **angle**.

Programming's trigonometric functions do not take degrees. They take **radians**:

- a full circle is $2\pi$ radians (about 6.283) — the code calls this constant $\tau$;
- half a circle (180°) is $\pi$;
- a quarter circle (90°) is $\pi/2$.

To turn an angle into pixels:

$$x = r\cos\theta, \qquad y = r\sin\theta$$

Two conventions to keep straight, because they trip everyone up:

1. **$\theta = 0$ points right** (3 o'clock), not up.
2. **Screen $y$ grows downward.** So increasing $\theta$ walks *clockwise* on screen, not
   counter-clockwise as in a maths textbook.

Worked out, at radius 400 with six evenly spaced angles:

| $\theta$ | radians | $\cos\theta$ | $\sin\theta$ | $x$ | $y$ | on screen |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0° | 0.000 | 1.000 | 0.000 | +400 | 0 | right (3 o'clock) |
| 60° | 1.047 | 0.500 | 0.866 | +200 | +346 | lower right |
| 120° | 2.094 | −0.500 | 0.866 | −200 | +346 | lower left |
| 180° | 3.142 | −1.000 | 0.000 | −400 | 0 | left (9 o'clock) |
| 240° | 4.189 | −0.500 | −0.866 | −200 | −346 | upper left |
| 300° | 5.236 | 0.500 | −0.866 | +200 | −346 | upper right |

That is the whole coordinate system. Everything below is about choosing $r$ and $\theta$ for each
node.

---

## 2. Rings: $r$ comes from BFS depth

Pick a root. Breadth-first search from it labels every node with its hop distance:

```text
      root ─── a ─── c
        │      │
        └───── b ─── d ─── e

      ring 0: root
      ring 1: a, b
      ring 2: c, d
      ring 3: e
```

`ring(v) = bfs_depth(v)`, and the BFS also gives a **spanning tree**: each node's parent is
whichever node discovered it. Traversal follows the adjacency built in input edge order, so the tree
is reproducible.

**Root selection.** `radial_root` names a node explicitly. When it is empty (the default) or names a
node that does not exist, the engine picks the **highest-degree** node, breaking ties toward the
earliest node in the caller's input — the only tie-break that does not depend on the iteration order
of a hash container.

**Unreachable nodes** — a second component, an isolated node — are not dropped and are not piled at
the centre. They are attached to the root and pushed to one extra outermost ring, so they get a
wedge of their own and the ring sizing below still accounts for them.

---

## 3. Wedges: $\theta$ comes from subtree size

This is the heart of the mode, and it is where the naive version fails.

### Why uniform spacing fails

The obvious way to spread $n$ nodes around a circle is $\theta_i = 2\pi i / n$ — every node gets the
same slice. That is what v1 did, and here is what it does to a tree whose subtrees are of unequal
size. The root has two children: `c0`, which carries six leaves, and `c1`, which carries none.

```text
   UNIFORM: each child owns half the circle    PROPORTIONAL: arc follows leaf count

   c1's half ────────────────┐                 c1's 1/7 ──┐
                             │                            │
        ·  ·  ·  ·  ·  ·  ·  │                     ·  ·   │
                             │                            │
              (root)         │                     (root) │
                             │                            │
        ○○○○○○  ← six boxes  │                 ○   ○   ○  │
         crammed into 180°   │                 ○   ○   ○  │  each leaf gets
   c0's half ────────────────┘                 c0's 6/7 ──┘  the same arc
```

Uniform allocation gives the six-leaf subtree exactly as much arc as the empty one. The dense side
collides; the sparse side wastes half the circle.

### Proportional allocation

Instead: **a parent's wedge is split among its children in proportion to their leaf counts.** A
childless node counts as one leaf; every other node's leaf count is the sum of its children's.

```text
leaves(root) = 7      root owns [0, τ)
leaves(c0)   = 6      c0   owns [0, 6τ/7)        midpoint θ = 3τ/7  ≈ 154.3°
leaves(c1)   = 1      c1   owns [6τ/7, τ)        midpoint θ = 13τ/14 ≈ 334.3°
```

Each node is drawn at the **midpoint** of its own wedge, and its children divide that wedge among
themselves. Six times the leaves, six times the arc — so every leaf in the drawing ends up with the
same angular budget, which is the property that keeps a ring's occupancy even. (Those exact numbers
are asserted by `proportional_wedges_give_a_dense_subtree_more_arc` in the engine's test module.)

Leaf counts are computed by walking rings **from the outside in**, which is a valid post-order
because every child's ring is strictly greater than its parent's. No recursion — a 10,000-deep path
cannot blow the stack.

---

## 4. Ring radii: two requirements, take the larger

A ring has to be far enough out for two independent reasons.

**Radial** — ring $k$ must clear ring $k-1$:

$$r_k \;\ge\; r_{k-1} + \tfrac{1}{2}\text{extent}^{\text{radial}}_{k-1} + \tfrac{1}{2}\text{extent}^{\text{radial}}_{k} + \texttt{ring\_gap}$$

**Circumferential** — the ring's circumference must fit its contents side by side:

$$2\pi r_k \;\ge\; 1.15 \cdot \sum_{v \in \text{ring } k}\bigl(\text{extent}^{\text{tangential}}_v + \texttt{node\_gap}\bigr)$$

A box is a rectangle and a ring is a circle, so "how much of the ring does this box eat" depends on
the box's angle. The engine measures both extents against the node's own angle — which is why angles
are settled *before* radii, and why the sizing can be exact instead of a conservative bound:

$$\text{extent}^{\text{radial}} = w\lvert\cos\theta\rvert + h\lvert\sin\theta\rvert, \qquad
\text{extent}^{\text{tangential}} = w\lvert\sin\theta\rvert + h\lvert\cos\theta\rvert$$

```text
   θ = 0  (box on the right of the ring)      θ = 90°  (box at the bottom)

         │                                          ────────────────
     ────┼───┐  radial extent = w                     ┌──────────┐
         │   │  tangential    = h                     │    box   │   radial extent = h
     ────┼───┘                                        └──────────┘   tangential    = w
         │                                          ────────────────
```

The 1.15 slack multiplier covers the fact that a rectangle's chord is shorter than the arc it
occupies, plus the accumulated rounding of the wedge split.

### A worked example

Root `api` (160×60) with twelve children (140×60 each), defaults throughout: `node_gap` 56,
`rank_gap` 120, `radial_ring_gap` 140, `target_aspect_ratio` 1.6, `compaction` balanced.

Wedges: 12 children share $\tau$ equally (all have one leaf), so each owns 30° and sits at its
midpoint: 15°, 45°, 75°, … 345°.

*Radial requirement.* The root sits at $\theta = \pi$ (the midpoint of its full-circle wedge), so its
half-extent is $160/2 = 80$. The largest child half-extent is at 15°:
$(140 \times 0.966 + 60 \times 0.259)/2 = 75.4$. `ring_gap` is
$\max(140, \texttt{effective\_rank\_gap} = 120) = 140$. So

$$r_1 \ge 0 + 80 + 75.4 + 140 = 295.4\ \text{px}$$

*Circumferential requirement.* Summing tangential extents over the twelve midpoint angles gives
$140 \times 7.728 + 60 \times 7.728 + 12 \times 56 = 2217.6$ px of arc needed. Then

$$r_1 \ge \frac{2217.6}{\tau} \times 1.15 \div 0.791 = 513.4\ \text{px}$$

(the divisor is the *minor* elliptical axis, explained next). The circumference requirement wins, so
**ring 1 sits at 513 px** — the ring is pushed out not because the boxes are tall but because twelve
of them need 2,218 px of perimeter to sit side by side.

Positions then follow directly. The child at 15°:

$$x = 513.4 \times 1.265 \times \cos 15° = 627, \qquad
y = 513.4 \times 0.791 \times \sin 15° = 105$$

### The elliptical stretch

`target_aspect_ratio` turns the rings into ellipses: $x$ is scaled by $\sqrt{t}$ and $y$ by
$1/\sqrt{t}$. At the default 1.6 that is 1.265 and 0.791. The product is exactly 1, so the stretch
**preserves area** — only the proportions change, and the drawing cannot inflate. The ratio is
clamped to $[0.25, 4]$; outside that range the rings degenerate into slots and the mode stops being
radial.

Note which axis the circumference test divides by: the **minor** axis, the tighter of the two. Using
the major axis would let the stretch quietly eat the clearance the ring sizing was supposed to
guarantee.

### Ring sizing is necessary, not sufficient

Ring sizing guarantees a ring has *enough total arc*. It cannot guarantee the arc is spent evenly,
because wedges are allocated by subtree leaf count, not by ring occupancy: a deep, narrow subtree
crowds its slice of ring 3 while a shallow, wide one leaves slack.

The push-apart pass in
[`7_2_geometric_common.rs`](../../crates/gvui/src/7_engines/7_2_geometric_common.rs) closes exactly
that gap, and because the crowding is local, its displacements are small enough to leave the ring
structure legible. It is two stages, and the split matters:

1. `relax_overlaps` — `overlap_removal_passes` symmetric push-apart passes. Each pair still too
   close moves *both* boxes half the penetration apart, along the axis of least penetration. Cheap,
   local, and it preserves the arrangement the ring geometry found, because the cheaper axis is the
   smallest displacement that resolves the overlap. It is a shaping pass: it removes the great
   majority of overlaps but not all of them, and driving it to zero takes $O(n)$ passes.
2. `enforce_separation` — one exact scan-line sweep in ascending centre-$x$ order, pushing each box
   just far enough right to clear every already-placed box it still overlaps in $y$. Boxes only ever
   move right, so placing one cannot disturb a pair already resolved, which is why one pass suffices.

Doing only (1) would ship a defect nothing downstream can repair. Doing only (2) would skew the
whole drawing to the right, because (2) resolves everything in one direction. Running (1) first is
what leaves (2) almost nothing to do. The engine's guarantee is therefore the strong one: **no two
node boxes overlap** — 0 on every dataset in the audit.

Setting `overlap_removal_passes` to 0 disables **both** stages, and is the only configuration in
which radial can emit overlapping boxes. It does so deliberately, for a caller who wants to see the
raw ring positions.

---

## 5. Edges: tree spokes, and chords that bow

Two kinds of edge, drawn differently on purpose.

**Tree edges** — an edge between a node and its BFS parent — are straight radial spokes.

**Non-tree edges** (chords) connect two nodes that are not parent and child: a link between siblings,
a shortcut across rings, a back edge. Every chord bends through one interior waypoint placed **30% of
the way from its own midpoint toward the centre**:

```text
   v1: EVERY edge through the exact centre        v2+: chords bowed 30% toward the centre

          ○         ○                                    ○         ○
           ╲       ╱                                      ╲       ╱
            ╲     ╱                                        ╰─╮ ╭─╯
      ○──────╳╳╳╳╳──────○                            ○───────╯ ╰───────○
            ╱ ▲   ╲                                        ╭─╯ ╰─╮
           ╱  │    ╲                                      ╱       ╲
          ○   │     ○                                    ○         ○
              └── an opaque knot                    the middle stays readable
```

v1 routed **every** edge as a quadratic Bézier whose control point was the exact centre of the
circle. With a handful of edges it looks like an attractive hub-and-spoke flower. With thirty it is
an opaque knot: every edge passes through the same few pixels, so no edge can be traced, and the
centre — where the root is — is the least readable part of the drawing.

A 30% bow is enough to separate a chord visually from the radial spokes without everything
converging on one point. It also changes where the edge attaches: both endpoints are clipped
*toward the bend*, so the polyline leaves each box pointing at its waypoint rather than at the far
node.

Self-loops are a fixed four-point bracket off the node's right side — a table lookup, not a search.

Chords are the reason radial is a poor fit for meshes, and the audit shows exactly where the line
is:

| dataset | shape | radial | layered |
| --- | --- | ---: | ---: |
| `deep_release_pipeline` | 14 nodes, near-linear | 0 crossings | 0 crossings |
| `long_span_bypass_network` | 10 nodes, long spans | 2 crossings | 5 geometric |
| `peer_mesh_service_registry` | 8 nodes, 22 edges | 12 crossings | 29 geometric |
| `microservice_platform_topology` | 18 nodes, 31 edges | **30 crossings** | 22 geometric |
| `fanout_fanin_scatter_gather` | 17 nodes, 30 edges | **52 crossings** | 82 geometric |

Radial wins where the graph is close to a tree and loses where most edges are not in any spanning
tree — every one of those becomes a chord, and chords cross. The mode is not doing anything wrong on
`microservice_platform_topology`; that graph simply does not have the shape radial draws.

---

## 6. Badges

Radial's badge placement is the shared local-greedy pass in
[`7_2_geometric_common.rs`](../../crates/gvui/src/7_engines/7_2_geometric_common.rs): badges in
descending area order, five candidate offsets each, spatial-hash conflict detection, and a leader
line when nothing fits. The first candidate honours `label_placement`, so `on-edge` (the v3 default)
puts the badge on the line, `beside-edge` offsets it to one side, and `above-edge` lifts it.

The algorithm is deliberately local, because in this family of engines there is no layered structure
to reserve badge area in — that trick only exists in the layered pipeline, where the badge is an
item with a box of its own.

Be honest about the result. Across the ten audit datasets radial produces:

| metric | radial |
| --- | ---: |
| node–node overlaps | 0 (guaranteed) |
| edge–node penetrations | **9** (5 on `long_span_bypass_network`, 2 each on `microservice_platform_topology` and `peer_mesh_service_registry`) |
| badge–node overlaps | **1** (`peer_mesh_service_registry`) |
| badge–badge overlaps | **7** (5 on `parallel_bundle_transports`, 1 each on `feedback_retry_state_machine` and `peer_mesh_service_registry`) |
| leader lines | **7** |

The layered engine produces zero of every one of those on the same datasets. These are recorded as
quality metrics rather than errors because radial never promised otherwise — a straight chord
between two boxes may graze a third by construction, not by defect. The policy is in
[the quality model](../concepts/quality-model.md) and
[06-results.md §4d](../planning/layout-engine-v2/06-results.md); the audit gates radial on
determinism, validity and the node-overlap guarantee, and reports the rest.

---

## 7. Cost

| stage | complexity |
| --- | --- |
| BFS spanning tree | $O(V + E)$ |
| leaf counts | $O(V \log V)$ (one sort by ring) |
| wedge assignment | $O(V)$ |
| ring radii | $O(V)$ |
| overlap removal | $O(\texttt{passes} \cdot V)$ expected, then one $O(V \log V)$ sweep |
| routes + badges | $O(E)$ expected |

Measured: **0.03 – 0.22 ms** across the audit set, against layered's 0.06 – 1.17 ms on the same
graphs. Radial is the cheaper engine everywhere, which is unsurprising: there is no iteration and no
search here, and the geometry is computed in one pass.

---

## 8. Config

| knob | default | effect |
| --- | ---: | --- |
| `radial_root` | `""` | explicit root node id; empty selects the highest-degree node |
| `radial_ring_gap` | 140 | gap between concentric rings; floored at `effective_rank_gap` |
| `node_gap` | 56 | arc length between siblings on a ring — the only place it enters a radial drawing |
| `rank_gap` | 120 | floor for the ring gap; vertical clearance during overlap removal |
| `compaction` | `balanced` | scales the ring gap like every other gap |
| `target_aspect_ratio` | 1.6 | elliptical stretch, clamped to $[0.25, 4]$ |
| `overlap_removal_passes` | 6 | `0` disables overlap removal entirely, guarantee included |
| `label_placement` | `on-edge` | which of the five badge candidates is tried first |

`direction` is **ignored**: there is no flow axis, so a direction is meaningless here rather than
wrong, and [`compute_layout`](../../crates/gvui/src/7_engines/7_5_facade.rs) does not pass it on.

`edge_style` does not change what radial *computes* — spokes are two points and chords are three,
whatever the style says — but it is not ignored either, because the renderer applies
[`buildEdgePath`](../../src/engine/layout/custom/edgePath.ts) to whatever points came back. So
`rounded` will arc a chord's single bend and `spline` will smooth it. `octilinear` is the one that
does nothing visible: its chamfer only ever fires on right-angle corners, and radial emits none.

Note that radial evaluates its own constraints against a config clone whose `edge_style` is forced
to `straight`, so a caller's `rounded` setting — which is about how the *layered* engine renders —
cannot turn a correct radial drawing into a hard failure.

The stress knobs (`stress_iterations`, `stress_ideal_edge_length`) survive in the config — and in the
Settings panel — for wire compatibility with clients that still send them. **No engine reads them**
now that organic is gone; only `overlap_removal_passes`, which sat beside them, still does anything.

---

← [Layered](./01-layered.md) | [Index](./README.md) | [Docs Index →](../README.md)
