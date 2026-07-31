# 02. Simulated Annealing & Temperature Cooling Schedules

[← Back to Master Index](../README.md)

This module documents simulated annealing temperature decay, displacement velocity bounding, ASCII force vector diagrams, and simulation code snippets for the **Organic Force Engine**.

---

## 1. Simulated Annealing Mechanics & Velocity Bounding

In force-directed physics simulations, raw net forces can cause excessive node velocities, wild oscillations, and chaotic divergence. To ensure smooth convergence to a minimum energy state, node displacement per iteration $t$ is bounded by a global temperature parameter $T(t)$.

### Velocity Bounding & Position Update Formula:

$$\vec{\Delta p}_u^{(t)} = \frac{\vec{F}_{\text{net}}(u)}{\max\left(\epsilon, \|\vec{F}_{\text{net}}(u)\|_2\right)} \cdot \min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(t) \right)$$

$$\vec{p}_u^{(t+1)} = \vec{p}_u^{(t)} + \vec{\Delta p}_u^{(t)}$$

#### Component-wise Position Update:

$$x_u^{(t+1)} = x_u^{(t)} + \frac{F_{\text{net}, x}(u)}{\max\left(\epsilon, \|\vec{F}_{\text{net}}(u)\|_2\right)} \cdot \min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(t) \right)$$

$$y_u^{(t+1)} = y_u^{(t)} + \frac{F_{\text{net}, y}(u)}{\max\left(\epsilon, \|\vec{F}_{\text{net}}(u)\|_2\right)} \cdot \min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(t) \right)$$

Where:
- $T(t)$: Temperature radius at iteration $t$, representing the maximum allowable displacement step.
- $\epsilon = 10^{-4}$: Guard against division by zero when $\|\vec{F}_{\text{net}}(u)\| \to 0$.

---

## 2. ASCII Force Vector & Cooling Diagrams

### Diagram 1: Net Vector Superposition & Temperature Bounding Circle

```
           F_r (Repulsion from v1)
                \
                 \    F_net (Unclamped Net Force Vector)
                  \  ↗ ── ── ── ── ── ── ── ── ┐
                   \╱                          │  Displacement Capped
    (Node u) ───────● ─────────────────►       │  by Radius T(t)
                   ╱ \  \               \      │
                  ╱   \   \   Clamped    \     │
                 ╱     \    \  Vector     \    ▼
                /       \     ↘ ───────────● ──┤ Circle of Max Radius T(t)
               /         \
   F_a (Attraction v2)   F_g (Gravity to Center)
```

---

### Diagram 2: Pairwise Force Dynamics (Repulsion vs Attraction vs Equilibrium)

```
    [ Electrostatic Repulsion F_r ]          [ Mechanical Spring Attraction F_a ]
    (Pushes all node pairs apart)             (Pulls connected neighbor endpoints)

      +F_r            -F_r                        -F_a            +F_a
    <─────── (Node u) ───────>                  ───────> (Node u) <───────
    (Node v) <─────── ───────>                  (Node v) ───────> <───────

    Equilibrium at d(u, v) = k:
    |F_r| = k^2 / k = k  <=================>  |F_a| = k^2 / k = k   (Net force = 0)
```

---

### Diagram 3: Temperature Cooling Decay Schedules Over Time

```
   Temp T(t)
   ▲
 T0┼───┐
   │   │\
   │   │ \  Exponential Decay: T(t) = T0 * gamma^t   (gamma = 0.95)
   │   │  \
   │   │   \
   │   │    ───┐
   │   │       \
   │   │        ───┐  Linear Decay: T(t) = T0 * (1 - t / T_max)
   │   │           \
 Tmin──┴────────────┴─────────────────────────────────────► Iteration t
       t=0          t=25         t=50        t=75       t=100 (Max Iterations)
```

---

## 3. Cooling Schedule Formulations & Parameter Sensitivity

| Cooling Schedule | Mathematical Formula | Convergence Behavior | Best Use Case |
| :--- | :--- | :--- | :--- |
| **Exponential (Default)** | $T(t) = T_0 \cdot \gamma^t \quad (\gamma \approx 0.95)$ | Smooth exponential damping; rapid early movement, slow settling | General graphs (Fruchterman-Reingold standard) |
| **Linear** | $T(t) = T_0 \cdot \left(1 - \frac{t}{t_{\max}}\right)$ | Constant reduction speed per step | Fixed step budget runs |
| **Quadratic Decay** | $T(t) = T_0 \cdot \left(1 - \frac{t}{t_{\max}}\right)^2$ | Strong early dampening | Dense graphs with high node count |

### Parameter Sensitivity Analysis:

