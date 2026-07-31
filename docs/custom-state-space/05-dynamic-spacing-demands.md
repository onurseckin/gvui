# 05. Dynamic Spacing Demands & Node Gap Expansion

[← Back to Master Index](../README.md)

This module documents dynamic node gap expansion demands injected into the layout engine to eliminate edge badge collisions on same-rank and cyclic back-edges.

---

## 1. The Edge Badge Clearance Challenge

When edges connect nodes on the same rank layer (e.g. `Auth Service` and `User Service`) or cycle back to previous ranks, edge badges (e.g. `↺ verifies permissions`) require a minimum horizontal clearance $G_{\text{req}}$ that exceeds standard default node spacing (56px).

```
          UNEXPANDED GAP (56px) -> BADGE OVERLAPS NODES!
     ┌────────────┐                         ┌────────────┐
     │ Auth       │──[↺ verifies permissions]──│ User       │
     └────────────┘   (Badge Width 178px)   └────────────┘
      x:80..368                              x:424..736
                      (Badge Overlaps Both Nodes!)

          EXPANDED GAP (238px) -> ZERO OVERLAPS!
     ┌────────────┐                                     ┌────────────┐
     │ Auth       │───[ ↺ verifies permissions ]───│ User       │
     └────────────┘        (Badge Width 178px)          └────────────┘
      x:80..368           x:398..........x:576           x:606..918
```

---

## 2. Spacing Clearance Derivation $G_{\text{req}}$

Given an edge badge of measured width $W_{\text{badge}}$, badge margin clearance $C_{\text{badge}} = 12\text{px}$, and minimum line stub length $L_{\text{stub}} = 18\text{px}$:

$$G_{\text{req}} = W_{\text{badge}} + 2 \cdot C_{\text{badge}} + 2 \cdot L_{\text{stub}}$$

```
                       Required Spacing Gap Components
       │<───────────────────────────── G_req ─────────────────────────────>│
       │                                                                   │
       ├─── Stub ───┬── Clearance ──┬── Badge Width W ──┬── Clearance ──┬── Stub ───┤
       │ (L_stub)   │  (C_badge)    │   (W_badge)       │  (C_badge)    │ (L_stub)  │
       │    18px    │     12px      │     178px         │     12px      │   18px    │
```

---

## 3. Spacing Demand Tuple Formulation $\mathcal{D}_i$

When candidate placement along an edge path fails or encounters node overlaps, the engine emits an exact spacing demand tuple:

$$\mathcal{D}_i = \left\langle k, r, u, M, \text{reason} \right\rangle \in \mathcal{K} \times \mathbb{N} \times V \times \mathbb{R}^+ \times \mathcal{R}$$

### Field Definitions

1. **Kind** ($k \in \mathcal{K}$): Demanded axis parameter, where $\mathcal{K} = \{\text{rank-gap}, \text{node-gap}, \text{lane-x}, \text{lane-y}, \text{graph-padding}\}$.
2. **Rank Layer Index** ($r \in \mathbb{N}$): Rank layer target for gap expansion.
3. **Predecessor Node ID** ($u \in V$): Specific node after which horizontal gap expansion must be injected.
4. **Minimum Distance** ($M = G_{\text{req}}$): Minimum required physical pixel distance ($M \in \mathbb{R}^+$).
5. **Reason Category** ($\text{reason} \in \mathcal{R}$): Trigger rationale ($\mathcal{R} = \{\text{same-rank-label}, \text{parallel-labels}, \text{blocked-direct-badge}, \text{endpoint-fan-out}, \text{crossing-channel}, \text{node-overlap}\}$).

### Linear X-Coordinate Projection System

In `coordinateAssignment.ts`, node X-coordinates along rank $r$ are projected using effective spacing overrides:

$$x(v_{r, i+1}) - x(v_{r, i}) \ge w(v_{r, i}) + G_{\text{eff}}(r, i)$$

Where $G_{\text{eff}}(r, i) = \max \left( G_{\text{default}}, \max \{ M \mid \mathcal{D}_j \text{ targets rank } r \text{ or node } v_{r, i} \} \right)$.

