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
For an edge label badge with measured dimensions $(W_{\text{badge}}, H_{\text{badge}})$, clearance padding $C_{\text{badge}}$, and port stub length $L_{\text{stub}}$, the required gap distances are:

1. **Same-Rank Horizontal Node Gap ($G_{\text{req}, X}$)**:
   $$G_{\text{req}, X} = W_{\text{badge}} + 2 \cdot C_{\text{badge}} + 2 \cdot L_{\text{stub}}$$

2. **Cross-Rank Vertical Rank Gap ($G_{\text{req}, Y}$)**:
   $$G_{\text{req}, Y} = H_{\text{badge}} + 2 \cdot C_{\text{badge}} + 2 \cdot L_{\text{stub}}$$

---

### Step 2.2: Exact Spacing Demand Tuple $\mathcal{D}_i$
A spacing demand $\mathcal{D}_i$ is represented as a structured 5-tuple:

$$\mathcal{D}_i = \left\langle \text{kind}, r, u, G_{\text{req}}, \text{reason} \right\rangle$$

where:
- $\text{kind} \in \{ \text{node-gap}, \text{rank-gap}, \text{lane-x}, \text{lane-y} \}$.
- $r \in \mathbb{N}$ is the target rank layer index (or `undefined` for global scope).
- $u \in V$ is the node ID after which the gap must be injected.
- $G_{\text{req}} \in \mathbb{R}^+$ is the required physical gap distance.
- $\text{reason} \in \{ \text{same-rank-label}, \text{blocked-direct-badge}, \text{parallel-labels} \}$.

---

### Step 2.3: Linear X-Coordinate Inequality & Isotonic Projection (PAVA)
In layer $L_r = (v_1, v_2, \dots, v_k)$, the center X-coordinates $(X_1, X_2, \dots, X_k)$ must satisfy the linear separation inequality for all adjacent pairs $i \in \{1, \dots, k-1\}$:

$$X_{i+1} - X_i \ge \frac{W_i + W_{i+1}}{2} + \max(G_{\text{default}}, G_{\text{demand}}(v_i))$$

Let $s_i$ denote the cumulative minimum separation offset:

$$s_1 = 0, \quad s_{i+1} = s_i + \frac{W_i + W_{i+1}}{2} + \max(G_{\text{default}}, G_{\text{demand}}(v_i))$$

We define unconstrained shifts $a_i = \widetilde{X}_i - s_i$, where $\widetilde{X}_i$ is the desired barycentric X-coordinate. The constrained coordinate assignment reduces to **Isotonic Regression**:

$$\min_{z_1 \le z_2 \le \dots \le z_k} \sum_{i=1}^k w_i (z_i - a_i)^2$$

This quadratic optimization is solved in $O(k)$ linear time using the **Pool Adjacent Violators Algorithm (PAVA)**.

---

### Step 2.4: Fixed-Point Convergence Proof
Let $T: \Sigma \to \Sigma$ denote the state transition operator mapping state $\sigma^{(t)}$ to $\sigma^{(t+1)}$ after demand injection. 

Because:
1. Demand gaps are bounded above by total graph bounding dimensions ($G_{\text{req}} \le W_{\text{max}}$),
2. Demands strictly increase local gap constraints ($\mathcal{D}^{(t+1)} \ge \mathcal{D}^{(t)}$),
3. Hash set $\mathcal{S}_{\text{visited}}$ prevents cycles,

the state transition sequence $\sigma^{(0)} \to \sigma^{(1)} \to \dots \to \sigma^{(k)}$ is guaranteed to reach a fixed point $T(\sigma^*) = \sigma^*$ in a finite number of iterations ($k \le |E|$).

---

## 3. Step-by-Step Computational Pseudocode

The following pseudocode details badge placement, spacing demand emission, and PAVA coordinate projection:

