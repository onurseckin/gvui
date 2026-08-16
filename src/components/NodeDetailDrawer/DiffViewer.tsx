import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconFileCode,
  IconFileMinus,
  IconFilePlus,
  IconFileText,
} from "@tabler/icons-react";
import type { FC, ReactNode } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import type { FileMode, FileRef } from "../../types/graphData";
import { copyToClipboard } from "./streamUtils";

export type DiffLineType = "add" | "del" | "hunk" | "context" | "header";

export interface ParsedDiffLine {
  type: DiffLineType;
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  raw: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  totalChanges: number;
}

/**
 * Parse a raw unified diff text into classified lines with accurate line numbers.
 * Supports standard git diff format including hunk headers (@@ -old,count +new,count @@).
 */
export function parseUnifiedDiff(rawDiff?: string): ParsedDiffLine[] {
  if (!rawDiff || typeof rawDiff !== "string") return [];
  const lines = rawDiff.split(/\r?\n/);
  const parsed: ParsedDiffLine[] = [];

  let oldLine = 1;
  let newLine = 1;
  let hasHunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@ [section]
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/);
    if (hunkMatch) {
      hasHunk = true;
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[3], 10);
      parsed.push({
        type: "hunk",
        text: line,
        oldLineNumber: null,
        newLineNumber: null,
        raw: line,
      });
      continue;
    }

    // Git header lines: diff --git, index, --- a/, +++ b/, etc.
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to")
    ) {
      parsed.push({
        type: "header",
        text: line,
        oldLineNumber: null,
        newLineNumber: null,
        raw: line,
      });
      continue;
    }

    if (line.startsWith("+")) {
      parsed.push({
        type: "add",
        text: line,
        oldLineNumber: null,
        newLineNumber: hasHunk ? newLine++ : i + 1,
        raw: line,
      });
    } else if (line.startsWith("-")) {
      parsed.push({
        type: "del",
        text: line,
        oldLineNumber: hasHunk ? oldLine++ : i + 1,
        newLineNumber: null,
        raw: line,
      });
    } else {
      // Context or unchanged line
      parsed.push({
        type: "context",
        text: line,
        oldLineNumber: hasHunk ? oldLine++ : i + 1,
        newLineNumber: hasHunk ? newLine++ : i + 1,
        raw: line,
      });
    }
  }

  return parsed;
}

/**
 * Calculate additions and deletions count from parsed diff lines or diff string.
 */
export function calculateDiffStats(parsedOrDiff: ParsedDiffLine[] | string | undefined): DiffStats {
  if (!parsedOrDiff) return { additions: 0, deletions: 0, totalChanges: 0 };
  const lines = typeof parsedOrDiff === "string" ? parseUnifiedDiff(parsedOrDiff) : parsedOrDiff;
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.type === "add") additions++;
    else if (line.type === "del") deletions++;
  }
  return { additions, deletions, totalChanges: additions + deletions };
}

export interface DiffViewerProps {
  file?: FileRef;
  filePath?: string;
  oldPath?: string;
  newPath?: string;
  diff?: string;
  mode?: FileMode | string;
  additions?: number;
  deletions?: number;
  lines?: string;
  isExpanded?: boolean;
  defaultExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
  showLineNumbers?: boolean;
  showHeader?: boolean;
  maxHeight?: number | string;
  className?: string;
  title?: string;
  round?: number | string;
  extraHeaderActions?: ReactNode;
}

/**
 * High-fidelity unified diff viewer presenting syntax highlighting,
 * dual line numbering, hunk header parsing, churn badges, and clipboard copy.
 */
