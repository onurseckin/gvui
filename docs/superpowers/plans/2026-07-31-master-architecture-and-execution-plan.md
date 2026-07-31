# Master Architecture, Edge Case Catalog, and Multi-Agent Execution Blueprint (v10)

> **Document Type:** Master System Architecture, Algorithmic Edge Case Blueprint, and Multi-Agent Orchestration Plan  
> **Author:** Antigravity AI Systems  
> **Status:** Approved Blueprint for Execution  
> **Target Path:** `docs/superpowers/plans/2026-07-31-master-architecture-and-execution-plan.md`

---

## Executive Summary & System Vision

This document defines the complete technical architecture, edge case prevention matrix, layout engine specification, and multi-agent execution strategy for `gvui`. 

It replaces ad-hoc code snippets with a rigorous, formal engineering specification that covers:
1. **Full 4-Mode Layout Engine Parity**: 100% reliable execution and state isolation across `top-down` (Custom Directed A* Engine), `left-right` (Dagre LR Engine), `force` (Organic Physics Engine), and `radial` (Concentric Circle Engine).
2. **Mode-Isolated Storage Caching**: Versioned cache keying strategy (`gvui_layout_cache_v2_${layoutMode}_${datasetSignature}`) guaranteeing that switching between layout modes or datasets loads instantly in 0ms without state bleed.
3. **Sleek Radial Circular Progress Loader**: SVG-based radial ring progress indicator featuring animated stroke-dashoffset, linear color gradients, glowing backdrop filters, stage checkmark step badges, and centered live percentage text.
4. **TanStack Router Architecture**: Type-safe routing across dataset switching (`/graphs/$fileId`), node centering (`?node=$nodeId`), and playground testing (`/testing`), completely eliminating manual URL history mutations and re-render loops.
5. **Multi-Agent Parallel Orchestration Strategy**: Formal Directed Acyclic Graph (DAG) of parallel agent dispatches, linear dependency bounds, two-stage feedback review loops, and automated error-escalation paths.

---

## 1. System Architecture & Component Interactions

```
                                  ┌──────────────────────────────────────────┐
                                  │      TanStack Router (@tanstack/react-router) │
                                  │  /graphs/$fileId  |  /testing            │
                                  └────────────────────┬─────────────────────┘
                                                       │
                                        URL Param / Navigation Event
                                                       │
                                                       ▼
                                  ┌──────────────────────────────────────────┐
                                  │         Graph Store (Zustand)            │
                                  │  currentFile, dataset, layoutMode, node  │
                                  └────────────────────┬─────────────────────┘
                                                       │
                                              Dataset & Mode Key
                                                       │
                                                       ▼
                                  ┌──────────────────────────────────────────┐
                                  │      Isolated Storage Cache Query        │
                                  │  gvui_layout_cache_v2_${mode}_${sig}     │
                                  └──────────┬────────────────────┬──────────┘
                                             │                    │
                                     [Cache Hit: 0ms]     [Cache Miss]
                                             │                    │
                                             ▼                    ▼
                                  ┌──────────────────┐ ┌─────────────────────┐
                                  │ Direct Mount     │ │ Immediate Unmount & │
                                  │ (Instant Render) │ │ Spawn Loading Screen│
                                  └──────────────────┘ └──────────┬──────────┘
                                                                  │
                                                                  ▼
                                                       ┌─────────────────────┐
                                                       │ WebWorker Execution │
                                                       │ Multi-Thread Pool   │
                                                       └──────────┬──────────┘
                                                                  │
                                                        Stream Progress Events
                                                                  │
                                                                  ▼
                                                       ┌─────────────────────┐
                                                       │ Sleek Radial Progress│
                                                       │ Loader Overlay UI   │
                                                       └──────────┬──────────┘
                                                                  │
                                                            Render Ready (100%)
                                                                  │
                                                                  ▼
                                                       ┌─────────────────────┐
                                                       │ Save to Storage &   │
                                                       │ Mount Canvas        │
                                                       └─────────────────────┘
```

---

## 2. Exhaustive Edge Case Catalog & Technical Mitigation Strategies

