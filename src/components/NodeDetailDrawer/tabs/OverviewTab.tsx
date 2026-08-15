import {
  IconAlertTriangle,
  IconBrain,
  IconClock,
  IconCoins,
  IconRobot,
  IconSparkles,
} from "@tabler/icons-react";
import type { FC } from "react";
import type { GraphNodeData, IoPort } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { IoStreamItem } from "../IoStreamItem";
import { formatCost, formatDuration, formatTokens } from "../streamUtils";

interface OverviewTabProps {
  node: GraphNodeData;
  inputs: IoPort[];
  outputs: IoPort[];
  nodeNamesById: Map<string, string>;
}

/**
 * Merged "Overview & I/O" tab component presenting high-level metadata,
 * structured execution telemetry metrics (Tokens In/Out, Reasoning Tokens, Duration breakdown,
 * Cost USD, Repair Rounds), Host Agent card with tier & effort pills, and expandable stream accordions.
 */
export const OverviewTab: FC<OverviewTabProps> = ({ node, inputs, outputs, nodeNamesById }) => {
  const metrics = node.metrics;
  const timing =
    metrics?.timingBreakdown ??
    metrics?.timing ??
    node.metadata?.timingBreakdown ??
    node.metadata?.timing;
  const tokensDetail = metrics?.tokens ?? node.metadata?.tokens;

  const tokensIn = metrics?.tokensIn ?? tokensDetail?.promptTokens;
  const tokensOut = metrics?.tokensOut ?? tokensDetail?.completionTokens;
  const reasoningTokens = tokensDetail?.reasoningTokens;

  const wallDuration = metrics?.durationMs ?? timing?.wallDurationMs ?? node.metadata?.durationMs;
  const toolDuration = timing?.toolDurationMs ?? timing?.activeCommandDurationMs;
  const thinkDuration = timing?.thinkDurationMs ?? timing?.cognitiveLatencyMs;

  const costUsd = metrics?.costUsd;
  const repairRounds =
    node.metadata?.repairRounds ??
    metrics?.repairRounds ??
    (metrics?.retries && metrics.retries > 0 ? metrics.retries : 0);

  const hasMetrics =
    typeof tokensIn === "number" ||
    typeof tokensOut === "number" ||
    typeof reasoningTokens === "number" ||
    typeof wallDuration === "number" ||
    typeof toolDuration === "number" ||
    typeof thinkDuration === "number" ||
    typeof costUsd === "number" ||
    repairRounds > 0;

  // Host agent attribution
  const hostAgent = node.hostAgent ?? node.metadata?.hostAgent;
  const hostTool = hostAgent?.tool ?? hostAgent?.name ?? node.metadata?.leaseAgent;
  const hostModel = hostAgent?.model ?? node.model ?? node.harnessModel;
  const hostTier = hostAgent?.tier ?? node.tier;
  const reasoningEffort = hostAgent?.reasoningEffort ?? hostAgent?.thinkingLevel;
  const hasHostCard = Boolean(hostTool || hostModel || hostTier || reasoningEffort);

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

      {hasMetrics && (
        <DrawerSection title="Execution Metrics">
          <div className="drawer-metric-grid">
            {typeof tokensIn === "number" && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">Tokens In</span>
                <span className="drawer-metric-value">{formatTokens(tokensIn)}</span>
              </div>
            )}
            {typeof tokensOut === "number" && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">Tokens Out</span>
                <span className="drawer-metric-value">{formatTokens(tokensOut)}</span>
              </div>
            )}
            {typeof reasoningTokens === "number" && (
              <div className="drawer-metric drawer-metric--thinking">
                <span className="drawer-metric-label">
                  <IconBrain
                    size={11}
                    style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
                  />
                  Reasoning
                </span>
                <span className="drawer-metric-value">{formatTokens(reasoningTokens)}</span>
              </div>
            )}
            {typeof wallDuration === "number" && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">
                  <IconClock
                    size={11}
                    style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
                  />
                  Duration
                </span>
                <span className="drawer-metric-value">{formatDuration(wallDuration)}</span>
              </div>
            )}
            {typeof toolDuration === "number" && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">Active Cmds</span>
                <span className="drawer-metric-value">{formatDuration(toolDuration)}</span>
              </div>
            )}
            {typeof thinkDuration === "number" && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">Think Time</span>
                <span className="drawer-metric-value">{formatDuration(thinkDuration)}</span>
              </div>
            )}
            {typeof costUsd === "number" && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">
                  <IconCoins
                    size={11}
                    style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
                  />
                  Cost
                </span>
                <span className="drawer-metric-value">{formatCost(costUsd)}</span>
              </div>
            )}
            {repairRounds > 0 && (
              <div className="drawer-metric drawer-metric--warn">
                <span className="drawer-metric-label">
                  <IconAlertTriangle
                    size={11}
                    style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
                  />
                  Repair Rounds
                </span>
                <span className="drawer-metric-value">{repairRounds}</span>
              </div>
            )}
          </div>
        </DrawerSection>
      )}

      {hasHostCard && (
        <DrawerSection title="Host Agent Attribution">
          <div className="drawer-host-card">
            <div className="drawer-host-header">
              <span className="drawer-host-icon">
                <IconRobot size={18} />
              </span>
              <div className="drawer-host-info">
                <div className="drawer-host-name-row">
                  <span className="drawer-host-name">{hostTool || "Host Agent"}</span>
                  {hostTier && (
                    <span className={`drawer-tier-pill tier-${String(hostTier).toLowerCase()}`}>
                      {`Tier ${String(hostTier).toUpperCase()}`}
                    </span>
                  )}
                  {reasoningEffort && (
                    <span className="drawer-effort-pill">
                      <IconSparkles
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
                      />
                      {`Effort: ${reasoningEffort}`}
                    </span>
                  )}
                </div>
                {hostModel && (
                  <div className="drawer-host-model-row">
                    <span className="drawer-host-label">Model:</span>
                    <code className="drawer-host-model">{hostModel}</code>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DrawerSection>
      )}

      {inputs.length > 0 ? (
        <DrawerSection title="Input Streams" count={inputs.length}>
          <div className="drawer-stream-list">
            {inputs.map((port, index) => (
              <IoStreamItem
                key={`in-${port.node ?? "run"}-${index}`}
                port={port}
                peerName={port.node ? nodeNamesById.get(port.node) : undefined}
                direction="in"
              />
            ))}
          </div>
        </DrawerSection>
      ) : null}

      {outputs.length > 0 ? (
        <DrawerSection title="Output Streams" count={outputs.length}>
          <div className="drawer-stream-list">
            {outputs.map((port, index) => (
              <IoStreamItem
                key={`out-${port.node ?? "run"}-${index}`}
                port={port}
                peerName={port.node ? nodeNamesById.get(port.node) : undefined}
                direction="out"
              />
            ))}
          </div>
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
