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

## 2. Bottom-Up Mathematical Deconstruction & Numerical Sub-Steps

---

### Sub-step 2.1: Temperature-Bounded Velocity Clamping & Position Updates

#### 1. Mathematical Sub-Component Formula
At iteration $t$, after net force vector $\vec{F}_{\text{net}}(u)$ is computed for node $u$, force magnitude is evaluated:

$$\|\vec{F}_{\text{net}}(u)\|_2 = \sqrt{F_{\text{net}, x}(u)^2 + F_{\text{net}, y}(u)^2}$$

Displacement step size is clamped to maximum allowable distance $T(t)$ via scalar capping function $\min(\|\vec{F}_{\text{net}}(u)\|_2, T(t))$:

$$\vec{\Delta p}_u^{(t)} = \frac{\vec{F}_{\text{net}}(u)}{\max\left(\epsilon, \|\vec{F}_{\text{net}}(u)\|_2\right)} \cdot \min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(t) \right)$$

$$\vec{p}_u^{(t+1)} = \vec{p}_u^{(t)} + \vec{\Delta p}_u^{(t)}$$

Cartesian position update equations:

$$x_u^{(t+1)} = x_u^{(t)} + \frac{F_{\text{net}, x}(u)}{\max\left(\epsilon, \|\vec{F}_{\text{net}}(u)\|_2\right)} \cdot \min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(t) \right)$$

$$y_u^{(t+1)} = y_u^{(t)} + \frac{F_{\text{net}, y}(u)}{\max\left(\epsilon, \|\vec{F}_{\text{net}}(u)\|_2\right)} \cdot \min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(t) \right)$$

Where:
- $T(t)$: Temperature radius at iteration $t$, setting the upper limit on pixel displacement per step.
- $\epsilon = 10^{-4}$: Guard against division by zero when $\|\vec{F}_{\text{net}}(u)\| \to 0$.

#### 2. Concrete Numerical Graph Example
Consider Node $u$ at initial position $\vec{p}_u^{(0)} = (140.0, 230.0)\text{px}$ experiencing net force vector $\vec{F}_{\text{net}}(u) = (+538.31, +400.23)\text{px}$ from document 01.

1. Net force magnitude $\|\vec{F}_{\text{net}}(u)\|_2$:
   $$\|\vec{F}_{\text{net}}(u)\|_2 = \sqrt{538.31^2 + 400.23^2} = 670.79\text{px}$$

2. Temperature cap at iteration $t=0$ ($T_0 = W/10 = 120.0\text{px}$):
   $$\min\left( \|\vec{F}_{\text{net}}(u)\|_2, T(0) \right) = \min(670.79, 120.0) = 120.0\text{px}$$

3. Unit force direction vector $\hat{F}_{\text{net}}$:
   $$\hat{F}_{\text{net}} = \begin{pmatrix} \frac{538.31}{670.79} \\[4pt] \frac{400.23}{670.79} \end{pmatrix} = \begin{pmatrix} +0.8025 \\[4pt] +0.5967 \end{pmatrix}$$

4. Clamped displacement vector $\vec{\Delta p}_u^{(0)}$:
   $$\vec{\Delta p}_u^{(0)} = 120.0 \times \begin{pmatrix} +0.8025 \\[4pt] +0.5967 \end{pmatrix} = \begin{pmatrix} +96.30 \\[4pt] +71.60 \end{pmatrix}\text{px}$$

5. Updated node position $\vec{p}_u^{(1)}$:
   $$x_u^{(1)} = 140.0 + 96.30 = 236.30\text{px}$$
   $$y_u^{(1)} = 230.0 + 71.60 = 301.60\text{px}$$
   $$\vec{p}_u^{(1)} = (236.30, 301.60)\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function clampDisplacementAndUpdatePosition(
  pos: { x: number; y: number },
  force: { fx: number; fy: number },
  temperature: number,
  epsilon = 1e-4
): { x: number; y: number; stepX: number; stepY: number; fmag: number } {
  const fmag = Math.max(epsilon, Math.sqrt(force.fx * force.fx + force.fy * force.fy));
  const limitedDist = Math.min(fmag, temperature);
  const stepX = (force.fx / fmag) * limitedDist;
  const stepY = (force.fy / fmag) * limitedDist;
  return {
    x: pos.x + stepX,
    y: pos.y + stepY,
    stepX,
    stepY,
    fmag,
  };
}
// Example execution: pos=(140,230), force=(538.31,400.23), temp=120 => pos=(236.30, 301.60)
```

#### 4. Sub-Step ASCII Infographic
```
                      F_net Force Vector (670.79 px)
                        ↗ ── ── ── ── ── ── ── ── ┐
                       ╱                          │
        (Node u) ─────● ───────►                  │ Truncated by Thermal
         (140, 230)    \                          │ Radius T(0) = 120.0 px
                        \   Clamped Step          │
                         \   (96.30, 71.60)       ▼
                          ↘ ──────────────────────● New Pos (236.30, 301.60)
                            Bounding Circle T(0) = 120 px
