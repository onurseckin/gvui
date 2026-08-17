//! Native layout audit harness.
//!
//! Runs every engine over every dataset in `public/data/graphs/` and reports timing, quality
//! metrics, constraint violations and determinism. This is the gate referenced by
//! `docs/concepts/quality-model.md` and `docs/engine/11-emit-and-quality.md`.
//!
//! ```sh
//! cargo run --release --manifest-path crates/gvui/Cargo.toml --example audit
//! cargo run --release --manifest-path crates/gvui/Cargo.toml --example audit -- --engine layered
//! ```
//!
//! Exit code is non-zero when any fixture has a constraint violation or exceeds the time budget,
//! so it can be wired into CI directly.

use gvui::config::{CustomLayoutConfig, Direction, EngineMode};
use gvui::types::{CustomLayoutResult, NormalizedEdge, NormalizedNode};

/// Per-fixture wall-clock ceiling in native release. WASM is slower; this is the native gate.
const TIME_BUDGET_MS: f64 = 50.0;

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

/// Character-width estimate standing in for the host's canvas measurer, so the harness exercises
/// the same "boxes are supplied by the host" path the browser uses.
fn estimate_node_box(name: &str) -> (f64, f64) {
    let w = (name.chars().count() as f64 * 8.5 + 96.0).clamp(120.0, 420.0);
    (w, 76.0)
}

fn estimate_label_box(label: &str) -> (f64, f64) {
    let w = (label.chars().count() as f64 * 7.0 + 24.0).clamp(60.0, 220.0);
    (w, 28.0)
}

