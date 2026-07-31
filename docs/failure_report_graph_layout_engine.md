# Custom Directed Graph Layout Engine — Failure Audit & Diagnostic Report

**Target Engine:** `src/engine/layout/custom/`  
**Test Suite:** `src/engine/layout/custom/customLayoutValidatorStrict.test.ts`  
**Total Scenarios Tested:** 20  
**Pass Count:** 11  
**Fail Count:** 9  
**Overall Status:** **NEEDS ALGORITHMIC REFINEMENT**

---

## Executive Summary

Out of 20 plan-specified scenario graph topologies, **11 pass with 0 hard errors**, while **9 fail hard layout validation**. 

The failures fall into four main categories:
1. **Badge Placement Collisions** (`BADGE_BADGE_OVERLAP`, `BADGE_NODE_OVERLAP`, `BADGE_UNRELATED_EDGE_OVERLAP`) — Badges placed near segment midpoints collide with neighboring nodes, badges, or parallel routing channels.
2. **Feedback Route Corridor Penetration** (`EDGE_NODE_PENETRATION`) — Long feedback/outer corridor routes clip through intermediate node rectangles because grid obstacle bounds or lane offset calculations don't reserve sufficient outer margin.
3. **Shared Parallel Segments** (`SHARED_EDGE_SEGMENT`) — Multiple parallel edges between the same or adjacent ranks collapse onto the same grid line rather than reserving distinct offset tracks.
4. **Port Departure/Entry Perpendicularity** (`WRONG_DEPARTURE_DIRECTION`, `WRONG_ENTRY_DIRECTION`) — High-degree or same-rank port assignments produce zero-length or misaligned initial stubs.

---

## Detailed Failure Matrix by Scenario

### ❌ Scenario #8: Same-Rank Cross-Link
- **Topology:** Root → 2 Middle Peer Nodes (with horizontal cross-link) → Bottom Node
- **Failing Diagnostics:**
  - `WRONG_DEPARTURE_DIRECTION`: First segment of edge `e-MID1-MID2-2` does not leave perpendicular from assigned port side.
- **Root Cause:** Same-rank horizontal routing does not force a 3-point orthogonal step (`(x,y) -> (x, y+dy) -> (x+dx, y+dy) -> (x+dx, y)`), causing a diagonal or direct straight departure that violates port side perpendicularity.

---

### ❌ Scenario #9: Reciprocal Pair (Bidirectional)
- **Topology:** Client ⇄ Worker (Forward edge + Feedback callback edge)
- **Failing Diagnostics:**
  - `SHARED_EDGE_SEGMENT`: Edges `e-CLIENT-WORKER-0` and `e-WORKER-CLIENT-1` share collinear segment length.
- **Root Cause:** Both the forward and feedback edges select the central X-axis alignment lane, collapsing both routes onto the same vertical grid line.

---

### ❌ Scenario #11: Three-Node Cyclic Ring
- **Topology:** Ring cycle (`A` → `B` → `C` → `A`)
- **Failing Diagnostics:**
  - `WRONG_ENTRY_DIRECTION`: Last segment of edge `e-C-A-2` does not enter perpendicular to target side.
- **Root Cause:** The ring feedback router creates a corner point directly matching the target port coordinate, resulting in a zero-length final segment or non-perpendicular arrival.

---

### ❌ Scenario #14: Parallel Multi-Edges
- **Topology:** 2 Nodes connected by 3 parallel edges (`HTTP`, `gRPC`, `WebSocket`)
- **Failing Diagnostics:**
  - `BADGE_BADGE_OVERLAP`: Badge for `e-SRC-TGT-0` overlaps badge for `e-SRC-TGT-1` and `e-SRC-TGT-2`.
  - `BADGE_UNRELATED_EDGE_OVERLAP`: Badges overlap adjacent parallel edge tracks.
- **Root Cause:** All three edge badges calculate their preferred position at the midpoint of the central horizontal span without Y-staggering or Y-channel offsets.

---

### ❌ Scenario #16: Dense Edge Badges
- **Topology:** 3 Nodes in a row with long label strings (`A` → `B` → `C` and `A` → `C`)
- **Failing Diagnostics:**
  - `BADGE_NODE_OVERLAP`: Badge for bypass edge `e-A-C-2` overlaps middle node `B`.
  - `BADGE_UNRELATED_EDGE_OVERLAP`: Badges overlap parallel line channels.