- **Initial Temperature ($T_0$)**: Typically set to $10\% - 20\%$ of the canvas width ($T_0 = W / 10$). High $T_0$ untangles dense graphs; low $T_0$ preserves initial spatial topology.
- **Cooling Factor ($\gamma$)**: Typically $\gamma \in [0.90, 0.98]$. Higher values ($\gamma = 0.98$) yield higher quality layouts at the cost of requiring more iterations.
- **Minimum Temperature Threshold ($T_{\min}$)**: Typically $T_{\min} = 0.01$. Once $T(t) < T_{\min}$, simulation halts early to save CPU cycles.
- **Max Iteration Count ($t_{\max}$)**: Standard default is $t_{\max} = 100$ iterations.

---

## 4. Complete Physics Simulation Code Snippet

The following TypeScript code snippet illustrates the full iterative Fruchterman-Reingold simulation loop incorporating repulsion, attraction, gravity, and simulated annealing cooling:

```typescript
export interface Point2D {
  x: number;
  y: number;
}

export interface ForceNode extends Point2D {
  id: string;
  width: number;
  height: number;
}

export interface ForceEdge {
  source: string;
  target: string;
}

/**
 * Runs iterative Fruchterman-Reingold force-directed simulation with simulated annealing cooling.
 */
export function runForceDirectedSimulation(
  nodes: ForceNode[],
  edges: ForceEdge[],
  canvasWidth = 1200,
  canvasHeight = 800,
  maxIterations = 100,
): ForceNode[] {
  const nodeCount = nodes.length;
  if (nodeCount === 0) return [];

  // 1. Calculate ideal equilibrium distance k
  const area = canvasWidth * canvasHeight;
  const k = 0.75 * Math.sqrt(area / nodeCount);
  const k2 = k * k;

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const cGravity = 0.02;
  const epsilon = 1e-4;

  // Initialize temperature T0
  let temperature = canvasWidth / 10;
  const gamma = 0.95; // cooling factor

  // Mutable copy of node positions
  const positions = nodes.map((n) => ({ ...n }));
  const posMap = new Map<string, ForceNode>(positions.map((n) => [n.id, n]));

  // 2. Iterative Physics Simulation Loop
  for (let iter = 0; iter < maxIterations && temperature > 0.01; iter++) {
    // Array to store accumulated net forces per node
    const forces: Point2D[] = positions.map(() => ({ x: 0, y: 0 }));

    // 2a. Repulsive Forces between ALL node pairs O(|V|^2)
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const u = positions[i];
        const v = positions[j];

        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const distSq = Math.max(epsilon, dx * dx + dy * dy);
        const dist = Math.sqrt(distSq);

        // Repulsive magnitude F_r = k^2 / dist
        const fRep = k2 / dist;
        const fx = (dx / dist) * fRep;
        const fy = (dy / dist) * fRep;

        forces[i].x += fx;
        forces[i].y += fy;
        forces[j].x -= fx;
        forces[j].y -= fy;
      }
    }

    // 2b. Attractive Forces along connected edges O(|E|)
    for (const edge of edges) {
      const u = posMap.get(edge.source);
      const v = posMap.get(edge.target);
      if (!u || !v) continue;

      const idxU = positions.findIndex((n) => n.id === u.id);
      const idxV = positions.findIndex((n) => n.id === v.id);

      const dx = u.x - v.x;
      const dy = u.y - v.y;
      const dist = Math.max(epsilon, Math.sqrt(dx * dx + dy * dy));

      // Attractive magnitude F_a = dist^2 / k
      const fAtt = (dist * dist) / k;
      const fx = (dx / dist) * fAtt;
      const fy = (dy / dist) * fAtt;

      forces[idxU].x -= fx;
      forces[idxU].y -= fy;
      forces[idxV].x += fx;
      forces[idxV].y += fy;
    }

    // 2c. Center Gravity & Temperature Clamped Position Update
    for (let i = 0; i < nodeCount; i++) {
      const node = positions[i];

      // Add gravitational restoration toward canvas center
      forces[i].x -= cGravity * (node.x - centerX);
      forces[i].y -= cGravity * (node.y - centerY);

      const forceMag = Math.max(epsilon, Math.sqrt(forces[i].x ** 2 + forces[i].y ** 2));
      const limitedDist = Math.min(forceMag, temperature);

      // Apply temperature-bounded displacement
      node.x += (forces[i].x / forceMag) * limitedDist;
      node.y += (forces[i].y / forceMag) * limitedDist;
    }

    // 2d. Exponential Simulated Annealing Temperature Decay
    temperature *= gamma;
  }

  return positions;
}
```

---

## 🔗 Codebase Implementation Links

- Force Layout Dispatcher: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L71-L129)
- Master Layout Switch Engine: [computeGraphLayout](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152)

