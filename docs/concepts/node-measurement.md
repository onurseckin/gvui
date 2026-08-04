← [Sugiyama framework](./sugiyama-framework.md) | [Concepts index](./README.md) | [Next: Determinism →](./determinism.md)

# Node Measurement

## The problem: the engine must not see text

A layout algorithm treats every node as a rigid rectangle. To separate nodes, to reserve space for a
badge, to compute how many routing lanes fit in a channel — all of that needs a width and a height
in pixels, and it needs them **before** any coordinate is computed.

Guess too small and the boxes are packed tighter than the rendered cards, so the cards visually
overlap. Guess too large and the drawing sprawls, wasting screen space and lengthening every edge.

There is a second, harder constraint. Layout runs in a Web Worker (and in Rust compiled to WASM),
where there is no DOM. You cannot render a card and ask the browser how big it came out.

So the pipeline draws a hard boundary:

```text
   ┌──────────────────────── host (TypeScript, main thread or worker) ────────┐
   │                                                                          │
   │   GraphNodeData { name, description, badges, tools, model, context }      │
   │                          │                                               │
   │                          ▼                                               │
   │              MeasurementProvider.measureNodes()                          │
   │              MeasurementProvider.measureLabel()                          │
   │                          │                                               │
   │                          ▼                                               │
   │              [ { width: 240, height: 97 }, ... ]                          │
   └──────────────────────────┬───────────────────────────────────────────────┘
                              │   ★ nothing below this line ever sees a string
   ┌──────────────────────────▼───────────────────────────────────────────────┐
   │   Rust engine: ranks, orders, lanes, coordinates, routes                 │
   └──────────────────────────────────────────────────────────────────────────┘
```

The Rust crate receives `NormalizedNode { id, label, width, height, ... }` and
`NormalizedEdge { ..., labelWidth, labelHeight }`. It never measures anything. This is why the node
card design can be redesigned without touching a line of layout code.

See [the measurement module](../../src/engine/layout/measurement/).

---

## The boundary: `MeasurementProvider`

The whole contract is three methods
([`types.ts`](../../src/engine/layout/measurement/types.ts)):

```ts
interface MeasurementProvider {
  measureNodes(nodes: GraphNodeData[], opts?: MeasureNodesOptions): Size[];
  measureLabel(text: string, opts: LabelOptions): LabelBox;
  clearCache(): void;
}
```

`measureNodes` returns one `{ width, height }` per node, in the same order. `measureLabel` returns a
`LabelBox` — `{ width, height, lines, truncated }` — for an edge label, wrapped to `maxWidth` and
capped at `maxLines`.

Fonts are named by **role**, not by font string:

| role key | weight | size | family |
| --- | ---: | ---: | --- |
| `node-title` | 600 | 14 px | sans |
| `node-type-tag` | 700 | 10 px | mono |
| `node-body` | 400 | 11 px | sans |
| `node-chip` | 600 | 11 px | mono |
| `edge-label` | 600 | 11 px | mono |

The concrete family is resolved once from the CSS custom properties `--font-sans` / `--font-mono`
that the cards are actually styled with, so measurement follows a theme change instead of silently
measuring a font nobody renders. Sizes and weights mirror `NodeCard.css` and `GraphEdge.css`; drift
between the two shows up as clipped text, which is why the values live in one table with that
comment attached.

---

## Three backends, tried in order

[`canvasMeasurer.ts`](../../src/engine/layout/measurement/canvasMeasurer.ts) resolves a text
context once, lazily:

1. **`OffscreenCanvas`** — works on the layout worker thread, where there is no DOM. This is the
   normal path.
2. **A detached `<canvas>`** — main thread, when `OffscreenCanvas` is unavailable or refuses a 2D
   context.
3. **A per-character estimate** — no canvas at all.

The first two use `ctx.measureText(text).width`, the browser's own `TextMetrics`: the exact advance
width of that string, in that font, with that font's real kerning and glyph widths.

The third is not a degenerate corner case — it is the only path available under `bun test` and in
SSR, so it has to produce finite, positive, stable numbers every time. It buckets characters by
width class:

| class | ratio of font size | members |
| --- | ---: | --- |
| space | 0.28 | `" "` |
| narrow | 0.33 | `i` `j` `l` `t` `I` `f` and `.` `,` `:` `;` `'` `` ` `` `!` `(` `)` `[` `]` `{` `}` `-` `/` `\` and the vertical bar |
| digits | 0.55 | `0`–`9` |
| uppercase | 0.66 | `A`–`Z` |
| wide | 0.90 | `mwMW@%&` |
| non-latin | 1.00 | code point > `0x2000` (CJK, emoji) |
| everything else | 0.52 | lowercase latin, punctuation not listed above |
| monospace | 0.60 | any character, when the role's family is `mono` |

A weight of 600 or more multiplies the total by 1.04. The buckets are coarse on purpose: the
estimate only has to be stable and never wildly *under*-report, because under-reporting is what makes
text overflow its reserved box and collide with a neighbour.

Any measurement that comes back non-finite or negative falls through to the estimate as well.

---

## The card is described declaratively

The measurer does not know what a node card looks like. It walks a **template**
([`nodeTemplate.ts`](../../src/engine/layout/measurement/nodeTemplate.ts)) that describes the card's
rows in the same order the DOM does:

```ts
interface NodeTemplate {
  padding: number;       // .node-card padding: both sides horizontally, bottom only vertically
  headerHeight: number;  // .node-card-header band: padding + title line + bottom border
  rowGap: number;        // .node-card flex gap, charged once per visible body row
  rows: readonly NodeRowSpec[];
}
```

Each row declares its kind, its fonts, and its non-text chrome:

- **`wrap`** — prose. Each selected string is wrapped independently and the lines stack.
- **`flow`** — pills. Items sit side by side and wrap onto further lines when they run out of room.

`DEFAULT_NODE_TEMPLATE` has `padding: 10`, `headerHeight: 34`, `rowGap: 8`, and six rows:

| row | kind | fonts | line height | max lines | notes |
| --- | --- | --- | ---: | ---: | --- |
| `name` | flow | `node-title`, `node-type-tag` | 18 | 1 | `inHeader` — contributes width, not height |
| `description` | wrap | `node-body` | 15 | 3 | |
| `badges` | flow | `node-chip` | 22 | 3 | `itemChrome: 20` (9 px padding + 1 px border, both sides) |
| `tools` | flow | `node-chip` | 22 | 3 | `itemChrome: 34` (adds a 12 px icon and its 4 px gap) |
| `model` | wrap | `node-body` | 16 | 1 | joins `model` and `harnessModel` with `·` |
| `context` | wrap | `node-body` | 15 | 4 | flattened `key: value` rows |

Rows marked `inHeader` contribute *width* but not *height*: `headerHeight` already covers the header
band, and counting the title row's line height again would double-count it.

The point of this shape: **adding a row to `NodeCard` means adding one entry to this list and
nothing else.** No arithmetic anywhere else changes.

---

## Two-pass shrink-to-fit

Node size is computed in two passes, because width and height are mutually constrained: how wide the
card is decides how many lines the description takes, which decides how tall the card is.

```text
   pass 1 ── natural width ─────────────────────────────
     for every row, measure it with NO wrapping
     widest = max over rows of naturalWidth

     width = ceil( clamp(widest + 2 * padding, minNodeWidth, maxNodeWidth) )

   pass 2 ── height at that width ──────────────────────
     contentWidth = width - 2 * padding
     height = headerHeight + padding
     for every non-header row:
         re-wrap it at contentWidth
         height += lineCount * lineHeight + rowGap