```

---

### Sub-step 2.2: Exponential Simulated Annealing Decay Schedule ($T(t) = T_0 \cdot \gamma^t$)

#### 1. Mathematical Sub-Component Formula
The exponential temperature decay schedule (Fruchterman-Reingold standard) reduces temperature $T(t)$ across discrete simulation steps $t$:

$$T(t) = T_0 \cdot \gamma^t$$

Where:
- $T_0$: Initial temperature (typically $W / 10$).
- $\gamma \in [0.90, 0.98]$: Fractional cooling retention factor per step (default $\gamma = 0.95$).

#### 2. Concrete Numerical Graph Example
With initial temperature $T_0 = 120.0\text{px}$ and cooling factor $\gamma = 0.95$:

- Iteration $t = 0$:
  $$T(0) = 120.0 \times 0.95^0 = 120.00\text{px}$$
- Iteration $t = 1$:
  $$T(1) = 120.0 \times 0.95^1 = 114.00\text{px}$$
- Iteration $t = 10$:
  $$T(10) = 120.0 \times 0.95^{10} = 120.0 \times 0.59874 = 71.85\text{px}$$
- Iteration $t = 50$:
  $$T(50) = 120.0 \times 0.95^{50} = 120.0 \times 0.07694 = 9.23\text{px}$$
- Iteration $t = 100$:
  $$T(100) = 120.0 \times 0.95^{100} = 120.0 \times 0.00592 = 0.71\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function computeExponentialTemperature(
  T0: number,
  gamma: number,
  step: number
): number {
  return T0 * Math.pow(gamma, step);
}
// Example executions for T0=120, gamma=0.95:
// step=0   => 120.00 px
// step=1   => 114.00 px
// step=10  => 71.85 px
// step=50  => 9.23 px
// step=100 => 0.71 px
```

#### 4. Sub-Step ASCII Infographic
```
   Temp T(t) [px]
   ▲
120┼───● t=0 (120.00 px)
114┼───┼──● t=1 (114.00 px)
 71.85 ┼──┼──┼──────● t=10 (71.85 px)
   │   │  │  │      │
  9.23 ┼──┼──┼──────┼──────────────● t=50 (9.23 px)
  0.71 ┼──┼──┼──────┼──────────────┼──────────────● t=100 (0.71 px)
  0.00 ┴──┴──┴──────┴──────────────┴──────────────┴──────────────────► Iteration t
```

---

### Sub-step 2.3: Alternative Decay Schedules & Convergence Termination Check ($T_{\min}$)

#### 1. Mathematical Sub-Component Formula
Alternative cooling decay formulations offer trade-offs between convergence speed and layout quality:

1. **Linear Cooling**:
   $$T_{\text{lin}}(t) = T_0 \cdot \left(1 - \frac{t}{t_{\max}}\right)$$

2. **Quadratic Cooling**:
   $$T_{\text{quad}}(t) = T_0 \cdot \left(1 - \frac{t}{t_{\max}}\right)^2$$

Simulation termination condition:
$$\text{Halt if } T(t) < T_{\min} \quad \text{or} \quad t \ge t_{\max}$$

Where $T_{\min} = 0.01\text{px}$ is the sub-pixel motion cutoff threshold and $t_{\max} = 100$.

#### 2. Concrete Numerical Graph Example
Comparing temperature values at iteration $t = 50$ for $T_0 = 120.0\text{px}$ and $t_{\max} = 100$:

- Exponential ($\gamma = 0.95$): $T_{\text{exp}}(50) = 120.0 \times 0.95^{50} = 9.23\text{px}$
- Linear: $T_{\text{lin}}(50) = 120.0 \times (1 - 50/100) = 60.00\text{px}$
- Quadratic: $T_{\text{quad}}(50) = 120.0 \times (1 - 50/100)^2 = 30.00\text{px}$

Termination check for Exponential decay at iteration $t = 184$:
$$T(184) = 120.0 \times 0.95^{184} \approx 0.0099\text{px}$$
Since $T(184) = 0.0099\text{px} < T_{\min} = 0.01\text{px}$, simulation exits early at step 184 without waiting for $t_{\max}$.

