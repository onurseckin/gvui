import type { FC, ReactNode } from "react";
import { formatTokens } from "../../primitives/nodes/NodeCard/nodeCardModel";
import type { IoPort } from "../../types/graphData";

export interface DrawerSectionProps {
  title: string;
  count?: number;
  children: ReactNode;
}

/**
 * Common container section for drawer sub-views with repository standard typography.
 */
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

/**
 * Compact row renderer for legacy or auxiliary list views.
 */
export const IoRow: FC<{
  port: IoPort;
  peerName?: string;
  direction: "in" | "out";
}> = ({ port, peerName, direction }) => {
  const isGenericSummary = !port.kind || port.kind === "summary";
  return (
    <li className="drawer-io-row">
      <span className={`drawer-io-arrow drawer-io-arrow--${direction}`} aria-hidden="true">
        {direction === "in" ? "←" : "→"}
      </span>
      <div className="drawer-io-main">
        <span className="drawer-io-label">{port.label}</span>
        <div className="drawer-io-meta">
          {!isGenericSummary ? (
            <span className={`drawer-payload-tag payload-${port.kind}`}>
              {PAYLOAD_LABELS[port.kind] ?? port.kind}
            </span>
          ) : null}
          {peerName ? <span className="drawer-io-peer">{peerName}</span> : null}
          {typeof port.tokens === "number" ? (
            <span className="drawer-io-tokens">{formatTokens(port.tokens)} tok</span>
          ) : null}
        </div>
      </div>
    </li>
  );
};
