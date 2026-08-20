← [Docs Home](../README.md) | [Features Index](./README.md) | [Node Detail Drawer](./detail-drawer.md)

# The Graph Vocabulary

A GVUI dataset is not a picture of boxes and lines. Every edge declares **what the relationship
was**, every node declares **who did the work**, and every section declares **why a region of the
canvas exists**. This page is the reference for that vocabulary and for the visual treatment each
member receives.

The contract lives in [`src/types/graphData.ts`](../../src/types/graphData.ts). The visual
treatments live in [`edgeKinds.tsx`](../../src/primitives/edges/GraphEdge/edgeKinds.tsx) and
[`nodeKinds.tsx`](../../src/primitives/nodes/NodeCard/nodeKinds.tsx). Both descriptor records are
typed as `Record<EdgeKind, …>` / `Record<NodeRole, …>`, so a vocabulary member cannot be added to
the contract without a deliberate visual treatment being written for it.

---

## 1. Edge Kinds

`EDGE_KINDS` declares 19 relationships. `resolveEdgeKind` maps a dataset edge onto one of them;
`describeEdgeKind` returns its descriptor.

| Kind          | What it means                                           | Accent    | Width | Dash       | Arrowhead  | Tone      |
| :------------ | :------------------------------------------------------ | :-------- | ----: | :--------- | :--------- | :-------- |
| `sequence`    | Linear execution flow                                   | `#3f3f46` |   1.5 | solid      | `arrow`    | neutral   |
| `dependency`  | Unlocked requirement or dependency link                 | `#64748b` |   1.5 | `5 4`      | `arrow`    | neutral   |
| `join`        | Parallel branches converging on one successor           | `#2dd4bf` |     2 | solid      | `arrow`    | neutral   |
| `conditional` | Taken only when a recorded condition held               | `#f59e0b` |  1.75 | `10 3 2 3` | `arrow`    | warning   |
| `fallback`    | Alternate route taken after the primary one failed      | `#fb923c` |  1.75 | `4 4`      | `arrow`    | warning   |
| `spawn`       | A new agent was created for this work                   | `#06b6d4` |     2 | `6 4`      | `arrow`    | info      |
| `dispatch`    | A planned task was handed to an existing agent          | `#22d3ee` |     2 | `2 5`      | `arrow`    | info      |
| `data`        | Artifact or data payload transfer                       | `#6366f1` |     2 | solid      | `arrow`    | neutral   |
| `handoff`     | Ownership of the work passed to another agent           | `#8b5cf6` |  2.25 | solid      | `arrow`    | neutral   |
| `gate`        | A required check the work had to clear                  | `#10b981` |     2 | solid      | `arrow`    | success   |
| `validation`  | An independent validator reviewing the work             | `#34d399` |     2 | `10 4`     | `arrow`    | success   |
| `critic`      | Completeness critic weighing the run against the prompt | `#818cf8` |     2 | `12 4 2 4` | `arrow`    | info      |
| `signoff`     | Terminal approval — the work is sealed                  | `#eab308` |  2.75 | solid      | `terminal` | success   |
| `probe`       | A demand for proof — **not** a claim of a defect        | `#38bdf8` |  1.75 | `3 3`      | `hollow`   | info      |
| `pushback`    | A defect was asserted and the work was sent back        | `#f43f5e` |   2.5 | solid      | `heavy`    | error     |
| `loop`        | Repair iteration returning to an earlier step           | `#fb7185` |     2 | `6 4`      | `arrow`    | warning   |
| `branch`      | Execution-time excursion into sub-work                  | `#d946ef` |     2 | `10 5`     | `arrow`    | excursion |
| `collect`     | Sub-work folded back into the parent task               | `#f0abfc` |  2.25 | solid      | `heavy`    | excursion |
| `backtrack`   | Excursion abandoned — control returned upstream         | `#c084fc` |     2 | `2 6`      | `hollow`   | excursion |

`tone` is the severity register the descriptor declares. The treatment a reader actually sees is
carried by the accent, the dash pattern and the arrowhead silhouette; the accent and dash reach the
DOM as the custom properties `--edge-kind-stroke`, `--edge-kind-width` and `--edge-kind-dash`
(`edgeKindStyleVars`), so the stylesheet never holds a second copy of the palette.

### 1.1 Arrowhead silhouettes

`EdgeMarkerDefs` generates one SVG marker per descriptor. The silhouette is the fastest signal in
the graph, so the four shapes mean four different things:

