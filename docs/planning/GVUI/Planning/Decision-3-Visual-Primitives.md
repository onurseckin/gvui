# Decision 3: Reusable Visual Component Primitives Catalog

## Status

- **State**: Locked & Finalized
- **Date**: 2026-07-30
- **Choice**: Modular 20-Primitive Component Catalog (Decoupled from JSON Schema)

---

## Explanation & Context

Instead of locking rigid JSON key names (which might change between different AI harnesses or workflow engines), **GVUI is built on a modular library of 20 reusable visual primitives**.

Any incoming JSON dataset—regardless of its key names—will simply map into combinations of these 20 visual component primitives.

---

## Master Catalog of 20 Visual Primitives

### Group A: Node & Content Primitives

1. **`<NodeContainer />`**: Viewport-positioned card shell with selection ring, hover glow, and execution status border (`running` pulsing cyan, `success` green, `error` red shake).
2. **`<NodeHeader />`**: Header strip with category color band, drag handle anchor, node title, step index (`#1`), and collapsible expand/collapse toggle.
3. **`<BadgeBar />` & `<BadgePill />`**: Horizontal wrap of colored metric chips: `[✓ Complete]`, `[⚡ 120ms]`, `[🪙 1.4k Tokens]`, `[🔁 Iteration #2]`.
4. **`<ModelBadgeTag />`**: Dedicated badge for AI model identifiers (`gemini-3.6-flash`, `gpt-4o`, `AGY-Orchestrator-v2`).
5. **`<ToolChipList />`**: Icon-labelled chips for generic tools (`[🔧 grep_search]`) and custom scripts (`[📜 build_script.sh]`).
6. **`<NodeContextList />`**: Key-Value metadata rows displaying repository paths (`/src/App.tsx`), branch names, or execution environments.
7. **`<NodeDetailPane />`**: Collapsible accordion drawer for code blocks, prompt/response text, raw JSON payloads, and error stack traces.
8. **`<StatusIndicatorLED />`**: Pulsing dot status indicator (`green` success, `blue` streaming, `amber` waiting, `red` error).

### Group B: Handle & Port Primitives

9. **`<Handle />` / `<PortSocket />`**: Anchor sockets positioned on node boundaries (`top`, `right`, `bottom`, `left`) for edge connections.
10. **`<MultiPortStack />`**: Vertical array of handles for dynamic multi-channel inputs/outputs (e.g. decision branches).
11. **`<PortLabel />`**: Text label and data-type tag (`JSON`, `String`, `Tensor`) placed inside the node body next to the handle socket.
12. **`<ActiveHandleState />`**: Connection feedback visual cues (hover magnet snap, green valid target, red invalid shake).

### Group C: Edge & Connector Primitives

13. **`<GraphEdge />`**: SVG vector path supporting 3 routing modes: `Straight` (linear), `SmoothStep` (orthogonal 90°), and `Bezier` (curved).
14. **`<EdgeMarker />`**: Vector endpoints: Arrowheads (directed flow), Circle dots, Diamonds, and Traveling Data Flow particles (`<animateMotion>`).
15. **`<EdgeConditionBadge />`**: Midpoint HTML/SVG badge sitting on the edge line (`[retry #2]`, `[if status == 200]`, `[branch: true]`).
16. **`<EdgeHitbox />`**: Invisible 20px SVG path overlay behind the edge line to make clicking and hovering easy.

### Group D: Canvas & Container Primitives

17. **`<GroupContainer />` / `<ClusterHull />`**: Bounding box or convex hull surrounding related subgraphs / sub-flows with semi-transparent background fill and title label.
18. **`<SwimlaneTrack />`**: Grid columns or rows separating graph components by scope (e.g. `Client Track` vs `Agent Track` vs `Tool Track`).
19. **`<StickyNoteCallout />`**: Floating annotation card connected to a target node via a curved tether line.
20. **`<CanvasControlsPanel />` & `<MiniMap />`**: Viewport controls (`[ + ]`, `[ - ]`, `[ Fit View ]`, `[ Pan Lock ]`) and bird's-eye minimap overview.
