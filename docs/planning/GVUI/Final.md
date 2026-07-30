# GVUI — Final Implementation Specification

This document contains only finalized, locked technical decisions required for building GVUI.

---

## 1. Core Architecture & Stack

- **Framework**: React 19 + TypeScript 7
- **Build Tool & Package Manager**: Vite + Bun (`bun`)
- **Containerization**: Docker Dev (Watch/HMR) & Docker Prod (Multi-stage Nginx)
- **Quality Gates**: `oxlint` (linting) & `oxfmt` (formatting)

---

## 2. Locked Decisions

### Decision 1: Canvas Rendering Engine

- **Engine**: **SVG + HTML React DOM Hybrid**
- **Node Primitives**: HTML React DOM elements positioned absolutely inside pan/zoom viewport.
- **Edge Primitives**: SVG vector layer (`<svg>`, `<path>`, `<marker>`) overlaying/underlying nodes.
- **Export Standards**: Native SVG vector export & standalone single-file HTML export.

### Decision 2: Graph Layout & Positioning Engine

- **Positioning Responsibility**: 100% computed by GVUI from raw JSON data (no `x,y` required in JSON).
- **Primary Default Layout**: Hierarchical Top-Down / Left-Right DAG layout (Dagre algorithm).
- **Multi-Layout Switcher**: Integrated UI switcher for Top-Down, Left-to-Right, Organic Force, and Radial modes to handle cyclic web meshes and network graphs.
- **Collision Avoidance**: Automatic bounding box calculation based on node title & badge dimensions.

### Decision 3: Reusable Visual Component Primitives Catalog

- **Decoupled Architecture**: UI component primitives are completely decoupled from JSON key names. Any incoming JSON dataset maps into combinations of 20 reusable visual primitives.
- **Node & Content Primitives**: `<NodeContainer />`, `<NodeHeader />`, `<BadgeBar />`, `<ModelBadgeTag />`, `<ToolChipList />`, `<NodeContextList />`, `<NodeDetailPane />`, `<StatusIndicatorLED />`.
- **Handle & Port Primitives**: `<Handle />` / `<PortSocket />`, `<MultiPortStack />`, `<PortLabel />`, `<ActiveHandleState />`.
- **Edge & Connector Primitives**: `<GraphEdge />` (Straight, SmoothStep 90°, Bezier), `<EdgeMarker />` (Arrows, Particles), `<EdgeConditionBadge />`, `<EdgeHitbox />`.
- **Canvas & Container Primitives**: `<GroupContainer />` / `<ClusterHull />`, `<SwimlaneTrack />`, `<StickyNoteCallout />`, `<CanvasControlsPanel />` & `<MiniMap />`.

### Decision 4: Interactive Canvas Features & Controls

- **Viewport Navigation**: Infinite pan (click & drag), zoom (`10%` to `500%`), `[Fit View]` button, and `[Lock Canvas]` toggle.
- **Search & Auto-Focus**: Search toolbar input that auto-centers and pulse-highlights target nodes by title, ID, or tool name.
- **Status & Category Filtering**: Filter chips (`All`, `🟢 Success`, `🔴 Errors Only`, `🔧 Tools Only`) that dim unrelated nodes and highlight relevant execution paths.
- **Sub-tree Collapsing**: Clickable `[-]` collapse toggle on nodes to expand/collapse downstream child branches for large graphs.

### Decision 5: Co-located Component Architecture & Directory Structure

- **Co-location Rule**: Component-specific types, styles, and sub-components live inside the component's dedicated directory (e.g. `src/primitives/nodes/NodeCard/NodeCard.types.ts`). Global `src/types/` is strictly for shared domain contracts (`GraphDataset`).
- **Decomposition & Line Caps**: Hard cap on file length (~50–150 lines). Large components are decomposed into focused sub-components inside their component folder.
- **Adaptive Architecture**: Structural blueprint provides clean category boundaries (`primitives/`, `engine/`, `state/`, `components/`, `types/`) while allowing flexible implementation adaptation.

### Decision 6: State Management & Navigation Architecture

- **State Management**: **Zustand** (`zustand`) for selective, fine-grained canvas subscriptions without unnecessary component re-renders during high-frequency panning/zooming.
- **Dataset Navigation**: **Native URL Query Parameter Sync** (`?graph=file.json&node=id`) for shareable deep links without heavy router package dependencies. Zero-overhead integration across web app, Docker, and single-file HTML CLI exports.
