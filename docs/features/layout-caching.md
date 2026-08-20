← [Docs Home](../README.md) | [Features Index](./README.md) | [Graph Vocabulary](./graph-vocabulary.md)

# Layout Caching

A layout is a pure function of a dataset plus a config, and the engine is deterministic — so a
layout the user has already seen never needs to be computed twice. GVUI caches computed geometry in
the browser and re-hydrates the canvas from it on the next visit.

There is no database here. The cache is an in-memory object with a table-shaped API serialised as
one JSON blob into `localStorage`; every row in it is disposable.

## 1. The path a layout takes

```text
   dataset + layout config + mode
              │
              ▼
   signature = hash(dataset) + "_" + configHash        useLayoutComputation.ts
              │
              ├─▶ loadStoredLayout(mode, signature) ──▶ hit  ──▶ hydrate canvas
              │
              └─▶ miss ──▶ in-flight request for this key already running?
                              │yes → await it
                              │no  → computeCustomEngineGraphLayoutAsync (Rust/WASM)
                                        │
                                        ▼
                              saveStoredLayout(mode, signature, layout)
                                        │
                                        ▼
                              localStorage["gvui_local_db_v1"]
```

Concurrent mounts asking for the same key share one computation: `useLayoutComputation` keeps a
module-level `inFlightLayoutRequests` map so a remount mid-computation does not start a second one.

## 2. The cache key

| Part         | Source                                                                                                                                    |
| :----------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| dataset hash | `generateDatasetSignature` — two interleaved 32-bit FNV-style hashes over `id`, `title`, every `id:type:name`, and every `source->target` |
| config hash  | every `CustomLayoutConfig` key except `cornerRadius`, `edgeStyle` and `zoomSensitivity`, sorted and joined                                |
| layout mode  | `layered` or `radial`, prefixed onto the row key                                                                                          |

The stored row key is `` `${signature}_${layoutMode}` ``. Any structural change to the dataset, or
any config change that can move geometry, produces a different signature and therefore a miss.

## 3. What is stored

One table, `graph_layouts`, declared in
[`src/utils/localDb.ts`](../../src/utils/localDb.ts):

| Column           | Contents                                     |
| :--------------- | :------------------------------------------- |
| `key`            | primary key — `<signature>_<layout_mode>`    |
| `file_signature` | the dataset + config signature               |
| `layout_mode`    | `layered` \| `radial`                        |
| `nodes`          | positioned nodes, stored as opaque JSON      |
| `edges`          | positioned edges, stored as opaque JSON      |
| `timestamp`      | epoch millis of the last write — the LRU key |
| `created_at`     | ISO timestamp of first write                 |
| `updated_at`     | ISO timestamp of the last write              |

`nodes` and `edges` are opaque on purpose so their shape can change freely. If the table shape
itself ever changes, the answer is to clear the cache and let it refill — never to migrate it, and
never to keep compatibility code around for an older layout of a cache.

## 4. Eviction and failure behaviour

- **Quota exhaustion is the only trigger.** On a `QuotaExceededError` (or Firefox's
  `NS_ERROR_DOM_QUOTA_REACHED`), `evictOldestLayouts` drops the older half of the rows by
  `timestamp`, ties broken by insertion order, and the write is retried once. If it still fails the
  cache logs a warning and gives up — a failed cache write never breaks a render.
- **There is no TTL and no entry cap.** Nothing expires by age.
- **A corrupt or unparseable blob is discarded**, not repaired: `loadFromStorage` returns an empty
  database and the cache refills.
- **No storage at all is fine.** In SSR or a test environment without `localStorage`, the cache runs
  purely in memory.
- **Manual clearing**: `clearStoredLayoutCache()` empties the table; the Developer Settings panel
  browses the stored rows and can reload them from storage.

---

← [Docs Home](../README.md) | [Features Index](./README.md) | [Graph Vocabulary](./graph-vocabulary.md) | [Node Detail Drawer](./detail-drawer.md)
