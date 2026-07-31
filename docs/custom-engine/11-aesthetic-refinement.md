← [Previous: Optimization Loop](./10-optimization-loop.md) | [Index](./README.md)

# Bounded Aesthetic Search

This chapter explores the final polish phase of the layout engine: Bounded Aesthetic Search. Once the layout is functionally correct, this phase makes it beautiful.

## Atoms: Correct vs. Beautiful

The optimization loop (discussed in Chapter 10) is heavily focused on hard constraints. It searches until it finds a layout with zero overlaps, zero penetrations, and minimized crossings. 

However, a layout can have 0 crossings and 0 overlaps, yet still look terrible.

**Layout A (0 Crossings, 3 Hairpins)**
```text
  [Node A]
    |
   (B)
    |
  /-+-/    <-- Unnecessary U-turn (Hairpin)
  | |
  | \-\
  \---(L)[Node B]
```

**Layout B (0 Crossings, 0 Hairpins)**
```text
  [Node A]
    |
   (B)
    |
    |
   (T)
  [Node B]
```

Both layouts are functionally valid. But Layout B is dramatically cleaner. The aesthetic refinement phase exists solely to transform layouts like A into layouts like B.

## Molecules: Hairpins and Excess Bends

What causes these ugly visual artifacts? 

1. **Hairpins (U-turns)**: A hairpin occurs when an edge routes out of a node, doubles back on itself, and travels in the opposite direction. Often, the A* router is forced to create a U-turn to avoid an obstacle (like a node in the way), but simply assigning the edge to a different port side would eliminate the need entirely.
2. **Excess Bends**: An edge that requires 4 orthogonal bends when 2 would suffice. This is frequently caused by routing order artifacts, where earlier routed edges force later edges to take convoluted paths.

## Cells: The Refinement Loop

To fix these issues, we run a targeted, secondary search loop. See [runBoundedAestheticSearch](../../src/engine/layout/custom/boundedAestheticSearch.ts#L77).

Unlike the primary optimization loop, the aesthetic refinement loop does not attempt broad, chaotic mutations. It is highly structured and looks exclusively at edges that currently exhibit a hairpin or excess bend.

### Trial State Generation

For every edge with an aesthetic defect, the engine generates very specific trial states. See [generateAestheticTrialStates](../../src/engine/layout/custom/neighborhoodSearch.ts#L322).

1. **Outward Source Moves**: Shift the source port to a side facing the exterior of the graph. This often gives the router a clean, unobstructed corridor.
2. **Target-Toward-Source Moves**: Bring the target port closer to the source node, reducing the distance the route must travel and often stripping away bends.

### Bounded Evaluation

Each of these trial states is evaluated through the full layout pipeline. 
- If a trial fixes a hairpin but introduces a crossing, the engine generates **crossing repair completions** to attempt to fix the new crossing while preserving the aesthetic win.
- If the new state results in a strictly better score (fewer hairpins, fewer bends, shorter length) without introducing overlaps or crossings, it becomes the new best layout.

This search is tightly bounded. It has a limited evaluation budget and terminates quickly, ensuring the engine remains responsive.

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