| ID | Edge Case Category | Failure Scenario / Trigger | Technical Impact | Architectural Mitigation & Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **EC-01** | **Layout Mode Cross-Bleed** | User switches from `top-down` to `left-right` for the same graph file. | Cache key collision causes `left-right` mode to render stale `top-down` node positions. | Namespace all cache keys with explicit `layoutMode` prefix: `gvui_layout_cache_v2_${layoutMode}_${datasetSignature}`. |
| **EC-02** | **Stale Canvas Ghosting** | User selects a complex graph (e.g. `K8s Topology`) while viewing `Saga Workflow`. | Old graph remains visible on screen for seconds while new layout calculates in background. | Execute immediate canvas unmount (`setPositionedGraph([], [])`) instantly upon dataset selection before spawning background worker calculation. |
| **EC-03** | **Worker Cancellation Race** | User rapidly clicks 5 graph files in 2 seconds while background workers are calculating. | Stale worker responses resolve out of order, overwriting current canvas with an old graph layout. | Pass `AbortController.signal` to `computeCustomEngineGraphLayoutAsync`. Cancel in-flight worker requests on new dataset/mode selection and check `isSubscribed` flag before setting store state. |
| **EC-04** | **Storage Quota Overflow** | `localStorage` fills up over time after caching dozens of complex graph layouts. | `localStorage.setItem` throws unhandled `QuotaExceededError` exception, crashing the layout pipeline. | Wrap all storage writes in `try/catch`. On `QuotaExceededError`, execute LRU cache cleanup removing keys with oldest `timestamp`, then retry write. |
| **EC-05** | **WebWorker Availability** | App runs in an restricted iframe, worker-blocked enterprise browser, or SSR environment. | `new Worker()` throws SecurityError or returns undefined, breaking layout computation. | Gracefully catch Worker creation failures in `customLayoutWorkerClient.ts` and fall back to synchronous layout calculation with progress overlay fallback. |
| **EC-06** | **Disjoint Graph Components** | Graph dataset contains multiple disconnected node clusters ($SCCs$ / subgraphs). | Layout engines place disjoint components on top of each other or compute invalid coordinates. | Compute weak connected components in `normalizeGraph`. Calculate bounding boxes for each component and pack them horizontally with margin offsets. |
| **EC-07** | **Zero-Node or Single-Node** | Graph dataset has 0 nodes or 1 node without edges. | Division by zero in coordinate scaling, SVG path generation crashes on single point. | Short-circuit layout dispatcher for $|V| \le 1$. Return single node centered at `(0, 0)` with width/height, and empty edges array. |
| **EC-08** | **Container Resize Rescale** | Browser window is resized while graph is rendering or auto-fitting. | Canvas viewport offset becomes misaligned or auto-fit zoom calculation uses stale dimensions. | Use `ResizeObserver` on `<GraphCanvas>` container element to update container height/width dynamically before computing `calculateFitView`. |
| **EC-09** | **Route Parameter Mismatch** | User types an invalid URL (e.g., `/graphs/non_existent_file.json`). | Fetch returns 404 HTTP error, application throws unhandled JSON parse error. | Catch HTTP fetch errors in route loaders, display a clean error banner in UI, and redirect gracefully to `/graphs/ai_agent_trace.json`. |
| **EC-10** | **Rapid Mode Switching** | User toggles layout mode dropdown (`top-down` $\rightarrow$ `force` $\rightarrow$ `radial` $\rightarrow$ `left-right`) rapidly. | Multiple layout calculations trigger concurrently, competing for store updates. | Cancel pending layout calculation controller, reset progress interpolator to 0%, and execute the latest selected mode cleanly. |

---

## 3. Sleek Radial Circular Progress Loader Specification

### Aesthetic & Visual Design Requirements
- **Radial Progress Ring**: Pure SVG `<svg>` circular ring (120px diameter) with smooth stroke animation.
- **Stroke Geometry**:
  - Background Ring: `<circle>` with 8px stroke, 8% opacity white (`rgba(255, 255, 255, 0.08)`).
  - Animated Foreground Ring: `<circle>` with 8px stroke, using SVG linear gradient (`#1f6beb` to `#3fb950`).
  - Stroke Dash Math:
    $$\text{Radius } r = \frac{\text{size} - \text{strokeWidth}}{2} = 56\text{px}$$
    $$\text{Circumference } C = 2 \pi r \approx 351.858\text{px}$$
    $$\text{Dash Offset } O = C - \left(\frac{\text{percent}}{100}\right) \times C$$
- **Centered Percentage Typography**: Live percentage display (`0%` to `100%`) positioned in the exact center of the radial ring using monospace gradient text (`#58a6ff` to `#3fb950`).
- **5-Step Phase Stepper Chips**:
  1. `Topology` (0% – 20%): Topology normalization & badge measurement
  2. `Ranking` (20% – 40%): Hierarchy ordering & layer assignments
  3. `A* Routing` (40% – 70%): Corridor grid creation & A* pathfinding
  4. `Crossings` (70% – 90%): Bridge crossing minimization & badge placement
  5. `Render` (90% – 100%): Canvas mounting & viewport fit calculations

---

