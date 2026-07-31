# 01. State-Space Search & Lexicographic Fitness Vectors

[← Back to Master Index](../README.md)

This module documents the multi-objective state-space search framework powering the **Custom State-Space Engine**.

---

## 1. Discrete State Tuple Formulation

The layout solver models candidate layout configurations as a discrete state tuple $\sigma$:

$$\sigma = \left\langle \Pi_{\text{sides}}, \Omega_{\text{ports}}, \mathcal{D}_{\text{demands}}, \mathcal{L}_{\text{orders}}, \Delta_{\text{shifts}}, \mathcal{S}_{\text{visited}} \right\rangle$$

### Domain Definitions

1. **Port Side Assignment Function** ($\Pi_{\text{sides}}$):
   $$\Pi_{\text{sides}}: E \to \text{Side} \times \text{Side}, \quad \text{where } \text{Side} \in \{\text{top}, \text{right}, \text{bottom}, \text{left}\}$$
   Maps each edge $e = (u, v) \in E$ to a pair of port sides $\langle \text{srcSide}, \text{tgtSide} \rangle$.

2. **Pin Port Ordering Map** ($\Omega_{\text{ports}}$):
   $$\Omega_{\text{ports}}: V \times \text{Side} \to \text{Permutation}(E_{\text{attached}}(v, \text{side}))$$
   Defines the spatial ordering sequence of connected edge pins along each boundary side of vertex $v$.

3. **Active Exact Spacing Demands Set** ($\mathcal{D}_{\text{demands}}$):
   $$\mathcal{D}_{\text{demands}} \subseteq \mathcal{D}_{\text{exact}} = \{ \langle k, r, u, M, \text{reason} \rangle \}$$
   Specifies dynamic spatial constraints (rank gaps, node gaps, lane X/Y offsets, graph padding) injected to resolve edge badge and channel overlaps.

4. **Layer Node Order Permutations** ($\mathcal{L}_{\text{orders}}$):
   $$\mathcal{L}_{\text{orders}}: R \to \text{Permutation}(V_R)$$
   Defines the horizontal sequence of nodes assigned to rank layer $r \in R$.

5. **Fine Coordinate Alignments** ($\Delta_{\text{shifts}}$):
   $$\Delta_{\text{shifts}}: V \to \mathbb{R}$$
   Contains continuous sub-pixel X/Y coordinate shifts applied during final alignment.

6. **Visited Hash Signatures** ($\mathcal{S}_{\text{visited}}$):
   $$\mathcal{S}_{\text{visited}} \subset \Sigma_{\text{hash}}$$
   Set of unique state hashes $\mathcal{H}(\sigma)$ visited during search to prevent infinite cycles.

```
                               State Tuple Structure (σ)
   ┌──────────────────────────────────────────────────────────────────────────────────┐
   │ Π_sides    : Map<EdgeId, { srcSide: Side, tgtSide: Side }>                        │
   │ Ω_ports    : Record<NodeSideKey, EdgeId[]> (Pin Port Sequence)                   │
   │ D_demands  : ExactSpacingDemand[] (Dynamic Gap Overrides G_req)                   │
   │ L_orders   : Map<RankIndex, NodeId[]> (In-Layer Rank Sequences)                   │
   │ Δ_shifts   : Map<NodeId, number> (Fine X/Y Alignments)                           │
   │ S_visited  : Set<StateHashString> (Cycle Prevention Set)                         │
   └──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Lexicographic Fitness Vector $\mathbf{C}(\sigma)$

Evaluating candidate state $\sigma$ yields a multi-criteria cost vector evaluated in strict lexicographic priority order.

### Conceptual 5-Tier Abstraction

$$\mathbf{C}_{\text{tier}}(\sigma) = \left\langle C_{\text{hard}}(\sigma), C_{\text{cross}}(\sigma), C_{\text{bends}}(\sigma), C_{\text{length}}(\sigma), C_{\text{badges}}(\sigma) \right\rangle$$

```
                                  Lexicographic Tier Hierarchy
             ┌─────────────────────────────────────────────────────────────────┐
             │ Priority 1: C_hard (Hard Failures / Overlaps / Collisions)      │
             └────────────────────────────────┬────────────────────────────────┘
                                              │ (Must be 0)
                                              ▼
             ┌─────────────────────────────────────────────────────────────────┐
             │ Priority 2: C_cross (Edge Crossings & Intersections)            │
             └────────────────────────────────┬────────────────────────────────┘
                                              │ (Minimize)
                                              ▼
             ┌─────────────────────────────────────────────────────────────────┐
             │ Priority 3: C_bends (Orthogonal Bends & Avoidable Hairpins)     │
             └────────────────────────────────┬────────────────────────────────┘
                                              │ (Minimize)
                                              ▼
             ┌─────────────────────────────────────────────────────────────────┐
             │ Priority 4: C_length (Total Manhattan Wire Length & Deviation)   │
             └────────────────────────────────┬────────────────────────────────┘
                                              │ (Minimize)
                                              ▼
             ┌─────────────────────────────────────────────────────────────────┐
             │ Priority 5: C_badges (Badge Separation & Leader Metrics)        │
             └─────────────────────────────────────────────────────────────────┘
