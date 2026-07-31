# 01. Network Simplex Layer Assignment

[← Back to Master Index](../README.md)

This module documents the **Network Simplex linear programming algorithm** used to assign integer rank layers to nodes in the **Top-Down Dagre Engine**.

---

## 1. Linear Programming Formulation

Layer assignment places each graph vertex $v \in V$ into an integer layer rank $r(v) \in \mathbb{Z}_{\ge 0}$.

### 1.1 Primal Linear Program
The optimal layer assignment minimizes total weighted edge length while satisfying minimum rank separation constraints for every directed edge:

$$\begin{aligned}
\text{Minimize} \quad & \sum_{e=(u,v) \in E} w(e) \cdot (r(v) - r(u)) \\
\text{Subject to} \quad & r(v) - r(u) \ge \delta(u, v) \quad \forall (u, v) \in E \\
& r(v) \in \mathbb{Z}_{\ge 0} \quad \forall v \in V
\end{aligned}$$

Where:
- $w(e) \ge 1$ is the weight (importance factor) of edge $e=(u,v)$. Higher weights force connected nodes closer together across ranks.
- $\delta(u, v) \ge 1$ is the minimum rank separation distance (default = 1), ensuring directed edges point downwards across at least one layer step.

### 1.2 Slack & Tightness Constraints
For any edge $e = (u, v) \in E$, the **edge slack** $g(e)$ is defined as:

$$g(e) = r(v) - r(u) - \delta(u, v) \ge 0$$

- An edge $e$ is **tight** if and only if its slack is zero ($g(e) = 0$), meaning $r(v) - r(u) = \delta(u, v)$.
- An edge is **slack** if $g(e) > 0$.

---

## 2. Spanning Tree Duality & Cut Values

The dual optimization problem is solved efficiently by maintaining a **feasible spanning tree** $T = (V, E_T)$ where $E_T \subseteq E$.

```
              ┌─────────────────────────────────────────┐
              │     Feasible Rank Assignment r(v)       │
              └────────────────────┬────────────────────┘
                                   │
                                   ▼
              ┌─────────────────────────────────────────┐
              │    Tight Spanning Tree T = (V, E_T)     │
              │     (Every e ∈ E_T satisfies g(e)=0)    │
              └────────────────────┬────────────────────┘
                                   │
                                   ▼
              ┌─────────────────────────────────────────┐
              │   Compute Tree Edge Cut Values cutval(e)│
              └────────────────────┬────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
             cutval(e) >= 0                cutval(e) < 0
             (for all e ∈ E_T)             (for some e ∈ E_T)
                    │                             │
                    ▼                             ▼
         ┌───────────────────┐        ┌──────────────────────────┐
         │ Optimal Layering  │        │ Pivot Step:              │
         │ Found (Terminate) │        │ Swap e for min-slack e'  │
         └───────────────────┘        │ Update ranks & tree cut  │
                                      └──────────────────────────┘
```

### 2.1 Feasible Spanning Tree Properties
1. $T$ spans all vertices $V$.
2. Every tree edge $e \in E_T$ is **tight** ($g(e) = 0$).
3. Non-tree edges $e \notin E_T$ satisfy $g(e) \ge 0$.

### 2.2 Tree Cuts & Cut Value Equation
Removing any tree edge $e = (u, v) \in E_T$ splits $T$ into two disconnected components:
- $T_{\text{tail}}(e)$: Component containing the tail vertex $u$.
- $T_{\text{head}}(e)$: Component containing the head vertex $v$.

The **cut value** $\text{cutval}(e)$ measures the rate of change in the objective function if the ranks of all nodes in $T_{\text{head}}(e)$ are incremented by $+1$:

$$\text{cutval}(e) = \sum_{g \in \text{InCut}(e)} w(g) - \sum_{g \in \text{OutCut}(e)} w(g)$$

Where:
- $\text{OutCut}(e) = \{ (x, y) \in E \mid x \in T_{\text{tail}}(e), y \in T_{\text{head}}(e) \}$ (edges crossing cut in the tree edge direction).
- $\text{InCut}(e) = \{ (x, y) \in E \mid x \in T_{\text{head}}(e), y \in T_{\text{tail}}(e) \}$ (edges crossing cut in the opposite direction).

### 2.3 Optimality & Simplex Pivot Step
- **Optimal State**: If $\text{cutval}(e) \ge 0$ for all tree edges $e \in E_T$, the current rank assignment is globally optimal.
- **Pivot Step**: If an edge $e \in E_T$ has $\text{cutval}(e) < 0$:
  1. Remove leave edge $e$ from $T$, inducing cut $(T_{\text{tail}}, T_{\text{head}})$.
  2. Find enter edge $e' = (x', y') \in \text{InCut}(e)$ with minimum slack:
     $$\gamma = \min_{g \in \text{InCut}(e)} \text{slack}(g)$$
  3. Shift ranks: For all $z \in T_{\text{head}}(e)$, set $r(z) \leftarrow r(z) + \gamma$.
  4. Replace tree edge: $E_T \leftarrow (E_T \setminus \{e\}) \cup \{e'\}$.

---

## 3. Codebase Reference Map

- [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout` integration invoking Dagre network simplex layout engine.
- [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) — Dispatcher case routing `"top-down-dagre"` mode.

```typescript
// Code Snippet from layoutDispatcher.ts (L138-L152)
export async function computeGraphLayout(
  dataset: GraphDataset,
  mode: LayoutMode = "top-down",
): Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }> {
  switch (mode) {
    case "top-down":
      return await computeCustomEngineGraphLayout(dataset);
    case "top-down-dagre":
      return computeDagreLayout(dataset, "TB");
    case "left-right":
      return computeDagreLayout(dataset, "LR");
    case "force":
      return computeForceLayout(dataset);
    case "radial":
      return computeRadialLayout(dataset);
    default:
      return await computeCustomEngineGraphLayout(dataset);
  }
}
```
