# Pedagogical Documentation Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the complete documentation suite under `docs/` into a bottom-up, problem-first narrative journey that explains the "why" and trade-offs behind every algorithm, deconstructs complex math into modular building blocks accompanied by pseudocode computational steps, and validates all file/line anchors across the codebase.

**Architecture:** Each markdown file in the 5 algorithm folders (`custom-state-space/`, `top-down-dagre/`, `left-right-dagre/`, `force-directed/`, `concentric-radial/`) will follow a 5-stage pedagogical template:
1. **The Problem & Trade-off Journey**: What obstacle arises in graph visualization? What naive solutions fail? Why is this specific algorithm chosen over alternatives?
2. **Bottom-Up Mathematical Deconstruction**: Break down complex formulas into individual subcomponents ($A \to B \to C$) before assembling the master equation.
3. **Step-by-Step Computational Pseudocode**: Clean, annotated pseudocode snippets illustrating execution steps step-by-step.
4. **Visual ASCII Schematics**: Detailed spatial diagrams and flowcharts.
5. **Codebase Reference Map**: Precise line anchors (`file:///...#Lxx-Lyy`) linking to implementation code.

**Tech Stack:** GitHub Flavored Markdown, LaTeX ($\LaTeX$), Pseudocode, TypeScript line anchors.

---

## Task Decomposition

### Task 1: Overhaul Custom State-Space Engine Documentation (`docs/custom-state-space/`)

**Files:**
- Modify: `docs/custom-state-space/01-state-space-search.md`
- Modify: `docs/custom-state-space/02-sugiyama-layering-cycle-breaking.md`
- Modify: `docs/custom-state-space/03-barycentric-crossing-minimization.md`
- Modify: `docs/custom-state-space/04-astar-orthogonal-routing.md`
- Modify: `docs/custom-state-space/05-dynamic-spacing-demands.md`
- Modify: `docs/custom-state-space/06-codebase-reference-map.md`

- [ ] **Step 1: Rewrite `01-state-space-search.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Why static deterministic layouts fail on dynamic UI node sizes; trade-off comparison vs pure Dagre/D3.
  - Section 2: Bottom-up formula assembly — Constructing state tuple $\sigma = \langle \Pi, \Omega, \mathcal{D}, \mathcal{L}, \Delta \rangle$ piece by piece, then assembling 21-element lexicographic cost vector $\mathbf{C}(\sigma)$.
  - Section 3: Step-by-step pseudocode for neighborhood perturbation search loop.
  - Section 4: ASCII state transition hierarchy diagram.
  - Section 5: Codebase reference anchors (`searchState.ts#L4-L80`, `layoutOptimizerState.ts#L96-L280`, `stateEvaluator.ts#L35-L217`).

- [ ] **Step 2: Rewrite `02-sugiyama-layering-cycle-breaking.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Why cycles break topological sorting; comparison of DFS back-edge reversal vs Eades greedy flow vs Tarjan SCCs.
  - Section 2: Bottom-up math — Node net flow $\delta(v) = \text{deg}^+(v) - \text{deg}^-(v)$, linear ordering $\pi(v)$, longest path rank formula $r(v)$, dummy node span $k - 1$.
  - Section 3: Step-by-step pseudocode for Eades cycle breaking and dummy node injection.
  - Section 4: ASCII back-edge reversal and rank layering schematics.
  - Section 5: Codebase reference anchors (`cycleBreaking.ts#L10-L355`, `rankAssignment.ts#L11-L105`, `normalizeGraph.ts#L14-L149`).

- [ ] **Step 3: Rewrite `03-barycentric-crossing-minimization.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — NP-hard crossing minimization problem; why 2-layer crossing reduction is solved using barycentric ordering over median heuristics or IP solver.
  - Section 2: Bottom-up math — Binary crossing predicate $\chi(e_1, e_2)$, layer crossing matrix $M_{r, r+1}$, top-down $\beta_{\text{TD}}$ and bottom-up $\beta_{\text{BU}}$ position averages.
  - Section 3: Step-by-step pseudocode for 12-sweep alternating barycentric ordering and adjacent transposition.
  - Section 4: ASCII crossing reduction sweep diagrams.
  - Section 5: Codebase reference anchors (`crossingMinimization.ts#L9-L200`, `portOrdering.ts#L1-L60`).

