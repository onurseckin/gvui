← [Dagre Internals](./01-dagre-internals.md) | [Index](../README.md)

# Our Integration Layer

While Dagre handles the heavy algorithmic lifting of layout, it requires very specific inputs and produces raw geometric outputs. GVUI nodes are complex: they have varying text lengths, badges, and tool lists. Our integration layer acts as the bridge between GVUI's rich data model and Dagre's pure geometric world.

## 1. Node Dimension Estimation

Dagre cannot layout a graph if it doesn't know how big the nodes are. If we provide incorrect dimensions, nodes will overlap or float too far apart.

Before we even initialize Dagre, we must estimate the exact pixel dimensions of every node based purely on its content strings. 

**How it works:**
We calculate the width by finding the maximum width among the node's title, badges, tools, and metadata. We estimate text width using a rough constant of 8-11 pixels per character. We calculate height by stacking the base header, description lines, badge rows, and tool rows.

See [calculateNodeDimensions](../../src/engine/layout/nodeDimensions.ts#L77-L173).

### Example: "Authentication Service"

Let's estimate the dimensions of a node with:
- Title: "Authentication Service" (22 chars)
- 3 Badges, 2 Tools

**Width calculation:**
- Title width: `22 chars × 11 + 90 = 332px`
- Badges/Tools will be shorter.
- Final Width = **332px**

**Height calculation:**
- Base Header: `36px`
- 3 Badges = 2 rows: `2 rows × 20 + 2 = 42px`
- 2 Tools = 1 row: `1 row × 20 + 2 = 22px`
- Padding: `12px`
- Final Height = `36 + 42 + 22 + 12` = **112px**

We feed these exact dimensions (`width: 332, height: 112`) into Dagre.

## 2. Left-Right Coordinate Transformation

Dagre's underlying algorithms natively think about graphs in a Top-Down (TB) orientation. 

To achieve a Left-to-Right (LR) layout, the standard approach is surprisingly simple:
1. Swap the `width` and `height` of every node.
2. Run the Top-Down layout.
3. Swap the resulting `x` and `y` coordinates (and mirror edge path coordinates).

This elegantly reuses the entire Top-Down logic without requiring a separate layout algorithm. Dagre handles this coordinate swapping internally when we set `rankdir: "LR"`.

## 3. Edge Endpoint Clipping

Dagre calculates edge routing paths assuming edges connect to the exact *center* of a node. If we drew paths directly from these raw outputs, the lines would visually pierce through the node cards.

We must clip the edge endpoints so they stop exactly at the node's rectangular boundary.

**The Solution: Ray-Rectangle Intersection**
We cast a "ray" from the node's center coordinate towards the first waypoint of the edge path. We calculate where this ray intersects the four bounding lines (xmin, xmax, ymin, ymax) of the node's rectangle, and move the endpoint to that intersection.

```text
    (Node Center)
          +
          |
  [-------|-------] Node Boundary
          |
          v (clipped endpoint)
          |
          |
          v (first waypoint)
```

See [clipPointToNodeRect](../../src/engine/layout/nodeDimensions.ts#L192-L228).

## 4. Path Midpoint Label Placement

GVUI edges often carry labels (like transition conditions). We need to place these labels exactly halfway along the visual edge.

Because our edges are multi-segment polylines (not straight lines), we can't just average the start and end points. We must calculate the total arc-length of the polyline, divide it by two, and traverse the segments until we reach that exact 50% distance.

See [findTotalPathMidpoint](../../src/engine/layout/nodeDimensions.ts#L389-L446) for the arc-length traversal logic.

## 5. Badge Repulsion Post-Pass

Even with perfect edge routing, a dense graph might route two parallel edges very close to each other. When we place our labels at the 50% path mark, those labels might overlap, rendering them unreadable.

After Dagre finishes, we run a fast $O(N^2)$ post-pass to detect and resolve overlapping edge labels.

If the distance between two label centers is smaller than the badge dimensions, we calculate a shift vector and push them away from each other.

**Before Repulsion:**
```text
  Edge A --------- [Label A] ---------
                      [Label B]
  Edge B -----------------------------
```

**After Repulsion:**
```text
  Edge A --------- [Label A] ---------
                    ^
                    | (shifted apart)
                    v
  Edge B --------- [Label B] ---------
```

See [badge repulsion pass](../../src/engine/layout/nodeDimensions.ts#L575-L602).
