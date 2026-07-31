← [Previous: Edge Routing](./08-edge-routing.md) | [Index](./README.md) | [Next: Optimization Loop →](./10-optimization-loop.md)

# Badge Placement & Spacing Demands

This chapter explores how the custom engine handles edge labels ("badges") without allowing them to overlap with each other, with nodes, or with unrelated edges. 

Badge placement is a critical differentiator of this custom engine. Standard layout algorithms (like Dagre) have no native concept of badge-aware spacing, leaving you to figure out where to put labels after routing, which usually results in unreadable overlaps.

## Atoms: The Badge Collision Problem

In our system, edges can have badges that show connection type, status, or other metadata. These badges are small rectangles that must be placed along the edge path.

The fundamental problem: badges take up physical space. If we blindly place them, they collide.

Imagine three edges converging into the same node `Node Z`. If we place a badge at the midpoint of each edge, the badges will overlap each other, making them unreadable.

**The Collision (Before)**
```text
        [Node A]
           |
        [Badge1]
           |
        [Node B]---[Badg[Node Z]  <-- Badge 2 overlaps Node Z and Badge 3!
           |            |
        [Badge3]--------+
```

Without a system to manage badge placement and push nodes apart, the visual output is chaotic.

## Molecules: Placement and Spacing Demands

Where should we place a badge? The most natural spot is the midpoint of the edge path. But when two edges are routed close together, their midpoints overlap.

### The Spacing Demand Concept

To prevent overlaps, each badge needs a minimum clearance zone—a rectangle around it where nothing else can exist. If the clearance zones of two badges overlap, we have to push the underlying nodes or layers further apart. This is called a **spacing demand**.

A spacing demand is a tuple carrying critical information:
- `requiredGap`: The exact pixel distance needed.
- `type`: Whether it's a `node-gap` (horizontal space between nodes in the same layer) or a `rank-gap` (vertical space between layers).
- `participants`: Which nodes/edges are involved, so we know exactly what to push apart.

Let's look at the math for a spacing demand between two adjacent nodes on the same rank (a `node-gap`):

`Required Gap = Badge Width + (2 × Badge Clearance) + (2 × Port Stub Length)`

Let's plug in real numbers:
- Badge Width = `60px`
- Badge Clearance = `5px`
- Port Stub Length = `12px`

`Required Gap = 60 + (2 × 5) + (2 × 12) = 60 + 10 + 24 = 94px`

If the default gap between nodes is only `50px`, the badges will overlap. The engine generates a `SpacingDemand` for `94px` and feeds it back into the layout pipeline.

## Cells: The Placement Pipeline Step-by-Step

How do spacing demands actually integrate into the layout process? They form a feedback loop.

### 1. Candidate Generation
For each edge, the engine generates multiple candidate placement locations. 
- **Ring 0** is directly on the path (the midpoint). 
- **Ring 1** is slightly offset to the side.
- **Ring 2** is further offset.

### 2. Conflict Resolution
The engine tries to select a non-overlapping candidate for every badge. See [generateBadgeCandidates](../../src/engine/layout/custom/badgePlacement.ts#L68). It tests intersections against nodes, other edges, and already-placed badges.

### 3. Leader Lines
If a badge cannot fit exactly on the path (Ring 0) because of a collision, and is instead placed in an offset ring (Ring 1 or 2), the engine draws a **leader line**. This is a small, thin line that connects the offset badge back to its parent edge, so the user knows which edge the badge belongs to.

### 4. Demand Generation
If *no* candidate works without overlapping (even in outer rings), or if the default spacing is simply too tight, the engine generates a spacing demand (e.g., `rank-gap` or `node-gap`). See [computeBadgeSpacingDemands](../../src/engine/layout/custom/spacingDemand.ts#L74).

### 5. Re-layout (Propagation)
The spacing demands feed back into the coordinate assignment phase. The engine increases the distances between the specific layers or nodes mentioned in the demand. Because nodes moved, the routing changes, which triggers the pipeline to run again. This iterative propagation continues until all badges fit cleanly.

### ASCII Example: Before and After Spacing Demands

**Before Spacing Demands (Overlapped)**
```text
[NodeA] [NodeB]
   |       |
 [Label1][Label2]  <-- Badges overlap because nodes are only 50px apart
   |       |
[NodeC] [NodeD]
```

**After Spacing Demands (Corrected)**
```text
[NodeA]          [NodeB]
   |                |
 [Label1]         [Label2]
   |                |
[NodeC]          [NodeD]
```
*(The layout engine expanded the `node-gap` to 94px to fit both labels cleanly.)*

## Organisms: The System Impact

Spacing demands are powerful because they propagate. A large badge between Node A and Node B might force them apart. If Node B is connected to Node C, Node C must also shift, which might require re-routing other edges. 

By generating spacing demands and resolving them dynamically, the custom engine guarantees that badges are always readable and properly spaced, even in dense graphs. This closed-loop system is what makes the engine uniquely suited for complex, data-rich visualizations.

For the implementation details, explore:
- [badgePlacement.ts](../../src/engine/layout/custom/badgePlacement.ts)
- [badgeMeasurement.ts](../../src/engine/layout/custom/badgeMeasurement.ts)
- [spacingDemand.ts](../../src/engine/layout/custom/spacingDemand.ts)
