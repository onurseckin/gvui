← Previous | [Index](../README.md) | Next →

# Lexicographic Scoring

## The Problem: What is a "Good" Layout?

Imagine you are trying to write a computer program to decide if a graph layout looks "good."

You might start by simply counting the number of times edges cross each other.

- **Layout A** has 0 crossings.
- **Layout B** has 1 crossing.
  So, A is better than B.

But what if Layout A achieved 0 crossings by drawing an edge that takes 15 different 90-degree turns and stretches across the entire screen? What if Layout A placed two nodes directly on top of each other?

To fix this, developers usually create a **weighted sum** formula:
`Score = (overlaps * 1000) + (crossings * 100) + (bends * 10) + (length * 1)`

**The Fatal Flaw of Weighted Sums:**
If you tweak the weights to fix one badly routed graph, you accidentally break three other graphs. If a layout has 0 overlaps but 11 crossings (penalty 1100), the math might decide it's "cheaper" to just place two nodes on top of each other (penalty 1000) to save the crossings. This is unacceptable. Certain flaws (like nodes overlapping) are **fatal errors** and should never be traded for aesthetic improvements.

## The Aha Moment: Dictionary Ordering

"Lexicographic" simply means sorting like a dictionary. When comparing the words "Apple" and "Axe", you don't calculate a weighted sum of the letters. You look at the first letter. If it's a tie, you look at the second letter. The first letter has absolute, infinite priority over the second letter.

We apply this exact concept to a **score vector** representing a layout's flaws.

If Layout A has `[0 overlaps, 5 crossings]` and Layout B has `[1 overlap, 0 crossings]`, Layout A wins immediately. We don't even look at the crossings. Layout A won at the first (most important) dimension. There is no math, no weight tuning, and no accidental trade-offs.

## The Priority Vector

In our custom layout engine, every proposed layout is evaluated against a 21-dimension vector of penalties (where lower is better).

You can see the exact definition in [`ORDER` in `layoutObjective.ts`](../../src/engine/layout/custom/layoutObjective.ts#L14-L36). Here is why they are ordered this way:

### 1. Hard Errors (The "Never Accept" Tier)

These dimensions represent fundamentally broken layouts. If these are non-zero, the graph is illegible.

- **`hardErrorCount`**: Fatal routing failures (e.g., memory limits exceeded).
- **`unresolvedRouteCount`**: Edges that completely failed to find a path to their target.
- **`nodeNodeOverlaps`**: Nodes placed physically on top of each other.
- **`edgeNodePenetrations`**: Edges cutting through the middle of a node instead of routing around it.

### 2. Structural Quality (The "Legibility" Tier)

Once we guarantee the layout isn't broken, we optimize for readability.

- **`sharedEdgeSegmentLength`**: Edges drawn exactly on top of each other (making it impossible to tell which path goes where).
- **`unresolvedBadgeCount`**: Edge badges that couldn't fit anywhere.
- **`badgeNodeOverlaps`**: Badges colliding with nodes or other badges.
- **`crossingCount`**: How many times edges cross each other. (Notice how crossings are actually dimension #10 — overlaps and penetrations are far worse!)

### 3. Aesthetic Quality (The "Polish" Tier)

Only when two layouts tie on all structural rules do we look at aesthetics.

- **`avoidableHairpinCount`**: Edges that U-turn unnecessarily.
- **`bendCount`**: Total number of 90-degree corners.
- **`directionDeviationPenalty`**: Edges flowing against the intended Top-to-Bottom direction.
- **`totalLength`**: The sum of all edge pixel lengths (shorter is tighter).
- **`totalArea`**: Total bounding box area of the layout (dimension #21).

## A Concrete Traced Example

Let's evaluate three layout states during optimization. We'll simplify the vector to just 5 dimensions:
`Vector = [Overlaps, Crossings, Hairpins, Bends, Length]`

Imagine our A* engine generates three possible layouts for a small 4-node graph:

**State Alpha (The Messy Default):**

- 0 overlaps.
- 1 crossing.
- 0 hairpins.
- 4 bends.
- 1200px length.
- **Vector**: `[0, 1, 0, 4, 1200]`

**State Beta (The Long Detour):**

- 0 overlaps.
- 0 crossings. (It routed around the crossing!)
- 2 hairpins.
- 8 bends.
- 1500px length.
- **Vector**: `[0, 0, 2, 8, 1500]`

**State Gamma (The Fatal Error):**

- 1 overlap. (Nodes pushed too close together).
- 0 crossings.
- 0 hairpins.
- 2 bends.
- 800px length.
- **Vector**: `[1, 0, 0, 2, 800]`

### The Comparison Walkthrough

**1. Alpha vs Gamma:**

- Dimension 0 (Overlaps): Alpha has 0. Gamma has 1.
- **Result:** Alpha wins. Gamma is immediately discarded, even though Gamma has shorter edges and fewer bends.

**2. Alpha vs Beta:**

- Dimension 0 (Overlaps): Tie (0 == 0). Move to Dimension 1.
- Dimension 1 (Crossings): Alpha has 1. Beta has 0.
- **Result:** Beta wins.

Even though Beta is technically "uglier" (it has 2 hairpins, double the bends, and is 300px longer than Alpha), it is mathematically the superior layout because it eliminated a crossing, which is a higher-priority structural rule.

## How the Engine Uses This

This scoring system drives the core `compareLayoutScore` function in the custom layout engine.

1. The engine maintains a "Frontier Queue" of thousands of partial layout states.
2. It sorts this queue lexicographically.
3. It pops the absolute best state off the queue, generates slight variations (neighbors) of that layout, scores them, and pushes them back into the queue.
4. Because the rules are strict priorities, the search naturally glides toward structurally sound layouts before it even wastes CPU cycles trying to optimize for edge lengths.
