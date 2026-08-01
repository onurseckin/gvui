# Edge Routing with A*

← [Coordinate Assignment](./07-coordinate-assignment.md) | [Index](./README.md) | [Next: Badge Placement →](./09-badge-placement.md)

You have beautifully positioned your nodes. The coordinates are perfect. Now you just need to draw the lines connecting them. What could go wrong?

## The Problem with Straight Lines

The most intuitive approach is to draw a straight line from Node A to Node B. Let's see what happens to a simple 5-node graph when we do that:

```text
[Node A] ------------------------> [Node B]
    \                                /
     \                              /
      \          [Node C]          /
       \                          /
        \                        /
         v                      v
[Node D] ------------------------> [Node E]
```

Without any routing logic, edges blast right through the interior of `[Node C]`. They overlap each other. They become an unreadable tangled mess. The reader cannot trace which line goes where.

To fix this, we use **orthogonal routing**. Orthogonal edges travel exclusively in horizontal or vertical lines, making crisp 90-degree bends. More importantly, they navigate _around_ obstacles rather than passing through them.

The exact same graph, routed orthogonally, looks like this:

```text
[Node A] ------------------------> [Node B]
    |                                ^
    |                                |
    +--------> [Node C] --------+    |
                                |    |
[Node D] -----------------------+----+
                                     |
                                     v
                                   [Node E]
```

To achieve this clean look, we need an algorithm capable of finding a path from point A to point B while avoiding obstacles.

## A* Pathfinding from Scratch

If you've never encountered pathfinding before, you might wonder how a computer finds its way through a maze. We use an algorithm called **A*** (pronounced "A-star").

### The Routing Grid

First, we can't search through infinite space. We discretize our canvas by laying down a **Routing Grid**. We draw invisible horizontal and vertical lines extending from every node and port.

Our grid is made of **cells**. Each cell is either:

- **Free**: An empty space an edge can travel through.
- **Blocked**: Occupied by a node (an obstacle).

### The A* Algorithm

A* finds the shortest path on this grid by exploring the space step by step. For every grid point it evaluates, it calculates three values:

1. **`g(n)`**: The exact cost it took to travel from the start point to the current point `n`.
2. **`h(n)`**: The _estimated_ remaining cost from point `n` to the target. We use the **Manhattan distance** (the sum of horizontal and vertical distances, as if driving on city blocks) because we can only move orthogonally.
3. **`f(n) = g(n) + h(n)`**: The total estimated cost of the path going through this point.

A* keeps track of all the points it has discovered but not yet fully explored in an **Open Set** (usually implemented as a min-heap). The algorithm is simple:

1. Look at the Open Set. Pick the point with the lowest `f(n)`.
2. Are we at the target? We're done!
3. If not, look at the neighboring grid points.
4. For each neighbor, calculate its new `g`, `h`, and `f`. Add it to the Open Set.
5. Repeat.

### A Small Example

Imagine a 5×5 grid. We want to go from Start `(0,2)` to Target `(4,2)`. There is an obstacle node blocking the direct path at `(2,2)`.

```text
  0 1 2 3 4
0 . . . . .
1 . . . . .
2 S . [O] T
3 . . . . .
4 . . . . .
```

- A* starts at `S(0,2)`. `g=0`, `h=4` (Manhattan distance to `T`), `f=4`.
- It explores neighbors `(0,1)`, `(1,2)`, `(0,3)`.
- `(1,2)` has `g=1`, `h=3` (distance from 1,2 to 4,2), `f=4`.
- It picks `(1,2)`. From there, `(2,2)` is an obstacle, so it can't go right. It explores `(1,1)` and `(1,3)`.
- Over time, A* expands points outward, heavily favoring points that move _closer_ to the target (because they have lower `h(n)`), smoothly flowing around the obstacle to eventually hit `T`.

## The 3D State Extension

In a standard A* grid, our state is just a 2D coordinate: `(x, y)`. But our graph engine doesn't just want _any_ path. It wants a _beautiful_ path.

Look at these two paths between the same points:

**Path A:**

```text
S --+
    |
    +--+
       |
       +-- T
```

**Path B:**

```text
S -----+
       |
       |
       +-- T
```

Both have the same length. Standard A* would treat them identically. But Path A has three bends, while Path B has only two. Bends make the graph harder to read. We want to penalize bends!