- [ ] **Step 4: Rewrite `04-astar-orthogonal-routing.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Why straight lines clutter card boundaries; orthogonal routing trade-offs; why 3D A* directed search is chosen over Lee/Hadlock maze routers.
  - Section 2: Bottom-up math — 3D state $(x, y, \vec{d})$, step cost components ($\text{length}, \text{bend}, \text{obstacle}, \text{crossings}$), Manhattan heuristic $h(p, q)$, admissibility proof, SVG arc bridge path equation.
  - Section 3: Step-by-step pseudocode for grid A* open-list expansion and path simplification.
  - Section 4: ASCII grid routing & SVG bridge geometry diagrams.
  - Section 5: Codebase reference anchors (`routeSearch.ts#L21-L400`, `edgeRouter.ts#L1-L250`, `svgPath.ts#L1-L180`).

- [ ] **Step 5: Rewrite `05-dynamic-spacing-demands.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — The chronic same-rank / cycle badge collision problem; why manual node dragging or static gaps fail; why dynamic demand feedback loop is the optimal solution.
  - Section 2: Bottom-up math — Clearance gap $G_{\text{req}} = W_{\text{badge}} + 2 C_{\text{badge}} + 2 L_{\text{stub}}$, demand tuple $\mathcal{D}_i$, linear X-coordinate inequality, fixed-point convergence proof.
  - Section 3: Step-by-step pseudocode for spacing demand emission, canonicalization, and override resolution.
  - Section 4: ASCII gap expansion before/after and feedback loop schematics.
  - Section 5: Codebase reference anchors (`badgePlacement.ts#L480-L550`, `spacingDemand.ts#L20-L150`, `coordinateAssignment.ts#L30-L120`).

- [ ] **Step 6: Rewrite `06-codebase-reference-map.md` with complexity bounds & test commands**
  - Asymptotic time and space complexity bounds derivation.
  - Complete source code directory tree with exact line numbers.
  - Executable test commands (`bun test ...`).

- [ ] **Step 7: Verify `docs/custom-state-space/` quality and commit**
  - Run: `bun run typecheck && bun run lint`
  - Git commit: `docs: overhaul custom state-space engine docs with pedagogical problem-first narratives, modular math, and pseudocode`

---

### Task 2: Overhaul Top-Down Dagre Engine Documentation (`docs/top-down-dagre/`)

**Files:**
- Modify: `docs/top-down-dagre/01-network-simplex-layering.md`
- Modify: `docs/top-down-dagre/02-order-heuristics.md`
- Modify: `docs/top-down-dagre/03-brandes-kopf-coordinate-assignment.md`
- Modify: `docs/top-down-dagre/04-codebase-reference-map.md`

- [ ] **Step 1: Rewrite `01-network-simplex-layering.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Why naive longest-path rank assignment produces wide, uncompacted graphs; why Network Simplex linear programming is optimal for total edge length minimization.
  - Section 2: Bottom-up math — Rank separation constraint $r(v) - r(u) \ge \delta$, edge slack $g(e)$, tight tree definition, cut value equation $\text{cutval}(e) = \sum_{\text{InCut}} w - \sum_{\text{OutCut}} w$, pivot step math.
  - Section 3: Step-by-step pseudocode for Network Simplex feasible tree initialization and pivot iteration.
  - Section 4: ASCII tree cut and pivot schematics.
  - Section 5: Codebase reference anchors (`nodeDimensions.ts#L451-L604`, `layoutDispatcher.ts#L138-L152`).

- [ ] **Step 2: Rewrite `02-order-heuristics.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Cross-layer edge crossing reduction in Dagre; comparison of barycentric vs median heuristics.
  - Section 2: Bottom-up math — Predecessor/successor index averaging, adjacent transposition crossing count delta $\Delta \text{cross}$.
  - Section 3: Step-by-step pseudocode for multi-pass ordering sweeps.
  - Section 4: ASCII sweep diagrams.
  - Section 5: Codebase reference anchors (`nodeDimensions.ts#L451-L604`).

- [ ] **Step 3: Rewrite `03-brandes-kopf-coordinate-assignment.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Why horizontal node placement must align parent-child nodes vertically while keeping edges straight; trade-off comparison of Brandes-Köpf vs Quadratic Programming vs Spring Embedders.
  - Section 2: Bottom-up math — Root $\text{root}(v)$ and align $\text{align}(v)$ array structures, block compaction constraints $x(B_2) \ge x(B_1) + s$, median X-coordinate formula $x(v) = \text{Median}(x_{\text{UL}}, x_{\text{UR}}, x_{\text{LL}}, x_{\text{LR}})$.
  - Section 3: Step-by-step pseudocode for the 4 alignment passes and block compaction.
  - Section 4: ASCII 4-pass alignment and block graph schematics.
  - Section 5: Codebase reference anchors (`nodeDimensions.ts#L451-L604`).

- [ ] **Step 4: Rewrite `04-codebase-reference-map.md` with line anchors and test commands**
  - Complete directory reference table with exact line anchors in `nodeDimensions.ts` and `layoutDispatcher.ts`.
  - Executable test commands.

