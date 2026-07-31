# 03. Brandes-Köpf Coordinate Alignment

[← Back to Master Index](../README.md)

This module documents the **Brandes-Köpf coordinate assignment algorithm** used by Dagre to calculate aesthetic horizontal X-coordinates with balanced subtree placement, straight vertical long-edge alignment, and linear $O(V + E)$ run time.

---

## 1. The Problem & Trade-off Journey

### 1.1 The Coordinate Assignment Challenge
After layer assignment (ranks $y(v)$) and crossing reduction (sequence permutations $\pi(v)$), each node has a discrete coordinate pair $(r(v), \text{pos}(v))$. The final phase must compute real-valued horizontal coordinates $x(v) \in \mathbb{R}$ satisfying four aesthetic criteria:

1. **Straight Edges**: Vertices connected by edges (especially long edges spanning multiple layers) should be aligned vertically ($x(u) \approx x(v)$).
2. **Subtree Symmetry**: Balanced subtrees must be centered symmetrically relative to their parent nodes.
3. **Minimum Separation**: Adjacent nodes on the same layer must preserve node separation $x(v_{i+1}) - x(v_i) \ge \text{width}(v_i) + \text{nodesep}$.
4. **Linear Time Execution**: Coordinate assignment should execute in linear $O(V + E)$ time to support interactive graph rendering.

```
   Jagged Edges (Naive Grid Placement):           Straight Vertical Edges (Brandes-Köpf):

   Layer 0:     [ Root ]                         Layer 0:        [ Root ]
                │                                                │
                └───┐                                            │
                    ▼                                            ▼
   Layer 1:       [ D1 ]                         Layer 1:      [ D1 ]
                    │                                            │
                ┌───┘                                            │
                ▼                                                ▼
   Layer 2:   [ D2 ]                             Layer 2:      [ D2 ]
                │                                                │
                └───┐                                            │
                    ▼                                            ▼
   Layer 3:       [ Target ]                     Layer 3:      [ Target ]
```

### 1.2 Comparison of Coordinate Placement Engines

| Approach | Formulation / Mechanics | Time Complexity | Strengths | Weaknesses / Why Rejected |
| :--- | :--- | :--- | :--- | :--- |
| **Uniform Grid Spacing** | $x(v) = \text{pos}(v) \cdot \text{pitch}$ | $O(V)$ | Trivial implementation | Causes severe zigzag edges for multi-layer connections; ignores node widths. |
| **Quadratic Programming (QP)** | Minimize $\sum w(e)(x(u) - x(v))^2$ s.t. separation constraints | $O(V^3)$ or $O(V^{1.5})$ | Perfectly smooth continuous layout | Computationally expensive for large graphs; matrix solver instability on dense layers. |
| **Spring Embedder Force Adjustment** | Post-process ranks with physics repulsion/attraction | $O(I \cdot (V + E))$ | Flexible constraints | Breaks strict rank alignment; alters crossing reduction ordering. |
| **Brandes-Köpf Algorithm (Chosen)** | 4 Extremal Sub-Passes $\to$ Block Graph Compaction $\to$ Median | **Linear $O(V + E)$** | **Straight multi-layer edges**; perfectly balanced subtree symmetry; strict separation guarantees | Requires 4 directional sub-passes and block compaction logic. |

### 1.3 Why Brandes-Köpf is Chosen
Dagre uses **Brandes-Köpf** because it achieves the aesthetic quality of Quadratic Programming in guaranteed linear time $O(V + E)$. By computing 4 extremal sub-pass alignments (Upper-Left, Upper-Right, Lower-Left, Lower-Right) and taking the average/median coordinate for each node, asymmetric directional bias is eliminated while retaining straight vertical alignment for long dummy-node chains.

---

## 2. Bottom-Up Mathematical Deconstruction

To calculate aesthetic real-valued horizontal coordinates $x(v)$, Brandes-Köpf decomposes placement into vertical alignment blocks, linear compaction constraints, and 4-pass median resolution.

---

### Step 2.1: Vertical Block Alignment & Pointer Arrays

#### 1. Mathematical Sub-Component Formula
Each of the 4 sub-passes aligns nodes into vertical chains called **blocks**. Blocks are maintained using two key pointer maps:
- `root[v]`: Points to the root node (topmost node) of the block containing $v$.
- `align[v]`: Points to the next node aligned below $v$ in the cyclic block chain (`align[bottom] = root`).

$$\text{root}[v] = \text{root}[u], \quad \text{align}[u] = v, \quad \text{align}[v] = \text{root}[v]$$

#### 2. Concrete Numerical Graph Example
Consider three vertically aligned nodes $A_1 \in L_0, B_1 \in L_1, C_1 \in L_2$.

