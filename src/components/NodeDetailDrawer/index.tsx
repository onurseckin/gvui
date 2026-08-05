import type { CSSProperties, FC, ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo } from "react";
import { describeNodeKind, describeNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";
import {
  formatCost,
  formatDuration,
  formatTokens,
} from "../../primitives/nodes/NodeCard/nodeCardModel";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphEdgeData, GraphNodeData, IoPort } from "../../types/graphData";
import "./NodeDetailDrawer.css";

interface DrawerSectionProps {
  title: string;
  count?: number;
  children: ReactNode;
}

const DrawerSection: FC<DrawerSectionProps> = ({ title, count, children }) => (
  <section className="drawer-section">
    <h4 className="drawer-section-title">
      {title}
      {typeof count === "number" ? <span className="drawer-section-count">{count}</span> : null}
    </h4>
    {children}
  </section>
);

const PAYLOAD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "full-context": "full context",
  summary: "summary",
  artifact: "artifact",
  decision: "decision",
  file: "file",
  prompt: "prompt",
});

/**
 * One row of the Inputs/Outputs lists.
 *
 * The payload kind is given as much visual weight as the label because it is the question this
 * whole view exists to answer: handing a subagent the entire transcript and handing it a one-line
 * summary look identical on the canvas, and cost wildly different amounts.
 */
const IoRow: FC<{ port: IoPort; peerName?: string; direction: "in" | "out" }> = ({
  port,
  peerName,
  direction,
}) => (
  <li className="drawer-io-row">
    <span className={`drawer-io-arrow drawer-io-arrow--${direction}`} aria-hidden="true">
      {direction === "in" ? "←" : "→"}
    </span>
    <div className="drawer-io-main">
      <span className="drawer-io-label">{port.label}</span>
      <span className="drawer-io-meta">
        <span className={`drawer-payload-tag payload-${port.kind}`}>
          {PAYLOAD_LABELS[port.kind] ?? port.kind}
        </span>
        {peerName ? <span className="drawer-io-peer">{peerName}</span> : null}
        {typeof port.tokens === "number" ? (
          <span className="drawer-io-tokens">{formatTokens(port.tokens)} tok</span>
        ) : null}
      </span>
    </div>
  </li>
);

function edgeToPort(edge: GraphEdgeData, direction: "in" | "out"): IoPort {
  return {
    node: direction === "in" ? edge.source : edge.target,
    kind: edge.handoff?.kind ?? "summary",
    label: edge.handoff?.summary ?? edge.condition ?? edge.label ?? "(handoff)",
    tokens: edge.handoff?.tokens,
  };
}

/**
 * The right-hand detail panel for the selected node.
 *
 * Everything a node knows that will not fit inside a laid-out box on the canvas lives here: the
 * full prompt, the context that crossed each edge, produced output, logs, and the raw payload. The
 * card stays a label; this is the document behind it.
 *
 * Rendered as an overlay rather than a flex sibling of the canvas on purpose — taking width from
 * the canvas would resize its viewport and re-fit the graph every time a node was clicked.
 */
