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
We define a layout configuration as a discrete state tuple $\sigma$ assembled from 6 distinct subcomponents:

$$\sigma = \left\langle \Pi_{\text{sides}}, \Omega_{\text{ports}}, \mathcal{D}_{\text{demands}}, \mathcal{L}_{\text{orders}}, \Delta_{\text{shifts}}, \mathcal{S}_{\text{visited}} \right\rangle$$

Let us build each subcomponent incrementally:

1. **Port Side Assignment Function ($\Pi_{\text{sides}}$)**:
   $$\Pi_{\text{sides}}: E \to \text{Side} \times \text{Side}, \quad \text{where } \text{Side} \in \{\text{top}, \text{right}, \text{bottom}, \text{left}\}$$
   Maps each directed edge $e = (u, v) \in E$ to a pair of port attachment sides $\langle \text{srcSide}, \text{tgtSide} \rangle$ on the boundary of source node $u$ and target node $v$.

2. **Pin Port Ordering Map ($\Omega_{\text{ports}}$)**:
   $$\Omega_{\text{ports}}: V \times \text{Side} \to \text{Permutation}(E_{\text{attached}}(v, \text{side}))$$
   Defines the spatial ordering sequence of connected edge pins along each boundary side of vertex $v$.

3. **Active Exact Spacing Demands Set ($\mathcal{D}_{\text{demands}}$)**:
   $$\mathcal{D}_{\text{demands}} \subseteq \mathcal{D}_{\text{exact}} = \{ \langle k, r, u, M, \text{reason} \rangle \}$$
   Injects dynamic spatial overrides (e.g., minimum rank gaps, node clearance gaps, or lane offsets) to resolve edge badge collisions and routing channel congestion.

4. **Layer Node Order Permutations ($\mathcal{L}_{\text{orders}}$)**:
   $$\mathcal{L}_{\text{orders}}: R \to \text{Permutation}(V_R)$$
   Defines the horizontal sequence of nodes assigned to rank layer $r \in R$.

5. **Fine Coordinate Alignments ($\Delta_{\text{shifts}}$)**:
   $$\Delta_{\text{shifts}}: V \to \mathbb{R}$$
   Contains continuous sub-pixel X/Y coordinate shifts applied during final alignment pass.

6. **Visited Hash Signatures ($\mathcal{S}_{\text{visited}}$)**:
   $$\mathcal{S}_{\text{visited}} \subset \Sigma_{\text{hash}}$$
   Set of unique state hashes $\mathcal{H}(\sigma)$ visited during the local search trajectory to guarantee cycle prevention.

---

### Step 2.2: Constructing the 21-Element Lexicographic Fitness Vector $\mathbf{C}(\sigma)$
Evaluating candidate state $\sigma$ yields a multi-criteria cost vector evaluated in strict lexicographic priority order:

$$\mathbf{C}(\sigma) = \left\langle C_1(\sigma), C_2(\sigma), \dots, C_{21}(\sigma) \right\rangle \in \mathbb{R}^{21}$$

The 21 metrics are categorized into 5 conceptual priority tiers:

```
                            Lexicographic Tier Hierarchy
       ┌─────────────────────────────────────────────────────────────────┐
       │ Priority 1: Hard Failures (C_1 to C_5)                        │
       │ (Topology errors, unroutable paths, node/edge penetrations)     │
       └────────────────────────────────┬────────────────────────────────┘
                                        │ (Must be 0)
                                        ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │ Priority 2: Badge Placement Overlaps (C_6 to C_9)               │
       │ (Unplaced badges, badge-node, badge-badge collisions)           │
       └────────────────────────────────┬────────────────────────────────┘
                                        │ (Minimize to 0)
                                        ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │ Priority 3: Aesthetics & Crossings (C_10 to C_16)               │
       │ (Edge crossings, hairpins, excess bends, direction penalties)   │
       └────────────────────────────────┬────────────────────────────────┘
                                        │ (Minimize)
                                        ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │ Priority 4: Geometric Compactness (C_17, C_18)                  │
       │ (Total Manhattan length, port side imbalance)                    │
       └────────────────────────────────┬────────────────────────────────┘
                                        │ (Minimize)
                                        ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │ Priority 5: Secondary Metrics (C_19 to C_21)                    │
       │ (Feedback leader lines, leader length, bounding area)           │
       └─────────────────────────────────────────────────────────────────┘
```

