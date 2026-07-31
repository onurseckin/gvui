# Persistent Layout Caching, Multi-Worker Pool, and Progress UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate visual ghosting, enable instant 0ms dataset switching via persistent signature-based storage caching, and display a real-time progress screen (0%–100%) during background WebWorker computations.

**Architecture:**
- `src/utils/layoutCacheStorage.ts`: Persists precomputed `PositionedNode[]` and `PositionedEdge[]` layouts to `localStorage` indexed by graph dataset signature.
- `src/engine/layout/custom/customLayoutWorkerPool.ts`: Manages a hardware multi-core Web Worker pool that streams granular progress updates (`percent`, `stage`, `detail`).
- `src/components/Controls/LoadingOverlay.tsx`: Displays a visual glassmorphic loading overlay on the canvas.
- `src/engine/GraphCanvas/index.tsx`: Integrates immediate unmounting on dataset change, storage cache lookups, and progress overlay mounting.

**Tech Stack:** TypeScript, React 18, Zustand, Web Workers, Bun Test, CSS3.

---

### File Structure & Dependencies

```
src/
├── utils/
│   ├── layoutCacheStorage.ts          # Storage cache get/set helpers
│   └── layoutCacheStorage.test.ts     # Unit tests for storage cache
├── engine/
│   ├── layout/custom/
│   │   ├── customLayoutWorkerPool.ts  # WebWorker pool & progress emitter
│   │   └── customLayoutWorkerPool.test.ts # Unit tests for worker pool
│   └── GraphCanvas/
│       ├── index.tsx                  # Canvas unmount & worker integration
│       └── GraphCanvasIntegration.test.tsx # Integration tests
└── components/
    └── Controls/
        ├── LoadingOverlay.tsx         # Glassmorphic progress modal
        ├── LoadingOverlay.css         # Progress bar styles
        └── LoadingOverlay.test.tsx    # Unit test for LoadingOverlay
```

---

### Task 1: Persistent Layout Cache Utility

**Files:**
- Create: `src/utils/layoutCacheStorage.ts`
- Test: `src/utils/layoutCacheStorage.test.ts`

- [ ] **Step 1: Write failing unit test for layout cache storage**

Create `src/utils/layoutCacheStorage.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "bun:test";
import { loadStoredLayout, saveStoredLayout, clearStoredLayoutCache } from "./layoutCacheStorage";
import type { PositionedNode, PositionedEdge } from "../types/graphData";

describe("layoutCacheStorage", () => {
  beforeEach(() => {
    clearStoredLayoutCache();
  });

  it("returns null on cache miss", () => {
    const result = loadStoredLayout("unknown_sig");
    expect(result).toBeNull();
  });

  it("saves and retrieves precomputed graph layout by signature", () => {
    const signature = "sig_12345";
    const nodes: PositionedNode[] = [{ id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 }];
    const edges: PositionedEdge[] = [{ id: "e1", source: "n1", target: "n1", path: "M 10 20 L 30 40" }];

    saveStoredLayout(signature, { nodes, edges });
    const cached = loadStoredLayout(signature);

    expect(cached).not.toBeNull();
    expect(cached?.nodes).toEqual(nodes);
    expect(cached?.edges).toEqual(edges);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --timeout 5000 src/utils/layoutCacheStorage.test.ts`
Expected: FAIL ("Cannot find module ./layoutCacheStorage")

- [ ] **Step 3: Write implementation**

Create `src/utils/layoutCacheStorage.ts`:

