# 03. Barycentric Crossing Minimization

[← Back to Master Index](../README.md)

This module documents edge crossing count minimization via 12 alternating top-down and bottom-up barycentric sweeps, median tie-breaking, and layer order permutations.

---

## 1. Edge Crossing Formalization

For adjacent layer ranks $L_r$ and $L_{r+1}$, two edges $e_1 = (u_1, v_1)$ and $e_2 = (u_2, v_2)$ cross if and only if their endpoint orderings along the horizontal rank lines are non-monotonic.

```
       Layer L_r:       u_1 (pos 0)       u_2 (pos 1)
                            \           /
                             \         /   <-- Edge Crossing (χ = 1)
                              \       /
       Layer L_{r+1}:   v_2 (pos 0)       v_1 (pos 1)
```

### Binary Crossing Indicator Function $\chi(e_1, e_2)$

Given positions $\text{pos}(u)$ in $L_r$ and $\text{pos}(v)$ in $L_{r+1}$:

$$\chi((u_1, v_1), (u_2, v_2)) = \begin{cases} 1 & \text{if } \left( \text{pos}(u_1) < \text{pos}(u_2) \land \text{pos}(v_1) > \text{pos}(v_2) \right) \lor \left( \text{pos}(u_1) > \text{pos}(u_2) \land \text{pos}(v_1) < \text{pos}(v_2) \right) \\ 0 & \text{otherwise} \end{cases}$$

For $u_1 = u_2$ or $v_1 = v_2$ (shared port endpoint), $\chi = 0$.

### Total Graph Crossings Metric $C_{\text{cross}}$

$$\mathbf{C}_{\text{cross}}(\sigma) = \sum_{r=0}^{K-1} \sum_{e_1, e_2 \in E(L_r, L_{r+1})} \chi(e_1, e_2)$$

---

## 2. Alternating Barycentric Sweeps

To minimize crossings $C_{\text{cross}}$, the layout engine executes **12 alternating sweeps** (6 top-down passes, 6 bottom-up passes).

```
      Top-Down Sweep (L_0 -> L_1 -> ... -> L_k):
      Assign barycenter based on predecessor positions in L_{r-1}

      Bottom-Up Sweep (L_k -> L_{k-1} -> ... -> L_0):
      Assign barycenter based on successor positions in L_{r+1}
```

### Top-Down Barycenter Weight Formula $\beta_{\text{TD}}(v)$

For vertex $v \in L_r$ ($r > 0$), calculate mean predecessor position:

$$\beta_{\text{TD}}(v) = \frac{1}{|\text{Predecessors}(v)|} \sum_{u \in \text{Predecessors}(v)} \text{pos}(u)$$

### Bottom-Up Barycenter Weight Formula $\beta_{\text{BU}}(v)$

For vertex $v \in L_r$ ($r < K-1$), calculate mean successor position:

$$\beta_{\text{BU}}(v) = \frac{1}{|\text{Successors}(v)|} \sum_{w \in \text{Successors}(v)} \text{pos}(w)$$

### Median Tie-Breaking & Heuristic Fallback

When two nodes $v_1, v_2 \in L_r$ share identical barycenter values ($\beta(v_1) = \beta(v_2)$), tie-breaking is performed using median predecessor positions $\mu(v)$:

$$\mu(v) = \text{median} \{ \text{pos}(u) \mid u \in \text{Predecessors}(v) \}$$

If $\mu(v_1) = \mu(v_2)$, the engine breaks ties deterministically using node ID string comparison ($v_1.\text{id} <_{\text{lex}} v_2.\text{id}$) to prevent local minima oscillation.

### Sweeping Convergence & Stability Theorem

Because the barycenter heuristic minimizes the sum of squared edge lengths $\sum (x(u) - x(v))^2$ across adjacent layers, each pass guarantees a monotonic non-increasing bound on edge crossings up to local structural constraints. The best layer order configuration observed across all 12 sweeps is preserved.

---

## 3. Step-by-Step Developer Walkthrough

1. **Build Layer Structure**: Construct initial rank layer list $L = [L_0, L_1, \dots, L_k]$ using dummy node expanded graph.
2. **Apply Custom Overrides**: Call `applyLayerOrderOverrides()` to apply any custom node ordering sequences defined in search state state tuple $\sigma$.
3. **Execute Sweeps**: Call `minimizeCrossings()`. For iterations $i = 1 \dots 12$:
   - **Top-Down Pass**: Iterate $r = 1 \dots k$. Compute $\beta_{\text{TD}}(v)$ for each $v \in L_r$, sort $L_r$ by barycenter, and evaluate total crossings using `countTotalGraphCrossings()`.
   - **Bottom-Up Pass**: Iterate $r = k-1 \dots 0$. Compute $\beta_{\text{BU}}(v)$ for each $v \in L_r$, sort $L_r$, and re-evaluate.
4. **Preserve Best Order**: Record the layer ordering matrix $\mathcal{L}^*$ that achieved the absolute minimum $C_{\text{cross}}$.

---

## 4. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/crossingMinimization.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L9-L200)
  - [`countLayerCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L9-L42) — Layer-pair edge crossing counter $\chi$
  - [`countTotalGraphCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L44-L66) — Total graph edge crossings evaluator $C_{\text{cross}}$
  - [`minimizeCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L95-L200) — 12-sweep alternating barycentric optimization loop
- [`src/engine/layout/custom/crossingDetection.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingDetection.ts#L1-L80)
  - Geometric segment-segment intersection crossing detector
- [`src/engine/layout/custom/portOrdering.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L1-L60)
  - Pin port sorting and relative position mapping

```typescript
// Code Snippet from crossingMinimization.ts (L9-L39)
export function countLayerCrossings(
  layerUpper: string[],
  layerLower: string[],
  edges: { u: string; v: string }[],
): number {
  const uPos = new Map<string, number>();
  layerUpper.forEach((id, idx) => uPos.set(id, idx));

  const vPos = new Map<string, number>();
  layerLower.forEach((id, idx) => vPos.set(id, idx));

  const validEdges = edges.filter((e) => uPos.has(e.u) && vPos.has(e.v));
  let crossings = 0;

  for (let i = 0; i < validEdges.length; i++) {
    for (let j = i + 1; j < validEdges.length; j++) {
      const e1 = validEdges[i];
      const e2 = validEdges[j];

      if (e1.u === e2.u || e1.v === e2.v) continue;

      const u1 = uPos.get(e1.u)!;
      const u2 = uPos.get(e2.u)!;
      const v1 = vPos.get(e1.v)!;
      const v2 = vPos.get(e2.v)!;

      if ((u1 < u2 && v1 > v2) || (u1 > u2 && v1 < v2)) {
        crossings++;
      }
    }
  }

  return crossings;
}
```
