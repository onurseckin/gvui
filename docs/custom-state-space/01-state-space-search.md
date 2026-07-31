# 01. State-Space Search & Lexicographic Fitness Vectors

[← Back to Custom State-Space Engine Overview](./README.md) | [Next: Sugiyama Layering & Cycle Breaking →](./02-sugiyama-layering-cycle-breaking.md)

This document provides a comprehensive, pedagogical breakdown of the state-space search framework powering the **Custom State-Space Layout Engine**.

---

## 1. Problem & Trade-Off Journey

### The Core Challenge
Graph visualization engines in interactive web applications must render nodes with dynamic, highly variable physical dimensions (such as rich UI cards containing title bars, metadata badges, expandable panels, and button clusters). Traditional graph layout algorithms (e.g., standard Dagre or force-directed layouts) treat nodes as dimensionless points or uniform bounding boxes.

When applied to heterogeneous UI components, naive layout approaches fail in critical ways:

```
Naive Layout (Fixed Gaps):                  Custom State-Space Layout (Dynamic State):
┌───────────┐  ┌───────────┐               ┌───────────┐            ┌───────────┐
│ Node A    │  │ Node B    │               │ Node A    │            │ Node B    │
│ [Short]   │  │ [Expanded │               │ [Short]   │            │ [Expanded │
└─────┬─────┘  │  Detail]  │               └─────┬─────┘            │  Detail]  │
      │        └─────┬─────┘                     │                  └─────┬─────┘
      └──────┬───────┘                           │  ┌────────────┐        │
             ▼                                   └──┤ Badge Gap  ├────────┘
      ❌ OVERLAP AT BADGE                           └────────────┘
```

1. **Static Deterministic Solvers (Standard Sugiyama / Dagre)**: Compute coordinates in a single monolithic pass (Layering $\to$ Ordering $\to$ Placement $\to$ Routing). Because routing and badge placement occur after node coordinates are fixed, badges frequently overlap adjacent nodes or edge lines. The algorithm cannot backtrack or adjust node spacing retroactively when a downstream collision is detected.
2. **Pure Force-Directed Solvers (D3-Force / Spring Embedder)**: Treat edges as springs and nodes as repulsive particles. While organic, force simulations cannot enforce strict hierarchical rank structures, orthogonal grid alignment, or multi-port side distributions needed for structured workflow diagrams.
3. **Pure Constraint Optimizers (Integer Linear Programming)**: Formulate the entire layout as an ILP model. While globally optimal, solving ILP models for non-trivial graphs ($|V| > 20$, $|E| > 30$) in a single-threaded JavaScript UI environment leads to frame drops ($> 100\text{ms}$ latency).

### Why Custom State-Space Search Was Chosen
To solve these trade-offs, the Custom State-Space Engine models the entire graph layout process as a **multi-objective state-space search problem**. Rather than executing a single unalterable pipeline, the solver evaluates candidate layout state tuples $\sigma$. If downstream edge routing or badge placement encounters collisions, the engine generates neighboring state perturbations (e.g., flipping port sides, expanding node gaps, or swapping rank orders) and searches for the optimal collision-free configuration.

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 2.1: Constructing the Discrete State Tuple $\sigma$

#### 1. Mathematical Sub-Component Formula
We define a layout configuration as a discrete state tuple $\sigma$ assembled from 6 distinct subcomponents:

$$\sigma = \left\langle \Pi_{\text{sides}}, \Omega_{\text{ports}}, \mathcal{D}_{\text{demands}}, \mathcal{L}_{\text{orders}}, \Delta_{\text{shifts}}, \mathcal{S}_{\text{visited}} \right\rangle$$

where:
- $\Pi_{\text{sides}}: E \to \text{Side} \times \text{Side}$ maps directed edge $e=(u,v)$ to port sides $\langle \text{srcSide}, \text{tgtSide} \rangle \in \{\text{top}, \text{right}, \text{bottom}, \text{left}\}^2$.
- $\Omega_{\text{ports}}: V \times \text{Side} \to \text{Permutation}(E_{\text{attached}}(v, \text{side}))$ orders edge pins along boundary sides.
- $\mathcal{D}_{\text{demands}} \subseteq \mathcal{D}_{\text{exact}}$ contains active spacing overrides for badge collisions.
- $\mathcal{L}_{\text{orders}}: R \to \text{Permutation}(V_R)$ specifies horizontal node orderings per rank layer $r \in R$.
- $\Delta_{\text{shifts}}: V \to \mathbb{R}$ holds fine continuous coordinate shifts.
- $\mathcal{S}_{\text{visited}} \subset \Sigma_{\text{hash}}$ tracks visited state signatures $\mathcal{H}(\sigma)$ for cycle prevention.

