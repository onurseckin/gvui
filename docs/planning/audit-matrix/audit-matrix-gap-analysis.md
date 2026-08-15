# Module 1: Audit Matrix & Failure Taxonomy Specification

## Executive Summary

The GVUI layout engine suite contains two core production engines:

1. **Layered Engine (`layered`)**: Sugiyama-style hierarchical layout with Brandes-Köpf coordinate assignment, channel-based orthogonal edge routing, and dedicated in-layer label slot allocation.
2. **Radial Engine (`radial`)**: Concentric ring BFS layout with proportional subtree angular wedge allocation and bowed chord routing.

Currently, the regression audit script (`scripts/runLayoutAudit.ts`) verifies a reduced $3 \times 35 = 105$ configuration subset (`layered/top-down`, `layered/left-right`, `radial/top-down`) and applies a split standard: layered layouts must satisfy strict zero-tolerance gates across all 7 geometric constraint metrics, while radial layouts are granted exemptions for four metrics (`edgeNodePenetrations`, `badgeNodeOverlaps`, `badgeBadgeOverlaps`, `badgeEdgePenetrations`) as "unresolved soft conflicts".

This specification defines the exhaustive $2 \times 4 \times 35 = 280$ test matrix, establishes an exhaustive taxonomy of all 35 fixtures, details the geometric and topological mechanisms causing radial soft conflicts, and outlines the architectural blueprint to achieve strict zero-tolerance compliance across all 280 engine/direction/fixture combinations.

---

## 1. The Exhaustive 8-Direction Test Matrix ($2 \times 4 \times 35 = 280$ Runs)

### 1.1 Matrix Dimensionality

$$\text{Total Test Runs} = |\mathcal{E}| \times |\mathcal{D}| \times |\mathcal{F}| = 2 \times 4 \times 35 = 280$$

Where:

- **Engines ($\mathcal{E}$)**:
  1. `layered`: Hierarchical multi-rank engine (supports orthogonal routing, channel assignment, port distribution).
  2. `radial`: Polar concentric rings engine (BFS depth rings, proportional wedge distribution, polar obstacle avoidance).
- **Flow Directions ($\mathcal{D}$)**:
  1. `top-down` (TD / TB): Natural rank progression downward along $+y$.
  2. `bottom-top` (BT / BU): Inverted rank progression upward along $-y$.
  3. `left-right` (LR): Transposed rank progression rightward along $+x$.
  4. `right-left` (RL): Inverted-transposed rank progression leftward along $-x$.
- **Fixtures ($\mathcal{F}$)**: 35 verified graph topologies (26 synthetic stress scenarios + 9 real-world telemetry topologies).

```
+---------------------------------------------------------------------------------------------------+
|                                 GVUI 280-RUN AUDIT MATRIX                                         |
+------------------------------------+--------------------------------------------------------------+
| Layered Engine (140 runs)          | Radial Engine (140 runs)                                     |
|  - Top-Down     (35 fixtures)      |  - Top-Down / Standard Polar   (35 fixtures)                 |
|  - Bottom-Top   (35 fixtures)      |  - Bottom-Top / Inverted Rings (35 fixtures)                 |
|  - Left-Right   (35 fixtures)      |  - Left-Right / Rotated 90°    (35 fixtures)                 |
|  - Right-Left   (35 fixtures)      |  - Right-Left / Rotated 270°   (35 fixtures)                 |
+------------------------------------+--------------------------------------------------------------+
```

---

## 2. Complete Catalog of 35 Graph Fixtures

The 35 fixtures span the full spectrum of graph complexities: dense meshes, feedback saga cycles, wide fan-outs, deep chains, disconnected components, and complex multi-cluster telemetry.

### 2.1 Synthetic Custom Layout Scenarios (26 Fixtures)

