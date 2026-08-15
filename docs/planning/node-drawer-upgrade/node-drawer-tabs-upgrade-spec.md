# Module 4 Specification: Node Detail Drawer Tabs & Asset Viewer Upgrade

**Document ID**: `GVUI-SPEC-2026-08-15-DRAWER-UPGRADE`  
**Status**: `PROPOSED / APPROVED ARCHITECTURE`  
**Target Path**: `gvui/src/components/NodeDetailDrawer/`  
**Author**: Dedicated Planning Director  
**Date**: 2026-08-15

---

## 1. Executive Overview & Problem Statement

The `NodeDetailDrawer` component in GVUI provides deep observability and inspection into the execution lifecycle of any graph node (Planner, Coordinator, Implementer Worker, Gate Validator, or Completeness Critic). While the initial tab scaffolding exists, the visual presentation and layout structure require significant upgrades across 4 key operational areas:

1. **Overview Tab Telemetry Density**: Rich token metrics (input, output, reasoning/thinking), model tier attribution, host environment detection, and execution time breakdowns need unified card presentation.
2. **I/O Tab Data Formatting**: Input prompts, task requirement payloads, and final output deliverables require structured formatting, JSON tree formatting, and one-click copy-to-clipboard actions.
3. **Assets & Media Viewer**: Captured Playwright test screenshots, generated visual diagrams, and artifact links require a responsive thumbnail gallery with an interactive modal Lightbox viewer supporting pan, zoom, and metadata inspection.
4. **Executions & Diffs Tab**: Per-command execution logs (exit codes, execution duration, stdout/stderr streams) and code churn diffs need line-level formatting and syntax highlighting.

This specification details the visual hierarchy, component architecture, CSS layout specifications, and interaction models for the upgraded drawer tabs.

---

## 2. Drawer Layout Architecture & Navigation Model

```
+---------------------------------------------------------------------------------------+
|  DRAWER HEADER: [Icon] [Node Name / Task Title]                 [Status Pill] [Esc/X]  |
|  Kind: WORKER | Step 2 | Model: gemini-2.5-flash (High) | Task ID: task-01-edge-color  |
+---------------------------------------------------------------------------------------+
|  [ Overview ]  [ I/O Streams (2) ]  [ Assets (4) ]  [ Executions (3) ]  [ Diffs (2) ] |
+---------------------------------------------------------------------------------------+
|  DRAWER BODY (Active Tab Content)                                                     |
|                                                                                       |
|  +---------------------------------------------------------------------------------+  |
|  | SECTION 1: EXECUTION METRICS                                                    |  |
|  | [ Tokens In: 12.4k ] [ Tokens Out: 3.1k ] [ Reasoning: 8.2k ] [ Cost: $0.014 ] |  |
|  | [ Active Cmds: 4.2s ] [ Think Time: 8.1s ] [ Repair Rounds: 0 ]                  |  |
|  +---------------------------------------------------------------------------------+  |
|                                                                                       |
|  +---------------------------------------------------------------------------------+  |
|  | SECTION 2: HOST AGENT ATTRIBUTION                                              |  |
|  | Host: Antigravity CLI | Model: gemini-2.5-flash | Effort: High | Tier: S         |  |
|  +---------------------------------------------------------------------------------+  |
|                                                                                       |
|  +---------------------------------------------------------------------------------+  |
|  | SECTION 3: PURPOSE & SPECIFICATION PROSE                                        |  |
|  | Markdown formatted description of task instructions and acceptance criteria.    |  |
|  +---------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------+
```

---

## 3. Detailed Tab Specifications

### 3.1 Overview Tab (`OverviewTab.tsx`)

The Overview tab provides the executive summary of the node:

1. **Metric Grid Layout**:
   - `Tokens In`: Formatted with SI suffixes (`12.4k`, `1.2M`).
   - `Tokens Out`: Output completion token count.
   - `Reasoning Tokens`: Dedicated chip for thinking tokens (highlighted in indigo/purple).
   - `Wall vs Active Duration`: Split display showing total wall duration alongside cumulative tool execution duration.
   - `Cost (USD)`: Exact dollar expenditure computed from model tier pricing.
   - `Repair Rounds`: Warning pill if $R > 0$ indicating retry/pushback cycles.
2. **Host Agent Card**:
   - Tool icon (Antigravity, Claude Code, Codex, Custom).
   - Model name with badge tier tag (`S`, `M`, `L`, `XS`).
   - Reasoning effort / thinking level pill (`High`, `Medium`, `Low`, `Off`).
3. **Structured Purpose**:
   - Rendered using clear markdown typography, preserving lists, code tags, and links.

