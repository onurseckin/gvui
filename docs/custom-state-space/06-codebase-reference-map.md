# 06. Codebase Reference Map & Developer Guide

[← Back to Master Index](../README.md)

This document maps the mathematical modules of the **Custom State-Space Engine** directly to source code files, TypeScript interfaces, exact line anchors, unit test suites, and algorithmic time complexity bounds in the repository.

---

## 1. Algorithmic Time & Space Complexity Bounds

The multi-objective state-space search framework operates within strict computational bounds:

$$\mathcal{O}\Big( N_{\text{states}} \cdot \big( |V| \log |V| + |E| \cdot A^*_{\text{grid}} + K_{\text{sweeps}} \cdot |V| \big) \Big)$$

Where:
- $N_{\text{states}}$: Total evaluated neighborhood states (bounded by budget limit, default $N_{\text{max}} = 100$).
- $|V| \log |V|$: Topological sort and layer node rank ordering cost.
- $|E| \cdot A^*_{\text{grid}}$: Grid A* orthogonal routing cost across all edges, where grid vertex count $|V_{\text{grid}}| = \mathcal{O}\left(\frac{\text{Width}}{\Delta_{\text{grid}}} \cdot \frac{\text{Height}}{\Delta_{\text{grid}}}\right)$ (step resolution $\Delta_{\text{grid}} = 8\text{px}$).
- $K_{\text{sweeps}} \cdot |V|$: Barycentric crossing minimization cost across $K_{\text{sweeps}} = 12$ alternating passes.

### Space Complexity Bounds

$$\mathcal{O}\left( |V| + |E| + |V_{\text{grid}}| + N_{\text{states}} \cdot |\mathcal{S}_{\text{visited}}| \right)$$

Memory utilization is bounded by spatial grid vertex count $|V_{\text{grid}}|$ and state hash signature cache size $|\mathcal{S}_{\text{visited}}|$.

---

## 2. 🗺️ Source Code Architecture Sitemap

```
src/engine/layout/
├── customLayoutAdapter.ts           <-- React GraphCanvas Integration Adapter
└── custom/
    ├── computeCustomLayout.ts       <-- Async Engine Entry Point (L8-L22)
    ├── customLayoutWorker.ts        <-- Web Worker Task Emitter
    ├── customLayoutWorkerClient.ts  <-- Main-Thread Worker Pool Client
    ├── optimizeLayout.ts            <-- Time-Sliced Optimization Coordinator (L49-L117)
    ├── layoutOptimizerState.ts      <-- State-Space Neighborhood Solver (L96-L280)
    ├── stateEvaluator.ts            <-- Lexicographic Cost Evaluator (L35-L217)
    ├── layoutObjective.ts           <-- Lexicographic ORDER & Comparator (L14-L268)
    ├── searchState.ts               <-- State Tuple σ Definitions & Hasher (L4-L80)
    ├── cycleBreaking.ts             <-- Tarjan SCC & Eades Back-Edge Reversal (L10-L355)
    ├── stronglyConnectedComponents.ts <-- Tarjan SCC Decomposition (L1-L90)
    ├── rankAssignment.ts            <-- Longest Path Layer Assignment (L11-L105)
    ├── normalizeGraph.ts            <-- Topology Normalization & Dummy Nodes (L14-L149)
    ├── crossingMinimization.ts      <-- 12-Sweep Barycentric Optimizer (L9-L200)
    ├── crossingDetection.ts         <-- Segment Intersection Crossing Counter (L1-L80)
    ├── portOrdering.ts              <-- Pin Port Permutation Orderer (L1-L60)
    ├── nodeLayout.ts                <-- Coordinate Assignment Coordinator (L1-L100)
    ├── coordinateAssignment.ts      <-- Spacing Override X-Coordinate Projector (L30-L120)
    ├── edgeRouter.ts                <-- Edge Port Router & Occupancy Manager (L1-L250)
    ├── routeSearch.ts               <-- 3D Grid A* Orthogonal Pathfinder (L21-L400)
    ├── routingGrid.ts               <-- Spatial Clearance Grid Constructor (L1-L150)
    ├── badgeMeasurement.ts         <-- SVG Badge Dimensions Measurement (L26-L60)
    ├── badgePlacement.ts           <-- Badge Candidate Generator & Spacing Requests (L1-L550)
    ├── spacingDemand.ts             <-- Exact Spacing Demand Resolver & G_req (L20-L150)
    └── svgPath.ts                   <-- Orthogonal SVG Path & Bridge Arc Generator (L1-L180)
```

