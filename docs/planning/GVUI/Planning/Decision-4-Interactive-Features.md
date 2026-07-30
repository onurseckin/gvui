# Decision 4: Interactive Canvas Features & Controls

## Status
- **State**: Locked & Finalized
- **Date**: 2026-07-30
- **Choice**: Option B (Essential Navigation + Node Search/Auto-Focus, Status Filtering & Sub-tree Collapsing)

---

## Explanation & Context
As graphs grow large (>100+ nodes, multi-step AI thinking harnesses), users need powerful viewport navigation tools to inspect nodes cleanly without getting lost or overwhelmed.

We evaluated three feature set levels:
1. **Option A: Essential Navigation (Pan, Zoom, Fit View, Lock Canvas)**
2. **Option B: Navigation + Search, Status Filtering & Sub-tree Collapsing (Selected)**
3. **Option C: Option B + Time-Travel Step Replay Scrubber**

---

## Why We Chose Option B

1. **Effortless Large Graph Navigation**:
   Combining infinite pan/zoom with a one-click `[Fit View]` button ensures the user can always reset their perspective or jump directly to specific nodes.

2. **Node Search & Auto-Focus**:
   A global search input allows typing any node name, model name, tool name, or ID. The canvas instantly pans and zooms to center the matching node with a temporary pulse/highlight ring.

3. **Status & Category Filtering**:
   Filter chips (`All`, `🟢 Success`, `🔴 Errors Only`, `🔧 Tools Only`) allow isolating execution paths. Selecting `Errors Only` dims non-error nodes and highlights the path that caused a failure.

4. **Sub-tree Collapsing**:
   Each node card contains an optional `[-]` collapse toggle button that temporarily collapses its downstream child branch, enabling clean exploration of massive decision trees.

---

## Technical Specifications
- **Zoom Range**: `10%` (`0.1`) to `500%` (`5.0`).
- **Pan Bounds**: Elastic canvas padding allowing full pan anywhere on the screen.
- **Fit View Algorithm**: Calculates Axis-Aligned Bounding Box (AABB) of all visible nodes + 50px padding and computes exact CSS matrix scale & translate offsets.
- **Keyboard Shortcuts**:
  - `Ctrl / Cmd + Scroll`: Zoom in/out.
  - `Space + Drag` or `Middle Click Drag`: Pan canvas.
  - `Cmd + F`: Focus node search input.
  - `Escape`: Clear filters and selection.