## 4. Multi-Agent Execution DAG & Task Dependencies

```
[Phase 1: Foundation & Core Layout Mode Repair]
  ├── Agent 1A: Isolated Storage Cache Utility (Sequential)
  └── Agent 1B: Multi-Mode Layout Dispatcher Suite (Sequential)
        │
        ▼
[Phase 2: UI Components & Loader Animations (PARALLEL DISPATCH)]
  ├── Agent 2A: CircularProgressLoader SVG Ring Component (Parallel Branch A)
  └── Agent 2B: 60 FPS Micro-Tick Progress Interpolator Hook (Parallel Branch B)
        │
        ▼
[Phase 3: Integration & Worker Event Streaming]
  └── Agent 3A: WebWorker Real-Time Progress Streamer & Canvas Integration (Sequential)
        │
        ▼
[Phase 4: TanStack Router Architecture & App Navigation]
  └── Agent 4A: TanStack Router Tree & Route Loader Integration (Sequential)
        │
        ▼
[Phase 5: Exhaustive Edge Case Audit & Quality Verification]
  ├── Agent 5A: Spec Compliance Audit Agent
  └── Agent 5B: Full Suite Regression Audit Agent
```

---

## 5. Two-Stage Review & Feedback Loop Architecture

### Feedback Loop Protocol Rules
1. **Stage 1 Review (Spec Compliance)**:
   - Evaluates whether the implementer agent fulfilled 100% of the functional specification and handled all assigned edge cases (EC-01 through EC-10).
   - If gaps exist: Implementer subagent is re-dispatched with explicit missing items.
2. **Stage 2 Review (Code Quality & Non-Regression)**:
   - Audits code cleanliness, ensures zero TypeScript `any` annotations, zero `@ts-ignore` comments, 100% test coverage, and clean linting (`oxlint`).
   - If issues exist: Implementer subagent fixes quality items and undergoes re-review.
3. **Escalation Path**:
   - If an implementer subagent hits a blocker or fails a test twice, the orchestrator re-evaluates context, adjusts dependencies, or upgrades the reasoning model.

---

## 6. Step-by-Step Technical Execution Roadmap

### Phase 1: Foundation & Multi-Mode Storage Cache Isolation

#### Step 1.1: Mode-Isolated Storage Cache Utility
- **Goal**: Update `src/utils/layoutCacheStorage.ts` so cache keys are explicitly namespaced by `layoutMode`.
- **Target Files**: `src/utils/layoutCacheStorage.ts`, `src/utils/layoutCacheStorage.test.ts`.
- **Technical Directives**:
  - Update `loadStoredLayout(mode: LayoutMode, signature: string)` and `saveStoredLayout(mode: LayoutMode, signature: string, layout)`.
  - Format key as `gvui_layout_cache_v2_${mode}_${signature}`.
  - Implement `QuotaExceededError` handling: Catch storage overflow, purge older `gvui_layout_cache_v2_` keys, and retry write.
- **Edge Cases Addressed**: EC-01 (mode cross-bleed), EC-04 (storage overflow).
- **Verification Gate**: `bun test src/utils/layoutCacheStorage.test.ts` (Pass).

#### Step 1.2: Multi-Mode Layout Engine Test Suite
- **Goal**: Create comprehensive unit test suite in `src/engine/layout/layoutDispatcher.test.ts` covering all 4 layout modes.
- **Target Files**: `src/engine/layout/layoutDispatcher.ts`, `src/engine/layout/layoutDispatcher.test.ts`.
- **Technical Directives**:
  - Test `computeGraphLayout(dataset, mode)` for `"top-down"`, `"left-right"`, `"force"`, and `"radial"`.
  - Assert that all 4 modes return non-empty `PositionedNode[]` and `PositionedEdge[]` with valid coordinates for sample datasets.
  - Test edge cases $|V| = 0$ (empty graph) and $|V| = 1$ (single node).
- **Edge Cases Addressed**: EC-06 (disjoint components), EC-07 (zero/single node).
- **Verification Gate**: `bun test src/engine/layout/layoutDispatcher.test.ts` (Pass).

---

### Phase 2: Sleek Circular Progress Loader UI & Animation (PARALLEL EXECUTION)

#### Step 2.1: Radial Circular Progress Loader Component (Parallel Branch A)
- **Goal**: Construct `CircularProgressLoader.tsx` and `CircularProgressLoader.css`.
- **Target Files**: `src/components/Controls/CircularProgressLoader.tsx`, `src/components/Controls/CircularProgressLoader.css`, `src/components/Controls/CircularProgressLoader.test.tsx`.
- **Technical Directives**:
  - Implement SVG radial ring with customizable `size` (default 120px) and `strokeWidth` (default 8px).
  - Calculate `strokeDashoffset` dynamically based on `percent` (0% to 100%).
  - Render linear color gradient (`#1f6beb` to `#3fb950`) and centered percentage text.
