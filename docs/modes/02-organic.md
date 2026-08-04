← [Layered](./01-layered.md) | [Index](./README.md) | [Next: Radial →](./03-radial.md)

# Organic Mode

Some graphs have no up. A service mesh, a social network, a "what is related to what" map — the
edges do not mean *before* or *causes*, they mean *is connected to*. Drawing such a graph in ranks
imposes a hierarchy that is not in the data, and you pay for the fiction in crossings: on
`dense_kubernetes_mesh`, layered produces **28** crossings and organic produces **8**.

Organic mode places nodes so that **how far apart two nodes look is how far apart they are in the
graph**. Nothing else. No ranks, no flow axis, no orthogonal routing.

```text
                          ┌────────┐
                ┌─────────│  api   │──────────┐
                │         └────────┘          │
                │              │              │
           ┌────────┐     ┌────────┐     ┌────────┐
           │ authn  │─────│ cache  │─────│  queue │
           └────────┘     └────────┘     └────────┘
                │              │              │
                └─────────┬────┴──────┬───────┘
                          │           │
                     ┌────────┐  ┌────────┐
                     │   db   │──│ worker │
                     └────────┘  └────────┘
```

See [the implementation](../../crates/gvui/src/7_engines/7_2_organic.rs).

---

## 1. Graph distance

Before we can place anything we need to say what "far apart in the graph" means. The measure is
**graph-theoretic distance**: the number of edges on the shortest path between two nodes, treating
every edge as undirected and of length 1.

Take this five-node graph:

```text
    A ─── B ─── C
          │
          D ─── E
```

Breadth-first search from each node — start at the source, visit its neighbours (distance 1), then
their unvisited neighbours (distance 2), and so on — gives the complete distance matrix:

|   | A | B | C | D | E |
| - | -: | -: | -: | -: | -: |
| **A** | 0 | 1 | 2 | 2 | 3 |
| **B** | 1 | 0 | 1 | 1 | 2 |
| **C** | 2 | 1 | 0 | 2 | 3 |
| **D** | 2 | 1 | 2 | 0 | 1 |
| **E** | 3 | 2 | 3 | 1 | 0 |

BFS is the right tool because every edge has the same length: a simple queue visits nodes in
non-decreasing distance order, so the first time you reach a node you have reached it by a shortest
path. One BFS is $O(V + E)$; all-pairs is $V$ of them.

These hop counts become pixel targets by multiplying by a **distance unit**:

$$\text{unit} = \texttt{stress\_ideal\_edge\_length} + \texttt{effective\_node\_gap}$$

With the defaults that is $180 + 56 = 236$ px. So the target separation for A–B is 236 px, for A–C
472 px, for A–E 708 px.

The node gap is *added* rather than ignored on purpose. `stress_ideal_edge_length` is the desired
free space *between two boxes*; without adding the gap, the spacing knobs would have no effect at
all on an organic drawing that happened not to overlap anywhere, and `compaction` would be silently
inert in this mode.

**Disconnected pairs** get a finite distance: the largest finite distance in the graph times 1.5. A
pair with no path between them would otherwise have infinite target distance (or, if you gave it
zero weight, no opinion at all) and the two components would drift apart forever. Finite-but-large
makes separate components settle at a bounded remove from each other.

---

## 2. The stress function

Now write down what we want as a number to minimize. Let $p_i$ be the 2-D position of node $i$ and
$d_{ij}$ its target distance in pixels. The **stress** of a placement $P$ is

$$\text{stress}(P) \;=\; \sum_{i<j} w_{ij}\,\bigl(\lVert p_i - p_j \rVert - d_{ij}\bigr)^2
\qquad\text{with}\qquad w_{ij} = d_{ij}^{-2}$$

Read it left to right. For every pair of nodes, take how far apart they actually are on the canvas,
subtract how far apart they should be, square it so over- and under-shooting both count, and weight
it. Sum over all pairs. A placement with low stress is one where Euclidean distance mirrors graph
distance everywhere at once.

### Why $w_{ij} = d_{ij}^{-2}$

Substitute the weight into the term:

$$w_{ij}\bigl(\lVert p_i - p_j \rVert - d_{ij}\bigr)^2
= \left(\frac{\lVert p_i - p_j \rVert - d_{ij}}{d_{ij}}\right)^2$$

The weight turns absolute error into **relative** error. That is exactly the behaviour you want.
Consider two mistakes in our example graph:

- A and B (target 236 px) placed 472 px apart — twice as far as they should be.
- A and E (target 708 px) placed 1416 px apart — also twice as far as they should be.

