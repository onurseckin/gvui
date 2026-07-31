# 02. Simulated Annealing & Temperature Cooling Schedules

[← Back to Master Index](../README.md)

This document explains why unconstrained physics simulations oscillate indefinitely and how **Simulated Annealing Temperature Cooling** regulates node displacement velocities to guarantee convergence to a stable, low-energy visual equilibrium.

---

## 1. Problem & Trade-off Journey: Oscillation & Numerical Instability

### The Physics Oscillation Problem
In a pure Newtonian force-directed simulation without cooling, raw net forces are applied directly as velocity vectors or unlimited displacement steps. This leads to severe numerical instabilities:

```
  Unconstrained Force Simulation (Endless Oscillation)      Simulated Annealing (Damped Convergence)

         (Node u) <=========> (Node v)                              (Node u) ===> . <=== (Node v)
       Overshoots equilibrium distance k                           Damped displacement caps step size
       Bounces back and forth endlessly                             Freezes into stable equilibrium position
```

### Why Raw Euler Integration Fails
1. **Kinetic Energy Accumulation**: Without damping or thermal friction, net forces continuously accelerate nodes past their equilibrium distance ($d(u,v) = k$), causing perpetual spring overshoot.
2. **Short-Range Force Explosion**: When two nodes come extremely close ($d(u,v) \to 0$), repulsive forces ($\vec{F}_r \propto 1/r$) explode in magnitude, launching nodes across the canvas and destabilizing adjacent graph regions.
3. **Infinite Jitter**: Near equilibrium, small residual net forces cause nodes to jiggle indefinitely, preventing the renderer from settling on a static frame.

### The Simulated Annealing Solution
Originating from statistical mechanics and metallurgy, **Simulated Annealing** introduces a global temperature parameter $T(t)$ that bounds the maximum distance any node can move during iteration $t$:

- **Hot Phase ($T_0$ high)**: Allows large spatial jumps, enabling nodes to untangle long-range crossings and rearrange globally across the canvas.
- **Cooling Phase ($T(t)$ decreasing)**: Gradually restricts displacement step sizes, forcing nodes to refine local positions.
- **Frozen Phase ($T(t) \to T_{\min}$)**: Restricts step sizes to sub-pixel adjustments, freezing nodes into a static, minimum-energy spatial configuration.

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 1: Velocity Bounding & Position Update Formula
At iteration $t$, after net force vector $\vec{F}_{\text{net}}(u)$ is computed for node $u$, the force magnitude is evaluated:

$$\|\vec{F}_{\text{net}}(u)\|_2 = \sqrt{F_{\text{net}, x}(u)^2 + F_{\text{net}, y}(u)^2}$$

The displacement step size is clamped to maximum allowable distance $T(t)$ via scalar capping function $\min(\|\vec{F}_{\text{net}}(u)\|, T(t))$:

$$\vec{\Delta p}_u^{(t)} = \frac{\vec{F}_{\text{net}}(u)}{\max\left(\epsilon, \|\vec{F}_{\text{net}}(u)\|_2\right)} \cdot \min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(t) \right)$$

$$\vec{p}_u^{(t+1)} = \vec{p}_u^{(t)} + \vec{\Delta p}_u^{(t)}$$

#### Component-wise Position Update Equations:

$$x_u^{(t+1)} = x_u^{(t)} + \frac{F_{\text{net}, x}(u)}{\max\left(\epsilon, \|\vec{F}_{\text{net}}(u)\|_2\right)} \cdot \min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(t) \right)$$

$$y_u^{(t+1)} = y_u^{(t)} + \frac{F_{\text{net}, y}(u)}{\max\left(\epsilon, \|\vec{F}_{\text{net}}(u)\|_2\right)} \cdot \min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(t) \right)$$

Where:
- $T(t)$: Temperature radius at iteration $t$, setting the upper limit on pixel displacement per step.
- $\epsilon = 10^{-4}$: Guard against division by zero when $\|\vec{F}_{\text{net}}(u)\| \to 0$.

---

### Step 2: Cooling Schedule Formulations
The temperature schedule defines how $T(t)$ decays over discrete simulation iterations $t = 0, 1, 2, \dots, t_{\max}$.

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

#### 1. Exponential Cooling (Fruchterman-Reingold Standard)
$$T(t) = T_0 \cdot \gamma^t$$

Where $\gamma \in [0.90, 0.98]$ is the cooling factor (typically $\gamma = 0.95$). This schedule provides rapid early movement followed by smooth, asymptotic thermal decay.

