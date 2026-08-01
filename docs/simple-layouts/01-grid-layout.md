← [Overview](./README.md) | [Index](../README.md) | [Next: Circular Layout →](./02-circular-layout.md)

# Grid Layout

In the GVUI application, you will see a layout option named **"Organic Force (Physics Force-Directed)"**.

**Let's be completely honest: This is a static grid layout.** There is absolutely no physics simulation, no forces, and nothing organic about it. It is a mathematical grid with a slight row stagger to make it look less robotic.

See the implementation here: [computeForceLayout](../../src/engine/layout/layoutDispatcher.ts#L68-L129).

## How It Works

Because we ignore edges entirely, placing nodes is just a matter of dividing them into rows and columns.

1. **Calculate Columns:** `columns = ceil(sqrt(N))`
   This ensures the grid is roughly square. If we have 8 nodes, `sqrt(8) ≈ 2.82`, so we round up to `3` columns.
2. **Spacing:**
   We assign a fixed horizontal spacing of `350px` and a vertical spacing of `220px`.
3. **Row Staggering:**
   To break up the visual monotony of a perfect grid, odd-numbered rows are shifted right by `40px`.

### Concrete Example: 8 Nodes

Let's arrange 8 nodes. `columns = 3`.

- **Node 0**: col 0, row 0 (x: 50, y: 50)
- **Node 1**: col 1, row 0 (x: 400, y: 50)
- **Node 2**: col 2, row 0 (x: 750, y: 50)
- **Node 3**: col 0, row 1 (x: 90, y: 270) _(Shifted by 40px because row 1 is odd)_
- **Node 4**: col 1, row 1 (x: 440, y: 270)
- **Node 5**: col 2, row 1 (x: 790, y: 270)
- **Node 6**: col 0, row 2 (x: 50, y: 490)
- **Node 7**: col 1, row 2 (x: 400, y: 490)

Visually, it looks like this:

```text
[Node 0]           [Node 1]           [Node 2]

      [Node 3]           [Node 4]           [Node 5]

[Node 6]           [Node 7]
```

### Edges

Edges are drawn as simple straight lines (`L` in SVG paths) between the exact center points of the source and target nodes. The edge labels are placed at the mathematical midpoint of this line: `(srcCx + tgtCx) / 2`.

## Why It's Useful

Despite the misleading name, this layout is extremely valuable:

- **`O(N)` Time Complexity:** Calculating a grid takes fractions of a millisecond. It scales perfectly to thousands of nodes.
- **Fast Scanning:** When you just want to see a list of entities (e.g., all servers in a cluster), a grid is the most efficient way for human eyes to scan them.
- **No Layout Delay:** The layout requires a single pass over the nodes array, producing instant visual results.

---

## Future: Real Force Simulation (UNIMPLEMENTED)

> [!WARNING]
> The following section describes an algorithm that is **NOT YET IMPLEMENTED** in our codebase. It explains what a _real_ force-directed layout would look like if we built one.

If we wanted to actually build the "Organic Force" layout the UI promises, we would implement a physics simulation like the **Fruchterman-Reingold algorithm**.

### The Problem with Grids

Grids ignore edges. If Node 0 and Node 7 are heavily connected, they are still drawn far apart. A force simulation fixes this by letting the edges dictate the positions.

### The Forces

In a true force-directed graph, we treat the graph as a physical system:

1. **Repulsion (Coulomb's Law):** Every node acts like a negatively charged magnet, repelling _every other node_. This prevents nodes from overlapping.
2. **Attraction (Hooke's Law):** Every edge acts like a physical spring. If two nodes are connected, the spring pulls them together.

### The Algorithm

Unlike our `O(N)` grid which calculates final positions in one step, a physics engine runs an iterative loop:

1. Place nodes randomly.
2. Calculate the repulsive force between all pairs of nodes (pushes them apart).
3. Calculate the attractive force along all edges (pulls connected nodes together).
4. Move each node slightly based on the net force acting on it.
5. "Cool down" the system (reduce how much nodes can move) so it eventually settles into a stable state.
6. Repeat steps 2-5 for hundreds of iterations.

### Why Do We Want It?

A force-directed layout naturally untangles graphs. Highly connected clusters clump together, while unrelated nodes push to the edges of the screen. It reveals the _organic topology_ of the network without requiring the rigid hierarchy of a layered algorithm. However, because it calculates forces between all pairs, its complexity is `O(N^2)` per iteration, making it much slower than our simple grid.
