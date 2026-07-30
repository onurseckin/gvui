# Per-File Viewport State Persistence & Content Signature Invalidation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-file viewport states (`zoomLevel`, `panOffset`, `selectedNodeId`, `layoutMode`) in `localStorage` keyed by dataset signature hashes. Restore saved states when visiting previously viewed files, invalidate cache when graph content changes, and default new files to dynamic `Fit View`.

---

## Task Breakdown

### Task 1: Dataset Signature & LocalStorage Persistence Utility (`src/utils/fileStorage.ts`)

**Files:**

- Create: `src/utils/fileStorage.ts`

- [ ] **Step 1: Implement deterministic dataset content hashing `generateDatasetSignature(dataset: GraphDataset): string`**
- [ ] **Step 2: Implement `loadStoredViewport(fileId: string, currentSignature: string): SavedFileViewport | null`**
- [ ] **Step 3: Implement `saveStoredViewport(fileId: string, state: SavedFileViewport): void`**
- [ ] **Step 4: Implement `clearStoredViewport(fileId: string): void`**
- [ ] **Step 5: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 6: Commit:** `feat: add per-file viewport local storage persistence and content hashing utility`

---

### Task 2: Integrate Viewport Persistence & Auto-Fit Default in App & Store

**Files:**

- Modify: `src/state/useGraphStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/engine/GraphCanvas/index.tsx`

- [ ] **Step 1: Update graph file loading logic in `App.tsx` / `GraphCanvas` to compute dataset signature**
- [ ] **Step 2: Check `loadStoredViewport(fileId, signature)` on dataset load:**
  - If valid saved viewport exists: Restore `zoomLevel`, `panOffset`, `selectedNodeId`, `layoutMode`.
  - If missing or signature changed: Clear invalid cache and trigger dynamic **`Fit View`** default!
- [ ] **Step 3: Save updated viewport state to `localStorage` when user pans, zooms, selects nodes, or switches layouts**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `feat: integrate per-file viewport persistence and auto-fit default on graph load`