To do this, our engine extends the state space into 3D. We track `(x, y, DIRECTION)`.

### Penalizing Turns

When evaluating a step from the current point to a neighbor, we look at our _current direction_ and the _new direction_.

- **Straight**: (e.g., Right → Right). Cost = Base distance.
- **Bend**: (e.g., Right → Down). Cost = Base distance + **Bend Penalty**.
- **Hairpin/U-Turn**: (e.g., Right → Left). Cost = Base distance + **Hairpin Penalty** (massive).

Let's plug in real numbers. Assume:

- Base step cost = 10
- Bend penalty = 18
- Hairpin penalty = 100

**Evaluating Path A (length 4 steps, 3 bends):**

- Step 1 (Straight): 10
- Step 2 (Bend): 10 + 18 = 28
- Step 3 (Bend): 10 + 18 = 28
- Step 4 (Bend): 10 + 18 = 28
- **Total Cost = 94**

**Evaluating Path B (length 4 steps, 2 bends):**

- Step 1 (Straight): 10
- Step 2 (Straight): 10
- Step 3 (Bend): 10 + 18 = 28
- Step 4 (Bend): 10 + 18 = 28
- **Total Cost = 76**

A* will naturally select Path B because the total cost `g(n)` is lower. By embedding the direction into the state, the algorithm natively optimizes for the cleanest aesthetic shape!

### Occupancy Tracking

Once an edge is routed, it claims the grid cells it traversed. When routing the _next_ edge, we check the `RouteOccupancyLedger`. If the new edge needs to cross an occupied cell perpendicularly, it pays a "crossing penalty." If it tries to travel _along_ an occupied cell collinearly (overlapping an existing line), the path is rejected entirely.

## Rip-Up and Reroute

There is a fatal flaw in routing edges one by one: **The Order Matters.**

If we route Edge 1 first, it might take the perfect, beautiful central path. But in doing so, it completely blocks the only reasonable path for Edge 2, forcing Edge 2 to take a horrible, highly penalized detour. If we had routed Edge 2 first, perhaps _both_ could have found acceptable paths.

### Order Variants

Because we cannot know the optimal order in advance, the engine tries multiple approaches. See [edgeRouter.ts](../../src/engine/layout/custom/edgeRouter.ts).

The engine sorts the edges using up to 6 different strategies:

1. **Hardest First**: Ranks edges by how difficult they are (feedback edges, long rank spans, large badges).
2. **Reverse Hardest First**: The opposite.
3. **Badge Area Descending**: Route the edges carrying the largest labels first so they have room.
4. **Source Node/Port**: Top-to-bottom, left-to-right.
5. **Rank Span Ascending**: Shortest edges first.
6. **Edge ID**: Alphabetical fallback.

It routes the entire graph under each ordering, grades the final layout (counting crossings, bends, and penalties), and picks the best one.

### Conflict Resolution

If a specific routing order leaves a small group of edges in conflict (say, 3 edges that keep blocking each other and failing to route), the engine attempts a micro-optimization.

For conflict sets of 6 edges or fewer, it generates all possible permutations of routing those specific edges. It rips them up, tries every permutation, and permanently commits the one that yields the fewest crossings.

### Connection to the Big Picture

Routing is highly sensitive to the start and end points. In the outer optimization loop (which we will cover in Chapter 10), the engine repeatedly mutates port assignments (which side of the node the edge connects to). Every single time a port moves, this entire A* routing process, complete with rip-up and reroute, is executed again to evaluate if the new port assignment is better!

## Source Code Reference

- **Search Algorithm**: The core A* implementation is in [`searchOrthogonalRoute`](../../src/engine/layout/custom/routeSearch.ts#L467-L740).
- **Grid Construction**: Translating coordinates into traversable segments happens in [`buildRoutingGrid`](../../src/engine/layout/custom/routingGrid.ts).
- **Occupancy Tracking**: The ledger tracking crossings and overlaps is [`RouteOccupancyLedger`](../../src/engine/layout/custom/routeOccupancy.ts#L170-L358).
- **Orchestration**: The loop managing order variants, rip-up, and permutations is in [`routeAllEdges`](../../src/engine/layout/custom/edgeRouter.ts#L105-L638).

← [Coordinate Assignment](./07-coordinate-assignment.md) | [Index](./README.md) | [Next: Badge Placement →](./09-badge-placement.md)
