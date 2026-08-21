# Relational layout — deferred plan

**Status:** deferred 2026-08-21. Not started. The skill is the priority; the layered engine already
gives a stable, good rendering system, so this is not urgent.

## What this is

Not "improve radial". The owner's actual request, in his words:

> "For layered, what we have still looks a bit tree-like — starting from the top going to the bottom.
> I am happy with its stability, I do not want to break it.
>
> Instead of radial, what I am thinking is it should really look like an illustrated graph. Graphs
> usually look more compact, things are closer to centre, and they are not always top to bottom. They
> do not have a hierarchy like a tree. Their system is based on DIRECTIONS and CONNECTIONS. One node
> can connect to a node above it, or not from below, or from the corners. My graph has that
> flexibility because it is not based on hierarchy, it is based on RELATION — not who is the parent
> and who is the child, but what directions come INTO a node and what directions go OUT of it.
>
> I do not want restricted hierarchies where all edges leave from one side and reach another side.
> What I want to prioritise: the graph takes enough space, is AS COMPACT AS POSSIBLE, while optimising
> for the LEAST EDGE CROSSING. Ideally there should be no edge crossing. If some crossings are
> inevitable because it is super compact, then visually one edge should JUMP OVER the other to avoid
> visual collision.
>
> Instead of going with blind heuristics, we should already have an understanding of the relation of
> how the items are connected, their content, and their render sizes — a precomputational-grade
> assumption of how it renders. And of course it should pass all of the audit reports."

## Priority order, as stated

1. **Compact** — dense toward the centre, minimal wasted canvas
2. **Fewest crossings** — zero where the topology allows
3. **Non-hierarchical** — neighbours in any direction; no layers, no rings, no imposed axis
4. **Edge-hops** — an unavoidable crossing renders as one edge arcing over the other
5. **Informed, not blind** — placement uses real render sizes, not point masses

## Hard constraints

- **Scale** — near-linear or O(n log n). No unbounded iterate-to-convergence, no O(n²) per step at
  scale, no annealing. The audit enforces a per-fixture time budget.
- **Determinism** — identical input, identical output. The audit fails a NON-DETERMINISTIC fixture.
  No RNG, no unordered-map iteration without sorting.
- **Layered untouched** — `7_1_layered.rs` must stay byte-identical. It is stable and good.

## Measured baseline (fixture-demo.json, 13 nodes, 19 edges)

```
layered/top-down    crossings=0    bendCount=36
layered/left-right  crossings=0    bendCount=16
radial/top-down     crossings=119  bendCount=92
radial/left-right   crossings=117  bendCount=92
```

All report `status=success isValid=true`, because the audit gates validity, leader count, collinear
overlaps and time — **crossings are reported and ignored**. That is how 119 shipped.

## What was already established before deferring

- The pipeline **already measures true node render extents** before placement —
  `7_2_geometric_common.rs` works with `rects[i].width/height` and `badge_measurement`. The
  "precomputational grade" input the owner wants is available; the current radial engine simply does
  not use it for placement decisions.
- The current radial engine is concentric BFS rings around a single root — structurally the
  hierarchy the owner does not want.
- Edge-hops belong in `5_edge_routing/`, not in the engine. Crossing detection maths already exists
  in `6_validation/6_2_metrics.rs`; the hop logic must reuse it so renderer and metric never disagree.

## The two candidate designs

**A — force-directed / stress-based.** Matches the description most naturally: no hierarchy, any
direction, naturally compact. Naive form breaks two constraints: determinism (needs a seed and a
convergence test → use a deterministic seed and a fixed iteration count) and scale (O(n²) per
iteration → multilevel coarsening and/or Barnes-Hut). Its real weakness: it minimises edge _length_
and overlap, **not crossings**. Needs an explicit crossing-reduction step.

**B — planarity-first (topology-shape-metrics).** Planarise, insert remaining edges along shortest
dual paths so each unavoidable crossing becomes a dummy node. **Minimises crossings by construction**
and yields an exact count up front — which is also what an honest audit budget needs. Edges leave any
side, matching "directions, not hierarchy". Risk: full TSM is a large body of work; a tractable subset
must be identified.

A hybrid is likely right: planarity-aware placement for structural crossing reduction, bounded
refinement for compactness, hops for the residue.

## What the audit must gain

- a **crossings budget** against the topology's own lower bound, not a flat number
- a **compactness measure** — bounding-box area or area per node. **Nothing measures this today**, and
  it is the owner's first priority. Without it, an engine could lower crossings by spreading nodes out
  and pass every gate while failing the actual requirement.
- a **bend-count budget**
- **scale fixtures** — the largest today is 13 nodes; several hundred is needed for the time budget to
  mean anything
- a **non-planar fixture**, so the crossings budget has a case proving it is not demanding an
  impossible zero

## Isolation

Was to be built in a worktree on branch `radial-experiment` so `main` stayed interactable for
rendering real skill runs. The worktree was removed when this was deferred; recreate it with:

```
git worktree add -b relational-layout ../gvui-relational main
```
