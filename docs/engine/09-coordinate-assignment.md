← [Routing Demand](./08-routing-demand.md) | [Index](./README.md) | [Next: Edge Routing →](./10-edge-routing.md)

# Chapter 9: Coordinate Assignment

Everything before this chapter has been **combinatorial**. Phase 5 decided that item `B` sits at
position 2 of rank 3, and Phase 6 decided that the gap between positions 2 and 3 of rank 3 must be
at least 68 pixels. Neither of them produced a single coordinate.

This is the phase that turns those decisions into pixels. It has two independent halves:

| half  | decides                                  | algorithm        | file                                                                                       |
| ----- | ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| **Y** | which horizontal band each rank occupies | one forward pass | [`4_2_rank_bands.rs`](../../crates/gvui/src/4_coordinate_assignment/4_2_rank_bands.rs)     |
| **X** | where each item sits inside its rank     | Brandes–Köpf     | [`4_3_brandes_kopf.rs`](../../crates/gvui/src/4_coordinate_assignment/4_3_brandes_kopf.rs) |

They are independent because ranks are already stacked along one axis and orders already run along
the other. Y is easy. X is the interesting one.

The two are wired together, and the result normalized, by
[`assign_coordinates`](../../crates/gvui/src/4_coordinate_assignment/4_4_coordinate_facade.rs) —
which has one subtlety serious enough that it gets [its own section](#the-coordinate-space-trap) at
the end of this chapter.

---

## Part 1 — Y: rank bands

### A rank is a band, and its height is its tallest item

The nodes in one rank are almost never the same height. A rank containing a 40px node and a 90px
node has to be at least 90px tall. So:

$$h(r) = \max_{i \in \text{rank } r} \text{height}(i)$$

Every item is then **centred vertically inside its band**:

$$y(i) = \text{top}(r) + \frac{h(r) - \text{height}(i)}{2}$$

```text
                 band top ──────────────────────────────────
                            ┌────────┐
                            │        │
       ┌────────┐           │        │            h(r) = 90
       │        │  40 tall  │        │  90 tall
       └────────┘           │        │
                            │        │
                            └────────┘
              band bottom ──────────────────────────────────
                    ↑
              the 40-tall item is centred: y = top + (90 − 40)/2 = top + 25
```

### Why edge labels are already accounted for

Here is the first place the v2 organizing principle pays out. Phase 4 does not treat an edge label
as an annotation hanging off a line — it turns the label into an
[`Item`](../../crates/gvui/src/0_common/0_1_types.rs) in the layered graph, carrying its measured
box, sitting in a rank at an order like any node.

So `max(item.height)` **includes label items automatically**. Nobody wrote code to make vertical
room for a badge. There is no "does the badge fit?" question to ask, and therefore nothing to retry
when the answer would have been no.

Concretely, from the tests in `4_2_rank_bands.rs`: a rank containing one 40-tall node has
$h = 40$. Add a 200-tall label item to that same rank and $h$ becomes 200, and every subsequent
band moves down by 160. The badge got its space through the same arithmetic that separates nodes.

### Zero-height dummies and why a long edge draws as one straight run

A dummy is a bend point for an edge that spans more than one rank. It has **width 0 and height 0**.
Feed a zero-height item through the centring formula:

$$y(\text{dummy}) = \text{top}(r) + \frac{h(r) - 0}{2} = \text{top}(r) + \frac{h(r)}{2}$$

which is exactly the band's **centre line**. Every dummy of every chain in that rank lands on the
same y. Combined with the X half of this phase — which will give the whole dummy chain one shared
x — a five-rank edge renders as a single vertical run rather than a staircase:

```text
   rank 0    ┌──────┐
             │  A   │
             └───┬──┘
                 │
   rank 1   ─ ─ ─•─ ─ ─ ─  dummy on band 1's centre line
                 │
   rank 2   ─ ─ ─•─ ─ ─ ─  dummy on band 2's centre line
                 │
   rank 3    ┌───┴──┐
             │  E   │
             └──────┘
```

Had dummies been top-aligned instead, each one would sit at `top(r)` and the chain would jog
horizontally nowhere but vertically by a different amount in each band — visually identical here,
but it would break the moment two chains in the same channel needed to be told apart. Centring is
the choice that makes the band's midline a meaningful shared reference.

### Stacking the bands

Band tops are a running sum:

$$\text{top}(0) = 0, \qquad \text{top}(r) = \text{top}(r-1) + h(r-1) + \text{gap}(r-1)$$

`gap(r-1)` comes from Phase 6's `rank_gap_min[r-1]`, which is the minimum gap **below** rank
`r-1` derived from that channel's lane count. Two details from the code:

- The gap is clamped **up** to `config.effective_rank_gap()` (default `rank_gap = 120`, times the
  compaction multiplier). `rank_gap` is documented as a minimum that routing may only _raise_, and
  Phase 6 derives its number from lane counts alone — an empty channel would report a tiny gap and
  collapse two ranks onto each other.
- A missing or non-finite entry falls back to the configured minimum rather than propagating a NaN.
  Likewise `tallest = tallest.max(item.height.max(0.0))` uses `f64::max`, which returns the finite
  operand when the other is NaN, so one corrupt height contributes nothing instead of poisoning an
  entire band.

The last entry of `rank_gap_min` is never read — there is no channel below the last rank — but it
is populated so indexing stays uniform.

That is the whole Y half: one pass, a running sum, no revisiting.

---

## Part 2 — X: Brandes–Köpf

### What we are trying to achieve

Order is fixed. If we simply pack each rank left-to-right at the required separations, we get a
valid drawing that looks like this:

```text
   rank 0   [A]
   rank 1   [D0][B]
   rank 2   [C][D1]
   rank 3   [E]
```

Every constraint holds and it is unreadable. Edges zig-zag because nothing tried to line anything
up. What we actually want, in priority order:

1. **Separations hold exactly.** Non-negotiable — Phase 6 sized them so that routing cannot fail.
2. **Dummy chains are perfectly vertical.** A long edge should be one straight line.
3. **Few bends.** Ideally at most two per adjacent-rank edge.
4. **No directional bias.** A tree should not lean left just because we swept top-to-bottom.

Brandes–Köpf delivers all four in $O(V+E)$. It is not a search and it does not iterate to
convergence: it runs a fixed number of linear passes and stops.

### The shape of the algorithm

Four independent **candidate assignments** are computed, one for each combination of

- sweep direction: align **up** (each item follows its predecessors) or **down** (its successors)
- packing side: push blocks as far **left** as separations allow, or as far **right**

and then blended. Each candidate is built in three steps: mark conflicts, align into blocks,
compact. Then a fourth step balances the four candidates against each other.

```text
        ┌── up × left  ──┐
        ├── up × right ──┤
        ├── down × left ─┤──►  align to a common frame  ──►  average the two
        └── down × right ┘                                    innermost values
```

### Step 0 — the flattened view

Before any of that, [`BkLayout::build`](../../crates/gvui/src/4_coordinate_assignment/4_3_brandes_kopf.rs)
denormalizes everything the four passes need into dense slices, exactly once:

| field            | meaning                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `pos[v]`         | position of item `v` inside its rank                                             |
| `width[v]`       | item width, or 0 if not finite/positive                                          |
| `ranks[r]`       | item indices of rank `r`, left to right                                          |
| `sep[r][o]`      | required **centre-to-centre** distance between `ranks[r][o]` and `ranks[r][o+1]` |
| `up_*`, `down_*` | predecessor / successor adjacency, each list sorted by rank position             |
| `inner[v]`       | `true` when `v` is **not** a `Real` node — a dummy or a label                    |

`sep` is where Phase 6 enters:

$$\text{sep}[r][o] = \frac{w_o}{2} + \frac{w_{o+1}}{2} + \text{separation\_min}[(r, o)]$$

`separation_min` is a facing-edge gap; Brandes–Köpf adds the two half-widths itself. A missing key
falls back to `config.effective_node_gap()` (default `node_gap = 56`).

Two details worth noticing. Rows are built by sorting on `(item.order, item_index)` rather than
trusting the physical arena order, so the phase stays correct even if a future Phase 5 stops
permuting slices in place — and the item index tie-break means the result never depends on sort
stability. And neighbour lists are pre-sorted by rank position, which turns the median lookup in
the next step from a scan into an O(1) index.

### Step 1 — type-1 conflicts, and what an inner segment is

A **segment** is a link between two items on adjacent ranks. An **inner segment** is a segment
whose _both_ endpoints are non-`Real` items — dummies or labels. It is, in other words, a piece of
the interior of a long edge.

Now consider a long edge and a short path competing for the same horizontal space:

```text
   rank 0:               A
                       ↙   ↘
   rank 1:         [D0]     (B)
                      ╲     ╱
                        ╳            ← B→C crosses the inner segment D0→D1
                      ╱     ╲
   rank 2:         (C)      [D1]
                       ↘   ↙
   rank 3:               E
```

`D0 → D1` is an inner segment: both ends are dummies. `B → C` joins two real nodes and crosses it.
Only one of these two can be drawn vertically — they are on opposite sides of each other in the two
ranks. Brandes–Köpf resolves this by **marking** the non-inner segment:

> A non-inner segment that crosses an inner segment is marked. Marked segments may never be used
> for alignment.

This one rule is the entire mechanism that keeps dummy chains straight. It is not a tie-break or a
preference: a dummy chain can always win the alignment fight against a node-to-node segment, and
never the other way round. `mark_type1_conflicts` also skips the case where _both_ endpoints are
inner — two crossing dummy chains do not mark each other, because neither has any claim over the
other.

The scan is linear. For each rank it walks left to right, maintaining a bracket `[k0, k1]` of
positions in the previous rank that segments in the current scan window are allowed to reach;
anything outside the bracket crosses an inner segment. The marked set is a `HashSet`, and the code
comment is explicit about why that is safe: it is only ever queried by membership, never iterated,
so its hash order cannot influence a decision.

### Step 2 — vertical alignment into blocks

Sweep the ranks in the pass's direction. For each item `v`, look at its neighbours in the previous
rank and try to align with the **median** one:

- odd neighbour count → the single median
- even count → try the lower median, then the upper median

Take the alignment only if two things hold:

1. the segment is **not marked** (Step 1), and
2. it does not cross an alignment already committed in this rank — tracked by `prev_idx`, the
   position of the last neighbour successfully consumed, which must strictly increase.

Condition 2 is what keeps the block structure planar, and planarity is what makes Step 3
conflict-free.

Successful alignments build **blocks**: maximal sets of items that will share one x. The
representation is two arrays:

- `root[v]` — the topmost item of `v`'s block. Two items share an x exactly when they share a root.
- `align[v]` — a circular linked list threading each block.

For the diagram above, the marked segment `B → C` is refused, so `C` is free to align elsewhere and
`{D0, D1}` becomes a block. The test
`a_dummy_chain_is_perfectly_straight_even_against_a_competing_real_path` asserts exactly that:
`centres[D0] == centres[D1]`.

### Step 3 — horizontal compaction

Now place the blocks. Each block is placed by **longest path in the block graph**: a block cannot
start until every block to its left in every rank it touches has been placed, and it must clear
each of them by the relevant `sep` value. Blocks that end up in different _classes_ (they never
directly constrain each other) are then merged by shifting one class relative to the other, using
the classic `sink`/`shift` bookkeeping.

Two implementation notes that are real decisions, not incidentals:

- **The traversal uses an explicit stack, not recursion.** Block chains are as long as the deepest
  dummy chain; a 2,000-node graph would put that depth on the WASM stack.
- **There is a traversal budget** of `4n + 16`. It guards against a malformed `align` cycle only. A
  well-formed block structure visits each item at most twice, and bailing out early cannot produce
  an overlap because of Step 5.

### Step 4 — the four passes, without four implementations

Writing the alignment routine four times would be four chances to get it subtly different. Instead
[`BkPass`](../../crates/gvui/src/4_coordinate_assignment/4_3_brandes_kopf.rs) transforms the
_layering_ and lets one generic routine always sweep "downward" and pack "left":

| pass    | transformation                                                                          |
| ------- | --------------------------------------------------------------------------------------- |
| `Down`  | reverse the rank order; read the **successor** adjacency instead of the predecessor one |
| `Right` | reverse every rank (and every `sep` row, since a row has one entry per adjacent pair)   |

A `Right` pass runs on a mirrored layering, so the caller negates the resulting x afterwards. The
`nth()` helper reads neighbour lists back-to-front when mirrored, because the base lists are sorted
by _base_ position. That is also what makes the even-median rule come out as "lower median for
leftmost, upper median for rightmost" without any explicit branch.

### Step 5 — balance, and the unconditional repair

The four candidates come out at arbitrary offsets — compaction has no absolute origin. Averaging
them directly would be meaningless. So `align_candidates` picks the **narrowest** candidate as the
reference (width is translation-invariant, so it does not matter whether this is measured before or
after aligning), then shifts left-packed candidates to share the reference's minimum and
right-packed candidates to share its maximum.

Then, per item, sort the four values and take the mean of the two middle ones:

$$x(v) = \frac{x_{(2)}(v) + x_{(3)}(v)}{2}$$

Averaging the _innermost two_ rather than all four discards the two extremes, which is what removes
the directional bias each individual pass has. `bk_align` exposes the choice as a Tier-2 knob:

| `bkAlign`                                        | result                                  |
| ------------------------------------------------ | --------------------------------------- |
| `median` (default)                               | the average above                       |
| `leftmost` / `rightmost`                         | the narrowest / widest single candidate |
| `up-left`, `up-right`, `down-left`, `down-right` | one specific candidate, for debugging   |

Finally, `repair_rank_order` walks every rank left to right and enforces

$$x_{o+1} \ge x_o + \text{sep}[r][o]$$

**unconditionally**. Compaction should already satisfy this. The published class-merge step has
known edge cases, and running one extra linear pass makes "no two items in a rank overlap" a
property of the phase rather than a property of the compaction being flawless. A `sanitize` pass
replaces any non-finite coordinate with 0 first, so a single bad width cannot poison the repair or
the average.

### What the phase guarantees

| guarantee                              | mechanism                                       |
| -------------------------------------- | ----------------------------------------------- |
| At most 2 bends per adjacent-rank edge | block alignment                                 |
| Dummy chains perfectly vertical        | type-1 conflict marking                         |
| Arbitrary per-item widths respected    | half-widths folded into `sep`                   |
| Every Phase 6 separation holds exactly | compaction + the unconditional repair           |
| $O(V + E)$                             | four linear passes, no iteration to convergence |

"Exactly" is literal. From the tests: two nodes of width 100 and 60 with
`separation_min[(0,0)] = 37.5` come out `117.5` apart centre-to-centre — $50 + 30 + 37.5$, not a
pixel more, because nothing else is pushing them apart.

---

## Why not v1's approach

v1 assigned X with **iterative median sweeps plus PAVA isotonic regression**:

1. For every node, compute a desired x — the median of its neighbours' x values.
2. Project each rank's desired positions onto the nearest set of positions that respect the
   ordering and the minimum gaps, using PAVA (Pool Adjacent Violators). PAVA is an exact solver: it
   provably minimizes squared deviation from the targets subject to monotonicity.
3. Repeat for several sweeps and hope it settles.

PAVA was the good part and it was still the wrong tool, for three reasons:

**It optimizes the wrong objective.** PAVA minimizes deviation from median targets. Nothing in that
objective knows the difference between a real node and a dummy, so a long edge's bend points get
pulled around by whatever is next to them in each rank. Chain straightness was a hope, not a
property. Brandes–Köpf spends its whole first step on precisely that distinction.

**It guarantees nothing about bends.** There is no bound on the number of bends per edge, because
bends are not in the objective at all.

**It does not terminate on a result, it terminates on a budget.** Sweeps run until the iteration
count runs out. Brandes–Köpf runs a fixed four passes and is done.

And then the real cost: this whole thing sat inside v1's outer state-space search, so it was
re-run for every candidate state. Coordinate assignment was never the bottleneck — routing was, at
99.5%+ of a pass — but it was re-run just as many times.

The [`Simple`](../../crates/gvui/src/4_coordinate_assignment/4_3_brandes_kopf.rs) coordinator
survives as the debug counterpart: it packs each rank left to right at exactly the required
separations and centres it on `x = 0`, attempting no alignment at all. Dummy chains bend visibly.
Its entire value is that when a Brandes–Köpf output looks wrong, `Simple`'s output is trivially
predictable, so you can tell whether the problem is in alignment or upstream.

---

## The coordinate-space trap

This is the one part of Phase 7 you can get wrong from the outside, and it is worth stating plainly
because it cost 184 errors before it was found.

`assign_coordinates` does three things in order:

1. `assign_rank_bands` → fills `item.y`, and returns the **top y of each rank band**.
2. `brandes_kopf_x` → fills `item.x` (converting centres to top-left corners).
3. **Translates the whole drawing** so its bounding corner lands at `config.graph_padding`.

Step 3 moves the coordinate space. The band tops from step 1 live in that space. So a caller who
computes the band tops themselves, _before_ calling `assign_coordinates`, holds a table that is
stale by exactly the translation delta.

Phase 8 uses those band tops to locate routing channels. Getting them wrong by `dy` moves every
channel by `dy`:

```text
   BEFORE translation                    AFTER translation (dy = +80)

   y=0    ┌────────────┐  band top       y=80   ┌────────────┐  band top
          │   node A   │                        │   node A   │
   y=60   └────────────┘  band bottom    y=140  └────────────┘  band bottom
   y=86   ─ ─ ─ ─ ─ ─ ─   channel        y=166  ─ ─ ─ ─ ─ ─ ─   channel (correct)

                                         y=86   ═══════════════ channel from a
                                                                STALE table — 6px
                                                                below node A's top,
                                                                i.e. INSIDE it
```

The measured symptom was **184 `EDGE_NODE_PENETRATION` errors, every single one an edge cutting
through its own source node**. Not a subtle degradation — an obviously broken drawing, caused by a
function returning a value that was correct when computed and wrong by the time it was used.

The fix is structural rather than a comment: `assign_coordinates` **returns** the post-translation
band tops, because the function that moves the coordinate space is the only one that can hand out
values expressed in it. `layout_layered` passes that return value straight to `route_edges`. There
is no supported way to get the tops any other way.

Two smaller contract points in the same function:

- **The bounding corner is measured over `Real` and `Label` items only.** Dummies are zero-sized
  points on band centre lines, and a chain of them can extend past the leftmost visible node.
  Including them would push visible content inward by an arbitrary amount and make the padding look
  wrong. There is a fallback: a degenerate graph made entirely of dummies uses all items, so the
  translation still happens rather than leaving the drawing at an arbitrary origin.
- **`config.direction` is deliberately not applied here.** Transposition (`LeftRight`) and mirroring
  (`BottomUp`) happen in the engine, around the entire pipeline, so every phase from ingest to
  routing can assume one canonical top-down frame. Applying direction twice is the classic way to
  get a mirrored drawing, and there is a test asserting that a `left-right` config produces
  byte-identical coordinates out of this function.

---

## Cost

| step                      | cost                                                       |
| ------------------------- | ---------------------------------------------------------- |
| Rank bands                | $O(V)$ — one pass over items, one running sum              |
| `BkLayout::build`         | $O(V \log V + E)$ — the per-rank sorts and adjacency sorts |
| Type-1 conflict marking   | $O(V + E)$                                                 |
| Vertical alignment × 4    | $O(V + E)$ each                                            |
| Horizontal compaction × 4 | $O(V + E)$ each                                            |
| Balance + repair          | $O(V)$                                                     |

Overall $O(V \log V + E)$, dominated in practice by the initial sorts. On the 30-node / 45-edge
`dense_kubernetes_mesh` fixture the entire layered pipeline — all nine phases — runs in 1.79 ms.

---

← [Routing Demand](./08-routing-demand.md) | [Index](./README.md) | [Next: Edge Routing →](./10-edge-routing.md)
