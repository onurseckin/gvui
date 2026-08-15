import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconCpu,
  IconFileText,
} from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { formatTokens } from "../../primitives/nodes/NodeCard/nodeCardModel";
import type { IoPort } from "../../types/graphData";
import { formatBytes, getByteLength } from "./streamUtils";

export interface IoStreamItemProps {
  port: IoPort;
  peerName?: string;
  direction: "in" | "out";
  defaultExpanded?: boolean;
}

/**
 * Interactive, expandable/collapsible accordion item for Input & Output streams.
 * Includes unclipped payload rendering, clipboard copy, byte/token counters,
 * and eliminates boilerplate `(handoff)` text and redundant `SUMMARY` pills.
 */
export const IoStreamItem: FC<IoStreamItemProps> = ({
  port,
  peerName,
  direction,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Normalize label to eliminate repetitive generic boilerplate
  const displayLabel = useMemo(() => {
    const raw = (port.label ?? "").trim();
    if (!raw || raw === "(handoff)" || raw.toLowerCase() === "summary") {
      if (peerName) {
        return direction === "in" ? `From ${peerName}` : `To ${peerName}`;
      }
      return direction === "in" ? "Input Stream" : "Output Stream";
    }
    return raw;
  }, [port.label, peerName, direction]);

  const payloadText = port.preview ?? "";
  const byteCount = useMemo(() => getByteLength(payloadText), [payloadText]);

  const handleCopy = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const textToCopy = payloadText || displayLabel;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy).catch(() => {
          // Clipboard write failure handled gracefully in headless environments
        });
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [payloadText, displayLabel],
  );

  // Redundant summary pills are suppressed; only specific payload kinds get pills
  const isGenericSummary = !port.kind || port.kind === "summary";

  return (
    <div className={`drawer-stream-accordion ${isExpanded ? "is-expanded" : "is-collapsed"}`}>
      <button
        type="button"
        className="drawer-stream-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-label={`Toggle stream details for ${displayLabel}`}
      >
        <div className="drawer-stream-header-left">
          <span className="drawer-stream-toggle" aria-hidden="true">
            {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </span>
          <span className="drawer-stream-title">{displayLabel}</span>
          {peerName ? (
            <span className="drawer-stream-peer">
              {direction === "in" ? "src:" : "tgt:"} <code>{peerName}</code>
            </span>
          ) : null}
        </div>

        <div className="drawer-stream-header-right">
          {!isGenericSummary ? (
            <span className={`drawer-payload-tag payload-${port.kind}`}>{port.kind}</span>
          ) : null}
          {typeof port.tokens === "number" ? (
            <span className="drawer-stream-chip drawer-stream-chip--tokens">
              {formatTokens(port.tokens)} tok
            </span>
          ) : null}
          {byteCount > 0 ? (
            <span className="drawer-stream-chip drawer-stream-chip--bytes">
              {formatBytes(byteCount)}
            </span>
          ) : null}
        </div>
      </button>

      {isExpanded ? (
        <div className="drawer-stream-body">
          <div className="drawer-stream-toolbar">
            <div className="drawer-stream-counters">
              {typeof port.tokens === "number" ? (
                <span className="drawer-stream-counter-item">
                  <IconCpu size={12} /> {formatTokens(port.tokens)} tokens
                </span>
              ) : null}
              {byteCount > 0 ? (
                <span className="drawer-stream-counter-item">
                  <IconFileText size={12} /> {formatBytes(byteCount)}
                </span>
              ) : null}
            </div>
            {payloadText ? (
              <button
                type="button"
                className={`drawer-copy-btn ${copied ? "is-copied" : ""}`}
                onClick={handleCopy}
                aria-label="Copy stream payload"
                title="Copy stream payload to clipboard"
              >
                {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                <span>{copied ? "Copied!" : "Copy"}</span>
              </button>
            ) : null}
          </div>

          {payloadText ? (
            <pre className="drawer-pre drawer-stream-payload">{payloadText}</pre>
          ) : port.dataRef ? (
            <div className="drawer-stream-dataref">
              Reference: <code>{port.dataRef}</code>
            </div>
          ) : (
            <div className="drawer-stream-empty">No payload content recorded for this stream.</div>
          )}
        </div>
      ) : null}
    </div>
  );
};
