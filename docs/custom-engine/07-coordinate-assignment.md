← [Crossing Minimization](./06-crossing-minimization.md) | [Index](./README.md) | [Next: Edge Routing →](./08-edge-routing.md)

# Chapter 7: Coordinate Assignment with PAVA

After crossing minimization, our graph has a beautiful property: we know the exact left-to-right _order_ of every node within every layer. We know that `Node A` comes before `Node B`, which comes before `Node C`.

What we don't know are their actual pixel coordinates on the screen.

In this chapter, we will assign precise X and Y coordinates to every node. We'll start with a simple idea, watch it fail, and then introduce one of the most elegant algorithms in our engine: the Pool Adjacent Violators Algorithm (PAVA).

---

## Atoms: The Spacing Problem

What happens if we just space nodes evenly across each layer?

Imagine a 3-layer graph. `Node A` in the middle layer connects to two nodes on the far right of the top and bottom layers.

```text
Layer 1:  [1]      [2]      [3]
Layer 2:  [A]      [B]      [C]
Layer 3:  [4]      [5]      [6]
```

_(Nodes 3, A, and 6 are connected: 3 → A → 6)_

If we naively give every node an even spacing of 100 pixels:

- Node 3 is at X = 300
- Node A is at X = 100
- Node 6 is at X = 300

The edges from 3 → A and A → 6 will span all the way across the graph diagonally. This creates long, distracting lines that cross through empty space and make the graph hard to read.

**The Goal:** We want edges to be as short and vertical as possible. To achieve this, a node's ideal X position should be close to the X positions of its neighbors.

---

## Molecules: Median Positioning

To keep edges short, a node should look at where its connected neighbors are, and try to place itself right in the middle of them.

But should we use the **mean** (average) or the **median** of the neighbors' positions?

Let's look at an example. Suppose a node has three neighbors. Their X coordinates are `50`, `60`, and `300`.

- **Mean position:** $(50 + 60 + 300) / 3 = 136.67$
- **Median position:** The middle value when sorted: `60`

If we use the mean, the outlier at `300` pulls our node far to the right, abandoning the cluster of edges at `50` and `60`. The mean is too sensitive to outliers.

The **median** ignores the extreme outlier and places our node right where the majority of its edges are going. This creates tightly bundled, vertical edge flows.

### Iterative Sweeping

Because every node's ideal position depends on its neighbors, and its neighbors are also moving, we cannot solve this in one step. Instead, we use an iterative approach:

