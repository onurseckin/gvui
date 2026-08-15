# Module 3: Radial Badge Clearance Allocation Design

## Executive Summary

Edge badges in GVUI display composite telemetry metadata, step numbers, action titles, and bundle multipliers (e.g. `x14`, `CYCLE (step 2)`). In the layered engine, badge bounding boxes are assigned virtual dummy node positions during rank assignment and given dedicated routing channels, guaranteeing $0$ badge-node and $0$ badge-badge overlaps. In the radial engine, however, badge placement currently operates as a local greedy Cartesian offset pass (`7_2_geometric_common.rs`), resulting in significant soft collisions (`badgeNodeOverlaps`, `badgeBadgeOverlaps`, `badgeEdgePenetrations`) and fallback leader lines in dense topologies.

This specification details the **Polar Sector Clearance Allocation (PSCA)** model, formalizing angular sector reservations, ring circumference inflation, polar candidate generation, and multi-edge badge staggering to achieve strict zero-tolerance compliance ($0$ badge collisions) in radial mode.

---

## 1. The Polar Sector Reservation Model

### 1.1 Badge Angular Footprint in Polar Coordinates

A badge $b$ with measured bounding box dimensions $(w_b, h_b)$ placed at radial distance $R_b$ subtends an angular sector $\Delta\theta_b$:
$$\Delta\theta_b(R_b) = 2 \arctan\left( \frac{\sqrt{w_b^2 + h_b^2}}{2 R_b} \right) \approx \frac{w_b |\sin\theta| + h_b |\cos\theta|}{R_b}$$

To prevent overlap with the parent edge's endpoint nodes and adjacent radial spokes, a badge must be allocated an exclusive polar clearance sector:
$$\mathcal{S}_b = \left[ \theta_b - \frac{\Delta\theta_b}{2} - \delta_\theta, \; \theta_b + \frac{\Delta\theta_b}{2} + \delta_\theta \right] \times \left[ R_b - \frac{h_b}{2} - \delta_r, \; R_b + \frac{h_b}{2} + \delta_r \right]$$
where:

- $\delta_r = \text{config.badge\_clearance}$ (default $6\text{px}$)
- $\delta_\theta = \delta_r / R_b$

```
                       Outer Ring R_{k+1}
                    o======= [ Node V ] =======o
                       \         |         /
                        \     [ BADGE ]   /  <--- Polar Sector S_b Reserved!
                         \   (w_b x h_b) /
                          \      |      /
                    o======= [ Node U ] =======o
                       Inner Ring R_k
```

---

## 2. Circumferential Arc Inflation in Ring Sizing

In `crates/gvui/src/7_engines/7_3_radial.rs`, ring radii are sized based on node extents and `radial_ring_gap`. However, when multiple edges on ring $k$ carry badges, the required circumferential arc length is greater than the sum of node widths alone.

### 2.1 Composite Arc Sizing Equation

For each ring $k \in \{1, \dots, K\}$, let $\mathcal{E}_k = \{e = (u, v) \in E \mid \max(\text{ring}(u), \text{ring}(v)) = k \text{ and } e \text{ has badge } b_e\}$.

The circumferential arc demand $C_k$ is updated to:
$$C_k = \sum_{v \in \text{Ring } k} \left( w_v |\sin\theta_v| + h_v |\cos\theta_v| + \text{node\_gap} \right) + \sum_{e \in \mathcal{E}_k} \left( w_{b,e} |\sin\theta_e| + h_{b,e} |\cos\theta_e| + \text{badge\_gap} \right)$$

The minimum radius required for ring $k$ becomes:
$$R_{\text{circ}, k} = \frac{C_k}{2\pi} \cdot \frac{\text{RING\_ARC\_SLACK}}{a_{\min}}$$
where $a_{\min} = \min(a_x, a_y)$.

This guarantee ensures that every ring has sufficient physical arc to host both its resident node cards and all incident edge badges simultaneously.

---

## 3. Polar Candidate Generation & Multi-Edge Staggering

### 3.1 Polar Coordinate Candidate Offsets

Instead of generating candidate positions via Cartesian normal vectors $\hat{n} = (-\Delta y/L, \Delta x/L)$ (which graze node corners on diagonal spokes), candidates are evaluated along the natural polar coordinate grid:

