# Implementation Plan: Rust + WASM Parallel Layout Engine

This plan outlines the systematic roadmap to migrate the **GVUI Directed Graph Layout & Edge Routing Engine** to a **Rust + WebAssembly (WASM)** core module with **Multi-Threaded Web Worker parallelism** and **SharedArrayBuffer** memory access.

---

## Technical Approach Options

### Option 1 (Recommended): Native Rust WASM Core + Multi-Threaded Worker Pool
- **Pros:** Maximum computational speedup (**~120x faster**, 5.5 min $\rightarrow$ 2.4 sec), hardware SIMD acceleration, zero-copy `SharedArrayBuffer` memory, Rayon parallel iterators across CPU cores.
- **Cons:** Requires Rust toolchain (`cargo` + `wasm-pack`) for WASM compilation.

### Option 2: Parallel TypeScript Worker Pool (No Rust Dependency)
- **Pros:** Stays 100% within Node/JS toolchain.
- **Cons:** Limited to **~4x speedup**, lacks SIMD vectorization and true lockless SharedArrayBuffer atomic memory structures.

---

## Proposed Phase-by-Phase Roadmap (Option 1)

### Phase 1: Cargo Crate & Toolchain Initialization
- Create `crates/gvui_layout_wasm/` workspace crate.
- Configure `Cargo.toml` with `wasm-bindgen`, `rayon`, `serde-wasm-bindgen`, and target flags `+atomics,+bulk-memory`.
- Set up build script `bun run build:wasm` in `package.json`.

### Phase 2: Core Algorithm Porting to Rust
- **Sugiyama Layering & Simplex:** Port `rankAssignment.ts` and `cycleBreaking.ts` to Rust (`crates/gvui_layout_wasm/src/layering.rs`).
- **Parallel Neighborhood Search:** Port `neighborhoodSearch.ts` using Rayon parallel iterators (`par_iter`) across ranks (`crates/gvui_layout_wasm/src/neighborhood.rs`).
- **Bounded-Window A* Routing:** Port `routeSearch.ts` with SIMD-accelerated grid collision checks (`crates/gvui_layout_wasm/src/routing.rs`).

### Phase 3: SharedArrayBuffer Memory Bridge & Worker Pool Client
- Implement C-compatible binary struct layouts (`FlatNode`, `FlatEdge`, `FlatPoint`).
- Create `src/engine/layout/custom/wasmWorkerPool.ts` to manage worker thread initialization, SharedArrayBuffer allocation, and fallback to JS engine when `SharedArrayBuffer` headers (`COOP`/`COEP`) are disabled.

### Phase 4: Integration & Performance Verification
- Update `computeCustomEngineGraphLayoutAsync` to invoke `wasmWorkerPool`.
- Run comparative performance benchmarks across all public dataset graphs (`ai_agent_trace`, `kubernetes_cluster_topology`, `dense_kubernetes_mesh`).
- Verify 100% layout validity and run `bun run typecheck`.

---

## Verification Plan

### Automated Testing & Gates
- **Type Safety:** Run `bun run typecheck` (`tsc -b`) to ensure 0 TypeScript errors.
- **Unit Tests:** Execute `bun test` across layout validator test suites.
- **Performance Benchmark:** Run benchmark script verifying $>50\text{x}$ speedup on `kubernetes_cluster_topology` ($11\text{s} \rightarrow <0.1\text{s}$).
