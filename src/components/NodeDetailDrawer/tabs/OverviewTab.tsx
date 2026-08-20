import {
  IconAlertTriangle,
  IconBrain,
  IconClock,
  IconCoins,
  IconCpu,
  IconGitBranch,
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
import { EvidencedField, UnknownValue } from "../EvidenceChip";
import { IoStreamItem } from "../IoStreamItem";
import { nodeCarriesAgent, readBranchContext, readRole, readTelemetry } from "../nodeSchema";
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
 * Merged "Overview & I/O" tab: purpose, recorded execution metrics, the agent telemetry card with
 * every field carrying its provenance, the branch sub-task a sub-agent owns, the node's own
 * subagent lineage, and the expandable stream accordions.
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

  // Per-agent telemetry, canonical first. A field nobody reported renders as an explicit unknown.
  const telemetry = readTelemetry(node);
  const role = readRole(node);
  const hostTool = telemetry.host ?? metadata?.leaseAgent;
  const branch = readBranchContext(node, dataset);

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

      {nodeCarriesAgent(node) ? (
        <DrawerSection title="Host Agent Attribution">
          <div className="drawer-host-card">
            <div className="drawer-host-header">
              <span className="drawer-host-icon">
                <IconRobot size={18} />
              </span>
              <div className="drawer-host-info">
                <div className="drawer-host-name-row">
                  <span className="drawer-host-name">
                    {hostTool ?? <UnknownValue what="Host" />}
                  </span>
                  {role ? <span className="drawer-role-pill">{role}</span> : null}
                  {telemetry.agentId ? (
                    <code className="drawer-agent-id">{telemetry.agentId}</code>
                  ) : null}
                  {telemetry.grantStatus ? (
                    <span className="drawer-grant-status">{`grant: ${telemetry.grantStatus}`}</span>
                  ) : null}
                  {telemetry.modelTier ? (
                    <span
                      className={`drawer-tier-pill tier-${telemetry.modelTier.value.toLowerCase()}`}
                    >
                      {`Tier ${telemetry.modelTier.value.toUpperCase()}`}
                    </span>
                  ) : null}
                  {telemetry.thinkingLevel ? (
                    <span className="drawer-effort-pill">
                      <IconSparkles
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
                      />
                      {`Thinking Level: ${telemetry.thinkingLevel.value}`}
                    </span>
                  ) : null}
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

                <div className="drawer-telemetry-fields" data-testid="telemetry-fields">
                  <EvidencedField label="Model" field={telemetry.model} />
                  <EvidencedField label="Tier" field={telemetry.modelTier} />
                  <EvidencedField label="Thinking Level" field={telemetry.thinkingLevel} />
                  <EvidencedField
                    label="Tokens In"
                    field={telemetry.tokensIn}
                    format={(value) => formatTokens(Number(value))}
                  />
                  <EvidencedField
                    label="Tokens Out"
                    field={telemetry.tokensOut}
                    format={(value) => formatTokens(Number(value))}
                  />
                </div>
              </div>
            </div>
          </div>
        </DrawerSection>
      ) : null}

      {branch ? (
        <DrawerSection title="Branch Sub-task">
          <div className="drawer-branch-card" data-testid="branch-context">
            <div className="drawer-branch-head">
              <IconGitBranch size={14} />
              <span className="drawer-branch-title">
                {branch.sectionTitle ?? `Branch ${branch.branchId ?? ""}`.trim()}
              </span>
              {branch.subTaskStatus ? (
                <span className="drawer-branch-status">{branch.subTaskStatus}</span>
              ) : null}
            </div>

            <ul className="drawer-kv-list">
              <li className="drawer-kv-row">
                <span className="drawer-kv-key">Sub-task owned</span>
                <span className="drawer-kv-value">
                  {branch.subTaskId ? `${branch.subTaskId} — ${node.name}` : node.name}
                </span>
              </li>
              <li className="drawer-kv-row">
                <span className="drawer-kv-key">Branch reason</span>
                <span className="drawer-kv-value" data-testid="branch-reason">
                  {branch.reason ?? <UnknownValue what="Branch reason" />}
                </span>
              </li>
              <li className="drawer-kv-row">
                <span className="drawer-kv-key">Parent task</span>
                <span className="drawer-kv-value">
                  {branch.parentTaskId ?? <UnknownValue what="Parent task" />}
                </span>
              </li>
              {branch.depth !== undefined ? (
                <li className="drawer-kv-row">
                  <span className="drawer-kv-key">Branch depth</span>
                  <span className="drawer-kv-value">{branch.depth}</span>
                </li>
              ) : null}
              {branch.gate ? (
                <li className="drawer-kv-row">
                  <span className="drawer-kv-key">Gate</span>
                  <span className="drawer-kv-value">{branch.gate}</span>
                </li>
              ) : null}
            </ul>

            {branch.writeScope && branch.writeScope.length > 0 ? (
              <div className="drawer-chip-wrap">
                {branch.writeScope.map((scope) => (
                  <span key={scope} className="drawer-chip">
                    {scope}
                  </span>
                ))}
              </div>
            ) : null}

            {branch.summary ? <p className="drawer-prose">{branch.summary}</p> : null}
          </div>
        </DrawerSection>
      ) : null}

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
                onSelectNode={onSelectNode}
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
                onSelectNode={onSelectNode}
              />
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
