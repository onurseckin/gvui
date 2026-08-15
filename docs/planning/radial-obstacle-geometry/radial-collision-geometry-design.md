# Module 2: Radial Obstacle Detour Geometry Design

## Executive Summary

In the GVUI layout engine, the Radial Engine (`7_3_radial.rs` and `7_2_geometric_common.rs`) places nodes on concentric rings indexed by BFS depth $k \in \{0, 1, \dots, K\}$. In existing versions, edge routes are constructed as either direct Cartesian line segments or naive 30% inward-bowed chords. Consequently, when an edge connects nodes across non-adjacent rings or across wide angular spans on the same ring, the line segment frequently penetrates the axis-aligned bounding boxes (AABBs) of intermediate nodes, generating `edgeNodePenetrations > 0` violations in the layout audit.

This specification details the **Polar Corridor Detour Routing Algorithm (PCDRA)**, providing exact mathematical formulations for polar obstacle detection, concentric routing channel allocation, angular clearance sector computation, and tangent waypoint construction to guarantee strict zero-tolerance ($0$ penetrations) edge routing in radial mode.

---

## 1. Mathematical Modeling & Coordinate Spaces

### 1.1 Dual Coordinate Representation

Every node $i \in V$ is defined in both polar and Cartesian coordinate systems:

- **Polar Coordinates**: $(r_i, \theta_i)$, where $r_i$ is the radius of ring $k_i = \text{ring}(i)$, and $\theta_i \in [0, 2\pi)$ is the angular position assigned during proportional wedge allocation.
- **Cartesian Extents**: The node's positioned box is an axis-aligned rectangle centered at $(c_{x,i}, c_{y,i}) = (r_i a_x \cos\theta_i, r_i a_y \sin\theta_i)$ with dimensions $(w_i, h_i)$:
  $$\mathcal{B}_i = \left[ c_{x,i} - \frac{w_i}{2}, c_{x,i} + \frac{w_i}{2} \right] \times \left[ c_{y,i} - \frac{h_i}{2}, c_{y,i} + \frac{h_i}{2} \right]$$
  where $(a_x, a_y)$ are aspect ratio ellipse scaling factors ($a_x a_y = 1$).

### 1.2 Polar Bounding Sector of an AABB

For an intermediate obstacle node $j$ with box $\mathcal{B}_j$, the four corner vertices are:
$$V_j = \left\{ \left(c_{x,j} \pm \frac{w_j}{2}, c_{y,j} \pm \frac{h_j}{2}\right) \right\}$$
The polar angular footprint $[\theta_{j,\min}, \theta_{j,\max}]$ and radial footprint $[r_{j,\min}, r_{j,\max}]$ are bounded by:
$$\theta_{j,\min} = \min_{p \in V_j} \operatorname{atan2}(p_y / a_y, p_x / a_x), \quad \theta_{j,\max} = \max_{p \in V_j} \operatorname{atan2}(p_y / a_y, p_x / a_x)$$
$$r_{j,\min} = \min_{p \in V_j} \sqrt{(p_x / a_x)^2 + (p_y / a_y)^2}, \quad r_{j,\max} = \max_{p \in V_j} \sqrt{(p_x / a_x)^2 + (p_y / a_y)^2}$$

Adding a safety clearance margin $\delta_{\text{clear}} = \text{effective\_node\_gap} / 2$:
$$\widetilde{\theta}_{j,\min} = \theta_{j,\min} - \frac{\delta_{\text{clear}}}{r_j}, \quad \widetilde{\theta}_{j,\max} = \theta_{j,\max} + \frac{\delta_{\text{clear}}}{r_j}$$
$$\widetilde{r}_{j,\min} = r_{j,\min} - \delta_{\text{clear}}, \quad \widetilde{r}_{j,\max} = r_{j,\max} + \delta_{\text{clear}}$$

---

## 2. Polar Obstacle Detection & Collision Predicate

### 2.1 Candidate Edge Segment Testing

Let an edge $e = (u, v)$ have candidate waypoint sequence $P = \langle p_0, p_1, \dots, p_m \rangle$. For each line segment $S_k = \overline{p_k p_{k+1}}$ and each potential obstacle node $j \notin \{u, v\}$:

1. **Bounding Box Filter**:
   Query the `SpatialHash` with $\operatorname{AABB}(S_k)$ expanded by $\epsilon$.
2. **Exact Segment-Rect Intersection**:
   Using `segment_intersects_rect_interior(S_k, \mathcal{B}_j, \epsilon)`:
   - Check if either endpoint $p_k, p_{k+1}$ lies strictly inside $\mathcal{B}_j$.
   - Test 2D ray intersection against all 4 edges of $\mathcal{B}_j$:
     $$t_x(x) = \frac{x - p_{k,x}}{p_{k+1,x} - p_{k,x}}, \quad t_y(y) = \frac{y - p_{k,y}}{p_{k+1,y} - p_{k,y}}$$
   - If the interval $[\max(t_{x,\min}, t_{y,\min}), \min(t_{x,\max}, t_{y,\max})]$ is non-empty and overlaps $(0, 1)$, collision is flagged.

---

## 3. Concentric Routing Channel & Corridor Architecture

To route around obstacle nodes without introducing chaotic geometry, PCDRA establishes dedicated concentric routing corridors between adjacent node rings.

