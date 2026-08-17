# In-Browser SQLite Layout Caching

## 1. Overview & Architecture

Graph visualization in GVUI is designed for instant responsiveness. When navigating complex agent trajectories, topologies, and dependency graphs with hundreds of nodes and thousands of edges, recomputing full 11-phase Sugiyama or radial layouts on every mount or viewport toggle introduces avoidable CPU overhead.

GVUI implements a tiered layout caching subsystem:

1. **Tier 1 — Hot Memory Cache**: Rapid in-memory `Map<string, PositionedGraph>` for current session lifecycle.
2. **Tier 2 — In-Browser Relational Cache (`sql.js` / WebAssembly SQLite)**: Persistent, indexed relational database storage compiled to WebAssembly running within the browser environment.
3. **Tier 3 — Persistent Local Storage Fallback**: Structured JSON key-value persistence in browser `localStorage` / IndexedDB for offline persistence across browser sessions.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                            GVUI Layout Request                               │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ Compute Deterministic Cache Key   │
                     │ (Graph Hash + Config + Viewport)  │
                     └─────────────────┬─────────────────┘
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
                 [ Cache Hit ]                  [ Cache Miss ]
                        │                             │
                        ▼                             ▼
             Retrieve Geometry from          Execute Rust/WASM Engine
             SQLite / IndexedDB              (compute_custom_layout_wasm)
                        │                             │
                        ▼                             ▼
             Hydrate Canvas State            Store Result in SQLite Cache
                                                      │
                                                      ▼
                                             Render Graph Canvas
```

---

## 2. Deterministic Cache Key Generation

Cache keys must guarantee that any change in input structure, styling knobs, layout mode, or measurement constraints invalidates the entry without collisions.

A cache key is composed as a 64-character hexadecimal hash derived from:

- **Topology Hash**: Sorted list of node identifiers, bounding dimensions `(w, h)`, and edge descriptors `(source, target, minLen, weight, label)`.
- **Engine Config Hash**: Serialized parameters of `CustomLayoutConfig` (node gaps, rank separations, port pitch, routing channel lane height).
- **Layout Mode & Direction**: Selected mode (`layered` vs `radial`) and cardinal flow direction (`top-down`, `bottom-up`, `left-right`, `right-left`).
- **Viewport Constraints**: Viewport bounding box scale ratio and container aspect ratio.

```typescript
export function computeLayoutCacheKey(
  dataset: GraphDataset,
  config: CustomLayoutConfig,
  mode: LayoutMode,
): string {
  const nodeSignature = dataset.nodes
    .map((n) => `${n.id}:${n.width ?? 0}x${n.height ?? 0}`)
    .sort()
    .join(",");
  const edgeSignature = dataset.edges
    .map((e) => `${e.source}->${e.target}:${e.label ?? ""}:${e.minLen ?? 1}`)
    .sort()
    .join(",");
  const configSignature = JSON.stringify(config);

  return sha256Hex(`${dataset.id}|${mode}|${configSignature}|${nodeSignature}|${edgeSignature}`);
}
```

---

## 3. Relational Database Schema (`sql.js`)

The relational layout cache schema organizes graph layouts, node positions, edge waypoints, and performance metrics into normalized tables:

```sql
-- Master layout entries table
CREATE TABLE IF NOT EXISTS gvui_layout_cache (
  cache_key VARCHAR(64) PRIMARY KEY,
  graph_id VARCHAR(128) NOT NULL,
  layout_mode VARCHAR(32) NOT NULL,
  direction VARCHAR(32) NOT NULL,
  node_count INTEGER NOT NULL,
  edge_count INTEGER NOT NULL,
  bounding_width REAL NOT NULL,
  bounding_height REAL NOT NULL,
  duration_ms REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Normalized node coordinates
CREATE TABLE IF NOT EXISTS gvui_cached_nodes (
  cache_key VARCHAR(64) NOT NULL,
  node_id VARCHAR(128) NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  rank INTEGER,
  PRIMARY KEY (cache_key, node_id),
  FOREIGN KEY (cache_key) REFERENCES gvui_layout_cache(cache_key) ON DELETE CASCADE
);

-- Edge routing polylines and badge placements
CREATE TABLE IF NOT EXISTS gvui_cached_edges (
  cache_key VARCHAR(64) NOT NULL,
  edge_id VARCHAR(128) NOT NULL,
  source_id VARCHAR(128) NOT NULL,
  target_id VARCHAR(128) NOT NULL,
  polyline_points TEXT NOT NULL, -- JSON array of [x, y] coordinates
  badge_x REAL,
  badge_y REAL,
  badge_width REAL,
  badge_height REAL,
  leader_x REAL,
  leader_y REAL,
  PRIMARY KEY (cache_key, edge_id),
  FOREIGN KEY (cache_key) REFERENCES gvui_layout_cache(cache_key) ON DELETE CASCADE
);

-- Layout quality and optimization metrics
CREATE TABLE IF NOT EXISTS gvui_cached_metrics (
  cache_key VARCHAR(64) PRIMARY KEY,
  crossings INTEGER NOT NULL,
  geometric_crossings INTEGER NOT NULL,
  bend_count INTEGER NOT NULL,
  straight_chain_ratio REAL NOT NULL,
  leader_count INTEGER NOT NULL,
  collinear_overlaps INTEGER NOT NULL,
  FOREIGN KEY (cache_key) REFERENCES gvui_layout_cache(cache_key) ON DELETE CASCADE
);

-- Indexing for fast retrieval and query optimization
CREATE INDEX IF NOT EXISTS idx_cache_lookup ON gvui_layout_cache (graph_id, layout_mode, direction);
CREATE INDEX IF NOT EXISTS idx_cache_lru ON gvui_layout_cache (last_accessed_at);
```

---

## 4. Eviction Policies & Quota Management

To prevent unbounded memory growth in long-running browser sessions:

- **Maximum Entries**: Defaults to 500 distinct layout configurations.
- **LRU Eviction**: When cache quota exceeds threshold, entries with the oldest `last_accessed_at` timestamps are evicted via cascade delete.
- **TTL Expiration**: Cache entries older than 7 days are automatically purged on initialization.
- **Manual Invalidation**: Users can purge layout cache instantly via the Canvas Toolbar (`Reset Cache`) or Developer Settings panel.
