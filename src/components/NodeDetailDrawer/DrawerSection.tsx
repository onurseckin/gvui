import type { FC, ReactNode } from "react";
import { formatTokens } from "../../primitives/nodes/NodeCard/nodeCardModel";
import type { GraphEdgeData, IoPort } from "../../types/graphData";

export interface DrawerSectionProps {
  title: string;
  count?: number;
  children: ReactNode;
}

export const DrawerSection: FC<DrawerSectionProps> = ({ title, count, children }) => (
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

export const IoRow: FC<{ port: IoPort; peerName?: string; direction: "in" | "out" }> = ({
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

export function edgeToPort(edge: GraphEdgeData, direction: "in" | "out"): IoPort {
  return {
    node: direction === "in" ? edge.source : edge.target,
    kind: edge.handoff?.kind ?? "summary",
    label: edge.handoff?.summary ?? edge.condition ?? edge.label ?? "(handoff)",
    tokens: edge.handoff?.tokens,
  };
}
