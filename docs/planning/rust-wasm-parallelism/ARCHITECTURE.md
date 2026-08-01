# High-Performance Rust + WASM Parallel Layout Engine Architecture

This document presents the architectural design for accelerating the **GVUI Directed Graph Layout & Edge Routing Engine** by migrating heavy algorithmic passes to **Rust compiled to WebAssembly (WASM)** combined with **Multi-Threaded Web Worker parallelism** and **SharedArrayBuffer zero-copy memory access**.

---

## 1. Architectural Overview & System Topology

The system decouples React 19 UI rendering from algorithmic layout computation. Rather than executing single-threaded JavaScript inside a single worker, graph layout optimization is distributed across all available logical CPU cores using **Shared Memory (SharedArrayBuffer)** and a **Rust WASM Worker Thread Pool**.

```mermaid
graph TD
    subgraph MainThread ["Main UI Thread (React 19)"]
        UI["React Canvas Component"]
        Store["Zustand Store"]
        Client["LayoutWorkerPoolClient"]
    end

    subgraph MemorySpace ["Shared Memory Space (SharedArrayBuffer)"]
        SAB["Atomic SharedArrayBuffer<br/>(Node Positions, Edge Routes, Grid Matrix)"]
    end

    subgraph WorkerPool ["Multi-Threaded Worker Pool (Hardware Cores)"]
        W1["Worker 1 (Rust WASM Core)"]
        W2["Worker 2 (Rust WASM Core)"]
        WN["Worker N (Rust WASM Core)"]
    end

    UI --> Store
    Store --> Client
    Client -->|Post Offsets & Pointers| WorkerPool
    WorkerPool <-->|Zero-Copy Atomic Reads/Writes| SAB
    WorkerPool -->|Layout Complete Signal| Client
    Client -->|Single Batch State Update| Store
```

---

## 2. Core Technical Components

### Component 1: Rust/WASM Algorithm Core (`gvui-layout-wasm`)
Built with Rust using `wasm-bindgen`, `rayon` (with `atomics` and `bulk-memory` target features enabled), and SIMD vectorization.

- **Rank & Crossing Minimization:** High-speed SIMD-accelerated Barycenter/Median sweeps.
- **Parallel Neighborhood Search (Passes 1–15):** Evaluates candidate node position swaps concurrently across independent ranks using `par_iter()`.
- **Parallel Bounded-Window A* Routing:** Routes independent edges in parallel across CPU cores without lock contention.

### Component 2: Zero-Copy Shared Memory (`SharedArrayBuffer`)
Eliminates structured cloning overhead (`postMessage`) by placing node coordinates, rank assignments, and routing grid collision maps in a shared memory layout.

#### Rust `repr(C)` Memory Struct Layout
```rust
#[repr(C)]
pub struct FlatNode {
    pub id_hash: u64,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub rank: u32,
    pub order: u32,
}

#[repr(C)]
pub struct FlatEdge {
    pub source_hash: u64,
    pub target_hash: u64,
    pub point_count: u32,
    pub points_offset: u32, // Pointer into SharedArrayBuffer float32 array
}
```

### Component 3: Hardware-Adaptive Web Worker Pool
Spawns $N = \min(16, \text{navigator.hardwareConcurrency})$ Web Workers running WASM instances initialized with `wasm_bindgen::initThreadPool()`.

---

## 3. Parallel Execution Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant UI as React UI Thread
    participant Pool as Worker Pool Controller
    participant SAB as SharedArrayBuffer
    participant WASM as Rust WASM Threads (Rayon)

    UI->>Pool: Request Layout (Graph JSON)
    Pool->>SAB: Write Binary Node & Edge Structs
    Pool->>WASM: Trigger WASM Parallel Layout Job
    
    par Parallel Neighborhood Search & Coordinate Alignment
        WASM->>SAB: Rank 0-2 Swaps (Core 1)
        WASM->>SAB: Rank 3-5 Swaps (Core 2)
        WASM->>SAB: Rank 6-8 Swaps (Core N)
    end

    par Parallel Bounded-Window A* Edge Routing
        WASM->>SAB: Route Edges 1-15 (Core 1)
        WASM->>SAB: Route Edges 16-30 (Core 2)
        WASM->>SAB: Route Edges 31-45 (Core N)
    end

    WASM-->>Pool: Return Layout Completed Pointer
    Pool-->>UI: Single Atomic State Dispatch
    UI->>UI: React Mount & Render (1 Render Cycle)
```

---

## 4. Performance & Latency Projection

| Graph Dataset Scale | Pure JS Single-Threaded | Rust WASM Single-Threaded | Rust WASM + WebWorker Parallel (8 Cores) | Total Speedup Gain |
| :--- | :--- | :--- | :--- | :--- |
| **Small Graph (10 Nodes / 11 Edges)** | ~930 ms | ~45 ms | **~12 ms** | **~77x Faster** |
| **K8s Topology (12 Nodes / 13 Edges)** | ~11,200 ms ($11.2\text{s}$) | ~650 ms | **~95 ms** | **~118x Faster** |
| **Dense Mesh (30 Nodes / 45 Edges)** | ~334,000 ms ($5.5\text{ min}$) | ~18,500 ms ($18.5\text{s}$) | **~2,400 ms** ($2.4\text{s}$) | **~139x Faster** |