export const DiffViewer: FC<DiffViewerProps> = memo(function DiffViewer({
  file,
  filePath: rawPath,
  diff: rawDiff,
  mode: rawMode,
  additions: rawAdditions,
  deletions: rawDeletions,
  lines: rawLines,
  isExpanded: controlledExpanded,
  defaultExpanded = true,
  onToggleExpand,
  showLineNumbers = true,
  showHeader = true,
  maxHeight,
  className = "",
  title,
  round,
  extraHeaderActions,
}) {
  const filePath = rawPath ?? file?.path ?? "unknown-file";
  const diffContent = rawDiff ?? file?.diff ?? "";
  const mode = rawMode ?? file?.mode ?? "write";
  const lineRange = rawLines ?? file?.lines;

  const [internalExpanded, setInternalExpanded] = useState<boolean>(defaultExpanded);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const [isCopied, setIsCopied] = useState<boolean>(false);

  const parsedLines = useMemo(() => parseUnifiedDiff(diffContent), [diffContent]);

  const stats = useMemo(() => {
    if (rawAdditions !== undefined || rawDeletions !== undefined) {
      const adds = rawAdditions ?? 0;
      const dels = rawDeletions ?? 0;
      return { additions: adds, deletions: dels, totalChanges: adds + dels };
    }
    if (file?.additions !== undefined || file?.deletions !== undefined) {
      const adds = file.additions ?? 0;
      const dels = file.deletions ?? 0;
      return { additions: adds, deletions: dels, totalChanges: adds + dels };
    }
    return calculateDiffStats(parsedLines);
  }, [rawAdditions, rawDeletions, file?.additions, file?.deletions, parsedLines]);

  const handleToggle = useCallback(() => {
    const nextState = !isExpanded;
    if (controlledExpanded === undefined) {
      setInternalExpanded(nextState);
    }
    onToggleExpand?.(nextState);
  }, [isExpanded, controlledExpanded, onToggleExpand]);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const textToCopy = diffContent || filePath;
      const success = await copyToClipboard(textToCopy);
      if (success) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    },
    [diffContent, filePath],
  );

  const hasChurn = stats.additions > 0 || stats.deletions > 0;

  const FileIcon = useMemo(() => {
    if (mode === "create") return IconFilePlus;
    if (mode === "delete") return IconFileMinus;
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx") || filePath.endsWith(".js")) {
      return IconFileCode;
    }
    return IconFileText;
  }, [mode, filePath]);

  return (
    <div
      className={`drawer-diff-file-card ${isExpanded ? "is-expanded" : "is-collapsed"} ${className}`.trim()}
      data-path={filePath}
    >
      {showHeader && (
        <header
          className="drawer-diff-file-header"
          onClick={handleToggle}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          aria-label={`Toggle diff for ${filePath}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleToggle();
            }
          }}
        >
          <div className="drawer-diff-header-left">
            <span className="drawer-diff-expand-icon" aria-hidden="true">
              {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </span>
            <span className={`drawer-file-mode mode-${mode}`}>{mode}</span>
            <FileIcon size={14} className="drawer-diff-path-icon" />
            <code className="drawer-file-path" title={filePath}>
              {title || filePath}
              {lineRange ? `:${lineRange}` : ""}
            </code>
            {round !== undefined && (
              <span className="drawer-diff-round-badge">{`Round ${round}`}</span>
            )}
          </div>

          <div className="drawer-diff-header-right" onClick={(e) => e.stopPropagation()}>
            {hasChurn && (
              <span className="drawer-file-churn">
                {stats.additions > 0 && (
                  <span className="drawer-churn-add" title={`${stats.additions} additions`}>
                    {`+${stats.additions}`}
                  </span>
                )}
                {stats.deletions > 0 && (
                  <span className="drawer-churn-del" title={`${stats.deletions} deletions`}>
                    {`-${stats.deletions}`}
                  </span>
                )}
                <span
                  className="drawer-churn-total"
                  title={`${stats.totalChanges} total lines changed`}
                >
                  {`Δ ${stats.totalChanges}`}
                </span>
              </span>
            )}

            {extraHeaderActions}

            {diffContent ? (
              <button
                type="button"
                className={`drawer-diff-copy-btn ${isCopied ? "is-copied" : ""}`}
                onClick={handleCopy}
                title="Copy diff to clipboard"
                aria-label={`Copy diff for ${filePath}`}
              >
                {isCopied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                <span>{isCopied ? "Copied!" : "Copy"}</span>
              </button>
            ) : null}
          </div>
        </header>
      )}

      {isExpanded && (
        <div
          className="drawer-diff-viewer"
          tabIndex={0}
          role="region"
          aria-label={`Diff for ${filePath}`}
          style={maxHeight ? { maxHeight } : undefined}
        >
          {parsedLines.length > 0 ? (
            parsedLines.map((line, lineIdx) => {
              let lineTypeClass = "drawer-diff-line--context";
              if (line.type === "add") lineTypeClass = "drawer-diff-line--add";
              else if (line.type === "del") lineTypeClass = "drawer-diff-line--del";
              else if (line.type === "hunk") lineTypeClass = "drawer-diff-line--hunk";
              else if (line.type === "header") lineTypeClass = "drawer-diff-line--header";

              return (
                <div key={lineIdx} className={`drawer-diff-line ${lineTypeClass}`}>
                  {showLineNumbers && (
                    <>
                      <span
                        className="drawer-diff-lineno drawer-diff-lineno--old"
                        aria-hidden="true"
                      >
                        {line.oldLineNumber !== null ? line.oldLineNumber : ""}
                      </span>
                      <span
                        className="drawer-diff-lineno drawer-diff-lineno--new"
                        aria-hidden="true"
                      >
                        {line.newLineNumber !== null ? line.newLineNumber : ""}
                      </span>
                    </>
                  )}
                  <span className="drawer-diff-gutter" aria-hidden="true">
                    {line.type === "add"
                      ? "+"
                      : line.type === "del"
                        ? "-"
                        : line.type === "hunk"
                          ? "@@"
                          : " "}
                  </span>
                  <span className="drawer-diff-text">{line.text}</span>
                </div>
              );
            })
          ) : (
            <div className="drawer-diff-empty-notice">
              {diffContent ? diffContent : "No line-level diff content recorded for this file."}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

DiffViewer.displayName = "DiffViewer";