Unweighted, the second mistake would count $(708)^2 / (236)^2 = 9$ times as much as the first, and
the optimizer would spend all its effort getting far-apart pairs precisely right while letting
neighbours pile on top of each other. With $d^{-2}$ both terms are exactly $1.0$. Local structure —
which is what a reader actually looks at — is preserved as carefully as global structure.

---

## 3. Minimizing it: SGD, not a force simulation

Stress is a function of $2n$ variables with $\binom{n}{2}$ terms. You cannot solve it in closed form.
Two families of algorithms are on offer.

### The force-directed family (what we did *not* use)

Fruchterman–Reingold and its descendants model the drawing as physics: every pair of nodes repels
like charged particles, every edge attracts like a spring, you integrate the forces, and you apply a
"temperature" that decays over time so the system cools into a stable state.

It works, and it is the algorithm everyone reaches for first. Its problems are all in the
constants:

- **A repulsion constant $k$** that has to be tuned per graph; too high and the drawing explodes,
  too low and everything collapses to a point.
- **A temperature schedule** that has to be tuned too — cool too fast and you freeze into a tangle,
  cool too slowly and nodes are still wandering when you run out of iterations.
- **No bound on a single step.** Two nodes that happen to start very close produce an enormous
  repulsive force, which flings one of them across the canvas, which produces enormous forces
  elsewhere. Real implementations need displacement clamps to stop this, and the clamp value is one
  more constant to tune.

### Stochastic gradient descent (what we did use)

The optimizer is the SGD of **Zheng, Pawar & Goodman, *Graph Drawing by Stochastic Gradient
Descent* (2018)**. It does not simulate anything. It repeatedly picks one pair of nodes and moves
those two nodes — and only those two — toward satisfying *their* target distance:

```text
   before                                    after one pair step

   p_i                    p_j                 p_i            p_j
    ●━━━━━━━━━━━━━━━━━━━━━━●                   ●━━━━━━━━━━━━━━●
    │◄──── current 708 ────►│                  │◄─ target 236 ─►│
    │                       │
    └── move right by δ     └── move left by δ    (both move, symmetrically)
```

Formally, for a pair with current separation $m = \lVert p_i - p_j \rVert$, unit direction
$u = (p_i - p_j)/m$, and step size $\eta$:

$$\mu = \frac{\min(w_{ij}\,\eta,\ 1)}{2}, \qquad
\delta = (m - d_{ij})\,\mu, \qquad
p_i \mathrel{-}= u\,\delta, \quad p_j \mathrel{+}= u\,\delta$$

One epoch visits **every** pair once, in shuffled order. The engine runs
`stress_iterations` epochs — default **30**.

### Why this cannot explode

Look at what the cap on $\mu$ buys. After the move, the separation is

$$m' = m - 2\delta = m - 2\mu\,(m - d_{ij})$$

and $\mu \le \tfrac{1}{2}$ always, so $2\mu \le 1$, so $m'$ lies between $m$ and $d_{ij}$ —
**never past it**. A single pair step can at most solve that pair exactly. There is no configuration
of inputs in which a node is flung anywhere, so there is no clamp to tune, no temperature, and no
repulsion constant. That property, not the convergence rate, is the reason this optimizer is here:
it makes "the drawing that comes out is the drawing that ships" a safe policy.

### The step schedule, with real numbers

$\eta$ starts at $d_\max^2$ and decays geometrically to `epsilon` (default 0.001) over the epochs:

$$\eta_0 = d_{\max}^2, \qquad
\eta_{t+1} = \eta_t \cdot \left(\frac{\varepsilon}{\eta_0}\right)^{\frac{1}{E-1}}$$

Work it through on our five-node graph. The largest target distance is $3 \times 236 = 708$ px, so
$\eta_0 = 708^2 = 501{,}264$. With $E = 30$ epochs and $\varepsilon = 0.001$, the per-epoch decay
factor is

$$\left(\frac{0.001}{501264}\right)^{1/29} \approx 0.512$$

— the step size roughly **halves every epoch**.

Why start at $d_\max^2$? Because then $w_{ij}\eta_0 = d_\max^2/d_{ij}^2 \ge 1$ for every pair, which
means $\mu = 1/2$ for every pair, which means the first epoch **solves each pair exactly as it
visits it**. Later epochs, with $\eta$ halved and halved again, make smaller and smaller corrections.
The schedule is coarse-to-fine by construction: epoch 1 establishes the global shape, epoch 30
nudges. In our example, the tightest pairs ($w = 236^{-2}$) stop being fully solved around epoch 3,
once $\eta$ has dropped below $236^2 = 55{,}696$.

