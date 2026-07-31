# 05. Dynamic Spacing Demands & Node Gap Expansion

This module documents how edge badge clearance requirements dynamically trigger exact spacing demands, expanding node gaps to position badges directly between node cards with zero overlaps.

---

## 1. The Badge Clearance Challenge

When an edge carries a badge (label text or cycle marker $\circlearrowleft$), placing the badge directly on the straight edge line between adjacent nodes requires a minimum horizontal clearance corridor $G_{\text{req}}$.

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

## 2. Required Same-Rank Gap Equation

For a same-rank edge with measured badge width $W_{\text{badge}}$, the minimum required horizontal gap $G_{\text{req}}$ between node boundaries is:

$$G_{\text{req}} = W_{\text{badge}} + 2 \cdot C_{\text{badge}} + 2 \cdot L_{\text{stub}}$$

Where:
- $C_{\text{badge}} = 10\text{px}$: Badge clearance margin.
- $L_{\text{stub}} = 20\text{px}$: Port stub length.

If the current node gap $G_{\text{current}} < G_{\text{req}}$, `badgePlacement.ts` detects that direct on-path candidates are blocked and emits a spacing request:

$$\mathcal{D} = \langle \text{kind}: \text{"node-gap"}, \text{rank}: r, \text{afterNodeId}: u, \text{minimum}: G_{\text{req}} \rangle$$

---

## 3. Feedback Loop & Coordinate Adjustment

```
   1. Candidate Selection -> 2. Detect Gap Contraction -> 3. Emit Spacing Demand D
             ▲                                                         │
             │                                                         ▼
   5. Re-run A* Routing <- 4. Re-calculate Node Positions X(v) <───────┘
```

When `stateEvaluator.ts` receives demand $\mathcal{D}$:
1. It updates spacing overrides: $\text{nodeGapAfterNodeId.set}(u, G_{\text{req}})$.
2. It re-executes `computeNodeLayout`:
   $$X(v_{i+1}) = X(v_i) + \frac{W(v_i) + W(v_{i+1})}{2} + \max(G_{\text{default}}, G_{\text{req}})$$
3. Node $v_{i+1}$ is shifted right by $\Delta x = G_{\text{req}} - G_{\text{default}}$.
4. The edge path and badge are re-routed in the expanded 238px corridor with **zero node overlaps**!

---

## 4. Codebase Reference Map

- [badgePlacement.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L480-L498) — Candidate selection & spacing request emission
- [spacingDemand.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L185-L217) — `resolveEffectiveSpacingOverrides`
- [coordinateAssignment.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L30-L75) — `assignCoordinates` with effective gap evaluation

```typescript
// Code Snippet from badgePlacement.ts
const hasOnPathCandidate = candidates.some((c) => c.score < 500);

if (candidates.length === 0 || !hasOnPathCandidate) {
  spacingRequestsMap.set(edge.id, createBadgeSpacingRequest(edge, nodeLayout, config));
}
```
