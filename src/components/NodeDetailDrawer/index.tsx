import {
  IconBinary,
  IconCoins,
  IconFiles,
  IconHierarchy2,
  IconInfoCircle,
  IconPhoto,
  IconShieldSearch,
  IconTerminal,
  IconX,
} from "@tabler/icons-react";
import type { CSSProperties, FC } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { describeNodeKind, describeNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphNodeData, IoPort } from "../../types/graphData";
import { edgeToPort } from "./streamUtils";
import { AssetsTab } from "./tabs/AssetsTab";
import { CommandsTab } from "./tabs/CommandsTab";
import { CostTab } from "./tabs/CostTab";
import { DependenciesTab } from "./tabs/DependenciesTab";
import { DiffsTab } from "./tabs/DiffsTab";
import { FindingsTab } from "./tabs/FindingsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { RawProvenanceTab } from "./tabs/RawProvenanceTab";
import "./NodeDetailDrawer.css";

type TabId =
  | "overview"
  | "dependencies"
  | "cost"
  | "assets"
  | "files"
  | "diffs"
  | "commands"
  | "findings"
  | "provenance";

/**
 * Node detail inspection drawer providing rich metadata, execution metrics,
 * stream accordions, touched files, executions, reviews, media assets, and raw provenance.
 */
export const NodeDetailDrawer: FC = memo(function NodeDetailDrawer() {
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const dataset = useGraphStore((state) => state.dataset);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const handleClose = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedNodeId(null);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedNodeId, setSelectedNodeId]);

  const node: GraphNodeData | null = useMemo(() => {
    if (!selectedNodeId || !dataset) return null;
    return dataset.nodes.find((c) => c.id === selectedNodeId) ?? null;
  }, [selectedNodeId, dataset]);

  const nodeNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of dataset?.nodes ?? []) map.set(c.id, c.name);
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
  const IconComp = kind.IconComponent;

  const assetsCount =
    (node.mediaAssets?.length ?? 0) +
    (node.screenshots?.length ?? 0) +
    ((node.metadata?.mediaAssets as unknown[])?.length ?? 0) +
    ((node.metadata?.screenshots as unknown[])?.length ?? 0) +
    ((node.metadata?.assets as unknown[])?.length ?? 0) +
    ((node.metadata?.playwrightMetadata?.screenshots as unknown[])?.length ?? 0);

  const filesCount =
    (node.files?.length ?? 0) + ((node.metadata?.writeScope as string[])?.length ?? 0);
  const commandsCount = (node.metadata?.commands as unknown[])?.length ?? 0;
  const findingsCount = (node.metadata?.findings as unknown[])?.length ?? 0;
  const dependenciesCount = inputs.length + outputs.length;
  const hasRepairOrCritic =
    ((node.metadata?.repairRounds as number | undefined) ?? 0) > 0 || node.kind === "critic";

  const tabs = [
    {
      id: "overview" as TabId,
      label: "Overview & I/O",
      icon: IconInfoCircle,
      count: 0,
      visible: true,
    },
    {
      id: "cost" as TabId,
      label: "Cost & Tokens",
      icon: IconCoins,
      count: 0,
      visible: true,
    },
    {
      id: "dependencies" as TabId,
      label: "Dependencies & Impact",
      icon: IconHierarchy2,
      count: dependenciesCount,
      visible: true,
    },
    {
      id: "assets" as TabId,
      label: "Assets & Media",
      icon: IconPhoto,
      count: assetsCount,
      visible: assetsCount > 0 || Boolean(node.metadata?.playwrightMetadata),
    },
    {
      id: "files" as TabId,
      label: "Files & Diffs",
      icon: IconFiles,
      count: filesCount,
      visible: filesCount > 0,
    },
    {
      id: "commands" as TabId,
      label: "Executions",
      icon: IconTerminal,
      count: commandsCount,
      visible: commandsCount > 0,
    },
    {
      id: "findings" as TabId,
      label: "Feedback & Reviews",
      icon: IconShieldSearch,
      count: findingsCount,
      visible: findingsCount > 0 || hasRepairOrCritic,
    },
    {
      id: "provenance" as TabId,
      label: "Raw Provenance",
      icon: IconBinary,
      count: 0,
      visible: true,
    },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);
  const currentTabId = visibleTabs.some((t) => t.id === activeTab) ? activeTab : "overview";

  return (
    <aside className="node-drawer" role="complementary" aria-label={`Details for ${node.name}`}>
      <header
        className="drawer-header"
        style={{ "--node-kind-accent": kind.accent } as CSSProperties}
      >
        <div className="drawer-header-top">
          <span className="drawer-kind-icon" style={{ color: kind.accent }}>
            <IconComp size={16} color={kind.accent} />
          </span>
          <h2 className="drawer-title">{node.name}</h2>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={handleClose}
            aria-label="Close details"
            title="Close (Esc)"
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="drawer-header-meta">
          <span className="drawer-kind-label">{kind.label}</span>
          <span className="drawer-status-pill" style={{ color: status.color }}>
            {status.label}
          </span>
          {node.step !== undefined ? (
            <span className="drawer-step-chip">Step {node.step}</span>
          ) : null}
          {node.model ? <span className="drawer-model">{node.model}</span> : null}
          {node.harnessModel ? (
            <span className="drawer-model drawer-model--harness">harness: {node.harnessModel}</span>
          ) : null}
          <code className="drawer-id">{node.id}</code>
        </div>
      </header>

      <nav className="drawer-tabs" aria-label="Detail Sections">
        {visibleTabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={`drawer-tab ${currentTabId === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon size={14} />
              <span>{tab.label}</span>
              {tab.count > 0 ? <span className="drawer-tab-badge">{tab.count}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="drawer-body">
        {currentTabId === "overview" && (
          <OverviewTab
            node={node}
            inputs={inputs}
            outputs={outputs}
            nodeNamesById={nodeNamesById}
            onSelectNode={setSelectedNodeId}
            dataset={dataset}
          />
        )}
        {currentTabId === "cost" && (
          <CostTab node={node} dataset={dataset} onSelectNode={setSelectedNodeId} />
        )}
        {currentTabId === "dependencies" && (
          <DependenciesTab node={node} dataset={dataset} onSelectNode={setSelectedNodeId} />
        )}
        {currentTabId === "assets" && <AssetsTab node={node} />}
        {(currentTabId === "files" || currentTabId === "diffs") && <DiffsTab node={node} />}
        {currentTabId === "commands" && <CommandsTab node={node} />}
        {currentTabId === "findings" && <FindingsTab node={node} />}
        {currentTabId === "provenance" && <RawProvenanceTab node={node} />}
      </div>
    </aside>
  );
});

export default NodeDetailDrawer;
