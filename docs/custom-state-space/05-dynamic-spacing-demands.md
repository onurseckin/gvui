# 05. Dynamic Spacing Demands & Feedback Loops

[← Previous: A* Orthogonal Edge Routing](./04-astar-orthogonal-routing.md) | [← Back to Custom State-Space Engine Overview](./README.md) | [Next: Codebase Reference Map & Line Anchors →](./06-codebase-reference-map.md)

This document presents a detailed pedagogical guide to the dynamic spacing demand feedback system and isotonic coordinate projection in the **Custom State-Space Layout Engine**.

---

## 1. Problem & Trade-Off Journey

### The Core Challenge
In complex workflow diagrams, edges often contain text badges (e.g. status labels like `Success`, `HTTP 200`, `Retry #3`). When nodes on the same rank layer are placed adjacent to each other, or when cross-rank edges carry wide label badges, standard fixed node gaps ($G_{\text{default}} \approx 40\text{px}$) cause badges to overlap adjacent nodes or other badges:

```
Default Node Gap (Badge Collision):            Dynamic Spacing Feedback (Expanded Gap):
Rank 0:  ┌──────┐ ┌──────┐                    Rank 0:  ┌──────┐    ┌────────────┐    ┌──────┐
         │Node A│ │Node B│                             │Node A│    │ Dynamic    │    │Node B│
         └──┬───┘ └──┬───┘                             └──┬───┘    │ Badge Gap  │    └──┬───┘
            │ ┌────┐ │                                    │        └────────────┘       │
            └─┤❌  ├─┘ (Badge Overlap)                    └──────────────┼──────────────┘
              └────┘                                                     ▼
```

### Why Static Gaps & Manual Node Dragging Fail
1. **Static Global Gaps**: Increasing global node gaps ($G_{\text{node}} = 150\text{px}$) across the entire graph resolves badge overlaps, but creates excessively sparse layouts for nodes without badges, blowing up total graph bounding area.
2. **Post-Layout Manual Dragging**: Moving nodes manually after layout evaluation breaks edge channel alignments and introduces new edge-node penetrations.
3. **Dynamic Demand Feedback Loop**: The engine evaluates candidate badge placements *during state search*. If a badge placement fails due to insufficient room, the engine emits a precise **Exact Spacing Demand** $\mathcal{D}_i$ specifying the exact minimum physical gap $G_{\text{req}}$ needed. This demand is injected into state tuple $\sigma$, forcing the coordinate solver to recalculate node coordinates via isotonic regression without introducing overlaps.

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 2.1: Required Clearance Gap Equations $G_{\text{req}}$

#### 1. Mathematical Sub-Component Formula
For an edge label badge with measured dimensions $(W_{\text{badge}}, H_{\text{badge}})$, clearance padding $C_{\text{badge}}$, and port stub length $L_{\text{stub}}$, the required gap distances are:

1. **Same-Rank Horizontal Node Gap ($G_{\text{req}, X}$)**:
   $$G_{\text{req}, X} = W_{\text{badge}} + 2 \cdot C_{\text{badge}} + 2 \cdot L_{\text{stub}}$$

2. **Cross-Rank Vertical Rank Gap ($G_{\text{req}, Y}$)**:
   $$G_{\text{req}, Y} = H_{\text{badge}} + 2 \cdot C_{\text{badge}} + 2 \cdot L_{\text{stub}}$$

#### 2. Concrete Numerical Calculation Example
Consider an edge badge displaying label `"HTTP 200 OK"`:
- **Measured Badge Dimensions**: $W_{\text{badge}} = 178\text{px}, \; H_{\text{badge}} = 24\text{px}$
- **Padding Clearance**: $C_{\text{badge}} = 12\text{px}$
- **Port Stub Length**: $L_{\text{stub}} = 18\text{px}$

**Step-by-Step Gap Arithmetic**:
- **Same-Rank Horizontal Gap**:
  $$G_{\text{req}, X} = 178 + 2(12) + 2(18) = 178 + 24 + 36 = \mathbf{238\text{px}}$$
