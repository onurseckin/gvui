import {
  IconBinary,
  IconCoins,
  IconFiles,
  IconHierarchy2,
  IconInfoCircle,
  IconListDetails,
  IconPhoto,
  IconShieldSearch,
  IconStatusChange,
  IconTerminal,
  IconTool,
  IconX,
} from "@tabler/icons-react";
import type { CSSProperties, FC } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphNodeData, IoPort } from "../../types/graphData";
import { collectGenericNodeFields, describeOpenIdentity, describeOpenStatus } from "../OpenSchema";
import { EvidenceChip, UnknownValue } from "./EvidenceChip";
import {
  nodeCarriesAgent,
  readAssets,
  readBrowserTests,
  readScripts,
  readStateTransitions,
  readTelemetry,
  readTokenFootprint,
  readTools,
} from "./nodeSchema";
import { edgeToPort } from "./streamUtils";
import { AssetsTab } from "./tabs/AssetsTab";
import { CostTab } from "./tabs/CostTab";
import { DependenciesTab } from "./tabs/DependenciesTab";
import { DiffsTab } from "./tabs/DiffsTab";
import { FindingsTab } from "./tabs/FindingsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { PropertiesTab } from "./tabs/PropertiesTab";
import { RawProvenanceTab } from "./tabs/RawProvenanceTab";
import { ScriptsTab } from "./tabs/ScriptsTab";
import { StateMachineTab } from "./tabs/StateMachineTab";
import { ToolsTab } from "./tabs/ToolsTab";
import "./NodeDetailDrawer.css";

type TabId =
  | "overview"
  | "dependencies"
  | "cost"
  | "assets"
  | "files"
  | "diffs"
  | "scripts"
  | "tools"
  | "state-machine"
  | "findings"
  | "properties"
  | "provenance";

/**
 * The node inspector. Its tabs follow what the selected node actually carries: a purpose-built view
 * appears only when this dataset has something behind it, and whatever the drawer has no dedicated
 * view for still arrives under Properties rather than being dropped.
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

  const identity = describeOpenIdentity(node);
  const status = describeOpenStatus(node);
  const IconComp = identity.IconComponent;

  const assetsCount = readAssets(node).length;
  const browserRunsCount = readBrowserTests(node).length;
  const scriptsCount = readScripts(node).length;
  const toolsCount = readTools(node).length;
  const transitionsCount = readStateTransitions(node).length;
  const telemetry = readTelemetry(node);
  const carriesAgent = nodeCarriesAgent(node);

  const filesCount =
    (node.files?.length ?? 0) + ((node.metadata?.writeScope as string[])?.length ?? 0);
  const findingsCount = (node.metadata?.findings as unknown[])?.length ?? 0;
  const dependenciesCount = inputs.length + outputs.length;
  const hasRepairOrCritic =
    ((node.metadata?.repairRounds as number | undefined) ?? 0) > 0 || node.kind === "critic";

  // A tab earns its place only when this node has something behind it, so a dataset that speaks a
  // different vocabulary is never handed a row of views built for a schema it does not use.
  const footprint = readTokenFootprint(node);
  const hasCostContent =
    footprint.inputTokens !== undefined ||
    footprint.outputTokens !== undefined ||
    footprint.reasoningTokens !== undefined ||
    footprint.cacheReadTokens !== undefined ||
    footprint.cacheCreationTokens !== undefined ||
    footprint.totalTokens !== undefined ||
    footprint.costUsd !== undefined;
  const genericFields = collectGenericNodeFields(node);

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
      visible: hasCostContent,
    },
    {
      id: "dependencies" as TabId,
      label: "Dependencies & Impact",
      icon: IconHierarchy2,
      count: dependenciesCount,
      visible: dependenciesCount > 0,
    },
    {
      id: "assets" as TabId,
      label: "Assets & Media",
      icon: IconPhoto,
      count: assetsCount + browserRunsCount,
      visible: assetsCount > 0 || browserRunsCount > 0,
    },
    {
      id: "files" as TabId,
      label: "Files & Diffs",
      icon: IconFiles,
      count: filesCount,
      visible: filesCount > 0,
    },
    {
      id: "scripts" as TabId,
      label: "Scripts",
      icon: IconTerminal,
      count: scriptsCount,
      visible: scriptsCount > 0,
    },
    {
      id: "tools" as TabId,
      label: "Tools",
      icon: IconTool,
      count: toolsCount,
      visible: toolsCount > 0,
    },
    {
      id: "state-machine" as TabId,
      label: "State Machine",
      icon: IconStatusChange,
      count: transitionsCount,
      visible: transitionsCount > 0,
    },
    {
      id: "findings" as TabId,
      label: "Feedback & Reviews",
      icon: IconShieldSearch,
      count: findingsCount,
      visible: findingsCount > 0 || hasRepairOrCritic,
    },
    {
      id: "properties" as TabId,
      label: "Properties",
      icon: IconListDetails,
      count: genericFields.total,
      visible: genericFields.total > 0,
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
  const currentTabId = visibleTabs.some((t) => t.id === activeTab)
    ? activeTab
    : (visibleTabs[0]?.id ?? "overview");

  return (
    <aside className="node-drawer" role="complementary" aria-label={`Details for ${node.name}`}>
      <header
        className="drawer-header"
        style={{ "--node-kind-accent": identity.accent } as CSSProperties}
      >
        <div className="drawer-header-top">
          <span className="drawer-kind-icon" style={{ color: identity.accent }}>
            <IconComp size={16} color={identity.accent} />
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
          <span
            className={`drawer-kind-label ${identity.recognized ? "" : "is-custom"}`}
            data-testid="drawer-kind-label"
            title={
              identity.recognized
                ? undefined
                : identity.raw === undefined
                  ? "this node declared neither a kind nor a role"
                  : `${identity.raw} — this dataset's own vocabulary`
            }
          >
            {identity.label}
          </span>
          <span
            className={`drawer-status-pill ${status.recorded ? "" : "is-unknown"}`}
            data-testid="drawer-status-pill"
            style={{ color: status.color }}
            title={status.recorded ? undefined : "no status was recorded for this node"}
          >
            {status.label}
          </span>
          {node.step !== undefined ? (
            <span className="drawer-step-chip">Step {node.step}</span>
          ) : null}
          {carriesAgent ? (
            <span className="drawer-model">
              {telemetry.model ? (
                <>
                  {telemetry.model.value}
                  <EvidenceChip
                    evidenceClass={telemetry.model.evidenceClass}
                    isEstimated={telemetry.model.isEstimated}
                  />
                </>
              ) : (
                <UnknownValue what="Model" />
              )}
            </span>
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
              data-testid={`drawer-tab-${tab.id}`}
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
        {currentTabId === "scripts" && <ScriptsTab node={node} />}
        {currentTabId === "tools" && <ToolsTab node={node} />}
        {currentTabId === "state-machine" && <StateMachineTab node={node} />}
        {currentTabId === "findings" && <FindingsTab node={node} />}
        {currentTabId === "properties" && <PropertiesTab node={node} />}
        {currentTabId === "provenance" && <RawProvenanceTab node={node} />}
      </div>
    </aside>
  );
});

export default NodeDetailDrawer;
