# 06. Codebase Reference Map & Asymptotic Bounds

[← Previous: Dynamic Spacing Demands](./05-dynamic-spacing-demands.md) | [← Back to Custom State-Space Engine Overview](./README.md)

This document provides complete asymptotic complexity derivations, source file line-anchor mappings, and executable test suite verification commands for the **Custom State-Space Layout Engine**.

---

## 1. Asymptotic Complexity Bounds Derivation

Let $|V|$ denote the total number of nodes, $|E|$ denote the total number of edges, $K$ denote the number of rank layers ($K \le |V|$), $|V_{\text{grid}}|$ denote the number of orthogonal grid vertices ($|V_{\text{grid}}| = O((|V| + |E|)^2)$), and $S_{\text{max}}$ denote the maximum layout state search budget.

### Stage 1: Cycle Breaking & Layer Assignment
- **Tarjan's SCC Decomposition**: Traverses nodes and edges via DFS $\to O(|V| + |E|)$ time.
- **Eades Greedy Cycle Breaking**: Iteratively scans active in/out-degrees per component $\to O(|V| + |E|)$ time.
- **Longest Path Layering**: Kahn's topological sort $\to O(|V| + |E|)$ time.
- **Total Stage 1 Time Complexity**: $\mathcal{O}(|V| + |E|)$
- **Stage 1 Space Complexity**: $\mathcal{O}(|V| + |E|)$ (adjacency list & degree maps).

### Stage 2: Barycentric Crossing Minimization
- **Barycenter Evaluation**: Computes neighbor position averages across $K$ layers $\to O(|E|)$ time.
- **Layer Sorting**: Quicksort per layer $\to O(|V| \log |V|)$ time.
- **Adjacent Transposition**: $N_{\text{sweeps}}$ sweeps over adjacent pairs $\to O(N_{\text{sweeps}} \cdot (|V| \cdot |E|))$ time.
- **Total Stage 2 Time Complexity**: $\mathcal{O}(N_{\text{sweeps}} \cdot (|V| \log |V| + |E|))$
- **Stage 2 Space Complexity**: $\mathcal{O}(|V| + |E|)$ (layer array clones).

### Stage 3: Isotonic Coordinate Assignment (PAVA)
- **Desired Position Averaging**: $N_{\text{coord\_sweeps}}$ iterations over nodes $\to O(N_{\text{coord\_sweeps}} \cdot (|V| + |E|))$ time.
- **PAVA Compaction**: Amortized single-pass stack compaction per layer $\to O(|V|)$ time.
- **Total Stage 3 Time Complexity**: $\mathcal{O}(N_{\text{coord\_sweeps}} \cdot (|V| + |E|))$
- **Stage 3 Space Complexity**: $\mathcal{O}(|V|)$ (stack & coordinate maps).

### Stage 4: 3D A* Orthogonal Edge Routing
- **Grid Construction**: Coordinate bisection $\to O(|V_{\text{grid}}|)$ time.
- **A* Min-Heap Open List Search**: Performs $I_{\text{max}}$ expansions per edge. Heap operations cost $O(\log |V_{\text{grid}}|)$.
- **Indexed Spatial Occupancy Queries**: Binary search in interval trees $\to O(\log |E|)$ per segment test.
- **Total Stage 4 Time Complexity**: $\mathcal{O}(|E| \cdot I_{\text{max}} \log |V_{\text{grid}}|)$
- **Stage 4 Space Complexity**: $\mathcal{O}(|V_{\text{grid}}| + |E|)$ (grid graph & occupancy ledger).

### Stage 5: State-Space Optimization Loop
- Evaluates at most $S_{\text{max}}$ candidate states in the local search frontier.
- **Overall Engine Time Complexity**:
  $$\mathcal{O}\left( S_{\text{max}} \cdot \left( |E| \cdot I_{\text{max}} \log |V_{\text{grid}}| + N_{\text{sweeps}} (|V| \log |V| + |E|) \right) \right)$$
- **Overall Engine Space Complexity**: $\mathcal{O}(S_{\text{max}} \cdot (|V| + |E|) + |V_{\text{grid}}|)$

---

## 2. Source Code Line-Anchor Reference Map

All implementation files reside under [`src/engine/layout/custom/`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/):