fn load(path: &std::path::Path) -> (Vec<NormalizedNode>, Vec<NormalizedEdge>) {
    let text = std::fs::read_to_string(path).expect("dataset readable");
    let ds: Dataset = serde_json::from_str(&text).expect("dataset parses");

    let nodes = ds
        .nodes
        .iter()
        .map(|n| {
            let label = n.name.clone().unwrap_or_else(|| n.id.clone());
            let (width, height) = estimate_node_box(&label);
            NormalizedNode {
                id: n.id.clone(),
                label: Some(label),
                width,
                height,
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
                Some(l) if !l.trim().is_empty() => {
                    let (w, h) = estimate_label_box(l);
                    (Some(w), Some(h))
                }
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

/// FNV-1a over the emitted geometry. Two runs must agree exactly.
fn fingerprint(r: &CustomLayoutResult) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    let mut feed = |s: &str| {
        for b in s.bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
    };
    let mut nodes: Vec<&gvui::types::PositionedNode> = r.nodes.iter().collect();
    nodes.sort_by(|a, b| a.id.cmp(&b.id));
    for n in nodes {
        feed(&format!("{}:{:.3},{:.3};", n.id, n.x, n.y));
    }
    let mut edges: Vec<&gvui::types::RoutedPath> = r.edges.iter().collect();
    edges.sort_by(|a, b| a.edge_id.cmp(&b.edge_id));
    for e in edges {
        feed(&e.edge_id);
        for p in &e.points {
            feed(&format!("{:.3},{:.3}|", p.x, p.y));
        }
    }
    h
}

struct Row {
    name: String,
    engine: &'static str,
    n: usize,
    e: usize,
    ms: f64,
    ranks: usize,
    crossings: usize,
    geo_crossings: usize,
    lane_depth: usize,
    bends: usize,
    straight: f64,
    leaders: usize,
    merged: usize,
    /// Share of ports attached to a Left/Right face, as a percentage.
    ///
    /// Measured in the **emitted** frame, so it is only comparable within one direction: a
    /// left-right drawing flows along the x axis, which makes Left/Right its flow faces and drives
    /// this number high by construction. The row that answers "does the engine use the sides" is
    /// the `layered` (top-down) one.
    side_share: f64,
    errors: usize,
    valid: bool,
    deterministic: bool,
    /// Counters the layered engines guarantee are zero.
    strict_violations: usize,
    strict_detail: String,
}

fn run(
    name: &str,
    engine_label: &'static str,
    mode: EngineMode,
    cfg: &CustomLayoutConfig,
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
) -> Row {
    let t = std::time::Instant::now();
    let res = gvui::compute_layout(nodes, edges, cfg, mode);
    let ms = t.elapsed().as_secs_f64() * 1000.0;

    let again = gvui::compute_layout(nodes, edges, cfg, mode);
    let deterministic = fingerprint(&res) == fingerprint(&again);

    let errors = res
        .validation
        .diagnostics
        .iter()
        .filter(|d| d.severity == "error")
        .count();

    let m = &res.validation.metrics;
    let strict: Vec<(&str, usize)> = vec![
        ("nodeNodeOverlaps", m.node_node_overlaps),
        ("edgeNodePenetrations", m.edge_node_penetrations),
        ("badgeNodeOverlaps", m.badge_node_overlaps),
        ("badgeBadgeOverlaps", m.badge_badge_overlaps),
        ("badgeEdgePenetrations", m.badge_edge_penetrations),
        ("unresolvedRouteCount", m.unresolved_route_count),
        ("unresolvedBadgeCount", m.unresolved_badge_count),
        ("collinearEdgeOverlaps", m.collinear_edge_overlaps),
    ];
    let strict_violations: usize = strict.iter().filter(|(_, v)| *v != 0).count();
    let strict_detail = strict
        .iter()
        .filter(|(_, v)| *v != 0)
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(" ");

    Row {
        name: name.to_string(),
        engine: engine_label,
        strict_violations,
        strict_detail,
        n: res.nodes.len(),
        e: res.edges.len(),
        ms,
        ranks: res.validation.metrics.rank_count,
        crossings: res.validation.metrics.crossings,
        geo_crossings: res.validation.metrics.geometric_crossings,
        lane_depth: res.validation.metrics.lane_depth_max,
        bends: res.validation.metrics.bend_count,
        straight: res.validation.metrics.straight_chain_ratio,
        leaders: res.validation.metrics.leader_count,
        merged: res.validation.metrics.collinear_edge_overlaps,
        side_share: {
            let mut vertical = 0usize;
            let mut total = 0usize;
            for e in &res.edges {
                for p in [&e.source_port, &e.target_port] {
                    total += 1;
                    if matches!(p.side, gvui::types::Side::Left | gvui::types::Side::Right) {
                        vertical += 1;
                    }
                }
            }
            100.0 * vertical as f64 / total.max(1) as f64
        },
        errors,
        valid: res.validation.is_valid,
        deterministic,
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let only_engine = args
        .iter()
        .position(|a| a == "--engine")
        .and_then(|i| args.get(i + 1))
        .cloned();
    let verbose = args.iter().any(|a| a == "--verbose");

    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../public/data/graphs")
        .canonicalize()
        .expect("dataset directory exists");

    let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(&dir)
        .expect("dataset directory readable")
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    files.sort();

    let engines: Vec<(&'static str, EngineMode, Direction)> = vec![
        ("layered", EngineMode::Layered, Direction::TopDown),
        ("left-right", EngineMode::Layered, Direction::LeftRight),
        ("bottom-up", EngineMode::Layered, Direction::BottomUp),
        ("radial", EngineMode::Radial, Direction::TopDown),
    ];

    let mut rows: Vec<Row> = Vec::new();

    for f in &files {
        let (nodes, edges) = load(f);
        let name = f
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        for (label, mode, dir) in &engines {
            if let Some(ref want) = only_engine {
                if want != label {
                    continue;
                }
            }
            let cfg = CustomLayoutConfig {
                direction: *dir,
                ..Default::default()
            };
            rows.push(run(&name, label, *mode, &cfg, &nodes, &edges));
        }
    }

    println!();
    println!(
        "{:<30} {:<11} {:>4} {:>4} {:>9} {:>6} {:>6} {:>6} {:>5} {:>6} {:>7} {:>4} {:>4} {:>6} {:>5} {:>5}",
        "dataset", "engine", "N", "E", "ms", "ranks", "cross", "geo", "lanes", "bends", "straight", "ldr",
        "mrg", "side%", "valid", "det"
    );
    println!("{}", "-".repeat(134));

    let mut failures: Vec<String> = Vec::new();
    let mut slowest: f64 = 0.0;

    for r in &rows {
        println!(
            "{:<30} {:<11} {:>4} {:>4} {:>9.2} {:>6} {:>6} {:>6} {:>5} {:>6} {:>7.2} {:>4} {:>4} {:>5.1} {:>5} {:>5}",
            r.name,
            r.engine,
            r.n,
            r.e,
            r.ms,
            r.ranks,
            r.crossings,
            r.geo_crossings,
            r.lane_depth,
            r.bends,
            r.straight,
            r.leaders,
            r.merged,
            r.side_share,
            if r.valid { "yes" } else { "NO" },
            if r.deterministic { "yes" } else { "NO" }
        );
        slowest = slowest.max(r.ms);
        if !r.valid || r.errors > 0 {
            failures.push(format!(
                "{}/{}: {} constraint error(s)",
                r.name, r.engine, r.errors
            ));
        }
        // The layered engines guarantee these by construction (Phase 6 reserves a routing lane per
        // segment; the label item reserves badge area), so a non-zero counter is a bug even though
        // it never reaches `is_valid`. The straight-line engines make no such promise and report
        // the same counters as best-effort quality metrics — see `runLayoutAudit.ts` for the same
        // policy on the TypeScript side. Checking only `is_valid` here is what let this class of
        // defect through on the first pass.
        if (r.engine == "layered" || r.engine == "left-right") && r.strict_violations > 0 {
            failures.push(format!(
                "{}/{}: {} guaranteed-constraint violation(s) ({})",
                r.name, r.engine, r.strict_violations, r.strict_detail
            ));
        }
        if !r.deterministic {
            failures.push(format!("{}/{}: NON-DETERMINISTIC", r.name, r.engine));
        }
        if r.ms > TIME_BUDGET_MS {
            failures.push(format!(
                "{}/{}: {:.1}ms exceeds {:.0}ms budget",
                r.name, r.engine, r.ms, TIME_BUDGET_MS
            ));
        }
    }

    if verbose {
        println!("\n--- diagnostics ---");
        for f in &files {
            let (nodes, edges) = load(f);
            let cfg = CustomLayoutConfig::default();
            let res = gvui::compute_layout(&nodes, &edges, &cfg, EngineMode::Layered);
            let name = f
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            for d in &res.validation.diagnostics {
                println!("  [{}] {} {}: {}", name, d.severity, d.code, d.message);
            }
        }
    }

    let layered_rows: Vec<&Row> = rows.iter().filter(|r| r.engine == "layered").collect();
    println!();
    println!(
        "layered totals: {} geometric crossings, {} combinatorial, {} bends, {} merged edge pairs",
        layered_rows.iter().map(|r| r.geo_crossings).sum::<usize>(),
        layered_rows.iter().map(|r| r.crossings).sum::<usize>(),
        layered_rows.iter().map(|r| r.bends).sum::<usize>(),
        layered_rows.iter().map(|r| r.merged).sum::<usize>(),
    );
    println!(
        "slowest fixture: {:.2} ms (budget {:.0} ms)",
        slowest, TIME_BUDGET_MS
    );

    if failures.is_empty() {
        println!(
            "AUDIT PASSED: {} fixture/engine combinations clean\n",
            rows.len()
        );
    } else {
        println!("AUDIT FAILED ({} problems):", failures.len());
        for f in &failures {
            println!("  - {}", f);
        }
        println!();
        std::process::exit(1);
    }
}
