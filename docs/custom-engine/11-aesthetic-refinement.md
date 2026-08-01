← [Previous: Optimization Loop](./10-optimization-loop.md) | [Index](./README.md)

# Bounded Aesthetic Search

This chapter explores the final polish phase of the layout engine: **Bounded Aesthetic Search**. The primary optimization loop guarantees a functionally correct layout, but this phase exists solely to make it _beautiful_.

## Atoms: Correct vs. Beautiful

The main optimization loop (discussed in Chapter 10) operates on hard constraints: zero node overlaps, zero edge penetrations, and minimized edge crossings. Once it achieves a score of 0 for these critical penalties, it considers its job done.

However, a layout can have 0 crossings and 0 overlaps, yet still look terrible.

**Layout A: Functionally Correct (0 Crossings, 2 Hairpins)**

```text
  [Node A]
    | (bottom port)
    v
   ( ) <-- (Unnecessary U-turn out of bottom port)
    |
  /-+-/
  | |
  | \-\
  \---(>)[Node B] (entering left port)
```

**Layout B: Beautiful (0 Crossings, 0 Hairpins)**

```text
  [Node A]
    | (right port)
    +----------------\
                     |
                     v
                  [Node B] (entering top port)
```

Both layouts are valid. But Layout B is dramatically cleaner. The primary search doesn't care about Layout B because Layout A already has zero overlaps and crossings. The aesthetic refinement phase exists to find Layout B.

## Molecules: Hairpins and Excess Bends

What causes these ugly visual artifacts?

1. **Hairpins (U-turns)**: A hairpin occurs when an edge routes out of a node, immediately doubles back on itself, and travels in the opposite direction. The A* router often creates a U-turn to avoid an obstacle, but simply assigning the edge to a different port side would eliminate the need for a U-turn entirely.
2. **Excess Bends**: An edge that requires 4 orthogonal bends when 2 would suffice. This is frequently caused by routing order artifacts, where earlier routed edges force later edges to take convoluted paths.

### Why a Separate Phase?

Why not penalize hairpins in the main search loop? Because beauty is subjective and fragile. If we heavily penalize hairpins early on, the main search might prioritize fixing a hairpin over fixing a node overlap. The engine separates concerns:

1. **Main Search**: Solve the topology. Untangle the graph. Ensure zero overlaps.
2. **Aesthetic Search**: Polish the routing. Reduce bends and hairpins without breaking the topology.

## Cells: The Refinement Loop and Trial States

To fix these issues, we run a targeted, secondary search loop. See [runBoundedAestheticSearch](../../src/engine/layout/custom/boundedAestheticSearch.ts#L77).

Unlike the primary optimization loop, the aesthetic refinement loop does not attempt broad, chaotic mutations. It is highly structured and looks exclusively at edges that currently exhibit a hairpin or excess bend.

### Trial State Generation

For every edge with an aesthetic defect, the engine generates very specific trial states. See [generateAestheticTrialStates](../../src/engine/layout/custom/neighborhoodSearch.ts#L322).

1. **Outward Source Moves**: Shift the source port to a side facing the exterior of the graph. This often gives the router a clean, unobstructed corridor.
2. **Target-Toward-Source Moves**: Bring the target port closer to the source node, reducing the distance the route must travel and often stripping away bends.

### Traced Example: Fixing a Hairpin

Let's trace the engine fixing an edge `E1` from `Node A` to `Node B` that currently has a hairpin.

**Current State**:

- `E1` source port: Bottom
- `E1` target port: Left
- Hairpins: 1
- Bends: 4

**Step 1: Generate Trial States**
The engine identifies `E1` as defective. It generates specific port-swap trials:

- _Trial 1 (Outward)_: Move source port to Right.
- _Trial 2 (Target-Toward-Source)_: Move target port to Top.
- _Trial 3 (Combined)_: Source Right, Target Top.

**Step 2: Evaluate Trials**
The engine runs the router for each trial.

- _Trial 1_: Reduces bends to 3, hairpins to 1.
- _Trial 2_: Reduces bends to 3, hairpins to 1.
- _Trial 3_: Reduces bends to 1, hairpins to 0. (This matches "Layout B" from the Atoms section).

**Step 3: Verify Constraints**
The engine checks _Trial 3_. Does it introduce new node overlaps? No. Does it introduce new crossings? No. It strictly improves the aesthetic score (bends and hairpins) without degrading the hard constraints.

**Step 4: Apply**
Trial 3 becomes the new best layout.

### Bounded Evaluation and Budget Constraints

Evaluating every possible port combination for every edge is too slow. The aesthetic search is strictly bounded:

- It only targets edges that actually have defects.
- It limits the number of generated trial states per edge.
- It has a maximum iteration budget (e.g., 50 evaluations total).
- It stops early if the layout reaches a "perfect" aesthetic score (0 hairpins, minimal bends).

If a trial fixes a hairpin but introduces a crossing, the engine generates **crossing repair completions** to attempt to fix the new crossing while preserving the aesthetic win. If it can't fix the crossing, the trial is rejected—correctness always trumps beauty.

## Organisms: Publication-Quality Results

The two-phase search strategy is why the custom engine produces publication-quality results.

1. **Phase 1 (Optimization Loop)** aggressively explores the state space to achieve functional correctness (untangling crossings and ensuring badges fit).
2. **Phase 2 (Aesthetic Refinement)** carefully polishes the correct layout, eliminating U-turns and excess bends to achieve visual harmony.

### Summary of the Complete Pipeline

At this point, you understand the entire lifecycle of a graph in the custom engine:
`Normalization` → `Layering` → `Ordering` → `Positioning` → `Routing` → `Badges` → **`Search Loop`** → **`Aesthetic Refinement`**.

For implementation details, explore:

- [boundedAestheticSearch.ts](../../src/engine/layout/custom/boundedAestheticSearch.ts)
- [neighborhoodSearch.ts](../../src/engine/layout/custom/neighborhoodSearch.ts) (specifically the aesthetic generation functions)