export const NodeDetailDrawer: FC = memo(function NodeDetailDrawer() {
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const dataset = useGraphStore((state) => state.dataset);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);

  const handleClose = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setSelectedNodeId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedNodeId, setSelectedNodeId]);

  const node: GraphNodeData | null = useMemo(() => {
    if (!selectedNodeId || !dataset) return null;
    return dataset.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
  }, [selectedNodeId, dataset]);

  const nodeNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const candidate of dataset?.nodes ?? []) map.set(candidate.id, candidate.name);
    return map;
  }, [dataset]);

  const { inputs, outputs } = useMemo(() => {
    if (!node) return { inputs: [] as IoPort[], outputs: [] as IoPort[] };

    // Explicit `io` wins; otherwise the edges themselves describe what crossed, which is the
    // common case for a harness that emits a graph without annotating both sides.
    const declaredIn = node.io?.inputs ?? [];
    const declaredOut = node.io?.outputs ?? [];
    const edges = dataset?.edges ?? [];

    return {
      inputs:
        declaredIn.length > 0
          ? declaredIn
          : edges.filter((e) => e.target === node.id).map((e) => edgeToPort(e, "in")),
      outputs:
        declaredOut.length > 0
          ? declaredOut
          : edges.filter((e) => e.source === node.id).map((e) => edgeToPort(e, "out")),
    };
  }, [node, dataset]);

  if (!node) {
    return null;
  }

  const kind = describeNodeKind(node);
  const status = describeNodeStatus(node);
  const metrics = node.metrics;

  const contextRows: Array<{ key: string; value: string }> = [];
  if (node.context?.repoPath) {
    contextRows.push({ key: "repoPath", value: String(node.context.repoPath) });
  }
  for (const [key, value] of Object.entries(node.context ?? {})) {
    if (key === "repoPath" || key === "previousOutputs") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      contextRows.push({ key, value: String(value) });
    }
  }

  return (
    <aside className="node-drawer" role="complementary" aria-label={`Details for ${node.name}`}>
      <header
        className="drawer-header"
        style={{ "--node-kind-accent": kind.accent } as CSSProperties}
      >
        <div className="drawer-header-top">
          <svg
            className="drawer-kind-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke={kind.accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {kind.icon}
          </svg>
          <h2 className="drawer-title">{node.name}</h2>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={handleClose}
            aria-label="Close details"
            title="Close (Esc)"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="drawer-header-meta">
          <span className="drawer-kind-label">{kind.label}</span>
          <span className="drawer-status-pill" style={{ color: status.color }}>
            <span className="drawer-status-dot" />
            {status.label}
          </span>
          {node.model ? <span className="drawer-model">{node.model}</span> : null}
          {node.harnessModel ? (
            <span className="drawer-model drawer-model--harness">harness: {node.harnessModel}</span>
          ) : null}
          <code className="drawer-id">{node.id}</code>
        </div>
      </header>

      <div className="drawer-body">
        {node.description ? (
          <DrawerSection title="Purpose">
            <p className="drawer-prose">{node.description}</p>
          </DrawerSection>
        ) : null}

        {metrics ? (
          <DrawerSection title="Metrics">
            <div className="drawer-metric-grid">
              {typeof metrics.tokensIn === "number" ? (
                <div className="drawer-metric">
                  <span className="drawer-metric-label">Tokens in</span>
                  <span className="drawer-metric-value">{formatTokens(metrics.tokensIn)}</span>
                </div>
              ) : null}
              {typeof metrics.tokensOut === "number" ? (
                <div className="drawer-metric">
                  <span className="drawer-metric-label">Tokens out</span>
                  <span className="drawer-metric-value">{formatTokens(metrics.tokensOut)}</span>
                </div>
              ) : null}
              {typeof metrics.durationMs === "number" ? (
                <div className="drawer-metric">
                  <span className="drawer-metric-label">Duration</span>
                  <span className="drawer-metric-value">{formatDuration(metrics.durationMs)}</span>
                </div>
              ) : null}
              {typeof metrics.costUsd === "number" ? (
                <div className="drawer-metric">
                  <span className="drawer-metric-label">Cost</span>
                  <span className="drawer-metric-value">{formatCost(metrics.costUsd)}</span>
                </div>
              ) : null}
              {typeof metrics.retries === "number" && metrics.retries > 0 ? (
                <div className="drawer-metric drawer-metric--warn">
                  <span className="drawer-metric-label">Retries</span>
                  <span className="drawer-metric-value">{metrics.retries}</span>
                </div>
              ) : null}
            </div>
          </DrawerSection>
        ) : null}

        {inputs.length > 0 ? (
          <DrawerSection title="Inputs" count={inputs.length}>
            <ul className="drawer-io-list">
              {inputs.map((port, index) => (
                <IoRow
                  key={`in-${port.node ?? "run"}-${index}`}
                  port={port}
                  peerName={port.node ? nodeNamesById.get(port.node) : undefined}
                  direction="in"
                />
              ))}
            </ul>
          </DrawerSection>
        ) : null}

        {outputs.length > 0 ? (
          <DrawerSection title="Outputs" count={outputs.length}>
            <ul className="drawer-io-list">
              {outputs.map((port, index) => (
                <IoRow
                  key={`out-${port.node ?? "run"}-${index}`}
                  port={port}
                  peerName={port.node ? nodeNamesById.get(port.node) : undefined}
                  direction="out"
                />
              ))}
            </ul>
          </DrawerSection>
        ) : null}

        {node.tools && node.tools.length > 0 ? (
          <DrawerSection title="Tools" count={node.tools.length}>
            <div className="drawer-chip-wrap">
              {node.tools.map((tool, index) => (
                <span key={`${tool.name}-${index}`} className="drawer-chip">
                  {tool.name}
                </span>
              ))}
            </div>
          </DrawerSection>
        ) : null}

        {node.files && node.files.length > 0 ? (
          <DrawerSection title="Files" count={node.files.length}>
            <ul className="drawer-file-list">
              {node.files.map((file, index) => (
                <li key={`${file.path}-${index}`} className="drawer-file-row">
                  <span className={`drawer-file-mode mode-${file.mode ?? "read"}`}>
                    {file.mode ?? "read"}
                  </span>
                  <code className="drawer-file-path">
                    {file.path}
                    {file.lines ? `:${file.lines}` : ""}
                  </code>
                </li>
              ))}
            </ul>
          </DrawerSection>
        ) : null}

        {node.badges && node.badges.length > 0 ? (
          <DrawerSection title="Badges">
            <div className="drawer-chip-wrap">
              {node.badges.map((badge, index) => (
                <span
                  key={`${badge.label}-${index}`}
                  className={`drawer-chip badge-${badge.variant ?? "gray"}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          </DrawerSection>
        ) : null}

        {node.prompt ? (
          <DrawerSection title="Prompt">
            <pre className="drawer-pre">{node.prompt}</pre>
          </DrawerSection>
        ) : null}

        {node.output ? (
          <DrawerSection title="Output">
            <pre className="drawer-pre">{node.output}</pre>
          </DrawerSection>
        ) : null}

        {node.logs ? (
          <DrawerSection title="Logs">
            <pre className="drawer-pre drawer-pre--logs">{node.logs}</pre>
          </DrawerSection>
        ) : null}

        {contextRows.length > 0 ? (
          <DrawerSection title="Context">
            <ul className="drawer-kv-list">
              {contextRows.map((row) => (
                <li key={row.key} className="drawer-kv-row">
                  <span className="drawer-kv-key">{row.key}</span>
                  <span className="drawer-kv-value">{row.value}</span>
                </li>
              ))}
            </ul>
          </DrawerSection>
        ) : null}

        {node.context?.previousOutputs && node.context.previousOutputs.length > 0 ? (
          <DrawerSection title="Upstream summaries" count={node.context.previousOutputs.length}>
            <ul className="drawer-kv-list">
              {node.context.previousOutputs.map((entry, index) => (
                <li key={`${entry.fromNode}-${index}`} className="drawer-kv-row">
                  <span className="drawer-kv-key">
                    {nodeNamesById.get(entry.fromNode) ?? entry.fromNode}
                  </span>
                  <span className="drawer-kv-value">{entry.summary}</span>
                </li>
              ))}
            </ul>
          </DrawerSection>
        ) : null}

        {node.metadata && Object.keys(node.metadata).length > 0 ? (
          <DrawerSection title="Raw metadata">
            <pre className="drawer-pre">{JSON.stringify(node.metadata, null, 2)}</pre>
          </DrawerSection>
        ) : null}
      </div>
    </aside>
  );
});

export default NodeDetailDrawer;