- [ ] **Step 5: Verify `docs/top-down-dagre/` quality and commit**
  - Run: `bun run typecheck && bun run lint`
  - Git commit: `docs: overhaul top-down dagre engine docs with problem-first narratives, LP math deconstruction, and Brandes-Kopf pseudocode`

---

### Task 3: Overhaul Left-to-Right Dagre Engine Documentation (`docs/left-right-dagre/`)

**Files:**
- Modify: `docs/left-right-dagre/01-coordinate-space-transformation.md`
- Modify: `docs/left-right-dagre/02-horizontal-bezier-routing.md`
- Modify: `docs/left-right-dagre/03-codebase-reference-map.md`

- [ ] **Step 1: Rewrite `01-coordinate-space-transformation.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Visualizing sequential trace logs and pipelines; why Left-to-Right orientation is preferred for horizontal timelines; why matrix coordinate transformation is more efficient than re-writing the Sugiyama engine.
  - Section 2: Bottom-up math — Transformation matrix $\mathbf{M}_{\text{rot}} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix}$, involution proof $\mathbf{M}_{\text{rot}}^2 = \mathbf{I}$, inverse mapping, dimension swapping ($\text{DagreWidth} = \text{Height}$, $\text{DagreHeight} = \text{Width}$).
  - Section 3: Step-by-step pseudocode for graph rotation, layout execution, and un-rotation.
  - Section 4: ASCII coordinate space rotation diagrams.
  - Section 5: Codebase reference anchors (`nodeDimensions.ts#L451-L465`, `layoutDispatcher.ts#L143-L144`).

- [ ] **Step 2: Rewrite `02-horizontal-bezier-routing.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Why horizontal edge routing requires smooth S-curves; edge badge overlap issues on parallel horizontal edges; why pairwise repulsion displacement is chosen.
  - Section 2: Bottom-up math — Parametric cubic Bezier equation $B(t)$, control points $C_1, C_2$, tangent velocity vector $B'(t)$, arc-length polyline midpoint calculus, badge repulsion overlap delta $(\Delta x, \Delta y)$ and shift equations $(\delta_x, \delta_y)$.
  - Section 3: Step-by-step pseudocode for Bezier control point computation, arc-length midpoint extraction, and badge repulsion pass.
  - Section 4: ASCII S-curve control points and badge repulsion schematics.
  - Section 5: Codebase reference anchors (`nodeDimensions.ts#L178-L228`, `nodeDimensions.ts#L389-L446`, `nodeDimensions.ts#L575-L601`).

- [ ] **Step 3: Rewrite `03-codebase-reference-map.md` with line anchors and test commands**
  - Directory mapping table with exact line anchors.
  - Executable test commands.

- [ ] **Step 4: Verify `docs/left-right-dagre/` quality and commit**
  - Run: `bun run typecheck && bun run lint`
  - Git commit: `docs: overhaul left-right dagre engine docs with matrix transformation math, S-curve Bezier derivations, and badge repulsion pseudocode`

---

### Task 4: Overhaul Organic Force Engine Documentation (`docs/force-directed/`)

**Files:**
- Modify: `docs/force-directed/01-coulomb-hooke-vector-math.md`
- Modify: `docs/force-directed/02-simulated-annealing-cooling.md`
- Modify: `docs/force-directed/03-codebase-reference-map.md`

- [ ] **Step 1: Rewrite `01-coulomb-hooke-vector-math.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Unstructured network graph discovery; why hierarchical rank layouts fail on organic graphs; why Fruchterman-Reingold physics simulation is chosen over spectral layouts.
  - Section 2: Bottom-up math — Ideal distance $k = C \cdot \sqrt{\text{Area}/|V|}$, Coulomb repulsion $\vec{F}_r$, Hooke attraction $\vec{F}_a$, center gravity $\vec{F}_g$, Cartesian vector components $(F_x, F_y)$, net force superposition $\vec{F}_{\text{net}}$.
  - Section 3: Step-by-step pseudocode for force vector accumulation.
  - Section 4: ASCII force vector interaction diagrams.
  - Section 5: Codebase reference anchors (`layoutDispatcher.ts#L71-L129`).

- [ ] **Step 2: Rewrite `02-simulated-annealing-cooling.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Why force-directed layouts oscillate endlessly without cooling; why simulated annealing temperature decay guarantees convergence to stable equilibrium.
  - Section 2: Bottom-up math — Velocity bounding update $\vec{\Delta p}_u = \frac{\vec{F}}{\|\vec{F}\|} \min(\|\vec{F}\|, T(t))$, exponential cooling schedule $T(t) = T_0 \cdot \gamma^t$, threshold termination criteria.
  - Section 3: Step-by-step pseudocode for full Fruchterman-Reingold simulation loop with temperature decay.
  - Section 4: ASCII temperature decay curves and equilibrium convergence schematics.
  - Section 5: Codebase reference anchors (`layoutDispatcher.ts#L71-L129`).

