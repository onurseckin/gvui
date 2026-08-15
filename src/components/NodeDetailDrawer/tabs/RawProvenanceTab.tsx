import type { FC } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";

interface RawProvenanceTabProps {
  node: GraphNodeData;
}

export const RawProvenanceTab: FC<RawProvenanceTabProps> = ({ node }) => {
  return (
    <div className="drawer-tab-content">
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
        </ul>
      </DrawerSection>

      <DrawerSection title="Raw Node Dataset Payload">
        <pre className="drawer-pre" style={{ maxHeight: "360px", fontSize: "11px" }}>
          {JSON.stringify(node, null, 2)}
        </pre>
      </DrawerSection>
    </div>
  );
};
