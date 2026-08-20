import { IconCheck, IconCopy } from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { useMemo, useState } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { UnknownValue } from "../EvidenceChip";
import {
  readAssets,
  readRole,
  readScripts,
  readStateTransitions,
  readTelemetry,
  readTools,
} from "../nodeSchema";
import { copyToClipboard } from "../streamUtils";
import { ProvenanceTimeline } from "./ProvenanceTimeline";

interface RawProvenanceTabProps {
  node: GraphNodeData;
}

interface InventoryRow {
  key: string;
  label: string;
  count: number;
  owner: string;
}

export const RawProvenanceTab: FC<RawProvenanceTabProps> = ({ node }) => {
  const [copiedRaw, setCopiedRaw] = useState(false);
  const rawPayload = JSON.stringify(node, null, 2);

  const telemetry = useMemo(() => readTelemetry(node), [node]);
  const role = useMemo(() => readRole(node), [node]);
  const assets = useMemo(() => readAssets(node), [node]);

  // What this node actually carries. Counts only — every item is rendered by the tab that owns it,
  // so the provenance view stays an index instead of becoming a second copy of the drawer.
  const inventory = useMemo<InventoryRow[]>(
    () => [
      { key: "scripts", label: "Scripts", count: readScripts(node).length, owner: "Scripts" },
      { key: "tools", label: "Tools", count: readTools(node).length, owner: "Tools" },
      {
        key: "transitions",
        label: "State transitions",
        count: readStateTransitions(node).length,
        owner: "State Machine",
      },
      { key: "assets", label: "Assets", count: assets.length, owner: "Assets & Media" },
      {
        key: "findings",
        label: "Findings",
        count: Array.isArray(node.metadata?.findings) ? node.metadata.findings.length : 0,
        owner: "Feedback & Reviews",
      },
      {
        key: "files",
        label: "Files touched",
        count: node.files?.length ?? 0,
        owner: "Files & Diffs",
      },
    ],
    [node, assets],
  );

  // Six "none recorded" rows say nothing about a graph that records none of these kinds at all.
  const carriesEvidence = inventory.some((row) => row.count > 0);

  const handleCopyRaw = async (e: MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(rawPayload);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  return (
    <div className="drawer-tab-content">
      <DrawerSection title="Recorded Evidence">
        {carriesEvidence ? null : (
          <p className="drawer-inventory-note" data-testid="evidence-inventory-absent">
            This node records none of these — it carries its own fields instead.
          </p>
        )}
        <ul className="drawer-kv-list" data-testid="evidence-inventory">
          {(carriesEvidence ? inventory : []).map((row) => (
            <li key={row.key} className="drawer-kv-row">
              <span className="drawer-kv-key">{row.label}</span>
              <span className="drawer-kv-value">
                {row.count === 0 ? (
                  <span className="drawer-inventory-absent">none recorded</span>
                ) : (
                  `${row.count} · see ${row.owner}`
                )}
              </span>
            </li>
          ))}
        </ul>
      </DrawerSection>

      <ProvenanceTimeline node={node} />

      <DrawerSection title="Provenance Identifiers">
        <ul className="drawer-kv-list">
          <li className="drawer-kv-row">
            <span className="drawer-kv-key">Node ID</span>
            <code className="drawer-kv-value">{node.id}</code>
          </li>
          <li className="drawer-kv-row">
            <span className="drawer-kv-key">Agent ID</span>
            <span className="drawer-kv-value">
              {telemetry.agentId ?? <UnknownValue what="Agent ID" />}
            </span>
          </li>
          <li className="drawer-kv-row">
            <span className="drawer-kv-key">Role</span>
            <span className="drawer-kv-value">{role ?? <UnknownValue what="Role" />}</span>
          </li>
          <li className="drawer-kv-row">
            <span className="drawer-kv-key">Host</span>
            <span className="drawer-kv-value">
              {telemetry.host ?? <UnknownValue what="Host" />}
            </span>
          </li>
          {telemetry.grantStatus ? (
            <li className="drawer-kv-row">
              <span className="drawer-kv-key">Grant Status</span>
              <span className="drawer-kv-value">{telemetry.grantStatus}</span>
            </li>
          ) : null}
          {node.step !== undefined ? (
            <li className="drawer-kv-row">
              <span className="drawer-kv-key">Execution Step</span>
              <span className="drawer-kv-value">{node.stepLabel ?? `Step ${node.step}`}</span>
            </li>
          ) : null}
          {node.sectionId ? (
            <li className="drawer-kv-row">
              <span className="drawer-kv-key">Section</span>
              <span className="drawer-kv-value">{node.sectionId}</span>
            </li>
          ) : null}
          {node.kind ? (
            <li className="drawer-kv-row">
              <span className="drawer-kv-key">Kind</span>
              <span className="drawer-kv-value">{node.kind}</span>
            </li>
          ) : null}
          {node.status ? (
            <li className="drawer-kv-row">
              <span className="drawer-kv-key">Status</span>
              <span className="drawer-kv-value">{node.status}</span>
            </li>
          ) : null}
        </ul>
      </DrawerSection>

      <DrawerSection title="Raw Node Dataset Payload">
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "6px",
            }}
          >
            <button
              type="button"
              className={`drawer-copy-btn ${copiedRaw ? "is-copied" : ""}`}
              onClick={handleCopyRaw}
              title="Copy raw JSON payload"
              aria-label="Copy raw JSON payload"
            >
              {copiedRaw ? <IconCheck size={11} /> : <IconCopy size={11} />}
              <span>{copiedRaw ? "Copied!" : "Copy Payload"}</span>
            </button>
          </div>
          <pre className="drawer-pre" style={{ maxHeight: "360px" }}>
            {rawPayload}
          </pre>
        </div>
      </DrawerSection>
    </div>
  );
};
