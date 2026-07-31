# 05. Dynamic Spacing Demands & Node Gap Expansion

[← Back to Master Index](../README.md)

This module documents dynamic node gap expansion demands to eliminate edge badge collisions on same-rank and cyclic back-edges.

---

## 1. The Edge Badge Clearance Challenge

When edges connect nodes on the same rank layer (e.g. `Auth Service` and `User Service`) or cycle back to previous ranks, edge badges (e.g. `↺ verifies permissions`) require a minimum horizontal clearance $G_{\text{req}}$ that exceeds standard node spacing (56px).

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

## 2. Spacing Demand Equation $G_{\text{req}}$

Given an edge badge of measured width $W_{\text{badge}}$, badge margin clearance $C_{\text{badge}} = 12\text{px}$, and minimum line stub length $L_{\text{stub}} = 18\text{px}$:

$$G_{\text{req}} = W_{\text{badge}} + 2 \cdot C_{\text{badge}} + 2 \cdot L_{\text{stub}}$$

### Spacing Demand Tuple $\mathcal{D}$

When a direct candidate between nodes is blocked:

$$\mathcal{D} = \left\langle \text{kind}: \text{"node-gap"}, \text{rank}: r, \text{afterNodeId}: u, \text{minimum}: G_{\text{req}} \right\rangle$$

---

## 3. Dynamic Expansion Feedback Loop

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

---

## 4. Codebase Reference Map

- [badgePlacement.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L480-L498) — Candidate selection & spacing request emission
- [spacingDemand.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L185-L217) — `resolveEffectiveSpacingOverrides`
- [coordinateAssignment.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L30-L75) — X-coordinate projection with effective gap overrides

```typescript
// Code Snippet from badgePlacement.ts
if (!placed && onPathBlocked) {
  const reqGap = requiredSameRankBadgeGap(badgeWidth);
  spacingRequestsMap.set(edge.id, createBadgeSpacingRequest(edge, nodeLayout, config));
}
```
