← [Docs Home](../README.md) | [Tooling Index](./README.md) | [Graph Vocabulary](../features/graph-vocabulary.md)

# CLI Capsule Import

[`scripts/import-capsule.ts`](../../scripts/import-capsule.ts) turns an orchestrator run capsule
into a GVUI graph dataset. It writes the capsule through unchanged and refuses to invent anything
the capsule did not record.

It is tolerant on the way in and strict on the way out: a document that parses is enough. Anything
the reader understands is kept, anything it does not is reported and left out exactly as if it had
never been written, and the import still succeeds. Only two things stop it — bytes that are not JSON,
and a document carrying no `nodes` and `edges` arrays to draw.

## 1. Usage

```bash
bun run gvui:import --capsule .capsules/<run-id>
bun scripts/import-capsule.ts .capsules/<run-id>      # bare positional also works
```

The CLI takes exactly one input: the capsule directory, via `--capsule` or as the first
non-flag argument. There is no output flag — the CLI always writes to `public/data/graphs/`.
Programmatic callers can redirect it:

```ts
import { importCapsule } from "./scripts/import-capsule";

const result = importCapsule({ capsulePath: ".capsules/run-id", outputDir: "tmp/graphs" });
// { graphId, outputPath, dataset, warnings }
```

On success the CLI prints each validation warning, then the graph id, the node and edge counts, the
output path, and a preview URL (`http://localhost:4444/?graph=<id>`). It exits 1 on any failure.

## 2. Pipeline

```text
                        ┌──────────────────────────────┐
                        │  <capsule>/                  │
                        └──────────────┬───────────────┘
                                       │
                     summary/graph.json exists?
                        ┌──────────────┴───────────────┐
                     yes│                              │no
                        ▼                              ▼
             read summary/graph.json          state.json exists?
             (the producer's own          ┌──────────┴──────────┐
              exported dataset)        yes│                     │no
                        │                 ▼                     ▼
                        │        project state.json     ERROR: neither file
                        │        into a dataset          found under <path>
                        │        (§4 fallback)
                        └──────────────┬──────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │ validateGraphDataset()       │
                        │  no nodes/edges  → throw     │
                        │  everything else → warn, keep│
                        └──────────────┬───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │ findContractViolations()     │
                        │  retired field   → warn      │
                        │  flat telemetry  → warn      │
                        │  unknown evidence→ warn      │
                        └──────────────┬───────────────┘
                                       ▼
                    public/data/graphs/<slug>.json  +  manifest.json
```

The slug is `dataset.id` with every character outside `[A-Za-z0-9_-]` replaced by `_`. The manifest
is a JSON array of slugs; an id already present is not appended twice.

## 3. Validation

Import shares one validator with the running app
([`src/state/graphSchema.ts`](../../src/state/graphSchema.ts)), so a capsule that imports cleanly is
a capsule the canvas can render.

**Errors** — there is no graph in the document at all. The thrown `CapsuleValidationError` carries
the list on `.issues` and prints as:

```text
❌ Import failed: <source path> cannot be read as a graph:
  - dataset.nodes: required, must be an array of node objects, received nothing
A graph document must be a JSON object carrying nodes and edges arrays; everything beyond those is
optional and anything unrecognised is ignored.
```

**Warnings** — everything else. Each names the path that held it and what happened instead; the
import proceeds and the graph draws from the fields that were understood. They are printed with a
`⚠️` prefix:

```text
⚠️  dataset.nodes[0] (node-task-1).mediaAssets: retired field, expected dataset.nodes[0] (node-task-1).assets
⚠️  dataset.nodes[2] (node-gate-1).telemetry.modelTier: expected { value, evidence_class }, received "l"
⚠️  dataset.nodes[3] (node-task-4).name: absent, showing the node id instead
⚠️  dataset.nodes[5] (node-task-6).assets: ignored, expected an array, received "shot.png"
⚠️  dataset.nodes[5] (node-task-6).tools: 1 of 4 ignored, each entry must be an object
⚠️  dataset.nodes[6]: ignored, a node needs a non-empty string id, received nothing
⚠️  dataset.edges[0]: ignored, source "node-missing" matches no node in dataset.nodes
⚠️  dataset.edges[1] (e-7).kind: "teleport" is not a known edge kind (backtrack, branch, collect, …)
⚠️  dataset.title: absent, falling back to dataset.id
```

A node nothing can address is left out, because edges and regions point at nodes by id and there is
no honest id to give one that carries none. Everything above that line survives: a known field of a
shape the renderer cannot walk costs that field alone, a list the renderer reaches into by name
costs only the entries it cannot walk rather than the whole list, and a key nobody has ever heard of
costs nothing at all — it is written through untouched.

Other failures the CLI reports verbatim:

```text
❌ Import failed: Capsule directory does not exist: /abs/path
❌ Import failed: Neither summary/graph.json nor state.json found under: /abs/path
❌ Import failed: /abs/path/state.json is not valid JSON: Unexpected end of JSON input
❌ Import failed: /abs/path/state.json must contain a JSON object with a "tasks" map
```

## 4. The current contract

[`scripts/capsule-contract.ts`](../../scripts/capsule-contract.ts) holds the rules that separate the
current layout from every earlier one. Nothing here is repaired and nothing here is fatal; each rule
is a warning naming where the value now lives.

