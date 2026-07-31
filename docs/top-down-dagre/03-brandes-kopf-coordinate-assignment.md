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
```text
ALGORITHM ALIGN_BLOCK_POINTERS(u_id, v_id, root_map, align_map)
    INPUT: node u ID, node v ID, root map, align map
    OUTPUT: updates block alignment pointers in-place

    root_u <- root_map[u_id]
    align_map[u_id] <- v_id
    root_map[v_id] <- root_u
    align_map[v_id] <- root_u // Complete cyclic loop back to block root
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
```text
ALGORITHM COMPACT_BLOCK_PAIR(b1_x, b1_width, node_sep = 30)
    INPUT: block B1 position b1_x, block B1 width b1_width, minimum separation node_sep
    OUTPUT: minimum x coordinate for adjacent block B2

    RETURN b1_x + b1_width + node_sep
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
```text
ALGORITHM RESOLVE_NODE_MEDIAN_COORDINATE(x_UL, x_UR, x_LL, x_LR)
    INPUT: coordinate candidate from 4 extremal passes
    OUTPUT: final resolved horizontal coordinate

    candidates <- LIST(x_UL, x_UR, x_LL, x_LR)
    SORT(candidates) IN ASCENDING ORDER

    // Average of middle two candidate values
    RETURN (candidates[1] + candidates[2]) / 2
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

```text
ALGORITHM VERTICAL_ALIGNMENT(layers, direction, conflicts)
    INPUT: matrix of rank layers, alignment direction ("UL", "UR", "LL", "LR"), set of conflicting inner edges
    OUTPUT: block root map, block align map

    root <- empty map
    align <- empty map

    FOR EACH layer IN layers:
        FOR EACH v IN layer:
            root[v] <- v
            align[v] <- v
        END FOR
    END FOR

    is_down <- (direction = "UL" OR direction = "UR")
    is_left <- (direction = "UL" OR direction = "LL")

    layer_start <- IF is_down THEN 0 ELSE LENGTH(layers) - 1
    layer_end   <- IF is_down THEN LENGTH(layers) ELSE -1
    layer_step  <- IF is_down THEN 1 ELSE -1

    FOR l FROM layer_start TO layer_end - layer_step STEP layer_step:
        current_layer <- layers[l]
        r <- IF is_left THEN -1 ELSE INFINITY

        FOR EACH v IN current_layer:
            neighbors <- GET_ORDERED_NEIGHBORS(v, direction)
            IF neighbors IS EMPTY THEN CONTINUE

            m_idx <- IF is_left THEN FLOOR((LENGTH(neighbors) - 1) / 2) ELSE CEIL((LENGTH(neighbors) - 1) / 2)
            m <- neighbors[m_idx]

            IF align[v] = v THEN // Node v not yet aligned
                edge_id <- GET_EDGE_ID(m, v)
                pos_m <- GET_LAYER_POSITION(m)

                is_unconflicted <- NOT (edge_id IN conflicts) AND (IF is_left THEN pos_m > r ELSE pos_m < r)
                IF is_unconflicted THEN
                    align[m] <- v
                    root[v] <- root[m]
                    align[v] <- root[v] // Complete cyclic loop
                    r <- pos_m
                END IF
            END IF
        END FOR
    END FOR

    RETURN root, align


ALGORITHM HORIZONTAL_COMPACTION(layers, blocks, direction, node_widths, node_sep)
    INPUT: rank layers, block structure (root, align maps), direction, node width map, minimum node separation
    OUTPUT: map of horizontal X-coordinates per node

    root <- blocks.root
    align <- blocks.align
    x <- empty map
    sink <- empty map
    shift <- empty map

    // Initialize block root positions
    FOR EACH layer IN layers:
        FOR EACH v IN layer:
            IF root[v] = v THEN
                x[v] <- 0
                sink[v] <- v
                shift[v] <- INFINITY
            END IF
        END FOR
    END FOR

    // Calculate relative block positions via longest path in Block Graph
    FOR EACH layer IN layers:
        FOR EACH v IN layer:
            IF root[v] = v THEN
                PLACE_BLOCK(v, layers, root, align, x, sink, shift, node_widths, node_sep)
            END IF
        END FOR
    END FOR

    // Assign node coordinates relative to block root
    coords <- empty map
    FOR EACH layer IN layers:
        FOR EACH v IN layer:
            r <- root[v]
            coords[v] <- x[r]
        END FOR
    END FOR

    RETURN coords


ALGORITHM BRANDES_KOPF_LAYOUT(layers, node_widths, node_sep = 150)
    INPUT: matrix of rank layers, node width map, minimum node separation (default 150)
    OUTPUT: map of final horizontal X-coordinates per node

    conflicts <- MARK_INNER_SEGMENT_CONFLICTS(layers)
    passes <- ["UL", "UR", "LL", "LR"]
    pass_coords <- empty map

    // Run 4 extremal alignment passes
    FOR EACH dir IN passes:
        root, align <- VERTICAL_ALIGNMENT(layers, dir, conflicts)
        coords <- HORIZONTAL_COMPACTION(layers, { root, align }, dir, node_widths, node_sep)
        pass_coords[dir] <- coords
    END FOR

    NORMALIZE_CANDIDATE_ORIGINS(pass_coords)

    final_x <- empty map
    all_nodes <- FLAT_LIST(layers)

    FOR EACH v IN all_nodes:
        candidates <- [
            pass_coords["UL"][v],
            pass_coords["UR"][v],
            pass_coords["LL"][v],
            pass_coords["LR"][v]
        ]
        SORT(candidates) IN ASCENDING ORDER

        // Average of middle two candidates
        final_x[v] <- (candidates[1] + candidates[2]) / 2
    END FOR

    RETURN final_x
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
