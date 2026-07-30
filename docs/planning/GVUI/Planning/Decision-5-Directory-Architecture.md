# Decision 5: Co-located Component Architecture & Directory Structure

## Status

- **State**: Locked & Finalized
- **Date**: 2026-07-30
- **Choice**: Co-located Subfolder Architecture (Strict Co-location, Line Length Caps, Adaptive Component Scoping)

---

## Architectural Principles & Rules

1. **Co-location First**:
   - Component-specific TypeScript types, helper functions, and child sub-components live **inside the component's dedicated directory** (e.g. `src/primitives/nodes/NodeCard/NodeCard.types.ts`).
   - Global `src/types/` is strictly reserved for shared domain data contracts (`GraphDataset`).

2. **Decomposition & File Length Limits**:
   - Every file must be a single, focused module (typically **50 to 150 lines of code**).
   - Monolithic files (>300+ lines) are prohibited. Complex components (like `NodeCard` or `GraphEdge`) are decomposed into dedicated sub-components within their folder.

3. **Adaptive Blueprint Flexibility**:
   - The directory tree serves as a structural blueprint and pattern guide. The implementation phase adapts filenames and sub-components as needed without rigid restrictions.

---

## Directory Architecture Blueprint

```
src/
├── primitives/                      # Modular Visual Primitives
│   ├── nodes/
│   │   └── NodeCard/                # Dedicated folder per component
│   │       ├── index.tsx            # Main orchestrator component
│   │       ├── NodeCard.types.ts    # Co-located component types
│   │       ├── NodeCardHeader.tsx   # Sub-component: Title, step index, icon
│   │       ├── NodeCardBadges.tsx   # Sub-component: Status, token, latency pills
│   │       ├── NodeCardTools.tsx    # Sub-component: Tool & script chips
│   │       ├── NodeCardContext.tsx  # Sub-component: Key-value metadata rows
│   │       └── NodeCardDetails.tsx  # Sub-component: Collapsible code/JSON drawer
│   │
│   ├── handles/                     # Connection handles & sockets
│   ├── edges/                       # SVG vector edge paths, markers & hitboxes
│   └── annotations/                 # Group cluster hulls & sticky note callouts
│
├── engine/                          # Canvas & Layout Calculation Core
│   ├── GraphCanvas/                 # Pan/Zoom SVG/HTML Viewport Wrapper
│   └── layout/                      # Dagre (Hierarchical) & Force layout math
│
├── state/                           # State Management & Hooks
│   ├── GraphContext.tsx             # Context provider
│   └── useGraphState.ts             # Custom hook exposing state & actions
│
├── components/                      # Top-Level App UI (Sidebar & Controls)
│   ├── Sidebar/                     # Dataset selector & file browser
│   └── Controls/                    # Search header, canvas controls, filter chips
│
└── types/                           # Shared Global Domain Contracts ONLY
    └── graphData.ts                 # Global raw JSON graph dataset contract
```
