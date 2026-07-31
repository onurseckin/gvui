← Previous | [Index](../README.md) | Next →

# Computational Complexity

Rendering a graph automatically is fundamentally a battle against exponential math. As you add nodes and edges, the number of possible ways to arrange them explodes. 

This document breaks down the time and space complexity of our different layout engines, with concrete numbers to demonstrate why certain architectural choices were made.

## Per-Engine Breakdown

### 1. Grid Layout
**Complexity:** $O(N)$ Space and Time.

The Grid layout is the simplest atom of our system. It simply takes $N$ nodes, calculates a square root to find a grid size, and iterates through the nodes to place them in rows and columns based on their array index. 
- **Why it's used:** It serves as an instant fallback. It scales trivially to thousands of nodes in under a millisecond.

### 2. Radial Layout
**Complexity:** $O(N + E)$ Space and Time.

Nodes are placed in concentric circles using basic trigonometry (`Math.sin` and `Math.cos`). Edges are straight lines drawn directly between the resulting $(X, Y)$ coordinates.
- **Why it's used:** Highly performant, handling hundreds of nodes instantly, great for highly centralized topologies.

### 3. Dagre Layout (Sugiyama Framework)
**Complexity:** $O(V + E)$ for core layout, $O(E^2)$ for our badge repulsion post-pass.

Dagre is a "heuristic" engine. It doesn't search for perfect layouts; it makes single-pass, greedy decisions for cycle removal, layer assignment, and crossing minimization. 
- **The Bottleneck:** In our integration (see [`computeDagreLayout` in `nodeDimensions.ts`](../../src/engine/layout/nodeDimensions.ts#L575-L602)), we run a custom post-pass to repel overlapping edge badges. This checks every edge badge against every other edge badge, introducing an $O(E^2)$ step.

### 4. Custom Engine (Orthogonal A* Search)
**Complexity:** Exceedingly high. Worst-case $O(b^d)$ where $b$ is the branching factor (layout permutations) and $d$ is depth.

Unlike Dagre, our custom engine searches for *perfect* orthogonal edge routes that rigidly avoid all node obstacles. 
- **The Bottleneck:** The A* routing algorithm consumes ~98% of the total CPU operations. Routing a single edge around obstacles on a grid is $O(V_{grid} \log V_{grid})$, where $V_{grid}$ is the number of grid points in the bounding box. When you have 50 edges, and you try 10 different layout variations, you are running A* 500 times.

## Scaling Implications & Concrete Examples

Let's look at how the Dagre and Custom engines behave as the graph grows.

### Small Graph (4 Nodes, 5 Edges)
- **Dagre:** ~2ms. 
- **Custom Engine:** ~10ms. 
  - *Operation Count:* The search space is tiny. The engine evaluates maybe 2 layout states. A* explores a 200x200 pixel grid, visiting ~50 grid cells per edge. Total operations: negligible. A perfect layout is found instantly.

### Medium Graph (15 Nodes, 20 Edges)
- **Dagre:** ~8ms.
- **Custom Engine:** ~150ms. 
  - *Operation Count:* The A* router evaluates thousands of grid states to route edges cleanly around the 15 obstacles. The frontier queue grows to evaluate different port assignments. The engine might score 30 different layout permutations.

### Large Graph (80 Nodes, 120 Edges)
- **Dagre:** ~40ms. Stable and reliable.
- **Custom Engine:** 
  - *Without limits:* The engine would evaluate millions of states, attempting to untangle 120 edges. It would take several minutes and crash the browser tab due to out-of-memory errors from the frontier queue.
  - *With our limits (Budget Adaptive):* ~1200ms, returning a "good enough" layout rather than a perfect one.

## Two Massive Safeguards

Because the custom engine is so computationally heavy, we use two critical architectural safeguards to protect the user experience.

### 1. The Web Worker Architecture
If a calculation takes 1.2 seconds on the main thread, the entire browser tab freezes. The user cannot scroll, click, or even see CSS hover animations.

To solve this, the custom engine runs entirely in a background Web Worker (see [`customLayoutWorkerClient.ts`](../../src/engine/layout/custom/customLayoutWorkerClient.ts)). 
- The main thread gathers the nodes, serializes them, and posts them to the worker.
- The worker crunches the A* math for 1-2 seconds. The UI remains 100% buttery smooth and can show a loading spinner.
- **The Timeout:** If the computation exceeds 5,000ms (5 seconds), the main thread forcibly terminates the worker and throws a `LayoutTimeoutError`, preventing infinite stalls. It can then safely fall back to Dagre.

### 2. Budget-Adaptive Search
We do not allow the search to run infinitely. In [`config.ts`](../../src/engine/layout/custom/config.ts), we define strict execution budgets to rein in the exponential branching:

- `maxLayoutStates: 50`: The engine will only ever evaluate 50 top-level layout variations before returning the best one it found.
- `maxAStarStatesPerRoute: 2000`: When routing a single edge, if A* explores 2,000 grid cells and still hasn't found a path to the target, it gives up. It accepts a suboptimal route (perhaps cutting straight through a node) and moves on.

These budgets guarantee the algorithm completes in bounded time. As the graph gets larger, the engine seamlessly trades aesthetic perfection for guaranteed completion times.
