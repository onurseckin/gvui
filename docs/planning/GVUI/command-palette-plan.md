# Command Palette Modal (Cmd+K Global Search & Centered Node Navigation) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a centered Command Palette modal (`Cmd+K`) using Base UI Dialog primitives with Scope Tabs ("Current File" vs "All Files"), alphabetical top 10 default node results, real-time node name filtering, and instant graph canvas centering at 100% zoom level (`scale: 1.0`).

---

## Task Breakdown

### Task 1: Store & Centering Navigation Helpers (`centerNodeInCanvas`)

**Files:**
- Modify: `src/state/useGraphStore.ts`
- Modify: `src/engine/GraphCanvas/usePanZoom.ts` or helper

- [ ] **Step 1: Add `centerNode(nodeId: string, viewportWidth: number, viewportHeight: number)` action to Zustand store or canvas utility**
  - Sets `zoomLevel: 1.0` (100% zoom).
  - Calculates `panOffset.x = viewportWidth / 2 - node.x` and `panOffset.y = viewportHeight / 2 - node.y`.
- [ ] **Step 2: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 3: Commit:** `feat: add canvas node centering at 100% zoom level`

---

### Task 2: Command Palette Modal Component (`src/components/CommandPalette/`)

**Files:**
- Create: `src/components/CommandPalette/CommandPalette.types.ts`
- Create: `src/components/CommandPalette/CommandPalette.css`
- Create: `src/components/CommandPalette/index.tsx`

- [ ] **Step 1: Build Base UI Dialog modal centered on screen with backdrop overlay**
- [ ] **Step 2: Add Search input field with `#000000` background and auto-focus**
- [ ] **Step 3: Add Scope Selector tabs ("Current File" vs "All Files"), defaulting to "Current File"**
- [ ] **Step 4: Load nodes from current file and pre-fetch sample files (`ai_agent_trace.json`, `decision_tree.json`, `cyclic_mesh.json`)**
- [ ] **Step 5: Implement default empty state (top 10 nodes ordered alphabetically by name) and search state**
- [ ] **Step 6: Render results list displaying node name, type, and source JSON filename badge on the right**
- [ ] **Step 7: Implement selection handler (same page vs different file graph loading + centering at 100% zoom + URL sync + close modal)**
- [ ] **Step 8: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 9: Commit:** `feat: add CommandPalette modal component with Base UI dialog`

---

### Task 3: Integrate Command Palette Modal & Global Hotkey in App Header

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Controls/SearchHeader.tsx`
- Modify: `src/ui/molecules/SearchInput/index.tsx`

- [ ] **Step 1: Connect top-right `SearchInput` click event to trigger Command Palette modal open state**
- [ ] **Step 2: Register global `Cmd+K` / `Ctrl+K` keyboard shortcut in `App.tsx` or `CommandPalette`**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 4: Commit:** `feat: integrate global Cmd+K CommandPalette modal in App navbar`
