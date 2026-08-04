# Layout Engine v3 — Aesthetic and Usability Pass

v2 fixed performance and correctness. This round is about the drawing actually looking right and the
controls making sense. Everything here comes from direct user feedback on the running app.

---

## 1. The feedback, and what each item actually is

| # | Feedback | Diagnosis | Verdict |
| --- | --- | --- | --- |
| 1 | Badges sit outside the edge, joined by a dotted line | `labelPlacement` defaults to `beside-edge`, which puts the badge in the right half of a double-width item; `EdgeBadgeOverlay` then draws a dashed connector to the anchor | **My default was wrong.** Badge belongs centred on the edge |
| 2 | Edges make unnecessary corners | Ports are distributed evenly along a side with no regard for where the edge is going, so a straight shot becomes a dog-leg | Real defect |
| 3 | Only top/bottom sides used; left/right should be too | Port side is a fixed table: forward edges are always Bottom→Top | Real defect |
| 4 | Same-rank horizontal connections don't happen | Every edge gets `min_len >= 1`, so `span == 0` is impossible. `FlatEdge` is unreachable code | Real defect |
| 5 | `left-right` doesn't work | The client sends a *fully resolved* config, so `direction` is always `Some`, and `lib.rs` lets explicit direction win over the mode — the mode's direction is always discarded | **Real bug** |
| 6 | Grid is not helpful, everything collides | Straight centre-to-centre lines with no routing | Remove |
| 7 | Organic's purpose is unclear | — | Remove |
| 8 | `layered` vs `layered-spline` is confusing | They are the same engine; only `edgeStyle` differs | Collapse into `edgeStyle` |
| 9 | Presets are unnecessary | — | Remove entirely |
| 10 | "Quick settings" should be "Settings" with full control | — | Rename and complete |
| 11 | Graph-testing examples are broken | — | Fix all; drop the empty and single-node ones |
| 12 | Public sample graphs are weak | — | Replace with advanced scenarios |
| 13 | Diagnostics must all pass | — | Gate on it |
| 14 | Consider 8-direction routing | — | Evaluate; ship as an option |

## 2. Modes: 6 → 2

| before | after |
| --- | --- |
| `layered`, `layered-spline`, `left-right`, `organic`, `radial`, `grid` | **`layered`**, **`radial`** |

`direction` (`top-down` / `bottom-up` / `left-right` / `right-left`) becomes the single source of
truth for flow, promoted to a first-class control instead of being half-encoded in the mode string.
`edgeStyle` covers what `layered-spline` used to mean.

One note before deleting organic: on `dense_kubernetes_mesh` it measured **8 crossings against
layered's 28**, because that graph has no real flow direction. Removing it means mesh-shaped graphs
are drawn by an engine that is structurally wrong for them. Recorded here so the decision is
reversible; the code is in git history.

## 3. Routing changes

### 3a. Geometric port-side selection
Replaces the fixed Bottom→Top table. For each edge, score all four sides of each endpoint by the
direction to the other endpoint and pick the pair that minimises `(bends, length, side congestion)`.
Rank flow still biases toward Bottom/Top so a hierarchy still reads top-down, but a target that is
mostly *sideways* now exits sideways. Still a scored choice over 16 combinations, not a search.

### 3b. Straight-shot port alignment
The single biggest bend reducer. When a node's outgoing edge has a target whose port could share the
same x, snap both ports to a common x so the edge is one straight segment. Applied greedily in
descending edge-weight order, subject to `port_pitch`.

### 3c. Same-rank peer edges
Auto-detect *peer* edges — endpoints sharing a common predecessor with no other directed path
between them — and give them `min_len = 0`, so network simplex may place them on one rank. They then
route as flat edges: a straight horizontal segment with the badge centred between the two nodes, and
the corridor widened to fit it. Gated by `sameRankPeerEdges` (default on).

### 3d. Corner reduction
A post-pass that removes a bend when the detour it avoids no longer exists, and merges collinear
runs. Cheap, and purely a polyline transformation.

### 3e. Octilinear edges (the 8-direction question)
Shipped as `edgeStyle: "octilinear"`, implemented as a **post-pass on the orthogonal polyline**:
each right-angle corner becomes a 45° chamfer where the chamfer is collision-free.

This deliberately does *not* rebuild the lane model on eight directions. The lane model is what makes
routing exact and fast — channels are axis-aligned intervals, and interval-graph colouring is what
guarantees the drawing has room for every edge before any geometry exists. Octilinear channels have
no equivalent exact colouring, so a full 8-direction router would mean giving up the property that
routing cannot fail. A chamfer post-pass gets most of the visual benefit — shorter paths, softer
turns — while keeping that guarantee. If it looks good, we can go further.

## 4. Badges

Default `labelPlacement` becomes `on-edge`: the label item is single-width, the edge runs through
its centre, and the badge is drawn over the line. The dashed connector is only ever drawn when the
anchor genuinely falls outside the badge rect, which for `on-edge` never happens.

## 5. Settings

Presets and the preset row are deleted. The panel is renamed **Settings** and exposes every field of
`CustomLayoutConfig`, grouped as: Layout (direction, gaps, aspect), Edges (style, corner radius,
ports, lanes), Labels (placement, clearance, wrapping), Algorithms, Budgets.

## 6. Test material

- `public/data/graphs/` replaced with graphs that exercise real structure: deep hierarchy, wide
  fan-out, dense peer mesh, multi-component, long-span edges, heavy labels, parallel bundles.
- Graph-testing scenarios: drop #1 (empty) and #2 (single node); every remaining scenario must pass
  the full constraint set; new scenarios added for the cases above.
- The audit gates on **zero** constraint violations across every scenario and every dataset.
