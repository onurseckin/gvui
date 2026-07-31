# Comprehensive Layout Engine, Multi-Mode Support, Circular Progress Loader & TanStack Router Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore 100% functionality to all 4 graph layout modes (`top-down`, `left-right`, `force`, `radial`), implement a sleek circular radial progress loader with live percentage filling, isolate layout caching by `(layoutMode, datasetSignature)`, and enforce a robust multi-agent TDD workflow.

**Architecture:**
- **Layout Storage Cache Isolation**: Cache key formatted as `gvui_layout_cache_v2_${layoutMode}_${datasetSignature}`. Ensures `left-right`, `force`, and `radial` layouts are cached independently of `top-down`.
- **Layout Dispatcher & Worker Support**: All 4 layout engines (`top-down`, `left-right`, `force`, `radial`) execute asynchronously with progress events and fallbacks.
- **Sleek Circular Progress Loader (`CircularProgressLoader.tsx`)**: SVG-based radial progress ring with animated stroke-dashoffset, glowing gradient fill, phase step badges, and centered live percentage text.
- **TanStack Router Full Coverage**: Type-safe navigation across dataset switching, search params (`node`), layout mode toggles, and testing playground with zero state loops.

**Tech Stack:** TypeScript, React 18, TanStack Router (`@tanstack/react-router`), SVG Filters, Web Workers, Bun Test.

---

### Detailed File Map & Module Breakdown

```
src/
├── utils/
│   ├── layoutCacheStorage.ts                # Isolated cache key: gvui_layout_cache_v2_${layoutMode}_${signature}
│   └── layoutCacheStorage.test.ts           # Storage cache tests across all 4 layout modes
├── components/
│   └── Controls/
│       ├── CircularProgressLoader.tsx       # SVG radial progress ring with centered live percentage
│       ├── CircularProgressLoader.css       # Glow filters and radial ring animations
│       ├── CircularProgressLoader.test.tsx  # Unit tests for circular loader
│       ├── LoadingOverlay.tsx               # Wrapper modal incorporating CircularProgressLoader & 5-step chips
│       └── useSmoothProgress.ts             # 60 FPS micro-tick interpolator
├── engine/
│   ├── layout/
│   │   ├── layoutDispatcher.ts              # Multi-mode layout calculation dispatcher
│   │   ├── customLayoutAdapter.ts           # Custom top-down & async worker adapter
│   │   └── nodeDimensions.ts                # Dagre LR & node dimension calculator
│   └── GraphCanvas/
│       ├── index.tsx                        # Multi-mode canvas renderer & loader trigger
│       └── GraphCanvasIntegration.test.tsx   # Multi-mode integration tests
└── routes/
    ├── router.tsx                           # TanStack Router configuration
    └── router.test.tsx                      # Type-safe router navigation tests
```

---

## Phase 1: Layout Cache Key Isolation & Multi-Mode Engine Repair

### Task 1: Update Storage Cache Utility to Isolate by `layoutMode`

**Files:**
- Modify: `src/utils/layoutCacheStorage.ts:1-60`
- Test: `src/utils/layoutCacheStorage.test.ts`

- [ ] **Step 1: Write failing unit test for mode-isolated layout caching**

Update `src/utils/layoutCacheStorage.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "bun:test";
import { loadStoredLayout, saveStoredLayout, clearStoredLayoutCache } from "./layoutCacheStorage";
import type { PositionedNode, PositionedEdge } from "../types/graphData";

describe("layoutCacheStorage mode isolation", () => {
  beforeEach(() => {
    clearStoredLayoutCache();
  });

  it("stores and retrieves distinct layouts for top-down vs left-right vs force vs radial", () => {
    const signature = "sig_graph_alpha";
    const topDownNodes: PositionedNode[] = [{ id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 }];
    const leftRightNodes: PositionedNode[] = [{ id: "n1", name: "Node 1", x: 200, y: 50, width: 100, height: 50 }];

    saveStoredLayout("top-down", signature, { nodes: topDownNodes, edges: [] });
    saveStoredLayout("left-right", signature, { nodes: leftRightNodes, edges: [] });

    const cachedTopDown = loadStoredLayout("top-down", signature);
    const cachedLeftRight = loadStoredLayout("left-right", signature);
    const cachedForce = loadStoredLayout("force", signature);

    expect(cachedTopDown?.nodes[0].x).toBe(10);
    expect(cachedLeftRight?.nodes[0].x).toBe(200);
    expect(cachedForce).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test --timeout 5000 src/utils/layoutCacheStorage.test.ts`
Expected: FAIL ("loadStoredLayout expects mode argument")

