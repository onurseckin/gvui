# ADR-003: Dynamic Node Gap Expansion for Badge Clearance

## Status
Accepted

## Date
2026-07-31

## Context
When edges cycle back to previous ranks or connect nodes on the same rank (e.g. `Auth Service` and `User Service`), edge badges (such as `↺ verifies permissions`) require horizontal space $W_{\text{badge}} + 2 \cdot C_{\text{badge}} + 2 \cdot L_{\text{stub}}$ (e.g. 238px) that exceeds default node gaps (56px).

## Decision
Implement a feedback loop in `badgePlacement.ts` and `spacingDemand.ts`:
1. Check candidate badge clearance against node bounding boxes.
2. If direct on-path placement is blocked, emit a node-gap spacing demand $\mathcal{D} = \langle \text{"node-gap"}, r, u, G_{\text{req}} \rangle$.
3. `stateEvaluator.ts` catches spacing demands and re-computes `assignCoordinates` with `spacingOverrides`.
4. Node gap expands dynamically from 56px to 238px, placing the badge directly on the horizontal line between nodes with 0 overlaps.

## Consequences
- Guaranteed zero badge-node overlaps regardless of edge badge text length.
- Smooth automatic layout adjustment without requiring manual node dragging.