### The starting configuration is a circle

$$p_i = \bigl(r\cos\theta_i,\ r\sin\theta_i\bigr), \qquad
\theta_i = \frac{2\pi i}{n}, \qquad
r = \text{unit}\cdot\sqrt{n}$$

```text
              ● n0
        ●            ● n1
     n4
        ●            ● n2
              ● n3
```

Three things this gets right that the alternatives do not:

- **Not a single point.** If every node started at the origin, every pair would have a degenerate
  direction and the first epoch would be meaningless.
- **Not random.** Random starts forfeit determinism (see below), and their quality varies run to
  run.
- **The right scale.** $r = \text{unit}\sqrt{n}$ puts the initial configuration within roughly one
  order of magnitude of its final size — which is what lets the geometric step schedule finish the
  job in 30 epochs rather than spending most of them just inflating the drawing.

### The deterministic shuffle

SGD needs the pair order shuffled each epoch — visiting pairs in index order biases the result
toward whichever nodes happen to be numbered first. But GVUI guarantees that the same graph produces
**byte-identical output across processes**, and the pair visiting order is an input to the
optimizer. `Math.random()` — or a clock seed, or anything drawn from the OS — would make the same
graph lay out differently on every run and break that guarantee outright.

So the shuffle is a Fisher–Yates driven by a **64-bit linear congruential generator with Knuth's
MMIX constants**, seeded by a hard-coded constant:

```rust
const SGD_SEED: u64 = 0x9E37_79B9_7F4A_7C15;
state = state * 6364136223846793005 + 1442695040888963407
```

The sequence has to be well mixed and reproducible. It does not have to be statistically perfect —
the modulo bias in reducing a 64-bit value to a range is irrelevant here. See
[the determinism guarantee](../concepts/determinism.md).

One more determinism detail, easy to miss: when two nodes are exactly coincident there is no
direction to separate them along, and picking one from float noise would make the output depend on
rounding. The engine picks the direction from the *pair's node indices* instead — reproducible by
construction.

### Sparse stress for large graphs

Above **400 nodes** the full pair set becomes the problem: all-pairs BFS stores $n^2$ distances and
the optimizer sweeps $n(n-1)/2$ pairs per epoch — at 400 nodes that is already ~80,000 pairs per
epoch, at 2,000 nodes it is 2 million.

Beyond the threshold the engine switches to **pivot-based sparse stress**: roughly 100 nodes are
chosen as pivots, BFS runs only from those, and only `(node, pivot)` pairs enter the optimizer.
That is $O(nP)$ pairs instead of $O(n^2)$ — at 2,000 nodes, 200,000 instead of 2 million.

The pivots are chosen by **arithmetic stride** (`0, s, 2s, …` with $s = \lfloor n/100 \rfloor$),
not by a max-min sampling heuristic. A stride is reproducible without sorting anything, which is
worth more here than a marginally better pivot set.

### Aspect correction

After SGD the point cloud is stretched toward `target_aspect_ratio` (default 1.6) by scaling $x$ by
$s$ and $y$ by $1/s$, where $s = \sqrt{\text{target}/(w/h)}$ clamped to $[0.6, 1.6]$. The product of
the two scale factors is exactly 1, so the stretch **preserves area** — it changes the proportions of
the drawing without inflating it, and cannot interfere with the engine's monotonicity in the spacing
knobs. The clamp is what stops a hostile aspect ratio from smearing a mesh into a line.

---

## 4. Overlap removal

Stress majorization places *points*. GVUI draws *boxes*, of unequal and sometimes large size. A
placement with excellent stress can still have two 400×76 boxes sitting on top of each other.

Removing overlaps is two stages, and the split is the interesting part.

### Stage 1 — relaxation (shaping)

`overlap_removal_passes` passes (default **6**). Each pass indexes the boxes in a uniform spatial
hash, walks candidate pairs in ascending $(i,j)$ order, and for every pair still closer than its
required clearance moves **both** boxes half the penetration apart, **along the axis of least
penetration**:

```text
   overlapping                       axis of least penetration = x
                                     (needs 18 px of x, or 60 px of y)

   ┌───────────┐                      ┌───────────┐  ┌───────────┐
   │     A     │                      │     A     │  │     B     │
   │      ┌────┼──────┐               │           │  │           │
   └──────┼────┘      │      ───▶     └───────────┘  └───────────┘
          │     B     │                 ◄── 9px       9px ──►
          └───────────┘                 both move, symmetrically
```

