# 06. Codebase Reference Map & Developer Guide

This document maps the mathematical modules of the **Custom State-Space Engine** directly to source code files, TypeScript interfaces, and unit test suites in the repository.

---

## 🗺️ Source Code Architecture Sitemap

```
src/engine/layout/custom/
├── computeCustomLayout.ts           <-- Async Engine Entry Point
├── customLayoutAdapter.ts           <-- React GraphCanvas Integration Adapter
├── customLayoutWorker.ts            <-- Web Worker Emitter
├── customLayoutWorkerClient.ts      <-- Main-Thread Worker Client
├── optimizeLayout.ts                <-- 32-Stage Optimization Loop
├── layoutOptimizerState.ts          <-- State-Space Neighborhood Search
├── stateEvaluator.ts                <-- Lexicographic Cost Evaluator
├── searchState.ts                   <-- State Tuple σ Definitions
├── cycleBreaker.ts                  <-- Tarjan SCC & DFS Back-Edge Reversal
├── rankAssignment.ts                <-- Longest Path Layer Assignment
├── dummyNodes.ts                    <-- Virtual Dummy Node Insertion
├── barycentricOrdering.ts           <-- Crossing Minimization Sweeps
├── crossingMinimization.ts          <-- Crossing Count Matrix
├── nodeLayout.ts                    <-- Coordinate Assignment Pipeline
├── coordinateAssignment.ts          <-- Spacing Override X-Coordinate Projector
├── edgeRouter.ts                    <-- Edge Port Assignment Router
├── astarPathfinder.ts               <-- Grid A* Orthogonal Pathfinder
├── badgeMeasurement.ts             <-- SVG Badge Dimensions & Required Gap
├── badgePlacement.ts               <-- Badge Candidate Generator & Spacing Requests
├── spacingDemand.ts                 <-- Exact Spacing Demand Normalizer
└── svgPath.ts                       <-- Orthogonal SVG Path & Bridge Arc Generator
```

---

## 📋 File-by-File Technical Directory

| File Path | Core Functionality | Primary Exported Symbols | Unit Test Suite |
| :--- | :--- | :--- | :--- |
| [`computeCustomLayout.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/computeCustomLayout.ts) | Async layout engine entry point | `computeCustomLayout`, `computeCustomLayoutAsync` | `customLayoutAdapter.test.ts` |
| [`optimizeLayout.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/optimizeLayout.ts) | 32-stage time-sliced optimization coordinator | `optimizeLayout`, `hashLayoutState` | `customLayoutWorkerClient.test.ts` |
| [`layoutOptimizerState.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutOptimizerState.ts) | State-space neighborhood search solver | `searchBestLayoutState`, `deriveSearchStateBudgets` | `layoutOptimizerState.test.ts` |
| [`stateEvaluator.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stateEvaluator.ts) | Lexicographic evaluation & spacing re-run loop | `evaluateSearchState` | `customLayoutValidatorStrict.test.ts` |
| [`badgePlacement.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/badgePlacement.ts) | Candidate generator & spacing demand emission | `placeEdgeBadges`, `generateBadgeCandidates` | `sampleDatasetsValidation.test.ts` |
| [`spacingDemand.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/spacingDemand.ts) | Spacing demand resolver & $G_{\text{req}}$ computer | `resolveEffectiveSpacingOverrides`, `computeBadgeSpacingDemands` | `spacingDemand.test.ts` |

---

## 🧪 Comprehensive Quality Gate Test Suites

1. **Sample Datasets Quality Gate Suite**:
   [`src/engine/layout/custom/sampleDatasetsValidation.test.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/sampleDatasetsValidation.test.ts)
   Validates `cyclic_mesh.json`, `kubernetes_cluster_topology.json`, `ai_agent_trace.json`, `decision_tree.json`, `distributed_saga_workflow.json`.
   Command: `bun test src/engine/layout/custom/sampleDatasetsValidation.test.ts`

2. **20-Scenario Strict Validation Suite**:
   [`src/engine/layout/custom/customLayoutValidatorStrict.test.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/customLayoutValidatorStrict.test.ts)
   Validates 20 complex graph topologies (disjoint components, long feedback loops, multi-edges, self-loops).
   Command: `bun test src/engine/layout/custom/customLayoutValidatorStrict.test.ts`