#### 3. Targeted Sub-Step Pseudocode
```typescript
function evaluateDecayAndCheckTermination(
  T0: number,
  t: number,
  maxIter: number,
  gamma = 0.95,
  minTemp = 0.01
): { temp: number; shouldTerminate: boolean } {
  const temp = T0 * Math.pow(gamma, t);
  const shouldTerminate = temp < minTemp || t >= maxIter;
  return { temp, shouldTerminate };
}
// Example execution at t=184: { temp: 0.0099, shouldTerminate: true }
```

#### 4. Sub-Step ASCII Infographic
```
   Comparison of Cooling Decay Profiles (T0 = 120 px, t_max = 100)

   Temp [px]
  120 ┼───●───────────────────────────────────
      │   │ \ Linear (60.0 px at t=50)
      │   │  \
   60 ┼───│───┼─────●────────
   30 ┼───│───┼──────┼─────● Quadratic (30.0 px at t=50)
    9.23┼─│───┼──────┼─────┼──────● Exponential (9.23 px at t=50)
 0.01 ┼───┴───┴──────┴─────┴──────┴──────● T_min Threshold (Halt)
      0   t=0       t=50                 t=100
```

---

### Step 3: Hyperparameter Sensitivity Matrix

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
  T(0) = 120px                   T(50) = 9.23px                    T(100) = 0.71px (Frozen)

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
 * Synthesizes all vector force sub-steps and temperature clamping schedules.
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

  // 1. Compute ideal equilibrium distance k (Sub-step 2.1 in Doc 01)
  const area = canvasWidth * canvasHeight;
  const k = 0.75 * Math.sqrt(area / nodeCount);
  const k2 = k * k;

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const cGravity = 0.02;
  const epsilon = 1e-4;

  // Initialize temperature T0 and cooling factor gamma (Sub-step 2.2)
  let temperature = canvasWidth / 10;
  const gamma = 0.95;
  const minTemperature = 0.01;

  // Deep copy initial node positions
  const positions = nodes.map((n) => ({ ...n }));
  const posMap = new Map<string, ForceNode>(positions.map((n) => [n.id, n]));

  // 2. Iterative Physics Simulation Loop
  for (let iter = 0; iter < maxIterations && temperature > minTemperature; iter++) {
    const forces: Point2D[] = positions.map(() => ({ x: 0, y: 0 }));

    // 2a. Repulsive forces between ALL node pairs O(|V|^2) (Sub-step 2.3 in Doc 01)
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const u = positions[i];
        const v = positions[j];

        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const distSq = Math.max(epsilon, dx * dx + dy * dy);
        const dist = Math.sqrt(distSq);

        const fRep = k2 / dist;
        const fx = (dx / dist) * fRep;
        const fy = (dy / dist) * fRep;

        forces[i].x += fx;
        forces[i].y += fy;
        forces[j].x -= fx;
        forces[j].y -= fy;
      }
    }

    // 2b. Attractive forces along connected edges O(|E|) (Sub-step 2.4 in Doc 01)
    for (const edge of edges) {
      const u = posMap.get(edge.source);
      const v = posMap.get(edge.target);
      if (!u || !v) continue;

      const idxU = positions.findIndex((n) => n.id === u.id);
      const idxV = positions.findIndex((n) => n.id === v.id);

      const dx = u.x - v.x;
      const dy = u.y - v.y;
      const dist = Math.max(epsilon, Math.sqrt(dx * dx + dy * dy));

      const fAtt = (dist * dist) / k;
      const fx = (dx / dist) * fAtt;
      const fy = (dy / dist) * fAtt;

      forces[idxU].x -= fx;
      forces[idxU].y -= fy;
      forces[idxV].x += fx;
      forces[idxV].y += fy;
    }

    // 2c. Center gravity & temperature-bounded position updates O(|V|) (Sub-steps 2.1 & 2.5)
    for (let i = 0; i < nodeCount; i++) {
      const node = positions[i];

      // Add centripetal restoration force
      forces[i].x -= cGravity * (node.x - centerX);
      forces[i].y -= cGravity * (node.y - centerY);

      const forceMag = Math.max(epsilon, Math.sqrt(forces[i].x ** 2 + forces[i].y ** 2));
      const limitedDist = Math.min(forceMag, temperature);

      // Apply temperature-clamped displacement
      node.x += (forces[i].x / forceMag) * limitedDist;
      node.y += (forces[i].y / forceMag) * limitedDist;
    }

    // 2d. Exponential Simulated Annealing Cooling Decay (Sub-step 2.2)
    temperature *= gamma;
  }

  return positions;
}
```

---

## 🔗 Codebase Reference Anchors

- Force-Directed Dispatcher: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L71-L129)
- Master Layout Switch Entrypoint: [computeGraphLayout](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152)