Required clearance is `effective_node_gap` (56) horizontally and `effective_rank_gap` (120)
vertically. Organic has no ranks, but the two knobs still mean "side-by-side breathing room" and
"stacked breathing room", so honouring both keeps the spacing family meaningful in this mode.

Choosing the cheaper axis is what preserves the arrangement SGD found: it is the smallest
displacement that resolves the overlap, so the drawing barely moves. A pass that applies no push
stops the loop early — a termination shortcut, not a convergence test. Nothing is re-run and nothing
is rolled back.

What relaxation does **not** do is finish the job. On a 600-node mesh six passes remove the great
majority of overlaps but not all of them, and driving it to zero takes $O(n)$ passes, i.e. $O(n^2)$
work.

### Stage 2 — the exact sweep (the guarantee)

One scan-line pass closes whatever is left. Boxes are visited in ascending centre-$x$ order, and each
is pushed just far enough right to clear every already-placed box it still overlaps vertically:

$$c_x(j) \;:=\; \max\Bigl(c_x(j),\ \max_{i \text{ placed},\ i \text{ overlaps } j \text{ in } y}
\bigl[c_x(i) + \tfrac{w_i + w_j}{2} + \texttt{node\_gap}\bigr]\Bigr)$$

Correctness is easy to see, and that is the point of writing it this way: after $j$ is placed, every
earlier box either misses it in $y$ or is at least $(w_i + w_j)/2$ to its left. Because boxes only
ever move **right**, placing $j$ can never disturb a pair that was already resolved — which is what
makes one pass sufficient and a second one pointless.

**After this returns, no two node boxes overlap.** That is a guarantee, not a best effort.

Why both stages? Stage 1 alone would ship a defect nothing downstream can repair. Stage 2 alone
would produce a drawing visibly skewed to the right, because it resolves everything by moving boxes
in one direction. Running stage 1 first is what leaves stage 2 almost nothing to do.

Note that the vertical conflict test in stage 2 uses the **raw** boxes, not gap-inflated ones.
Demanding 120 px of vertical clearance there would convert nearly every pair into a horizontal
constraint and shear the whole drawing sideways; the relaxation has already opened the comfortable
gaps, and this pass exists only to close the residue.

Setting `overlap_removal_passes = 0` disables **both** stages. It is the only configuration in which
these engines emit overlapping boxes, and it does so deliberately — for callers who want to see the
raw stress positions.

---

## 5. Edges and badges

### Straight lines, clipped to the boxes

There is no flow direction here, so orthogonal routing would be meaningless — an axis-aligned
staircase between two nodes that have no "above" relationship communicates nothing and costs bends.
Every edge is a straight segment from boundary to boundary:

```text
        ┌────────┐
        │   A    │
        └───●────┘        ● = the clipped attachment point (a "port")
             ╲
              ╲
               ╲
             ┌──●─────┐
             │    B   │
             └────────┘
```

The engine clips the ray from each box's centre toward the other box's centre against the box
boundary. If the clip degenerates — coincident centres, or a zero-area box — it substitutes the
right-edge midpoint, because Phase 9 rejects a port that is not on its node's boundary and an
arbitrary-but-valid attachment is better than an invalid one.

**Self-loops** are a fixed four-point bracket off the node's right side, with endpoints at one third
and two thirds of the node's height so the loop is symmetric about the centre line. There is nothing
to search and nothing to clip: the shape is a table lookup.

An honest consequence of straight-line drawing: a line between two boxes can graze a third. The
layered pipeline prevents this by reserving a routing lane for every segment; organic has no such
machinery, and `EDGE_NODE_PENETRATION` here is reported as a **warning**, not an error. Asserting a
guarantee the engine never made would make the quality gate useless.

### Badge placement is local, greedy, and best-effort

This is the one mode where edge labels genuinely need a placement pass. In the layered pipeline a
label is an *item in the layered graph* carrying its own measured box, so badge space is allocated
by the same machinery that separates nodes and cannot fail to fit. Organic has no layered graph to
reserve space in.

So: badges are placed in **descending area order** (ties by edge index, so the order is total and
has no float-equality hazard) — the hardest boxes to fit choose first. Each tries **5** candidate
centres around its edge:

