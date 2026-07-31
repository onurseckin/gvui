← Previous | [Index](../README.md) | Next →

# Computational Complexity

Rendering a graph is a battle against exponential math. As nodes and edges are added, the number of possible layouts explodes. This document breaks down the time and space complexity of our layout engines.

## Per-Engine Breakdown

### 1. Grid Layout
**Complexity:** $O(N)$ Space and Time.

The grid layout simply iterates through the $N$ nodes and places them in mathematical rows and columns based on their index. It scales trivially to thousands of nodes in milliseconds.

### 2. Radial Layout
**Complexity:** $O(N + E)$ Space and Time.

Nodes are placed in concentric circles using trigonometry (sine/cosine math). Edges are straight lines drawn between coordinates. Highly performant, handling hundreds of nodes instantly.

### 3. Dagre Layout (Sugiyama)
**Complexity:** $O(V + E)$ for core layout, $O(E^2)$ for badge repulsion.

Dagre is a fast heuristic engine. It makes single-pass decisions for cycle removal, layer assignment, and crossing minimization. 
However, in our integration (see [`computeDagreLayout` in `nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L575-L602)), we run a post-pass to repel overlapping edge badges. This checks every edge badge against every other edge badge, introducing an $O(E^2)$ step that begins to slow down around 200+ edges.

### 4. Custom Engine (A* Search)
**Complexity:** Exceedingly high. Worst-case $O(b^d)$ where $b$ is the branching factor (layout permutations) and $d$ is depth.

The custom engine searches for perfect orthogonal edge routes that avoid obstacles. 
- Generating layout states involves permuting node orders and port assignments.
- **Routing Phase:** The A* routing algorithm consumes ~98% of the total CPU operations. Routing a single edge around obstacles on a grid is $O(V_{grid} \log V_{grid})$.

## Scaling Implications & Examples

Let's look at how the engines behave at different graph sizes.

**Small Graph (5 Nodes, 6 Edges)**
- *Dagre:* < 5ms.
- *Custom:* < 20ms. The search space is tiny. A perfect layout is found instantly.

**Medium Graph (20 Nodes, 30 Edges)**
- *Dagre:* 10-15ms.
- *Custom:* 100-500ms. The A* router evaluates thousands of grid states to route edges cleanly. The frontier queue grows rapidly.

**Large Graph (100 Nodes, 150 Edges)**
- *Dagre:* ~50ms. Highly stable.
- *Custom:* Without limits, this would take minutes and crash the browser tab due to out-of-memory errors.

## Mitigation Strategies

Because the custom engine is so computationally heavy, we use two massive safeguards to protect the user experience:

### 1. Web Workers
As seen in [`customLayoutWorkerClient.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/customLayoutWorkerClient.ts), the custom engine runs entirely in a background Web Worker. This means even if the layout takes 4 seconds to compute for a complex graph, the main browser UI thread (scrolling, clicking, animations) remains 100% smooth. If the computation exceeds 5 seconds, the client forcibly terminates the worker and throws a `LayoutTimeoutError`, preventing infinite stalls.

### 2. Budget-Adaptive Search
We do not allow the search to run infinitely. [`config.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/config.ts) defines strict execution budgets to rein in the exponential branching:
- `maxLayoutStates: 50`
- `maxAStarStatesPerRoute: 2000`

If the algorithm explores 2,000 search states while trying to route a single edge, it gives up on finding the "perfect" route, accepts a suboptimal route (perhaps crossing a node), and moves on. This guarantees the algorithm completes in bounded time, smoothly trading aesthetic perfection for guaranteed completion times on large graphs.
