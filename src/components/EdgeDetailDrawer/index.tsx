import {
  IconArrowRight,
  IconArrowsExchange,
  IconBinary,
  IconClock,
  IconFlame,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";
import type { CSSProperties, FC } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { describeEdgeKind, resolveEdgeKind } from "../../primitives/edges/GraphEdge/edgeKinds";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphEdgeData, GraphNodeData } from "../../types/graphData";
import { EdgeOverviewTab } from "./tabs/OverviewTab";
import { EdgeRawJsonTab } from "./tabs/RawJsonTab";
import { TrafficChronologyTab } from "./tabs/TrafficChronologyTab";
import "./EdgeDetailDrawer.css";

export type EdgeTabId = "traffic" | "overview" | "raw";

export interface EdgeDetailDrawerProps {
  edge?: GraphEdgeData | null;
  edgeId?: string | null;
  onClose?: () => void;
  onNavigateNode?: (nodeId: string) => void;
}

export const EdgeDetailDrawer: FC<EdgeDetailDrawerProps> = memo(function EdgeDetailDrawer({
  edge: controlledEdge,
  edgeId: controlledEdgeId,
  onClose,
  onNavigateNode,
}) {
  const dataset = useGraphStore((state) => state.dataset);
  const centerNodeOnCanvas = useGraphStore((state) => state.centerNodeOnCanvas);
  const [activeTab, setActiveTab] = useState<EdgeTabId>("traffic");

  const edge: GraphEdgeData | null = useMemo(() => {
    if (controlledEdge) return controlledEdge;
    if (!dataset) return null;
    if (controlledEdgeId) {
      return dataset.edges.find((e) => e.id === controlledEdgeId) ?? null;
    }
    return null;
  }, [controlledEdge, controlledEdgeId, dataset]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!edge) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [edge, handleClose]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNodeData>();
    for (const c of dataset?.nodes ?? []) map.set(c.id, c);
    return map;
  }, [dataset]);

  const handleJumpToNode = useCallback(
    (nodeId: string) => {
      if (onNavigateNode) {
        onNavigateNode(nodeId);
      } else {
        centerNodeOnCanvas(nodeId);
      }
    },
    [onNavigateNode, centerNodeOnCanvas],
  );

  const sourceNode = edge ? nodeMap.get(edge.source) : undefined;
  const targetNode = edge ? nodeMap.get(edge.target) : undefined;
  const sourceName = sourceNode?.name || (edge ? edge.source : "");
  const targetName = targetNode?.name || (edge ? edge.target : "");

  const exchanges = useMemo(() => edge?.traffic?.exchanges ?? [], [edge?.traffic?.exchanges]);
  const callCount =
    exchanges.length > 0
      ? exchanges.length
      : (edge?.traffic?.messagesCount ?? edge?.traffic?.volume ?? (edge?.traffic ? 1 : 0));

  const activeSteps = useMemo(() => {
    if (!edge) return [];
    if (edge.traffic?.activeSteps && edge.traffic.activeSteps.length > 0) {
      return edge.traffic.activeSteps;
    }
    const stepSet = new Set<number | string>();
    for (const ex of exchanges) {
      const st = ex.step ?? ex.stepNumber;
      if (st !== undefined && st !== null && st !== "") {
        stepSet.add(st);
      }
    }
    if (stepSet.size > 0) {
      return Array.from(stepSet);
    }
    if (edge.stepNumber !== undefined && edge.stepNumber !== null && edge.stepNumber !== "") {
      return [edge.stepNumber];
    }
    return [];
  }, [edge, exchanges]);

  const callSummaryHeadline = useMemo(() => {
    const timesLabel = callCount === 1 ? "1 time" : `${callCount} times`;
    if (activeSteps.length > 1) {
      return `Called ${timesLabel} across Steps ${activeSteps.join(", ")}`;
    } else if (activeSteps.length === 1) {
      return `Called ${timesLabel} at Step ${activeSteps[0]}`;
    }
    return `Called ${timesLabel}`;
  }, [callCount, activeSteps]);

  const callingRelationship = useMemo(() => {
    if (!edge) return "";
    if (edge.traffic?.callingRelationship) {
      return edge.traffic.callingRelationship;
    }
    const sKind = sourceNode?.kind ? sourceNode.kind.toUpperCase() : "SOURCE";
    const tKind = targetNode?.kind ? targetNode.kind.toUpperCase() : "TARGET";
    return `${sKind} (${sourceName}) ◄──► ${tKind} (${targetName})`;
  }, [edge, sourceNode, targetNode, sourceName, targetName]);

  if (!edge) return null;

  const semanticKind = resolveEdgeKind(edge);
  const descriptor = describeEdgeKind(semanticKind);

  const exchangesCount =
    edge.traffic?.exchanges?.length ?? edge.traffic?.messagesCount ?? edge.traffic?.volume ?? 0;

  const tabs = [
    {
      id: "traffic" as EdgeTabId,
      label: "Traffic Chronology",
      icon: IconClock,
      count: exchangesCount,
      visible: true,
    },
    {
      id: "overview" as EdgeTabId,
      label: "Overview & Routing",
      icon: IconInfoCircle,
      count: 0,
      visible: true,
    },
    {
      id: "raw" as EdgeTabId,
      label: "Raw Data",
      icon: IconBinary,
      count: 0,
      visible: true,
    },
  ];

  return (
    <aside
      className="edge-drawer"
      role="complementary"
      aria-label={`Edge Details: ${sourceName} to ${targetName}`}
    >
      <header
        className="edge-drawer-header"
        style={{ "--edge-kind-accent": descriptor.accent } as CSSProperties}
      >
        <div className="edge-drawer-header-top">
          <div className="edge-drawer-title-row">
            <span className={`edge-kind-badge kind-${semanticKind}`}>
              {descriptor.IconComponent && <descriptor.IconComponent size={14} />}
              <span>{descriptor.label}</span>
            </span>
            <h2 className="edge-drawer-title">
              {edge.label || `${sourceName} \u2192 ${targetName}`}
            </h2>
          </div>
          <button
            type="button"
            className="edge-drawer-close-btn"
            onClick={handleClose}
            aria-label="Close edge details"
            title="Close (Esc)"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="edge-drawer-header-meta">
          <div className="edge-header-routing">
            <button
              type="button"
              className="edge-header-peer-btn"
              onClick={() => handleJumpToNode(edge.source)}
              title={`Center ${sourceName} on canvas`}
            >
              {sourceName}
            </button>
            <IconArrowRight size={13} className="edge-header-arrow" />
            <button
              type="button"
              className="edge-header-peer-btn"
              onClick={() => handleJumpToNode(edge.target)}
              title={`Center ${targetName} on canvas`}
            >
              {targetName}
            </button>
          </div>

          {edge.isCycle && (
            <span className="edge-status-pill edge-status-pill--warn">
              <IconFlame size={12} /> Pushback Cycle
            </span>
          )}

          {edge.traffic?.status && (
            <span
              className={`edge-status-pill ${
                edge.traffic.status === "congested"
                  ? "edge-status-pill--warn"
                  : "edge-status-pill--active"
              }`}
            >
              {edge.traffic.status.toUpperCase()}
            </span>
          )}

          <code className="edge-drawer-id">{edge.id}</code>
        </div>
      </header>

      {/* Top Interaction Summary Card */}
      <div className="edge-interaction-summary-card">
        <div className="edge-interaction-summary-header">
          <div className="edge-summary-header-left">
            <span className="edge-summary-icon-wrapper">
              <IconArrowsExchange size={14} />
            </span>
            <span className="edge-interaction-summary-title">INTERACTION SUMMARY</span>
          </div>
          <span className="edge-call-count-badge">{callSummaryHeadline}</span>
        </div>
        <div className="edge-interaction-summary-body">
          <div className="edge-interaction-summary-row">
            <span className="edge-summary-bullet">•</span>
            <span className="edge-summary-label">Total Inter-Node Calls:</span>
            <span className="edge-summary-value">
              {`${callCount} ${callCount === 1 ? "Time" : "Times"}`}
            </span>
          </div>
          {activeSteps.length > 0 && (
            <div className="edge-interaction-summary-row">
              <span className="edge-summary-bullet">•</span>
              <span className="edge-summary-label">Active Steps:</span>
              <span className="edge-summary-value">
                {activeSteps.map((s) => `Step ${s}`).join(", ")}
              </span>
            </div>
          )}
          <div className="edge-interaction-summary-row edge-interaction-summary-row--relationship">
            <span className="edge-summary-bullet">•</span>
            <span className="edge-summary-label">Calling Relationship:</span>
            <span className="edge-summary-value edge-summary-relationship-text">
              {callingRelationship}
            </span>
          </div>
        </div>
      </div>

      <nav className="edge-drawer-tabs" aria-label="Edge Detail Sections">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={`edge-drawer-tab ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon size={14} />
              <span>{tab.label}</span>
              {tab.count > 0 ? <span className="edge-tab-badge">{tab.count}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="edge-drawer-body">
        {activeTab === "traffic" && (
          <TrafficChronologyTab edge={edge} sourceName={sourceName} targetName={targetName} />
        )}
        {activeTab === "overview" && (
          <EdgeOverviewTab
            edge={edge}
            sourceName={sourceName}
            targetName={targetName}
            onNavigateNode={handleJumpToNode}
          />
        )}
        {activeTab === "raw" && <EdgeRawJsonTab edge={edge} />}
      </div>
    </aside>
  );
});

EdgeDetailDrawer.displayName = "EdgeDetailDrawer";

export default EdgeDetailDrawer;
