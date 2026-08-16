import { IconCheck, IconCopy } from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { useState } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { copyToClipboard } from "../streamUtils";
import { ProvenanceTimeline } from "./ProvenanceTimeline";

interface RawProvenanceTabProps {
  node: GraphNodeData;
}

export const RawProvenanceTab: FC<RawProvenanceTabProps> = ({ node }) => {
  const [copiedRaw, setCopiedRaw] = useState(false);
  const rawPayload = JSON.stringify(node, null, 2);

  const handleCopyRaw = async (e: MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(rawPayload);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  return (
    <div className="drawer-tab-content">
      {/* 1. Interactive Chain of Custody & Event Timeline */}
      <ProvenanceTimeline node={node} />

      {/* 2. Standard Provenance Identifiers */}
      <DrawerSection title="Provenance Identifiers">
        <ul className="drawer-kv-list">
          <li className="drawer-kv-row">
            <span className="drawer-kv-key">Node ID</span>
            <code className="drawer-kv-value">{node.id}</code>
          </li>
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

      {/* 3. Raw Node Dataset Payload */}
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
