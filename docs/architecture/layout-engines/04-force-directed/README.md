# Organic Force Engine (Physics Force-Directed)

The **Organic Force Engine** uses a **Fruchterman-Reingold spring embedder algorithm** governed by electrostatic repulsion forces and mechanical spring attraction forces. It is optimal for non-hierarchical, unstructured graphs, cluster analysis, and network discovery.

---

## 🎨 Architectural Infographic & Pipeline Map

```
                  ┌──────────────────────────────────────────────────┐
                  │             Input Raw Graph Dataset              │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │   Phase 1: Force Vector Accumulation (Coulomb)   │
                  │   - Repulsion Force F_r = + (k^2 / d) · u_uv     │
                  │   - Spring Attraction Force F_a = (d^2 / k) · u  │
                  │   - Center Gravity Force F_g = -c · (p - center) │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │   Phase 2: Simulated Annealing Displacement       │
                  │   - Temperature Cooling T(t) = T_initial · γ^t   │
                  │   - Velocity Bounding min(||F_net||, T(t))       │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │        Final Positioned Nodes & Edges            │
                  └─────────────────────────┴────────────────────────┘
```

---

## 📚 Sub-Module Documentation Files

1. [**01-coulomb-hooke-vector-math.md**](./01-coulomb-hooke-vector-math.md) — Coulomb electrostatic repulsion $\vec{F}_r$, Hooke spring attraction $\vec{F}_a$, center gravity $\vec{F}_g$, net force vector summation.
2. [**02-simulated-annealing-cooling.md**](./02-simulated-annealing-cooling.md) — Temperature decay $T(t) = T_{\text{initial}} \cdot \gamma^t$, velocity bounding, zero-vector safeguards $\epsilon$.
3. [**03-codebase-reference-map.md**](./03-codebase-reference-map.md) — Code map linking `computeForceLayout` in `layoutDispatcher.ts`.