1. Look at current node positions.
2. For every node, calculate its ideal desired position (the median of its neighbors' positions).
3. Move the node toward its ideal position.
4. Repeat until the layout settles (converges).

_Example of a single node updating over iterations:_

- **Start:** Node is at X=0. Neighbors are at `[100, 110, 120]`. Median = `110`.
- **Iteration 1:** Node moves toward `110`. Its neighbors also moved, let's say to `[105, 115, 125]`. New median = `115`.
- **Iteration 2:** Node moves toward `115`.
- Over a few sweeps, the entire graph relaxes into an optimal state.

---

## Cells: The Monotonicity Constraint

There is a fatal flaw in the median positioning approach.

What if Node A wants to move to `X=200` to be near its neighbors, but Node B (which is supposed to be to the right of A) wants to move to `X=100`?

If we just move them to their desired positions, Node A is now to the right of Node B. **They have crossed!** All of the hard work we did in the Crossing Minimization phase is destroyed.

We must enforce a strict rule: **The sequence of X coordinates in a layer must be strictly increasing.**
$X_0 < X_1 < X_2 < ... < X_k$

Furthermore, nodes have widths, and we need minimum gaps between them. So the rule is actually:
$X_i \ge X_{i-1} + \text{width}(i-1)/2 + \text{width}(i)/2 + \text{gap}$

To simplify the math, we convert the desired X coordinates into "gap-adjusted" coordinates (let's call them $z_i$). Now our constraint is simply a monotonic requirement:
$z_0 \le z_1 \le z_2 \le ... \le z_k$

### Enter PAVA

We have a sequence of desired positions that might violate our non-decreasing constraint. We need to find the _closest possible valid positions_. This mathematical problem is called **Isotonic Regression**.

The optimal way to solve this in linear time is the **Pool Adjacent Violators Algorithm (PAVA)**.

The rules of PAVA are beautiful and simple:

1. Walk through the list of nodes from left to right.
2. Push each node onto a stack.
3. If the top of the stack is smaller than the item below it, we have a violation! The node on the left is further right than the node on the right.
4. **POOL** them: merge the two nodes into a single block, and give them the _average_ of their desired positions.
5. Check if this new merged block violates the block below it. If so, pool again. Repeat until the stack is valid.

### Traced Execution of PAVA

Let's trace PAVA on a 5-node layer.
Our gap-adjusted desired positions are: `[100, 50, -120, 200, 180]`.
_(Notice how node 1 wants to be at 50, but node 0 is at 100. This is a violation!)_

| Step | Action                                 | Node / Value                      | Stack State (Top is on right)                  |
| ---- | -------------------------------------- | --------------------------------- | ---------------------------------------------- |
| 1    | Push node 0                            | `100`                             | `[(100, size:1)]`                              |
| 2    | Push node 1                            | `50`                              | `[(100, size:1), (50, size:1)]`                |
| 3    | **Violation!** `100 > 50`. Pool them.  | Average: `(100+50)/2 = 75`        | `[(75, size:2)]`                               |
| 4    | Push node 2                            | `-120`                            | `[(75, size:2), (-120, size:1)]`               |
| 5    | **Violation!** `75 > -120`. Pool them. | Average: `(75*2 + -120*1)/3 = 10` | `[(10, size:3)]`                               |
| 6    | Push node 3                            | `200`                             | `[(10, size:3), (200, size:1)]`                |
| 7    | Push node 4                            | `180`                             | `[(10, size:3), (200, size:1), (180, size:1)]` |
| 8    | **Violation!** `200 > 180`. Pool them. | Average: `(200+180)/2 = 190`      | `[(10, size:3), (190, size:2)]`                |

**Final Stack Unpacking:**

- Block 1 (size 3, value 10): Nodes 0, 1, and 2 all get assigned the base position `10`.
- Block 2 (size 2, value 190): Nodes 3 and 4 get assigned the base position `190`.

Once we add back the spacing gaps we subtracted earlier, the nodes will be perfectly spaced apart, strictly maintaining their order, while staying as close as mathematically possible to their median targets!

---

## Organisms: Connecting to the Engine

### Why PAVA is Optimal

PAVA isn't just a heuristic; it is an exact solver. It provably minimizes the sum of squared deviations from the desired target positions, subject to the monotonicity constraint. In simple terms: it is mathematically impossible to find a set of non-overlapping coordinates that are closer to the ideal median positions.

### Integration in the Pipeline

1. **Inputs from earlier:** PAVA relies on the layer ordering produced by [Crossing Minimization](./06-crossing-minimization.md).
2. **State-Space Search:** The optimizer (discussed in Chapter 10) will try many different random initial node orderings. Each ordering produces a different amount of crossings, which in turn produces a different PAVA coordinate resolution. The engine evaluates the aesthetics of the final assigned coordinates to pick the best overall layout.
3. **Spacing Demands:** Complex UI elements like badges or interactive labels require dynamic spacing. These become `spacingOverrides` which alter the cumulative gap offsets ($s_i$) fed into the PAVA block resolver.

### Source Code References

- See the main assignment loop: [`assignCoordinates`](../../src/engine/layout/custom/coordinateAssignment.ts#L199-L210)
- See the core PAVA implementation and gap projection: [`projectLayerCenters`](../../src/engine/layout/custom/coordinateAssignment.ts#L110-L195)
- See how coordinates integrate into the master node layout phase: [`computeNodeLayout`](../../src/engine/layout/custom/nodeLayout.ts#L34-L71)

---

← [Crossing Minimization](./06-crossing-minimization.md) | [Index](./README.md) | [Next: Edge Routing →](./08-edge-routing.md)