- **Cross-Rank Vertical Gap**:
  $$G_{\text{req}, Y} = 24 + 2(12) + 2(18) = 24 + 24 + 36 = \mathbf{84\text{px}}$$

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM requiredSameRankBadgeGap(badgeDim, config)
  INPUT: badge dimensions object, layout config
  OUTPUT: minimum required horizontal gap distance

  padding <- config.badgeClearance OR 12
  stub <- config.portStubLength OR 18

  RETURN badgeDim.width + (2 * padding) + (2 * stub)
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.1: Required Clearance Gap Breakdown
    │<── L_stub ──>│<────── W_badge (178px) ──────>│<── L_stub ──>│
    │   (18px)     │<── C ──>│          │<── C ──>│   (18px)     │
    ┌──────────────┼─────────┼──────────┼─────────┼──────────────┐
    │ Stub Segment │ Padding │ Badge Card │ Padding │ Stub Segment │
    └──────────────┴─────────┴──────────┴─────────┴──────────────┘
    │<────────────────────── G_req,X = 238px ───────────────────>│
```

---

### Step 2.2: Exact Spacing Demand Tuple $\mathcal{D}_i$ & Linear Projection

#### 1. Mathematical Sub-Component Formula
A spacing demand $\mathcal{D}_i$ is represented as a structured 5-tuple:

$$\mathcal{D}_i = \left\langle \text{kind}, r, u, G_{\text{req}}, \text{reason} \right\rangle$$

In rank layer $L_r$, center X-coordinates must satisfy the linear separation inequality for all adjacent pairs $i$:

$$X_{i+1} - X_i \ge \frac{W_i + W_{i+1}}{2} + \max\left( G_{\text{default}}, \; G_{\text{demand}}(u_i) \right)$$

#### 2. Concrete Numerical Comparison Example
Consider Node A ($W_A = 120\text{px}$) at $X(A) = 100\text{px}$ and adjacent Node B ($W_B = 100\text{px}$):
- Half-width sum: $\frac{120 + 100}{2} = 110\text{px}$.
- **Default Node Gap** ($G_{\text{default}} = 56\text{px}$):
  $$X(B)_{\text{default}} = 100 + 110 + 56 = \mathbf{266\text{px}}$$
- **After Injecting Demand** $\mathcal{D}_1 = \langle \text{"node-gap"}, 0, \text{Node A}, 238\text{px}, \text{"same-rank-label"} \rangle$:
  $$G_{\text{effective}} = \max(56, 238) = 238\text{px}$$
  $$X(B)_{\text{demand}} = 100 + 110 + 238 = \mathbf{448\text{px}}$$
- **Position Offset**: Node B is shifted right by $\Delta X = 448 - 266 = \mathbf{182\text{px}}$ to make room for the badge.

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM resolveEffectiveGap(rank, nodeId, config, demands)
  INPUT: layer rank, node ID, configuration, list of spacing demands
  OUTPUT: effective horizontal gap distance

  defaultGap <- config.nodeSpacing OR 56
  match <- FIND demand IN demands WHERE kind = "node-gap" AND rank = rank AND afterNodeId = nodeId

  IF match IS NOT FOUND THEN
    RETURN defaultGap
  ELSE
    RETURN MAX(defaultGap, match.minimum)
  END IF
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.2: Node Coordinate Projection Before & After Demand
 Default Gap (56px):
 ┌──────────┐    56px    ┌──────────┐
 │  Node A  ├───────────►│  Node B  │  X(A)=100px, X(B)=266px
 └──────────┘            └──────────┘

 Injected Spacing Demand D_1 (G_req = 238px):
 ┌──────────┐              ┌───────────────┐              ┌──────────┐
 │  Node A  ├─────────────►│ Badge "HTTP"  ├─────────────►│  Node B  │  X(A)=100px, X(B)=448px
 └──────────┘              └───────────────┘              └──────────┘
                           │<── 238px ────>│  (Shift ΔX = +182px)
```

