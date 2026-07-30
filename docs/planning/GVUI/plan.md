# GVUI Graph Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build GVUI (Graph Visualizer UI), a high-performance React 19 + TypeScript 7 + Bun + Vite application to render, search, filter, and inspect AI thinking harnesses, decision trees, and graph datasets loaded from JSON files.

**Architecture:** SVG + HTML React DOM hybrid canvas engine with Dagre hierarchical auto-layout, multi-layout switcher, Zustand state management, and 20 reusable visual component primitives.

**Tech Stack:** React 19, TypeScript 7, Bun, Vite, Zustand (`zustand`), Dagre (`@dagrejs/dagre`), Oxlint, Oxfmt.

---

## Task Breakdown

### Task 1: Core Type Definitions & Sample Datasets

**Files:**

- Create: `src/types/graphData.ts`
- Create: `public/graphs/ai_agent_trace.json`
- Create: `public/graphs/decision_tree.json`
- Create: `public/graphs/cyclic_mesh.json`

- [ ] **Step 1: Create global TypeScript contracts in `src/types/graphData.ts`**

```typescript
export interface NodeBadge {
  label: string;
  variant?: "success" | "info" | "amber" | "error" | "gray";
}

export interface NodeTool {
  name: string;
  type?: "generic" | "custom";
}

export interface NodeContext {
  repoPath?: string;
  previousOutputs?: Array<{ fromNode: string; summary: string }>;
  [key: string]: unknown;
}

export interface GraphNodeData {
  id: string;
  name: string;
  description?: string;
  type?: string;
  model?: string;
  harnessModel?: string;
  badges?: NodeBadge[];
  tools?: NodeTool[];
  context?: NodeContext;
  metadata?: Record<string, unknown>;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
  directed?: boolean;
  isCycle?: boolean;
}

export interface GraphDataset {
  id: string;
  title: string;
  directed?: boolean;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

export interface PositionedNode extends GraphNodeData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge extends GraphEdgeData {
  path: string;
  labelX?: number;
  labelY?: number;
}
```

- [ ] **Step 2: Create sample JSON graph dataset `public/graphs/ai_agent_trace.json`**

```json
{
  "id": "agent-trace-01",
  "title": "AI Execution Harness Trace",
  "directed": true,
  "nodes": [
    {
      "id": "node-1",
      "name": "1. User Prompt",
      "type": "start",
      "description": "User requests React UI graph component",
      "badges": [
        { "label": "Status: Received", "variant": "info" },
        { "label": "0ms", "variant": "gray" }
      ]
    },
    {
      "id": "node-2",
      "name": "2. Planner Agent",
      "type": "agent",
      "model": "gemini-3.6-flash",
      "harnessModel": "AGY-Orchestrator-v2",
      "description": "Decomposes requirements into sub-tasks",
      "badges": [
        { "label": "Status: Complete", "variant": "success" },
        { "label": "Tokens: 1,420", "variant": "amber" },
        { "label": "280ms", "variant": "info" }
      ],
      "tools": [
        { "name": "grep_search", "type": "generic" },
        { "name": "build.sh", "type": "custom" }
      ],
      "context": {
        "repoPath": "/Users/onurseckinsenoglu/repos/gvui"
      }
    },
    {
      "id": "node-3",
      "name": "3. Code Generator",
      "type": "executor",
      "model": "gemini-3.6-flash",
      "badges": [
        { "label": "Status: Complete", "variant": "success" },
        { "label": "Tokens: 3,890", "variant": "amber" }
      ]
    }
  ],
  "edges": [
    { "id": "e1-2", "source": "node-1", "target": "node-2", "label": "dispatches" },
    { "id": "e2-3", "source": "node-2", "target": "node-3", "label": "generates" },
    {
      "id": "e3-2",
      "source": "node-3",
      "target": "node-2",
      "label": "retry feedback",
      "isCycle": true
    }
  ]
}
```

- [ ] **Step 3: Run typecheck**
      Run: `bun run typecheck`
      Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/graphData.ts public/graphs/
