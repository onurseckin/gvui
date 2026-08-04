# 04 — Configuration and quality

---

## 1. Why the current config surface is a problem

38 flat knobs, of which roughly 15 exist only to bound a search:

```
maxLayoutStates      maxFrontierSize          maxNeighborsPerState
maxPortStatesPerPass maxPortAlternativesPerEdge maxRouteOrderVariants
maxRipUpPasses       maxConflictPermutations  maxConflictPermutationSize
maxRouteCandidatesPerEdge maxAStarStatesPerRoute maxBadgeStates
maxBadgeBacktrackSteps maxBadgeCandidatesPerEdge maxAestheticPasses
```

These are not tuning knobs, they are budget dials on a process that does not converge. Measured
evidence that they behave non-monotonically:

- `kubernetes_cluster_topology`: `maxConflictPermutations` 32 → 1 gives a **12× speedup and an
  identical result** (13 routes, 4 crossings, valid).
- `dense_kubernetes_mesh`: `initialLaneRings` 2 → 1 **improves** crossings from 206 to 146.
- `distributed_saga_workflow`: default config routes **10 of 11 edges**; `initialLaneRings=1`
  routes all 11.

Turning a knob changes the answer unpredictably. That is not tunability — it is noise, and it makes
the "personal tweaking" workflow impossible in practice. In v2 these knobs disappear with the search
they bound.

## 2. The v2 config surface

Three tiers. Tier 1 is what actually gets tuned; the others are for experimentation and safety.

### Tier 1 — Aesthetics

Every one of these has a **monotone, predictable** effect. Turning it up always does more of the
same thing.

| knob | default | effect |
| --- | --- | --- |
| `direction` | `TB` | `TB` \| `BT` \| `LR` \| `RL` |
| `nodeGap` | 56 | minimum horizontal separation within a rank |
| `rankGap` | 120 | minimum vertical separation between ranks (channels can raise it) |
| `graphPadding` | 80 | outer margin |
| `laneSpacing` | 12 | distance between parallel routing lanes |
| `portPitch` | 18 | minimum spacing between ports on one node side |
| `portStubLength` | 20 | straight run before the first bend |
| `cornerRadius` | 8 | bend rounding; `0` = sharp |
| `edgeStyle` | `orthogonal` | `orthogonal` \| `rounded` \| `spline` |
| `labelPlacement` | `beside-edge` | `on-edge` \| `beside-edge` \| `above-edge` |
| `badgeClearance` | 10 | padding reserved around a badge box |
| `maxLabelWidth` | 220 | wrap width for edge labels |
| `maxLabelLines` | 3 | then ellipsize |
| `minNodeWidth` / `maxNodeWidth` | 120 / 420 | shrink-to-fit clamp |
| `targetAspectRatio` | 1.6 | drives rank-width balancing and component packing |
| `maxNodesPerRank` | auto | overrides the derived rank-width cap |
| `bundleParallelEdges` | `true` | route parallel edges as a bus |
| `compaction` | `balanced` | `tight` \| `balanced` \| `airy` — a preset over gaps and lane spacing |

### Tier 2 — Algorithm selection

For experimentation and for A/B comparison in the developer panel.

| knob | default | alternatives |
| --- | --- | --- |
| `ranker` | `network-simplex` | `longest-path`, `tight-tree` |
| `ordering` | `median` | `barycenter` |
| `orderingSweeps` | 16 | |
| `orderingSeeds` | 4 | 1 for strict determinism benchmarking |
| `coordinator` | `brandes-kopf` | `simple` (rank-centred, for debugging) |
| `bkAlign` | `median` | `leftmost`, `rightmost`, `up-left`, … |
| `dummyPriority` | `true` | disable to see the effect on long-edge straightness |

### Tier 3 — Budgets

| knob | default | purpose |
| --- | --- | --- |
| `timeBudgetMs` | 250 | soft cap; Phase 5 stops sweeping and everything else completes |
| `maxDummyChainLength` | 64 | guard against pathological spans |
| `assertConstraints` | dev only | run the Phase 9 invariant checks in release too |

