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
```
ALGORITHM clampDisplacementAndUpdatePosition
INPUT: position, force, temperature, epsilon (default 0.0001)
OUTPUT: newPosition, stepX, stepY, forceMagnitude

forceMagnitude = MAX(epsilon, SQRT(force.x * force.x + force.y * force.y))
limitedDist = MIN(forceMagnitude, temperature)

stepX = (force.x / forceMagnitude) * limitedDist
stepY = (force.y / forceMagnitude) * limitedDist

newPosition.x = position.x + stepX
newPosition.y = position.y + stepY

RETURN newPosition, stepX, stepY, forceMagnitude
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
```
ALGORITHM computeExponentialTemperature
INPUT: initialTemp, coolingFactor, currentStep
OUTPUT: temperature

temperature = initialTemp * (coolingFactor ^ currentStep)
RETURN temperature
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
```
ALGORITHM evaluateDecayAndCheckTermination
INPUT: initialTemp, currentStep, maxIterations, coolingFactor (default 0.95), minTemp (default 0.01)
OUTPUT: temperature, shouldTerminate

temperature = initialTemp * (coolingFactor ^ currentStep)
shouldTerminate = (temperature < minTemp) OR (currentStep >= maxIterations)

RETURN temperature, shouldTerminate
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

```
ALGORITHM runForceDirectedSimulation
INPUT: nodes, edges, canvasWidth (default 1200), canvasHeight (default 800), maxIterations (default 100)
OUTPUT: updatedNodes

IF LENGTH(nodes) == 0 THEN
    RETURN []
END IF

// 1. Compute ideal equilibrium distance k
area = canvasWidth * canvasHeight
k = 0.75 * SQRT(area / LENGTH(nodes))
centerX = canvasWidth / 2
centerY = canvasHeight / 2
cGravity = 0.02
epsilon = 0.0001

// Initialize cooling temperature and parameters
temperature = canvasWidth / 10
coolingFactor = 0.95
minTemperature = 0.01

positions = COPY(nodes)

// 2. Iterative Physics Simulation Loop
FOR iteration FROM 0 TO maxIterations - 1 DO
    IF temperature <= minTemperature THEN
        BREAK
    END IF

    forces = INITIALIZE_FORCES_ARRAY(LENGTH(positions), x = 0, y = 0)

    // 2a. Repulsive forces between ALL node pairs
    FOR i FROM 0 TO LENGTH(positions) - 1 DO
        FOR j FROM i + 1 TO LENGTH(positions) - 1 DO
            nodeU = positions[i]
            nodeV = positions[j]

            dx = nodeU.x - nodeV.x
            dy = nodeU.y - nodeV.y
            distance = MAX(epsilon, SQRT(dx * dx + dy * dy))

            fRep = (k * k) / distance
            fx = (dx / distance) * fRep
            fy = (dy / distance) * fRep

            forces[i].x = forces[i].x + fx
            forces[i].y = forces[i].y + fy
            forces[j].x = forces[j].x - fx
            forces[j].y = forces[j].y - fy
        END FOR
    END FOR

    // 2b. Attractive forces along connected edges
    FOR EACH edge IN edges DO
        nodeU = FIND_NODE(positions, edge.source)
        nodeV = FIND_NODE(positions, edge.target)

        IF nodeU EXISTS AND nodeV EXISTS THEN
            dx = nodeU.x - nodeV.x
            dy = nodeU.y - nodeV.y
            distance = MAX(epsilon, SQRT(dx * dx + dy * dy))

            fAtt = (distance * distance) / k
            fx = (dx / distance) * fAtt
            fy = (dy / distance) * fAtt

            forces[nodeU].x = forces[nodeU].x - fx
            forces[nodeU].y = forces[nodeU].y - fy
            forces[nodeV].x = forces[nodeV].x + fx
            forces[nodeV].y = forces[nodeV].y + fy
        END IF
    END FOR

    // 2c. Gravity & temperature-bounded position updates
    FOR i FROM 0 TO LENGTH(positions) - 1 DO
        node = positions[i]

        // Add centripetal restoration force
        forces[i].x = forces[i].x - cGravity * (node.x - centerX)
        forces[i].y = forces[i].y - cGravity * (node.y - centerY)

        forceMag = MAX(epsilon, SQRT(forces[i].x * forces[i].x + forces[i].y * forces[i].y))
        limitedDist = MIN(forceMag, temperature)

        // Apply temperature-clamped displacement
        node.x = node.x + (forces[i].x / forceMag) * limitedDist
        node.y = node.y + (forces[i].y / forceMag) * limitedDist
    END FOR

    // 2d. Exponential Simulated Annealing Cooling Decay
    temperature = temperature * coolingFactor
END FOR

RETURN positions
```

---

## 🔗 Codebase Reference Anchors

- Force-Directed Dispatcher: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L71-L129)
- Master Layout Switch Entrypoint: [computeGraphLayout](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152)
