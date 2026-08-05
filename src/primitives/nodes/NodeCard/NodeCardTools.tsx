import type { FC, ReactNode } from "react";
import { memo } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import {
  classifyTool,
  formatOverflowLabel,
  selectToolChips,
  type ToolIconKind,
} from "./nodeCardModel";

const TOOL_ICONS: Readonly<Record<ToolIconKind, ReactNode>> = Object.freeze({
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  shell: <path d="M4 17l6-5-6-5M12 19h8" />,
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  web: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18-2.5-2.7-2.5-15.3 0-18z" />
    </>
  ),
  generic: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </>
  ),
});

export interface NodeCardToolsProps {
  node: GraphNodeData;
}

/**
 * Tool chips, capped by `selectToolChips` so the row can never outgrow the box the layout engine
 * reserved for it. Icons are inline SVG rather than the emoji this used to render: emoji carry the
 * platform's own colour and metrics, so the same graph measured differently on macOS and Linux and
 * put a fleck of unthemed colour on an otherwise strictly themed card.
 */
export const NodeCardTools: FC<NodeCardToolsProps> = memo(({ node }) => {
  const { shown, overflow } = selectToolChips(node);
  if (shown.length === 0) {
    return null;
  }

  return (
    <div className="node-card-chip-row">
      {shown.map((name, index) => (
        <span key={`${name}-${index}`} className="node-chip node-chip--tool" title={name}>
          <svg
            className="node-chip-icon"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {TOOL_ICONS[classifyTool(name)]}
          </svg>
          <span className="node-chip-label">{name}</span>
        </span>
      ))}
      {overflow > 0 ? (
        <span className="node-chip node-chip--overflow" title={`${overflow} more`}>
          <span className="node-chip-label">{formatOverflowLabel(overflow)}</span>
        </span>
      ) : null}
    </div>
  );
});

NodeCardTools.displayName = "NodeCardTools";
