# Design Spec: Persistent Layout Caching, Multi-Worker Pool, and Progress UI (v8)

**Date**: 2026-07-31  
**Target File**: `docs/superpowers/specs/2026-07-31-loading-progress-and-worker-pool-design.md`

---

## 1. Overview & Objectives

This specification outlines the architecture for persistent graph layout caching, hardware multi-worker parallel execution, and a real-time progress overlay in `gvui`.

### Primary Goals
1. **Zero Ghosting / Clean Unmount**: Clear the canvas display immediately when a new graph is selected so old graph visuals never linger while a new dataset calculates.
2. **Persistent Storage Caching**: Cache precomputed node positions and edge SVG paths in `localStorage` / IndexedDB keyed by graph content signature (`generateDatasetSignature`). If the dataset content signature matches, load instantly in **0ms** from storage without running layout calculations.
3. **Multi-Worker Pool & Streaming Progress**: Hardware-parallelized WebWorker execution pool (`customLayoutWorkerPool.ts`) emitting granular progress events (`0% - 100%`).
4. **Rich Visual Loading Overlay**: Display a modern glassmorphic loading modal showing progress percentage, current stage (e.g. *Stage 3/5: A* Orthogonal Edge Routing*), phase details, and node/edge metrics.

---

## 2. Architecture & Subsystems

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Graph UI (App / Sidebar)                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Select Dataset
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Dataset Signature Check                             │
│                  signature = generateDatasetSignature(dataset)              │
└──────────────────┬──────────────────────────────────────────┬───────────────┘
                   │                                          │
        [Cache Hit in LocalStorage]                 [Cache Miss]
                   │                                          │
                   ▼                                          ▼
       Load 0ms from Storage                   Immediate Canvas Unmount
       & Mount Instantly                       & Launch Loading Overlay
                                                              │
                                                              ▼
                                               ┌──────────────────────────────┐
                                               │ Multi-Worker Pool Execution  │
                                               │ (hardwareConcurrency Threads)│
                                               └──────────────┬───────────────┘
                                                              │ Stream Progress
                                                              ▼
                                               ┌──────────────────────────────┐
                                               │  Loading Progress Overlay    │
                                               │   [Stage 3/5: A* Routing 65%]│
                                               └──────────────┬───────────────┘
                                                              │ 100% Complete
                                                              ▼
                                               Save to LocalStorage Cache &
                                               Mount Canvas Instantly
```

---

## 3. Detailed Component Specifications

### A. Persistent Layout Cache (`src/utils/fileStorage.ts`)
- **Key Format**: `gvui_layout_cache_v1_<signature>`
- **Storage Strategy**:
  - `loadStoredLayout(signature: string)`: Checks `localStorage` / IndexedDB for precomputed `{ nodes: PositionedNode[], edges: PositionedEdge[] }`. Returns `null` on cache miss or invalid signature.
  - `saveStoredLayout(signature: string, layout: { nodes: PositionedNode[]; edges: PositionedEdge[] })`: Persists computed layout coordinates and SVG paths.

### B. Worker Pool & Hardware Parallelism (`src/engine/layout/custom/customLayoutWorkerPool.ts`)
- Spawns $N = \min(\text{navigator.hardwareConcurrency} \parallel 4, 4)$ Web Worker instances.
- Streams progress messages from Worker to Main Thread:
  ```typescript
  export interface WorkerProgressMessage {
    type: "progress";
    requestId: string;
    stage: string;
    stageIndex: number;
    totalStages: number;
    percent: number;
    detail: string;
  }
  ```
- **Stages**:
  1. `[1/5]` *Normalizing Graph Topology & Dimensions* (10%)
  2. `[2/5]` *Computing Barycentric Layer Ranks & Order* (30%)
  3. `[3/5]` *A* Orthogonal Edge Route Search* (65%)
  4. `[4/5]` *Optimizing Badge Placement & Bridge Crossings* (85%)
  5. `[5/5]` *Finalizing Canvas SVG Geometries* (100%)

### C. Progress UI Component (`src/components/Controls/LoadingOverlay.tsx`)
- Renders over the `<GraphCanvas>` when `isCalculatingLayout === true`.
- Components:
  - **Progress Bar**: Smooth animated gradient bar bound to `progressPercent`.
  - **Stage Indicator**: Badge showing `Stage 3 of 5`.
  - **Detail Status Text**: e.g., `Routing 13 orthogonal edges across corridor lanes...`.
  - **Metrics Tag**: `12 Nodes • 13 Edges`.

### D. Canvas Unmount & State Synchronization (`src/engine/GraphCanvas/index.tsx`)
- On dataset selection:
  1. Checks `loadStoredLayout(signature)`. If hit, sets `positionedNodes` and `positionedEdges` immediately (**0ms**).
  2. If miss, calls `setPositionedGraph([], [])` to unmount stale canvas elements immediately, sets `isCalculatingLayout = true`, and dispatches worker pool layout job.
  3. When worker pool emits `progress` events, updates `layoutProgress` state.
  4. On worker completion (100%), saves layout to `localStorage`, sets `positionedNodes` and `positionedEdges`, and sets `isCalculatingLayout = false`.

---

## 4. Verification & Testing Criteria
1. **Cache Hit Verification**: Verify selecting `K8s Topology` a second time loads in **0ms** directly from `localStorage` without spawning worker threads.
2. **Immediate Unmount Verification**: Assert that selecting a new dataset immediately sets `positionedNodes = []`, hiding previous graph ghosting.
3. **Progress Event Verification**: Unit test that worker pool streams progress messages (`10% -> 30% -> 65% -> 85% -> 100%`).
4. **Type & Lint Check**: 0 TypeScript errors (`tsc -b`), 0 linter errors (`oxlint`).
