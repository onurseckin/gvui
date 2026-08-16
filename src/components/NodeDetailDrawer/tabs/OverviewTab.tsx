import {
  IconAlertTriangle,
  IconBrain,
  IconClock,
  IconCoins,
  IconCpu,
  IconRobot,
  IconSparkles,
} from "@tabler/icons-react";
import type { FC } from "react";
import type {
  CommandExecutionDetail,
  GraphDataset,
  GraphNodeData,
  IoPort,
} from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { IoStreamItem } from "../IoStreamItem";
import { formatBytes, formatCost, formatDuration, formatTokens } from "../streamUtils";
import { SubagentLineageTree } from "./SubagentLineageTree";

interface ExtendedMetadata {
  timingBreakdown?: {
    wallDurationMs?: number;
    toolDurationMs?: number;
    activeCommandDurationMs?: number;
    thinkDurationMs?: number;
    cognitiveLatencyMs?: number;
    [key: string]: unknown;
  };
  timing?: {
    wallDurationMs?: number;
    toolDurationMs?: number;
    activeCommandDurationMs?: number;
    thinkDurationMs?: number;
    cognitiveLatencyMs?: number;
    [key: string]: unknown;
  };
  tokens?: {
    promptTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    cognitiveTokens?: number;
    [key: string]: unknown;
  };
  memoryMb?: number;
  memoryBytes?: number;
  memoryFootprint?: string | number;
  cognitiveTokens?: number;
  thinkingLevel?: string;
  reasoningEffort?: string;
  repairAttempts?: number;
  repairRounds?: number;
  hostModel?: string;
  commands?: CommandExecutionDetail[];
  leaseAgent?: string;
  hostAgent?: {
    tool?: string;
    name?: string;
    model?: string;
    tier?: string;
    reasoningEffort?: string;
    thinkingLevel?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface OverviewTabProps {
  node: GraphNodeData;
  inputs: IoPort[];
  outputs: IoPort[];
  nodeNamesById: Map<string, string>;
  onSelectNode?: (nodeId: string) => void;
  dataset?: GraphDataset | null;
}

/**
 * Merged "Overview & I/O" tab component presenting high-level metadata,
 * humanized execution verification status, structured execution telemetry metrics
 * (Tokens In/Out, Cognitive Tokens, Duration & Memory Footprint breakdown,
 * Cost USD, Repair Rounds), Host Agent card with tier, thinking level, and repair attempt badges,
 * subagent lineage & hierarchical execution call tree, and expandable stream accordions.
 */
export const OverviewTab: FC<OverviewTabProps> = ({
  node,
  inputs,
  outputs,
  nodeNamesById,
  onSelectNode,
  dataset,
}) => {
  const metrics = node.metrics;
  const metadata = node.metadata as ExtendedMetadata | undefined;
  const timing =
    metrics?.timingBreakdown ?? metrics?.timing ?? metadata?.timingBreakdown ?? metadata?.timing;
  const tokensDetail = metrics?.tokens ?? metadata?.tokens;

  const tokensIn = metrics?.tokensIn ?? tokensDetail?.promptTokens;
  const tokensOut = metrics?.tokensOut ?? tokensDetail?.completionTokens;
  const cognitiveTokens =
    (metrics as { cognitiveTokens?: number } | undefined)?.cognitiveTokens ??
    (tokensDetail as { cognitiveTokens?: number } | undefined)?.cognitiveTokens ??
    metadata?.cognitiveTokens ??
    tokensDetail?.reasoningTokens;

  const wallDuration = metrics?.durationMs ?? timing?.wallDurationMs ?? metadata?.durationMs;
  const toolDuration = timing?.toolDurationMs ?? timing?.activeCommandDurationMs;
  const thinkDuration = timing?.thinkDurationMs ?? timing?.cognitiveLatencyMs;

  const memoryMb = (metrics as { memoryMb?: number } | undefined)?.memoryMb ?? metadata?.memoryMb;
  const memoryBytes =
    (metrics as { memoryBytes?: number } | undefined)?.memoryBytes ?? metadata?.memoryBytes;
  const memoryFootprint =
    (metrics as { memoryFootprint?: string | number } | undefined)?.memoryFootprint ??
    metadata?.memoryFootprint ??
    (typeof memoryMb === "number"
      ? `${memoryMb} MB`
      : typeof memoryBytes === "number"
        ? formatBytes(memoryBytes)
        : undefined);

  const costUsd = metrics?.costUsd;
  const repairRounds =
    metadata?.repairRounds ??
    metadata?.repairAttempts ??
    metrics?.repairRounds ??
    (metrics?.retries && metrics.retries > 0 ? metrics.retries : 0);

  const commands = (metadata?.commands ?? []) as CommandExecutionDetail[];
  const hasCommands = commands.length > 0;
  const anyCommandFailed = commands.some((c) => c.exitCode !== 0);
  const allCommandsSucceeded = hasCommands && !anyCommandFailed;

  const isPushback =
    anyCommandFailed || node.status === "error" || node.status === "warning" || repairRounds > 0;

  const isCleanExecution =
    !isPushback && (allCommandsSucceeded || (node.status === "success" && !anyCommandFailed));

  const hasMetrics =
    typeof tokensIn === "number" ||
    typeof tokensOut === "number" ||
    typeof cognitiveTokens === "number" ||
    typeof wallDuration === "number" ||
    typeof toolDuration === "number" ||
    typeof thinkDuration === "number" ||
    typeof costUsd === "number" ||
    Boolean(memoryFootprint) ||
    repairRounds > 0 ||
    hasCommands;

  // Host agent attribution
  const hostAgent = node.hostAgent ?? metadata?.hostAgent;
  const hostTool = hostAgent?.tool ?? hostAgent?.name ?? metadata?.leaseAgent;
  const hostModel = hostAgent?.model ?? node.model ?? node.harnessModel ?? metadata?.hostModel;
  const hostTier = hostAgent?.tier ?? node.tier;
  const thinkingLevel =
    hostAgent?.thinkingLevel ??
    hostAgent?.reasoningEffort ??
    metadata?.thinkingLevel ??
    metadata?.reasoningEffort ??
    (node as { thinkingLevel?: string })?.thinkingLevel ??
    (node as { reasoningEffort?: string })?.reasoningEffort;

  const hasHostCard = Boolean(
    hostTool ||
    hostModel ||
    hostTier ||
    thinkingLevel ||
    typeof cognitiveTokens === "number" ||
    repairRounds > 0,
  );

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
          {(hasCommands || node.status) && (
            <div
              className="drawer-execution-status-row"
              style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}
            >
              {isCleanExecution ? (
                <span className="drawer-command-exit is-success">✅ Verified Clean Execution</span>
              ) : isPushback ? (
                <span className="drawer-command-exit is-error">⚠️ Validation Gate Pushback</span>
              ) : null}
            </div>
          )}

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
            {typeof cognitiveTokens === "number" && (
              <div className="drawer-metric drawer-metric--thinking">
                <span className="drawer-metric-label">
                  <IconBrain
                    size={11}
                    style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
                  />
                  Cognitive Tokens (Reasoning)
                </span>
                <span className="drawer-metric-value">{formatTokens(cognitiveTokens)}</span>
              </div>
            )}
            {typeof wallDuration === "number" && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">
                  <IconClock
                    size={11}
                    style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
                  />
                  ⏱️ Duration & Memory Footprint
                </span>
                <span className="drawer-metric-value">
                  {formatDuration(wallDuration)}
                  {memoryFootprint ? ` · ${memoryFootprint}` : ""}
                </span>
              </div>
            )}
            {typeof wallDuration !== "number" && memoryFootprint && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">
                  <IconCpu
                    size={11}
                    style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
                  />
                  Memory Footprint
                </span>
                <span className="drawer-metric-value">{memoryFootprint}</span>
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
                  {thinkingLevel && (
                    <span className="drawer-effort-pill">
                      <IconSparkles
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
                      />
                      {`Thinking Level: ${thinkingLevel}`}
                    </span>
                  )}
                  {typeof cognitiveTokens === "number" && (
                    <span
                      className="drawer-effort-pill"
                      style={{
                        background: "rgba(99, 102, 241, 0.12)",
                        borderColor: "rgba(99, 102, 241, 0.3)",
                        color: "#a5b4fc",
                      }}
                    >
                      <IconBrain
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
                      />
                      {`${formatTokens(cognitiveTokens)} Cognitive Tokens`}
                    </span>
                  )}
                  {repairRounds > 0 && (
                    <span
                      className="drawer-effort-pill"
                      style={{
                        background: "rgba(245, 158, 11, 0.12)",
                        borderColor: "rgba(245, 158, 11, 0.35)",
                        color: "#fcd34d",
                      }}
                    >
                      <IconAlertTriangle
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
                      />
                      {`Repair Attempts: ${repairRounds}`}
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

      <SubagentLineageTree node={node} dataset={dataset} onSelectNode={onSelectNode} />

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
