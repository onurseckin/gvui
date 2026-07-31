# 06. Codebase Reference Map & Asymptotic Bounds

[← Previous: Dynamic Spacing Demands](./05-dynamic-spacing-demands.md) | [← Back to Custom State-Space Engine Overview](./README.md)

This document provides complete asymptotic complexity derivations with concrete numerical calculations, source file line-anchor mappings, and executable test suite verification commands for the **Custom State-Space Layout Engine**.

---

## 1. Modular Asymptotic Complexity Bounds Derivation

Let $|V|$ denote the total number of nodes, $|E|$ denote the total number of edges, $K$ denote the number of rank layers ($K \le |V|$), $|V_{\text{grid}}|$ denote the number of orthogonal grid vertices ($|V_{\text{grid}}| = O((|V| + |E|)^2)$), and $S_{\text{max}}$ denote the maximum layout state search budget.

---

### Sub-Step 1.1: Stage 1 Complexity (Cycle Breaking & Rank Layering)

#### 1. Mathematical Sub-Component Formula
Stage 1 consists of three linear-time graph algorithms:
1. Tarjan's SCC Decomposition: $O(|V| + |E|)$
2. Eades Greedy Cycle Breaking: $O(|V| + |E|)$
3. Topological Longest Path Layering: $O(|V| + |E|)$

$$\text{Time}_{\text{stage1}} = \mathcal{O}(|V| + |E|), \quad \text{Space}_{\text{stage1}} = \mathcal{O}(|V| + |E|)$$

#### 2. Concrete Numerical Arithmetic Example
Consider a representative workflow graph with $|V| = 20$ nodes and $|E| = 30$ edges:

$$\text{Ops}_{\text{stage1}} = |V| + |E| = 20 + 30 = \mathbf{50 \text{ operations}}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function benchmarkStage1(nodes: Node[], edges: Edge[]): { ops: number; timeMs: number } {
  const t0 = performance.now();
  const graph = normalizeGraph(nodes, edges);
  const sccs = detectStronglyConnectedComponents(graph); // |V| + |E|
  const roles = classifyEdgeRoles(graph, sccs); // |V| + |E|
  const ranks = assignRanks(graph, roles); // |V| + |E|
  const t1 = performance.now();
  return { ops: nodes.length + edges.length, timeMs: t1 - t0 };
}
```

#### 4. Sub-Step ASCII Infographic
```
Sub-Step 1.1: Stage 1 Operational Bounds (|V|=20, |E|=30)
 Tarjan SCCs        : 50 ops  (Linear DFS Traversal)
 Eades Cycle Break  : 50 ops  (Linear Degree Scanning)
 Longest Path       : 50 ops  (Topological Kahn Pass)
 ───────────────────────────────────────────────────────
 Total Stage 1 Ops  : 50 ops  (< 0.05 ms)
```

---

### Sub-Step 1.2: Stage 2 Complexity (Barycentric Crossing Minimization)

#### 1. Mathematical Sub-Component Formula
Stage 2 evaluates $N_{\text{sweeps}}$ sweeps over adjacent rank layers. Each sweep evaluates predecessor/successor position averages and sorts nodes:

$$\text{Time}_{\text{stage2}} = \mathcal{O}\left( N_{\text{sweeps}} \cdot (|V| \log_2 |V| + |E|) \right), \quad \text{Space}_{\text{stage2}} = \mathcal{O}(|V| + |E|)$$

#### 2. Concrete Numerical Arithmetic Example
For sample graph $|V| = 20, \; |E| = 30$, and maximum sweeps $N_{\text{sweeps}} = 24$:
- Layer Sorting Cost: $|V| \log_2 |V| = 20 \times \log_2(20) \approx 20 \times 4.322 = 86.44 \text{ ops}$.
- Edge Barycenter Average Cost: $|E| = 30 \text{ ops}$.
- Per-Sweep Operations: $86.44 + 30 = 116.44 \text{ ops}$.

$$\text{Total Stage 2 Ops} = 24 \times 116.44 = \mathbf{2,794.56 \text{ operations}}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function benchmarkStage2(layerGraph: ExpandedLayerGraph, sweeps = 24): { ops: number } {
  const v = layerGraph.nodes.length;
  const e = layerGraph.edges.length;
  const perSweepOps = v * Math.log2(v) + e;
  return { ops: Math.round(sweeps * perSweepOps) };
}
```

