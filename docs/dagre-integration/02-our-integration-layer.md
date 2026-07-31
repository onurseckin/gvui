← [Previous](./01-dagre-internals.md) | [Index](../README.md) | Next →

# Our Integration Layer

While Dagre handles the heavy algorithmic lifting of layout, it requires very specific inputs and produces raw geometric outputs. GVUI nodes are complex: they have varying text lengths, badges, and tool lists. Our integration layer acts as the bridge between GVUI's rich data model and Dagre's pure geometric world.

## 1. Node Dimension Estimation

Dagre cannot layout a graph if it doesn't know how big the nodes are. If we provide incorrect dimensions, nodes will overlap or float too far apart. Before we even initialize Dagre, we must estimate the exact pixel dimensions of every node based purely on its content strings.

**The Solution:** We calculate width by finding the widest element (title, badges, tools, or metadata) using a rough constant of 8-11 pixels per character. We calculate height by stacking the required rows. 

See [calculateNodeDimensions](../../src/engine/layout/nodeDimensions.ts#L77-L173).

### Concrete Example: Two Node Types

**Node A: "Simple Node"**
- Title: "DB" (2 chars)
- No badges, tools, or description.
- Width: `max(120, 2 chars × 11 + 90)` = `max(120, 112)` = **120px** (minimum width enforced).
- Height: Base Header (36px) + Padding (12px) = **48px**.

**Node B: "Authentication Service"**
- Title: "Authentication Service" (22 chars)
- 3 Badges, 2 Tools.
- Width: Title width dominates `22 chars × 11 + 90` = **332px**.
- Height: 
  - Base Header: `36px`
  - 3 Badges = 2 rows: `2 rows × 20 + 2 = 42px`
  - 2 Tools = 1 row: `1 row × 20 + 2 = 22px`
  - Padding: `12px`
  - Total Height: `36 + 42 + 22 + 12` = **112px**

We feed these exact dimensions (`width: 332, height: 112`) into Dagre before it does any routing.

---

## 2. Left-Right Coordinate Transformation

Dagre's underlying algorithms natively think about graphs in a Top-Down (TB) orientation. 

**The Problem:** We want to support a Left-to-Right (LR) layout, but rewriting the entire layout algorithm for horizontal flow is unnecessary.
**The Solution:** We trick Dagre. We swap the dimensions, run the Top-Down layout, and then swap the results back.

### Concrete Example
Let's use Node B from above (`w: 332, h: 112`).
1. **Input Swap:** We tell Dagre Node B has `width: 112, height: 332`.
2. **Layout:** Dagre places it Top-Down. It assigns Node B a coordinate, say `x: 50, y: 500`.
3. **Output Swap:** We flip the coordinates. The final output is `x: 500, y: 50`. The node is drawn correctly on its side.

This elegantly reuses the entire Top-Down logic. Dagre handles this coordinate swapping internally when we set `rankdir: "LR"`.

---

## 3. Edge Endpoint Clipping

Dagre calculates edge routing paths assuming edges connect to the exact *center* of a node. 

**The Problem:** If we drew paths directly from these raw outputs, the lines would visually pierce through the node cards to reach the center coordinate.
**The Solution:** Ray-Rectangle Intersection. We cast a "ray" from the node's center coordinate towards the first waypoint of the edge path. We calculate where this ray intersects the bounding box of the node, and move the endpoint to that intersection.

### The Math in Action
Imagine a node centered at `(100, 100)` with `width: 50, height: 50`. Its edges are at `X: 75 to 125` and `Y: 75 to 125`.
Dagre says the edge should go from `(100,100)` to a waypoint at `(200,100)`.
Our ray points directly right (dx=100, dy=0).
The ray hits the right edge of the bounding box at `X = 125`.
We clip the edge endpoint to `(125, 100)`.

```text
    (Node Center at 100,100)
           +
           |
   [-------|-------] Node Boundary (Right edge at X=125)
           |
           v (clipped endpoint at 125,100)
           |
           |
           v (first waypoint at 200,100)
```

See [clipPointToNodeRect](../../src/engine/layout/nodeDimensions.ts#L192-L228).

---

## 4. Badge Repulsion Post-Pass

Even with perfect edge routing, a dense graph might route two parallel edges very close to each other. When we place our edge labels (badges) at the 50% path mark, those labels might overlap, rendering them unreadable.

**The Solution:** After Dagre finishes, we run a fast $O(N^2)$ post-pass to detect and resolve overlapping edge labels. If the distance between two label centers is smaller than the badge dimensions, we calculate a shift vector and push them away from each other.

### Concrete Example
Badge dimensions are `84x34`.
Label A is placed at `(200, 100)`.
Label B is placed at `(200, 110)`. (Only 10px apart vertically!)

1. **Detect:** Distance `dy = 10`. This is less than the required height `34`.
2. **Calculate Shift:** `shiftY = (34 - 10 + 4) / 2 = 14px`.
3. **Apply Shift:** We push them in opposite directions.
   - Label A moves up: `100 - 14 = 86`.
   - Label B moves down: `110 + 14 = 124`.

**Before Repulsion:**
```text
  Edge A --------- [Label A at Y=100] ---------
                   [Label B at Y=110]
  Edge B --------------------------------------
```

**After Repulsion:**
```text
  Edge A --------- [Label A at Y=86] ---------
                     ^
                     | (shifted apart by 14px each)
                     v
  Edge B --------- [Label B at Y=124] ---------
```

See [badge repulsion pass](../../src/engine/layout/nodeDimensions.ts#L575-L602).