---

## 4. Dynamic Expansion Feedback Loop & Convergence Analysis

```
  ┌─────────────────────────┐
  │ Candidate Selection     │ --> Direct On-Path Candidate Blocked? (Gap < G_req)
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │ Emit Spacing Demand D   │ --> minimum: G_req (e.g., 238px)
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │ Canonicalize Demands D  │ --> canonicalizeExactSpacingDemands()
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │ Re-Run assignCoordinates│ --> Apply spacingOverrides.nodeGapByRank
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │ Expanded Node Layout    │ --> Gap expanded from 56px to 238px
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │ Badge Centered on Edge  │ --> ZERO OVERLAPS! (Verified)
  └─────────────────────────┘
```

### Fixed-Point Monotonicity & Convergence Theorem

Let $G^{(t)}$ be the vector of effective gap overrides at feedback iteration $t$. Because demand canonicalization monotonically increases gap requirements ($G^{(t+1)} \ge G^{(t)}$) and maximum allowed node gap expansion is bounded by canvas layout budgets, the feedback loop constitutes a monotonic bounded operator on a finite discrete grid. Thus, the iterative search converges to a unique minimal feasible layout fixed point $X^*$.

---

## 5. Step-by-Step Developer Walkthrough

1. **Badge Clearance Evaluation**: Place candidate edge badges via `placeEdgeBadges()`. If direct on-path placement is blocked by node bounds (i.e. available gap $< G_{\text{req}}$), create a `BadgeSpacingRequest`.
2. **Emit Spacing Demand**: Convert spacing request to an `ExactSpacingDemand` tuple specifying `kind: "node-gap"`, `rank`, `afterNodeId`, and `minimum: G_req`.
3. **Canonicalize Demands**: Pass emitted demands to `canonicalizeExactSpacingDemands()` to resolve conflicts across multiple edge requests on the same rank, keeping the maximum required gap.
4. **Resolve Overrides**: Call `resolveExactSpacingDemands()` to construct `SpacingOverrides` map.
5. **Re-Run Coordinate Projection**: Re-run `computeNodeLayout()` with updated spacing overrides to shift nodes horizontally and expand layout channels.
6. **Re-Route & Verify**: Re-route edges and re-evaluate badge placement to confirm ZERO overlaps ($C_{\text{badgeNodeOverlaps}} = 0$).

---

## 6. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/badgePlacement.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L480-L550)
  - [`placeEdgeBadges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L1-L200) — Badge candidate placement & spacing request emission
- [`src/engine/layout/custom/spacingDemand.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L20-L150)
  - [`requiredSameRankBadgeGap`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L20-L22) — $G_{\text{req}}$ clearance calculation
  - [`canonicalizeExactSpacingDemands`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L38-L60) — Spacing demand deduplication & scope max resolver
  - [`resolveExactSpacingDemands`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L61-L150) — Map generator for rank/node gap overrides
- [`src/engine/layout/custom/badgeMeasurement.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgeMeasurement.ts#L26-L60)
  - [`measureBadgeRect`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgeMeasurement.ts#L26-L45) — SVG badge dimensions measurement
- [`src/engine/layout/custom/coordinateAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L30-L120)
  - X-coordinate projection pipeline with effective gap overrides

```typescript
// Code Snippet from spacingDemand.ts (L20-L22)
export function requiredSameRankBadgeGap(badgeWidth: number, config: CustomLayoutConfig): number {
  return badgeWidth + 2 * config.badgeClearance + 2 * config.portStubLength;
}

// Code Snippet from stateEvaluator.ts (L124-L135)
if (badgeResult.spacingRequests && badgeResult.spacingRequests.length > 0) {
  const requests = badgeResult.spacingRequests.map(
    (req): ExactSpacingDemand => ({
      kind: req.kind,
      rank: req.rank,
      afterNodeId: req.afterNodeId,
      affectedEdgeIds: [req.edgeId],
      minimum: req.minimum,
      reason: req.reason,
    }),
  );
  const { effectiveSpacingChanged } = mergeActionableDemands(requests);
  // Re-run computeNodeLayout...
}
```
