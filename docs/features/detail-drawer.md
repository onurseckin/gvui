← [Docs Home](../README.md) | [Features Index](./README.md) | [Graph Vocabulary](./graph-vocabulary.md)

# Node Detail Drawer

## 1. What the drawer is

[`src/components/NodeDetailDrawer/index.tsx`](../../src/components/NodeDetailDrawer/index.tsx) is
the inspection surface for whichever node is selected in the graph store. It opens on selection,
closes on `Escape` or the close button, and renders nothing at all when no node is selected.

The header is the node's **archetype**, resolved by `describeNodeKind` — the recorded role first,
the bare kind second (see [Graph Vocabulary §2](./graph-vocabulary.md#2-node-kinds-and-role-archetypes)).

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [archetype icon] Node Name                                          [X]      │
│ IMPLEMENTER   success   Step 4   claude-… [host-reported]   node-task-3      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Overview & I/O │ Cost & Tokens │ Dependencies & Impact │ Assets & Media (3)  │
│ Files & Diffs (7) │ Scripts (2) │ Tools (5) │ State Machine (6) │            │
│ Feedback & Reviews (2) │ Raw Provenance                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ active tab body                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

The model chip in the header is only asked for when an agent actually stood behind the node
(`nodeCarriesAgent`: kind `agent`, `orchestrator`, `critic`, `gate`, or any recorded telemetry
field). A prompt node has no model to be unknown about, so it is not asked the question.

---

## 2. The honesty contract

Every number and label in this drawer travels with its provenance, and an absent value stays
absent. Two primitives in [`EvidenceChip.tsx`](../../src/components/NodeDetailDrawer/EvidenceChip.tsx)
enforce it:

| Primitive        | Renders                                                                   |
| :--------------- | :------------------------------------------------------------------------ |
| `EvidenceChip`   | the provenance label beside a value, plus `estimated` when `is_estimated` |
| `UnknownValue`   | the single word **unknown**, titled "… was never reported for this node"  |
| `EvidencedField` | a labelled row: the value with its chip, or `UnknownValue`                |

| `evidence_class`   | Chip label       | Meaning                                     |
| :----------------- | :--------------- | :------------------------------------------ |
| `harness_observed` | `measured`       | the harness measured this itself            |
| `host_reported`    | `host-reported`  | the host runtime reported this              |
| `agent_reported`   | `agent-reported` | an agent claimed this through the CLI       |
| `derived`          | `derived`        | computed from other recorded values         |
| `unknown`          | `unknown`        | the run did not record where this came from |
| _(field absent)_   | `unlabelled`     | the dataset predates evidence labelling     |

A model, tier or thinking level the host never reported has **no entry** in `node.telemetry`. The
drawer then renders `unknown` — it never falls back to the model of the machine that exported the
capsule, and there is no pricing table anywhere in this component tree.

---

## 3. Tabs

Ten tabs are declared. Six are conditional: a tab that has nothing to show is not rendered at all,
so an empty tab bar entry never implies missing data.

| Tab                   | Component          | Shown when                                                    |
| :-------------------- | :----------------- | :------------------------------------------------------------ |
| Overview & I/O        | `OverviewTab`      | always                                                        |
| Cost & Tokens         | `CostTab`          | always                                                        |
| Dependencies & Impact | `DependenciesTab`  | always                                                        |
| Assets & Media        | `AssetsTab`        | the node has assets, or Playwright metadata                   |
| Files & Diffs         | `DiffsTab`         | `node.files` or `metadata.writeScope` is non-empty            |
| Scripts               | `ScriptsTab`       | `readScripts(node)` returns rows                              |
| Tools                 | `ToolsTab`         | `readTools(node)` returns rows                                |
| State Machine         | `StateMachineTab`  | `readStateTransitions(node)` returns rows                     |
| Feedback & Reviews    | `FindingsTab`      | findings exist, or `repairRounds > 0`, or `kind === "critic"` |
| Raw Provenance        | `RawProvenanceTab` | always                                                        |

The tab badge is the row count. If the selected tab becomes invisible for the next node, the drawer
falls back to Overview.

### 3.1 Overview & I/O

Purpose, recorded execution metrics, the agent telemetry card, the branch sub-task card, the
subagent lineage tree, and the I/O stream accordions.

- **Execution metrics** are rendered only for the values the run recorded: tokens in/out, reasoning
  ("cognitive") tokens, wall duration, active-command duration, think time, memory footprint,
  recorded cost, repair rounds. A metric with no recorded value is omitted rather than zeroed.
- **Host Agent Attribution** renders five `EvidencedField` rows — Model, Tier, Thinking Level,
  Tokens In, Tokens Out — each with its chip or an explicit `unknown`. Agent id, grant status and
  role pill appear only when the ledger recorded them.
- **Branch Sub-task** (`readBranchContext`) appears for a node that carries a `branchId` or sits in
  a section with a recorded `reason`. It shows the sub-task owned, the **branch reason** (looked up
  through the node's own `sectionId`, so the section is never searched for), the parent task, the
  branch depth and the gate. A missing reason renders as `unknown`, never as an empty row.
- **I/O ports** use `node.io` when declared, and otherwise derive ports from the edges that touch
  this node. Clicking a connected node selects it.

### 3.2 Cost & Tokens

A token footprint, not a cost model. `readTokenFootprint` reads real counts only — input, output,
reasoning, cache-read, cache-creation and total — falling back to `telemetry.tokensIn/Out` for the
first two.

- The hero figure is the **recorded** cost. A node whose dataset carried no `costUsd` renders
  **"no cost recorded"**. Nothing is priced, multiplied or extrapolated here.
- The graph-wide comparison counts only the nodes that actually reported, so a share percentage is
  never computed against an invented denominator.
- A footprint flagged `isEstimated` carries an explicit banner: _these counts are an estimate the
  run derived, not a host-reported measurement._
- **Copy Report** writes the same values to the clipboard, spelling absent ones as `unknown` and
  `not recorded`.

### 3.3 Dependencies & Impact

Upstream predecessors, downstream dependents, and the `ImpactGraph` mini-canvas showing the local
dependency cluster. Selection is shared with the main canvas.

### 3.4 Assets & Media

`node.assets` is the **one canonical home** for a node's evidence. `readAssets` reads it first and
consults the legacy keys — `node.mediaAssets`, `node.screenshots`, `metadata.mediaAssets`,
`metadata.screenshots`, `metadata.assets`, `metadata.playwrightMetadata.screenshots` — only when the
canonical array is absent, and never merges the two. That is what stops one screenshot rendering as
six.

Assets are filterable by validation evidence, worker snapshot, critic certification, screenshots,
diagrams, documents and logs, and open full-screen in `LightboxDialog`, which pans and zooms images
and also renders code, log, markdown and PDF assets inline.

### 3.5 Files & Diffs

Files the node touched, with unified/side-by-side diffs, per-file addition and deletion counts, and
the declared `writeScope`.

### 3.6 Scripts

Every command the harness itself ran and timed for this node, from `node.scripts`: the real argv,
the real exit code, the real duration, the log path, and the stdout/stderr tails.

- `exit 0` renders green, any other code red, and a script whose exit code was never recorded says
  `exit code unknown` rather than assuming success.
- Duration, working directory, log path and each log tail fall back to `UnknownValue` individually.
- Each row carries its own `EvidenceChip` and the harness command id.
- A dataset written before `node.scripts` existed keeps its richer legacy renderer: the tab
  delegates to `CommandsTab`, so the same executions are never presented twice in one drawer.

### 3.7 Tools

The tools the node's agent was granted or reported using, from `node.tools`. Nothing here is
inferred from a command line — an entry means someone actually reported the tool.

Rows are **grouped by evidence class**, because a tool the host reported and a tool an agent merely
claimed are not the same kind of fact. Each row shows the tool name, its type, and the first time it
was reported when the ledger recorded one.

### 3.8 State Machine

The recorded task state machine from `node.stateTransitions`: every move, who made it, the attempt
and round, and — when a review caused the move — the verdict that did.

`classifyTransition` sorts each transition into one of three classes:

| Class      | Recognised by                                                              | Rendered as                                                                                                  |
| :--------- | :------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| `probe`    | `verdict === "probe"` or `findingClass === "probe_demand"`                 | **Adversarial Probe** — "Proof demanded. A probe is not a rejection and does not consume the repair budget." |
| `pushback` | `verdict` reject/fail, `findingClass === "defect"`, or `to === "rejected"` | **Pushback** — "A defect was asserted against the submitted work."                                           |
| `plain`    | everything else                                                            | **Transition**                                                                                               |

The tab header counts probes and pushbacks separately and colours them apart. A probe round is
labelled `Probe Round N`; only a pushback is labelled with a bare `Round N`. Blurring the two is
what once made every probed task look rejected.

### 3.9 Feedback & Reviews

`ErrorInspector`: findings with severity and status, structured stack traces, adversarial audit
quotes, repair rounds, and remediation patches with copy actions.

Findings reference their evidence **by id**. A finding's `screenshotAssetIds` are resolved against
the node's own `readAssets(node).assets` through `resolveAssetIds`; the asset object itself lives on
the node, not in a second copy inside the finding. Findings written before `screenshotAssetIds`
existed still carry embedded `screenshots`, and those are read as-is.

### 3.10 Raw Provenance

An index, not a second copy of the drawer:

- **Recorded Evidence** — counts of scripts, tools, state transitions, assets, findings and files,
  each naming the tab that owns them, or `none recorded`. A node whose assets came from the legacy
  keys says so explicitly.
- **Provenance Timeline** — the chronological event stream.
- **Provenance Identifiers** — node id, agent id, role, host, grant status, step, section, kind and
  status, with `unknown` wherever the run recorded nothing.
- **Raw Node Dataset Payload** — the node's JSON, with copy-to-clipboard.

---

← [Docs Home](../README.md) | [Features Index](./README.md) | [Graph Vocabulary](./graph-vocabulary.md) | [Capsule Import](../tooling/capsule-import.md)
