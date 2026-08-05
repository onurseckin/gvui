import type { FC, ReactNode } from "react";
import { memo } from "react";
import type { FileMode, GraphNodeData } from "../../../types/graphData";
import { formatFileChipLabel, formatOverflowLabel, selectFileRefs } from "./nodeCardModel";

const FILE_ICONS: Readonly<Record<FileMode, ReactNode>> = Object.freeze({
  read: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  write: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  attach: (
    <path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
});

const DEFAULT_FILE_MODE: FileMode = "read";

export interface NodeCardFilesProps {
  node: GraphNodeData;
}

/**
 * File chips, showing the basename only — a full repo path is mostly shared prefix and would eat
 * the card's width to say nothing. The full path is on the chip's tooltip and in the drawer.
 *
 * Writes are tinted apart from reads on purpose: in a trace, which files a run *mutated* is the
 * thing you scan for, and it should not require reading the label to find them.
 */
export const NodeCardFiles: FC<NodeCardFilesProps> = memo(({ node }) => {
  const { shown, overflow } = selectFileRefs(node);
  if (shown.length === 0) {
    return null;
  }

  return (
    <div className="node-card-chip-row">
      {shown.map((file, index) => {
        const mode = file.mode ?? DEFAULT_FILE_MODE;
        return (
          <span
            key={`${file.path}-${index}`}
            className={`node-chip node-chip--file node-chip--file-${mode}`}
            title={`${mode}: ${file.path}${file.lines ? `:${file.lines}` : ""}`}
          >
            <svg
              className="node-chip-icon"
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {FILE_ICONS[mode]}
            </svg>
            <span className="node-chip-label">{formatFileChipLabel(file)}</span>
          </span>
        );
      })}
      {overflow > 0 ? (
        <span className="node-chip node-chip--overflow" title={`${overflow} more`}>
          <span className="node-chip-label">{formatOverflowLabel(overflow)}</span>
        </span>
      ) : null}
    </div>
  );
});

NodeCardFiles.displayName = "NodeCardFiles";
