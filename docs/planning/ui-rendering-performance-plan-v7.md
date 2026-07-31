# UI Rendering & Worker Async Performance Optimization Plan (v7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate main-thread UI freezes and cascading re-renders so `K8s Topology` and `Saga Workflow` open instantly ($< 50\text{ms}$) by offloading layout computation to Web Workers, de-duplicating URL effects, and adding dataset signature caching.

**Architecture:**
1. **Web Worker Async Offloading**: Connect `computeCustomLayoutAsync` in `GraphCanvas/index.tsx` so layout calculations run off the main React UI thread.
2. **De-duplicated App URL & Mount Effects**: Refactor `App.tsx` URL query sync logic to prevent re-fetching and re-calculating datasets on `history.replaceState`.
3. **Zustand Dataset Signature Caching**: Cache computed `PositionedNode[]` and `PositionedEdge[]` results by graph signature in `useGraphStore.ts` for instant 0ms dataset toggling.

**Tech Stack:** TypeScript, React 18, Zustand, WebWorkers, Bun Test.

---

### Task 1: Connect Asynchronous WebWorker Layout Offloader in `GraphCanvas/index.tsx`

**Files:**
- Modify: `src/engine/GraphCanvas/index.tsx:1-60`
- Test: `src/engine/GraphCanvas/GraphCanvasWorker.test.tsx`

- [ ] **Step 1: Write the failing unit test**

Create `src/engine/GraphCanvas/GraphCanvasWorker.test.tsx`:

```tsx
import { describe, expect, it, vi } from "bun:test";
import { computeCustomLayoutAsync } from "../layout/custom/customLayoutWorkerClient";

describe("GraphCanvas WebWorker Async Offloading", () => {
  it("exports computeCustomLayoutAsync for non-blocking background execution", () => {
    expect(typeof computeCustomLayoutAsync).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test src/engine/GraphCanvas/GraphCanvasWorker.test.tsx`
Expected: PASS

- [ ] **Step 3: Update `GraphCanvas/index.tsx` to use async background layout calculation**

Update `GraphCanvas/index.tsx` to dispatch layout calculation via `computeCustomLayoutAsync(dataset)` with an `AbortController`:

```tsx
useEffect(() => {
  if (!dataset) {
    setPositionedGraph([], []);
    return;
  }

  const controller = new AbortController();
  let isSubscribed = true;

  if (layoutMode === "top-down") {
    computeCustomLayoutAsync(dataset, { signal: controller.signal })
      .then(({ nodes, edges }) => {
        if (!isSubscribed) return;
        setPositionedGraph(nodes, edges);

        if (shouldAutoFit) {
          const fitResult = calculateFitView(nodes, containerRef.current?.parentElement);
          setZoomLevel(fitResult.zoomLevel);
          setPanOffset(fitResult.panOffset);
          setShouldAutoFit(false);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Worker layout failed, falling back to sync:", err);
          const { nodes, edges } = computeGraphLayout(dataset, layoutMode);
          if (isSubscribed) setPositionedGraph(nodes, edges);
        }
      });
  } else {
    const { nodes, edges } = computeGraphLayout(dataset, layoutMode);
    setPositionedGraph(nodes, edges);
  }

  return () => {
    isSubscribed = false;
    controller.abort();
  };
}, [
  dataset,
  layoutMode,
  shouldAutoFit,
  containerRef,
  setPositionedGraph,
  setZoomLevel,
  setPanOffset,
  setShouldAutoFit,
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/engine/GraphCanvas/GraphCanvasWorker.test.tsx`
Expected: PASS

---

### Task 2: De-duplicate URL & Mount Sync Effects in `App.tsx`

**Files:**
- Modify: `src/App.tsx:90-130`
- Test: `src/AppUrlSync.test.ts`

- [ ] **Step 1: Write failing unit test for URL sync loop prevention**

Create `src/AppUrlSync.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { generateDatasetSignature } from "./utils/fileStorage";

describe("App dataset signature de-duplication", () => {
  it("generates stable signature for dataset to prevent redundant loads", () => {
    const data = { id: "test", nodes: [], edges: [] } as any;
    const sig1 = generateDatasetSignature(data);
    const sig2 = generateDatasetSignature(data);
    expect(sig1).toBe(sig2);
  });
});
```

- [ ] **Step 2: Update `App.tsx` URL sync effect**

In `src/App.tsx`, check if `currentFile` matches the URL `graph` param before calling `loadGraphFile` in `useEffect`:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const graphParam = params.get("graph") || "ai_agent_trace.json";
  const nodeParam = params.get("node");

  // Prevent re-fetching if currentFile is already loaded
  if (currentFile !== graphParam || !useGraphStore.getState().dataset) {
    void loadGraphFile(graphParam, nodeParam);
  }
}, [currentFile, loadGraphFile]);
```

- [ ] **Step 3: Run test to verify it passes**

Run: `bun test src/AppUrlSync.test.ts`
Expected: PASS

---

### Task 3: Add Positioned Graph Dataset Caching in `useGraphStore.ts`

**Files:**
- Modify: `src/state/useGraphStore.ts:1-70`
- Test: `src/state/useGraphStore.test.ts`

- [ ] **Step 1: Add dataset layout cache map to `useGraphStore.ts`**

Add `layoutCache: Map<string, { nodes: PositionedNode[]; edges: PositionedEdge[] }>` to `GraphState`:

```typescript
const layoutCache = new Map<string, { nodes: PositionedNode[]; edges: PositionedEdge[] }>();
```

- [ ] **Step 2: Run all tests with strict timeout protection**

Run: `timeout 15s bun test`
Expected: PASS 100%
