# Pedagogical Numerical & Step-by-Step Overhaul Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul all 19 documentation files across `docs/` so that every sub-step (e.g. 2.1, 2.2, 2.3) includes concrete numerical graph examples with step-by-step arithmetic calculations, targeted pseudocode snippets, and dedicated ASCII visuals before synthesizing the master formula and algorithm at the end of the section.

**Architecture:** Each sub-step in every documentation file must strictly follow the **Modular Numerical Sub-Step Standard**:
1. **Mathematical Sub-Component Formula**: The isolated math equation for that sub-step.
2. **Concrete Numerical Graph Example**: Worked example with explicit input numbers (e.g. Node A at $x=10, y=20$, Node B at $x=50, y=80$, step-by-step calculation showing raw math $\to$ intermediate values $\to$ final output).
3. **Targeted Sub-Step Pseudocode**: A 5-15 line isolated pseudocode block computing *specifically* that sub-step's output from inputs.
4. **Sub-Step ASCII Infographic**: Visual diagram illustrating the numerical values and spatial transformation for that sub-step.
5. **Gradual Bottom-Up Assembly**: Sub-step 1 $\to$ Sub-step 2 $\to$ Sub-step 3 $\to$ Final Synthesis (complete merged master algorithm, full combined formula, and pipeline code).

**Tech Stack:** GitHub Flavored Markdown, LaTeX ($\LaTeX$), Step-by-Step Arithmetic Examples, Modular Pseudocode.

---

## Plan Tasks

### Task 1: Overhaul `docs/custom-state-space/` (6 Files) with Numerical Examples & Sub-Step Pseudocode

**Files:**
- Modify: `docs/custom-state-space/01-state-space-search.md`
- Modify: `docs/custom-state-space/02-sugiyama-layering-cycle-breaking.md`
- Modify: `docs/custom-state-space/03-barycentric-crossing-minimization.md`
- Modify: `docs/custom-state-space/04-astar-orthogonal-routing.md`
- Modify: `docs/custom-state-space/05-dynamic-spacing-demands.md`
- Modify: `docs/custom-state-space/06-codebase-reference-map.md`

- [ ] **Step 1: Overhaul `01-state-space-search.md`**
  - Sub-step 2.1 ($\sigma$ Tuple): Worked numerical state example for a 3-node graph (`Auth`, `User`, `DB`) showing exact map keys, side assignments, port pin order lists, and state hash string.
  - Sub-step 2.2 ($\mathbf{C}(\sigma)$ 21-Vector): Numerical evaluation example showing exact integer/float values for $C_1=0, C_2=0, C_3=0, \dots, C_{10}=2, C_{15}=6, C_{17}=420\text{px}$, etc.
  - Sub-step 2.3 ($\prec$ Comparison): Numerical comparison between State A ($C_{10}=2$) vs State B ($C_{10}=3$), showing why State A is selected.
  - Section 3: Master synthesis merging all sub-steps into the complete frontier queue algorithm.

- [ ] **Step 2: Overhaul `02-sugiyama-layering-cycle-breaking.md`**
  - Sub-step 2.1 (Tarjan SCC): Worked numerical example on 4-node cyclic graph ($A \to B \to C \to A, C \to D$) with DFS discovery timestamps $d(A)=1, d(B)=2, d(C)=3$ and low-link values $\text{low}(C)=1$.
  - Sub-step 2.2 (Eades Net Flow $\delta(v)$): Step-by-step arithmetic for $\delta(A) = 1 - 1 = 0$, $\delta(B) = 1 - 1 = 0$, $\delta(C) = 1 - 1 = 0$, showing pivot choice, order $\pi = [A, B, C]$, and feedback edge $(C, A)$ reversal.
  - Sub-step 2.3 (Longest Path Layering): Numerical layer assignment $r(A)=0, r(B)=1, r(C)=2, r(D)=3$.
  - Sub-step 2.4 (Dummy Node Chains): Edge $(A, D)$ with $r(D)-r(A)=3$, inserting dummy nodes $\omega_1 (r=1), \omega_2 (r=2)$.

