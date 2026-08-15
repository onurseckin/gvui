import type { FC } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";

interface FilesTabProps {
  node: GraphNodeData;
}

/**
 * Filesystem touchpoints and code diff tab presenting assigned write scopes,
 * touched file modes, addition/deletion churn statistics, and line-level diff highlighting.
 */
export const FilesTab: FC<FilesTabProps> = ({ node }) => {
  const files = node.files ?? [];
  const writeScope = (node.metadata?.writeScope as string[]) ?? [];

  return (
    <div className="drawer-tab-content">
      {writeScope.length > 0 ? (
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
            {files.map((file, index) => {
              const hasChurn = (file.additions ?? 0) > 0 || (file.deletions ?? 0) > 0;
              const diffLines = file.diff ? file.diff.split("\n") : [];

              return (
                <li key={`${file.path}-${index}`} className="drawer-file-row">
                  <span className={`drawer-file-mode mode-${file.mode ?? "read"}`}>
                    {file.mode ?? "read"}
                  </span>
                  <div className="drawer-file-detail">
                    <div className="drawer-file-header">
                      <code className="drawer-file-path">
                        {file.path}
                        {file.lines ? `:${file.lines}` : ""}
                      </code>
                      {hasChurn ? (
                        <span className="drawer-file-churn">
                          {(file.additions ?? 0) > 0 && (
                            <span className="drawer-churn-add">{`+${file.additions}`}</span>
                          )}
                          {(file.deletions ?? 0) > 0 && (
                            <span className="drawer-churn-del">{`-${file.deletions}`}</span>
                          )}
                        </span>
                      ) : null}
                    </div>

                    {file.diff && (
                      <div
                        className="drawer-diff-viewer"
                        tabIndex={0}
                        role="region"
                        aria-label={`Diff for ${file.path}`}
                      >
                        {diffLines.map((line, lineIdx) => {
                          let lineType = "context";
                          if (line.startsWith("+")) lineType = "add";
                          else if (line.startsWith("-")) lineType = "del";
                          else if (line.startsWith("@")) lineType = "hunk";

                          return (
                            <div
                              key={lineIdx}
                              className={`drawer-diff-line drawer-diff-line--${lineType}`}
                            >
                              <span className="drawer-diff-lineno">{lineIdx + 1}</span>
                              <span className="drawer-diff-text">{line}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </DrawerSection>
      ) : (
        <div className="drawer-empty-state">No file modifications recorded for this node.</div>
      )}
    </div>
  );
};
