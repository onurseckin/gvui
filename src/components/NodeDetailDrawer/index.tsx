import type { CSSProperties, FC } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { describeNodeKind, describeNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphNodeData, IoPort } from "../../types/graphData";
import { edgeToPort } from "./DrawerSection";
import { OverviewTab } from "./tabs/OverviewTab";
import { FilesTab } from "./tabs/FilesTab";
import { CommandsTab } from "./tabs/CommandsTab";
import { FindingsTab } from "./tabs/FindingsTab";
import "./NodeDetailDrawer.css";

type TabId = "overview" | "files" | "commands" | "findings";

export const NodeDetailDrawer: FC = memo(function NodeDetailDrawer() {
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const dataset = useGraphStore((state) => state.dataset);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const handleClose = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setSelectedNodeId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, setSelectedNodeId]);

  const node: GraphNodeData | null = useMemo(() => {
    if (!selectedNodeId || !dataset) return null;
    return dataset.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
  }, [selectedNodeId, dataset]);

  const nodeNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const candidate of dataset?.nodes ?? []) map.set(candidate.id, candidate.name);
    return map;
  }, [dataset]);

  const { inputs, outputs } = useMemo(() => {
    if (!node) return { inputs: [] as IoPort[], outputs: [] as IoPort[] };
    const declaredIn = node.io?.inputs ?? [];
    const declaredOut = node.io?.outputs ?? [];
    const edges = dataset?.edges ?? [];
    return {
      inputs:
        declaredIn.length > 0
          ? declaredIn
          : edges.filter((e) => e.target === node.id).map((e) => edgeToPort(e, "in")),
      outputs:
        declaredOut.length > 0
          ? declaredOut
          : edges.filter((e) => e.source === node.id).map((e) => edgeToPort(e, "out")),
    };
  }, [node, dataset]);

  if (!node) return null;

  const kind = describeNodeKind(node);
  const status = describeNodeStatus(node);
  const filesCount =
    (node.files?.length ?? 0) + ((node.metadata?.writeScope as string[])?.length ?? 0);
  const commandsCount = (node.metadata?.commands as unknown[])?.length ?? 0;
  const findingsCount = (node.metadata?.findings as unknown[])?.length ?? 0;

  return (
    <aside className="node-drawer" role="complementary" aria-label={`Details for ${node.name}`}>
      <header
        className="drawer-header"
        style={{ "--node-kind-accent": kind.accent } as CSSProperties}
      >
        <div className="drawer-header-top">
          <svg
            className="drawer-kind-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke={kind.accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {kind.icon}
          </svg>
          <h2 className="drawer-title">{node.name}</h2>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={handleClose}
            aria-label="Close details"
            title="Close (Esc)"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="drawer-header-meta">
          <span className="drawer-kind-label">{kind.label}</span>
          <span className="drawer-status-pill" style={{ color: status.color }}>
            <span className="drawer-status-dot" />
            {status.label}
          </span>
          {node.model ? <span className="drawer-model">{node.model}</span> : null}
          {node.harnessModel ? (
            <span className="drawer-model drawer-model--harness">harness: {node.harnessModel}</span>
          ) : null}
          <code className="drawer-id">{node.id}</code>
        </div>
      </header>

      <nav className="drawer-tabs" aria-label="Detail Sections">
        <button
          type="button"
          className={`drawer-tab ${activeTab === "overview" ? "is-active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={`drawer-tab ${activeTab === "files" ? "is-active" : ""}`}
          onClick={() => setActiveTab("files")}
        >
          Files {filesCount > 0 ? <span className="drawer-tab-badge">{filesCount}</span> : null}
        </button>
        <button
          type="button"
          className={`drawer-tab ${activeTab === "commands" ? "is-active" : ""}`}
          onClick={() => setActiveTab("commands")}
        >
          Commands{" "}
          {commandsCount > 0 ? <span className="drawer-tab-badge">{commandsCount}</span> : null}
        </button>
        <button
          type="button"
          className={`drawer-tab ${activeTab === "findings" ? "is-active" : ""}`}
          onClick={() => setActiveTab("findings")}
        >
          Findings{" "}
          {findingsCount > 0 ? <span className="drawer-tab-badge">{findingsCount}</span> : null}
        </button>
      </nav>

      <div className="drawer-body">
        {activeTab === "overview" && (
          <OverviewTab
            node={node}
            inputs={inputs}
            outputs={outputs}
            nodeNamesById={nodeNamesById}
          />
        )}
        {activeTab === "files" && <FilesTab node={node} />}
        {activeTab === "commands" && <CommandsTab node={node} />}
        {activeTab === "findings" && <FindingsTab node={node} />}
      </div>
    </aside>
  );
});

export default NodeDetailDrawer;
