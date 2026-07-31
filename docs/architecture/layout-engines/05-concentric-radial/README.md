# Concentric Radial Engine (Radial Balance)

The **Concentric Radial Engine** arranges nodes along concentric circular orbits centered around a central origin point $(X_0, Y_0)$. It is ideal for central hub-and-spoke architectures, radial network maps, and single-source dependency topologies.

---

## 🎨 Architectural Infographic & Pipeline Map

```
                  ┌──────────────────────────────────────────────────┐
                  │             Input Raw Graph Dataset              │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │  Phase 1: Polar Radius & Angle Projection        │
                  │  - Angular Step θ_i = (2π · i / N) - π/2        │
                  │  - Top-Left (X_i, Y_i) & Center P_center Mapping │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │  Phase 2: Quadratic Hub-Spoke Bezier Routing     │
                  │  - Central Control Point P_0 = (X_0, Y_0)        │
                  │  - Midpoint Badge Placement on Linear Chord      │
                  └─────────────────────────┬────────────────────────┘
                                            │
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │        Final Positioned Nodes & Edges            │
                  └─────────────────────────┴────────────────────────┘
```

---

## 📚 Sub-Module Documentation Files

1. [**01-polar-coordinate-transformation.md**](./01-polar-coordinate-transformation.md) — $\langle R, \theta_i \rangle \to \langle X_i, Y_i \rangle$ polar projection, angular displacement $\theta_i = \frac{2\pi \cdot i}{N} - \frac{\pi}{2}$.
2. [**02-hub-spoke-bezier-routing.md**](./02-hub-spoke-bezier-routing.md) — Quadratic Bezier curves $\mathbf{B}(t)$ through center hub origin $(X_0, Y_0)$, label chord midpoints.
3. [**03-codebase-reference-map.md**](./03-codebase-reference-map.md) — Code map linking `computeRadialLayout` in `layoutDispatcher.ts`.
