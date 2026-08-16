import React, { useState } from "react";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCoins,
  IconCopy,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";
import type { CollaborationEvent, EventSeverity } from "./types";
import { formatTokenNumber } from "./ThroughputGauge";

export interface FeedItemProps {
  event: CollaborationEvent;
  isExpandedDefault?: boolean;
  onSelectTask?: (taskId: string) => void;
  onSelectAgent?: (agentId: string) => void;
}

export function formatEventTime(timestamp: number | string): string {
  try {
    const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
    if (isNaN(date.getTime())) {
      return String(timestamp);
    }
    const hours = String(date.getHours()).padStart(2, "0");
    const mins = String(date.getMinutes()).padStart(2, "0");
    const secs = String(date.getSeconds()).padStart(2, "0");
    return `${hours}:${mins}:${secs}`;
  } catch {
    return String(timestamp);
  }
}

export function getSeverityIcon(severity: EventSeverity): React.ReactNode {
  switch (severity) {
    case "approve":
      return <IconCheck size={12} color="#059669" />;
    case "reject":
    case "error":
      return <IconX size={12} color="#dc2626" />;
    case "warn":
      return <IconAlertTriangle size={12} color="#d97706" />;
    case "info":
    default:
      return <IconInfoCircle size={12} color="#38bdf8" />;
  }
}

export const FeedItem: React.FC<FeedItemProps> = ({
  event,
  isExpandedDefault = false,
  onSelectTask,
  onSelectAgent,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(isExpandedDefault);
  const [copied, setCopied] = useState<boolean>(false);

  const roleClass = `gvui-role-chip--${(event.role || "unknown").toLowerCase()}`;
  const severityClass = `gvui-feed-item--${event.severity}`;

  const hasDetails =
    Boolean(event.details) ||
    Boolean(event.payload && Object.keys(event.payload).length > 0) ||
    Boolean(event.lockInfo) ||
    Boolean(event.metrics);

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(
      {
        id: event.id,
        timestamp: event.timestamp,
        agent: event.agentId,
        role: event.role,
        type: event.type,
        severity: event.severity,
        summary: event.summary,
        taskId: event.taskId,
        details: event.details,
        payload: event.payload,
        metrics: event.metrics,
      },
      null,
      2,
    );
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`gvui-feed-item ${severityClass}`}
      data-testid={`feed-item-${event.id}`}
      data-severity={event.severity}
      data-type={event.type}
      data-role={event.role}
    >
      <div className="gvui-feed-item__header">
        <div className="gvui-feed-item__meta-left">
          <span className="gvui-feed-item__time" title={String(event.timestamp)}>
            {formatEventTime(event.timestamp)}
          </span>

          <span
            className={`gvui-role-chip ${roleClass}`}
            onClick={() => onSelectAgent?.(event.agentId)}
            style={{ cursor: onSelectAgent ? "pointer" : "default" }}
            title={`Agent ID: ${event.agentId}`}
          >
            {getSeverityIcon(event.severity)}
            {event.role}
          </span>

          <span
            className="gvui-agent-name"
            onClick={() => onSelectAgent?.(event.agentId)}
            style={{ cursor: onSelectAgent ? "pointer" : "default" }}
          >
            {event.agentName ?? event.agentId}
          </span>

          {event.targetAgentId && (
            <span
              className="gvui-feed-item__handoff-tag"
              title={`Handoff to ${event.targetAgentId}`}
            >
              <IconArrowRight size={10} />
              <span>{event.targetAgentName ?? event.targetAgentId}</span>
            </span>
          )}

          <span className="gvui-event-type-badge">{event.type}</span>

          {event.taskId && (
            <span
              className="gvui-feed-item__task-chip"
              onClick={() => onSelectTask?.(event.taskId!)}
              style={{ cursor: onSelectTask ? "pointer" : "default" }}
              title={event.taskId}
            >
              {event.taskLabel ?? event.taskId}
            </span>
          )}
        </div>

        {event.metrics &&
          typeof event.metrics.totalTokens === "number" &&
          event.metrics.totalTokens > 0 && (
            <div className="gvui-feed-item__metrics-pill" title="Tokens consumed">
              <IconCoins size={10} />
              <span>{formatTokenNumber(event.metrics.totalTokens)} tok</span>
            </div>
          )}
      </div>

      <div className="gvui-feed-item__summary">{event.summary}</div>

      {hasDetails && (
        <div className="gvui-feed-item__footer">
          <button
            type="button"
            className="gvui-feed-item__details-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            data-testid={`toggle-details-${event.id}`}
          >
            {isExpanded ? (
              <>
                <IconChevronUp size={12} />
                <span>Hide Payload</span>
              </>
            ) : (
              <>
                <IconChevronDown size={12} />
                <span>Inspect Payload & Details</span>
              </>
            )}
          </button>

          {isExpanded && (
            <button
              type="button"
              className="gvui-feed-btn"
              style={{ padding: "2px 6px", fontSize: 10 }}
              onClick={handleCopyJson}
              title="Copy event JSON"
              data-testid={`copy-json-${event.id}`}
            >
              {copied ? <IconCheck size={10} color="#34d399" /> : <IconCopy size={10} />}
              <span>{copied ? "Copied" : "Copy JSON"}</span>
            </button>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="gvui-feed-item__details-panel" data-testid={`details-panel-${event.id}`}>
          {event.taskId && (
            <div className="gvui-details-row">
              <span className="gvui-details-label">Task ID:</span>
              <span className="gvui-details-val">{event.taskId}</span>
            </div>
          )}

          {event.details && (
            <div className="gvui-details-row">
              <span className="gvui-details-label">Details:</span>
              <span className="gvui-details-val">
                {typeof event.details === "string" ? event.details : JSON.stringify(event.details)}
              </span>
            </div>
          )}

          {event.metrics && Object.keys(event.metrics).length > 0 && (
            <div className="gvui-details-row">
              <span className="gvui-details-label">Metrics:</span>
              <span className="gvui-details-val">{JSON.stringify(event.metrics)}</span>
            </div>
          )}

          {event.payload && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="gvui-details-label">Raw Payload:</span>
              <pre className="gvui-details-json">{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