- [ ] **Step 3: Overhaul `03-barycentric-crossing-minimization.md`**
  - Sub-step 2.1 (Binary Crossing Predicate $\chi$): Worked 4-edge coordinate calculation showing $(x_1, y_1)$ to $(x_2, y_2)$ intersection test.
  - Sub-step 2.2 (Barycenters): Numerical calculation for 3 nodes: $\text{bary}(D) = (1+2)/2 = 1.5$, $\text{bary}(E) = 0/1 = 0.0$, $\text{bary}(F) = (0+1)/2 = 0.5$, sorted order $[E, F, D]$.
  - Sub-step 2.3 (Adjacent Transposition $\Delta\text{cross}$): Worked numerical swap check for adjacent pair showing $c(v_a, v_b) = 2$ vs $c(v_b, v_a) = 0 \implies \Delta\text{cross} = -2$.

- [ ] **Step 4: Overhaul `04-astar-orthogonal-routing.md`**
  - Sub-step 2.1 (3D State $(x, y, \vec{d})$): Grid step example from $(16, 24, \text{right})$ to $(24, 24, \text{right})$ vs turning to $(16, 32, \text{down})$.
  - Sub-step 2.2 (Accumulated Cost $g$ & Heuristic $h$): Arithmetic calculation: $g_{\text{length}} = 8$, $P_{\text{bend}} = 40$, $h = |24 - 80| + |24 - 80| = 112 \implies f = 48 + 112 = 160$.
  - Sub-step 2.3 (SVG Arc Bridge): Geometric point $p_{\text{cross}} = (120, 200)$, generating path `M 114 200 A 6 6 0 0 0 126 200`.

- [ ] **Step 5: Overhaul `05-dynamic-spacing-demands.md`**
  - Sub-step 2.1 ($G_{\text{req}}$ Clearance): Numerical badge example: badge width $W_{\text{badge}} = 178\text{px}$, clearance $C = 12\text{px}$, stubs $L = 18\text{px} \implies G_{\text{req}} = 178 + 24 + 36 = 238\text{px}$.
  - Sub-step 2.2 (Demand Tuple & Linear Projection): Node positions $x(A)=100\text{px}$, default gap $56\text{px} \implies x(B) = 100 + 120 + 56 = 276\text{px}$. With demand $G_{\text{req}} = 238\text{px} \implies x(B) = 100 + 120 + 238 = 458\text{px}$.
  - Sub-step 2.3 (PAVA Regression): Worked isotonic regression pooling example on monotonic constraint array.

- [ ] **Step 6: Overhaul `06-codebase-reference-map.md`**
  - Complete asymptotic complexity derivations with step-by-step arithmetic for sample graph sizes ($|V|=20, |E|=30$).

---

### Task 2: Overhaul `docs/top-down-dagre/` (4 Files) with Numerical Examples & Sub-Step Pseudocode

**Files:**
- Modify: `docs/top-down-dagre/01-network-simplex-layering.md`
- Modify: `docs/top-down-dagre/02-order-heuristics.md`
- Modify: `docs/top-down-dagre/03-brandes-kopf-coordinate-assignment.md`
- Modify: `docs/top-down-dagre/04-codebase-reference-map.md`

- [ ] **Step 1: Overhaul `01-network-simplex-layering.md`**
  - Sub-step 2.1 (Slack $g(e)$): Ranks $r(u)=0, r(v)=2, \delta=1 \implies g(e) = 2 - 0 - 1 = 1$ (slack).
  - Sub-step 2.2 (Spanning Tree Cut Value $\text{cutval}(e)$): 4-node tree example showing $\sum_{\text{InCut}} w = 1$, $\sum_{\text{OutCut}} w = 2 \implies \text{cutval}(e) = 1 - 2 = -1 < 0$ (pivot triggered!).
  - Sub-step 2.3 (Pivot Step & Rank Shift): Min slack $\gamma = 1$, shifting head component ranks by $+1$.

- [ ] **Step 2: Overhaul `02-order-heuristics.md`**
  - Sub-step 2.1 (Downward Median): Neighbors at positions $[0, 2, 5] \implies \text{median} = 2$.
  - Sub-step 2.2 (Adjacent Transpositions): Pair $u, v$ with crossing count delta $\Delta = 1 - 3 = -2 \implies$ swap performed.