1. Initial state (isolated nodes):
   $$\text{root}[A_1]=A_1, \text{align}[A_1]=A_1; \quad \text{root}[B_1]=B_1, \text{align}[B_1]=B_1; \quad \text{root}[C_1]=C_1, \text{align}[C_1]=C_1$$

2. Aligning $A_1 \to B_1 \to C_1$:
   - Align $A_1$ with $B_1$: `align[A1] = B1`, `root[B1] = A1`, `align[B1] = A1`
   - Align $B_1$ with $C_1$: `align[B1] = C1`, `root[C1] = A1`, `align[C1] = A1`

Final Array Pointers:
$$\text{root}[A_1] = A_1, \quad \text{align}[A_1] = B_1$$
$$\text{root}[B_1] = A_1, \quad \text{align}[B_1] = C_1$$
$$\text{root}[C_1] = A_1, \quad \text{align}[C_1] = A_1 \quad \text{(Cyclic loop back to root)}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
/**
 * Sub-step 2.1: Aligns node v with median predecessor u into block chain structure.
 */
function alignBlockPointers(
  uId: string,
  vId: string,
  rootMap: Map<string, string>,
  alignMap: Map<string, string>
): void {
  const rootU = rootMap.get(uId)!;
  alignMap.set(uId, vId);
  rootMap.set(vId, rootU);
  alignMap.set(vId, rootU); // Complete cyclic loop back to block root
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.1: Vertical Alignment Pointer Map (Chain A1 -> B1 -> C1)

  Layer L_0:  [ A1 ] ──► root[A1]=A1, align[A1]=B1
                │
                ▼
  Layer L_1:  [ B1 ] ──► root[B1]=A1, align[B1]=C1
                │
                ▼
  Layer L_2:  [ C1 ] ──► root[C1]=A1, align[C1]=A1  (Cyclic loop)
```

---

### Step 2.2: Block Graph Compaction & Minimum Separation Spacing

#### 1. Mathematical Sub-Component Formula
Once vertical blocks are defined, each block $B_i$ acts as a rigid unit. For two horizontally adjacent blocks $B_1$ and $B_2$, the separation constraint is:

$$x(B_2) \ge x(B_1) + \text{width}(B_1) + \text{nodesep}$$

Where $\text{width}(B_1)$ is the maximum node width within block $B_1$, and $\text{nodesep}$ is the minimum required horizontal gap (e.g. $30\text{px}$).

#### 2. Concrete Numerical Graph Example
Consider Block $B_1 = \{A_1, B_1, C_1\}$ with root placed at initial $x(B_1) = 0\text{px}$, maximum node width $\text{width}(B_1) = 100\text{px}$, and $\text{nodesep} = 30\text{px}$. Block $B_2 = \{A_2, B_2, C_2\}$ is adjacent to $B_1$:

1. Minimum coordinate for Block $B_2$:
   $$x(B_2) \ge x(B_1) + \text{width}(B_1) + \text{nodesep} = 0 + 100 + 30 = 130\text{px}$$

2. Adding canvas origin margin shift $+50\text{px}$:
   $$x(B_1) = 0 + 50 = 50\text{px}$$
   $$x(B_2) = 130 + 50 = 180\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
/**
 * Sub-step 2.2: Computes minimum coordinate for block B2 relative to block B1.
 */
function compactBlockPair(
  b1X: number,
  b1Width: number,
  nodeSep: number = 30
): number {
  return b1X + b1Width + nodeSep;
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.2: Block Graph Horizontal Compaction Spacing

            Block B1 (width = 100px)           Gap (30px)       Block B2
         ┌───────────────────────────┐     ┌──────────────┐  ┌───────────────┐
         │ [A1]                      │     │              │  │ [A2]          │
         │  │                        │     │  nodesep =   │  │  │            │
         │ [B1]                      │     │    30px      │  │ [B2]          │
         │  │                        │     │              │  │  │            │
         │ [C1]                      │     │              │  │ [C2]          │
         └───────────────────────────┘     └──────────────┘  └───────────────┘
         x(B1) = 50px                                        x(B2) = 180px
```

---

### Step 2.3: 4 Extremal Alignment Passes & Median Resolution

#### 1. Mathematical Sub-Component Formula
To balance layout asymmetry, Brandes-Köpf computes 4 extremal candidate passes ($x_{\text{UL}}, x_{\text{UR}}, x_{\text{LL}}, x_{\text{LR}}$). The final horizontal coordinate $x(v)$ is computed as the **average of the two inner medians** of the sorted candidate vector $[x_{(1)}, x_{(2)}, x_{(3)}, x_{(4)}]$:

$$x(v) = \text{Median}\left( x_{\text{UL}}(v), x_{\text{UR}}(v), x_{\text{LL}}(v), x_{\text{LR}}(v) \right) = \frac{x_{(2)} + x_{(3)}}{2}$$

#### 2. Concrete Numerical Graph Example
Consider candidate horizontal coordinates for node $v$ from the 4 passes:
- $x_{\text{UL}}(v) = 100\text{px}$
- $x_{\text{UR}}(v) = 120\text{px}$
- $x_{\text{LL}}(v) = 110\text{px}$
- $x_{\text{LR}}(v) = 130\text{px}$

Step-by-step resolution:
1. **Sort Candidates**:
   $$[x_{(1)}, x_{(2)}, x_{(3)}, x_{(4)}] = [100, 110, 120, 130]$$

2. **Extract Inner Medians**:
   $$x_{(2)} = 110\text{px}, \quad x_{(3)} = 120\text{px}$$

3. **Compute Average**:
   $$x(v) = \frac{110 + 120}{2} = 115\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
/**
 * Sub-step 2.3: Computes the final coordinate x(v) via median average of 4 passes.
 */
function resolveNodeMedianCoordinate(
  xUL: number,
  xUR: number,
  xLL: number,
  xLR: number
): number {
  const sorted = [xUL, xUR, xLL, xLR].sort((a, b) => a - b);
  return (sorted[1] + sorted[2]) / 2;
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.3: Median Coordinate Resolution Flow

  Candidate Values:  UL=100px, LL=110px, UR=120px, LR=130px
  
  Number Line:  ---[100px]-------[110px]=======│=======[120px]-------[130px]--->
                   (x_UL)        (x_LL)        │       (x_UR)        (x_LR)
                                               ▼
                                   Median x(v) = (110 + 120)/2 = 115px
```

---

---

## 3. Step-by-Step Computational Pseudocode

```typescript
type AlignmentDir = "UL" | "UR" | "LL" | "LR";

interface BlockStructure {
  root: Map<NodeId, NodeId>;
  align: Map<NodeId, NodeId>;
}

/**
 * Step 1: Vertical Alignment Pass (Constructs root and align pointers)
 */
function verticalAlignment(
  layers: NodeId[][],
  dir: AlignmentDir,
  conflicts: Set<EdgeId>
): BlockStructure {
  const root = new Map<NodeId, NodeId>();
  const align = new Map<NodeId, NodeId>();

  // Initialize self-loops: root[v] = v, align[v] = v
  for (const layer of layers) {
    for (const v of layer) {
      root.set(v, v);
      align.set(v, v);
    }
  }

  const isDown = dir === "UL" || dir === "UR";
  const isLeft = dir === "UL" || dir === "LL";

  const layerStart = isDown ? 0 : layers.length - 1;
  const layerEnd = isDown ? layers.length : -1;
  const layerStep = isDown ? 1 : -1;

  for (let l = layerStart; l !== layerEnd; l += layerStep) {
    const currentLayer = layers[l];
    let r = isLeft ? -1 : Infinity;

    for (const v of currentLayer) {
      const neighbors = getOrderedNeighbors(v, dir);
      if (neighbors.length === 0) continue;

      // Select median neighbor m
      const mIdx = isLeft ? Math.floor((neighbors.length - 1) / 2) : Math.ceil((neighbors.length - 1) / 2);
      const m = neighbors[mIdx];

      if (align.get(v) === v) { // Node v not yet aligned
        const edgeId = getEdgeId(m, v);
        const posM = getLayerPosition(m);

        const isUnconflicted = !conflicts.has(edgeId) && (isLeft ? posM > r : posM < r);
        if (isUnconflicted) {
          align.set(m, v);
          root.set(v, root.get(m)!);
          align.set(v, root.get(v)!); // Complete cyclic loop
          r = posM;
        }
      }
    }
  }

  return { root, align };
}

/**
 * Step 2: Block Graph Compaction (Computes X coordinates for aligned blocks)
 */
function horizontalCompaction(
  layers: NodeId[][],
  blocks: BlockStructure,
  dir: AlignmentDir,
  nodeWidths: Map<NodeId, number>,
  nodeSep: number
): Map<NodeId, number> {
  const { root, align } = blocks;
  const x = new Map<NodeId, number>();
  const sink = new Map<NodeId, NodeId>();
  const shift = new Map<NodeId, number>();

  // Initialize block distances
  for (const layer of layers) {
    for (const v of layer) {
      if (root.get(v) === v) {
        x.set(v, 0);
        sink.set(v, v);
        shift.set(v, Infinity);
      }
    }
  }

  // Calculate relative block positions via longest path in Block Graph DAG
  for (const layer of layers) {
    for (const v of layer) {
      if (root.get(v) === v) {
        placeBlock(v, layers, root, align, x, sink, shift, nodeWidths, nodeSep);
      }
    }
  }

  // Assign final node coordinates relative to block root
  const coords = new Map<NodeId, number>();
  for (const layer of layers) {
    for (const v of layer) {
      const r = root.get(v)!;
      coords.set(v, x.get(r)!);
    }
  }

  return coords;
}

/**
 * Step 3: Brandes-Köpf Master Function (Executes 4 passes & resolves medians)
 */
function brandesKopfLayout(
  layers: NodeId[][],
  nodeWidths: Map<NodeId, number>,
  nodeSep: number = 150
): Map<NodeId, number> {
  const conflicts = markInnerSegmentConflicts(layers);

  const passes: AlignmentDir[] = ["UL", "UR", "LL", "LR"];
  const passCoords: Map<AlignmentDir, Map<NodeId, number>> = new Map();

  // Run 4 extremal alignment passes
  for (const dir of passes) {
    const blocks = verticalAlignment(layers, dir, conflicts);
    const coords = horizontalCompaction(layers, blocks, dir, nodeWidths, nodeSep);
    passCoords.set(dir, coords);
  }

  // Align all candidate coordinates to common origin
  normalizeCandidateOrigins(passCoords);

  // Resolve final coordinates via median formula
  const finalX = new Map<NodeId, number>();
  const allNodes = layers.flat();

  for (const v of allNodes) {
    const candidates = [
      passCoords.get("UL")!.get(v)!,
      passCoords.get("UR")!.get(v)!,
      passCoords.get("LL")!.get(v)!,
      passCoords.get("LR")!.get(v)!
    ].sort((a, b) => a - b);

    // Median of 4 elements: Average of middle two candidates
    const medianX = (candidates[1] + candidates[2]) / 2;
    finalX.set(v, medianX);
  }

  return finalX;
}
```

---

## 4. Visual ASCII Schematics

### 4.1 The 4 Extremal Alignment Passes

```
   1. Upper-Left (UL) Alignment              2. Upper-Right (UR) Alignment
   (Sweep: Top→Bottom, Align: Left Median)   (Sweep: Top→Bottom, Align: Right Median)
           [A1]     [A2]                             [A1]     [A2]
           │        │                                   \     │
           │        │                                    \    │
           [B1]     [B2]                             [B1] \   [B2]
           │        │                                │     \  │
           │        │                                │      \ │
           [C1]     [C2]                             [C1]     [C2]

   3. Lower-Left (LL) Alignment              4. Lower-Right (LR) Alignment
   (Sweep: Bottom→Top, Align: Left Median)   (Sweep: Bottom→Top, Align: Right Median)
           [A1]     [A2]                             [A1]     [A2]
           │      /  │                               │        │
           │     /   │                               │        │
           [B1] /   [B2]                             [B1]     [B2]
           │   /     │                               │        │
           │  /      │                               │        │
           [C1]     [C2]                             [C1]     [C2]
```

### 4.2 Block Graph Construction & Horizontal Compaction

```
                Node Alignment Blocks                   Compacted Block Graph
             
                  ┌──────────┐                          ┌────────────────────┐
                  │ Node A1  │                          │      Block 1       │
                  │    │     │                          │ (A1 ─ B1 ─ C1)     │
                  │ Node B1  │                          └─────────┬──────────┘
                  │    │     │                                    │
                  │ Node C1  │                                    │ min_sep = 150px
                  └──────────┘                                    ▼
                                                        ┌────────────────────┐
                  ┌──────────┐                          │      Block 2       │
                  │ Node A2  │                          │ (A2 ─ B2 ─ C2)     │
                  │    │     │                          └────────────────────┘
                  │ Node B2  │
                  │    │     │
                  │ Node C2  │
                  └──────────┘
```

### 4.3 Median Coordinate Resolution Flow

```
        UL Candidate:  x_UL(v) = 120 ──────────┐
        UR Candidate:  x_UR(v) = 280 ──────────┼──►  Sorted: [120, 180, 220, 280]
        LL Candidate:  x_LL(v) = 180 ──────────┤         Median = (180 + 220) / 2 = 200
        LR Candidate:  x_LR(v) = 220 ──────────┘
                                                           │
                                                           ▼
                                               Final Coordinate x(v) = 200
```

---

## 5. Codebase Reference Map

- [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout` layout entry point executing Brandes-Köpf coordinate placement.
- [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) — Dispatcher case routing `"top-down-dagre"`.