| File Path | Description | Key Exports & Line Anchors |
| :--- | :--- | :--- |
| [`src/engine/layout/custom/types.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/types.ts#L1-L260) | Core TypeScript interface definitions | [`LayoutSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/types.ts#L40-L70), [`ExactSpacingDemand`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/types.ts#L80-L110), [`RoutedPath`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/types.ts#L150-L190) |
| [`src/engine/layout/custom/searchState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L80) | State tuple construction & hashing | [`createInitialSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L22), [`computeStateHash`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L55-L79) |
| [`src/engine/layout/custom/layoutOptimizerState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L96-L308) | State-space neighborhood search loop | [`searchBestLayoutState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L96-L308), [`deriveSearchStateBudgets`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L56-L94) |
| [`src/engine/layout/custom/stateEvaluator.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L217) | Full candidate evaluation pipeline | [`evaluateSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L217) |
| [`src/engine/layout/custom/layoutObjective.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L268) | 21-element lexicographic priority vector | [`ORDER`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L36), [`compareLayoutScore`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L38-L44) |
| [`src/engine/layout/custom/normalizeGraph.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149) | Graph validation & weak component partitioning | [`normalizeGraph`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149) |
| [`src/engine/layout/custom/stronglyConnectedComponents.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stronglyConnectedComponents.ts#L10-L90) | Tarjan's SCC decomposition algorithm | [`computeSCCs`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stronglyConnectedComponents.ts#L10-L90) |
| [`src/engine/layout/custom/cycleBreaking.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L10-L355) | Eades greedy flow cycle breaking | [`classifyEdgeRoles`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L10-L355) |
| [`src/engine/layout/custom/rankAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L11-L105) | Longest path topological rank assignment | [`assignRanks`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L11-L105) |
| [`src/engine/layout/custom/crossingMinimization.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L9-L204) | Alternating barycentric sweeps & transposition | [`minimizeCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L95-L204), [`countTotalGraphCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L44-L66) |
| [`src/engine/layout/custom/portOrdering.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L12-L65) | Pin port side angle sorting | [`sortNodeSideEndpoints`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L32-L65) |
| [`src/engine/layout/custom/coordinateAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L110-L408) | PAVA isotonic regression X/Y coordinate solver | [`projectLayerCenters`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L110-L195), [`assignCoordinates`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L199-L408) |
| [`src/engine/layout/custom/routeSearch.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L21-L774) | 3D A* directed open-list grid router | [`searchOrthogonalRoute`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L467-L740), [`IndexedOccupancy`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L330-L465) |
| [`src/engine/layout/custom/edgeRouter.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L105-L638) | Multi-variant order routing & conflict rip-up loop | [`routeAllEdges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L105-L638) |
| [`src/engine/layout/custom/badgePlacement.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L382-L676) | Badge placement search & demand emission | [`placeEdgeBadges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L382-L676), [`generateBadgeCandidates`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L68-L315) |
| [`src/engine/layout/custom/spacingDemand.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L20-L268) | Spacing demand canonicalization & override resolution | [`canonicalizeExactSpacingDemands`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L38-L66), [`resolveExactSpacingDemands`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L227-L268) |
| [`src/engine/layout/custom/svgPath.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L17-L184) | SVG path rendering & arc bridge renderer | [`pointsToSvgPath`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L17-L30), [`renderPathWithCrossingBridges`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L60-L184) |

---

## 3. Executable Verification Commands

Execute the following unit and integration test suites using `bun test` to verify layout engine correctness:

```bash
# Run unit tests for custom state-space engine components
bun test src/engine/layout/custom/searchState.test.ts
bun test src/engine/layout/custom/cycleBreaking.test.ts
bun test src/engine/layout/custom/crossingMinimization.test.ts
bun test src/engine/layout/custom/coordinateAssignment.test.ts
bun test src/engine/layout/custom/routeSearch.test.ts
bun test src/engine/layout/custom/badgePlacement.test.ts
bun test src/engine/layout/custom/spacingDemand.test.ts

# Run overall layout optimizer integration test suite
bun test src/engine/layout/custom/optimizeLayout.test.ts
bun test src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts

# Run complete type check and linter gate
bun run typecheck && bun run lint
```