- [ ] **Step 3: Overhaul `03-brandes-kopf-coordinate-assignment.md`**
  - Sub-step 2.1 (Block Alignments): 4 passes producing $x_{\text{UL}}=100, x_{\text{UR}}=120, x_{\text{LL}}=110, x_{\text{LR}}=130 \implies \text{Median} = 115\text{px}$.
  - Sub-step 2.2 (Block Compaction): Block $B_1$ at $x=0$, width $100$, gap $30 \implies x(B_2) \ge 130$.

- [ ] **Step 4: Overhaul `04-codebase-reference-map.md`**
  - Complexity derivations and line anchors.

---

### Task 3: Overhaul `docs/left-right-dagre/` (3 Files) with Numerical Examples & Sub-Step Pseudocode

**Files:**
- Modify: `docs/left-right-dagre/01-coordinate-space-transformation.md`
- Modify: `docs/left-right-dagre/02-horizontal-bezier-routing.md`
- Modify: `docs/left-right-dagre/03-codebase-reference-map.md`

- [ ] **Step 1: Overhaul `01-coordinate-space-transformation.md`**
  - Sub-step 2.1 ($\mathbf{M}_{\text{rot}}$ Transformation): Vector $(X_{\text{sugi}}=120, Y_{\text{sugi}}=450)^T \implies \begin{pmatrix}0&1\\1&0\end{pmatrix}\begin{pmatrix}120\\450\end{pmatrix} = \begin{pmatrix}450\\120\end{pmatrix}$.
  - Sub-step 2.2 (Dimension Swapping): Node width $180$, height $60 \implies \text{DagreWidth}=60, \text{DagreHeight}=180$.
  - Sub-step 2.3 (Top-Left Recovery): Center $(450, 120)$, width $180$, height $60 \implies X_{\text{top-left}} = 450 - 90 = 360$, $Y_{\text{top-left}} = 120 - 30 = 90$.

- [ ] **Step 2: Overhaul `02-horizontal-bezier-routing.md`**
  - Sub-step 2.1 (Cubic Bezier $B(t)$): $P_0 = (100, 50), P_3 = (300, 150), \Delta X = 200 \implies C_1 = (200, 50), C_2 = (200, 150)$. Evaluating $B(0.5) = (200, 100)$.
  - Sub-step 2.2 (Arc-Length Polyline Midpoint & Badge Repulsion): Midpoint calculation at $t=0.5$ and repulsion shift $(\delta_x, \delta_y) = (0, 24\text{px})$.

- [ ] **Step 3: Overhaul `03-codebase-reference-map.md`**
  - Reference map and line anchors.

---

### Task 4: Overhaul `docs/force-directed/` (3 Files) with Numerical Examples & Sub-Step Pseudocode

**Files:**
- Modify: `docs/force-directed/01-coulomb-hooke-vector-math.md`
- Modify: `docs/force-directed/02-simulated-annealing-cooling.md`
- Modify: `docs/force-directed/03-codebase-reference-map.md`

- [ ] **Step 1: Overhaul `01-coulomb-hooke-vector-math.md`**
  - Sub-step 2.1 (Equilibrium $k$): Canvas $1200 \times 800$, $|V|=16 \implies \text{Area}=960000$, $k = 0.75 \cdot \sqrt{960000/16} = 0.75 \cdot 244.95 = 183.71\text{px}$.
  - Sub-step 2.2 (Displacement & Distance): Node $u$ at $(100, 200)$, Node $v$ at $(140, 230) \implies \Delta x = 40, \Delta y = 30, d = \sqrt{1600+900} = 50\text{px}$. Unit vector $\hat{u} = (0.8, 0.6)$.
  - Sub-step 2.3 (Coulomb Repulsion): $k = 183.71, k^2 = 33750, d = 50 \implies F_r = 33750 / 50 = 675.0$. Force components $(F_{rx}, F_{ry}) = (540.0, 405.0)$.
  - Sub-step 2.4 (Hooke Attraction): Connected edge $d = 50 \implies F_a = 50^2 / 183.71 = 2500 / 183.71 = 13.61$. Force components $(F_{ax}, F_{ay}) = (-10.89, -8.17)$.
  - Sub-step 2.5 (Center Gravity): Center $(600, 400)$, $c_{\text{gravity}} = 0.02 \implies F_{gx} = -0.02 \cdot (100 - 600) = +10.0$.
  - Sub-step 2.6 (Net Force Superposition): $F_{\text{net}, x} = 540.0 - 10.89 + 10.0 = 539.11$.