git commit -m "feat: add graph data interfaces and sample datasets"
```

---

### Task 2: Install State Libraries & Zustand Store

**Files:**

- Modify: `package.json`
- Create: `src/state/useGraphStore.ts`

- [ ] **Step 1: Install `zustand` and `@dagrejs/dagre` packages**

Run: `bun add zustand @dagrejs/dagre && bun add -D @types/dagre`

- [ ] **Step 2: Create Zustand store `src/state/useGraphStore.ts`**

```typescript
import { create } from "zustand";
import { GraphDataset, PositionedNode, PositionedEdge } from "../types/graphData";

export type LayoutMode = "top-down" | "left-right" | "force" | "radial";
export type FilterCategory = "all" | "success" | "error" | "tools";

interface GraphState {
  dataset: GraphDataset | null;
  positionedNodes: PositionedNode[];
  positionedEdges: PositionedEdge[];
  selectedNodeId: string | null;
  searchQuery: string;
  activeFilter: FilterCategory;
  layoutMode: LayoutMode;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  collapsedNodeIds: Set<string>;

  setDataset: (dataset: GraphDataset) => void;
  setPositionedGraph: (nodes: PositionedNode[], edges: PositionedEdge[]) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: FilterCategory) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setZoomLevel: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  toggleNodeCollapse: (nodeId: string) => void;
  resetViewport: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  dataset: null,
  positionedNodes: [],
  positionedEdges: [],
  selectedNodeId: null,
  searchQuery: "",
  activeFilter: "all",
  layoutMode: "top-down",
  zoomLevel: 1,
  panOffset: { x: 0, y: 0 },
  collapsedNodeIds: new Set(),

  setDataset: (dataset) => set({ dataset, selectedNodeId: null }),
  setPositionedGraph: (positionedNodes, positionedEdges) =>
    set({ positionedNodes, positionedEdges }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveFilter: (activeFilter) => set({ activeFilter }),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  setPanOffset: (panOffset) => set({ panOffset }),
  toggleNodeCollapse: (nodeId) =>
    set((state) => {
      const updated = new Set(state.collapsedNodeIds);
      if (updated.has(nodeId)) {
        updated.delete(nodeId);
      } else {
        updated.add(nodeId);
      }
      return { collapsedNodeIds: updated };
    }),
  resetViewport: () => set({ zoomLevel: 1, panOffset: { x: 0, y: 0 } }),
}));
```

- [ ] **Step 3: Run typecheck**
      Run: `bun run typecheck`
      Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock src/state/useGraphStore.ts
git commit -m "feat: install zustand and create graph state store"
```

---

### Task 3: Co-located Visual Node Primitives (`NodeCard` Folder)

**Files:**

- Create: `src/primitives/nodes/NodeCard/NodeCard.types.ts`
- Create: `src/primitives/nodes/NodeCard/NodeCardHeader.tsx`
- Create: `src/primitives/nodes/NodeCard/NodeCardBadges.tsx`
- Create: `src/primitives/nodes/NodeCard/NodeCardTools.tsx`
- Create: `src/primitives/nodes/NodeCard/NodeCardContext.tsx`
- Create: `src/primitives/nodes/NodeCard/NodeCardDetails.tsx`
- Create: `src/primitives/nodes/NodeCard/index.tsx`

- [ ] **Step 1: Create `src/primitives/nodes/NodeCard/NodeCard.types.ts`**

```typescript
import { PositionedNode } from "../../../types/graphData";

export interface NodeCardProps {
  node: PositionedNode;
  isSelected: boolean;
  isFiltered: boolean;
  isCollapsed: boolean;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}
```

- [ ] **Step 2: Create sub-components (`NodeCardHeader.tsx`, `NodeCardBadges.tsx`, etc.) and export orchestrator in `index.tsx`**

- [ ] **Step 3: Run typecheck & oxlint**
      Run: `bun run typecheck && bun run lint`
      Expected: PASS with 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/primitives/nodes/NodeCard/