#### Detailed Metric Index Table:

| Index $k$ | Metric Key | Category | Description | Goal |
| :--- | :--- | :--- | :--- | :--- |
| $C_1$ | `hardErrorCount` | Hard Failure | Structural topology validity violations | $= 0$ |
| $C_2$ | `unresolvedRouteCount` | Hard Failure | Unroutable edge paths | $= 0$ |
| $C_3$ | `nodeNodeOverlaps` | Hard Clearance | Bounding box collisions between nodes | $= 0$ |
| $C_4$ | `edgeNodePenetrations` | Hard Clearance | Edge routes intersecting node interiors | $= 0$ |
| $C_5$ | `sharedEdgeSegmentLength` | Hard Clearance | Collinear overlapping edge segments | $= 0$ |
| $C_6$ | `unresolvedBadgeCount` | Badge Placement | Unplaced edge label badges | $= 0$ |
| $C_7$ | `badgeNodeOverlaps` | Badge Placement | Badges overlapping node bounds | $= 0$ |
| $C_8$ | `badgeBadgeOverlaps` | Badge Placement | Badges overlapping other badges | $= 0$ |
| $C_9$ | `badgeUnrelatedEdgeOverlaps`| Badge Placement | Badges overlapping unattached edge routes | $= 0$ |
| $C_{10}$ | `crossingCount` | Aesthetics | Intersecting edge-edge crossings | Minimize |
| $C_{11}$ | `ordinaryLeaderCount` | Badge Aesthetics | Leader lines assigned to ordinary edges | Minimize |
| $C_{12}$ | `avoidableHairpinCount` | Route Aesthetics | $180^\circ$ U-turn hairpins | Minimize |
| $C_{13}$ | `excessBendCount` | Route Aesthetics | Bends exceeding max allowed limit | Minimize |
| $C_{14}$ | `hairpinCount` | Route Aesthetics | Total hairpin count | Minimize |
| $C_{15}$ | `bendCount` | Route Aesthetics | Total $90^\circ$ orthogonal bends | Minimize |
| $C_{16}$ | `directionDeviationPenalty` | Route Aesthetics | Non-ideal port side exiting penalty | Minimize |
| $C_{17}$ | `totalLength` | Geometry | Sum of Manhattan edge route lengths | Minimize |
| $C_{18}$ | `portSideImbalance` | Port Balance | Variance of edge distribution per side | Minimize |
| $C_{19}$ | `feedbackLeaderCount` | Badge Aesthetics | Leader lines assigned to feedback edges | Minimize |
| $C_{20}$ | `totalLeaderLength` | Badge Aesthetics | Sum of leader segment lengths | Minimize |
| $C_{21}$ | `totalArea` | Bounding Box | Total graph layout bounding area ($W \times H$) | Minimize |

---

### Step 2.3: Strict Lexicographic Comparison Operator ($\prec$)
State candidate $\sigma_A$ is strictly superior to candidate $\sigma_B$ (written $\sigma_A \prec \sigma_B$) if and only if at the first index $k \in \{1, 2, \dots, 21\}$ where $C_k(\sigma_A) \neq C_k(\sigma_B)$, we have:

$$C_k(\sigma_A) < C_k(\sigma_B)$$

Formally:

$$\sigma_A \prec \sigma_B \iff \exists k \in \{1, \dots, 21\} \text{ s.t. } \left( C_k(\sigma_A) < C_k(\sigma_B) \land \forall j < k, C_j(\sigma_A) = C_j(\sigma_B) \right)$$

If $C_k(\sigma_A) = C_k(\sigma_B)$ for all $k \in \{1, \dots, 21\}$, tie-breaking is performed deterministically using string comparison on state hash signatures:

$$\mathcal{H}(\sigma_A) <_{\text{lex}} \mathcal{H}(\sigma_B)$$

---

## 3. Step-by-Step Computational Pseudocode

The following pseudocode details the neighborhood perturbation search loop (`searchBestLayoutState`):

