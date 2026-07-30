# 10-Round Edge Node Avoidance & Pure Straight-Line Routing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute this plan task-by-task.

**Goal:** Implement a clean, robust edge routing engine where unobstructed edges always draw direct straight lines, badges never distort edge paths, and edges strictly route around node bounding boxes to eliminate node collisions across all 10 validation rounds.

---

## 📐 Mathematical Formulation

### 1. Line Segment vs Node Rectangle Obstacle Intersection

For a segment $S = [P_A, P_B]$ and node bounding box $N = (x - \text{margin}, y - \text{margin}, w + 2\text{margin}, h + 2\text{margin})$ (with margin = 16px):
If $S$ intersects box $N$, compute clean obstacle avoidance waypoints:

- Route around the nearest corner of $N$ (e.g. $[P_A, (P_{A,x}, \text{Corner}_y), (\text{Corner}_x, \text{Corner}_y), P_B]$).

### 2. Pure Straight Line for Unobstructed Paths

If $S = [\text{startPort}, \text{startStub}, \text{endStub}, \text{endPort}]$ does NOT intersect any node box in the graph:
Draw pure straight segment $\text{startStub} \rightarrow \text{endStub}$ with zero artificial bends!

### 3. Badge Midpoint Placement & Independent Repulsion

Badges sit at exact 50% arc-length midpoint $s = L / 2$ of the path polyline.
Edge badges NEVER mutate or distort edge line geometry; badge-node repulsion only moves the badge overlay $(x_{\text{badge}}, y_{\text{badge}})$.

---

## 🔄 10-Round Iterative Validation Execution

- [ ] **Round 1:** Implement line-box intersection & clean obstacle routing algorithm in `dagreLayout.ts`.
- [ ] **Round 2:** Ensure badges never alter edge geometry. Capture & inspect screenshots for Round 1/2.
- [ ] **Round 3:** Audit `ai_agent_trace.json` topology & fix any line-node overlaps.
- [ ] **Round 4:** Audit `decision_tree.json` topology & fix any line-node overlaps.
- [ ] **Round 5:** Audit `cyclic_mesh.json` topology & fix cycle loopback routing around node boxes.
- [ ] **Round 6:** Audit horizontal layout mode (`LR`) node avoidance.
- [ ] **Round 7:** Audit parallel multi-edge offsets so curved parallel lines avoid neighboring nodes.
- [ ] **Round 8:** Audit top SVG badge layer z-index & drop-shadow contrast.
- [ ] **Round 9:** Execute full browser screenshot capture & visual verification across all 3 datasets.
- [ ] **Round 10:** Final quality gate audit (`bun test && bun run typecheck && bun run lint && bun run format:check && bun run build:local`).
