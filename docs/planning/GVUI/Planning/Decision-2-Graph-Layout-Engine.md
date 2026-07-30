# Decision 2: Graph Layout & Positioning Engine

## Status
- **State**: Locked & Finalized
- **Date**: 2026-07-30
- **Choice**: Option C (Multi-Algorithm Auto-Layout Engine with Hierarchical Default + Layout Switcher)

---

## Explanation & Context
GVUI is designed to visualize graph datasets provided as raw JSON files. The JSON files do NOT contain `x, y` coordinates, visual positioning data, or canvas metadata. 

The JSON schema specifies only:
- Node list & Node identifiers
- Edges & edge direction (directed / undirected)
- Cyclic feedback connections
- Node metadata & execution badges

GVUI is 100% responsible for calculating all spatial coordinates, node spacing, alignment, and collision-free bounds.

We evaluated three positioning approaches:
1. **Option A: Pure Hierarchical Auto-Layout (Dagre)**
2. **Option B: Force-Directed Physics Layout (D3-Force)**
3. **Option C: Multi-Algorithm Auto-Layout Engine (Selected)**

---

## Why We Chose Option C (Multi-Algorithm Engine)

1. **Automatic Spatial Positioning**:
   Upon loading any raw JSON dataset, GVUI automatically calculates all `x, y` coordinates without requiring manual positioning.

2. **Hierarchical Default for AI Harnesses**:
   Defaults to a clean Top-to-Bottom / Left-to-Right layout (Dagre algorithm), which aligns perfectly with sequential AI thinking traces and decision trees with zero node overlap.

3. **Versatility for Cyclic Web Meshes & Network Graphs**:
   Because AI thinking harnesses can also include cyclic feedback loops, recursive sub-agents, or mesh-like network structures, GVUI provides an in-app layout switcher:
   - `Top-Down` (Hierarchical tree)
   - `Left-to-Right` (Sequential pipeline)
   - `Organic Force` (Network mesh layout)
   - `Radial / Circular` (Central node relationships)

---

## Technical Specifications
- **Primary Layout Algorithm**: Dagre (Hierarchical DAG engine)
- **Secondary Layout Algorithms**: D3-Force / Custom Radial positioning engine
- **Collision Avoidance**: Automatic bounding box calculation based on node title & badge dimensions.