```

### Full 21-Element Implementation Vector

In the codebase (`src/engine/layout/custom/layoutObjective.ts`), fitness is formally computed as a 21-element metric vector:

$$\mathbf{C}(\sigma) = \left\langle C_1(\sigma), C_2(\sigma), \dots, C_{21}(\sigma) \right\rangle \in \mathbb{R}^{21}$$

| Index $k$ | Metric Key | Category | Optimization Goal |
| :--- | :--- | :--- | :--- |
| $C_1$ | `hardErrorCount` | Hard Boundary | Structural topology validity ($= 0$) |
| $C_2$ | `unresolvedRouteCount` | Hard Boundary | Unroutable edge paths ($= 0$) |
| $C_3$ | `nodeNodeOverlaps` | Hard Clearance | Node bounding box collisions ($= 0$) |
| $C_4$ | `edgeNodePenetrations` | Hard Clearance | Edge routes penetrating node cards ($= 0$) |
| $C_5$ | `sharedEdgeSegmentLength` | Hard Clearance | Collinear edge segment overlaps ($= 0$) |
| $C_6$ | `unresolvedBadgeCount` | Badge Placement | Unplaced edge label badges ($= 0$) |
| $C_7$ | `badgeNodeOverlaps` | Badge Placement | Badge overlapping node bounds |
| $C_8$ | `badgeBadgeOverlaps` | Badge Placement | Badge overlapping another badge |
| $C_9$ | `badgeUnrelatedEdgeOverlaps` | Badge Placement | Badge overlapping unattached edge |
| $C_{10}$ | `crossingCount` | Aesthetics | Edge-edge crossings count |
| $C_{11}$ | `ordinaryLeaderCount` | Badge Aesthetics | Leader lines on ordinary edges |
| $C_{12}$ | `avoidableHairpinCount` | Route Aesthetics | $180^\circ$ U-turn hairpins |
| $C_{13}$ | `excessBendCount` | Route Aesthetics | Bends exceeding max allowed (3 or 4) |
| $C_{14}$ | `hairpinCount` | Route Aesthetics | Total hairpin count |
| $C_{15}$ | `bendCount` | Route Aesthetics | Total $90^\circ$ orthogonal bends |
| $C_{16}$ | `directionDeviationPenalty` | Route Aesthetics | Non-ideal port side exiting penalty |
| $C_{17}$ | `totalLength` | Geometry | Total Manhattan edge length |
| $C_{18}$ | `portSideImbalance` | Port Balance | Variance of edge counts per node side |
| $C_{19}$ | `feedbackLeaderCount` | Badge Aesthetics | Leader lines on feedback edges |
| $C_{20}$ | `totalLeaderLength` | Badge Aesthetics | Sum of leader line segment lengths |
| $C_{21}$ | `totalArea` | Bounding Box | Total graph layout bounding area |

### Strict Lexicographic Comparison Operator ($\prec$)

State $\sigma_A$ is strictly superior to state $\sigma_B$ ($\sigma_A \prec \sigma_B$) if and only if at the first index $k \in \{1, 2, \dots, 21\}$ where $C_k(\sigma_A) \neq C_k(\sigma_B)$, we have:

$$C_k(\sigma_A) < C_k(\sigma_B)$$

If $C_k(\sigma_A) = C_k(\sigma_B)$ for all $k \in \{1, \dots, 21\}$, tie-breaking is performed deterministically using string comparison on state hash signatures:

$$\mathcal{H}(\sigma_A) <_{\text{lex}} \mathcal{H}(\sigma_B)$$

---

## 3. Neighborhood Perturbation Operators $\mathcal{N}(\sigma)$

From candidate state $\sigma$, neighboring search states $\mathcal{N}(\sigma) = \bigcup_{i=1}^6 \mathcal{N}_i(\sigma)$ are generated by discrete perturbation operators:

1. **Port Order Permutation** ($\mathcal{N}_1$): Swap pin positions of adjacent edge ports on the same node side.
2. **Side Flip** ($\mathcal{N}_2$): Move an edge port attachment from its current side to an adjacent side (e.g. `bottom` $\to$ `left`/`right`).
3. **Layer Order Swap** ($\mathcal{N}_3$): Swap horizontal sequence indices of adjacent nodes $v_i, v_{i+1}$ on rank layer $L_r$.
4. **Spacing Demand Expansion** ($\mathcal{N}_4$): Inject dynamic gap override demand $G_{\text{req}}$ to resolve badge or routing channel clearance.
5. **Port Side Reset** ($\mathcal{N}_5$): Reset explicit side assignments for edges blocked by unresolved badge placement requests.
6. **Layer Shift Realignment** ($\mathcal{N}_6$): Adjust fine X-alignment offset $\Delta_{\text{shifts}}$ for sub-graph centering.

### Search Transition Rule

At search iteration $t$, the optimizer updates state via local greedy transition:

$$\sigma^{(t+1)} = \arg\min_{\sigma' \in \mathcal{N}(\sigma^{(t)})} \mathbf{C}(\sigma')$$

Subject to $\mathcal{H}(\sigma^{(t+1)}) \notin \mathcal{S}_{\text{visited}}$.

```
                              State Transition & Neighborhood Search
   ┌──────────────────┐        Generate N(σ)        ┌──────────────────┐
   │ Current State σ  │ ──────────────────────────> │ Neighbor States  │
   └────────┬─────────┘                             └────────┬─────────┘
            │                                                │
            │ Evaluate C(σ)                                  │ Evaluate C(σ')
            ▼                                                ▼
   ┌──────────────────┐       Select Minimum σ'     ┌──────────────────┐
   │ Score Vector C   │ <────────────────────────── │ Min Score C(σ')  │
   └──────────────────┘    where C(σ') < C(σ)       └──────────────────┘
```

---

## 4. Step-by-Step Developer Walkthrough

1. **Initialize State**: Call `createInitialSearchState()` to construct state tuple $\sigma^{(0)}$ with default side assignments and empty demands.
2. **Evaluate Baseline**: Execute `evaluateSearchState()` to compute node positions, route edges, place badges, and compute baseline score vector $\mathbf{C}(\sigma^{(0)})$.
3. **Generate Neighborhood**: `searchBestLayoutState()` invokes perturbation operators ($\mathcal{N}_1, \dots, \mathcal{N}_6$) to build candidate set $\mathcal{N}(\sigma)$.
4. **Lexicographic Comparison**: Compare candidate scores using `compareLayoutScore()`. If a candidate $\sigma'$ satisfies $\sigma' \prec \sigma^{(t)}$, update $\sigma^{(t+1)} \leftarrow \sigma'$.
5. **Convergence Termination**: Terminate search when no neighbor improves the score ($\mathcal{N}(\sigma) \text{ exhausted}$), budget limits are reached, or target score is attained.

---

## 5. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/searchState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L80)
  - [`createInitialSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L22) — Construct initial state tuple $\sigma$
  - [`cloneSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L24-L53) — Deep copy search state tuple
  - [`computeStateHash`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L55-L79) — Deterministic hash calculation $\mathcal{H}(\sigma)$
- [`src/engine/layout/custom/layoutOptimizerState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L96-L280)
  - [`searchBestLayoutState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L96-L280) — Neighborhood search loop solver
- [`src/engine/layout/custom/stateEvaluator.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L217)
  - [`evaluateSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L217) — Candidate evaluation & dynamic spacing feedback loop
- [`src/engine/layout/custom/layoutObjective.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L268)
  - [`ORDER`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L36) — 21-element lexicographic priority array
  - [`compareLayoutScore`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L38-L44) — Strict lexicographic vector comparator $\prec$

```typescript
// Code Snippet from searchState.ts (L4-L22)
export function createInitialSearchState(
  sideAssignments?: Map<string, PortSideAssignment>,
): LayoutSearchState {
  const sideMap = new Map<string, PortSideAssignment>();
  if (sideAssignments) {
    for (const [k, v] of sideAssignments.entries()) {
      sideMap.set(k, { srcSide: v.srcSide, tgtSide: v.tgtSide });
    }
  }

  return {
    sideAssignments: sideMap,
    portOrders: {},
    exactDemands: [],
    layerOrders: new Map(),
    layerShifts: new Map(),
    visitedSignatures: new Set(),
  };
}

// Code Snippet from layoutObjective.ts (L38-L44)
export function compareLayoutScore(a: LayoutScore, b: LayoutScore): number {
  for (const key of ORDER) {
    const diff = ((a[key] as number | undefined) ?? 0) - ((b[key] as number | undefined) ?? 0);
    if (diff !== 0) return diff;
  }
  return a.stateHash.localeCompare(b.stateHash);
}
```