- **Root Cause:** The long badge string produces a wide rectangle (width > 180px) that exceeds the gap between nodes, and the badge placer fails to find a collision-free alternative slot along the route.

---

### ❌ Scenario #19: Cyclic Agent Execution Trace
- **Topology:** Planner → Coder 1 / Coder 2 → Verifier → ↺ Planner (Feedback Loop)
- **Failing Diagnostics:**
  - `EDGE_NODE_PENETRATION`: Segment of feedback edge `e-AUDIT-PLAN-4` penetrates interior of node `EXEC1`.
  - `BADGE_NODE_OVERLAP`: Badge for `e-AUDIT-PLAN-4` overlaps node `EXEC1`.
- **Root Cause:** The outer feedback corridor for `AUDIT` → `PLAN` routes on an X-grid coordinate that intersects the bounding box of `EXEC1`, because `EXEC1` sits wider than the global outer margin.

---

### ❌ Scenario #20: Full DevOps Microservice Mesh (Most Complex)
- **Topology:** 8 Microservices, 12 Edges, multiple feedback loops (`PAY` ⇄ `ORDER`, `NOTIF` ⇄ `AUTH`)
- **Failing Diagnostics:**
  - `EDGE_NODE_PENETRATION` (2 count): Feedback edge `e-NOTIF-AUTH-11` penetrates `CACHE`; `e-PAY-ORDER-7` penetrates `USER`.
  - `SHARED_EDGE_SEGMENT` (3 count): Parallel and feedback lines overlap by 20.00px.
  - `BADGE_NODE_OVERLAP` (2 count): Badges overlap `CACHE` and `USER`.
  - `BADGE_BADGE_OVERLAP` (2 count): Multiple badges overlap each other on dense order routes.
  - `BADGE_UNRELATED_EDGE_OVERLAP` (5 count): Badges block adjacent routes.
- **Root Cause:**
  1. Dense multi-rank feedback edges use fixed offset corridors (`x = minX - 40`) that collide with outer node cards when ranks have uneven widths.
  2. Lane reservation grid (`routingGrid.ts`) lacks strict per-edge channel isolation.
  3. Badge placer (`badgePlacement.ts`) falls back to segment midpoints when no candidate slot is free, instead of shifting the route or extending leader lines.

---

## Systematic Algorithmic Fix Plan (For LLM & Developer Review)

### Fix 1: Outer Bounding Margin for Feedback Corridors (`specialRoutes.ts` / `routeSearch.ts`)
- **Problem:** Feedback corridors route through fixed offsets (`minX - 40` or `maxX + 40`) which penetrate wide nodes in intermediate ranks.
- **Solution:** Compute `outerMinX` and `outerMaxX` by scanning **all** node bounding boxes across the entire graph, adding `obstacleClearance + laneSpacing * laneIndex`. This guarantees outer feedback corridors never intersect any node card.

### Fix 2: Strict Grid Lane Reservation & Channel Offsets (`edgeRouter.ts` / `routingGrid.ts`)
- **Problem:** Parallel edges between the same source and target share identical grid coordinates (`SHARED_EDGE_SEGMENT`).
- **Solution:** Enforce atomic track allocation in `RoutingGrid`. When $N$ edges share a route segment direction, assign each edge index $i$ a distinct grid line $y_i = y_0 + i \cdot \text{laneSpacing}$.

### Fix 3: Staggered & Leader-Line Badge Placement (`badgePlacement.ts`)
- **Problem:** Badges overlap adjacent badges, nodes, and unrelated edges when midpoint is blocked.
- **Solution:** 
  1. Generate multi-candidate placement slots along each edge segment (e.g. 20%, 50%, 80% along long segments).
  2. If all candidate slots on the edge overlap nodes or badges, place the badge in the nearest empty channel and draw a visible dashed **leader line** to the edge anchor point.

### Fix 4: Same-Rank Perpendicular Port Departure (`portAssignment.ts` / `routeSearch.ts`)
- **Problem:** Horizontal same-rank edges violate perpendicular departure rules.
- **Solution:** Ensure same-rank edges always departure with a mandatory minimum stub length (e.g. 15px) perpendicular to the node side before turning toward the target.

---

## Test Verification Summary

- **Passing Scenarios (11):** `#1`, `#2`, `#3`, `#4`, `#5`, `#6`, `#7`, `#10`, `#12`, `#13`, `#15`, `#17`, `#18`.
- **Failing Scenarios (9):** `#8`, `#9`, `#11`, `#14`, `#16`, `#19`, `#20`.