| # | Fixture ID & Title | $|V|$ | $|E|$ | Key Structural Characteristics & Stress Vectors |
|---|---|---|---|---|
| 01 | `scenario #1 Single Edge Pipeline` | 2 | 1 | Minimal 2-node baseline; validates boundary port attachment and unit label spacing. |
| 02 | `scenario #2 Sequential Linear Pipeline` | 4 | 3 | Pure sequential chain ($L=3$); tests straight chain ratio ($1.00$) and 0 bends. |
| 03 | `scenario #3 Simple Fork-Join DAG` | 4 | 4 | Diamond fork-join ($A \to B, C \to D$); validates rank assignment and symmetric channel routing. |
| 04 | `scenario #4 Multi-Stage Diamond Mesh` | 6 | 8 | Dual diamond mesh ($A \to B, C \to D \to E, F \to G$); stresses layer ordering and crossing minimization. |
| 05 | `scenario #5 Deep Hierarchical Tree` | 7 | 6 | Balanced binary tree ($d=3$); tests subtree angular wedge allocation in radial mode. |
| 06 | `scenario #6 Wide Fan-Out Cluster` | 9 | 8 | Single root with 8 child leaves; tests circumferential ring arc expansion. |
| 07 | `scenario #7 Wide Fan-In Aggregator` | 9 | 8 | 8 source nodes converging to 1 sink; validates multi-port side distribution. |
| 08 | `scenario #8 Cross-Cutting Long Edges` | 6 | 7 | Long edges spanning $\Delta \text{rank} \ge 3$; tests virtual dummy node routing and channel lane demand. |
| 09 | `scenario #9 Single Node Self-Loop` | 1 | 1 | 1 node with self-referential edge; tests 4-point bracket routing and boundary normal port stubs. |
| 10 | `scenario #10 Self-Loops and Multi-Edges` | 3 | 5 | Multiple self-loops + parallel multi-edges; validates port index reservation and slot separation. |
| 11 | `scenario #11 Two-Cycle Feedback Loop` | 2 | 2 | Mutual feedback cycle ($A \rightleftarrows B$); tests FAS cycle breaking and backward edge inversion. |
| 12 | `scenario #12 Disconnected Subgraphs` | 6 | 4 | 2 disjoint components ($3+3$); tests multi-component bounding box packing and radial root selection. |
| 13 | `scenario #13 Large Grid Lattice` | 9 | 12 | $3 \times 3$ planar grid; stresses rectilinear channel collisions and 4-way port allocation. |
| 14 | `scenario #14 Dense Bipartite Graph` | 6 | 9 | $K_{3,3}$ complete bipartite; non-planar stress test ($K_{3,3}$ requires crossing minimization heuristics). |
| 15 | `scenario #15 Wide Multi-Root DAG` | 8 | 9 | 4 independent roots feeding shared downstream nodes; tests layer 0 alignment and barycenter ordering. |
| 16 | `scenario #16 Complex Cycle With Bypass` | 5 | 7 | 3-cycle with long bypass and reverse edges; tests feedback leader lines and cycle breaking. |
| 17 | `scenario #17 Large Hub With Radial Spoke`| 13 | 12 | Hub-and-spoke star topology ($d=12$); verifies concentric ring radius bounds under high node degree. |
| 18 | `scenario #18 Layer Skipping DAG` | 7 | 10 | Multiple edges jumping 1, 2, and 3 ranks; validates lane assignment without collinear overlap. |
| 19 | `scenario #19 Inverted Diamond Mesh` | 6 | 8 | Multi-source multi-sink convergence; verifies reversed rank coordinate assignment symmetry. |
| 20 | `scenario #20 Many Isolated Nodes` | 8 | 2 | 6 isolated singletons + 1 connected pair; tests singleton outer ring placement and compaction. |
| 21 | `scenario #21 High Degree Bottleneck` | 7 | 10 | Hourglass topology ($3 \to 1 \to 3$); tests bottleneck node port density and width expansion. |
| 22 | `scenario #22 Alternating Chain Zig-Zag` | 6 | 8 | Alternating cross-edges forming a zig-zag ladder; tests crossing reduction convergence. |
| 23 | `scenario #23 Deep Linear Pipeline` | 10 | 9 | Extended sequential pipeline ($L=9$); validates aspect ratio and channel depth accumulation. |
| 24 | `scenario #24 Feedback-Heavy Saga` | 10 | 16 | Distributed saga pattern with compensation edges; severe stress for radial chord bow routing. |
| 25 | `scenario #25 Parallel Bundles Every Pair`| 5 | 14 | Complete graph $K_5$ with bundled parallel edges; tests badge offset clearance and bundle multipliers. |
| 26 | `scenario #26 Three Unequal Stacks` | 9 | 7 | 3 disconnected components of sizes 4, 3, 2; tests disconnected component tree forest attachment. |

### 2.2 Public Graph Telemetry Fixtures (9 Fixtures)

