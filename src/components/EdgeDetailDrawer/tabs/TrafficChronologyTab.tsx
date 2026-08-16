import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconClock,
  IconCoins,
  IconCopy,
  IconFileCode,
  IconFilter,
  IconFlame,
  IconGitFork,
  IconLayoutList,
  IconMessageCircle,
  IconShieldCheck,
  IconTarget,
} from "@tabler/icons-react";
import type { FC, ReactNode } from "react";
import { memo, useMemo, useState } from "react";
import { formatTokens } from "../../../primitives/nodes/NodeCard/nodeCardModel";
import type {
  EdgeTrafficDetail,
  EdgeTrafficExchange,
  ExchangeFinding,
  ExchangeResolutionProof,
  ExchangeTransferredFile,
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
      () => new Set(exchanges.map((e) => e.id)),
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
      return exchanges.filter((e) => {
        const t = (e.type ?? e.kind ?? "").toLowerCase();
        return t === filterType.toLowerCase();
      });
    }, [exchanges, filterType]);

    const availableTypes = useMemo(() => {
      const set = new Set<string>();
      for (const e of exchanges) {
        const t = e.type ?? e.kind;
        if (t) set.add(t);
      }
      return Array.from(set);
    }, [exchanges]);

    const allExpanded =
      filteredExchanges.length > 0 && filteredExchanges.every((e) => expandedIds.has(e.id));

    const handleToggleAll = () => {
      if (allExpanded) {
        setExpandedIds(new Set());
      } else {
        setExpandedIds(new Set(exchanges.map((e) => e.id)));
      }
    };

    const renderTransferredFiles = (
      rawFiles?: Array<ExchangeTransferredFile | string>,
    ): ReactNode => {
      if (!rawFiles || rawFiles.length === 0) return null;
      return (
        <div className="edge-payload-files-list">
          {rawFiles.map((file, idx) => {
            if (typeof file === "string") {
              return (
                <div key={idx} className="edge-payload-file-item">
                  <code className="edge-payload-file-path">{file}</code>
                </div>
              );
            }
            return (
              <div key={idx} className="edge-payload-file-item">
                <div className="edge-payload-file-header">
                  <code className="edge-payload-file-path">{file.path}</code>
                  {(file.additions !== undefined || file.deletions !== undefined) && (
                    <span className="edge-file-diff-stats">
                      {file.additions !== undefined && (
                        <span className="diff-add">{`+${file.additions}`}</span>
                      )}
                      {file.deletions !== undefined && (
                        <span className="diff-del">{`-${file.deletions}`}</span>
                      )}
                    </span>
                  )}
                </div>
                {file.diff && (
                  <pre className="edge-pre edge-pre--diff">
                    <code>{file.diff}</code>
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      );
    };

    const renderFinding = (rawFinding?: ExchangeFinding | string): ReactNode => {
      if (!rawFinding) return null;
      if (typeof rawFinding === "string") {
        return <span className="edge-finding-text">{rawFinding}</span>;
      }
      return (
        <div className="edge-finding-card">
          <div className="edge-finding-header">
            {rawFinding.id && <strong className="edge-finding-id">{rawFinding.id}</strong>}
            {rawFinding.severity && (
              <span className={`edge-severity-badge severity-${rawFinding.severity.toLowerCase()}`}>
                {rawFinding.severity === "critical"
                  ? "(Critical Severity)"
                  : `(${rawFinding.severity} Severity)`}
              </span>
            )}
            {rawFinding.status && (
              <span className={`edge-finding-status status-${rawFinding.status.toLowerCase()}`}>
                {rawFinding.status.toUpperCase()}
              </span>
            )}
          </div>
          {rawFinding.observation && (
            <div className="edge-finding-subfield">
              <span className="edge-finding-sublabel">Context / Observation:</span>
              <p className="edge-finding-subtext">"{rawFinding.observation}"</p>
            </div>
          )}
          {rawFinding.remediation && (
            <div className="edge-finding-subfield">
              <span className="edge-finding-sublabel">Required Remediation:</span>
              <p className="edge-finding-subtext">"{rawFinding.remediation}"</p>
            </div>
          )}
        </div>
      );
    };

    const renderResolutionProof = (
      proof?: ExchangeResolutionProof | string,
      evidence?: string | string[],
    ): ReactNode => {
      if (!proof && !evidence) return null;

      const proofMethod = typeof proof === "object" ? proof.method : undefined;
      const proofDetails = typeof proof === "object" ? proof.details : undefined;
      const proofEvidence =
        typeof proof === "object"
          ? Array.isArray(proof.evidence)
            ? proof.evidence
            : proof.evidence
              ? [proof.evidence]
              : []
          : typeof proof === "string"
            ? [proof]
            : [];

      const rawEvidenceList = Array.isArray(evidence)
        ? evidence
        : typeof evidence === "string"
          ? [evidence]
          : [];

      const combinedEvidence = Array.from(new Set([...proofEvidence, ...rawEvidenceList]));

      return (
        <div className="edge-evidence-card">
          {proofMethod && (
            <div className="edge-evidence-method">
              <span className="edge-evidence-label">Method:</span>
              <code>{proofMethod}</code>
            </div>
          )}
          {proofDetails && <p className="edge-evidence-details">{proofDetails}</p>}
          {combinedEvidence.length > 0 && (
            <div className="edge-evidence-list">
              {combinedEvidence.map((ev, idx) => (
                <div key={idx} className="edge-evidence-item">
                  <IconShieldCheck size={13} className="edge-evidence-icon" />
                  <span className="edge-evidence-text">{ev}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    };

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
              CHRONOLOGICAL CALL LOG &amp; CONTEXT
              <span className="edge-section-sublabel">Chronology Inspector</span>
              <span className="edge-section-count">{filteredExchanges.length}</span>
            </h4>
            {filteredExchanges.length > 0 && (
              <button
                type="button"
                className="edge-expand-all-btn"
                onClick={handleToggleAll}
                title={allExpanded ? "Collapse all exchanges" : "Expand all exchanges"}
              >
                <IconLayoutList size={12} />
                <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
              </button>
            )}
          </div>

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

          {filteredExchanges.length === 0 ? (
            <div className="edge-empty-state">
              {filterType === "all" ? (
                "No traffic exchanges recorded on this edge."
              ) : (
                <>
                  <p>No traffic exchanges recorded matching the selected filter.</p>
                  <button
                    type="button"
                    className="edge-filter-reset-btn"
                    onClick={() => setFilterType("all")}
                  >
                    Reset Filter
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="edge-timeline">
              {filteredExchanges.map((exchange, index) => {
                const isExpanded = expandedIds.has(exchange.id);
                const isForward = exchange.direction !== "reverse";
                const fromName = isForward ? sourceName : targetName;
                const toName = isForward ? targetName : sourceName;
                const stepVal = exchange.step ?? exchange.stepNumber;
                const typeVal = exchange.type ?? exchange.kind;
                const filesList = exchange.filesTransferred ?? exchange.files;
                const findingVal = exchange.auditFinding ?? exchange.finding;
                const observationVal = exchange.rejectionObservation ?? exchange.observation;
                const remediationVal = exchange.requiredRemediation ?? exchange.remediation;
                const payloadStream =
                  exchange.payloadPreview ?? exchange.payloadSnippet ?? exchange.fullPayload;
                const conditionVal = (exchange as { condition?: string }).condition;
                const branchOutcome = (exchange as { branchOutcome?: string }).branchOutcome;

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
                          {stepVal !== undefined && (
                            <span className="edge-exchange-step-chip">{`[Step ${stepVal}]`}</span>
                          )}
                          <span className="edge-exchange-peer">{fromName}</span>
                          <span className="edge-exchange-arrow">
                            {isForward ? <IconArrowRight size={13} /> : <IconArrowLeft size={13} />}
                          </span>
                          <span className="edge-exchange-peer">{toName}</span>
                          {typeVal && (
                            <span
                              className={`edge-exchange-type-chip type-${typeVal.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              {typeVal}
                            </span>
                          )}
                        </div>

                        <div className="edge-exchange-meta">
                          {typeof exchange.tokens === "number" && (
                            <span className="edge-exchange-metric">
                              {`${formatTokens(exchange.tokens)} tok`}
                            </span>
                          )}
                          {typeof (exchange.latencyMs ?? exchange.durationMs) === "number" && (
                            <span className="edge-exchange-metric">
                              {`${exchange.latencyMs ?? exchange.durationMs}ms`}
                            </span>
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

                      {/* Deep In/Out Payload Context Flow */}
                      <div className="edge-exchange-context-flow">
                        {conditionVal && (
                          <div className="edge-payload-context-row edge-payload-context-row--condition">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">
                              <IconGitFork size={12} className="edge-field-icon" /> Branch
                              Condition:
                            </span>
                            <code className="edge-summary-condition-code">{conditionVal}</code>
                            {branchOutcome && (
                              <span className="edge-condition-eval status-passed">
                                {branchOutcome}
                              </span>
                            )}
                          </div>
                        )}

                        {exchange.inputGoal && (
                          <div className="edge-payload-context-row">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">
                              <IconTarget size={12} className="edge-field-icon" /> Input Goal:
                            </span>
                            <span className="edge-payload-context-value">{exchange.inputGoal}</span>
                          </div>
                        )}

                        {exchange.outputPassed && (
                          <div className="edge-payload-context-row">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">
                              <IconCheck size={12} className="edge-field-icon" /> Output Passed:
                            </span>
                            <span className="edge-payload-context-value">
                              {exchange.outputPassed}
                            </span>
                          </div>
                        )}

                        {filesList && filesList.length > 0 && (
                          <div className="edge-payload-context-row edge-payload-context-row--files">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">
                              <IconFileCode size={12} className="edge-field-icon" /> Files
                              Transferred:
                            </span>
                            <div className="edge-transferred-files-wrapper">
                              {renderTransferredFiles(filesList)}
                            </div>
                          </div>
                        )}

                        {findingVal && (
                          <div className="edge-payload-context-row edge-payload-context-row--finding">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">
                              <IconAlertTriangle size={12} className="edge-field-icon" /> Audit
                              Finding:
                            </span>
                            <div className="edge-finding-wrapper">{renderFinding(findingVal)}</div>
                          </div>
                        )}

                        {!findingVal && observationVal && (
                          <div className="edge-payload-context-row">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">
                              <IconAlertCircle size={12} className="edge-field-icon" /> Context /
                              Observation:
                            </span>
                            <p className="edge-payload-quote">{`"${observationVal}"`}</p>
                          </div>
                        )}

                        {!findingVal && remediationVal && (
                          <div className="edge-payload-context-row">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">
                              Required Remediation:
                            </span>
                            <p className="edge-payload-quote">{`"${remediationVal}"`}</p>
                          </div>
                        )}

                        {exchange.remediatedPayload && (
                          <div className="edge-payload-context-row">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">Remediated Payload:</span>
                            <span className="edge-payload-context-value edge-remediated-value">
                              {exchange.remediatedPayload}
                            </span>
                          </div>
                        )}

                        {exchange.verdict && (
                          <div className="edge-payload-context-row edge-payload-context-row--verdict">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">Verdict:</span>
                            <span
                              className={`edge-verdict-badge verdict-${exchange.verdict.toLowerCase()}`}
                            >
                              {exchange.verdict === "PASS" && <IconCircleCheck size={12} />}
                              {exchange.verdict}
                            </span>
                            {findingVal && (
                              <span className="edge-verdict-finding-resolved">
                                {`(Finding ${typeof findingVal === "object" ? findingVal.id : findingVal} RESOLVED)`}
                              </span>
                            )}
                          </div>
                        )}

                        {(exchange.resolutionProof || exchange.proof || exchange.evidence) && (
                          <div className="edge-payload-context-row edge-payload-context-row--evidence">
                            <span className="edge-payload-dot">•</span>
                            <span className="edge-payload-context-label">
                              <IconShieldCheck size={12} className="edge-field-icon" /> Evidence:
                            </span>
                            <div className="edge-evidence-wrapper">
                              {renderResolutionProof(
                                exchange.resolutionProof ?? exchange.proof,
                                exchange.evidence,
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {isExpanded && payloadStream && (
                        <div className="edge-exchange-body">
                          <div className="edge-exchange-toolbar">
                            <span className="edge-exchange-payload-label">Payload Stream</span>
                            <button
                              type="button"
                              className={`edge-copy-btn ${copiedId === exchange.id ? "is-copied" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(exchange.id, payloadStream);
                              }}
                            >
                              <IconCopy size={12} />
                              <span>{copiedId === exchange.id ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                          <pre className="edge-pre">
                            <code>{payloadStream}</code>
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
