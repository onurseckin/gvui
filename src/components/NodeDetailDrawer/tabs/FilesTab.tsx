import type { FC } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";

interface FilesTabProps {
  node: GraphNodeData;
}

export const FilesTab: FC<FilesTabProps> = ({ node }) => {
  const files = node.files ?? [];
  const writeScope = node.metadata?.writeScope as string[] | undefined;

  return (
    <div className="drawer-tab-content">
      {writeScope && writeScope.length > 0 ? (
        <DrawerSection title="Assigned Write Scope" count={writeScope.length}>
          <ul className="drawer-file-list">
            {writeScope.map((scope, index) => (
              <li key={`scope-${scope}-${index}`} className="drawer-file-row">
                <span className="drawer-file-mode mode-write">scope</span>
                <code className="drawer-file-path">{scope}</code>
              </li>
            ))}
          </ul>
        </DrawerSection>
      ) : null}

      {files.length > 0 ? (
        <DrawerSection title="Touched Files & Diffs" count={files.length}>
          <ul className="drawer-file-list">
            {files.map((file, index) => (
              <li key={`${file.path}-${index}`} className="drawer-file-row">
                <span className={`drawer-file-mode mode-${file.mode ?? "read"}`}>
                  {file.mode ?? "read"}
                </span>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}
                >
                  <code className="drawer-file-path">
                    {file.path}
                    {file.lines ? `:${file.lines}` : ""}
                  </code>
                  {file.diff ? (
                    <pre className="drawer-pre" style={{ maxHeight: "200px" }}>
                      {file.diff}
                    </pre>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </DrawerSection>
      ) : (
        <p className="drawer-prose" style={{ color: "#71717a", padding: "16px" }}>
          No file modifications recorded for this node.
        </p>
      )}
    </div>
  );
};
