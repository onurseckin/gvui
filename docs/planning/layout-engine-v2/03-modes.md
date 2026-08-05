# 03 — Modes

The five current modes, what each should actually be, and the one that needs a real algorithm.

---

## Recommended taxonomy

| Mode                             | Engine                                                | Good for                                                         | Bad for                             |
| -------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| **Layered orthogonal** (default) | Phases 0–9, orthogonal router                         | Pipelines, system designs, sagas, decision trees, state machines | Very dense meshes with no direction |
| **Layered spline**               | Phases 0–7, then piecewise-Bézier through dummy chain | Same, softer look                                                | same                                |
| **Left–right**                   | Layered on the transposed problem                     | Wide flows, timelines, org charts                                | Deep hierarchies                    |
| **Organic (stress)**             | Stress majorization + overlap removal                 | **Meshes, network topologies, undirected relationship maps**     | Anything with a real flow direction |
| **Radial**                       | BFS-tree radial                                       | Ego networks, taxonomies, "what depends on X"                    | Multi-root graphs                   |

Grid stays as a debug/overview mode.

## LR is not a separate engine

`compute_left_right_layout` today is a full re-implementation plus `transpose_layout_result`.
It should be one line of setup:

```
if direction is LR or RL:
    swap (w, h) of every box before Phase 3
    run Phases 3..8 unchanged
    transpose all output coordinates and rotate all port sides
```

The whole pipeline is direction-agnostic once boxes are transposed on the way in. This removes a
duplicated engine and guarantees LR and TB stay in sync. BT and RL are the same trick plus a
reflection.

## Organic mode needs a real algorithm

`compute_force_layout` is not a force layout. It is:

```rust
let columns = (node_count as f64).sqrt().ceil();
let stagger = if row % 2 == 1 { node_gap * 0.5 } else { 0.0 };
// … straight centre-to-centre lines
```

A staggered grid with lines through node centres. It ignores topology entirely — two strongly
related nodes are as likely to be at opposite corners as adjacent. For the use case that motivates
it most — _"web meshes, network diagrams"_ — it is the worst possible answer.

### The right algorithm: stress majorization by SGD

Minimize

```
stress(P) = Σ_{i<j}  w_ij · ( ‖p_i − p_j‖ − d_ij )²        with  w_ij = d_ij^(−2)
```

where `d_ij` is graph-theoretic distance.

1. **Target distances.** BFS from every node → all-pairs shortest paths, O(V·E). Fine to ~2,000
   nodes. Beyond that, use pivot-based sparse stress (choose ~100 pivots, BFS from each only).
2. **Optimize by SGD** (Zheng, Pawar & Goodman, _Graph Drawing by Stochastic Gradient Descent_,
   2018). Shuffle the node pairs; for each pair apply a constrained move toward its target distance
   with a decaying step size `η_t`. Converges in ~30 epochs, is far more robust than
   Fruchterman–Reingold, has no temperature/repulsion constants to tune, and cannot explode.
3. **Overlap removal.** Nodes have real, unequal boxes, so post-process with PRISM
   (Gansner & Hu) or VPSC (Dwyer, Marriott & Stuckey) to separate overlapping rectangles while
   preserving the relative arrangement SGD found.
4. **Edges.** Straight lines clipped to the node boxes, optionally with edge bundling for dense
   graphs. Not orthogonal — orthogonality is meaningless without a flow direction.
5. **Labels.** Midpoint of the edge, pushed along the normal, conflicts resolved against a uniform
   spatial hash. This is the one mode where labels genuinely need a placement pass, because there is
   no layered structure to reserve space in. Keep it simple and local: ~5 candidate offsets per
   label, greedy in descending label-area order.

**Cost:** dominated by APSP. For 200 nodes: BFS ~1 ms, 30 SGD epochs over ~20k pairs ~5 ms, overlap
removal ~2 ms. Comparable to the layered engine and far better than a grid.

### Why this matters for the stated goal

The user's graphs are described as _"relations, thinking models, maybe software system designs …
a general graph generation system."_ Roughly half of those have a genuine flow direction (layered
wins) and half do not (stress wins). Having a real organic mode means the layered engine no longer
has to pretend it can draw a mesh — which is exactly the case where it currently spends 47 seconds
producing 191 crossings.

**Selection heuristic** (offer, do not impose): if the DAG depth after ranking is `< 3` while
`|V| > 12`, the graph has no meaningful hierarchy — surface a hint suggesting organic mode.
`dense_kubernetes_mesh` ranks 8 deep once ranking is fixed, so it stays layered; `crossing_mesh_10n_10e`
ranks 2 deep with 5 of 10 edges in the feedback set, and is a genuine organic-mode candidate.

## Radial

BFS spanning tree from a chosen root (highest betweenness, or user-pinned), then:

```
ring(v)  = bfs_depth(v)
radius(k)= radius(k−1) + max_box_height(ring k) + ringGap
angle(v) ∈ a contiguous wedge sized proportionally to v's subtree leaf count
```

Proportional wedge allocation (rather than the current uniform `2π·i/n`) is what prevents dense
subtrees from colliding while sparse ones waste an arc. Edges are radial arcs or straight lines;
non-tree edges are chords, drawn de-emphasized.

The current `compute_radial_layout` places every node on **one** circle regardless of depth and
routes every edge as a quadratic Bézier through the exact centre — so with more than a handful of
edges the centre becomes an opaque knot. Concentric rings plus chords fixes both.
