← [Grid Layout](./01-grid-layout.md) | [Index](../README.md)

# Circular Layout

In the GVUI application, the **"Radial Balance (Concentric Circular)"** layout arranges all nodes evenly along the perimeter of a single circle. 

Unlike the Grid layout which just packs nodes efficiently into the screen, the Circular layout creates a distinct visual structure. Let's build the math required to create this layout from scratch.

See the implementation here: [computeRadialLayout](../../src/engine/layout/layoutDispatcher.ts#L9-L66).

## Atoms: Circles and Angles

What is a circle mathematically? It is a collection of points that are all the exact same distance (the **radius**) from a single middle point (the **center**). 

To pinpoint a specific location on that circle, we use an **angle**. You are probably familiar with measuring angles in degrees (0° to 360°), where a full circle is 360°.

However, in programming, mathematical functions like `sin()` and `cos()` don't understand degrees. They expect **radians**. 
- A full circle is exactly **2π radians**. 
- Therefore, `360° = 2π`. 
- Half a circle (180°) is `π`.

## Molecules: Placing Points on the Circle

If we have `N` nodes and we want to space them evenly around our circle, we simply take our full circle (2π) and divide it by `N`. 

`angular_spacing = 2π / N`

If `N = 6`, each node is placed `2π / 6 = 1.047` radians apart.

### The -π/2 Phase Shift

In standard trigonometry, an angle of `0` points directly to the right (the 3 o'clock position). If we just looped through our nodes and placed them at `angle * index`, our first node would appear on the right side of the circle.

Visually, humans expect lists or sequences to start at the top (12 o'clock). 
To rotate the 3 o'clock starting position backward to 12 o'clock, we subtract a quarter of a circle. 
A full circle is `2π`, so a quarter circle is `2π / 4`, which simplifies to `π/2`.

So our final angle calculation for any given node is:
```text
angle = (2 * π * index) / N - (π / 2)
```

### From Angles to Pixels

Once we have our angle, we need actual `(x, y)` pixel coordinates. We use basic trigonometry:
- `x = centerX + radius * cos(angle)`
- `y = centerY + radius * sin(angle)`

Let's plug in real numbers. Assume `centerX = 500`, `centerY = 500`, `radius = 300`, and `N = 6`.

| Index | Base Angle | Adjusted Angle (Shifted) | `cos` | `sin` | `x` (Pixel) | `y` (Pixel) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | 0 | -π/2 (-1.57) | 0 | -1 | **500** | **200** (Top) |
| **1** | π/3 (1.04) | -π/6 (-0.52) | 0.866 | -0.5 | **760** | **350** (Top Right) |
| **2** | 2π/3 (2.09) | π/6 (0.52) | 0.866 | 0.5 | **760** | **650** (Bottom Right) |
| **3** | π (3.14) | π/2 (1.57) | 0 | 1 | **500** | **800** (Bottom) |
| **4** | 4π/3 (4.18) | 5π/6 (2.61) | -0.866 | 0.5 | **240** | **650** (Bottom Left) |
| **5** | 5π/3 (5.23) | 7π/6 (3.66) | -0.866 | -0.5 | **240** | **350** (Top Left) |

## Cells: The Dynamic Radius

If we hardcode a radius of `300px`, what happens when we try to draw 100 nodes? They will all overlap each other into a giant unreadable mess. 

To fix this, the radius must grow dynamically based on the number of nodes:
```javascript
const radius = Math.max(280, nodeCount * 45);
```

**Why 45?** 
It represents our desired arc-length clearance. 
The circumference of our circle is `2 * π * radius`. 
The distance along the curve between two adjacent nodes is roughly `(2 * π * radius) / N`. 

By setting `radius = N * 45`, the arc distance between nodes becomes:
`(2 * π * (N * 45)) / N = 2 * π * 45 ≈ 282px`. 

This guarantees that no matter how many nodes we add, they will always have roughly 282 pixels of breathing room along the perimeter. The `Math.max(280, ...)` ensures that tiny graphs (like 2 nodes) still get a decently sized circle instead of being squeezed together.

## Edges: Quadratic Bézier Curves

If we drew straight lines between nodes on opposite sides of the circle, the center of the circle would become an ugly, chaotic tangle of crossing straight lines.

Instead, the Circular layout draws edges as **Quadratic Bézier curves**. 

An SVG Quadratic Bézier path (`Q`) requires three points:
1. The start point (Source Node)
2. The end point (Target Node)
3. A **control point** that acts like a magnet, pulling the line toward it.

We set the control point to the **exact center of the circle**.

```text
M srcX srcY Q centerX centerY tgtX tgtY
```

### The Visual Effect
Because every single edge is being pulled toward the center `(centerX, centerY)`, the edges bundle together beautifully in the middle of the screen before fanning out to their destinations. 

**Example: 4 Nodes, 3 Edges**
Imagine a star topology where Node 0 at the top connects to Nodes 1, 2, and 3.
- With straight lines, you just get a triangle inside a circle.
- With curves pulled to the center, the edges travel down from Node 0, merge together at the center point, and then bloom outward to 1, 2, and 3. It creates a striking "hub-and-spoke" or "flower" pattern.

## Organisms: When to Use Radial

The Circular layout is O(N) fast just like the Grid layout, but it serves a different purpose. 

You should use this layout when:
1. **You want to see all connections at a glance.** Because the nodes form a hollow ring, the entire interior of the circle is dedicated purely to visualizing edges.
2. **You have star-shaped topologies.** If one central node connects to many children, placing those children on a circle perfectly illustrates that relationship.
3. **You don't care about sequence.** Like the Grid layout, Radial layout ignores edge flow. It doesn't know which node is the "parent" or "child"—it just places them in array order.