```text
  arrow      ▶     an ordinary directed relationship
  hollow     ▷     an open question: probe, backtrack
  heavy      ➤     an assertion: pushback, collect
  terminal   ▶|    a full stop: signoff
```

### 1.2 Probe is not pushback

This is the distinction the whole review vocabulary turns on, and the two kinds are deliberately
unalike in colour, dash, weight and arrowhead:

|                         | `probe`                             | `pushback`                   |
| :---------------------- | :---------------------------------- | :--------------------------- |
| What the validator said | "prove this"                        | "this is broken"             |
| Is it a failure?        | No                                  | Yes                          |
| Repair budget           | Not consumed                        | Consumed                     |
| Colour / weight         | sky `#38bdf8`, 1.75px, dashed `3 3` | rose `#f43f5e`, 2.5px, solid |
| Arrowhead               | `hollow` — outline only             | `heavy` — filled, barbed     |
| Animation on select     | forward                             | reverse (`reverse-flow`)     |

A task that was probed and then passed is a task that was _held to account_, not a task in trouble.
`EDGE_KIND_ALIASES` deliberately makes `probe` an alias of nothing, and maps the legacy spelling
`rejection` onto `pushback` rather than onto `loop`, so a recorded defect can never be redressed as
a routine retry.

### 1.3 Resolution and aliases

`resolveEdgeKind` accepts an edge object or a bare kind string:

1. A declared `kind` that is in `EDGE_KINDS` wins, case-insensitively.
2. Otherwise the alias table is consulted: `artifact→data`, `certificate→signoff`, `cycle→loop`,
   `flow→sequence`, `linear→sequence`, `rejection→pushback`, `requirement→dependency`,
   `review→validation`, `unlocked→dependency`.
3. An edge with **no** kind falls back to `loop` when it carries `isCycle`, and to `sequence`
   otherwise. `isCycle` never overrides a declared kind — a declared `pushback` that happens to be a
   back-edge stays a pushback.

`validateGraphDataset` reports an unrecognised kind as a **warning**, not an error: a newer producer
must not be rejected outright, and the edge still draws as `sequence`.

### 1.4 Where the kind is read

| Surface                                                                                             | Uses the kind for                                                |
| :-------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| [`GraphEdge`](../../src/primitives/edges/GraphEdge/index.tsx)                                       | stroke vars, `kind-*` class, marker, reverse animation           |
| [`EdgeMarkerDefs`](../../src/primitives/edges/GraphEdge/EdgeMarkerDefs.tsx)                         | one marker per kind, by silhouette                               |
| [`EdgeBadgeOverlay`](../../src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx) / `GraphBadgeLayer` | badge variant when the dataset declares none                     |
| [`EdgeDetailDrawer`](../../src/components/EdgeDetailDrawer/index.tsx)                               | the kind badge in the drawer header                              |
| [`SidebarReviewRounds`](../../src/components/Sidebar/SidebarReviewRounds.tsx)                       | counting probe edges apart from pushback edges                   |
| [`svgExporter`](../../src/engine/export/svgExporter.ts)                                             | marker defs in exported SVG, generated from the same descriptors |

An edge's colour never borrows its source node's colour: `resolveEdgeAccent` consults the
dataset-supplied `accent` first and the kind descriptor second, because an edge's colour must say
what it _means_, not where it came from.

---

## 2. Node Kinds and Role Archetypes

A node has a coarse `kind` and, when the run recorded one, a `telemetry.role`. Kind alone cannot
separate an implementer from the validator that reviewed it — both are `kind: "agent"` — so the
**role decides the archetype** whenever one was recorded.

### 2.1 The nine roles

| Role                  | Card label          | Accent    | Icon               | Role group   |
| :-------------------- | :------------------ | :-------- | :----------------- | :----------- |
| `coordinator`         | COORDINATOR         | `#3b82f6` | `IconHierarchy2`   | coordination |
| `planner`             | PLANNER             | `#60a5fa` | `IconListCheck`    | coordination |
| `implementer`         | IMPLEMENTER         | `#06b6d4` | `IconHammer`       | implementer  |
| `validator`           | VALIDATOR           | `#10b981` | `IconShieldCheck`  | validator    |
| `repairer`            | REPAIRER            | `#f59e0b` | `IconTool`         | repairer     |
| `completeness-critic` | COMPLETENESS CRITIC | `#818cf8` | `IconScale`        | critic       |
| `sub-implementer`     | SUB-IMPLEMENTER     | `#22d3ee` | `IconGitBranch`    | sub-agent    |
| `sub-validator`       | SUB-VALIDATOR       | `#34d399` | `IconShieldSearch` | sub-agent    |
| `sub-investigator`    | SUB-INVESTIGATOR    | `#d946ef` | `IconMicroscope`   | sub-agent    |