```typescript
import type { PositionedEdge, PositionedNode } from "../types/graphData";

const CACHE_PREFIX = "gvui_layout_cache_v1_";

export interface StoredLayoutPayload {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  timestamp: number;
}

export function loadStoredLayout(signature: string): { nodes: PositionedNode[]; edges: PositionedEdge[] } | null {
  if (typeof window === "undefined" || !window.localStorage || !signature) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${signature}`);
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
  signature: string,
  layout: { nodes: PositionedNode[]; edges: PositionedEdge[] },
): void {
  if (typeof window === "undefined" || !window.localStorage || !signature) {
    return;
  }

  try {
    const payload: StoredLayoutPayload = {
      nodes: layout.nodes,
      edges: layout.edges,
      timestamp: Date.now(),
    };
    window.localStorage.setItem(`${CACHE_PREFIX}${signature}`, JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to save layout to localStorage:", err);
  }
}

export function clearStoredLayoutCache(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn("Failed to clear layout cache:", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --timeout 5000 src/utils/layoutCacheStorage.test.ts`
Expected: PASS (2 passes)

- [ ] **Step 5: Commit**

```bash
git add src/utils/layoutCacheStorage.ts src/utils/layoutCacheStorage.test.ts
git commit -m "feat: add persistent signature-based layout cache storage utility"
```

---

### Task 2: Worker Pool & Granular Progress Emitter

**Files:**
- Create: `src/engine/layout/custom/customLayoutWorkerPool.ts`
- Test: `src/engine/layout/custom/customLayoutWorkerPool.test.ts`

- [ ] **Step 1: Write failing unit test for Worker Pool progress updates**

Create `src/engine/layout/custom/customLayoutWorkerPool.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { deriveProgressState } from "./customLayoutWorkerPool";

describe("customLayoutWorkerPool progress emitter", () => {
  it("computes accurate stage percentages and status descriptions", () => {
    const p1 = deriveProgressState(1, 5, "Parsing nodes");
    expect(p1.percent).toBe(20);
    expect(p1.stageText).toContain("Stage 1 of 5");

    const p5 = deriveProgressState(5, 5, "Finalizing SVG paths");
    expect(p5.percent).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --timeout 5000 src/engine/layout/custom/customLayoutWorkerPool.test.ts`
Expected: FAIL ("Cannot find module ./customLayoutWorkerPool")

- [ ] **Step 3: Write implementation**

Create `src/engine/layout/custom/customLayoutWorkerPool.ts`:

```typescript
export interface LayoutProgressInfo {
  stageIndex: number;
  totalStages: number;
  percent: number;
  stageText: string;
  detail: string;
}

export function deriveProgressState(
  stageIndex: number,
  totalStages: number,
  detail: string,
): LayoutProgressInfo {
  const safeTotal = Math.max(1, totalStages);
  const safeStage = Math.min(Math.max(1, stageIndex), safeTotal);
  const percent = Math.round((safeStage / safeTotal) * 100);
  const stageText = `Stage ${safeStage} of ${safeTotal}`;

  return {
    stageIndex: safeStage,
    totalStages: safeTotal,
    percent,
    stageText,
    detail,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --timeout 5000 src/engine/layout/custom/customLayoutWorkerPool.test.ts`
Expected: PASS (1 pass)

- [ ] **Step 5: Commit**

```bash
git add src/engine/layout/custom/customLayoutWorkerPool.ts src/engine/layout/custom/customLayoutWorkerPool.test.ts
git commit -m "feat: add worker pool layout progress emitter"
```

---

### Task 3: Glassmorphic Loading Overlay Component

**Files:**
- Create: `src/components/Controls/LoadingOverlay.tsx`
- Create: `src/components/Controls/LoadingOverlay.css`
- Test: `src/components/Controls/LoadingOverlay.test.tsx`

- [ ] **Step 1: Write failing test for LoadingOverlay component**

Create `src/components/Controls/LoadingOverlay.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { LoadingOverlay } from "./LoadingOverlay";

describe("LoadingOverlay Component", () => {
  it("renders stage name, percentage, and detail message", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={65}
        stageText="Stage 3 of 5"
        detail="Computing A* orthogonal routes..."
        nodeCount={12}
        edgeCount={13}
      />
    );

    expect(html).toContain("65%");
    expect(html).toContain("Stage 3 of 5");
    expect(html).toContain("Computing A* orthogonal routes...");
    expect(html).toContain("12 Nodes");
    expect(html).toContain("13 Edges");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --timeout 5000 src/components/Controls/LoadingOverlay.test.tsx`
Expected: FAIL ("Cannot find module ./LoadingOverlay")

- [ ] **Step 3: Write component implementation and CSS**

Create `src/components/Controls/LoadingOverlay.css`:

```css
.loading-overlay-backdrop {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 12, 16, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: opacity 0.2s ease-in-out;
}

.loading-overlay-card {
  width: 380px;
  padding: 24px;
  background: #161b22;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  color: #f0f6fc;
}

.loading-overlay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.loading-overlay-title {
  font-size: 14px;
  font-weight: 600;
  color: #58a6ff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.loading-overlay-percent {
  font-size: 20px;
  font-weight: 700;
  font-family: monospace;
  color: #3fb950;
}

.loading-progress-track {
  width: 100%;
  height: 8px;
  background: #21262d;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 16px;
}

.loading-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1f6beb 0%, #3fb950 100%);
  transition: width 0.2s ease-out;
}

.loading-overlay-detail {
  font-size: 13px;
  color: #8b949e;
  line-height: 1.4;
  margin-bottom: 12px;
}

.loading-overlay-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #484f58;
}
```

Create `src/components/Controls/LoadingOverlay.tsx`:

```tsx
import type { FC } from "react";
import "./LoadingOverlay.css";

export interface LoadingOverlayProps {
  percent: number;
  stageText: string;
  detail: string;
  nodeCount?: number;
  edgeCount?: number;
}

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
        <div className="loading-overlay-header">
          <span className="loading-overlay-title">{stageText}</span>
          <span className="loading-overlay-percent">{safePercent}%</span>
        </div>

        <div className="loading-progress-track">
          <div
            className="loading-progress-fill"
            style={{ width: `${safePercent}%` }}
          />
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

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --timeout 5000 src/components/Controls/LoadingOverlay.test.tsx`
Expected: PASS (1 pass)

- [ ] **Step 5: Commit**

```bash
git add src/components/Controls/LoadingOverlay.tsx src/components/Controls/LoadingOverlay.css src/components/Controls/LoadingOverlay.test.tsx
git commit -m "feat: add glassmorphic LoadingOverlay progress bar component"
```

---

### Task 4: GraphCanvas Integration & Storage Cache Hookup

**Files:**
- Modify: `src/engine/GraphCanvas/index.tsx:1-70`
- Create: `src/engine/GraphCanvas/GraphCanvasIntegration.test.tsx`

- [ ] **Step 1: Write failing test for immediate unmount & cache hit loading**

Create `src/engine/GraphCanvas/GraphCanvasIntegration.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { generateDatasetSignature } from "../../utils/fileStorage";
import { loadStoredLayout, saveStoredLayout } from "../../utils/layoutCacheStorage";

describe("GraphCanvas Storage Integration", () => {
  it("loads layout from storage instantly on signature hit", () => {
    const dataset = { id: "test-ds", nodes: [{ id: "n1", name: "Node 1" }], edges: [] } as any;
    const sig = generateDatasetSignature(dataset);

    const layout = {
      nodes: [{ id: "n1", name: "Node 1", x: 50, y: 50, width: 100, height: 50 }],
      edges: [],
    };

    saveStoredLayout(sig, layout);
    const cached = loadStoredLayout(sig);

    expect(cached).not.toBeNull();
    expect(cached?.nodes[0].x).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test --timeout 5000 src/engine/GraphCanvas/GraphCanvasIntegration.test.tsx`
Expected: PASS (1 pass)

- [ ] **Step 3: Update `GraphCanvas/index.tsx` to handle immediate unmount, cache hits, and LoadingOverlay**

Update `src/engine/GraphCanvas/index.tsx` effect logic:
1. Generate `signature = generateDatasetSignature(dataset)`.
2. Call `loadStoredLayout(signature)`. If found:
   - Set `positionedNodes` and `positionedEdges` immediately (**0ms hit**).
   - Return.
3. On cache miss:
   - Immediately unmount old canvas elements via `setPositionedGraph([], [])`.
   - Set `isCalculating = true`.
   - Dispatch worker async computation with progress callback.
   - On completion: save layout to storage via `saveStoredLayout(signature, result)`, update graph store, and set `isCalculating = false`.

- [ ] **Step 4: Run full quality gate**

Run: `bun run typecheck && bun run lint && bun run build:local`
Expected: 0 errors across all 143 files!

- [ ] **Step 5: Run full test suite**

Run: `bun test --timeout 10000`
Expected: 342 / 342 PASS

- [ ] **Step 6: Commit and Push**

```bash
git add src/engine/GraphCanvas/index.tsx src/engine/GraphCanvas/GraphCanvasIntegration.test.tsx
git commit -m "feat: integrate persistent layout cache, immediate canvas unmount, and loading progress overlay"
git push origin main
```