git commit -m "feat: add NodeCard primitive component and sub-parts"
```

---

### Task 4: Visual Edge & Handle Primitives

**Files:**

- Create: `src/primitives/handles/PortSocket/index.tsx`
- Create: `src/primitives/edges/GraphEdge/index.tsx`
- Create: `src/primitives/edges/GraphEdge/EdgeMarkerDefs.tsx`
- Create: `src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx`

- [ ] **Step 1: Create handle socket primitive `PortSocket/index.tsx`**
- [ ] **Step 2: Create SVG edge path generators and SVG marker definitions**
- [ ] **Step 3: Run typecheck & oxlint**
      Run: `bun run typecheck && bun run lint`
      Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/primitives/handles/ src/primitives/edges/
git commit -m "feat: add edge paths, markers, and port socket primitives"
```

---

### Task 5: Dagre & Layout Engine Dispatcher

**Files:**

- Create: `src/engine/layout/dagreLayout.ts`
- Create: `src/engine/layout/layoutDispatcher.ts`

- [ ] **Step 1: Write Dagre hierarchical auto-layout positioning algorithm `dagreLayout.ts`**

```typescript
import dagre from "@dagrejs/dagre";
import { GraphDataset, PositionedNode, PositionedEdge } from "../../types/graphData";

export function computeDagreLayout(
  dataset: GraphDataset,
  direction: "TB" | "LR" = "TB",
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 140;

  dataset.nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  dataset.edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      x: dagreNode.x - NODE_WIDTH / 2,
      y: dagreNode.y - NODE_HEIGHT / 2,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge) => {
    const srcNode = positionedNodes.find((n) => n.id === edge.source);
    const tgtNode = positionedNodes.find((n) => n.id === edge.target);
    const path =
      srcNode && tgtNode
        ? `M ${srcNode.x + NODE_WIDTH / 2} ${srcNode.y + NODE_HEIGHT} L ${tgtNode.x + NODE_WIDTH / 2} ${tgtNode.y}`
        : "";
    return { ...edge, path };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}
```

- [ ] **Step 2: Create layout dispatcher `layoutDispatcher.ts`**
- [ ] **Step 3: Run typecheck**
      Run: `bun run typecheck`
      Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/engine/layout/
git commit -m "feat: add Dagre layout calculation engine"
```

---

### Task 6: SVG + HTML Graph Canvas & Viewport

**Files:**

- Create: `src/engine/GraphCanvas/usePanZoom.ts`
- Create: `src/engine/GraphCanvas/index.tsx`

- [ ] **Step 1: Write `usePanZoom` hook handling wheel zoom & drag panning**
- [ ] **Step 2: Create `GraphCanvas/index.tsx` rendering SVG edge layer + HTML DOM node cards**
- [ ] **Step 3: Run typecheck & oxlint**
      Run: `bun run typecheck && bun run lint`
      Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/engine/GraphCanvas/
git commit -m "feat: add SVG and HTML hybrid canvas viewport with pan zoom"
```

---

### Task 7: App Sidebar, Search Header & Controls Toolbar

**Files:**

- Create: `src/components/Sidebar/index.tsx`
- Create: `src/components/Controls/CanvasToolbar.tsx`
- Create: `src/components/Controls/SearchHeader.tsx`
- Create: `src/components/Controls/FilterChips.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build Sidebar file browser and dataset picker**
- [ ] **Step 2: Build SearchHeader and FilterChips connected to Zustand store**
- [ ] **Step 3: Assemble App.tsx combining Sidebar + GraphCanvas + Controls**
- [ ] **Step 4: Run typecheck, oxlint, oxfmt**
      Run: `bun run typecheck && bun run lint && bun run format:check`
      Expected: PASS with 0 warnings / 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/components/ src/App.tsx
git commit -m "feat: assemble complete GVUI visualizer application"
```

---

### Task 8: Single-File Standalone HTML Exporter Utility

**Files:**

- Create: `src/utils/htmlExporter.ts`

- [ ] **Step 1: Write `htmlExporter.ts` utility serializing active dataset into self-contained HTML**
- [ ] **Step 2: Add "Export HTML" button to CanvasToolbar**
- [ ] **Step 3: Run typecheck & oxlint**
      Run: `bun run typecheck && bun run lint`
      Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/utils/htmlExporter.ts src/components/Controls/CanvasToolbar.tsx
git commit -m "feat: add standalone single-file HTML exporter utility"
```
