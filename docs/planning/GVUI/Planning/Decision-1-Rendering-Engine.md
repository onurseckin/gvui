# Decision 1: Core Rendering Technology (SVG + HTML Hybrid)

## Status
- **State**: Locked & Finalized
- **Date**: 2026-07-30
- **Choice**: Option A (SVG + HTML React DOM Hybrid)

---

## Explanation & Context
GVUI requires rendering graphs representing AI thinking harnesses, decision trees, and trace flows. These graphs consist of nodes with titles, status badges (`[Status: Executed]`, `[Tokens: 340]`), collapsible trace logs, and directed/undirected/cyclic edges.

We evaluated three primary rendering engines:
1. **Option A: SVG + HTML React DOM (Selected)**
2. **Option B: Pure HTML5 2D Canvas**
3. **Option C: WebGL GPU Acceleration**

---

## Why We Chose Option A (SVG + HTML Hybrid)

1. **Rich Node Styling & DOM Flexibility**:
   Nodes are rendered as native HTML React components (`<div>`s). This allows styling titles, execution status badges, token counters, and collapsible detail panes using standard CSS and React components without manual canvas pixel drawing.

2. **Crisp Vector Scaling**:
   Edges and lines are drawn using SVG vector elements (`<path>`, `<marker>`). Vector SVG and browser HTML text scale infinitely with zero pixelation or quality loss during zoom-in/zoom-out operations.

3. **High-Definition Image Export (SVG & PNG)**:
   Because the scene graph is composed of SVG and HTML, the graph can be natively exported to high-resolution vector `.svg` files or crisp raster PNGs (at 2x/4x pixel density).

4. **Standalone Single-File HTML Export (Future CLI Support)**:
   An SVG + HTML graph layout can be serialized by a future CLI tool into a 100% self-contained, dependency-free single `.html` file containing inline `<svg>`, `<div>`s, CSS, and lightweight JS for pan/zoom. Anyone can open this file in any browser without Node/Bun dependencies.

---

## Trade-Offs & Performance Boundaries
- **Node Scale Target**: Optimized for graphs up to 500–1,000 active nodes on screen, which fully covers AI thinking harness traces and decision graphs.