A validator is its own node, not a decoration on the implementer it reviewed. The three `sub-*`
roles are the excursion roles: they only appear inside a branch section.

Role groups (`roleGroupOf`) back the sidebar breakdowns. The six `RoleGroup` values are the ones in
the table above — `coordination`, `implementer`, `validator`, `repairer`, `critic`, `sub-agent`.
The quick filters in [`graphFilters.ts`](../../src/state/graphFilters.ts) are the plural spellings
of the same six (`coordination`, `implementers`, `validators`, `repairers`, `critics`,
`sub-agents`), mapped onto the groups by `ROLE_GROUP_FILTERS`; `orchestrators` is kept as the
pre-realignment alias of `coordination` so a stored filter keeps working.

### 2.2 The nine kinds

| Kind           | Card label          | Accent    |
| :------------- | :------------------ | :-------- |
| `input`        | USER PROMPT         | `#8b5cf6` |
| `orchestrator` | COORDINATOR         | `#3b82f6` |
| `agent`        | WORKER              | `#06b6d4` |
| `tool`         | CLI COMMAND         | `#71717a` |
| `gate`         | VALIDATOR GATE      | `#10b981` |
| `critic`       | COMPLETENESS CRITIC | `#818cf8` |
| `terminal`     | SEALED OUTCOME      | `#10b981` |
| `router`       | ROUTER              | `#f59e0b` |
| `join`         | JOIN                | `#2dd4bf` |

### 2.3 How the archetype is resolved

`describeNodeArchetype` (exported as `describeNodeKind`) resolves in this order:

1. `node.telemetry.role`, the canonical grant-ledger role.
2. `node.metadata.role`, where datasets recorded the role before the grant ledger existed.
3. The bare `node.kind`, defaulting to `agent`.

Both role sources are matched against the nine canonical spellings only. The legacy alias table
(`orchestrator→coordinator`, `worker→implementer`, `critic→completeness-critic`, …) lives in
`graphSchema.resolveNodeRole` and is applied **at import time**, when `normalizeGraphDataset`
rewrites the aliased role into `telemetry.role`; the card itself does no alias translation.

An unrecognised role string is **no role at all**: the node renders as its bare kind rather than as
a guess. `graphSchema.resolveNodeRole` additionally reports whether the role was `declared` by the
run or merely implied by the kind, and `normalizeGraphDataset` writes back only declared roles — an
implied role never enters the data.

---

## 3. Sections: branch excursions on the canvas

There are no compound nodes in the layout engine and none are needed. A region of the canvas that
belongs together is a `GraphSection`:

```ts
interface GraphSection {
  id: string;
  title: string;
  description?: string;
  nodeIds: string[];
  collapsed?: boolean; // declared by the contract; the canvas ignores it — see below
  reason?: string; // why this region exists — for a branch, the recorded branch reason
  parentNodeId?: string;
  status?: string;
}
```

[`GraphGroupingLayer`](../../src/engine/GraphCanvas/GraphGroupingLayer.tsx) draws sections beside
the user's own canvas groups, with three differences:

- **They are locked.** A section is recorded structure, not user annotation, so it cannot be
  dragged, edited or collapsed. `sectionAsGroup` always projects a section as expanded and never
  reads the contract's `collapsed` flag: collapsing is a store action and the store owns no section,
  so offering the affordance would give the user a button that cannot come back.
- **They are coloured by recorded status**, so an abandoned excursion never looks like a collected
  one: `collected → purple`, `collecting`/`open → cyan`, `abandoned → rose`, anything else
  (including an unrecorded status) → neutral slate.
- **They carry the reason in the header.** The recorded reason is the whole point of a branch
  region: why the run went down there. The drawer shows the same string under
  _Branch Sub-task → Branch reason_, resolved through the node's own `sectionId`.

A section whose `nodeIds` reference a node that does not exist is a hard validation **error**, not a
warning.

---

## 4. Reading a run

### 4.1 The shape of a whole run