| # | Fixture Name | $|V|$ | $|E|$ | Production Context & Architecture |
|---|---|---|---|---|
| 27 | `2026-08-14-gvui-advanced-observability-v2.json` | 16 | 30 | Distributed tracing trace-pipeline with cross-service RPCs, message queues, and worker pools. |
| 28 | `2026-08-15-finding-2-canvas-performance.json` | 6 | 6 | High-throughput canvas benchmarking topology; isolated pipeline with high-rate metrics. |
| 29 | `2026-08-15-gvui-observability-findings-execution.json`| 14 | 21 | Multi-stage observability aggregation, anomaly detection detectors, and alert routing. |
| 30 | `2026-08-15-gvui-streamlined-edges-and-bounds.json` | 16 | 26 | Edge stream processing engine with stateful filters and database sinks. |
| 31 | `2026-08-15-gvui-validator-assets-and-traffic.json` | 16 | 29 | Asset validation pipeline with heavy traffic splitting, fallback handlers, and validation gates. |
| 32 | `2026-08-15-skill-improvement-execution.json` | 10 | 11 | Agentic skill iteration workflow with evaluator feedback cycles. |
| 33 | `bugfix_pr_run.json` | 11 | 12 | CI/CD automation pipeline with build, lint, test, containerize, and deploy stages. |
| 34 | `incident_response_live.json` | 15 | 19 | Live incident triage orchestration graph with paging, automated diagnostics, and mitigation runs. |
| 35 | `research_judge_panel.json` | 14 | 20 | Multi-agent research deliberation graph with peer review and consensus aggregation. |

---

## 3. Failure Taxonomy & Root Cause Analysis of Radial Collisions

In the existing implementation, `runLayoutAudit.ts` captures numerous soft collisions in radial mode. The table below catalogs the exact structural failure classes observed across the 35 fixtures:

```
+----------------------------------------------------------------------------------------------------+
|                                    RADIAL FAILURE TAXONOMY                                         |
+--------------------------+-------------------------------------------------------------------------+
| Failure Class            | Geometric Mechanism                                                     |
+--------------------------+-------------------------------------------------------------------------+
| edgeNodePenetrations     | Straight spokes or 30% inward chords intersecting intermediate boxes.  |
| badgeNodeOverlaps        | Greedy badge placement offsets failing to clear nearby node boundaries. |
| badgeBadgeOverlaps       | Clustered edge badges in narrow angular sectors overlapping in 2D.      |
| badgeEdgePenetrations    | Non-parent edge polylines cutting across another edge's badge box.      |
| Excessive leaderCount    | Fallback leader lines generated when local candidate offsets fail.      |
+--------------------------+-------------------------------------------------------------------------+
```

### 3.1 `edgeNodePenetrations` Root Cause

#### Geometric Mechanism

1. **Concentric Chord Intersection**: When an edge connects node $u$ on ring $r_u$ and node $v$ on ring $r_v$ (where $|r_u - r_v| \ge 1$), drawing a straight chord or a naive bowed point $P_{\text{bow}} = (1 - \alpha) M + \alpha O$ (where $M$ is chord midpoint and $O$ is origin) creates a path that passes directly through intermediate rings $r_k$ ($r_u < r_k < r_v$).
2. **Radial Angular Crowding**: Nodes on intermediate rings positioned within the angular interval $[\min(\theta_u, \theta_v), \max(\theta_u, \theta_v)]$ have bounding boxes that intersect the secant line segment connecting $u$ and $v$.
3. **Lack of Polar Obstacle Clearance**: The radial routing phase lacks a polar obstacle visibility graph or concentric corridor routing mechanism.

```
                  Ring 2: [ Node V (θ_v) ]
                            /
                           /  <--- Straight Edge Penetrates Intermediate Node!
                          /
            Ring 1: [ Node W (θ_w) ]
                      /
                     /
   Ring 0: [ Node U (θ_u) ] (Root)
```

### 3.2 `badgeNodeOverlaps` Root Cause

#### Geometric Mechanism

1. **Fixed Euclidean Radial Offsets**: `badge_offsets` in `7_2_geometric_common.rs` generates 12 candidate positions by offsetting along the normal vector $\hat{n} = (-\Delta y / L, \Delta x / L)$ by fixed distance $h/2 + \text{clearance}$.
2. **Polar-Rectangular Mismatch**: Along diagonal radial spokes, moving orthogonal to the line segment in Cartesian space pushes the badge directly into the corner of the source or target node box, especially when nodes have large width-to-height aspect ratios.
3. **Local Greedy Failure**: If all 12 candidate points have non-zero conflict area with the node index, the engine selects the candidate with minimum conflict area and sets `needs_leader = true`, but still emits a badge overlapping the node interior.