- [ ] **Step 3: Update `src/utils/layoutCacheStorage.ts` implementation**

```typescript
import type { LayoutMode } from "../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../types/graphData";

const CACHE_PREFIX_V2 = "gvui_layout_cache_v2_";

export interface StoredLayoutPayload {
  mode: LayoutMode;
  signature: string;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  timestamp: number;
}

export function loadStoredLayout(
  mode: LayoutMode,
  signature: string,
): { nodes: PositionedNode[]; edges: PositionedEdge[] } | null {
  if (typeof window === "undefined" || !signature) return null;
  const storage = typeof localStorage !== "undefined" ? localStorage : (globalThis as any).localStorage;
  if (!storage) return null;

  try {
    const key = `${CACHE_PREFIX_V2}${mode}_${signature}`;
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLayoutPayload;
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch (err) {
    console.warn("Failed to load stored layout cache:", err);
    return null;
  }
}

export function saveStoredLayout(
  mode: LayoutMode,
  signature: string,
  layout: { nodes: PositionedNode[]; edges: PositionedEdge[] },
): void {
  if (typeof window === "undefined" || !signature) return;
  const storage = typeof localStorage !== "undefined" ? localStorage : (globalThis as any).localStorage;
  if (!storage) return;

  try {
    const key = `${CACHE_PREFIX_V2}${mode}_${signature}`;
    const payload: StoredLayoutPayload = {
      mode,
      signature,
      nodes: layout.nodes,
      edges: layout.edges,
      timestamp: Date.now(),
    };
    storage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to save layout to localStorage:", err);
  }
}

export function clearStoredLayoutCache(): void {
  const storage = typeof localStorage !== "undefined" ? localStorage : (globalThis as any).localStorage;
  if (!storage) return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(CACHE_PREFIX_V2)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
  } catch (err) {
    console.warn("Failed to clear layout cache:", err);
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun test --timeout 5000 src/utils/layoutCacheStorage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/layoutCacheStorage.ts src/utils/layoutCacheStorage.test.ts
git commit -m "fix: isolate persistent layout storage cache keys by layoutMode"
```

---

### Task 2: Verify & Handoff All 4 Layout Modes in `layoutDispatcher.ts`

**Files:**
- Modify: `src/engine/layout/layoutDispatcher.ts`
- Test: `src/engine/layout/layoutDispatcher.test.ts`

- [ ] **Step 1: Write failing test for all 4 layout modes**

Create `src/engine/layout/layoutDispatcher.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { computeGraphLayout } from "./layoutDispatcher";
import type { GraphDataset } from "../../types/graphData";

describe("layoutDispatcher all 4 modes", () => {
  const sampleDataset: GraphDataset = {
    id: "sample",
    nodes: [
      { id: "A", name: "Node A" },
      { id: "B", name: "Node B" },
    ],
    edges: [{ id: "e1", source: "A", target: "B" }],
  };

  it("computes non-empty positioned graph for top-down", () => {
    const res = computeGraphLayout(sampleDataset, "top-down");
    expect(res.nodes).toHaveLength(2);
    expect(res.edges).toHaveLength(1);
  });

  it("computes non-empty positioned graph for left-right", () => {
    const res = computeGraphLayout(sampleDataset, "left-right");
    expect(res.nodes).toHaveLength(2);
    expect(res.edges).toHaveLength(1);
    expect(res.nodes[1].x).toBeGreaterThan(res.nodes[0].x);
  });

  it("computes non-empty positioned graph for force", () => {
    const res = computeGraphLayout(sampleDataset, "force");
    expect(res.nodes).toHaveLength(2);
    expect(res.edges).toHaveLength(1);
  });

  it("computes non-empty positioned graph for radial", () => {
    const res = computeGraphLayout(sampleDataset, "radial");
    expect(res.nodes).toHaveLength(2);
    expect(res.edges).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test --timeout 5000 src/engine/layout/layoutDispatcher.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/engine/layout/layoutDispatcher.test.ts
git commit -m "test: add test suite verifying all 4 layout modes in layoutDispatcher"
```

---

## Phase 2: Minimalist Sleek Circular Progress Loader

### Task 3: Build `CircularProgressLoader.tsx` Component

**Files:**
- Create: `src/components/Controls/CircularProgressLoader.tsx`
- Create: `src/components/Controls/CircularProgressLoader.css`
- Test: `src/components/Controls/CircularProgressLoader.test.tsx`

- [ ] **Step 1: Write failing test for `CircularProgressLoader`**

