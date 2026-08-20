# Layout Audit Framework

## 1. Overview & Verification Matrix

The GVUI Layout Audit Framework (`scripts/runLayoutAudit.ts` and `crates/gvui/examples/audit.rs`) is the core regression gate enforcing mathematical correctness, performance limits, and zero-tolerance visual quality invariants.

The test suite evaluates an exhaustive matrix across engines, flow directions, and graph topologies:

- **2 Layout Engines**: `layered` (hierarchical Sugiyama) and `radial` (concentric orbital BFS).
- **4 Cardinal Flow Directions**: `top-down`, `bottom-up`, `left-right`, `right-left`.
- **27 Graph Topologies**: 26 synthetic stress-test scenarios (`customLayoutScenarios.ts`) + 1 real-world graph fixture (`public/data/graphs/fixture-demo.json`). `public/data/graphs/manifest.json` is the generated index naming that one fixture, not a dataset itself, and `loadPublicGraphFixtures` in `runLayoutAudit.ts` excludes it by filename for exactly that reason.
- **Total Test Configurations**: $2 \times 4 \times 27 = 216$ layout executions per audit run — confirmed by running `bun scripts/runLayoutAudit.ts`, whose summary line reports `216 fixture/mode runs across 27 fixtures`.

```bash
# Run the complete TypeScript & WASM layout audit
bun run audit

# Run the native Rust release audit example
cargo run --release --manifest-path crates/gvui/Cargo.toml --example audit
```

---

## 2. Zero-Tolerance Quality Invariants

The audit enforces hard zero-tolerance build gates. A non-zero count on any of the following 8 geometric constraint fields causes immediate failure:

| Invariant Field         | Limit | Description                                                              |
| ----------------------- | :---: | ------------------------------------------------------------------------ |
| `nodeNodeOverlaps`      | **0** | No two node bounding boxes may overlap in 2D coordinate space.           |
| `edgeNodePenetrations`  | **0** | No edge route may penetrate the interior of a non-endpoint node box.     |
| `badgeNodeOverlaps`     | **0** | No edge label/badge box may intersect any node bounding box.             |
| `badgeBadgeOverlaps`    | **0** | No edge badge box may collide with an adjacent edge badge.               |
| `badgeEdgePenetrations` | **0** | No non-parent edge polyline may pierce through an edge badge.            |
| `unresolvedRouteCount`  | **0** | 100% of graph edges must have a valid routed polyline path.              |
| `unresolvedBadgeCount`  | **0** | 100% of edge badges must be safely positioned without clipping.          |
| `collinearEdgeOverlaps` | **0** | No parallel edge segments may merge or share overlapping channel tracks. |

---

## 3. Performance & Resource Bounds

In addition to geometric invariants, the audit checks:

- **Execution Time Budget**: $\le 250\text{ ms}$ per layout execution in WASM ($\le 50\text{ ms}$ in native Rust release).
- **Global Leader Line Budget**: Cumulative count of off-edge leader lines across all 216 configurations must not exceed **2**.
- **Memory Footprint Tracking**: Measures heap and RSS memory before and after fixture batches to ensure zero memory leaks.
- **Determinism Assertion**: Repeated runs of every fixture must produce bit-for-bit identical layout hashes.