```

The clamp is `minNodeWidth: 120` / `maxNodeWidth: 420` by default. The lower bound stops a one-word
node from being a sliver; the upper bound is what makes it "shrink to fit" rather than "expand
forever" — past 420 px the text wraps instead of the card growing.

### A worked example

Take a node with:

- `name`: `"Database Query"`, `type`: `"task"`
- `description`: `"Fetches active users"`
- `badges`: `["SQL", "Read-Only", "Production"]`

Running the numbers through the character estimate (in a browser, `measureText` gives the true
advance widths; the estimate is used here because it is reproducible on paper):

**Pass 1 — natural widths.**

| row | computation | px |
| --- | --- | ---: |
| `name` | title `"Database Query"`: ratio sum 7.13 × 14 px × 1.04 = 103.8; tag `"task"` mono: 2.4 × 10 px × 1.04 = 25.0, + 14 chrome = 39.0; + 50 fixed chrome (status dot, gap, collapse button) + 8 item gap | **200.8** |
| `description` | `"Fetches active users"`: ratio sum 9.49 × 11 px × 1.0 | **104.4** |
| `badges` | `"SQL"` 20.6 + 20 = 40.6; `"Read-Only"` 61.8 + 20 = 81.8; `"Production"` 68.6 + 20 = 88.6; + 2 gaps × 4 | **219.0** |
| `tools`, `model`, `context` | empty | — |

`widest = 219.0`. Add `2 × padding = 20` → 239.0, inside `[120, 420]`, ceiling → **width = 240**.

**Pass 2 — height at `contentWidth = 220`.**

| step | computation | running height |
| --- | --- | ---: |
| start | `headerHeight 34 + padding 10` | 44 |
| `name` | skipped — `inHeader` | 44 |
| `description` | 104.4 ≤ 220 → 1 line → `1 × 15 + 8` | 67 |
| `badges` | 40.6, +4+81.8 = 126.4, +4+88.6 = 219.0 ≤ 220 → 1 line → `1 × 22 + 8` | 97 |

**Result: 240 × 97.**

Notice which row won. The *title* wanted 201 px; the *badge* row wanted 219 px. The badges are what
set the card's width, and no formula that only looks at the name could know that.

---

## Label wrapping

Edge labels go through `measureLabel`, which is greedy word wrap
(`maxWidth` defaults to `max_label_width: 220`, `maxLines` to `max_label_lines: 3`):

1. Split on whitespace. Accumulate tokens onto the current line while
   `currentWidth + spaceWidth + tokenWidth ≤ maxWidth`.
2. When a token does not fit, commit the line and start a new one.
3. When a *single* token is wider than the whole line — a URL, a hash, a file path — break it by
   character.
4. If the line count exceeds `maxLines`, truncate, then **ellipsize** the last line: pop characters
   until `width + ellipsisWidth ≤ maxWidth` and append `…`.

Line widths are summed from token widths plus space widths rather than re-measuring each growing
prefix. Measuring prefixes would flood the cache with strings nobody ever asks for again, and the
kerning difference across a space is sub-pixel.

Truncation is the only thing about the text that survives into the engine's output: Phase 9 counts
`labels_truncated` by looking for the trailing `…` on a badge's display string, because by then the
original text is long gone.

The height is `lines.length × round(fontSize × 1.35)` — 1.35 being the browser's default `normal`
line height — and the width is `min(ceil(widest line), maxWidth)`.

---

## Caching

Four caches live inside one measurer instance:

| cache | key | holds |
| --- | --- | --- |
| `textCache` | `` `${fontKey}|${text}` `` | width of one run |
| `labelCache` | `` `${fontKey}|${maxWidth}|${maxLines}|${text}` `` | a whole `LabelBox` |
| `fontStringCache` | font key | the resolved `"600 14px <stack>"` string |
| `familyStackCache` | `"sans"` / `"mono"` | the CSS custom property value |

`getDefaultMeasurer()` returns a process-wide instance. That sharing is the point: node labels repeat
heavily across re-layouts of the same dataset, and a warm text cache turns re-layout into arithmetic.

`LabelBox` values are **frozen** before being cached, because a cache hit hands out the same object
by reference and a caller mutating it would silently corrupt every later measurement of that label.

`resetDefaultMeasurer()` drops the instance entirely, which is what a theme or font change needs —
the family stacks were resolved once and are now stale. `clearCache()` empties the maps but keeps
the canvas context, which holds no measurement state, only the last `font` assignment.

---

## Why the old approach was wrong

v1 estimated node size arithmetically, with a per-section pile of magic constants. The title term
was:

```ts
width = name.length * 11 + 90
```

Three separate failures:

**1. A single per-character constant is wrong for any proportional font.** These two names are both
14 characters:

```text
  "llllllllllllll"     real width ≈ 14 × 0.33 × 14px × 1.04 ≈  67 px
  "MMMMMMMMMMMMMM"     real width ≈ 14 × 0.90 × 14px × 1.04 ≈ 184 px
```

A factor of 2.7 apart. The v1 formula allows both the same `14 * 11 = 154 px` of text. The narrow
name reserves **87 px of dead space**; the wide name is **30 px short** and its text runs into
whatever sits beside it. Real names are not that extreme, but the error never goes to zero and its
*sign* varies from node to node, so it cannot be absorbed by a fudge factor.

**2. The 90 is invisible chrome, hard-coded.** In the template that same allowance is
`fixedChrome: 50` on the `name` row (8 px status dot + 8 px gap + 26 px collapse button + 8 px gap)
plus `itemChrome: 14` on the type tag plus `padding * 2 = 20`. Written as a single `90` it is
unreviewable: nobody can tell from the number whether it still matches the CSS.

**3. It drifts silently.** Every time the card gained a row, or the collapse button changed size, or
a badge's padding was adjusted, the formula became a little more wrong — and *nothing failed*. The
layout kept producing plausible-looking numbers. The only symptom was cards gradually overlapping or
gradually drifting apart, which reads as "the layout engine got worse" rather than "the card design
changed".

The declarative template does not fix the third problem by being cleverer; it fixes it by making the
CSS constants appear exactly once, next to a comment naming the rule they came from. And the canvas
backend removes the first problem entirely: the browser measures its own font.

---

## What the engine sees

By the time the Rust crate is called, all of the above has collapsed to numbers:

```jsonc
{
  "nodes": [{ "id": "n1", "label": "Database Query", "width": 240, "height": 97 }],
  "edges": [{ "id": "e1", "source": "n1", "target": "n2",
              "label": "retry x3", "labelWidth": 84, "labelHeight": 28 }],
  "options": { "nodeGap": 56, "direction": "top-down" },
  "mode": "layered"
}
```

The `label` strings are carried through only so the renderer can draw them and so diagnostics can
name things. No phase reads them. Node width is then adjusted once more inside ingest — a
high-degree node is widened so its ports fit at `port_pitch` spacing — and after that the box is
fixed for the rest of the pipeline.

---

← [Sugiyama framework](./sugiyama-framework.md) | [Concepts index](./README.md) | [Next: Determinism →](./determinism.md)