### 3.3 `badgeBadgeOverlaps` Root Cause

#### Geometric Mechanism

1. **Parallel / Convergent Edge Congestion**: In dense topologies (e.g., scenario #25 with 14 edges between 5 nodes, or observability graphs with 30 edges), multiple edges share adjacent angular sectors.
2. **Sequential Greedy Placement Without Sector Reservation**: Badges are placed one by one in descending area order. When multiple large badges are assigned to neighboring spokes on the same ring, their bounding boxes overlap circumferentially because the ring radius was sized for node boxes, not for (node + badge) composite footprints.

### 3.4 `badgeEdgePenetrations` Root Cause

#### Geometric Mechanism

1. **Cross-Cutting Radial Spokes**: In non-planar graphs, radial chords traverse multiple angular sectors. When a badge is placed alongside edge $e_1$, a non-adjacent edge $e_2$ passing through that sector intersects the badge bounding box.
2. **Uncoordinated Segment Sweeps**: Badge placement checks edge segment intersections, but when forced to use a fallback position due to node crowding, the fallback often lands directly on an intersecting edge spoke.

---

## 4. Gap Analysis: Layered vs Radial Engine Guarantees

| Invariant / Metric      | Layered Engine Guarantee                               | Radial Engine Current State                                   | Radial Engine Target State (Zero-Tolerance)           |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------- |
| `nodeNodeOverlaps`      | **0** (Guaranteed by Brandes-Köpf + separation sweep)  | **0** (Guaranteed by `relax_overlaps` + `enforce_separation`) | **0** (Maintained)                                    |
| `unresolvedRouteCount`  | **0** (Guaranteed by channel lane expansion)           | **0** (All routes constructed)                                | **0** (Maintained)                                    |
| `unresolvedBadgeCount`  | **0** (Guaranteed by dummy label item slots)           | **0** (All badges placed)                                     | **0** (Maintained)                                    |
| `edgeNodePenetrations`  | **0** (Guaranteed by orthogonal channel routing)       | **Soft Warning** (Chords graze intermediate boxes)            | **0** (Enforced by Polar Arc Corridor Detour Routing) |
| `badgeNodeOverlaps`     | **0** (Guaranteed by in-layer label node reservations) | **Soft Warning** (Greedy Cartesian offsets collide)           | **0** (Enforced by Polar Sector Clearance Allocation) |
| `badgeBadgeOverlaps`    | **0** (Guaranteed by layer ordering + spacing)         | **Soft Warning** (Multi-edge sector congestion)               | **0** (Enforced by Angular Slot Reservation Matrix)   |
| `badgeEdgePenetrations` | **0** (Guaranteed by channel lane isolation)           | **Soft Warning** (Cross-sector edges pierce badges)           | **0** (Enforced by Dynamic Edge Clearance Repulsion)  |
| `leaderCount`           | **0** (No leader lines needed in layered)              | **Best-effort** (High in dense graphs)                        | $\mathbf{\le 2}$ per 100 edges (Strictly bounded)     |

---

## 5. Architectural Roadmap for Zero-Tolerance Hardening

To eliminate the split standard in `runLayoutAudit.ts` and enforce zero-tolerance gates across all 280 runs:

1. **Unify `constraintFieldsFor`**:
   Update `runLayoutAudit.ts` to assert all 7 constraint fields for both `layered` and `radial` engines:
   $$\forall c \in \text{AUDIT\_CASES}, \quad \text{ConstraintFields}(c) = \text{UNIVERSAL} \cup \text{STRICT\_COLLISION\_FIELDS}$$

2. **Expand Direction Matrix**:
   Expand `AUDIT_CASES` to explicitly include all 4 directions for both engines:
   - `layered/top-down`, `layered/bottom-top`, `layered/left-right`, `layered/right-left`
   - `radial/top-down`, `radial/bottom-top`, `radial/left-right`, `radial/right-left`

3. **Implement Polar Obstacle Avoidance (Module 2)**:
   Equip the radial routing engine with concentric corridor waypoint generation to route around intermediate node bounding boxes.

4. **Implement Radial Badge Clearance (Module 3)**:
   Allocate dedicated angular and radial clearance envelopes during ring sizing and badge placement.

5. **Formalize Inverted Transform Invariants (Module 4)**:
   Verify mathematical symmetry and coordinate preservation across all inverted coordinate frames.