```
       Ring k+1:  o=== [ Node V ] ===============================o  Radius R_{k+1}
                   \
        Corridor k: . . . . . . . . . . . . . . . . . . . . . . .  Radius R_{corr,k}
                     \           \
                      \           \--> Detour Arc along Corridor
                       \
       Ring k:    ====== [ Obstacle Node W ] =====================  Radius R_k
                         /
        Corridor k-1:. . . . . . . . . . . . . . . . . . . . . . .  Radius R_{corr,k-1}
                       /
       Ring k-1:  o=== [ Node U ] ===============================o  Radius R_{k-1}
```

### 3.1 Inter-Ring Routing Corridors

For ring indices $k \in \{0, 1, \dots, K-1\}$:
$$R_{\text{corr}, k} = \frac{R_k + R_{k+1}}{2}$$
The corridor has radial clearance width:
$$W_{\text{corr}, k} = (R_{k+1} - R_k) - \frac{1}{2}\left(\max_{j \in \text{Ring } k} H_j + \max_{l \in \text{Ring } k+1} H_l\right) \ge \text{radial\_ring\_gap}$$

### 3.2 Intra-Ring Arc Corridors

When routing between two nodes on the same ring $k$ separated by intermediate nodes on ring $k$, the edge is routed through either:

1. **Outer Corridor ($R_{\text{corr}, k}$)**: Favored for standard tree chords.
2. **Inner Corridor ($R_{\text{corr}, k-1}$)**: Favored for feedback / back-edges.

---

## 4. Waypoint Generation Algorithm

When a direct line segment $\overline{p_u p_v}$ intersects an obstacle set $\mathcal{O} = \{j_1, j_2, \dots, j_m\}$, waypoints are generated according to the relative topology:

```
Algorithm 1: Polar Obstacle Detour Routing
Input: GraphIr, Node Positions {B_i}, Edge e = (u, v), Obstacle Set O
Output: RoutedPath with Waypoint Polyline W

1. Find the primary corridor radius R_corr:
   If ring(u) == ring(v):
       R_corr = (bow_inward) ? R_corr(ring(u)-1) : R_corr(ring(u))
   Else:
       R_corr = R_corr(min(ring(u), ring(v)))

2. Identify the angular span of the obstacle cluster:
   theta_start = min_{j in O} theta_j,min - delta_clear
   theta_end   = max_{j in O} theta_j,max + delta_clear

3. Select detour direction (clockwise vs counter-clockwise):
   delta_CW  = (theta_v >= theta_u) ? (theta_v - theta_u) : (2*PI + theta_v - theta_u)
   delta_CCW = (theta_u >= theta_v) ? (theta_u - theta_v) : (2*PI + theta_u - theta_v)
   direction = (delta_CW <= delta_CCW) ? CW : CCW

4. Generate detour waypoints along R_corr:
   p_entry = Point(R_corr * ax * cos(theta_entry), R_corr * ay * sin(theta_entry))
   p_mid   = Point(R_corr * ax * cos((theta_entry + theta_exit)/2), R_corr * ay * sin(...))
   p_exit  = Point(R_corr * ax * cos(theta_exit), R_corr * ay * sin(theta_exit))

5. Assemble polyline:
   W = < p_src, p_entry, p_mid, p_exit, p_tgt >
6. Clip endpoints to source and target node boundaries.
7. Return W
```

### 4.1 Waypoint Coordinate Equations

Given entry angle $\theta_1$ and exit angle $\theta_2$ along corridor radius $R_{\text{corr}}$:
$$P_1 = \left( R_{\text{corr}} a_x \cos\theta_1, \; R_{\text{corr}} a_y \sin\theta_1 \right)$$
$$P_{\text{mid}} = \left( R_{\text{corr}} a_x \cos\left(\frac{\theta_1 + \theta_2}{2}\right), \; R_{\text{corr}} a_y \sin\left(\frac{\theta_1 + \theta_2}{2}\right) \right)$$
$$P_2 = \left( R_{\text{corr}} a_x \cos\theta_2, \; R_{\text{corr}} a_y \sin\theta_2 \right)$$

For long angular spans ($|\theta_2 - \theta_1| > \pi/3$), additional intermediate arc subdivision points are inserted at intervals of $\Delta\theta \le \pi/6$ to ensure smooth spline rendering in the SVG/Canvas frontend.

---

## 5. Geometric Invariants & Quality Guarantees

1. **Strict Node Interior Clearance**:
   $$\forall e \in E, \forall j \notin \{\text{src}(e), \text{tgt}(e)\}, \quad \operatorname{Polyline}(e) \cap \operatorname{Interior}(\mathcal{B}_j) = \emptyset$$
2. **Radial Monotonicity**:
   Tree edges traverse monotonically outward from ring $k$ to ring $k+1$ without reversing radial direction.
3. **Bounded Arc Length**:
   Detour paths along corridor $R_{\text{corr}}$ have bounded arc length $L_{\text{detour}} \le R_{\text{corr}} |\Delta\theta| + \Delta R \le \sqrt{2} L_{\text{euclidean}}$.
4. **Boundary Normal Attachment**:
   All ports attach precisely to the boundary perimeter of source and target nodes with outward-pointing stubs perpendicular to the nearest bounding face.
