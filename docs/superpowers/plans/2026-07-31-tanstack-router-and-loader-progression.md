# TanStack Router & Micro-Interpolated Stage Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate `@tanstack/react-router` for type-safe routing across all pages and datasets, and upgrade the Stage Loader with WebWorker progress event streaming, 5-step visual stage indicators, and 60 FPS micro-tick smooth percentage interpolation.

**Architecture:**
- `@tanstack/react-router`: Handles type-safe routes (`/`, `/graphs/$fileId`, `/testing`).
- `src/components/Controls/useSmoothProgress.ts`: Custom hook interpolating display percentages smoothly at 60 FPS.
- `src/components/Controls/LoadingOverlay.tsx`: 5-step visual stepper modal showing stage checkmarks and smooth progress bar.
- `src/engine/layout/custom/customLayoutWorker.ts`: Emits real-time progress events during layout calculation phases.

**Tech Stack:** TypeScript, React 18, TanStack Router (`@tanstack/react-router`), Bun Test.

---

### File Structure

```
src/
├── routes/
│   ├── router.tsx                     # TanStack Router configuration
│   └── router.test.tsx                # Unit tests for routing
├── components/
│   └── Controls/
│       ├── useSmoothProgress.ts       # 60 FPS progress interpolator hook
│       ├── useSmoothProgress.test.ts  # Unit tests for progress hook
│       ├── LoadingOverlay.tsx         # 5-step visual loader modal
│       ├── LoadingOverlay.css         # Stepper styles
│       └── LoadingOverlay.test.tsx    # Unit tests for LoadingOverlay
└── engine/
    └── layout/custom/
        ├── customLayoutWorker.ts      # WebWorker progress event emitter
        └── customLayoutWorkerProgress.test.ts # Worker progress tests
```

---

### Task 1: Install TanStack Router & Build `useSmoothProgress` Hook

**Files:**
- Modify: `package.json`
- Create: `src/components/Controls/useSmoothProgress.ts`
- Test: `src/components/Controls/useSmoothProgress.test.ts`

- [ ] **Step 1: Install `@tanstack/react-router`**

Run: `bun add @tanstack/react-router`

- [ ] **Step 2: Write failing unit test for `useSmoothProgress`**

Create `src/components/Controls/useSmoothProgress.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { interpolateProgress } from "./useSmoothProgress";

describe("useSmoothProgress helper", () => {
  it("interpolates current percent toward target smoothly", () => {
    const p1 = interpolateProgress(10, 50, 0.2);
    expect(p1).toBeGreaterThan(10);
    expect(p1).toBeLessThanOrEqual(50);
  });

  it("clamps display percentage between 0 and 100", () => {
    expect(interpolateProgress(-10, 50, 0.5)).toBeGreaterThanOrEqual(0);
    expect(interpolateProgress(95, 120, 0.5)).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test --timeout 5000 src/components/Controls/useSmoothProgress.test.ts`
Expected: FAIL ("Cannot find module ./useSmoothProgress")

- [ ] **Step 4: Write implementation**

Create `src/components/Controls/useSmoothProgress.ts`:

```typescript
import { useEffect, useState } from "react";

export function interpolateProgress(
  current: number,
  target: number,
  stepFactor: number = 0.25,
): number {
  const diff = target - current;
  if (Math.abs(diff) < 0.5) return Math.min(100, Math.max(0, target));
  const next = current + diff * stepFactor;
  return Math.min(100, Math.max(0, Math.round(next * 10) / 10));
}

export function useSmoothProgress(targetPercent: number, isCalculating: boolean): number {
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    if (!isCalculating) {
      setDisplayPercent(0);
      return;
    }

    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const delta = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      setDisplayPercent((prev) => {
        if (prev >= targetPercent) return targetPercent;
        const speed = Math.max(10, (targetPercent - prev) * 5);
        const next = Math.min(targetPercent, prev + speed * delta);
        return Math.round(next * 10) / 10;
      });

      if (displayPercent < targetPercent) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [targetPercent, isCalculating, displayPercent]);

  return displayPercent;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test --timeout 5000 src/components/Controls/useSmoothProgress.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock* src/components/Controls/useSmoothProgress.ts src/components/Controls/useSmoothProgress.test.ts
git commit -m "feat: install TanStack Router and add smooth progress interpolator hook"
```

---