Create `src/components/Controls/CircularProgressLoader.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { CircularProgressLoader } from "./CircularProgressLoader";

describe("CircularProgressLoader Component", () => {
  it("renders SVG radial ring with live percentage display", () => {
    const html = renderToString(<CircularProgressLoader percent={45} size={120} strokeWidth={10} />);
    expect(html).toContain("45%");
    expect(html).toContain("svg");
    expect(html).toContain("circle");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test --timeout 5000 src/components/Controls/CircularProgressLoader.test.tsx`
Expected: FAIL ("Cannot find module ./CircularProgressLoader")

- [ ] **Step 3: Create `CircularProgressLoader.css` and `CircularProgressLoader.tsx`**

Create `src/components/Controls/CircularProgressLoader.css`:

```css
.circular-loader-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.circular-loader-svg {
  transform: rotate(-90deg);
}

.circular-loader-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
}

.circular-loader-fg {
  fill: none;
  stroke: url(#loaderGradient);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.15s ease-out;
}

.circular-loader-center {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.circular-loader-percent {
  font-size: 24px;
  font-weight: 800;
  font-family: ui-monospace, SFMono-Regular, SF Pro Display, sans-serif;
  background: linear-gradient(135deg, #58a6ff 0%, #3fb950 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

Create `src/components/Controls/CircularProgressLoader.tsx`:

```tsx
import type { FC } from "react";
import "./CircularProgressLoader.css";

export interface CircularProgressLoaderProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
}

