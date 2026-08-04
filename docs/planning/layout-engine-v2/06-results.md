# 06 — Results

Measured outcome of the v2 implementation. All figures are native `--release` on the same machine
and the same eight datasets used in [00-diagnosis.md](./00-diagnosis.md), so the two tables are
directly comparable.

Reproduce with:

```sh
cargo run --release --manifest-path crates/gvui/Cargo.toml --example audit
```

---

## 1. Layered engine, before and after

| dataset | N | E | v1 ms | v2 ms | speedup | v1 crossings | v2 crossings | v1 valid | v2 valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--: | :--: |
| `decision_tree` | 5 | 4 | 66.6 | **0.04** | 1,665× | 0 | 0 | ✓ | ✓ |
| `cyclic_mesh` | 5 | 6 | 154.6 | **0.08** | 1,933× | 0 | 0 | ✓ | ✓ |
| `ai_agent_trace` | 6 | 6 | 13.1 | **0.36** | 36× | 0 | 0 | ✓ | ✓ |
| `clean_ring_10n_10e` | 10 | 10 | 192.3 | **0.11** | 1,748× | 0 | 0 | ✓ | ✓ |
| `crossing_mesh_10n_10e` | 10 | 10 | 1,571.1 | **0.35** | 4,489× | 3 | 6 | ✓ | ✓ |
| `distributed_saga_workflow` | 10 | 11 | 1,788.7 | **0.11** | 16,261× | 0 | 0 | ✓ | ✓ |
| `kubernetes_cluster_topology` | 12 | 13 | 26,710.0 | **0.14** | **190,785×** | 2 | 0 | ✓ | ✓ |
| `dense_kubernetes_mesh` | 30 | 45 | 47,335.8 | **1.79** | **26,445×** | 191 | **28** | ✗ | ✓ |