```tsx
// Overview Metric Grid Specification
<div className="drawer-metric-grid">
  <div className="drawer-metric">
    <span className="drawer-metric-label">Tokens In</span>
    <span className="drawer-metric-value">{formatTokens(metrics.tokensIn)}</span>
  </div>
  <div className="drawer-metric">
    <span className="drawer-metric-label">Tokens Out</span>
    <span className="drawer-metric-value">{formatTokens(metrics.tokensOut)}</span>
  </div>
  {metrics.tokens?.reasoningTokens && (
    <div className="drawer-metric drawer-metric--thinking">
      <span className="drawer-metric-label">Reasoning</span>
      <span className="drawer-metric-value">{formatTokens(metrics.tokens.reasoningTokens)}</span>
    </div>
  )}
  <div className="drawer-metric">
    <span className="drawer-metric-label">Duration</span>
    <span className="drawer-metric-value">{formatDuration(metrics.durationMs)}</span>
  </div>
  <div className="drawer-metric">
    <span className="drawer-metric-label">Cost</span>
    <span className="drawer-metric-value">{formatCost(metrics.costUsd)}</span>
  </div>
</div>
```

---

### 3.2 I/O Tab (`IoTab.tsx` & `IoStreamItem.tsx`)

The I/O Tab inspects input contexts and output deliverables:

1. **Input Accordions**:
   - Source node link: Clicking peer name navigates and focuses that node on the canvas.
   - Payload kind chip (`prompt`, `artifact`, `decision`, `summary`).
   - Copy-to-clipboard action with visual confirmation (`IconCheck` + "Copied!").
2. **Output Accordions**:
   - Output deliverables with syntax highlighting (JSON, Markdown, YAML, CLI output).
   - Word count and token estimation pills.
3. **Direct Markdown Formatting**:
   - Monospace font with high-contrast token background (`#121216`), bordered with subtle zinc stroke (`#27272a`).

---

### 3.3 Assets & Media Tab (`AssetsTab.tsx` & `LightboxDialog.tsx`)

The Assets tab displays all visual and media artifacts produced during execution:

1. **Playwright E2E Execution Banner**:
   - Test suite status pill (Emerald `Passed`, Rose `Failed`, Amber `TimedOut`).
   - Browser target (`Chromium`, `Firefox`, `WebKit`), viewport dimensions ($1280 \times 720$).
   - Test duration timer and test file link.
2. **Interactive Media Grid**:
   - Filter bar: `All`, `Screenshots`, `Diagrams`, `Documents`, `Logs`.
   - Card presentation: Image thumbnail preview, aspect ratio container, asset title, timestamp, and size ($KB/MB$).
   - Click triggers `LightboxDialog`.
3. **Full Lightbox Modal (`LightboxDialog.tsx`)**:
   - High-resolution zoom ($100\%$ to $400\%$) and pan navigation.
   - Prev/Next keyboard navigation ($\leftarrow$ / $\rightarrow$) and Escape dismiss.
   - Metadata side panel: Dimension, MIME type, capture step, author node, download button.

```tsx
// Asset Card Component Specification
<div className="drawer-asset-card" onClick={() => openLightbox(index)}>
  <div className="drawer-asset-thumb-wrap">
    <img src={asset.url} alt={asset.title} className="drawer-asset-thumb" loading="lazy" />
    <span className="drawer-asset-zoom-hint">
      <IconMaximize size={14} />
    </span>
  </div>
  <div className="drawer-asset-meta">
    <span className="drawer-asset-title">{asset.title}</span>
    <span className="drawer-asset-size">{formatBytes(asset.sizeBytes)}</span>
  </div>
</div>
```

---

### 3.4 Executions & Diffs Tab (`CommandsTab.tsx` & `FilesTab.tsx`)

The Executions and Diffs tab renders tool calls and filesystem modifications:

1. **Command Execution Breakdown (`CommandsTab.tsx`)**:
   - Exit code status pill (`Exit 0` in emerald, `Exit 1` in rose).
   - Execution command line: `$ bun test src/components/Controls`.
   - Execution duration: `1.22s`.
   - Working directory path (`CWD`).
   - Log viewer: Split or tabbed `stdout` / `stderr` snippet viewers with line numbering, capped max height ($240\text{px}$), and scroll retention.
2. **File Churn & Diffs (`FilesTab.tsx`)**:
   - Assigned write scope header.
   - File modification list with mode (`write`, `read`, `create`, `delete`).
   - Churn metrics: `+142` in emerald, `-38` in crimson.
   - Line-level diff viewer with green/red background highlights for additions and deletions.

---

## 4. CSS Token & Design System Specifications

```css
/* NodeDetailDrawerTabs.css Upgrades */

.drawer-metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.drawer-metric {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drawer-metric--thinking {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.25);
}

.drawer-metric-label {
  font-size: 10.5px;
  color: #71717a;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.drawer-metric-value {
  font-size: 14px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  color: #fafafa;
}

/* Lightbox Styles */
.drawer-lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

---

## 5. Verification & Test Plan

1. **Unit Tests (`tests/drawerTabs.test.tsx`)**:
   - Test `OverviewTab` renders rich metrics (tokens, thinking tokens, cost, duration).
   - Test `IoTab` renders input and output accordions with copy buttons.
   - Test `AssetsTab` renders media cards and triggers lightbox state.
   - Test `CommandsTab` renders command cards with exit code pills and stdout snippets.
   - Test `FilesTab` renders touched files with additions/deletions badges.
2. **Visual Inspection Gate**:
   - Audit drawer rendering across responsive breakpoints ($375\text{px}$ mobile, $768\text{px}$ tablet, $1280\text{px}$ desktop) to verify zero horizontal overflow and proper z-index stacking.

---