#### 2. Concrete Numerical Graph Example
Consider a 3-node microservice graph: $V = \{\text{Auth}, \text{User}, \text{DB}\}$ with edges $e_1 = (\text{Auth}, \text{User})$ and $e_2 = (\text{User}, \text{DB})$.

- **Input Node Dimensions**:
  - $\text{Auth}: 120\text{px} \times 60\text{px}$
  - $\text{User}: 140\text{px} \times 80\text{px}$
  - $\text{DB}: 100\text{px} \times 50\text{px}$
- **State Assignments**:
  - $\Pi_{\text{sides}}(e_1) = \langle \text{bottom}, \text{top} \rangle$, $\Pi_{\text{sides}}(e_2) = \langle \text{bottom}, \text{top} \rangle$
  - $\Omega_{\text{ports}}(\text{User}, \text{top}) = [e_1]$, $\Omega_{\text{ports}}(\text{User}, \text{bottom}) = [e_2]$
  - $\mathcal{D}_{\text{demands}} = \emptyset$
  - $\mathcal{L}_{\text{orders}} = \{ 0: [\text{Auth}], 1: [\text{User}], 2: [\text{DB}] \}$
  - $\Delta_{\text{shifts}} = \{ \text{Auth}: 0.0, \text{User}: 0.0, \text{DB}: 0.0 \}$