**Retired fields.** Each of these was a second name for data that already has a canonical home, so
deleting it loses nothing and keeping it forces every render site to know two spellings.

| Retired                                                           | Canonical                                |
| :---------------------------------------------------------------- | :--------------------------------------- |
| `node.mediaAssets`, `node.screenshots`                            | `node.assets`                            |
| `metadata.assets`, `metadata.mediaAssets`, `metadata.screenshots` | `node.assets`                            |
| `metadata.playwrightMetadata.screenshots`                         | `node.assets`                            |
| `metadata.findings[].screenshots`                                 | `metadata.findings[].screenshotAssetIds` |
| `node.model`, `node.harnessModel`                                 | `node.telemetry.model`                   |
| `node.tier`                                                       | `node.telemetry.modelTier`               |

The rest of `playwrightMetadata` is **not** retired. Its `viewport`, `traces`, `videos`, `testFile`,
`durationMs`, `browser` and `status` are recorded there and nowhere else, so they stay where they are.

**Evidence.** `telemetry.model`, `telemetry.modelTier`, `telemetry.thinkingLevel`,
`telemetry.tokensIn` and `telemetry.tokensOut` must arrive as `{ value, evidence_class }`. A bare
scalar is the pre-evidence shape and is reported and skipped rather than relabelled — labelling an
unlabelled value would be inventing its provenance. Anywhere in the dataset, a declared
`evidence_class` must name one of `harness_observed`, `agent_reported`, `host_reported`, `derived`,
`unknown`.

**What is deliberately not checked.** `metadata` is an open extension point and its keys belong to
whoever wrote the dataset; unfamiliar node kinds, roles, edge kinds and section types are normal
graphs, not broken ones; and a key no schema declares travels through to disk exactly as it arrived.
The importer holds datasets to the honesty rules and to the retired-field list, and to nothing else.

## 5. The `state.json` fallback

When a capsule has no generated summary — it is still running, or `summary:export` never ran — the
importer projects the recorded state and nothing more.

The projected dataset takes its id from the capsule directory name and the title
`Execution Trajectory: <run-id>`.

**Tasks** in `state.tasks` become `kind: "agent"` nodes (`node-<task-id>`), named by the task label
or, absent one, by the task id. Each entry in a task's `dependencies` becomes a `dependency` edge,
skipping any dependency whose node is not in the capsule.

The ledger's task status maps onto the node-status vocabulary:

| Ledger status                                                        | Node status |
| :------------------------------------------------------------------- | :---------- |
| `proposed`, `ready`                                                  | `pending`   |
| `leased`, `running`, `branched`, `submitted`, `validating`, `gating` | `running`   |
| `validated`, `done`                                                  | `success`   |
| `blocked`, `changes_requested`, `retry_ready`, `stale`               | `warning`   |
| `escalated`                                                          | `error`     |
| `cancelled`                                                          | `skipped`   |

`branched` is deliberately **not** terminal: the parent's lease is suspended while its sub-agents
work, so the node is still running.

Nothing is filled in. A status the map does not recognise leaves `node.status` absent — the raw
ledger value stays in `metadata.taskStatus`, so it is still inspectable — rather than being rounded
to `pending`. A role is taken only from a lease that actually recorded one: the graph never asserts
that a task was worked by an implementer just because most tasks are.

**Branches** in `state.branches` (array or map) become a section per branch, plus one node per
sub-task:

- each sub-task node is `node-<branch-id>-<sub-task-id>`, with `metadata.branchId` and, when
  recorded, `metadata.subTaskStatus`;
- sub-task status maps `open→pending`, `claimed→running`, `branched→running`, `submitted→success`,
  `abandoned→skipped`;
- a `branch` edge runs parent → sub-task and a `collect` edge runs sub-task → parent, both only when
  the parent task node exists in the capsule;
- the section carries the branch's recorded `reason`, its `status`, and `parentNodeId` — the reason
  is what the canvas prints in the region header and what the drawer shows under
  _Branch Sub-task → Branch reason_.

The ledger records that a node was a branch sub-task; it does **not** record which sub-role the
sub-agent held. No role is asserted for these nodes — the branch region and the branch/collect edges
carry the real relationship.

An entry with no `id`, or a branch with no `parent_task_id`, is skipped rather than half-built.

## 6. The foreign dataset

[`src/testing/fixtures/rainwater-idea-map.json`](../../src/testing/fixtures/rainwater-idea-map.json)
is an idea map about catching roof water. It uses none of the orchestration vocabulary — its kinds
are `premise`, `option`, `risk`, `experiment`, `stakeholder`; its edges `supports`, `contradicts`,
`refines`; its roles `me`, `plumber`, `devils-advocate` — and it carries no scripts, tools, state
transitions, telemetry or findings.

[`src/testing/foreignDataset.test.tsx`](../../src/testing/foreignDataset.test.tsx) imports it,
lays it out and renders every node and edge. It is the standing check that gvui is a graph
visualizer that the orchestration schema happens to use, rather than a viewer for that schema: the
suite fails the moment an unfamiliar kind, role or edge kind stops rendering as itself.

---

← [Docs Home](../README.md) | [Tooling Index](./README.md) | [Graph Vocabulary](../features/graph-vocabulary.md) | [Node Detail Drawer](../features/detail-drawer.md)
