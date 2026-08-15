import { IconCopy } from "@tabler/icons-react";
import type { FC } from "react";
import { memo, useState } from "react";
import type { GraphEdgeData } from "../../../types/graphData";

export interface EdgeRawJsonTabProps {
  edge: GraphEdgeData;
}

export const EdgeRawJsonTab: FC<EdgeRawJsonTabProps> = memo(function EdgeRawJsonTab({ edge }) {
  const [copied, setCopied] = useState<boolean>(false);
  const jsonString = JSON.stringify(edge, null, 2);

  const handleCopy = () => {
    void navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="edge-drawer-tab-content">
      <section className="edge-drawer-section">
        <div className="edge-section-header-row">
          <h4 className="edge-drawer-section-title">Raw Edge Data (JSON)</h4>
          <button
            type="button"
            className={`edge-copy-btn ${copied ? "is-copied" : ""}`}
            onClick={handleCopy}
          >
            <IconCopy size={12} />
            <span>{copied ? "Copied" : "Copy JSON"}</span>
          </button>
        </div>
        <pre className="edge-pre edge-pre--full">
          <code>{jsonString}</code>
        </pre>
      </section>
    </div>
  );
});

EdgeRawJsonTab.displayName = "EdgeRawJsonTab";