- **Verification Gate**: `bun test src/components/Controls/CircularProgressLoader.test.tsx` (Pass).

#### Step 2.2: 60 FPS Micro-Tick Progress Interpolator Hook (Parallel Branch B)
- **Goal**: Construct `useSmoothProgress.ts` hook.
- **Target Files**: `src/components/Controls/useSmoothProgress.ts`, `src/components/Controls/useSmoothProgress.test.ts`.
- **Technical Directives**:
  - Implement `requestAnimationFrame` interpolator moving `displayPercent` smoothly toward `targetPercent`.
  - Guarantee minimum step duration (150ms) per phase so percentage increments smoothly (`1% -> 2% -> ... -> 100%`) without abrupt jumps.
- **Verification Gate**: `bun test src/components/Controls/useSmoothProgress.test.ts` (Pass).

---

### Phase 3: Integration, WebWorker Streaming & Canvas Unmount

#### Step 3.1: Embedded Loading Overlay & WebWorker Event Streaming
- **Goal**: Embed `CircularProgressLoader` inside `LoadingOverlay.tsx` and connect real-time WebWorker progress events in `customLayoutWorker.ts`.
- **Target Files**: `src/components/Controls/LoadingOverlay.tsx`, `src/engine/layout/custom/customLayoutWorker.ts`, `src/engine/layout/custom/customLayoutWorkerClient.ts`.
- **Technical Directives**:
  - Update `customLayoutWorker.ts` to post messages for all 5 stages.
  - Connect progress event listener in `customLayoutWorkerClient.ts`.
  - Update `LoadingOverlay.tsx` to render `CircularProgressLoader`, stage title, progress track, phase checkmarks, and node/edge metrics.
- **Edge Cases Addressed**: EC-05 (worker unavailable fallback), EC-10 (rapid mode switching).
- **Verification Gate**: `bun test src/components/Controls/LoadingOverlay.test.tsx` (Pass).

#### Step 3.2: Multi-Mode GraphCanvas Integration & Immediate Unmount
- **Goal**: Update `GraphCanvas/index.tsx` effect logic for all 4 layout modes with mode-isolated storage caching and immediate unmount on cache miss.
- **Target Files**: `src/engine/GraphCanvas/index.tsx`, `src/engine/GraphCanvas/GraphCanvasIntegration.test.tsx`.
- **Technical Directives**:
  - Check `loadStoredLayout(layoutMode, signature)`. If hit, set graph state immediately (0ms).
  - On miss: Call `setPositionedGraph([], [])` immediately to unmount old canvas elements, set `isCalculating = true`, and spawn calculation.
  - On complete: Save layout to mode-isolated storage, update graph store, and set `isCalculating = false`.
- **Edge Cases Addressed**: EC-02 (stale ghosting), EC-03 (cancellation race), EC-08 (resize rescale).
- **Verification Gate**: `bun test src/engine/GraphCanvas/GraphCanvasIntegration.test.tsx` (Pass).

---

### Phase 4: TanStack Router Full Page & Dataset Routing

#### Step 4.1: TanStack Router Tree & Navigation Hookup
- **Goal**: Fully integrate `@tanstack/react-router` across the application.
- **Target Files**: `src/routes/router.tsx`, `src/App.tsx`, `src/AppContent.tsx`, `src/components/Sidebar/index.tsx`, `src/components/CommandPalette/index.tsx`, `src/routes/router.test.tsx`.
- **Technical Directives**:
  - Define root route, `/` (redirects to `/graphs/ai_agent_trace.json`), `/graphs/$fileId` (with search param `node`), and `/testing`.
  - Update `Sidebar/index.tsx` and `CommandPalette/index.tsx` to use `useNavigate()` from `@tanstack/react-router`.
- **Edge Cases Addressed**: EC-09 (invalid URL parameters).
- **Verification Gate**: `bun test src/routes/router.test.tsx` (Pass).

---

### Phase 5: Comprehensive Quality Gate Audit & Final Non-Regression Verification

#### Step 5.1: Typecheck, Lint, Build & Full Test Suite Audit
- **Goal**: Run complete quality gate audit across all 154 files.
- **Directives**:
  - `bun run typecheck` (0 errors)
  - `bun run lint` (0 warnings, 0 errors)
  - `bun run build:local` (0 warnings, 0 errors, <250ms build time)
  - `bun test --timeout 10000` (100% pass across all test files)