---

### Step 2.3: Pool Adjacent Violators Algorithm (PAVA) Isotonic Regression

#### 1. Mathematical Sub-Component Formula
We define unconstrained shifts $a_i = \widetilde{X}_i - s_i$, where $\widetilde{X}_i$ is the desired barycentric X-coordinate and $s_i$ is the cumulative minimum separation offset:

$$s_1 = 0, \quad s_{i+1} = s_i + \frac{W_i + W_{i+1}}{2} + G_{\text{effective}}(v_i)$$

The constrained coordinate solver formulates the problem as **Isotonic Regression**:

$$\min_{z_1 \le z_2 \le \dots \le z_k} \sum_{i=1}^k w_i (z_i - a_i)^2$$

which is solved in $O(k)$ linear time using PAVA stack compaction.

#### 2. Concrete Numerical PAVA Example
Consider 3 nodes in layer $L_0$ with desired X-coordinates $\widetilde{X} = [100, 200, 180]$ (note that $200 > 180$ violates ordering):
- Minimum separation offsets: $s = [0, 150, 300]$.
- **Unconstrained Offsets $a_i = \widetilde{X}_i - s_i$**:
  - $a_1 = 100 - 0 = 100$
  - $a_2 = 200 - 150 = 50$
  - $a_3 = 180 - 300 = -120$
  - Array $a = [100, 50, -120]$ (violates monotonicity $a_1 \le a_2 \le a_3$).

- **PAVA Stack Compaction Execution**:
  1. Push $a_1 = 100 \implies \text{Stack}: [ \{ \text{val}: 100, \text{size}: 1 \} ]$.
  2. Process $a_2 = 50$: Since $50 < 100$, pool with top block:
     $$\text{Merged Val} = \frac{100 + 50}{2} = 75 \implies \text{Stack}: [ \{ \text{val}: 75, \text{size}: 2 \} ]$$
  3. Process $a_3 = -120$: Since $-120 < 75$, pool all 3 items:
     $$\text{Merged Val} = \frac{100 + 50 - 120}{3} = \frac{30}{3} = 10 \implies \text{Stack}: [ \{ \text{val}: 10, \text{size}: 3 \} ]$$

- **Unpacked Monotonic Values $z$**: $z = [10, 10, 10]$.
- **Final Monotonic Coordinates $X_i = z_i + s_i$**:
  - $X_1 = 10 + 0 = \mathbf{10\text{px}}$
  - $X_2 = 10 + 150 = \mathbf{160\text{px}}$
  - $X_3 = 10 + 300 = \mathbf{310\text{px}}$
- **Separation Verification**:
  - $X_2 - X_1 = 160 - 10 = 150 \ge 150$ (PASS)
  - $X_3 - X_2 = 310 - 160 = 150 \ge 150$ (PASS)

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM projectLayerCentersPAVA(layer, desiredXMap, s)
  INPUT: list of layer nodes, map of desired X positions, array of cumulative separation offsets s
  OUTPUT: map of node IDs to monotonic X coordinates

  k <- LENGTH(layer)
  a <- ARRAY OF (desiredXMap[layer[i].id] - s[i]) FOR i FROM 0 TO k - 1
  w <- ARRAY OF 1 FOR i FROM 0 TO k - 1

  stack <- EMPTY STACK

  FOR i FROM 0 TO k - 1 DO
    b <- { weight: w[i], sumWA: w[i] * a[i], value: a[i], size: 1 }
    WHILE stack IS NOT EMPTY AND PEEK_TOP(stack).value > b.value DO
      top <- POP stack
      b <- {
        weight: top.weight + b.weight,
        sumWA: top.sumWA + b.sumWA,
        value: (top.sumWA + b.sumWA) / (top.weight + b.weight),
        size: top.size + b.size
      }
    END WHILE
    PUSH b ONTO stack
  END FOR

  result <- EMPTY MAP
  idx <- 0
  FOR EACH block IN stack DO
    FOR j FROM 0 TO block.size - 1 DO
      result[layer[idx].id] <- block.value + s[idx]
      idx <- idx + 1
    END FOR
  END FOR

  RETURN result