- [ ] **Step 3: Rewrite `03-codebase-reference-map.md` with line anchors and test commands**
  - Reference directory table linking `computeForceLayout` in `layoutDispatcher.ts`.
  - Executable test commands.

- [ ] **Step 4: Verify `docs/force-directed/` quality and commit**
  - Run: `bun run typecheck && bun run lint`
  - Git commit: `docs: overhaul force-directed engine docs with physics force derivations, simulated annealing math, and simulation loop pseudocode`

---

### Task 5: Overhaul Concentric Radial Engine Documentation (`docs/concentric-radial/`)

**Files:**
- Modify: `docs/concentric-radial/01-polar-coordinate-transformation.md`
- Modify: `docs/concentric-radial/02-hub-spoke-bezier-routing.md`
- Modify: `docs/concentric-radial/03-codebase-reference-map.md`

- [ ] **Step 1: Rewrite `01-polar-coordinate-transformation.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Central hub dependency visualization; why rectangular grid layouts obscure single-source topologies; why concentric polar orbit projection is chosen.
  - Section 2: Bottom-up math — Dynamic orbit radius $R(N) = \max(280, N \cdot 45)$, angular step $\Delta\theta = \frac{2\pi}{N}$, 12 o'clock offset $-\frac{\pi}{2}$, arc length $s = R \cdot \Delta\theta$, polar-to-Cartesian center projection $(cx, cy)$, top-left rendering offset subtraction.
  - Section 3: Step-by-step pseudocode for polar coordinate calculation and canvas projection.
  - Section 4: ASCII radial orbit axis alignment diagrams.
  - Section 5: Codebase reference anchors (`layoutDispatcher.ts#L9-L66`).

- [ ] **Step 2: Rewrite `02-hub-spoke-bezier-routing.md` with problem-first narrative & bottom-up math**
  - Section 1: Problem journey — Why straight chords cross central hub origin and crowd edge labels; why quadratic Bezier hub-spoke routing with linear chord label placement is optimal.
  - Section 2: Bottom-up math — Quadratic Bezier equation $\mathbf{B}(t)$, central hub control point $\mathbf{P}_0$, tangent velocity vectors $\mathbf{B}'(0), \mathbf{B}'(1)$, true apex $\mathbf{B}(0.5)$, linear chord label midpoint $\mathbf{P}_{\text{label}}$, deflection vector $\mathbf{D} = \frac{\mathbf{P}_0 - \mathbf{P}_{\text{label}}}{2}$.
  - Section 3: Step-by-step pseudocode for hub-spoke Bezier path string generation and label coordinate calculation.
  - Section 4: ASCII hub control point deflection schematics.
  - Section 5: Codebase reference anchors (`layoutDispatcher.ts#L9-L66`).

- [ ] **Step 3: Rewrite `03-codebase-reference-map.md` with line anchors and test commands**
  - Reference directory table linking `computeRadialLayout` in `layoutDispatcher.ts`.
  - Executable test commands.

- [ ] **Step 4: Verify `docs/concentric-radial/` quality and commit**
  - Run: `bun run typecheck && bun run lint`
  - Git commit: `docs: overhaul concentric radial engine docs with polar geometry math, hub-spoke Bezier derivations, and projection pseudocode`

---

### Task 6: Master Index Sitemap Update & Final Quality Gate Audit

**Files:**
- Modify: `docs/README.md`

- [ ] **Step 1: Update `docs/README.md` master index**
  - Update master sitemap, narrative overview, comparative matrix, and navigation links.

- [ ] **Step 2: Run Full Quality Gate Suite & Build**
  - Run: `bun run typecheck && bun run lint && bun run build:local`

- [ ] **Step 3: Commit and Push to `main`**
  - Git commit: `docs: finalize pedagogical documentation overhaul with master index sitemap and verified line anchors`
  - Git push: `git push origin main`

---

## Plan Self-Review

1. **Spec Coverage:** Every requirement in the user's prompt (problem-first narrative journey, trade-off comparisons, bottom-up modular math derivations, step-by-step computational pseudocode scripts, visual ASCII schematics, line-anchored codebase maps) is explicitly covered across Tasks 1–6.
2. **Placeholder Scan:** No TBDs, TODOs, or vague placeholders exist in the plan.
3. **Execution Choice:** Designed specifically for `subagent-driven-development` session execution.
