# Design Spec: TanStack Router & Micro-Interpolated Stage Loader (v9)

**Date**: 2026-07-31  
**Target File**: `docs/superpowers/specs/2026-07-31-tanstack-router-and-loader-progression-design.md`

---

## 1. Overview & Objectives

This specification outlines the architecture for integrating **TanStack Router (`@tanstack/react-router`)** for type-safe routing across all pages and datasets, and enhancing the **Stage Loader Component** with WebWorker progress event streaming and micro-tick percentage interpolation.

### Primary Goals
1. **Type-Safe Page & Dataset Routing**: Replace custom `window.history.replaceState` and manual URL query string parsing with `@tanstack/react-router`.
   - `/` $\rightarrow$ Index Route (redirects to `/graphs/ai_agent_trace.json`).
   - `/graphs/$fileId` $\rightarrow$ Graph Viewer for `$fileId` with search param `nodeId`.
   - `/testing` $\rightarrow$ Graph Testing Playground.
2. **5-Step Visual Stage Stepper**: Render 5 distinct stage badges in `LoadingOverlay.tsx`:
   - `[1] Topology` $\rightarrow$ `[2] Ranking` $\rightarrow$ `[3] A* Routing` $\rightarrow$ `[4] Crossings` $\rightarrow$ `[5] Render`.
3. **Micro-Tick Smooth Percentage Interpolation**: Use `requestAnimationFrame` micro-tick interpolation so loading percentage counts up smoothly (`1% -> 2% -> ... -> 100%`) without abrupt 20% jumps or stalling.
4. **WebWorker Real-Time Progress Streaming**: Worker sends real-time `onmessage` progress messages `{ stageIndex, totalStages, percent, stageText, detail }` during layout execution.

---

## 2. Architecture & Subsystems

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TanStack Router Tree                               │
│  /                                                                          │
│  ├── /graphs/$fileId  (Graph Canvas Viewer with ?nodeId=...)                 │
│  └── /testing         (Graph Testing Playground)                            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Route Change (File Select)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Graph File Loader & Storage Cache                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Cache Miss
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Micro-Interpolated Stage Loader                        │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  [✓] 1. Topology  [✓] 2. Ranking  [⟳] 3. A* Routing (55%)  [ ] 4. Badges  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Worker Progress Streaming
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WebWorker Layout Execution Engine                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component & Routing Specifications

### A. TanStack Router Setup (`src/routes/router.tsx`)
- **Package**: `@tanstack/react-router`
- **Route Tree**:
  - `rootRoute`: Top layout containing `<CommandPalette>`, `<Sidebar>`, `<SearchHeader>`, and `<Outlet>`.
  - `indexRoute`: Path `/` $\rightarrow$ Redirects to `/graphs/ai_agent_trace.json`.
  - `graphRoute`: Path `/graphs/$fileId` $\rightarrow$ Renders `<GraphCanvas>` with search param `nodeId?: string`.
  - `testingRoute`: Path `/testing` $\rightarrow$ Renders `<GraphTestingPage>`.
- **Navigation Integration**:
  - `Sidebar/index.tsx`: Replaces manual onClick with TanStack `<Link to="/graphs/$fileId" params={{ fileId }}>`.
  - `CommandPalette/index.tsx`: Uses `navigate({ to: "/graphs/$fileId", search: { nodeId } })`.

### B. Micro-Interpolated Progress Hook (`src/components/Controls/useSmoothProgress.ts`)
- Custom React hook `useSmoothProgress(targetPercent, isCalculating)`:
  - Interpolates current display percentage toward `targetPercent` at 60 FPS via `requestAnimationFrame`.
  - Guarantees minimum step durations (e.g. 150ms per stage) so every stage is visibly displayed and never skipped.

### C. 5-Step Visual Stepper Overlay (`src/components/Controls/LoadingOverlay.tsx`)
- Displays 5 step chips:
  1. `Topology` (0–20%)
  2. `Ranking` (20–40%)
  3. `A* Routing` (40–70%)
  4. `Crossings` (70–90%)
  5. `Render` (90–100%)
- Completed steps display checkmark badges (`✓`), active step pulses blue/green with percentage, upcoming steps are dimmed.

### D. Worker Event Streaming (`src/engine/layout/custom/customLayoutWorker.ts`)
- Worker posts `self.postMessage({ type: "progress", stageIndex, totalStages, percent, stageText, detail })` at each internal optimizer boundary:
  - Stage 1: `normalizeGraph`
  - Stage 2: `barycentricOrder` & `coordinateAssignment`
  - Stage 3: `routeOrthogonalEdges` A* loop
  - Stage 4: `placeEdgeBadges` & crossing minimization
  - Stage 5: Final geometry packaging

---

## 4. Verification & Testing Criteria
1. **TanStack Router Test**: Unit test route resolution and navigation between `/graphs/$fileId` and `/testing`.
2. **Smooth Progress Hook Test**: Unit test `useSmoothProgress` interpolating numbers smoothly up to 100%.
3. **Stage Stepper UI Test**: Assert rendering of all 5 step chips in `LoadingOverlay.test.tsx`.
4. **Quality Gates**: `bun run typecheck` (0 errors), `bun run lint` (0 errors), `bun test --timeout 10000` (100% pass).
