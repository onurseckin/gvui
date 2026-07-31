# 02. Simulated Annealing & Temperature Cooling Schedules

This module documents simulated annealing temperature decay and velocity bounding in the Organic Force Engine.

---

## 1. Simulated Annealing Displacement

To prevent chaotic oscillation and ensure convergence, displacement per iteration is bounded by a temperature parameter $T(t)$:

$$\vec{p}_u^{(t+1)} = \vec{p}_u^{(t)} + \min\left( \|\vec{F}_{\text{net}}(u)\|, T(t) \right) \cdot \frac{\vec{F}_{\text{net}}(u)}{\max(\epsilon, \|\vec{F}_{\text{net}}(u)\|)}$$

```
     Iteration t=0 (High Temp T):   Large Node Movements (Global Clustering)
                                              │
                                              ▼
     Iteration t=50 (Medium Temp):  Refining Edge Distances
                                              │
                                              ▼
     Iteration t=100 (Low Temp):    Final Settled Equilibrium (Stable Layout)
```

---

## 2. Cooling Schedule Math

The temperature $T(t)$ decays exponentially across iterations:

$$T(t) = T_{\text{initial}} \cdot \gamma^t, \quad \gamma \approx 0.95$$

The simulation halts when $T(t) < T_{\text{threshold}}$ or after 100 iterations.
