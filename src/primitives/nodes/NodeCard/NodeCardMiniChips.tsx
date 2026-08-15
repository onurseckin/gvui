import type { FC } from "react";
import { memo } from "react";
import { IconAlertCircle, IconClock, IconCode, IconShieldCheck } from "@tabler/icons-react";
import type { GraphNodeData } from "../../../types/graphData";
import { formatDuration } from "./nodeCardModel";

export interface NodeCardMiniChipsProps {
  node: GraphNodeData;
}

export const NodeCardMiniChips: FC<NodeCardMiniChipsProps> = memo(({ node }) => {
  const chips: React.ReactNode[] = [];

  // Duration chip
  const durationMs = node.metrics?.durationMs ?? (node.metadata?.durationMs as number | undefined);
  if (typeof durationMs === "number" && durationMs > 0) {
    chips.push(
      <span key="duration-chip" className="node-card-mini-chip">
        <IconClock size={11} className="mini-chip-icon" />
        <span>{formatDuration(durationMs)}</span>
      </span>,
    );
  }

  // Commands / Tools chip
  const commands = (node.metadata?.commands as unknown[]) ?? [];
  const tools = node.tools ?? [];
  if (commands.length > 0) {
    chips.push(
      <span
        key="cmds-chip"
        className="node-card-mini-chip"
        title={`${commands.length} commands executed`}
      >
        <IconCode size={11} className="mini-chip-icon" />
        <span>{commands.length} cmds</span>
      </span>,
    );
  } else if (tools.length > 0) {
    chips.push(
      <span
        key="tools-chip"
        className="node-card-mini-chip"
        title={`${tools.length} tools available`}
      >
        <IconCode size={11} className="mini-chip-icon" />
        <span>{tools.length} tools</span>
      </span>,
    );
  }

  // Findings / Gate chip
  const findings = (node.metadata?.findings as unknown[]) ?? [];
  if (findings.length > 0) {
    chips.push(
      <span
        key="findings-chip"
        className="node-card-mini-chip chip-warning"
        title={`${findings.length} findings`}
      >
        <IconAlertCircle size={11} className="mini-chip-icon" />
        <span>{findings.length} issues</span>
      </span>,
    );
  } else if (node.kind === "gate" && node.status === "success") {
    chips.push(
      <span key="gate-chip" className="node-card-mini-chip chip-success" title="Validation passed">
        <IconShieldCheck size={11} className="mini-chip-icon" />
        <span>Passed</span>
      </span>,
    );
  }

  if (chips.length === 0) return null;

  return <div className="node-card-mini-chips-row">{chips}</div>;
});

NodeCardMiniChips.displayName = "NodeCardMiniChips";