---

## 3. 📋 File-by-File Technical Directory & Line Anchors

| Module Document | Source Code File | Primary Exported Symbols | Exact Line Anchors | Primary Unit Test Suite |
| :--- | :--- | :--- | :--- | :--- |
| **01. State Space Search** | [`searchState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts) | `createInitialSearchState`, `cloneSearchState`, `computeStateHash` | [`L4-L80`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/searchState.ts#L4-L80) | `searchState.test.ts` |
| | [`layoutOptimizerState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts) | `searchBestLayoutState`, `deriveSearchStateBudgets` | [`L96-L280`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts#L96-L280) | `layoutOptimizerState.test.ts` |
| | [`stateEvaluator.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts) | `evaluateSearchState` | [`L35-L217`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts#L35-L217) | `customLayoutValidatorStrict.test.ts` |
| | [`layoutObjective.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts) | `ORDER`, `compareLayoutScore`, `buildLayoutScore` | [`L14-L268`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L268) | `layoutObjective.test.ts` |
| **02. Sugiyama Layering** | [`cycleBreaking.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts) | `classifyEdgeRoles` | [`L10-L355`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L10-L355) | `cycleBreaking.test.ts` |
| | [`rankAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts) | `assignRanks` | [`L11-L105`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L11-L105) | `rankAssignment.test.ts` |
| | [`normalizeGraph.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts) | `normalizeGraph` | [`L14-L149`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149) | `normalizeGraph.test.ts` |
| **03. Barycentric Crossing** | [`crossingMinimization.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts) | `minimizeCrossings`, `countLayerCrossings`, `countTotalGraphCrossings` | [`L9-L200`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L9-L200) | `crossingMinimization.test.ts` |
| **04. A* Orthogonal Routing** | [`routeSearch.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts) | `searchOrthogonalRoute`, `compareRouteCost` | [`L21-L400`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/routeSearch.ts#L21-L400) | `routeSearch.test.ts` |
| | [`edgeRouter.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts) | `routeAllEdges` | [`L1-L250`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/edgeRouter.ts#L1-L250) | `edgeRouter.test.ts` |
| | [`svgPath.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts) | `pointsToSvgPath` | [`L1-L180`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/svgPath.ts#L1-L180) | `svgPath.test.ts` |
| **05. Dynamic Spacing** | [`spacingDemand.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts) | `requiredSameRankBadgeGap`, `canonicalizeExactSpacingDemands`, `resolveExactSpacingDemands` | [`L20-L150`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts#L20-L150) | `spacingDemand.test.ts` |
| | [`badgePlacement.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts) | `placeEdgeBadges`, `generateBadgeCandidates` | [`L1-L550`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts#L1-L550) | `badgePlacement.test.ts` |
| | [`coordinateAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts) | `assignNodeCoordinates` | [`L30-L120`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/coordinateAssignment.ts#L30-L120) | `coordinateAssignment.test.ts` |

---

## 4. 🧪 Comprehensive Quality Gate Test Suites

1. **Sample Datasets Quality Gate Suite**:
   [`src/engine/layout/custom/sampleDatasetsValidation.test.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/sampleDatasetsValidation.test.ts)
   Validates `cyclic_mesh.json`, `kubernetes_cluster_topology.json`, `ai_agent_trace.json`, `decision_tree.json`, `distributed_saga_workflow.json`.
   Command: `bun test src/engine/layout/custom/sampleDatasetsValidation.test.ts`

2. **20-Scenario Strict Validation Suite**:
   [`src/engine/layout/custom/customLayoutValidatorStrict.test.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/customLayoutValidatorStrict.test.ts)
   Validates 20 complex graph topologies (disjoint components, long feedback loops, multi-edges, self-loops).
   Command: `bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts`

3. **Aesthetic Acceptance Gate Suite**:
   [`src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/customLayoutAestheticAcceptance.test.ts)
   Ensures ZERO node overlaps, ZERO edge penetration, minimal crossings, and valid badge leader lines across all standard datasets.