- **Calculated State Hash $\mathcal{H}(\sigma)$**:
  $$\mathcal{H}(\sigma) = \text{"e1:bottom->top|e2:bottom->top|L0:Auth|L1:User|L2:DB"}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function createInitialSearchState(
  nodes: Node[],
  edges: Edge[],
  layerOrders: Map<number, string[]>
): LayoutSearchState {
  const portSides = new Map<string, PortSidePair>();
  for (const edge of edges) {
    portSides.set(edge.id, { srcSide: "bottom", tgtSide: "top" });
  }
  const state: LayoutSearchState = {
    portSides,
    portOrders: new Map(),
    exactSpacingDemands: [],
    layerOrders: new Map(layerOrders),
    nodeShifts: new Map(),
    visitedSignatures: new Set<string>()
  };
  const hash = computeStateHash(state);
  state.visitedSignatures.add(hash);
  return state;
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.1: State Tuple σ Assembly & Hash Signature
┌────────────────────────────────────────────────────────────────────────┐
│  Node Auth (Rank 0)                                                    │
│  └─► Port Side: bottom ──┐                                             │
└──────────────────────────┼─────────────────────────────────────────────┘
                           │ Edge e1: bottom -> top
┌──────────────────────────▼─────────────────────────────────────────────┐
│  Node User (Rank 1)                                                    │
│  ├─► Port Side: top (Pin Order: [e1])                                  │
│  └─► Port Side: bottom ──┐                                             │
└──────────────────────────┼─────────────────────────────────────────────┘
                           │ Edge e2: bottom -> top
┌──────────────────────────▼─────────────────────────────────────────────┐
│  Node DB (Rank 2)                                                      │
│  └─► Port Side: top (Pin Order: [e2])                                  │
└────────────────────────────────────────────────────────────────────────┘
 State Hash H(σ): "e1:bottom->top|e2:bottom->top|L0:Auth|L1:User|L2:DB"
```

---

### Step 2.2: Constructing the 21-Element Lexicographic Fitness Vector $\mathbf{C}(\sigma)$

#### 1. Mathematical Sub-Component Formula
Evaluating candidate state $\sigma$ yields a multi-criteria cost vector evaluated in strict lexicographic priority order:

$$\mathbf{C}(\sigma) = \left\langle C_1(\sigma), C_2(\sigma), \dots, C_{21}(\sigma) \right\rangle \in \mathbb{R}^{21}$$

The 21 metrics are categorized into 5 priority tiers:
1. **Tier 1 (Hard Failures, $C_1 \dots C_5$)**: Topology errors, unroutable paths, node-node/edge-node penetrations.
2. **Tier 2 (Badge Collisions, $C_6 \dots C_9$)**: Unplaced badges, badge-node, badge-badge, badge-edge overlaps.
3. **Tier 3 (Aesthetics & Crossings, $C_{10} \dots C_{16}$)**: Crossings, hairpins, excess bends, direction penalties.
4. **Tier 4 (Geometric Compactness, $C_{17}, C_{18}$)**: Manhattan edge length, port side imbalance.
5. **Tier 5 (Secondary Metrics, $C_{19} \dots C_{21}$)**: Feedback leaders, leader length, total bounding area.

#### 2. Concrete Numerical Evaluation Example
Consider a candidate layout state $\sigma$ evaluated on a graph with 2 rank layers:
- **Observed Metrics**:
  - $0$ structural errors, $0$ unrouted edges, $0$ node overlaps, $0$ penetrations, $0$ collinear overlaps $\implies C_1=0, C_2=0, C_3=0, C_4=0, C_5=0$.
  - $0$ unplaced badges, $0$ badge collisions $\implies C_6=0, C_7=0, C_8=0, C_9=0$.
  - $1$ edge crossing $\implies C_{10} = 1$.
  - $0$ ordinary leaders, $0$ hairpins, $0$ excess bends, $0$ hairpin total $\implies C_{11}=0, C_{12}=0, C_{13}=0, C_{14}=0$.
  - $5$ orthogonal $90^\circ$ bends $\implies C_{15} = 5$.
  - $0$ direction penalties $\implies C_{16} = 0$.
  - Total Manhattan edge length $= 420.0\text{px} \implies C_{17} = 420.0$.
  - Port side variance $= 0.5 \implies C_{18} = 0.5$.
  - Total bounding area $= 800\text{px} \times 600\text{px} = 480,000\text{px}^2 \implies C_{21} = 480000.0$.

$$\mathbf{C}(\sigma) = \left\langle 0, 0, 0, 0, 0, \;\; 0, 0, 0, 0, \;\; 1, 0, 0, 0, 0, 5, 0, \;\; 420.0, 0.5, \;\; 0, 0.0, 480000.0 \right\rangle$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function evaluateSearchState(
  nodes: Node[],
  edges: Edge[],
  state: LayoutSearchState,
  config: LayoutConfig
): StateEvaluation {
  const layout = computeCoordinates(nodes, state, config);
  const routes = routeAllEdges(edges, layout, state, config);
  const badges = placeEdgeBadges(routes, layout, config);
  
  const score: StateEvaluation = {
    hardErrorCount: checkTopologyErrors(nodes, edges),
    unresolvedRouteCount: routes.filter(r => !r.routed).length,
    nodeNodeOverlaps: countNodeOverlaps(layout.nodes),
    edgeNodePenetrations: countEdgeNodePenetrations(routes, layout.nodes),
    sharedEdgeSegmentLength: countCollinearEdgeOverlaps(routes),
    unresolvedBadgeCount: badges.unplacedCount,
    badgeNodeOverlaps: badges.nodeOverlapCount,
    badgeBadgeOverlaps: badges.badgeOverlapCount,
    badgeUnrelatedEdgeOverlaps: badges.edgeOverlapCount,
    crossingCount: countEdgeCrossings(routes),
    bendCount: routes.reduce((acc, r) => acc + r.bends, 0),
    totalLength: routes.reduce((acc, r) => acc + r.length, 0),
    totalArea: layout.width * layout.height
  };
  return score;
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.2: 21-Vector Score Breakdown C(σ)
 Tier 1: Hard Failures       [ C_1=0, C_2=0, C_3=0, C_4=0, C_5=0 ]       (PASS)
 Tier 2: Badge Placement     [ C_6=0, C_7=0, C_8=0, C_9=0 ]              (PASS)
 Tier 3: Aesthetics          [ C_10=1, C_11=0..14=0, C_15=5, C_16=0 ]    (1 Crossing, 5 Bends)
 Tier 4: Geometry            [ C_17=420.0px, C_18=0.5 ]                  (Manhattan Len: 420)
 Tier 5: Secondary           [ C_19=0, C_20=0.0, C_21=480000.0px² ]      (Area: 480k)
```

---

### Step 2.3: Strict Lexicographic Comparison Operator ($\prec$)

#### 1. Mathematical Sub-Component Formula
State candidate $\sigma_A$ is strictly superior to candidate $\sigma_B$ (written $\sigma_A \prec \sigma_B$) if and only if at the first index $k \in \{1, 2, \dots, 21\}$ where $C_k(\sigma_A) \neq C_k(\sigma_B)$, we have:

$$\sigma_A \prec \sigma_B \iff \exists k \in \{1, \dots, 21\} \text{ s.t. } \left( C_k(\sigma_A) < C_k(\sigma_B) \land \forall j < k, C_j(\sigma_A) = C_j(\sigma_B) \right)$$

If $C_k(\sigma_A) = C_k(\sigma_B)$ for all $k$, tie-breaking is performed using deterministic string comparison on state hash signatures:

$$\mathcal{H}(\sigma_A) <_{\text{lex}} \mathcal{H}(\sigma_B)$$

#### 2. Concrete Numerical Comparison Example
Compare two competing layout states $\sigma_A$ and $\sigma_B$:

- **State A Score**:
  $$\mathbf{C}(\sigma_A) = \langle 0,0,0,0,0, \;\; 0,0,0,0, \;\; \mathbf{1}, 0,0,0,0,5,0, \;\; 420.0, 0.5, \;\; 0, 0, 480000 \rangle$$
- **State B Score**:
  $$\mathbf{C}(\sigma_B) = \langle 0,0,0,0,0, \;\; 0,0,0,0, \;\; \mathbf{2}, 0,0,0,0,2,0, \;\; 350.0, 0.2, \;\; 0, 0, 380000 \rangle$$

**Step-by-Step Lexicographic Evaluation**:
1. Check $k=1 \dots 9$: $C_k(\sigma_A) = C_k(\sigma_B) = 0$. (Tie)
2. Check $k=10$ (`crossingCount`): $C_{10}(\sigma_A) = 1$ vs $C_{10}(\sigma_B) = 2$.
3. Since $1 < 2$, index $k=10$ yields $C_{10}(\sigma_A) < C_{10}(\sigma_B)$.
4. **Conclusion**: $\sigma_A \prec \sigma_B$ evaluates to **TRUE**. State A is selected as superior, even though State B has fewer bends ($C_{15}=2 < 5$) and shorter total length ($C_{17}=350 < 420$). Higher-priority metrics strictly dominate lower-priority metrics.

#### 3. Targeted Sub-Step Pseudocode
```typescript
function compareLayoutScores(scoreA: ValidationScore, scoreB: ValidationScore): number {
  for (const key of LEXICOGRAPHIC_ORDER_KEYS) {
    const valA = scoreA[key] ?? 0;
    const valB = scoreB[key] ?? 0;
    if (Math.abs(valA - valB) > 0.0001) {
      return valA - valB; // Negative if A < B (A is better)
    }
  }
  // Deterministic tie-break by state signature hash
  return scoreA.signature.localeCompare(scoreB.signature);
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.3: Lexicographic Priority Vector Comparison (σ_A vs σ_B)
 Index k   Metric              State A   State B    Result
 ───────   ──────              ───────   ───────    ──────
 C_1..5    Hard Failures          0         0       TIE
 C_6..9    Badge Collisions       0         0       TIE
 C_10      crossingCount          1    <    2       State A WINS (Early Exit!)
 ──────────────────────────────────────────────────────────────────────────
 (Lower tier metrics ignored: C_15: 5 vs 2, C_17: 420 vs 350 - DOMINATED)
 Result: σ_A ≺ σ_B (State A selected)
```

---

## 3. Master Synthesis: Merged State-Space Frontier Queue Search Algorithm

### 1. Unified Mathematical State Search Formulation
Combining discrete state tuple construction (Step 2.1), 21-vector fitness evaluation (Step 2.2), and lexicographic comparison (Step 2.3), the master optimization problem is formulated as finding state $\sigma^*$ in state space $\Sigma$:

$$\sigma^* = \arg\min_{\sigma \in \Sigma} \mathbf{C}(\sigma) \quad \text{subject to } \mathcal{H}(\sigma) \notin \mathcal{S}_{\text{visited}}$$

### 2. Complete Frontier Queue State-Space Search Pseudocode
```typescript
function searchBestLayoutState(
  nodes: Node[],
  edges: Edge[],
  config: LayoutConfig,
  initialState?: LayoutSearchState
): OptimizationResult {
  let currentStatesEvaluated = 1;
  const maxStatesBudget = deriveSearchStateBudgets(nodes, edges, config).maxLayoutStates;
  
  const startState = initialState ?? createInitialSearchState(nodes, edges, config);
  const startHash = computeStateHash(startState);
  startState.visitedSignatures.add(startHash);

  let bestState = startState;
  let bestEval = evaluateSearchState(nodes, edges, startState, config);

  const frontier: Array<{ state: LayoutSearchState; eval: StateEvaluation }> = [
    { state: startState, eval: bestEval }
  ];

  while (frontier.length > 0) {
    if (currentStatesEvaluated >= maxStatesBudget) break;
    if (bestEval.crossingCount === 0 && bestEval.hardErrorCount === 0) break; // Optimal

    frontier.sort((a, b) => compareLayoutScores(a.eval, b.eval));
    const curr = frontier.shift()!;

    if (compareLayoutScores(curr.eval, bestEval) < 0) {
      bestState = curr.state;
      bestEval = curr.eval;
    }

    const neighbors = generateNeighborhoodStates(curr.state, curr.eval, config);
    for (const nextState of neighbors) {
      if (currentStatesEvaluated >= maxStatesBudget) break;

      const hash = computeStateHash(nextState);
      if (curr.state.visitedSignatures.has(hash)) continue;

      nextState.visitedSignatures = new Set(curr.state.visitedSignatures);
      nextState.visitedSignatures.add(hash);
      currentStatesEvaluated++;

      const nextEval = evaluateSearchState(nodes, edges, nextState, config);

      if (compareLayoutScores(nextEval, bestEval) < 0) {
        bestState = nextState;
        bestEval = nextEval;
      }

      frontier.push({ state: nextState, eval: nextEval });
      if (frontier.length > config.maxFrontierSize) {
        frontier.sort((a, b) => compareLayoutScores(a.eval, b.eval));
        frontier.length = config.maxFrontierSize;
      }
    }
  }

  return { bestState, bestEvaluation: bestEval, evaluatedStates: currentStatesEvaluated };
}
```

### 3. Master Architecture & State Flow Diagram
```
Master Layout Optimization State Machine:
┌────────────────────────────────────────────────────────────────────────┐
│                        Initial State Tuple σ^(0)                       │
│      σ = < Π_sides, Ω_ports, D_demands, L_orders, Δ_shifts, S_vis >      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Evaluate 21-Element Fitness Vector C(σ^(0))              │
│       C = < C_1..C_5 (Hard), C_6..C_9 (Badge), C_10..C_16 (Aesth), >    │
│           < C_17..C_18 (Geom), C_19..C_21 (Second) >                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Frontier Priority Queue Loop                         │
│                                                                        │
│  ┌──────────────────────┐   Apply N(σ)   ┌──────────────────────────┐  │
│  │ Current Best State σ ├───────────────►│ Candidate Neighbors N_i  │  │
│  └──────────▲───────────┘                └────────────┬─────────────┘  │
│             │                                         │                │
│             │                                         ▼                │
│             │                            ┌──────────────────────────┐  │
│             │                            │ Hash Check: H(σ') ∈ S?   │  │
│             │                            └──────┬────────────┬──────┘  │
│             │                                No │        Yes │         │
│             │                                   ▼            ▼ (Skip)  │
│             │                            ┌────────────┐ ┌───────────┐  │
│             │                            │ Eval C(σ') │ │ Discard   │  │
│             │                            └──────┬─────┘ └───────────┘  │
│             │                                   │                      │
│             │        Is C(σ') ≺ C(σ)?           │                      │
│             └───────────────────────────────────┘                      │
│                           Yes (Update Best)                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/searchState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L80)
  - [`createInitialSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L22) — Constructs initial state tuple $\sigma$.
  - [`cloneSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L24-L53) — Performs deep copies of search states.
  - [`computeStateHash`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L55-L79) — Computes deterministic hash $\mathcal{H}(\sigma)$.
- [`src/engine/layout/custom/layoutOptimizerState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L96-L308)
  - [`searchBestLayoutState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L96-L308) — Main state-space search loop with frontier queue.
- [`src/engine/layout/custom/stateEvaluator.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L217)
  - [`evaluateSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L217) — Evaluates layout state and computes validation score.
- [`src/engine/layout/custom/layoutObjective.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L268)
  - [`ORDER`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L36) — The 21-element lexicographic priority key array.
  - [`compareLayoutScore`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L38-L44) — Strict lexicographic vector comparison operator $\prec$.