END ALGORITHM
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.3: PAVA Compaction & Isotonic Coordinate Assignment
 Unconstrained Offsets a_i:   a1 = 100 ──────► a2 = 50 ──────► a3 = -120 (Violations!)
                                  │                │                │
 PAVA Stack Pooling Pass:         └──────────┬─────┴────────────────┘
                                             ▼
                              Pooled Block Value: (100+50-120)/3 = 10
                                             │
 Final Monotonic X_i = z_i + s_i:            ▼
   Node 1: X1 = 10 + 0   = 10px
   Node 2: X2 = 10 + 150 = 160px  (Gap = 150px >= 150px PASS)
   Node 3: X3 = 10 + 300 = 310px  (Gap = 150px >= 150px PASS)
```

---

## 3. Master Synthesis: Merged Dynamic Spacing & Coordinate Projection Pipeline

### 1. Unified Mathematical Feedback Loop Formulation
Combining gap equations (2.1), spacing demand emission (2.2), and PAVA isotonic projection (2.3), the feedback iteration mapping state $\sigma^{(t)} \to \sigma^{(t+1)}$ is:

$$\sigma^{(t+1)} = \sigma^{(t)} \cup \mathcal{D}_{\text{new}} \quad \text{where } \mathbf{X}^{(t+1)} = \text{PAVA}\left(\widetilde{\mathbf{X}}, \mathcal{D}^{(t+1)}\right)$$

### 2. Complete Pipeline Pseudocode
```text
ALGORITHM placeBadgesAndProjectCoordinates(routes, layers, config)
  INPUT: routed edge paths, layer node lists, layout configuration
  OUTPUT: final node X-coordinates and emitted spacing demands

  badgeResult <- placeEdgeBadges(routes, layers, config)
  emittedDemands <- badgeResult.spacingRequests

  finalCoordinates <- EMPTY MAP
  FOR r FROM 0 TO LENGTH(layers) - 1 DO
    layer <- layers[r]
    s <- computeCumulativeSeparations(layer, r, config, emittedDemands)
    desiredXMap <- computeBarycentricDesiredX(layer, r)
    projMap <- projectLayerCentersPAVA(layer, desiredXMap, s)

    FOR EACH (id, x) IN projMap DO
      finalCoordinates[id] <- x
    END FOR
  END FOR

  RETURN { finalCoordinates: finalCoordinates, emittedDemands: emittedDemands }
END ALGORITHM
```

### 3. Master Feedback Loop Flow Diagram
```
Dynamic Spacing Feedback Loop & PAVA Architecture:
┌────────────────────────────────────────────────────────────────────────┐
│                      1. Evaluate Edge Badge Placement                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Unresolved Badge Collision? -> Step 2.1: Compute G_req = W + 2C + 2L  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2.2: Emit Demand D_i = <kind, r, u, G_req> & Inject into σ       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2.3: Recalculate Node X_i via PAVA Isotonic Stack Compaction     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Collision-Free Monotonic Coordinates X_i*                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/badgePlacement.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L382-L676)
  - [`placeEdgeBadges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L382-L676) — Places badges and emits spacing demand requests.
- [`src/engine/layout/custom/spacingDemand.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L20-L268)
  - [`requiredSameRankBadgeGap`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L20-L22) — Computes minimum horizontal clearance gap $G_{\text{req}, X}$.
  - [`canonicalizeExactSpacingDemands`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L38-L66) — Canonicalizes and deduplicates demand tuples.
  - [`resolveExactSpacingDemands`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L227-L268) — Converts demand tuples into rank and node gap overrides.
- [`src/engine/layout/custom/coordinateAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L110-L408)
  - [`projectLayerCenters`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L110-L195) — Implements PAVA isotonic projection algorithm.
  - [`assignCoordinates`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L199-L408) — Computes X/Y node coordinates and overall bounding box.
