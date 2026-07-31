← Previous | [Index](../README.md) | Next →

# Node Dimension Estimation

## The Problem: Invisible Boxes

Layout algorithms treat graph nodes as rigid, rectangular boxes. To prevent nodes from overlapping, and to route edges cleanly around them, the algorithm *must* know exactly how wide and tall every node is in pixels **before** it calculates the layout.

**What happens if we guess wrong?**
- If we estimate the size is *smaller* than the actual rendered size, the layout engine will pack the nodes too tightly, and they will visually overlap on the screen.
- If we estimate the size is *larger* than necessary, the layout engine will push everything far apart, resulting in a sparse, ugly graph that wastes screen real estate.

**The DOM Rendering Catch-22:**
Normally in web development, you just put text in a `<div>` and ask the browser how big it is (`getBoundingClientRect()`). We cannot do this. Asking the DOM for measurements is slow, and more importantly, our layout calculations happen inside a background **Web Worker** which has zero access to the DOM.

## The Solution: Deterministic Estimation

Because we cannot measure the rendered DOM, we must mathematically *predict* the dimensions based purely on the text content and data of the node, using assumed font metrics.

This is implemented in [`calculateNodeDimensions` in `nodeDimensions.ts`](../../src/engine/layout/nodeDimensions.ts#L77-L173).

## The Formula: Atoms to Organisms

A node consists of several distinct vertical sections: a title header, optional descriptions, optional badges, and optional tools. 

**Width Calculation:**
The width of the node is dictated by its widest single component.
`Width = MAX( Title, Badges, Tools, Description, Metadata, 120px )`

**Height Calculation:**
The height of the node is additive. We stack the sections vertically.
`Height = Base Header (36px) + Description Height + Badges Height + Tools Height + Metadata Height + Padding (12px)`

## Concrete Walkthroughs

Let's trace how the algorithm computes dimensions for three very different node types. We assume a standard character width of `8px` for body text and `11px` for titles.

### Example 1: The Simple Node
A node with just a short name.
- `name`: "Start" (5 chars)

**Width:** Title takes `(5 chars * 11px) + 90px padding = 145px`. No other sections exist. `MAX(145, 120) = 145px`.
**Height:** Base header is 36px. Padding is 12px. No other sections. Total `48px`.
**Final Estimate:** `145px` wide, `48px` tall.

### Example 2: The Complex Node
A node loaded with metadata.
- `name`: "Database Query" (14 chars)
- `description`: "Fetches active users" (20 chars)
- `badges`: ["SQL", "Read-Only", "Production"] (3 badges)

**Step 1: Compute Widths**
- **Title:** `(14 * 11) + 90 = 244px`
- **Description:** `(20 * 8) + 32 = 192px`
- **Badges:** Badges add formatting characters. Total text is ~28 chars. `(28 * 8) + 32 = 256px`.
- **Max Width:** `MAX(244, 192, 256, 120) = 256px`.
*(The width is locked in at 256px. This is important for the height calculation).*

**Step 2: Compute Heights**
- **Base Header:** 36px.
- **Description Height:** We have 256px of width available. A 20-character description easily fits on 1 line. `1 line * 15px + 2px = 17px`.
- **Badges Height:** 3 badges are displayed in a 2-column grid. That requires 2 rows. `2 rows * 20px + 2px = 42px`.
- **Total Height:** `36 (Header) + 17 (Desc) + 42 (Badges) + 12 (Padding) = 107px`.
**Final Estimate:** `256px` wide, `107px` tall.

### Example 3: The Long Description Node
What happens if the text wraps?
- `name`: "Log"
- `description`: "This is a very long description that spans multiple lines" (57 chars)

**Step 1: Width**
- Title: `(3 * 11) + 90 = 123px`.
- Description: The algorithm limits description width contribution (it doesn't want nodes to be 1000px wide). Let's say it forces a width of `300px`.
**Step 2: Height**
- How many lines does 57 characters take in a 300px wide box?
- Usable width: `300 - 32 padding = 268px`.
- Chars per line: `268 / 8px = ~33 chars`.
- Total lines: `CEIL(57 / 33) = 2 lines`.
- Desc Height: `2 lines * 15px + 2px = 32px`.
**Final Estimate:** The box grows *taller* to accommodate the text wrapping.

## Integration in the Pipeline

This estimation is the very first step of the layout pipeline. 
1. The system receives raw graph data.
2. It loops over every node and runs `calculateNodeDimensions`.
3. It passes these numeric widths and heights to the Web Worker.
4. The layout engines (Dagre or Custom) use these rigid boxes to compute `X` and `Y` coordinates.
5. Finally, React renders the actual DOM nodes at those exact coordinates. Because our mathematical estimation is highly accurate, the rendered DOM fits perfectly inside the calculated layout boxes.