export const CircularProgressLoader: FC<CircularProgressLoaderProps> = ({
  percent,
  size = 120,
  strokeWidth = 10,
}) => {
  const safePercent = Math.min(100, Math.max(0, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safePercent / 100) * circumference;

  return (
    <div className="circular-loader-wrapper" style={{ width: size, height: size }}>
      <svg className="circular-loader-svg" width={size} height={size}>
        <defs>
          <linearGradient id="loaderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1f6beb" />
            <stop offset="100%" stopColor="#3fb950" />
          </linearGradient>
        </defs>
        <circle
          className="circular-loader-bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="circular-loader-fg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="circular-loader-center">
        <span className="circular-loader-percent">{Math.round(safePercent)}%</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun test --timeout 5000 src/components/Controls/CircularProgressLoader.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Controls/CircularProgressLoader.tsx src/components/Controls/CircularProgressLoader.css src/components/Controls/CircularProgressLoader.test.tsx
git commit -m "feat: add minimalist sleek CircularProgressLoader component"
```

---

### Task 4: Integrate `CircularProgressLoader` into `LoadingOverlay.tsx`

**Files:**
- Modify: `src/components/Controls/LoadingOverlay.tsx`
- Test: `src/components/Controls/LoadingOverlay.test.tsx`

- [ ] **Step 1: Update `LoadingOverlay.tsx` to include `CircularProgressLoader`**

Update `src/components/Controls/LoadingOverlay.tsx`:

```tsx
import type { FC } from "react";
import { CircularProgressLoader } from "./CircularProgressLoader";
import "./LoadingOverlay.css";

export interface LoadingOverlayProps {
  percent: number;
  stageText: string;
  detail: string;
  nodeCount?: number;
  edgeCount?: number;
}

const STAGES = [
  { id: 1, label: "Topology", range: [0, 20] },
  { id: 2, label: "Ranking", range: [20, 40] },
  { id: 3, label: "A* Routing", range: [40, 70] },
  { id: 4, label: "Crossings", range: [70, 90] },
  { id: 5, label: "Render", range: [90, 100] },
];

export const LoadingOverlay: FC<LoadingOverlayProps> = ({
  percent,
  stageText,
  detail,
  nodeCount,
  edgeCount,
}) => {
  const safePercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="loading-overlay-backdrop">
      <div className="loading-overlay-card">
        <div className="loading-overlay-top-ring">
          <CircularProgressLoader percent={safePercent} size={110} strokeWidth={8} />
        </div>

        <div className="loading-overlay-header">
          <span className="loading-overlay-title">{stageText}</span>
        </div>

        <div className="loading-stepper-container">
          {STAGES.map((s) => {
            const isDone = safePercent >= s.range[1];
            const isActive = safePercent >= s.range[0] && safePercent < s.range[1];

            let badgeClass = "loading-step-chip";
            if (isDone) badgeClass += " is-done";
            else if (isActive) badgeClass += " is-active";

            return (
              <div key={s.id} className={badgeClass}>
                {isDone ? <span className="step-icon">✓</span> : <span className="step-icon">{s.id}</span>}
                <span className="step-label">{s.label}</span>
              </div>
            );
          })}
        </div>

        <div className="loading-overlay-detail">{detail}</div>

        {(nodeCount !== undefined || edgeCount !== undefined) && (
          <div className="loading-overlay-meta">
            {nodeCount !== undefined && <span>{nodeCount} Nodes</span>}
            {nodeCount !== undefined && edgeCount !== undefined && <span>•</span>}
            {edgeCount !== undefined && <span>{edgeCount} Edges</span>}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Run test to verify pass**

Run: `bun test --timeout 5000 src/components/Controls/LoadingOverlay.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/Controls/LoadingOverlay.tsx
git commit -m "feat: embed CircularProgressLoader inside LoadingOverlay modal"
```

---

## Phase 3: Canvas Multi-Mode Integration & Full Verification

### Task 5: Update `GraphCanvas/index.tsx` for All 4 Layout Modes & Caching

**Files:**
- Modify: `src/engine/GraphCanvas/index.tsx:40-100`
- Test: `src/engine/GraphCanvas/GraphCanvasIntegration.test.tsx`

- [ ] **Step 1: Update `GraphCanvas/index.tsx` to handle all 4 layout modes with mode-isolated caching**

Update effect logic in `src/engine/GraphCanvas/index.tsx`:

```tsx
  useEffect(() => {
    if (!dataset) {
      setPositionedGraph([], []);
      setIsCalculating(false);
      return;
    }

    const signature = generateDatasetSignature(dataset);
    const stored = loadStoredLayout(layoutMode, signature);

    if (stored) {
      setPositionedGraph(stored.nodes, stored.edges);
      if (shouldAutoFit) {
        const fitResult = calculateFitView(stored.nodes, containerRef.current?.parentElement);
        setZoomLevel(fitResult.zoomLevel);
        setPanOffset(fitResult.panOffset);
        setShouldAutoFit(false);
      }
      setIsCalculating(false);
      return;
    }

    // Immediate unmount of old canvas elements on cache miss
    setPositionedGraph([], []);
    setIsCalculating(true);
    setProgressState(deriveProgressState(1, 5, "Normalizing topology..."));

    const controller = new AbortController();
    let isSubscribed = true;

    if (layoutMode === "top-down") {
      setProgressState(deriveProgressState(2, 5, "Building hierarchy tree..."));

      computeCustomEngineGraphLayoutAsync(dataset, { signal: controller.signal })
        .then(({ nodes, edges }) => {
          if (!isSubscribed) return;
          setProgressState(deriveProgressState(4, 5, "Computing A* routes..."));
          saveStoredLayout("top-down", signature, { nodes, edges });
          setPositionedGraph(nodes, edges);
          if (shouldAutoFit) {
            const fitResult = calculateFitView(nodes, containerRef.current?.parentElement);
            setZoomLevel(fitResult.zoomLevel);
            setPanOffset(fitResult.panOffset);
            setShouldAutoFit(false);
          }
          setProgressState(deriveProgressState(5, 5, "Finalizing layout..."));
          setIsCalculating(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            const { nodes, edges } = computeGraphLayout(dataset, layoutMode);
            if (isSubscribed) {
              saveStoredLayout(layoutMode, signature, { nodes, edges });
              setPositionedGraph(nodes, edges);
              if (shouldAutoFit) {
                const fitResult = calculateFitView(nodes, containerRef.current?.parentElement);
                setZoomLevel(fitResult.zoomLevel);
                setPanOffset(fitResult.panOffset);
                setShouldAutoFit(false);
              }
              setIsCalculating(false);
            }
          }
        });
    } else {
      setProgressState(deriveProgressState(3, 5, `Computing ${layoutMode} layout...`));
      const { nodes, edges } = computeGraphLayout(dataset, layoutMode);
      if (isSubscribed) {
        saveStoredLayout(layoutMode, signature, { nodes, edges });
        setPositionedGraph(nodes, edges);
        if (shouldAutoFit) {
          const fitResult = calculateFitView(nodes, containerRef.current?.parentElement);
          setZoomLevel(fitResult.zoomLevel);
          setPanOffset(fitResult.panOffset);
          setShouldAutoFit(false);
        }
        setProgressState(deriveProgressState(5, 5, "Finalizing layout..."));
        setIsCalculating(false);
      }
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

- [ ] **Step 2: Run full quality gate check**

Run: `bun run typecheck && bun run lint && bun run build:local`
Expected: 0 errors!

- [ ] **Step 3: Run full unit test suite**

Run: `bun test --timeout 10000`
Expected: 100% PASS across all 54 test files.

- [ ] **Step 4: Commit and Push**

```bash
git add src/engine/GraphCanvas/index.tsx
git commit -m "fix: enable all 4 layout modes with mode-isolated storage caching in GraphCanvas"
git push origin main
```