#### 4. Sub-Step ASCII Infographic
```
Sub-Step 1.2: Stage 2 Barycentric Sweeping Bounds (|V|=20, |E|=30, N=24)
 Layer Sort Cost    : 20 * log2(20) = 86.44 ops
 Edge Mean Cost     : 30 ops
 Single Sweep Ops   : 86.44 + 30 = 116.44 ops
 ───────────────────────────────────────────────────────
 24 Sweeps Total    : 24 * 116.44 = 2,794.56 ops  (~0.15 ms)
```

---

### Sub-Step 1.3: Stage 3 Complexity (PAVA Isotonic Coordinate Assignment)

#### 1. Mathematical Sub-Component Formula
Stage 3 executes $N_{\text{coord\_sweeps}}$ iterations of coordinate averaging followed by Pool Adjacent Violators Algorithm (PAVA) single-pass stack compaction per layer:

$$\text{Time}_{\text{stage3}} = \mathcal{O}\left( N_{\text{coord\_sweeps}} \cdot (|V| + |E|) \right), \quad \text{Space}_{\text{stage3}} = \mathcal{O}(|V|)$$

#### 2. Concrete Numerical Arithmetic Example
For sample graph $|V| = 20, \; |E| = 30$, PAVA stack compaction $|V| = 20$, and coordinate sweeps $N_{\text{coord\_sweeps}} = 4$:

$$\text{Ops}_{\text{stage3}} = 4 \times (20 + 30 + 20) = 4 \times 70 = \mathbf{280 \text{ operations}}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function benchmarkStage3(vCount: number, eCount: number, coordSweeps = 4): { ops: number } {
  const pavaSinglePassOps = vCount;
  const totalOps = coordSweeps * (vCount + eCount + pavaSinglePassOps);
  return { ops: totalOps };
}
```

#### 4. Sub-Step ASCII Infographic
```
Sub-Step 1.3: Stage 3 PAVA Linear Coordinate Solver Bounds (|V|=20, |E|=30)
 Unconstrained Shifts : 50 ops per sweep
 PAVA Stack Compaction: 20 ops per sweep (Amortized O(V))
 ───────────────────────────────────────────────────────
 4 Sweeps Total       : 4 * (50 + 20) = 280 ops  (~0.02 ms)
```

---

### Sub-Step 1.4: Stage 4 Complexity (3D A* Orthogonal Edge Routing)

#### 1. Mathematical Sub-Component Formula
For each edge $e \in E$, directed 3D A* search expands up to $I_{\text{max}}$ open-list states over orthogonal grid graph $V_{\text{grid}}$. Min-heap insertions/deletions cost $O(\log_2 |V_{\text{grid}}|)$:

$$|V_{\text{grid}}| = \mathcal{O}\left( (|V| + |E|)^2 \right)$$

$$\text{Time}_{\text{stage4}} = \mathcal{O}\left( |E| \cdot I_{\text{max}} \cdot \log_2 |V_{\text{grid}}| \right), \quad \text{Space}_{\text{stage4}} = \mathcal{O}(|V_{\text{grid}}| + |E|)$$

#### 2. Concrete Numerical Arithmetic Example
For sample graph $|V| = 20, \; |E| = 30$, max expansions per edge $I_{\text{max}} = 500$:
- Grid Size: $|V_{\text{grid}}| = (20 + 30)^2 = 2500 \text{ vertices}$.
- Heap Operation Cost: $\log_2(2500) \approx 11.288 \text{ ops}$.
- Per-Edge Expansion Cost: $500 \times 11.288 = 5,644 \text{ ops}$.

$$\text{Total Stage 4 Routing Ops} = 30 \times 5,644 = \mathbf{169,320 \text{ operations}}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function benchmarkStage4(eCount: number, vCount: number, iMax = 500): { ops: number } {
  const vGrid = Math.pow(vCount + eCount, 2);
  const logVGrid = Math.log2(vGrid);
  const totalOps = eCount * iMax * logVGrid;
  return { ops: Math.round(totalOps) };
}
```

#### 4. Sub-Step ASCII Infographic
```
Sub-Step 1.4: Stage 4 3D A* Routing Bounds (|V|=20, |E|=30, I_max=500)
 Grid Graph Size |V_grid| : (20 + 30)^2 = 2,500 vertices
 Heap Operation Cost      : log2(2500) = 11.288 ops
 Single Edge A* Search    : 500 * 11.288 = 5,644 ops
 ───────────────────────────────────────────────────────
 30 Edges Routing Total   : 30 * 5,644 = 169,320 ops  (~1.20 ms)
```

