import React, { useState } from "react";
import {
  IconAlertCircle,
  IconChevronRight,
  IconClock,
  IconCpu,
  IconHierarchy,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import type { FlamegraphNode, ProfileSpan } from "./types";
import { formatCostUsd, formatDuration, formatTokens } from "./flamegraphEngine";

export interface FlamegraphDetailDrawerProps {
  span: ProfileSpan | null;
  node?: FlamegraphNode;
  ancestry: ProfileSpan[];
  childSpans: ProfileSpan[];
  isOpen: boolean;
  onClose: () => void;
  onSelectSpan: (id: string) => void;
}

export const FlamegraphDetailDrawer: React.FC<FlamegraphDetailDrawerProps> = ({
  span,
  node,
  ancestry,
  childSpans,
  isOpen,
  onClose,
  onSelectSpan,
}) => {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!isOpen || !span) return null;

  const totalToks = Math.max(1, span.tokens.totalTokens);
  const promptPct = ((span.tokens.promptTokens / totalToks) * 100).toFixed(1);
  const compPct = ((span.tokens.completionTokens / totalToks) * 100).toFixed(1);
  const reasonPct = ((span.tokens.reasoningTokens / totalToks) * 100).toFixed(1);

  const selfTime = node ? node.selfTime : span.duration;
  const selfTimePct = span.duration > 0 ? ((selfTime / span.duration) * 100).toFixed(1) : "100.0";

  return (
    <aside
      className="flamegraph-detail-drawer"
      data-testid="flamegraph-detail-drawer"
      aria-label="Span Details Drawer"
    >
      <div className="drawer-header">
        <div className="drawer-header-left">
          <span className={`status-badge status-${span.status}`} data-testid="drawer-status-badge">
            {span.status}
          </span>
          <span className={`tier-badge tier-${span.tier}`} data-testid="drawer-tier-badge">
            {span.tier}
          </span>
          <span className="category-badge" data-testid="drawer-category-badge">
            {span.category}
          </span>
        </div>
        <button
          type="button"
          className="gvui-btn-icon drawer-close-btn"
          onClick={onClose}
          aria-label="Close Details"
          data-testid="drawer-close-btn"
        >
          <IconX size={18} />
        </button>
      </div>

      <div className="drawer-body">
        {/* Title and Identification */}
        <div className="drawer-section drawer-hero">
          <h2 className="drawer-span-name" data-testid="drawer-span-name">
            {span.name}
          </h2>
          <div className="drawer-id-row">
            <span className="drawer-id-label">ID:</span>
            <code className="drawer-id-code">{span.id}</code>
          </div>
          {span.agentId && (
            <div className="drawer-agent-row">
              <span className="drawer-agent-label">Agent:</span>
              <span className="drawer-agent-val">
                {span.agentId} {span.agentRole ? `(${span.agentRole})` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {(span.status === "error" || span.error) && (
          <div className="drawer-error-alert" data-testid="drawer-error-alert">
            <IconAlertCircle size={18} className="error-icon" />
            <div className="error-content">
              <strong>Execution Error:</strong>
              <p>{span.error || "Span completed with error status"}</p>
            </div>
          </div>
        )}

        {/* Cascade Hierarchy / Breadcrumbs */}
        {ancestry.length > 0 && (
          <div className="drawer-section drawer-ancestry-section">
            <div className="section-title">
              <IconHierarchy size={14} />
              <span>Cascade Hierarchy (Ancestry)</span>
            </div>
            <div className="ancestry-breadcrumbs">
              {ancestry.map((ancestor) => (
                <React.Fragment key={ancestor.id}>
                  <button
                    type="button"
                    className="ancestry-crumb-btn"
                    onClick={() => onSelectSpan(ancestor.id)}
                    title={`Select ${ancestor.name}`}
                  >
                    {ancestor.name}
                  </button>
                  <IconChevronRight size={12} className="crumb-sep" />
                </React.Fragment>
              ))}
              <span className="ancestry-crumb-current">{span.name}</span>
            </div>
          </div>
        )}

        {/* Latency & Waterfall Timing */}
        <div className="drawer-section">
          <div className="section-title">
            <IconClock size={14} />
            <span>Timing & Latency Waterfall</span>
          </div>
          <div className="drawer-grid">
            <div className="grid-item">
              <label>Total Duration</label>
              <span className="value highlight">{formatDuration(span.duration)}</span>
            </div>
            <div className="grid-item">
              <label>Self Time (exclusive)</label>
              <span className="value">
                {formatDuration(selfTime)} ({selfTimePct}%)
              </span>
            </div>
            <div className="grid-item">
              <label>Start Time</label>
              <span className="value">+{formatDuration(span.startTime)}</span>
            </div>
            <div className="grid-item">
              <label>End Time</label>
              <span className="value">+{formatDuration(span.endTime)}</span>
            </div>
          </div>
        </div>

        {/* Token Distribution */}
        <div className="drawer-section">
          <div className="section-title">
            <IconCpu size={14} />
            <span>Token Consumption & Cost</span>
          </div>
          <div className="drawer-grid">
            <div className="grid-item">
              <label>Total Tokens</label>
              <span className="value highlight">{formatTokens(span.tokens.totalTokens)}</span>
            </div>
            <div className="grid-item">
              <label>Recorded Cost</label>
              <span className="value">{formatCostUsd(span.costUsd)}</span>
            </div>
            <div className="grid-item">
              <label>Input (Prompt)</label>
              <span className="value">
                {formatTokens(span.tokens.promptTokens)} ({promptPct}%)
              </span>
            </div>
            <div className="grid-item">
              <label>Output (Completion)</label>
              <span className="value">
                {formatTokens(span.tokens.completionTokens)} ({compPct}%)
              </span>
            </div>
            <div className="grid-item">
              <label>Reasoning</label>
              <span className="value">
                {formatTokens(span.tokens.reasoningTokens)} ({reasonPct}%)
              </span>
            </div>
          </div>
        </div>

        {/* Direct Children Sub-Spans */}
        {childSpans.length > 0 && (
          <div className="drawer-section">
            <div className="section-title">
              <IconHierarchy size={14} />
              <span>Direct Subagent / Tool Cascades ({childSpans.length})</span>
            </div>
            <div className="drawer-children-list">
              {childSpans.map((child) => (
                <div
                  key={child.id}
                  className="drawer-child-item"
                  onClick={() => onSelectSpan(child.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectSpan(child.id);
                    }
                  }}
                  data-testid={`drawer-child-span-${child.id}`}
                >
                  <div className="child-left">
                    <span className={`status-dot ${child.status}`} />
                    <span className="child-name">{child.name}</span>
                    <span className="child-tier">[{child.tier}]</span>
                  </div>
                  <div className="child-right">
                    <span className="child-duration">{formatDuration(child.duration)}</span>
                    <span className="child-tokens">
                      {formatTokens(child.tokens.totalTokens)} tok
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {span.tags && span.tags.length > 0 && (
          <div className="drawer-section">
            <div className="section-title">
              <IconTag size={14} />
              <span>Tags</span>
            </div>
            <div className="drawer-tags-list">
              {span.tags.map((tag) => (
                <span key={tag} className="span-tag-pill">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata Inspector */}
        {span.metadata && Object.keys(span.metadata).length > 0 && (
          <div className="drawer-section">
            <div className="section-title section-title-toggle">
              <span>Metadata ({Object.keys(span.metadata).length} keys)</span>
              <button
                type="button"
                className="gvui-btn-text"
                onClick={() => setShowRawJson(!showRawJson)}
              >
                {showRawJson ? "Table View" : "Raw JSON"}
              </button>
            </div>

            {showRawJson ? (
              <pre className="metadata-json-block">{JSON.stringify(span.metadata, null, 2)}</pre>
            ) : (
              <table className="metadata-table">
                <tbody>
                  {Object.entries(span.metadata).map(([key, value]) => (
                    <tr key={key}>
                      <td className="meta-key">{key}</td>
                      <td className="meta-val">
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
