import {
  IconArrowRight,
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
import type { GraphEdgeData } from "../../types/graphData";
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

  const nodeNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of dataset?.nodes ?? []) map.set(c.id, c.name);
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

  if (!edge) return null;

  const semanticKind = resolveEdgeKind(edge);
  const descriptor = describeEdgeKind(semanticKind);
  const sourceName = nodeNamesById.get(edge.source) || edge.source;
  const targetName = nodeNamesById.get(edge.target) || edge.target;

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