#### 2. Linear Cooling
$$T(t) = T_0 \cdot \left(1 - \frac{t}{t_{\max}}\right)$$

Provides a constant rate of temperature reduction across fixed step count $t_{\max}$.

#### 3. Quadratic Cooling
$$T(t) = T_0 \cdot \left(1 - \frac{t}{t_{\max}}\right)^2$$

Accelerates dampening early in the simulation, useful for extremely dense, highly connected graphs.

---

### Step 3: Termination Conditions & Hyperparameter Sensitivity

| Parameter | Recommended Value | Physical Significance | Sensitivity Effect |
| :--- | :--- | :--- | :--- |
| **Initial Temp ($T_0$)** | $W / 10 \quad (\approx 120\text{px})$ | Maximum initial displacement radius. | Higher $T_0$ untangles dense graphs; lower $T_0$ preserves original layout topology. |
| **Cooling Factor ($\gamma$)** | $0.95$ | Fractional temperature retention per step. | $\gamma = 0.98$ improves layout quality but requires more iterations; $\gamma = 0.90$ speeds up execution. |
| **Min Temp ($T_{\min}$)** | $0.01\text{px}$ | Simulation early exit threshold. | When $T(t) < T_{\min}$, displacement drops below sub-pixel rendering resolution, halting calculation. |
| **Max Iterations ($t_{\max}$)** | $100$ steps | Maximum loop count ceiling. | Bounds worst-case execution time ($O(t_{\max} \cdot |V|^2)$). |

---

## 3. Visual ASCII Diagrams

### Diagram 1: Displacement Step Vector Clamping
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
                /       \     ↘ ───────────● ──┤ Bounding Circle of Radius T(t)
               /         \
   F_a (Attraction v2)   F_g (Gravity to Center)
```

---

### Diagram 2: Spatial Convergence Progression Across Thermal Stages
```
  Iteration 0 (Hot)              Iteration 50 (Cooling)            Iteration 100 (Frozen)
  T(0) = 120px                   T(50) = 9.2px                     T(100) = 0.007px (Halted)

      (u)                          (u) ─────── (v)                    (u) ─────── (v)
     ╱   ╲                            │         │                      │         │
   (v)───(w)                        (w) ─────── (z)                    (w) ─────── (z)
  (Chaotic Overlaps)             (Macro Clusters Formed)           (Minimum Energy Equilibrium)
```

---

## 4. Complete Simulation Loop Pseudocode

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
  maxIterations = 100
): ForceNode[] {
  const nodeCount = nodes.length;
  if (nodeCount === 0) return [];

  // 1. Compute ideal equilibrium distance k
  const area = canvasWidth * canvasHeight;
  const k = 0.75 * Math.sqrt(area / nodeCount);
  const k2 = k * k;

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const cGravity = 0.02;
  const epsilon = 1e-4;

  // Initialize temperature T0 and cooling factor gamma
  let temperature = canvasWidth / 10;
  const gamma = 0.95;
  const minTemperature = 0.01;

  // Deep copy initial node positions
  const positions = nodes.map((n) => ({ ...n }));
  const posMap = new Map<string, ForceNode>(positions.map((n) => [n.id, n]));

  // 2. Iterative Physics Simulation Loop
  for (let iter = 0; iter < maxIterations && temperature > minTemperature; iter++) {
    // Array to store accumulated net forces per node
    const forces: Point2D[] = positions.map(() => ({ x: 0, y: 0 }));

    // 2a. Repulsive forces between ALL node pairs O(|V|^2)
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

    // 2b. Attractive forces along connected edges O(|E|)
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

    // 2c. Center gravity & temperature-bounded position updates O(|V|)
    for (let i = 0; i < nodeCount; i++) {
      const node = positions[i];

      // Add centripetal restoration force toward canvas center
      forces[i].x -= cGravity * (node.x - centerX);
      forces[i].y -= cGravity * (node.y - centerY);

      const forceMag = Math.max(epsilon, Math.sqrt(forces[i].x ** 2 + forces[i].y ** 2));
      const limitedDist = Math.min(forceMag, temperature);

      // Apply temperature-clamped displacement
      node.x += (forces[i].x / forceMag) * limitedDist;
      node.y += (forces[i].y / forceMag) * limitedDist;
    }

    // 2d. Exponential Simulated Annealing Cooling Decay
    temperature *= gamma;
  }

  return positions;
}
```

---

## 🔗 Codebase Reference Anchors

- Force-Directed Dispatcher: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L71-L129)
- Master Layout Switch Entrypoint: [computeGraphLayout](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152)