For an edge $e = (u, v)$ with source at $(R_u, \theta_u)$ and target at $(R_v, \theta_v)$:

1. **Midpoint Anchor**:
   $$R_{\text{mid}} = \frac{R_u + R_v}{2}, \quad \theta_{\text{mid}} = \frac{\theta_u + \theta_v}{2}$$
2. **Radial Offsets**:
   $$R_{\text{cand}} \in \left\{ R_{\text{mid}}, \; R_{\text{mid}} \pm \Delta R, \; R_{\text{mid}} \pm 2\Delta R \right\}$$
   where $\Delta R = \frac{h_b + \delta_r}{2}$.
3. **Angular Offsets**:
   $$\theta_{\text{cand}} \in \left\{ \theta_{\text{mid}}, \; \theta_{\text{mid}} \pm \frac{w_b / 2 + \delta_r}{R_{\text{cand}}}, \; \theta_{\text{mid}} \pm \frac{w_b + 2\delta_r}{R_{\text{cand}}} \right\}$$

### 3.2 Parallel Multi-Edge Radial Staggering

When $M$ parallel edges connect node pair $(u, v)$ (e.g. scenario #25 with bundle multi-edges), placing all $M$ badges at the midpoint creates severe $O(M^2)$ badge-badge overlaps.

PCDRA resolves parallel bundles by **Radial Staggering**:
For edge $m \in \{0, 1, \dots, M-1\}$ in bundle:
$$t_m = \frac{m + 1}{M + 1} \in (0, 1)$$
$$R_m = (1 - t_m) R_u + t_m R_v, \quad \theta_m = (1 - t_m) \theta_u + t_m \theta_v$$
$$\text{Center}_m = \left( R_m a_x \cos\theta_m, \; R_m a_y \sin\theta_m \right)$$

This spreads the badges evenly along the chord length, ensuring each badge occupies an independent radial zone.

```
       Node V (Target)
          |
       [ BADGE 3 ] (t = 0.75)
          |
       [ BADGE 2 ] (t = 0.50)
          |
       [ BADGE 1 ] (t = 0.25)
          |
       Node U (Source)
```

---

## 4. Conflict Evaluation with Dynamic Edge Clearance Repulsion

### 4.1 Collision Area Objective Function

For any candidate badge rectangle $\mathcal{B}_{\text{cand}}$, the total conflict score is:
$$\Phi(\mathcal{B}_{\text{cand}}) = \alpha_N \sum_{j \in V} \operatorname{Area}(\mathcal{B}_{\text{cand}} \cap \mathcal{B}_j) + \alpha_B \sum_{b \in \mathcal{B}_{\text{placed}}} \operatorname{Area}(\mathcal{B}_{\text{cand}} \cap \mathcal{B}_b) + \alpha_E \sum_{S \in \text{Segs}} \operatorname{Len}(S \cap \mathcal{B}_{\text{cand}})$$
where weights are strictly ordered:
$$\alpha_N = 1000.0 \; (\text{Node overlap forbidden}), \quad \alpha_B = 1000.0 \; (\text{Badge overlap forbidden}), \quad \alpha_E = 100.0 \; (\text{Edge penetration penalized})$$

### 4.2 Leader Line Bounding

When $\Phi(\mathcal{B}_{\text{cand}}) > 0$ for all direct chord candidates, the candidate search expands along the concentric routing corridor $R_{\text{corr}}$. Because the corridor has guaranteed radial clearance $W_{\text{corr}} \ge \text{radial\_ring\_gap} > h_b$, a conflict-free slot is guaranteed to exist within $\Delta\theta \le \pm \pi/4$, eliminating the need for fallback leader lines across the canvas ($\text{leaderCount} \to 0$).

---

## 5. Summary of Badge Clearance Invariants

1. **Zero Badge-Node Overlaps**: $\text{badgeNodeOverlaps} = 0$ guaranteed across all 35 fixtures.
2. **Zero Badge-Badge Overlaps**: $\text{badgeBadgeOverlaps} = 0$ enforced via polar sector reservations and bundle staggering.
3. **Zero Badge-Edge Penetrations**: $\text{badgeEdgePenetrations} = 0$ enforced via corridor placement.
4. **Zero or Bounded Leaders**: $\text{leaderCount} \le 2$ total across the entire 35-fixture suite.
