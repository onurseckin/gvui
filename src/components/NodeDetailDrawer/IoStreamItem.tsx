import {
  IconAlignLeft,
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconCpu,
  IconFileText,
  IconMaximize,
  IconX,
} from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { formatTokens } from "../../primitives/nodes/NodeCard/nodeCardModel";
import type { IoPort } from "../../types/graphData";
import { copyToClipboard, formatBytes, getByteLength } from "./streamUtils";

export interface IoStreamItemProps {
  port: IoPort;
  peerName?: string;
  direction: "in" | "out";
  defaultExpanded?: boolean;
  onSelectNode?: (nodeId: string) => void;
}

/**
 * Interactive, expandable/collapsible accordion item for Input & Output streams.
 * Includes structured kind pills, unclipped payload rendering, clipboard copy with feedback,
 * token footprint counters, source/target node jump navigation, and expandable payload modal.
 */
export const IoStreamItem: FC<IoStreamItemProps> = ({
  port,
  peerName,
  direction,
  defaultExpanded = true,
  onSelectNode,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const wordCount = useMemo(() => {
    const trimmed = payloadText.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [payloadText]);

  const estimatedTokens = useMemo(() => {
    if (typeof port.tokens === "number") return port.tokens;
    if (!payloadText) return undefined;
    // Standard rule of thumb: ~4 bytes per token for typical code / prose
    return Math.max(1, Math.ceil(byteCount / 4));
  }, [port.tokens, payloadText, byteCount]);

  const handleCopy = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const textToCopy = payloadText || displayLabel;
      await copyToClipboard(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [payloadText, displayLabel],
  );

  const payloadKind = port.kind || "summary";
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
          {port.node && onSelectNode ? (
            <span
              className="drawer-stream-jump-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(port.node!);
              }}
              title={`Navigate to ${peerName ?? port.node}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onSelectNode(port.node!);
                }
              }}
            >
              <span>{direction === "in" ? "src:" : "tgt:"}</span>
              <code>{peerName ?? port.node}</code>
              <IconArrowUpRight size={11} />
            </span>
          ) : peerName ? (
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
          ) : estimatedTokens !== undefined ? (
            <span
              className="drawer-stream-chip drawer-stream-chip--tokens"
              title="Estimated token count"
            >
              ~{formatTokens(estimatedTokens)} tok
            </span>
          ) : null}
          {wordCount > 0 ? (
            <span className="drawer-stream-chip drawer-stream-chip--words">
              {wordCount.toLocaleString()} words
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
              ) : estimatedTokens !== undefined ? (
                <span className="drawer-stream-counter-item">
                  <IconCpu size={12} /> ~{formatTokens(estimatedTokens)} tokens (est)
                </span>
              ) : null}
              {wordCount > 0 ? (
                <span className="drawer-stream-counter-item">
                  <IconAlignLeft size={12} /> {wordCount.toLocaleString()} words
                </span>
              ) : null}
              {byteCount > 0 ? (
                <span className="drawer-stream-counter-item">
                  <IconFileText size={12} /> {formatBytes(byteCount)}
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {payloadText ? (
                <>
                  <button
                    type="button"
                    className="drawer-copy-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsModalOpen(true);
                    }}
                    aria-label="Expand payload in modal dialog"
                    title="Expand payload modal"
                  >
                    <IconMaximize size={12} />
                    <span>Expand</span>
                  </button>
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
                </>
              ) : null}
            </div>
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

      {isModalOpen && (
        <div
          className="drawer-lightbox-overlay"
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Stream Payload: ${displayLabel}`}
        >
          <div
            className="drawer-lightbox-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "800px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <header className="drawer-lightbox-header">
              <div className="drawer-lightbox-header-left">
                <span className={`drawer-payload-tag payload-${payloadKind}`}>{payloadKind}</span>
                <div className="drawer-lightbox-title-wrap">
                  <h3 className="drawer-lightbox-title">{displayLabel}</h3>
                  {peerName && (
                    <span className="drawer-lightbox-counter">
                      {direction === "in" ? "From" : "To"} {peerName}
                    </span>
                  )}
                </div>
              </div>
              <div className="drawer-lightbox-header-actions">
                <button
                  type="button"
                  className={`drawer-copy-btn ${copied ? "is-copied" : ""}`}
                  onClick={handleCopy}
                  aria-label="Copy payload"
                >
                  {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  className="drawer-lightbox-action-btn drawer-lightbox-close-btn"
                  onClick={() => setIsModalOpen(false)}
                  title="Close (Esc)"
                  aria-label="Close dialog"
                >
                  <IconX size={18} />
                </button>
              </div>
            </header>
            <div style={{ padding: "16px", overflowY: "auto", flex: 1 }}>
              <pre
                className="drawer-pre"
                style={{ margin: 0, maxHeight: "none", whiteSpace: "pre-wrap" }}
              >
                {payloadText}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
