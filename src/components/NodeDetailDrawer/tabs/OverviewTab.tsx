import type { FC } from "react";
import {
  formatCost,
  formatDuration,
  formatTokens,
} from "../../../primitives/nodes/NodeCard/nodeCardModel";
import type { GraphNodeData, IoPort } from "../../../types/graphData";
import { DrawerSection, IoRow } from "../DrawerSection";

interface OverviewTabProps {
  node: GraphNodeData;
  inputs: IoPort[];
  outputs: IoPort[];
  nodeNamesById: Map<string, string>;
}

export const OverviewTab: FC<OverviewTabProps> = ({ node, inputs, outputs, nodeNamesById }) => {
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
    <div className="drawer-tab-content">
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
    </div>
  );
};