```typescript
// Part A: Badge Placement & Demand Emission
function placeEdgeBadges(
  routes: RoutedPath[],
  nodeLayout: NodeLayoutResult,
  config: LayoutConfig
): BadgePlacementResult {
  const spacingRequests: BadgeSpacingRequest[] = [];
  const placementsMap = new Map<string, BadgePlacement>();

  for (const route of routes) {
    const edge = getEdge(route.edgeId);
    if (!hasBadge(edge.label)) continue;

    const candidates = generateBadgeCandidates(route, edge.label, config);
    const hasOnPathCandidate = candidates.some(c => c.score < 500);

    // If no clean on-path candidate exists, emit spacing demand request
    if (candidates.length === 0 || !hasOnPathCandidate) {
      const badgeDim = measureBadgeRect(edge.label, config);
      const isSameRank = getRank(edge.source) === getRank(edge.target);

      if (isSameRank) {
        spacingRequests.push({
          edgeId: edge.id,
          kind: "node-gap",
          rank: getRank(edge.source),
          afterNodeId: edge.source,
          minimum: badgeDim.width + 2 * config.badgeClearance + 2 * config.portStubLength,
          reason: "same-rank-label",
        });
      } else {
        spacingRequests.push({
          edgeId: edge.id,
          kind: "rank-gap",
          rank: Math.min(getRank(edge.source), getRank(edge.target)),
          minimum: badgeDim.height + 2 * config.badgeClearance + 2 * config.portStubLength,
          reason: "blocked-direct-badge",
        });
      }
    }
  }

  return { placementsMap, spacingRequests };
}

// Part B: Pool Adjacent Violators Algorithm (PAVA) Coordinate Projection
function projectLayerCenters(
  layer: LayerNode[],
  desiredXMap: Map<string, number>,
  weightsMap: Map<string, number>,
  rank: number,
  config: LayoutConfig,
  spacingOverrides?: SpacingOverrides
): Map<string, number> {
  const k = layer.length;
  const s = new Array<number>(k).fill(0);

  // 1. Compute cumulative separation offsets
  for (let i = 0; i < k - 1; i++) {
    const curr = layer[i];
    const next = layer[i + 1];
    const gap = Math.max(
      getEffectiveNodeGap(rank, curr, spacingOverrides, config),
      getEffectiveNodeGap(rank, next, spacingOverrides, config)
    );
    s[i + 1] = s[i] + (curr.width + next.width) / 2 + gap;
  }

  // 2. Prepare unconstrained offsets a_i = desiredX_i - s_i
  const a = layer.map((item, i) => desiredXMap.get(item.id)! - s[i]);
  const w = layer.map(item => weightsMap.get(item.id) ?? 1);

  // 3. PAVA Stack Compaction
  interface Block { weight: number; sumWA: number; value: number; size: number }
  const stack: Block[] = [];

  for (let i = 0; i < k; i++) {
    let b: Block = { weight: w[i], sumWA: w[i] * a[i], value: a[i], size: 1 };

    while (stack.length > 0 && stack[stack.length - 1].value > b.value) {
      const top = stack.pop()!;
      b = {
        weight: top.weight + b.weight,
        sumWA: top.sumWA + b.sumWA,
        value: (top.sumWA + b.sumWA) / (top.weight + b.weight),
        size: top.size + b.size,
      };
    }
    stack.push(b);
  }

  // 4. Unpack final positions X_i = z_i + s_i
  const result = new Map<string, number>();
  let idx = 0;
  for (const block of stack) {
    for (let j = 0; j < block.size; j++) {
      result.set(layer[idx].id, block.value + s[idx]);
      idx++;
    }
  }

  return result;
}
```

---

## 4. Visual ASCII Diagrams

### Dynamic Spacing Demand Feedback Loop & PAVA Compaction

```
                     ┌───────────────────────────────────────┐
                     │     1. Evaluate Badge Placement       │
                     └───────────────────┬───────────────────┘
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │ Unresolved Badge Collision Detected?  │
                     └─────────┬───────────────────┬─────────┘
                            No │               Yes │
                               ▼                   ▼
                     ┌──────────────────┐  ┌─────────────────────────────────┐
                     │ Commit Placement │  │ Emit Spacing Demand D_i         │
                     └──────────────────┘  │ G_req = W_badge + 2C + 2L_stub  │
                                           └───────────────┬─────────────────┘
                                                           │
                                                           ▼
                                           ┌─────────────────────────────────┐
                                           │ Inject D_i into State Tuple σ   │
                                           └───────────────┬─────────────────┘
                                                           │
                                                           ▼
                                           ┌─────────────────────────────────┐
                                           │ Recalculate Node Coordinates    │
                                           │ via PAVA Isotonic Regression    │
                                           └─────────────────────────────────┘
```

---

## 5. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/badgePlacement.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L382-L676)
  - [`placeEdgeBadges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L382-L676) — Places badges and emits spacing demand requests.
- [`src/engine/layout/custom/spacingDemand.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L20-L268)
  - [`requiredSameRankBadgeGap`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L20-L22) — Computes minimum horizontal clearance gap $G_{\text{req}, X}$.
  - [`canonicalizeExactSpacingDemands`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L38-L66) — Canonicalizes and deduplicates demand tuples.
  - [`resolveExactSpacingDemands`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L227-L268) — Converts demand tuples into rank and node gap overrides.
- [`src/engine/layout/custom/coordinateAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L110-L408)
  - [`projectLayerCenters`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L110-L195) — Implements PAVA isotonic projection algorithm.
  - [`assignCoordinates`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L199-L408) — Computes X/Y node coordinates and overall bounding box.