- [ ] **Step 2: Overhaul `02-simulated-annealing-cooling.md`**
  - Sub-step 2.1 (Velocity Clamping): Net force $\|\vec{F}_{\text{net}}\| = 539.11$, temperature $T(0) = 120\text{px} \implies \text{Clamped step} = 120\text{px}$.
  - Sub-step 2.2 (Exponential Decay): $T(0) = 120, \gamma = 0.95 \implies T(1) = 114, T(10) = 71.84, T(50) = 9.23\text{px}$.

- [ ] **Step 3: Overhaul `03-codebase-reference-map.md`**
  - Complexity derivations and line anchors.

---

### Task 5: Overhaul `docs/concentric-radial/` (3 Files) with Numerical Examples & Sub-Step Pseudocode

**Files:**
- Modify: `docs/concentric-radial/01-polar-coordinate-transformation.md`
- Modify: `docs/concentric-radial/02-hub-spoke-bezier-routing.md`
- Modify: `docs/concentric-radial/03-codebase-reference-map.md`

- [ ] **Step 1: Overhaul `01-polar-coordinate-transformation.md`**
  - Sub-step 2.1 (Dynamic Radius $R$ & Center): $N = 8 \implies R = \max(280, 8 \cdot 45) = 360\text{px}$. Center $(X_0, Y_0) = (460, 460)$.
  - Sub-step 2.2 (Angular Displacement $\theta_i$): $\Delta\theta = 2\pi/8 = \pi/4 = 45^\circ$. For node $i=2$ (3 o'clock): $\theta_2 = 2 \cdot (\pi/4) - \pi/2 = 0$ rad.
  - Sub-step 2.3 (Polar-to-Cartesian Center): $cx = 460 + 360 \cdot \cos(0) = 820$, $cy = 460 + 360 \cdot \sin(0) = 460$.
  - Sub-step 2.4 (Top-Left Render Origin): Node width $120$, height $60 \implies X_2 = 820 - 60 = 760$, $Y_2 = 460 - 30 = 430$.

- [ ] **Step 2: Overhaul `02-hub-spoke-bezier-routing.md`**
  - Sub-step 2.1 (Quadratic Bezier $\mathbf{B}(t)$): Node $P_s = (100, 200)$, Node $P_t = (700, 200)$, Control Hub $P_0 = (400, 500)$. Evaluating $\mathbf{B}(0.5) = (0.25 \cdot 100 + 0.5 \cdot 400 + 0.25 \cdot 700, 0.25 \cdot 200 + 0.5 \cdot 500 + 0.25 \cdot 200) = (400, 350)$.
  - Sub-step 2.2 (Linear Chord Label Placement $P_{\text{label}}$): $X_{\text{label}} = (100+700)/2 = 400$, $Y_{\text{label}} = (200+200)/2 = 200$.
  - Sub-step 2.3 (Inward Deflection $\mathbf{D}$): $\mathbf{D} = (400 - 400, 350 - 200) = (0, 150\text{px})$.

- [ ] **Step 3: Overhaul `03-codebase-reference-map.md`**
  - Reference map and line anchors.

---

### Task 6: Deploy 20 Parallel Verification Subagents & Final Quality Gate Audit

- [ ] **Step 1: Deploy 20 Parallel Verification Subagents**
  - Audit all 19 topic files for:
    1. Every sub-step (2.1, 2.2, etc.) having concrete numerical inputs and calculated outputs.
    2. Every sub-step having a modular pseudocode snippet.
    3. Every sub-step having a dedicated visual ASCII graphic.
    4. Seamless bottom-up progression from simple sub-components to the final merged master algorithm.

- [ ] **Step 2: Execute Quality Gates & Push to Main**
  - Run `bun run typecheck && bun run lint && bun run build:local`
  - Push cleanly to `main`.

---

## Plan Self-Review

1. **User Feedback Alignment**: Addresses the user's explicit directive: "give direct numerical and graph examples under that specific formula... give me some numbers to compare... if they can relate any topic to pseudocode include them... for those sub-steps also visual graphical presentations... building from simplicity to complexity gradually".
2. **Execution Strategy**: Spawns 20 parallel worker subagents for high-speed, multi-agent execution.
