← [Previous: Badge Placement](./09-badge-placement.md) | [Index](./README.md) | [Next: Aesthetic Refinement →](./11-aesthetic-refinement.md)

# The State-Space Search Optimization Loop

This chapter covers the optimization loop—the beating heart of the custom engine that elevates it from a standard layout algorithm to a high-quality visualization tool.

## Atoms: Why Do We Need a Loop?

The Sugiyama pipeline (layering → ordering → positioning → routing) runs once to produce a layout. However, a single pass relies on arbitrary choices. For example: Which side of a node should an edge connect to? What order should the ports be in?

Different choices produce drastically different layouts. Some are beautiful; some are a tangled mess of crossings, overlapping badges, and U-turns.

**Example: Port Assignments Matter**

_Layout 1 (Arbitrary Ports): 3 Crossings_

```text
[Node A]      [Node B]
  (R)           (L)
   | \         / |
   |  \       /  |
   |   \     /   |
   |    \   /    |
   |      X      |
   |    /   \    |
  (L) (R)   (L) (R)
[Node C]      [Node D]
```

_Layout 2 (Optimized Ports): 0 Crossings_

```text
[Node A]      [Node B]
  (B)           (B)
   |             |
   |             |
  (T)           (T)
[Node C]      [Node D]
```

How do we find the optimized version? We can't just guess. We have to _search_ for it.

## Molecules: Search States and Scores

To search for the best layout, we define a **search state**. A state encodes all the choices made during a pipeline run:

- Port side assignments (e.g., Node A connects on the Bottom)
- Port attachment orders
- Layer node orders
- Spacing demands

The layout pipeline essentially becomes a pure function: `State → Layout → Score`. Our goal is to find the state that yields the best score.

### The Lexicographical Score Vector

The score isn't a single number; it's a multi-dimensional vector ordered lexicographically. Hard constraints (errors) come first, followed by aesthetic quality metrics.

1. Unresolved routes (Error)
2. Node overlaps (Error)
3. Edge crossings (Quality)
4. Hairpins / U-turns (Quality)
5. Edge bends (Quality)
6. Total edge length (Quality)

Let's compare two states:

- **State A Score**: `[0, 0, 3, 5, 12]` (0 overlaps, 3 crossings, 5 bends...)
- **State B Score**: `[0, 0, 2, 8, 20]` (0 overlaps, 2 crossings, 8 bends...)

**State B wins.** It has fewer crossings (dimension 3). Even though it has more bends and longer edges, the score vector evaluates dimensions strictly in order. A layout with fewer crossings is always preferred over one with fewer bends.

## Cells: Best-First Search Execution

The engine uses a Best-First Search to explore the state space. It maintains a **Frontier Queue** sorted by score, always expanding the most promising state first.

### Neighborhood Generation

From the current best state, how do we find new layouts? We generate neighbors by making small, bounded mutations. See [generateNeighborhoodStates](../../src/engine/layout/custom/neighborhoodSearch.ts#L442).

- **Flipping port sides**: Move an edge from a node's left side to its bottom.
- **Swapping port orders**: Reorder how edges attach to the same side.
- **Swapping layer orders**: Change the sequence of nodes in a rank to untangle crossings.
- **Expanding spacing demands**: Request more room if badges are cramped.
- **Crossing component repairs**: Coordinated multi-edge moves specifically targeted to fix edge crossings.

### Traced Execution Example

Let's watch the search run on a small graph:

| Iteration | Action        | State Evaluated | Score (Overlaps, Crossings, Bends) | Status                    |
| --------- | ------------- | --------------- | ---------------------------------- | ------------------------- |
| 1         | Initial State | State 0         | `[0, 3, 4]`                        | Expand State 0            |
| 2         | Gen Neighbors | State 1         | `[0, 4, 5]`                        | Queued                    |
| 3         | Gen Neighbors | State 2         | `[0, 1, 6]`                        | **Best!** Expand State 2  |
| 4         | Gen Neighbors | State 3         | `[0, 1, 8]`                        | Queued                    |
| 5         | Gen Neighbors | State 4         | `[0, 0, 4]`                        | **Zero Crossings! Stop.** |

### Budget Control and Stop Conditions

Large graphs have astronomically large state spaces. To ensure the engine remains fast, the search is strictly budgeted. Small graphs (≤5 nodes) might get 20+ states to explore, while large graphs (≥10 nodes) get heavily restricted budgets (≤8 states).

The search stops when:

1. A perfect layout is found (0 errors, 0 crossings, 0 hairpins).
2. The frontier queue is exhausted.
3. The evaluation budget is exceeded.
4. The soft realtime deadline is hit.

## Organisms: The Custom Engine Insight

This search loop is the defining insight of the engine. Traditional algorithms build a single pipeline and hope the heuristics work out. This engine treats the pipeline as a fitness function and _searches_ over the space of all possible pipeline configurations.

This approach guarantees that if a clean, crossing-free layout exists within the neighborhood of the initial heuristic, the engine will find it.

For implementation details, explore:

- [neighborhoodSearch.ts](../../src/engine/layout/custom/neighborhoodSearch.ts)
- [layoutOptimizerState.ts](../../src/engine/layout/custom/layoutOptimizerState.ts)
- [stateEvaluator.ts](../../src/engine/layout/custom/stateEvaluator.ts)