```text
                    ╱ edge
        [4]        ╱          candidate order:
             [1]  ╱           1. the `label_placement` primary (beside / on / above)
                 ●  ← t=0.5   2. the opposite side
             [2]╱             3. earlier along the edge (t = 0.35)
               ╱  [3]         4. later along the edge, other side (t = 0.65)
              ╱               5. twice as far out on the primary side
```

The first candidate that clears every node box and every already-placed badge wins; conflicts are
found through a uniform spatial hash rather than an all-pairs scan. When no candidate is clear the
**least conflicted** one is used — the search scores overlap *area*, not a boolean, which is what
makes "pick the least bad" possible — and a **leader line** is drawn from the edge to the badge.

**Be clear about the quality here.** On `dense_kubernetes_mesh` (30 nodes, 45 labelled edges),
organic mode measures:

| metric | organic | layered |
| --- | ---: | ---: |
| leader lines | **18** | 0 |
| badge–node overlaps | **23** | 0 |
| badge–badge overlaps | **2** | 0 |

A rising leader count is a quality signal, not a routine outcome — and on a dense labelled mesh,
organic's badges are genuinely crowded. If label quality matters more than crossing count for your
graph, that is an argument for layered even on a mesh. The numbers are reproducible with the audit
harness; see [the quality model](../concepts/quality-model.md).

---

## 6. What v1 called "force"

v1's organic mode was not a force layout, a stress layout, or any kind of layout that read the
graph. It was this:

```rust
let columns = (node_count as f64).sqrt().ceil();
let stagger = if row % 2 == 1 { node_gap * 0.5 } else { 0.0 };
// … straight centre-to-centre lines
```

A staggered grid with lines through node centres:

```text
   [n0]        [n1]        [n2]
       [n3]        [n4]        [n5]
   [n6]        [n7]
```

It ignored topology **entirely**. Two strongly related nodes were as likely to land in opposite
corners as next to each other, because placement was a function of array index and nothing else. The
odd-row stagger existed to make it look less robotic.

For the use case that motivates an organic mode most — meshes and network diagrams — that is the
worst possible answer, and it meant a mesh had nowhere to escape to: the layered engine spent
47 seconds producing 191 crossings, and the alternative was a grid that did not know the edges
existed. This mode is the fix for that, and the 8-versus-28 crossing result is the measurement of
it.

---

## 7. Cost

| stage | complexity | notes |
| --- | --- | --- |
| all-pairs BFS | $O(V(V+E))$ | up to 400 nodes |
| pivot BFS | $O(P(V+E))$, $P \approx 100$ | above 400 nodes |
| SGD | $O(E_{\text{poch}} \cdot \lvert \text{pairs} \rvert)$ | 30 epochs × $\binom{n}{2}$ or × $nP$ |
| relaxation | $O(\texttt{passes} \cdot n)$ expected | spatial hash keeps candidates per query $O(1)$ |
| exact sweep | $O(n^2)$ worst case | each box tested against all earlier ones |
| routing | $O(E)$ | one clip per endpoint |
| badges | $O(L)$ expected | spatial hash, 5 candidates each |

Measured: **0.41 ms** for `dense_kubernetes_mesh` (30 nodes, 45 edges) — about a quarter of the
layered engine's 1.70 ms on the same graph. See
[computational complexity](../concepts/computational-complexity.md).

`time_budget_ms` is **not** consulted by this engine, deliberately. The cost is a deterministic
function of node count and `stress_iterations`, and clipping epochs on wall-clock time would make
the drawing depend on how loaded the machine was. `stress_iterations` is the budget knob here.

---

## 8. Config

From [the config](../../crates/gvui/src/0_common/0_2_config.rs):

| knob | default | effect |
| --- | ---: | --- |
| `stress_iterations` | 30 | SGD epochs; the real cost/quality dial for this mode |
| `stress_ideal_edge_length` | 180 | desired free space between adjacent boxes, in px |
| `overlap_removal_passes` | 6 | relaxation passes; `0` disables overlap removal entirely |
| `node_gap` | 56 | added to `stress_ideal_edge_length` for the distance unit; horizontal clearance |
| `rank_gap` | 120 | vertical clearance during relaxation |
| `compaction` | `balanced` | scales both gaps, hence the distance unit too |
| `target_aspect_ratio` | 1.6 | area-preserving stretch after SGD |
| `label_placement` | `beside-edge` | which badge candidate is tried first |
| `badge_clearance` | 10 | padding reserved around a badge box |

`direction` is ignored: there is no flow axis to point.

---

← [Layered](./01-layered.md) | [Index](./README.md) | [Next: Radial →](./03-radial.md)
