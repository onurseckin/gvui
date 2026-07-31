← [Previous: Edge Routing](./08-edge-routing.md) | [Index](./README.md) | [Next: Optimization Loop →](./10-optimization-loop.md)

# Badge Placement & Spacing Demands

This chapter explores how the custom engine handles edge labels ("badges") without allowing them to overlap with each other, with nodes, or with unrelated edges.

## Atoms: The Badge Collision Problem

In our system, edges can have labels (badges) that show connection type, status, or other metadata. These badges are small rectangles that must be placed along the edge path.

The fundamental problem is simple: badges take up physical space. If we blindly place them, they will collide.

Imagine three edges converging into the same node. If we place a badge at the midpoint of each edge, the badges will overlap each other, making them unreadable. They might even overlap the node itself.

```text
       [Node A]
          |
       [Badge1]
          |
       [Node B]---[Badg[Node C]
          |            |
       [Badge3]--------+
```
*(A broken layout where Badge 2 overlaps Node C, and Badge 3 overlaps the edge.)*

Without a system to manage badge placement, the visual output is chaotic.

## Molecules: Placement and Spacing Demands

Where should we place a badge? The most natural spot is the midpoint of the edge path. But when two edges are routed close together, their midpoints overlap.

### The Spacing Demand Concept

To prevent overlaps, each badge needs a minimum clearance zone—a rectangle around it where nothing else can exist. If the clearance zones of two badges overlap, we have to push the underlying nodes further apart. This is called a **spacing demand**.

Let's look at the math for a spacing demand between two adjacent nodes on the same rank (a `node-gap`):

`Required Gap = Badge Width + (2 × Badge Clearance) + (2 × Port Stub Length)`

Let's plug in real numbers. Suppose:
- Badge Width = `60px`
- Badge Clearance = `5px`
- Port Stub Length = `12px`

`Required Gap = 60 + (2 × 5) + (2 × 12) = 60 + 10 + 24 = 94px`

If the default gap between nodes is only `50px`, the badges will overlap. The engine must generate a `BadgeSpacingRequest` for `94px` and feed it back into the layout pipeline to push the nodes apart.

## Cells: The Placement Pipeline

How do spacing demands actually integrate into the layout process? They form a feedback loop.

1. **Candidate Generation**: For each edge, the engine generates multiple candidate placement locations. Ring 0 is on the path (the midpoint). Ring 1 is slightly offset, Ring 2 is further offset, etc.
2. **Conflict Resolution**: The engine tries to select a non-overlapping candidate for every badge. See [generateBadgeCandidates](../../src/engine/layout/custom/badgePlacement.ts#L68).
3. **Leader Lines**: If a badge cannot fit exactly on the path (Ring 0) and is placed in an offset ring, a small line (a leader) is drawn to connect the badge back to its edge.
4. **Demand Generation**: If no candidate works without overlapping nodes or other badges, the engine generates a spacing demand (e.g., `rank-gap` or `node-gap`). See [computeBadgeSpacingDemands](../../src/engine/layout/custom/spacingDemand.ts#L74).
5. **Re-layout**: The spacing demands feed back into the coordinate assignment phase, increasing the distances between layers or nodes, and the pipeline runs again.

### Example: Before and After Spacing Demands

**Before Spacing Demands (Overlapped)**
```text
[NodeA] [NodeB]
   |       |
 [Label1][Label2]  <-- Badges overlap because nodes are too close
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
*(The layout engine expanded the `node-gap` to fit both labels cleanly.)*

## Organisms: Why This Exists

This robust badge placement system is one of the primary reasons the custom engine was built. Standard layout algorithms like Dagre have no native concept of badge-aware spacing. They route edges and leave you to figure out where to put labels, usually resulting in overlaps.

By generating spacing demands and resolving them dynamically, the custom engine guarantees that badges are always readable and properly spaced, even in dense graphs.

For the implementation details, explore:
- [badgePlacement.ts](../../src/engine/layout/custom/badgePlacement.ts)
- [spacingDemand.ts](../../src/engine/layout/custom/spacingDemand.ts)