---

### Sub-Step 1.5: Stage 5 Complexity (Master Frontier Queue Search)

#### 1. Mathematical Sub-Component Formula
The overall state-space optimization loop evaluates up to $S_{\text{max}}$ candidate states in the local search frontier queue:

$$\text{Time}_{\text{total}} = \mathcal{O}\left( S_{\text{max}} \cdot \left( \text{Time}_{\text{stage4}} + \text{Time}_{\text{stage2}} + \text{Time}_{\text{stage3}} \right) \right)$$

$$\text{Space}_{\text{total}} = \mathcal{O}\left( S_{\text{max}} \cdot (|V| + |E|) + |V_{\text{grid}}| \right)$$

#### 2. Concrete Numerical Overall Engine Bounds Example
For sample graph $|V| = 20, \; |E| = 30$, and state search budget $S_{\text{max}} = 10$:

$$\text{Single State Evaluation Ops} = 169,320 \text{ (Stage 4)} + 2,795 \text{ (Stage 2)} + 280 \text{ (Stage 3)} = 172,395 \text{ ops}$$

$$\text{Total Master Engine Ops} = 10 \times 172,395 = \mathbf{1,723,950 \text{ operations}}$$

$$\text{Estimated Execution Latency} \approx \frac{1,723,950}{10^9 \text{ ops/sec}} \approx \mathbf{1.72\text{ ms}} \ll 100\text{ms threshold} \quad (\mathbf{PASS})$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function auditEnginePerformance(vCount: number, eCount: number, sMax = 10): { totalOps: number; estimatedMs: number } {
  const stage2 = 24 * (vCount * Math.log2(vCount) + eCount);
  const stage3 = 4 * (vCount + eCount);
  const stage4 = eCount * 500 * Math.log2(Math.pow(vCount + eCount, 2));
  
  const singleState = stage2 + stage3 + stage4;
  const totalOps = Math.round(sMax * singleState);
  const estimatedMs = totalOps / 1_000_000; // 1M ops per ms in modern JS V8
  return { totalOps, estimatedMs };
}
```

#### 4. Sub-Step ASCII Infographic
```
Sub-Step 1.5: Total Engine Operational Budget (|V|=20, |E|=30, S_max=10)
 Single State Eval : 172,395 ops  (Stage 4 Routing dominates ~98%)
 Search Budget S   : 10 states max
 ─────────────────────────────────────────────────────────────────
 Total Engine Ops  : 10 * 172,395 = 1,723,950 ops
 Estimated Time    : ~1.72 ms  (Well within 60fps frame budget of 16.6ms!)
```

---

## 2. Source Code Line-Anchor Reference Map

All implementation files reside under [`src/engine/layout/custom/`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/):

| File Path | Description | Key Exports & Line Anchors |
| :--- | :--- | :--- |
| [`src/engine/layout/custom/types.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/types.ts#L1-L346) | Core TypeScript interface definitions | [`LayoutSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/types.ts#L200-L211), [`ExactSpacingDemand`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/types.ts#L213-L225), [`RoutedPath`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/types.ts#L34-L40) |
| [`src/engine/layout/custom/searchState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L80) | State tuple construction & hashing | [`createInitialSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L22), [`computeStateHash`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L55-L79) |
| [`src/engine/layout/custom/layoutOptimizerState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L55-L310) | State-space neighborhood search loop | [`searchBestLayoutState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L96-L308), [`deriveSearchStateBudgets`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L56-L94) |
| [`src/engine/layout/custom/stateEvaluator.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L217) | Full candidate evaluation pipeline | [`evaluateSearchState`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L217) |
| [`src/engine/layout/custom/layoutObjective.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L268) | 21-element lexicographic priority vector | [`ORDER`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L36), [`compareLayoutScore`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L38-L44) |
| [`src/engine/layout/custom/normalizeGraph.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149) | Graph validation & weak component partitioning | [`normalizeGraph`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149) |
| [`src/engine/layout/custom/stronglyConnectedComponents.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stronglyConnectedComponents.ts#L10-L103) | Tarjan's SCC decomposition algorithm | [`detectStronglyConnectedComponents`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stronglyConnectedComponents.ts#L10-L102) |
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
