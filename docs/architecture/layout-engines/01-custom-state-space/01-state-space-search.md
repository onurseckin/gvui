# 01. State-Space Search & Optimization Strategy

This module documents the core optimization model powering the **Custom State-Space Engine**.

---

## 1. Mathematical State Representation

A layout state $\sigma \in \mathcal{S}$ represents a discrete spatial configuration of the graph:

$$\sigma = \langle \Pi_{\text{sides}}, \Omega_{\text{ports}}, \mathcal{D}_{\text{demands}}, \mathcal{L}_{\text{orders}}, \Delta_{\text{shifts}} \rangle$$

### Tuple Components

```
                          State Tuple σ
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
┌──────▼──────┐          ┌──────▼──────┐          ┌──────▼──────┐
│  Π_sides    │          │  Ω_ports    │          │  D_demands  │
│ Port Sides  │          │ Port Orders │          │ Spacing Req │
└─────────────┘          └─────────────┘          └─────────────┘
       │                        │                        │
┌──────▼──────┐          ┌──────▼──────┐                 │
│  L_orders   │          │  Δ_shifts   │                 │
│ Rank Orders │          │ Sub-Ranks   │                 │
└─────────────┘          └─────────────┘                 ▼
```

- **$\Pi_{\text{sides}}$**: Port side map $\text{EdgeId} \to \{ \text{srcSide}, \text{tgtSide} \}$ where side $\in \{ \text{Top}, \text{Right}, \text{Bottom}, \text{Left} \}$.
- **$\Omega_{\text{ports}}$**: Port ordering along node boundaries $\text{NodeId:Side} \to [\text{EdgeId}_1, \text{EdgeId}_2, \dots]$.
- **$\mathcal{D}_{\text{demands}}$**: Spacing overrides array $[\langle \text{kind}, \text{rank}, \text{afterNodeId}, \text{minimum} \rangle]$.
- **$\mathcal{L}_{\text{orders}}$**: Topological rank layer orders $\text{Rank} \to [\text{NodeId}_1, \text{NodeId}_2, \dots]$.
- **$\Delta_{\text{shifts}}$**: Coordinate shifts $\text{NodeId} \to \Delta x$.

---

## 2. Lexicographic Fitness Cost Vector

Rather than collapsing all quality metrics into an arbitrary scalar sum, the engine evaluates candidates using a **lexicographic cost vector** $\mathbf{C}(\sigma)$:

$$\mathbf{C}(\sigma) = \left\langle C_{\text{hard}}(\sigma), C_{\text{cross}}(\sigma), C_{\text{bends}}(\sigma), C_{\text{length}}(\sigma), C_{\text{badges}}(\sigma) \right\rangle$$

```
                           Lexicographic Hierarchy
            ┌──────────────────────────────────────────────────┐
            │ Priority 1: C_hard (Hard Conflicts / Overlaps)  │
            └────────────────────────┬─────────────────────────┘
                                     │ (Must be 0)
                                     ▼
            ┌──────────────────────────────────────────────────┐
            │ Priority 2: C_cross (Edge Crossings)             │
            └────────────────────────┬─────────────────────────┘
                                     │ (Minimize)
                                     ▼
            ┌──────────────────────────────────────────────────┐
            │ Priority 3: C_bends (Route 90° Bends)            │
            └────────────────────────┬─────────────────────────┘
                                     │ (Minimize)
                                     ▼
            ┌──────────────────────────────────────────────────┐
            │ Priority 4: C_length (Total Manhattan Distance)  │
            └────────────────────────┬─────────────────────────┘
                                     │ (Minimize)
                                     ▼
            ┌──────────────────────────────────────────────────┐
            │ Priority 5: C_badges (Badge Separation Penalty) │
            └──────────────────────────────────────────────────┘
```

When comparing two states $\sigma_A$ and $\sigma_B$, $\sigma_A \prec \sigma_B$ if at the first index $k$ where $C_k(\sigma_A) \neq C_k(\sigma_B)$, we have $C_k(\sigma_A) < C_k(\sigma_B)$.

---

## 3. Neighborhood Search Transitions

The optimizer explores candidate states by generating trial neighborhood states through discrete perturbation operators:

1. **Port Order Permutation**: Swapping adjacent ports along a node boundary side.
2. **Side Flip**: Switching port departure side from Bottom to Right or Left for feedback/cycle edges.
3. **Layer Order Swap**: Swapping adjacent nodes within the same rank layer $L_r$.
4. **Demand Expansion**: Injecting an exact spacing demand $\mathcal{D}$ when a badge cannot fit on-path.

---

## 4. Codebase Reference Map

- [searchState.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L22) — `createInitialSearchState`, `cloneSearchState`
- [layoutOptimizerState.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L96-L150) — `searchBestLayoutState`
- [stateEvaluator.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L90) — `evaluateSearchState`

```typescript
// Code Snippet from searchState.ts
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
```
