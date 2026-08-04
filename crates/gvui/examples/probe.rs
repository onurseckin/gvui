//! Invariant probe: checks the Layered contract at each stage of the pipeline.
//!
//! Temporary diagnostic aid. Verifies, for every dataset:
//!  - every item's `order` equals its offset within its rank slice
//!  - every `down` arc connects rank r to rank r+1 exactly
//!  - the same after ordering runs

use gvui::config::CustomLayoutConfig;
use gvui::types::{Layered, NormalizedEdge, NormalizedNode};

#[derive(serde::Deserialize)]
struct DsNode {
    id: String,
    name: Option<String>,
}
#[derive(serde::Deserialize)]
struct DsEdge {
    id: Option<String>,
    source: String,
    target: String,
    label: Option<String>,
    #[serde(rename = "isCycle")]
    is_cycle: Option<bool>,
}
#[derive(serde::Deserialize)]
struct Dataset {
    nodes: Vec<DsNode>,
    edges: Vec<DsEdge>,
}

fn load(p: &std::path::Path) -> (Vec<NormalizedNode>, Vec<NormalizedEdge>) {
    let ds: Dataset = serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap();
    let nodes = ds
        .nodes
        .iter()
        .map(|n| {
            let label = n.name.clone().unwrap_or_else(|| n.id.clone());
            let w = (label.chars().count() as f64 * 8.5 + 96.0).clamp(120.0, 420.0);
            NormalizedNode {
                id: n.id.clone(),
                label: Some(label),
                width: w,
                height: 76.0,
                rank: None,
                group: None,
            }
        })
        .collect();
    let edges = ds
        .edges
        .iter()
        .enumerate()
        .map(|(i, e)| {
            let (lw, lh) = match e.label.as_deref() {
                Some(l) if !l.trim().is_empty() => (
                    Some((l.chars().count() as f64 * 7.0 + 24.0).clamp(60.0, 220.0)),
                    Some(28.0),
                ),
                _ => (None, None),
            };
            NormalizedEdge {
                id: e.id.clone().unwrap_or_else(|| format!("e{}", i)),
                source: e.source.clone(),
                target: e.target.clone(),
                label: e.label.clone(),
                is_cycle: e.is_cycle,
                layout_role: None,
                weight: None,
                min_len: None,
                label_width: lw,
                label_height: lh,
            }
        })
        .collect();
    (nodes, edges)
}

fn check(tag: &str, name: &str, l: &Layered) -> usize {
    let mut problems = 0;

    for (r, range) in l.rank_ranges.iter().enumerate() {
        for (offset, gi) in (range.start..range.end).enumerate() {
            let it = &l.items[gi as usize];
            if it.order as usize != offset {
                println!(
                    "  [{tag}/{name}] ORDER MISMATCH rank {r} slot {offset}: item {gi} has order={} (kind {:?})",
                    it.order, it.kind
                );
                problems += 1;
            }
            if it.rank as usize != r {
                println!(
                    "  [{tag}/{name}] RANK MISMATCH item {gi}: stored rank {} but sits in rank {r}",
                    it.rank
                );
                problems += 1;
            }
        }
    }

    for gi in 0..l.items.len() as u32 {
        if (gi as usize) + 1 >= l.down.offsets.len() {
            continue;
        }
        let src_rank = l.items[gi as usize].rank;
        for &t in l.down.neighbours(gi) {
            let Some(tgt) = l.items.get(t as usize) else {
                println!("  [{tag}/{name}] DANGLING down arc {gi} -> {t}");
                problems += 1;
                continue;
            };
            if tgt.rank != src_rank + 1 {
                println!(
                    "  [{tag}/{name}] BAD down arc {gi}(rank {src_rank}) -> {t}(rank {}) — not adjacent",
                    tgt.rank
                );
                problems += 1;
            }
            let range = &l.rank_ranges[tgt.rank as usize];
            if tgt.order as usize >= range.len() {
                println!(
                    "  [{tag}/{name}] OUT OF RANGE order: item {t} order={} but rank {} has {} slots",
                    tgt.order,
                    tgt.rank,
                    range.len()
                );
                problems += 1;
            }
        }
    }
    problems
}

fn main() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../public/data/graphs")
        .canonicalize()
        .unwrap();
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    files.sort();

    let cfg = CustomLayoutConfig::default();
    let mut total = 0;

    for f in &files {
        let name = f.file_stem().unwrap().to_string_lossy().to_string();
        let (nodes, edges) = load(f);
        let ir = gvui::build_graph_ir(&nodes, &edges, &cfg);
        let st = gvui::analyze_structure(&ir);

        // Rank diagnostics: isolate the ranker from the balancer, and report the raw span.
        let mut no_balance = cfg.clone();
        no_balance.balance_ranks = false;
        let r_nb = gvui::assign_ranks(&ir, &st, &no_balance);
        let mut lp = cfg.clone();
        lp.ranker = gvui::config::Ranker::LongestPath;
        lp.balance_ranks = false;
        let r_lp = gvui::assign_ranks(&ir, &st, &lp);
        let max_minlen = ir.edges.iter().map(|e| e.min_len).max().unwrap_or(0);
        let feedback = st
            .roles
            .iter()
            .filter(|r| **r == gvui::types::EdgeRole::Feedback)
            .count();

        let ranks = gvui::assign_ranks(&ir, &st, &cfg);
        println!(
            "  RANKS: simplex+balance={} simplex_only={} longest_path={} | max_min_len={} feedback={} is_dag={}",
            ranks.max_rank + 1,
            r_nb.max_rank + 1,
            r_lp.max_rank + 1,
            max_minlen,
            feedback,
            st.is_dag
        );

        let mut layered = gvui::build_layered(&ir, &st, &ranks, &cfg);

        println!(
            "{name}: {} items, {} ranks, {} chains, {} flats",
            layered.items.len(),
            layered.rank_count(),
            layered.chains.len(),
            layered.flat_edges.len()
        );
        total += check("after-build", &name, &layered);

        let outcome = gvui::order_layers(&mut layered, &cfg);
        println!(
            "  ordered: crossings={} sweeps={} seeds={}",
            outcome.crossings, outcome.sweeps_executed, outcome.seeds_evaluated
        );
        total += check("after-order", &name, &layered);
    }

    println!("\ntotal invariant problems: {total}");
}