Slowest fixture across **all five engines** and all eight datasets: **1.88 ms** against a 50 ms
budget. The target in [README](./README.md#target) was <10 ms for the 30-node mesh; the measured
value is 1.79 ms.

`crossing_mesh_10n_10e` is the one fixture where v2 reports more crossings than v1 (6 vs 3). That
is not a regression in the drawing: v1 produced 3 *geometric* crossings by routing edges through a
2-rank layout in which half the edges are feedback edges, and paid 1.5 seconds of A\* to do it.
v2 reports 6 crossings that are genuinely present in a graph whose forward DAG is only 2 ranks
deep — this dataset is a real organic-mode candidate, not a layered one
(see [03-modes.md](./03-modes.md)).

## 2. All engines

```
dataset                        engine         N    E        ms  ranks  cross    geo  bends straight  ldr valid   det
--------------------------------------------------------------------------------------------------------------------
ai_agent_trace                 layered        6    6      0.36      8      0      0     20    1.00    0   yes   yes
ai_agent_trace                 left-right     6    6      0.09      8      0      0     20    1.00    0   yes   yes
ai_agent_trace                 organic        6    6      0.07      0      0      0      0    1.00    2   yes   yes
ai_agent_trace                 radial         6    6      0.03      0      0      0      1    1.00    0   yes   yes
ai_agent_trace                 grid           6    6      0.03      0      0      0      0    1.00    1   yes   yes
dense_kubernetes_mesh          layered       30   45      1.79     15     28     44    234    0.96    0   yes   yes
dense_kubernetes_mesh          left-right    30   45      1.82     15     27     57    234    0.87    0   yes   yes
dense_kubernetes_mesh          organic       30   45      0.43      0      8      8      0    1.00   18   yes   yes
dense_kubernetes_mesh          radial        30   45      0.30      0     32     32     14    1.00    0   yes   yes
dense_kubernetes_mesh          grid          30   45      0.27      0     99     99      0    1.00   23   yes   yes
...
AUDIT PASSED: 40 fixture/engine combinations clean
```

Every one of the 40 combinations is **valid**, **deterministic** across processes, and within
budget. 393 Rust unit tests pass.

Notable: on the dense mesh, **organic mode produces 8 crossings against layered's 28** — which is
the whole argument for having a real stress engine rather than v1's staggered grid. That dataset
has 13 feedback edges out of 45; it does not have a strong flow direction, and forcing it into
ranks costs crossings.

## 3. Did the design claims hold?

| Claim | Result |
| --- | --- |
| Badge space allocated by construction; no retry | **Held.** `leader_count` is 0 on every layered fixture — no badge ever needed a fallback leader line. |
| Lane demand exact; routing cannot fail | **Held.** Zero `MISSING_ROUTE`, zero `unresolved_route_count` across all fixtures. |
| Dummy chains straight (Brandes-Köpf) | **Held.** `straight_chain_ratio` is 1.00 on seven of eight fixtures, 0.96 on the dense mesh. |
| Determinism | **Held.** Every fixture byte-identical across two processes. |
| Ranking fixed by passing the role map | **Held.** `dense_kubernetes_mesh` went from 2 ranks (28 nodes in one row) to 15. |
| ~1000× faster | **Exceeded.** Median speedup ~1,700×; worst-case fixtures 26,000× and 190,000×. |

## 4. What the audit caught that the unit tests did not

Both of the bugs found at integration were **defects in the design spec in
[02-algorithms.md](./02-algorithms.md), not in the implementations.** Each agent implemented its
written contract faithfully; the contract was wrong. Recording them because the pattern matters
more than the fixes.

### 4a. `is_cycle` was treated as a mandate instead of a bias

The spec said feedback hints are "pinned" and excluded from SCC/FAS analysis so the heuristic
cannot overrule an explicit instruction. That is unsound. Eades' guarantee is that reversing the
arcs it returns yields a DAG — but only because it derives them from a total vertex sequence
covering *every* arc it was shown. Reversing an edge it never saw can create a fresh cycle it has
no chance to fix.

Six of the eight datasets carry `isCycle` flags (12 of 45 edges on the dense mesh). The result was
`is_dag = false`, which sent longest-path ranking into an unbounded relaxation along a live cycle:
**249 ranks for 30 nodes**, 559 layered items, and an out-of-bounds panic three phases later inside
the accumulator tree.

Fix: hints set the *starting orientation*; the FAS pass then sees every non-self arc in its current
orientation and toggles whatever it needs. Acyclicity became a property of the algorithm instead of
an assumption. `EdgeRole` is now derived from the final `reversed` flag rather than from the hint,
so the role can never disagree with what the pipeline actually did.

### 4b. The dummy-chain cap broke the adjacency contract

The spec's `max_dummy_chain_length` pathology guard said to keep "only the first and last `cap/2`
intermediate ranks". That deliberately creates one link spanning many ranks — and `up`/`down` are
declared as *adjacent-rank* adjacencies that three phases rely on: BMJ counting indexes its
accumulator tree by the target's `order` within rank `r+1`, lane demand derives channel intervals
from a single rank gap, and Brandes-Köpf's type-1 conflict marking assumes single-rank segments.

The cap is now advisory: chains are always contiguous, and an over-long span is a diagnostic.

### 4c. A stale coordinate space (an implementation bug, not a spec bug)

`assign_rank_bands` was called before `assign_coordinates`, which then translated the whole drawing
to `graph_padding`. The captured band tops were left in pre-translation space, so every routing
channel landed *inside* the nodes — 184 `EDGE_NODE_PENETRATION` errors, every one an edge cutting
through its own source node.

Fix: `assign_coordinates` now returns the post-translation band tops. The band tops are only
meaningful in the same coordinate space as the items, so the function that moves that space is the
only one that can hand them out safely.

### 4d. The constraint policy was wrong for the straight-line engines

The spec told the audit to fail on "any constraint counter non-zero", for every engine. The
TypeScript audit implemented that literally and reported 34 failures; the native audit, which only
checked `is_valid`, reported none. The gates disagreed because the policy was wrong, not because
one of them was buggy.

`EDGE_NODE_PENETRATION` and `BADGE_*_OVERLAP` are guaranteed absent in the **layered** pipeline
because Phase 6 reserves a routing lane for every segment and the label item reserves badge area.
Organic, radial and grid have neither — they draw a straight line between two boxes by design, so a
line grazing a third box is a property of straight-line drawing, not a defect. Asserting a
guarantee an engine never made would have made the gate useless, and "fixing" it by deleting the
assertion would have made it dishonest.

Both gates now encode the same split:

| counter | layered / left-right | organic / radial / grid |
| --- | --- | --- |
| `nodeNodeOverlaps` | **fail** | **fail** (overlap removal, grid, ring sizing all prevent it) |
| `unresolvedRouteCount`, `unresolvedBadgeCount` | **fail** | **fail** (no engine may drop an edge) |
| `edgeNodePenetrations` | **fail** | reported as best-effort |
| `badgeNodeOverlaps`, `badgeBadgeOverlaps` | **fail** | reported as best-effort |

**The lesson for the audit harness:** all four problems were invisible to 393 passing unit tests,
because each unit tested its module against the same (wrong) contract the module was built from.
Three surfaced within minutes of running real datasets through the whole pipeline with invariant
assertions on; the fourth surfaced only because two independent gates disagreed. The gate in
[04-config-and-quality.md](./04-config-and-quality.md) is not bureaucracy — it is the only thing
that was actually load-bearing here.

## 4e. Final gate status

```
1. Rust unit tests ........... 393 passed, 0 failed
2. Rust audit ................ 40 fixture/engine combinations clean, slowest 1.74 ms
3. WASM build ................ 663 KB (239 KB gzipped), exports verified
4. TypeScript typecheck ...... 0 errors
5. Lint (oxlint) ............. clean
6. Frontend tests ............ 99 passed, 0 failed
7. TS layout audit ........... 168 fixture/mode runs, 0 failures
8. Production build .......... 172 ms, dagre chunk gone
```

## 5. Known gaps

1. **Geometric crossings exceed combinatorial crossings on the dense mesh** (44 vs 28; 57 vs 27 in
   LR).

   Some gap is inherent and not a defect: the combinatorial count measures order inversions between
   adjacent ranks, whereas orthogonal lane routing also creates intersections where one edge's
   vertical run passes through another's horizontal run in the same channel. Every lane-based
   orthogonal router has this property. My earlier claim in
   [04-config-and-quality.md](./04-config-and-quality.md) that "a mismatch is a bug" was too strong
   — the correct statement is that the gap should be *small and stable*.

   A 57 % excess is larger than it should be, and the LR variant is worse on both counts
   (57 vs 27, with `straight_chain_ratio` dropping to 0.87). That points at the lane-ordering
   relabel step not fully honouring the left-edge discipline for reversed edges. Worth
   investigating; it is a quality issue, not a correctness one.
2. **`clean_ring_10n_10e` produces 19 ranks for 10 nodes.** Correct given `min_len = 2` on labelled
   edges, but it means a 10-node ring draws as a very tall column. Rank balancing caps rank *width*
   and cannot compact *height*; see the note in [05-roadmap.md](./05-roadmap.md). Worth a follow-up
   decision.
3. **Organic mode leader counts are non-zero** (18 on the dense mesh). Expected — organic has no
   layered structure in which to reserve label space, so its badges genuinely need local placement.
   Not a bug, but it is the metric to watch if organic label quality matters.
4. **WASM has not been measured**, only native. The 663 KB module builds and exports correctly, but
   browser timings are unverified.
