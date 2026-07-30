# Decision 6: State Management & Navigation Architecture

## Status
- **State**: Locked & Finalized
- **Date**: 2026-07-30
- **Choice**: Zustand for Canvas State + Native URL Query Parameter Sync for Navigation

---

## 1. State Management: Zustand (~1KB)

### Rationale
In interactive graph visualizers, high-frequency actions occur continuously (pan/zoom matrix transforms, node hover, node selection, status filtering, node search).

- **Selective Subscriptions**: Unlike standard React Context (which can cause cascading re-renders across the entire node tree), Zustand allows individual components (`<NodeCard />`, `<CanvasControls />`, `<SearchBar />`) to subscribe *only* to the exact slice of state they consume (e.g. `useGraphStore(state => state.zoomLevel)`).
- **60 FPS Canvas Performance**: Prevents DOM re-render lag when dragging or panning canvas viewports with hundreds of nodes.
- **Zero Boilerplate**: No `<Provider>` wrapper nesting required.

---

## 2. Navigation & Deep Linking: Native URL Query Parameter Sync

### Rationale
GVUI operates as a single-page visualizer workspace. Switching between JSON graph datasets in the sidebar changes the canvas payload—it does not require navigating between different page layouts.

- **Zero Router Dependency**: Avoids heavy routing libraries (TanStack Router / React Router), keeping bundle size minimal.
- **Shareable Deep Links**: Syncs active graph dataset and selected node to browser URL query parameters:
  `http://localhost:5173/?graph=agent-trace.json&node=node-42`
- **Instant Auto-Focus**: Opening a deep link automatically loads the target JSON file and pans/zooms to focus on `node-42`.
- **Universal Portability**: Native `URLSearchParams` implementation works seamlessly across standalone web app, Docker container, and CLI single-file HTML exports.