```text
                        ┌────────────────┐
                        │  USER PROMPT   │   kind: input
                        └───────┬────────┘
                                │ handoff
                                ▼
                        ┌────────────────┐
              ┌─────────│  COORDINATOR   │─────────┐
      spawn   │         └───────┬────────┘         │  dispatch
              ▼                 │ dispatch         ▼
      ┌────────────────┐        │          ┌────────────────┐
      │    PLANNER     │        │          │  IMPLEMENTER   │  task-2
      └───────┬────────┘        ▼          └───────┬────────┘
              │ data    ┌────────────────┐         │ validation
              └────────▶│  IMPLEMENTER   │         ▼
                        │     task-1     │  ┌────────────────┐
                        └───────┬────────┘  │   VALIDATOR    │
                                │           └───────┬────────┘
                                │ validation        │ gate
                                ▼                   ▼
                        ┌────────────────┐  ┌────────────────┐
                        │   VALIDATOR    │  │  VALIDATOR     │
                        └───────┬────────┘  │     GATE       │
                                │ join      └───────┬────────┘
                                └─────────┬─────────┘
                                          │ critic
                                          ▼
                                 ┌────────────────┐
                                 │  COMPLETENESS  │
                                 │     CRITIC     │
                                 └───────┬────────┘
                                         │ signoff  ▶|
                                         ▼
                                 ┌────────────────┐
                                 │ SEALED OUTCOME │   kind: terminal
                                 └────────────────┘
```

### 4.2 One task, close up: probe and pushback back-edges

The forward path runs left to right. The two back-edges are the review vocabulary, and they are not
the same edge wearing two colours.

```text
                    validation                       gate
  ┌──────────────┐  ─ ─ ─ ─ ─ ─ ▶ ┌──────────────┐ ─────────▶ ┌──────────────┐
  │ IMPLEMENTER  │                │  VALIDATOR   │            │ VALIDATOR    │
  │   task-3     │                │  task-3/v1   │            │ GATE         │
  └──────────────┘                └──────────────┘            │ bun test …   │
      ▲      ▲                          │                     └──────────────┘
      │      │                          │                       exit_code: 0
      │      └── probe ◁ ─ ─ ─ ─ ─ ─ ─ ─┤   round 1  "prove the null path is covered"
      │         sky · dashed 3-3        │            hollow head · budget untouched
      │         hollow arrowhead        │
      │                                 │
      └───────── pushback ➤═════════════┘   round 2  "the null path throws"
                rose · solid 2.5px                   heavy head · one repair round spent
```

A `loop` edge may follow a pushback back to the implementer for the repair iteration itself;
`loop` and `pushback` both animate in reverse when selected, so a back-edge always reads as a
back-edge.

### 4.3 A branch excursion

An excursion is a section plus its nodes plus the `branch` / `collect` / `backtrack` edges that
attach it to the parent. The parent task holds the ledger status `branched` while its sub-agents
work; the importer maps that onto the node status `running`, because a suspended lease is not a
finished task.

```text
   ┌── section: "Branch br-1" ───────────────────────────────────────────────┐
   │   reason: "the auth middleware needs its own migration first"           │
   │   status: collected  →  drawn purple, locked, never collapsible         │
   │                                                                         │
   │      ┌──────────────────┐              ┌──────────────────┐             │
   │      │ SUB-IMPLEMENTER  │              │ SUB-INVESTIGATOR │             │
   │      │  br-1/sub-1      │              │  br-1/sub-2      │             │
   │      └───┬──────────▲───┘              └───┬──────────▲───┘             │
   └──────────┼──────────┼──────────────────────┼──────────┼─────────────────┘
       collect│          │branch     backtrack  │          │branch
              │          │                      │          │
              ▼          │                      ▼          │
        ┌─────────────────────────────────────────────────────────┐
        │  IMPLEMENTER · task-4 · taskStatus: branched → running  │
        └─────────────────────────────────────────────────────────┘
```

- `branch` (parent → sub) opens the excursion; magenta, dashed `10 5`.
- `collect` (sub → parent) folds finished sub-work back in; heavy arrowhead — it asserts a result.
- `backtrack` (sub → parent) is the abandoned excursion; hollow arrowhead, reverse animation,
  because nothing was delivered.

---

← [Docs Home](../README.md) | [Features Index](./README.md) | [Node Detail Drawer](./detail-drawer.md) | [Capsule Import](../tooling/capsule-import.md)