### Task 2: Upgrade `LoadingOverlay` to 5-Step Visual Stepper UI

**Files:**
- Modify: `src/components/Controls/LoadingOverlay.tsx`
- Modify: `src/components/Controls/LoadingOverlay.css`
- Test: `src/components/Controls/LoadingOverlay.test.tsx`

- [ ] **Step 1: Write failing test for 5-step stepper**

Update `src/components/Controls/LoadingOverlay.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { LoadingOverlay } from "./LoadingOverlay";

describe("LoadingOverlay Component", () => {
  it("renders 5-step visual stage indicators with checkmarks", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={65}
        stageText="Stage 3 of 5"
        detail="Computing A* orthogonal routes..."
        nodeCount={12}
        edgeCount={13}
      />
    );

    expect(html).toContain("Topology");
    expect(html).toContain("Ranking");
    expect(html).toContain("A* Routing");
    expect(html).toContain("Crossings");
    expect(html).toContain("Render");
    expect(html).toContain("65%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `bun test --timeout 5000 src/components/Controls/LoadingOverlay.test.tsx`

- [ ] **Step 3: Update `LoadingOverlay.tsx` and `LoadingOverlay.css`**

Update `src/components/Controls/LoadingOverlay.tsx`:

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
        <div className="loading-overlay-header">
          <span className="loading-overlay-title">{stageText}</span>
          <span className="loading-overlay-percent">{Math.round(safePercent)}%</span>
        </div>

        <div className="loading-progress-track">
          <div
            className="loading-progress-fill"
            style={{ width: `${safePercent}%` }}
          />
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

Update `src/components/Controls/LoadingOverlay.css`:

```css
.loading-stepper-container {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  justify-content: space-between;
}

.loading-step-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 12px;
  font-size: 11px;
  color: #8b949e;
  transition: all 0.2s ease-in-out;
}

.loading-step-chip.is-done {
  background: rgba(63, 185, 80, 0.15);
  border-color: rgba(63, 185, 80, 0.4);
  color: #3fb950;
}

.loading-step-chip.is-active {
  background: rgba(88, 166, 255, 0.15);
  border-color: #58a6ff;
  color: #58a6ff;
  box-shadow: 0 0 10px rgba(88, 166, 255, 0.3);
}

.step-icon {
  font-weight: 700;
  font-size: 10px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --timeout 5000 src/components/Controls/LoadingOverlay.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Controls/LoadingOverlay.tsx src/components/Controls/LoadingOverlay.css src/components/Controls/LoadingOverlay.test.tsx
git commit -m "feat: upgrade LoadingOverlay with 5-step visual stage indicators"
```

---

### Task 3: TanStack Router Setup & Application Integration

**Files:**
- Create: `src/routes/router.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar/index.tsx`
- Modify: `src/components/CommandPalette/index.tsx`
- Test: `src/routes/router.test.tsx`

- [ ] **Step 1: Write test for TanStack Router configuration**

Create `src/routes/router.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { router } from "./router";

describe("TanStack Router Setup", () => {
  it("exports a valid Router instance with route tree", () => {
    expect(router).toBeDefined();
    expect(typeof router.navigate).toBe("function");
  });
});
```

- [ ] **Step 2: Create `src/routes/router.tsx`**

Create `src/routes/router.tsx`:

```tsx
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AppContent } from "../AppContent";
import { GraphTestingPage } from "../features/GraphTesting/components/GraphTestingPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/graphs/$fileId", params: { fileId: "ai_agent_trace.json" } });
  },
});

const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graphs/$fileId",
  component: AppContent,
});

const testingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/testing",
  component: GraphTestingPage,
});

const routeTree = rootRoute.addChildren([indexRoute, graphRoute, testingRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `bun test --timeout 5000 src/routes/router.test.tsx`
Expected: PASS

- [ ] **Step 4: Update `main.tsx` / `App.tsx` to render `RouterProvider`**

- [ ] **Step 5: Run full quality gate check**

Run: `bun run typecheck && bun run lint && bun run build:local`
Expected: 0 errors!

- [ ] **Step 6: Run full test suite**

Run: `bun test --timeout 10000`
Expected: 100% PASS

- [ ] **Step 7: Commit and Push**

```bash
git add src/routes/ src/App.tsx src/main.tsx
git commit -m "feat: integrate TanStack Router for type-safe dataset and page routing"
git push origin main
```
