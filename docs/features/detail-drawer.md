# Node Detail Drawer

## 1. Overview & Interaction Architecture

The **Node Detail Drawer** (`src/components/NodeDetailDrawer/index.tsx`) provides an in-depth, multi-dimensional inspection surface for any selected node in the GVUI canvas. It automatically detects and binds to node archetypes (agent, tool, evaluator, router, critic, condition, sandbox, sink), displaying contextual telemetry, token metrics, dependency trees, interactive diffs, and validation evidence.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Node Detail Drawer                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Icon] Node Name                            [Kind] [Status] [Step] [X Close]│
├─────────────────────────────────────────────────────────────────────────────┤
│ Tabs:                                                                       │
│ [Overview & I/O] [Cost & Tokens] [Dependencies] [Assets] [Files & Diffs]   │
│ [Executions] [Feedback & Reviews] [Raw Provenance]                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Active Tab Body:                                                            │
│  - Metrics summary cards                                                    │
│  - Interactive visual graphs / subagent trees / diff editors                │
│  - Collapsible execution accordion / terminal output replay                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Drawer Tabs Reference

### 2.1. Overview & I/O (`OverviewTab.tsx`, `IoTab.tsx`)

- **Purpose**: High-level execution summary, runtime status, node archetype metadata, and directional I/O stream ports.
- **Key Metrics Displayed**:
  - Node Status: `pending`, `running`, `success`, `error`, `warning`, `skipped`, `cached`.
  - Execution Duration & Timestamps (`startedAt`, `finishedAt`).
  - Model Information: Target model (e.g. `gemini-1.5-pro`) and harness orchestrator model.
  - Connected Inputs & Outputs: Upstream data sources and downstream consumer nodes.
  - Interactive Chip Navigation: Clicking any connected node immediately focuses that node on canvas and updates drawer state.

### 2.2. Cost & Tokens (`CostTab.tsx`)

- **Purpose**: Granular token consumption breakdown, prompt cache efficiency, and estimated execution cost ($USD).
- **Token Metrics Breakdown**:
  - **Prompt Tokens**: Input context tokens sent to model.
  - **Completion Tokens**: Output generation tokens.
  - **Reasoning Tokens**: Internal chain-of-thought / reasoning tokens.
  - **Cache Read Tokens**: Tokens served from prompt cache.
  - **Cache Write / Creation Tokens**: Tokens committed to prompt cache.
- **Analytics Visuals**:
  - Token distribution stacked bar chart (`TokenDistributionCard.tsx`).
  - Cache savings calculator: Demonstrates prompt cache efficiency percentage and dollar savings.
  - Model pricing matrix lookup: Computes exact cost per 1M tokens based on active model SKU.

### 2.3. Dependencies & Impact Graph (`DependenciesTab.tsx`, `ImpactGraph.tsx`)

- **Purpose**: Dependency chain inspection and transitive impact analysis.
- **Capabilities**:
  - **Upstream Dependencies**: Direct predecessors that must complete before this node can run.
  - **Downstream Dependents**: Successors that depend on outputs from this node.
  - **Impact Subgraph (`ImpactGraph.tsx`)**: Interactive mini-canvas showing the localized dependency cluster and blast radius if this node fails or changes.

### 2.4. Subagent Lineage Tree (`SubagentLineageTree.tsx`)

- **Purpose**: Visualizes hierarchical multi-agent delegation trees and nested task distributions.
- **Features**:
  - Collapsible agent span hierarchy: Parent Coordinator → Worker Agents → Specialized Subagents.
  - Execution state pills and role annotations (`implementer`, `validator`, `critic`).
  - Token and cost rollup along lineage tree branches.

### 2.5. Error Inspector (`ErrorInspector.tsx`)

- **Purpose**: Forensic diagnostics for failed executions, exceptions, and adversarial audit quotes.
- **Components**:
  - **Stack Trace Parser (`parseStackTrace`)**: Highlights repo-relative source paths and line numbers.
  - **Adversarial Audit Quotes (`extractAuditQuotes`)**: Excerpts exact critical failure reasons surfaced by automated test runners or validator agents.
  - **Remediation Patches (`extractRemediationPatches`)**: Renders inline unified code diffs proposing targeted fixes.

### 2.6. Assets & Media (`AssetsTab.tsx`, `LightboxDialog.tsx`)

- **Purpose**: Multi-viewport visual artifacts and screenshot inspection.
- **Capabilities**:
  - Displays screenshots captured by Playwright visual testing across viewports (`desktop`, `tablet`, `mobile`, `wide-desktop`).
  - Interactive Lightbox: Fullscreen modal with pan, zoom, and side-by-side visual diff comparison.
  - Asset metadata: Dimensions, file size, timestamp, and target viewport.

### 2.7. Files & Diffs (`DiffsTab.tsx`, `FilesTab.tsx`)

- **Purpose**: Code changes produced by the node execution.
- **Capabilities**:
  - Side-by-side and unified diff views with syntax highlighting.
  - File scope analysis (`writeScope` compliance verification).
  - Additions / deletions counter per file.

### 2.8. Executions & Commands (`CommandsTab.tsx`, `CommandDetailModal.tsx`)

- **Purpose**: Low-level shell and tool execution records.
- **Features**:
  - Command exit codes, durations, and environment variables.
  - Raw stdout / stderr stream viewer with search and copy-to-clipboard.
  - Modal inspection for terminal logs (`CommandDetailModal.tsx`).

### 2.9. Feedback & Reviews (`FindingsTab.tsx`)

- **Purpose**: Quality gate verification results, critic reviews, and findings history.
- **Features**:
  - Finding classification (`critical`, `important`, `minor`).
  - Status tracking (`open`, `resolved`).
  - Repair rounds tracking and revalidation proofs.

### 2.10. Raw Provenance (`RawProvenanceTab.tsx`, `ProvenanceTimeline.tsx`)

- **Purpose**: Immutable audit trail and raw JSON telemetry export.
- **Features**:
  - Chronological provenance event stream.
  - JSON payload viewer with search and format validation.
