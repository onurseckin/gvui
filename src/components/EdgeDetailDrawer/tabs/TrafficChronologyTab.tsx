import {
  IconArrowLeft,
  IconArrowRight,
  IconClock,
  IconCoins,
  IconCopy,
  IconFilter,
  IconFlame,
  IconMessageCircle,
} from "@tabler/icons-react";
import type { FC } from "react";
import { memo, useMemo, useState } from "react";
import { formatTokens } from "../../../primitives/nodes/NodeCard/nodeCardModel";
import type {
  EdgeTrafficDetail,
  EdgeTrafficExchange,
  GraphEdgeData,
} from "../../../types/graphData";

export interface TrafficChronologyTabProps {
  edge: GraphEdgeData;
  sourceName?: string;
  targetName?: string;
}

export const TrafficChronologyTab: FC<TrafficChronologyTabProps> = memo(
  function TrafficChronologyTab({ edge, sourceName = "Source", targetName = "Target" }) {
    const traffic: EdgeTrafficDetail | undefined = edge.traffic;
    const exchanges: EdgeTrafficExchange[] = useMemo(() => {
      return traffic?.exchanges ?? [];
    }, [traffic]);

    const [filterType, setFilterType] = useState<string>("all");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(
      () => new Set(exchanges.slice(0, 3).map((e) => e.id)),
    );
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const toggleExpand = (id: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const handleCopy = (id: string, text?: string) => {
      if (!text) return;
      void navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    };

    const filteredExchanges = useMemo(() => {
      if (filterType === "all") return exchanges;
      return exchanges.filter((e) => e.type === filterType);
    }, [exchanges, filterType]);

    const availableTypes = useMemo(() => {
      const set = new Set<string>();
      for (const e of exchanges) {
        if (e.type) set.add(e.type);
      }
      return Array.from(set);
    }, [exchanges]);

    return (
      <div className="edge-drawer-tab-content">
        {traffic && (
          <section className="edge-drawer-section">
            <h4 className="edge-drawer-section-title">Traffic Telemetry Summary</h4>
            <div className="edge-metric-grid">
              <div className="edge-metric-card">
                <span className="edge-metric-label">
                  <IconMessageCircle size={13} /> Message Exchanges
                </span>
                <span className="edge-metric-value">
                  {traffic.messagesCount ?? traffic.volume ?? exchanges.length}
                </span>
              </div>
              {typeof traffic.tokens === "number" && (
                <div className="edge-metric-card">
                  <span className="edge-metric-label">
                    <IconCoins size={13} /> Token Volume
                  </span>
                  <span className="edge-metric-value">{formatTokens(traffic.tokens)}</span>
                </div>
              )}
              {traffic.avgLatencyMs !== undefined && (
                <div className="edge-metric-card">
                  <span className="edge-metric-label">
                    <IconClock size={13} /> Avg Latency
                  </span>
                  <span className="edge-metric-value">{`${traffic.avgLatencyMs}ms`}</span>
                </div>
              )}
              {traffic.status && (
                <div className="edge-metric-card">
                  <span className="edge-metric-label">Channel Status</span>
                  <span
                    className={`edge-status-badge ${
                      traffic.status === "congested"
                        ? "is-congested"
                        : traffic.status === "active"
                          ? "is-active"
                          : "is-idle"
                    }`}
                  >
                    {traffic.status === "congested" && <IconFlame size={12} />}
                    {traffic.status.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="edge-drawer-section">
          <div className="edge-section-header-row">
            <h4 className="edge-drawer-section-title">
              Chronology Inspector
              <span className="edge-section-count">{filteredExchanges.length}</span>
            </h4>
            {availableTypes.length > 1 && (
              <div className="edge-filter-pills">
                <span className="edge-filter-icon">
                  <IconFilter size={12} />
                </span>
                <button
                  type="button"
                  className={`edge-filter-pill ${filterType === "all" ? "is-active" : ""}`}
                  onClick={() => setFilterType("all")}
                >
                  All ({exchanges.length})
                </button>
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`edge-filter-pill ${filterType === type ? "is-active" : ""}`}
                    onClick={() => setFilterType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>

          {filteredExchanges.length === 0 ? (
            <div className="edge-empty-state">No traffic exchanges recorded on this edge.</div>
          ) : (
            <div className="edge-timeline">
              {filteredExchanges.map((exchange, index) => {
                const isExpanded = expandedIds.has(exchange.id);
                const isForward = exchange.direction !== "reverse";
                const fromName = isForward ? sourceName : targetName;
                const toName = isForward ? targetName : sourceName;

                return (
                  <div key={exchange.id} className="edge-timeline-item">
                    <div className="edge-timeline-marker">
                      <span className="edge-timeline-index">{index + 1}</span>
                      <div className="edge-timeline-line" />
                    </div>

                    <div className="edge-exchange-card">
                      <header
                        className="edge-exchange-header"
                        onClick={() => toggleExpand(exchange.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpand(exchange.id);
                          }
                        }}
                      >
                        <div className="edge-exchange-route">
                          <span className="edge-exchange-peer">{fromName}</span>
                          <span className="edge-exchange-arrow">
                            {isForward ? <IconArrowRight size={13} /> : <IconArrowLeft size={13} />}
                          </span>
                          <span className="edge-exchange-peer">{toName}</span>
                          {exchange.type && (
                            <span className={`edge-exchange-type-chip type-${exchange.type}`}>
                              {exchange.type}
                            </span>
                          )}
                        </div>

                        <div className="edge-exchange-meta">
                          {typeof exchange.tokens === "number" && (
                            <span className="edge-exchange-metric">
                              {formatTokens(exchange.tokens)} tok
                            </span>
                          )}
                          {typeof exchange.latencyMs === "number" && (
                            <span className="edge-exchange-metric">{`${exchange.latencyMs}ms`}</span>
                          )}
                          {exchange.timestamp && (
                            <span className="edge-exchange-time">
                              {new Date(exchange.timestamp).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      </header>

                      {exchange.summary && (
                        <p className="edge-exchange-summary">{exchange.summary}</p>
                      )}

                      {isExpanded && exchange.payloadPreview && (
                        <div className="edge-exchange-body">
                          <div className="edge-exchange-toolbar">
                            <span className="edge-exchange-payload-label">Payload Stream</span>
                            <button
                              type="button"
                              className={`edge-copy-btn ${copiedId === exchange.id ? "is-copied" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(exchange.id, exchange.payloadPreview);
                              }}
                            >
                              <IconCopy size={12} />
                              <span>{copiedId === exchange.id ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                          <pre className="edge-pre">
                            <code>{exchange.payloadPreview}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  },
);

TrafficChronologyTab.displayName = "TrafficChronologyTab";
