# 8-Direction Multi-Port Equal Spacing Edge System Plan & Mathematical Formulation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a mathematical 4-side multi-port equal spacing algorithm and 8-direction (45° angle snap) vector routing engine where edges attach to any of the 4 node sides (`Top`, `Right`, `Bottom`, `Left`) with exact $\frac{i}{m+1}$ equal border spacing for any arbitrary number of connections $m$.

---

## 📐 Mathematical Formulation

### 1. Side Selection Algorithm
For connected nodes $S (x_S, y_S, w_S, h_S)$ and $T (x_T, y_T, w_T, h_T)$:
Let $\Delta x = (x_T + w_T/2) - (x_S + w_S/2)$, $\Delta y = (y_T + h_T/2) - (y_S + h_S/2)$.
Angle $\theta = \operatorname{atan2}(\Delta y, \Delta x) \in [-\pi, \pi]$.

Primary departure side $S_{\text{side}}$:
- **Right**: $-\pi/4 \le \theta < \pi/4$
- **Bottom**: $\pi/4 \le \theta < 3\pi/4$
- **Left**: $3\pi/4 \le \theta \le \pi \lor -\pi \le \theta < -3\pi/4$
- **Top**: $-3\pi/4 \le \theta < -\pi/4$

Arrival side $T_{\text{side}}$ is selected as the opposite or nearest side yielding minimum 8-direction path length.

### 2. Multi-Port Equal Spacing Formula
For any node $N$ and side $K \in \{\text{Top}, \text{Right}, \text{Bottom}, \text{Left}\}$:
Let $m = |E_{N, K}|$ be the total number of edges attached to side $K$ of node $N$ ($m \ge 1$).
Sort attached edges $E_{N, K}$ deterministically along the side's primary axis.

For the $i$-th edge ($1 \le i \le m$), the normalized fractional border offset is:
$$\alpha_i = \frac{i}{m + 1} \in (0, 1)$$

Canvas coordinate $P(N, K, i)$ for node $N (x, y, w, h)$:
- **Top**: $(x + \alpha_i \cdot w, \; y)$
- **Bottom**: $(x + \alpha_i \cdot w, \; y + h)$
- **Left**: $(x, \; y + \alpha_i \cdot h)$
- **Right**: $(x + w, \; y + \alpha_i \cdot h)$

### 3. 8-Direction Polyline Snap (45° Increments)
Vector segments $V = C_{k+1} - C_k$ satisfy:
$$\theta_V = \operatorname{atan2}(V_y, V_x) \in \{0^\circ, 45^\circ, 90^\circ, 135^\circ, 180^\circ, 225^\circ, 270^\circ, 315^\circ\}$$

---

## Task Breakdown

### Task 1: Mathematical Multi-Port Equal Spacing Engine

**Files:**
- Modify: `src/engine/layout/dagreLayout.ts`

- [ ] **Step 1: Build side assignment map `E_{N, K}` grouping all incoming/outgoing edges by node side**
- [ ] **Step 2: Implement $\alpha_i = \frac{i}{m+1}$ port coordinate calculation for Top, Right, Bottom, Left sides**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `feat: implement mathematical 4-side multi-port equal spacing calculation`

---

### Task 2: 8-Direction Vector Path Routing & 2D Badge Repulsion

**Files:**
- Modify: `src/engine/layout/dagreLayout.ts`
- Modify: `src/primitives/edges/GraphEdge/computeEdgePath.ts`

- [ ] **Step 1: Route polyline from $P_{\text{src}}$ to $P_{\text{tgt}}$ with 8-direction 45° angle snapping**
- [ ] **Step 2: Calculate exact 50% total path arc-length midpoint for edge badges**
- [ ] **Step 3: Run 2D badge-badge and badge-node repulsion pass**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `feat: implement 8-direction vector path routing and badge repulsion pass`