**Deleted:** all fifteen `max*States` / `max*Permutations` / `max*Passes` / `max*Candidates` knobs,
plus `bendPenalty`, `crossingPenalty`, `directionPenalty`, `sideReusePenalty`, `nearObstaclePenalty`
(A\* cost weights, and A\* is gone), and `initialLaneRings` / `maxLaneRings` (grid construction, and
the grid is gone).

## 3. Quality model

Replace the 21-field lexicographic `LayoutScore`. Split into two categories with different
semantics.

### 3a. Constraints — must hold, verified not optimized

| constraint | guaranteed by |
| --- | --- |
| No node–node overlap | Brandes–Köpf separations (Phase 7) |
| No edge–node penetration | lane routing inside channels/corridors (Phase 6) |
| No badge over a node or another badge | label nodes are separated items (Phase 4/7) |
| Every edge routed | routes are constructed, never searched (Phase 8) |
| All segments orthogonal | polyline is built from axis-aligned steps |
| Ports on the node boundary | ports are computed from the box |
| Deterministic output | no HashMap iteration order in any decision path |

Asserted under `debug_assertions` and in CI; compiled out in release. **A constraint violation is a
bug report, not a score.** This is the important change: today a violated constraint is a number the
search tries to reduce, which means the engine can ship an invalid layout (`dense_kubernetes_mesh`:
`valid = false`) and call it a result.

### 3b. Metrics — reported, not searched

Surfaced in the developer panel so tuning has visible feedback:

| metric | meaning |
| --- | --- |
| `crossings` | after Phase 5. `geometricCrossings` will exceed it somewhat — lane routing also crosses where a vertical run meets another edge's horizontal run in the same channel, which the combinatorial count does not model. Watch the *ratio*: a small, stable excess is normal, a large one means lane ordering is fighting the topology. Measured: 28 → 44 on `dense_kubernetes_mesh`, 0 → 0 on most fixtures |
| `bends` | total; Brandes–Köpf caps at 2 per edge for adjacent-rank edges |
| `totalEdgeLength` | Manhattan |
| `straightChainRatio` | fraction of dummy chains that are perfectly vertical — the single best proxy for "looks designed" |
| `area`, `aspectRatio` | |
| `laneDepthMax` | widest channel; a large value means the ordering is fighting the topology |
| `portSideBalance` | |
| `leaderCount` | badges that needed a leader line — should be ~0; nonzero means the label-node reservation is being defeated somewhere |
| `labelsTruncated` | labels that hit `maxLabelLines` |
| per-phase `durationMs` | |

`leaderCount` and `straightChainRatio` are the two to watch. They are early warnings that a
structural assumption has broken, in a way that a single aggregate score would hide.

### 3c. Regression harness

Extend `scripts/runLayoutAudit.ts` into a real gate over `public/data/graphs/*` plus the 20 built-in
scenarios, asserting:

1. **Zero constraint violations** on every fixture. Non-negotiable.
2. **Metrics within a recorded band** — snapshot `crossings`, `bends`, `area` per fixture and fail on
   regression beyond a tolerance. This is how aesthetic quality gets defended over time.
3. **Time budget** — fail if any fixture exceeds e.g. 50 ms in native release.
4. **Determinism** — run each fixture twice and require byte-identical output.

Today's audit reports diagnostics but asserts nothing, so `dense_kubernetes_mesh` producing an
invalid layout with 191 crossings is a line of console output rather than a failing build.

## 4. Presets

Because the underlying knobs are now monotone, presets become meaningful:

| preset | changes |
| --- | --- |
| `compact` | `nodeGap` 36, `rankGap` 72, `laneSpacing` 8, `compaction: tight` |
| `readable` (default) | as above defaults |
| `presentation` | `nodeGap` 80, `rankGap` 160, `cornerRadius` 14, `labelPlacement: beside-edge` |
| `dense-mesh` | `targetAspectRatio` 2.2, `bundleParallelEdges` true, `edgeStyle: rounded` |

Presets should be the primary UI; the full knob list stays available behind a disclosure in the
developer panel.
