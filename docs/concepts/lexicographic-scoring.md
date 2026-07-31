← Previous | [Index](../README.md) | Next →

# Lexicographic Scoring

## The Problem: What is a "Good" Layout?

Imagine two graph layouts. 
- Layout A has 0 edge crossings, but edges are extremely long and bend 15 times. 
- Layout B has 1 edge crossing, but edges are short and straight. 

Which is better? A single numeric score (like "Score = crossings * 10 + bends * 2") is highly unstable. If you tweak the weights, you accidentally break other layouts. Certain flaws (like nodes physically overlapping each other) are fatal errors and should NEVER be accepted, regardless of how straight the edges are.

## The Concept: Dictionary Ordering

"Lexicographic" means sorting like a dictionary. When comparing "Apple" and "Axe", you look at the first letter. If it's a tie ('A' == 'A'), you look at the second letter ('p' vs 'x'). 

We apply this to a **score vector** representing a layout's flaws. We prioritize fatal errors first, then structural flaws, then aesthetic preferences.

If Layout A has `[0, 5]` (0 overlaps, 5 crossings) and Layout B has `[1, 0]` (1 overlap, 0 crossings), Layout A wins immediately. We don't even look at the crossings because Layout A won at the first (most important) dimension.

## The Priority Vector

In our custom layout engine, a layout is evaluated against a 21-dimension vector of penalties (lower is better). See [`ORDER` in `layoutObjective.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/layoutObjective.ts#L14-L36).

### 1. Hard Errors (The "Never Accept" Tier)
1. `hardErrorCount`: Fatal routing failures.
2. `unresolvedRouteCount`: Edges that couldn't find a path to their target.
3. `nodeNodeOverlaps`: Nodes placed on top of each other.
4. `edgeNodePenetrations`: Edges cutting through the middle of a node.

### 2. Structural Quality (The "Legibility" Tier)
5. `sharedEdgeSegmentLength`: Edges drawn exactly on top of each other (ambiguous paths).
6. `unresolvedBadgeCount`: Badges that couldn't be placed.
7. `badgeNodeOverlaps` / `badgeBadgeOverlaps` / `badgeUnrelatedEdgeOverlaps`: Badges colliding with geometry.
10. `crossingCount`: How many times edges cross each other.

### 3. Aesthetic Quality (The "Polish" Tier)
11. `ordinaryLeaderCount`: Badges needing a leader line.
12. `avoidableHairpinCount`: Edges that U-turn unnecessarily.
13. `excessBendCount`: Edges with too many 90-degree corners.
14. `hairpinCount`: Total number of U-turns.
15. `bendCount`: Total number of 90-degree bends.
16. `directionDeviationPenalty`: Edges flowing against the intended Top-to-Bottom direction.
17. `totalLength`: The sum of all edge pixel lengths (shorter is tighter).
18. `portSideImbalance`: Uneven distribution of edges connecting to a node's sides.
19. `feedbackLeaderCount`: Leader lines on feedback edges.
20. `totalLeaderLength`: Sum length of badge leader lines.
21. `totalArea`: Total bounding box area of the layout.

## A Concrete Example

Let's evaluate two layout states during optimization. We'll simplify the vector to just 5 dimensions: `[Overlaps, Crossings, Hairpins, Bends, Length]`.

- **State Alpha**: `[0, 1, 0, 4, 1200]`
- **State Beta**: `[0, 0, 2, 8, 1500]`

**Comparison:**
- Dimension 0 (Overlaps): Tie (0 == 0). Move to next.
- Dimension 1 (Crossings): Beta (0) beats Alpha (1). **Beta Wins.**

Even though Beta is much uglier (it has hairpins, double the bends, and is 300px longer), it is technically a superior layout because it eliminated a crossing, which is a higher-priority structural rule.

## How the Optimization Loop Uses This

This scoring system drives the core of our custom layout engine. 
1. The engine maintains a "Frontier Queue" of partial layout states.
2. It sorts this queue using the `compareLayoutScore` function.
3. It pops the best state off the queue, generates slight variations (neighbors) of that layout, scores them, and pushes them back into the queue.
4. The search terminates when it finds a layout with a "perfect" score (zeros in all dimensions) or when it runs out of its computation budget, returning the best state found so far.
