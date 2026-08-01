//! # PAVA Isotonic Regression Layer Center Projection
//!
//! Implements layer-level horizontal coordinate projection using the Pool Adjacent Violators Algorithm (PAVA).
//!
//! ## Mathematical Formulation & Principles
//!
//! Given a ordered rank sequence of $k$ nodes $(v_0, v_1, \dots, v_{k-1})$ in a layer:
//! - Each node $i$ has a desired horizontal coordinate $a_i = \text{desired\_x}_i - s_i$ (shifted to eliminate minimum gaps),
//!   a node weight $w_i > 0$, and width $W_i$.
//! - Minimum separation requirements $d_i$ between adjacent nodes $v_i$ and $v_{i+1}$ are defined by:
//!   $$d_i = \frac{W_i + W_{i+1}}{2} + \max(g(i), g(i+1))$$
//!   where $g(i)$ is the effective node gap for node $v_i$.
//!
//! ### Reduction to Monotonic Isotonic Regression
//! Cumulative separation offsets $s_i$ are computed recursively:
//! $$s_0 = 0, \quad s_{i+1} = s_i + d_i$$
//! Subtraction of $s_i$ converts the separation-constrained quadratic optimization problem:
//! $$\min_{\{X_i\}} \sum_{i=0}^{k-1} w_i (X_i - \text{desired\_x}_i)^2 \quad \text{s.t. } X_{i+1} - X_i \ge d_i$$
//! into standard unconstrained monotonic isotonic regression over variable $z_i = X_i - s_i$:
//! $$\min_{\{z_i\}} \sum_{i=0}^{k-1} w_i (z_i - a_i)^2 \quad \text{s.t. } z_0 \le z_1 \le \dots \le z_{k-1}$$
//!
//! ### Pool Adjacent Violators Algorithm (PAVA)
//! PAVA maintains a stack of contiguous blocks $B = (W_B, S_B, v_B, |B|)$, where:
//! - $W_B = \sum_{j \in B} w_j$ is the total block weight.
//! - $S_B = \sum_{j \in B} w_j a_j$ is the weighted sum of target positions.
//! - $v_B = \frac{S_B}{W_B}$ is the optimal block center value (weighted mean).
//! - $|B|$ is the number of nodes merged inside block $B$.
//!
//! #### Pooling Condition
//! When a new element (or block) $B_{\text{new}}$ is pushed onto the stack, the algorithm checks
//! if the top of the stack $B_{\text{top}}$ violates monotonicity ($v_{B_{\text{top}}} > v_{B_{\text{new}}}$).
//! If a violation occurs ("adjacent violators"):
//! 1. $B_{\text{top}}$ is popped from the stack.
//! 2. It is merged into $B_{\text{new}}$:
//!    $$W_{\text{merged}} = W_{B_{\text{top}}} + W_{B_{\text{new}}}$$
//!    $$S_{\text{merged}} = S_{B_{\text{top}}} + S_{B_{\text{new}}}$$
//!    $$v_{\text{merged}} = \frac{S_{\text{merged}}}{W_{\text{merged}}}$$
//!    $$|B_{\text{merged}}| = |B_{\text{top}}| + |B_{\text{new}}|$$
//! 3. The check repeats recursively against the new stack top until monotonicity $v_{B_{\text{top}}} \le v_{B_{\text{merged}}}$ holds.
//!
//! ### Unpacking & Final Coordinate Assignment
//! Once all elements are processed into monotonic blocks, each node in block $B$ receives value $z_i = v_B$.
//! The final center coordinate is computed by restoring the cumulative separation offset:
//! $$X_i = z_i + s_i$$
//! This strictly guarantees $X_{i+1} - X_i = (z_{i+1} - z_i) + (s_{i+1} - s_i) \ge 0 + d_i = d_i$.

use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::types::{LayerNode, SpacingOverrides};
use super::spacing_demand_resolver::get_effective_node_gap;

/// Projects center X coordinates of nodes within a single layer using PAVA isotonic regression.
///
/// Ensures all node separation constraints are strictly satisfied while minimizing weighted quadratic
/// distance from the desired positions.
pub fn project_layer_centers(
    layer: &[LayerNode],
    desired_x_map: &HashMap<String, f64>,
    weights_map: &HashMap<String, f64>,
    rank: usize,
    config: &CustomLayoutConfig,
    spacing_overrides: Option<&SpacingOverrides>,
) -> HashMap<String, f64> {
    let mut result = HashMap::new();
    let k = layer.len();
    if k == 0 {
        return result;
    }
    if k == 1 {
        let item = &layer[0];
        if let Some(&des_x) = desired_x_map.get(&item.id) {
            result.insert(item.id.clone(), des_x);
        }
        return result;
    }

    // 1. Compute cumulative separation offsets s_i
    let mut s = vec![0.0; k];
    for i in 0..k - 1 {
        let curr = &layer[i];
        let next = &layer[i + 1];
        let curr_w = curr.width;
        let next_w = next.width;
        let gap = get_effective_node_gap(rank, curr, spacing_overrides, config)
            .max(get_effective_node_gap(rank, next, spacing_overrides, config));
        let d = (curr_w + next_w) / 2.0 + gap;
        s[i + 1] = s[i] + d;
    }

    // 2. Prepare a_i = desiredX_i - s_i and w_i = weight_i
    let mut a = vec![0.0; k];
    let mut w = vec![0.0; k];
    for i in 0..k {
        let item = &layer[i];
        let des_x = desired_x_map.get(&item.id).copied().unwrap_or(0.0);
        a[i] = des_x - s[i];
        w[i] = weights_map.get(&item.id).copied().unwrap_or(1.0);
    }

    // 3. Pool Adjacent Violators Algorithm (PAVA)
    #[derive(Debug, Clone)]
    struct Block {
        weight: f64,
        sum_wa: f64,
        value: f64,
        size: usize,
    }

    let mut stack: Vec<Block> = Vec::new();

    for i in 0..k {
        let mut b = Block {
            weight: w[i],
            sum_wa: w[i] * a[i],
            value: a[i],
            size: 1,
        };

        // Recursive pooling while top block value exceeds current block value (order violation)
        while let Some(top) = stack.last() {
            if top.value > b.value {
                let top = stack.pop().unwrap();
                let combined_weight = top.weight + b.weight;
                let combined_sum_wa = top.sum_wa + b.sum_wa;
                b = Block {
                    weight: combined_weight,
                    sum_wa: combined_sum_wa,
                    value: combined_sum_wa / combined_weight,
                    size: top.size + b.size,
                };
            } else {
                break;
            }
        }

        stack.push(b);
    }

    // 4. Unpack stack to obtain z_i and compute final X_i = z_i + s_i
    let mut index = 0;
    for block in stack {
        for _ in 0..block.size {
            let z = block.value;
            let final_x = z + s[index];
            result.insert(layer[index].id.clone(), final_x);
            index += 1;
        }
    }

    result
}
