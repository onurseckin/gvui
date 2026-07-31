← Previous | [Index](../README.md) | Next →

# Node Dimension Estimation

## The Problem: Invisible Boxes

Layout algorithms treat nodes as rigid rectangular boxes. To prevent nodes from overlapping and to route edges cleanly around them, the algorithm *must* know exactly how wide and tall every node is in pixels **before** it places them on the screen.

If the estimated size is smaller than the actual rendered size, nodes will overlap. If it's too large, the graph becomes sparse and wastes screen real estate.

## The Solution: Deterministic Estimation

Because we cannot wait for the browser to render the DOM to measure the nodes (that would be too slow and would block our layout Web Workers), we mathematically compute the dimensions based on the data contents of the node.

See the implementation in [`calculateNodeDimensions`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L77-L173).

## The Formula

Our estimation formula is a straightforward calculation of the largest internal component (for width) and the sum of all stacked components (for height).

**Width Calculation:**
`Width = MAX( Title Width, Badges Width, Tools Width, Description Width, Metadata Width, 120px )`

**Height Calculation:**
`Height = Base Header (36px) + Description Height + Badges Height + Tools Height + Metadata Height + Padding (12px)`

### A Concrete Walkthrough

Let's compute the dimensions for a node representing a Database Query step.

**Node Data:**
- `name`: "Query Users Table" (17 chars)
- `description`: "Fetches active users for the weekly report." (43 chars)
- `badges`: ["SQL", "Read-Only", "Production"] (3 badges)
- `tools`: None

#### Step 1: Compute Widths

Every section computes its required pixel width based on character counts and assumed font metrics.

- **Title Width:** `17 chars * 11px + 90px (padding/icons) = 277px`
- **Description Width:** `43 chars * 8px + 32px = 376px`
- **Badges Width:**
  - Total chars in labels: `3 (SQL) + 9 (Read-Only) + 10 (Production) = 22 chars`
  - Badges add extra padding (2 chars per badge): `22 + (3 * 2) = 28`
  - Pixel width: `28 * 8px + 32px = 256px`

**Node Width:** `MAX(120, 277, 376, 256) = 376px`

*Width finalized at 376 pixels.*

#### Step 2: Compute Heights

Height is additive. We stack the sections vertically.

- **Base Header:** `36px`
- **Description Height:**
  - We know the width is 376px.
  - Characters per line = `(376 - 32) / 8 = 43 chars/line`.
  - Lines needed = `CEIL(43 total / 43 per line) = 1 line`.
  - Height = `1 line * 15px + 2px = 17px`.
- **Badges Height:**
  - Badges are displayed in a grid of 2 columns.
  - Rows = `CEIL(3 badges / 2) = 2 rows`.
  - Height = `2 rows * 20px + 2px = 42px`.

**Node Height:** `36 (Header) + 17 (Desc) + 42 (Badges) + 12 (Base Padding) = 107px`

*Height finalized at 107 pixels.*

## Integration in the Pipeline

This estimation is the very first step of the layout pipeline. 
1. The engine receives raw graph data.
2. It loops over every node and runs `calculateNodeDimensions`.
3. It passes these numeric widths and heights to the layout engines (either Dagre or our Custom A* Engine).
4. The layout engine computes `X` and `Y` coordinates for the center of these rigid boxes.

By keeping this computation pure and mathematically deterministic, it can run entirely inside a Web Worker, ensuring the UI thread never blocks during massive layout calculations.