```typescript
function searchBestLayoutState(
  nodes: Node[],
  edges: Edge[],
  config: LayoutConfig,
  initialState?: LayoutSearchState
): OptimizationResult {
  // Step 1: Initialize baseline state and budgets
  let currentStatesEvaluated = 1;
  const maxStatesBudget = deriveSearchStateBudgets(nodes, edges, config).maxLayoutStates;
  
  const startState = initialState ?? createInitialSearchState();
  const startHash = computeStateHash(startState);
  
  startState.visitedSignatures.add(startHash);
  const visitedHashes = new Set<string>([startHash]);

  // Step 2: Evaluate initial state
  let bestState = startState;
  let bestEval = evaluateSearchState(nodes, edges, startState, config);

  // Step 3: Initialize priority frontier queue (sorted ascending by cost vector)
  const frontier: Array<{ state: LayoutSearchState; eval: StateEvaluation }> = [
    { state: startState, eval: bestEval }
  ];

  // Step 4: Neighborhood search loop
  while (frontier.length > 0) {
    if (currentStatesEvaluated >= maxStatesBudget) break;
    if (isObjectiveTargetEvaluation(bestEval)) break; // Perfect score achieved

    // Sort frontier by lexicographic score comparison
    frontier.sort((a, b) => compareLayoutScores(a.eval.validation, b.eval.validation));
    const curr = frontier.shift()!;

    // Check if popped candidate improves global best
    if (compareLayoutScores(curr.eval.validation, bestEval.validation) < 0) {
      bestState = curr.state;
      bestEval = curr.eval;
    }

    // Step 5: Generate candidate neighbors via discrete operators N(σ)
    const neighbors = generateNeighborhoodStates(curr.state, curr.eval, config);

    for (const nextState of neighbors) {
      if (currentStatesEvaluated >= maxStatesBudget) break;

      const hash = computeStateHash(nextState);
      if (visitedHashes.has(hash)) continue; // Cycle prevention

      visitedHashes.add(hash);
      nextState.visitedSignatures.add(hash);
      currentStatesEvaluated++;

      // Evaluate candidate neighbor
      const nextEval = evaluateSearchState(nodes, edges, nextState, config);

      if (compareLayoutScores(nextEval.validation, bestEval.validation) < 0) {
        bestState = nextState;
        bestEval = nextEval;
      }

      frontier.push({ state: nextState, eval: nextEval });

      // Prune frontier if size exceeds limit
      if (frontier.length > config.maxFrontierSize) {
        frontier.sort((a, b) => compareLayoutScores(a.eval.validation, b.eval.validation));
        frontier.length = config.maxFrontierSize;
      }
    }
  }

  return { bestState, bestEvaluation: bestEval, evaluatedStates: currentStatesEvaluated };
}
```

---

## 4. Visual ASCII Diagrams

### State Transition & Neighborhood Search Workflow

```
                        ┌─────────────────────────────────────┐
                        │      Initial State Tuple σ^(0)      │
                        └──────────────────┬──────────────────┘
                                           │
                                           ▼
                        ┌─────────────────────────────────────┐
                        │   Evaluate Score Vector C(σ^(0))    │
                        └──────────────────┬──────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                             Neighborhood Search Loop                                │
│                                                                                     │
│  ┌───────────────────────┐   Apply N(σ)    ┌─────────────────────────────────────┐  │
│  │ Current Best State σ  ├────────────────>│ Candidate Neighbors N_1..N_6        │  │
│  └───────────▲───────────┘                 └──────────────────┬──────────────────┘  │
│              │                                                │                     │
│              │                                                │ Compute Hash H(σ')  │
│              │                                                ▼                     │
│              │                             ┌─────────────────────────────────────┐  │
│              │                             │ Check Cycle Set: H(σ') ∈ S_visited? │  │
│              │                             └──────────┬──────────────────┬───────┘  │
│              │                                     No │              Yes │ (Skip)   │
│              │                                        ▼                  ▼          │
│              │                             ┌────────────────────┐ ┌──────────────┐  │
│              │                             │ Evaluate C(σ')     │ │ Discard      │  │
│              │                             └──────────┬─────────┘ └──────────────┘  │
│              │                                        │                             │
│              │          Is C(σ') ≺ C(σ)?              │                             │
│              └────────────────────────────────────────┘                             │
│                                Yes                                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Codebase Reference Map & Line Anchors

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
