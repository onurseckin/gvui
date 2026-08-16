import {
  IconArrowsMinimize,
  IconCheck,
  IconClock,
  IconCopy,
  IconFilter,
  IconFolder,
  IconGitCompare,
  IconHistory,
  IconLayoutList,
  IconSearch,
  IconAlertTriangle,
} from "@tabler/icons-react";
import type { FC } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import type { FileMode, FileRef, GraphNodeData } from "../../../types/graphData";
import { DiffViewer, type DiffStats, calculateDiffStats } from "../DiffViewer";
import { DrawerSection } from "../DrawerSection";
import { copyToClipboard } from "../streamUtils";

export interface DiffRound {
  round: number | string;
  title?: string;
  label?: string;
  name?: string;
  type?: "submission" | "repair" | "remediation" | "initial" | string;
  timestamp?: string;
  files?: FileRef[];
  diff?: string;
  summary?: string;
  additions?: number;
  deletions?: number;
  findingId?: string;
  remediationGoal?: string;
  author?: string;
  status?: string;
}

export interface DiffsTabProps {
  node: GraphNodeData;
}

interface NormalizedRound {
  id: string;
  roundNumber: number | string;
  title: string;
  type: "submission" | "repair" | "remediation" | "initial" | string;
  timestamp?: string;
  summary?: string;
  findingId?: string;
  remediationGoal?: string;
  author?: string;
  files: FileRef[];
  stats: DiffStats;
}

/**
 * Extract and normalize multi-round diffs from various node metadata shapes.
 */
function extractRounds(node: GraphNodeData): NormalizedRound[] {
  const metadata = node.metadata;
  const rawRounds = (metadata?.rounds || metadata?.diffRounds) as DiffRound[] | undefined;
  const rawSubmissions = metadata?.submissions as
    | Array<{
        round: number;
        files?: FileRef[];
        diff?: string;
        summary?: string;
        timestamp?: string;
        author?: string;
      }>
    | undefined;
  const rawRemediations = metadata?.remediations as
    | Array<{
        round?: number;
        findingId?: string;
        files?: FileRef[];
        diff?: string;
        remediation?: string;
        timestamp?: string;
      }>
    | undefined;

  const results: NormalizedRound[] = [];

  if (Array.isArray(rawRounds) && rawRounds.length > 0) {
    for (let idx = 0; idx < rawRounds.length; idx++) {
      const r = rawRounds[idx];
      const files = r.files ?? [];
      let adds = r.additions ?? 0;
      let dels = r.deletions ?? 0;

      if (r.additions === undefined && r.deletions === undefined) {
        for (const f of files) {
          const s = calculateDiffStats(f.diff);
          adds += f.additions ?? s.additions;
          dels += f.deletions ?? s.deletions;
        }
        if (r.diff) {
          const s = calculateDiffStats(r.diff);
          adds += s.additions;
          dels += s.deletions;
        }
      }

      const rNum = r.round !== undefined ? r.round : idx + 1;
      const type = r.type ?? (idx === 0 ? "initial" : "repair");
      const title =
        r.title ||
        r.label ||
        r.name ||
        (type === "initial" || type === "submission"
          ? `Round ${rNum}: Initial Submission`
          : type === "remediation"
            ? `Round ${rNum}: Remediation${r.findingId ? ` (${r.findingId})` : ""}`
            : `Round ${rNum}: Repair Round`);

      results.push({
        id: `round-${rNum}-${idx}`,
        roundNumber: rNum,
        title,
        type,
        timestamp: r.timestamp,
        summary: r.summary,
        findingId: r.findingId,
        remediationGoal: r.remediationGoal,
        author: r.author,
        files:
          files.length > 0
            ? files
            : r.diff
              ? [{ path: `patch-round-${rNum}.diff`, diff: r.diff, mode: "write" as FileMode }]
              : [],
        stats: { additions: adds, deletions: dels, totalChanges: adds + dels },
      });
    }
  }

  if (Array.isArray(rawSubmissions) && rawSubmissions.length > 0) {
    for (let idx = 0; idx < rawSubmissions.length; idx++) {
      const sub = rawSubmissions[idx];
      const files = sub.files ?? [];
      let adds = 0;
      let dels = 0;
      for (const f of files) {
        const s = calculateDiffStats(f.diff);
        adds += f.additions ?? s.additions;
        dels += f.deletions ?? s.deletions;
      }
      if (sub.diff) {
        const s = calculateDiffStats(sub.diff);
        adds += s.additions;
        dels += s.deletions;
      }
      results.push({
        id: `sub-${sub.round}-${idx}`,
        roundNumber: sub.round,
        title: `Submission Round ${sub.round}`,
        type: idx === 0 ? "initial" : "submission",
        timestamp: sub.timestamp,
        summary: sub.summary,
        author: sub.author,
        files:
          files.length > 0
            ? files
            : sub.diff
              ? [
                  {
                    path: `submission-${sub.round}.diff`,
                    diff: sub.diff,
                    mode: "write" as FileMode,
                  },
                ]
              : [],
        stats: { additions: adds, deletions: dels, totalChanges: adds + dels },
      });
    }
  }

  if (Array.isArray(rawRemediations) && rawRemediations.length > 0) {
    for (let idx = 0; idx < rawRemediations.length; idx++) {
      const rem = rawRemediations[idx];
      const rNum = rem.round ?? results.length + 1;
      const files = rem.files ?? [];
      let adds = 0;
      let dels = 0;
      for (const f of files) {
        const s = calculateDiffStats(f.diff);
        adds += f.additions ?? s.additions;
        dels += f.deletions ?? s.deletions;
      }
      if (rem.diff) {
        const s = calculateDiffStats(rem.diff);
        adds += s.additions;
        dels += s.deletions;
      }
      results.push({
        id: `rem-${rNum}-${idx}`,
        roundNumber: rNum,
        title: `Remediation Round ${rNum}${rem.findingId ? ` (${rem.findingId})` : ""}`,
        type: "remediation",
        timestamp: rem.timestamp,
        summary: rem.remediation,
        findingId: rem.findingId,
        files:
          files.length > 0
            ? files
            : rem.diff
              ? [{ path: `remediation-${rNum}.diff`, diff: rem.diff, mode: "write" as FileMode }]
              : [],
        stats: { additions: adds, deletions: dels, totalChanges: adds + dels },
      });
    }
  }

  if (results.length > 0) {
    return results.sort((a, b) => Number(a.roundNumber) - Number(b.roundNumber));
  }

  // Fallback to node.files
  const files = node.files ?? [];
  if (files.length > 0) {
    let adds = 0;
    let dels = 0;
    for (const f of files) {
      const s = calculateDiffStats(f.diff);
      adds += f.additions ?? s.additions;
      dels += f.deletions ?? s.deletions;
    }
    return [
      {
        id: "round-current",
        roundNumber: 1,
        title: "Working Changes / Round 1",
        type: "initial",
        files,
        stats: { additions: adds, deletions: dels, totalChanges: adds + dels },
      },
    ];
  }

  return [];
}

/**
 * DiffsTab provides a comprehensive multi-file unified diff aggregator,
 * multi-round diff tracking across task submissions & repair rounds,
 * churn statistics, collapsible file tree navigation, and diff copying.
 */
export const DiffsTab: FC<DiffsTabProps> = memo(function DiffsTab({ node }) {
  const writeScope = useMemo(
    () => (node.metadata?.writeScope as string[]) ?? [],
    [node.metadata?.writeScope],
  );
  const rounds = useMemo(() => extractRounds(node), [node]);

  const [selectedRoundId, setSelectedRoundId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<string>("all");
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState<boolean>(true);
  const [isCopiedAll, setIsCopiedAll] = useState<boolean>(false);
  const [showFileTree, setShowFileTree] = useState<boolean>(true);

  // Active round or all rounds combined
  const activeFiles = useMemo(() => {
    if (selectedRoundId === "all" || rounds.length <= 1) {
      const map = new Map<string, FileRef>();
      for (const r of rounds) {
        for (const f of r.files) {
          if (!map.has(f.path)) {
            map.set(f.path, f);
          } else {
            // Merge churn
            const existing = map.get(f.path)!;
            map.set(f.path, {
              ...existing,
              mode: f.mode ?? existing.mode,
              additions: (existing.additions ?? 0) + (f.additions ?? 0),
              deletions: (existing.deletions ?? 0) + (f.deletions ?? 0),
              diff: existing.diff || f.diff,
            });
          }
        }
      }
      return Array.from(map.values());
    }
    const currentRound = rounds.find((r) => r.id === selectedRoundId);
    return currentRound?.files ?? [];
  }, [rounds, selectedRoundId]);

  // Filtered files by search and mode
  const filteredFiles = useMemo(() => {
    return activeFiles.filter((file) => {
      if (selectedMode !== "all" && (file.mode ?? "write") !== selectedMode) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return file.path.toLowerCase().includes(q);
      }
      return true;
    });
  }, [activeFiles, selectedMode, searchQuery]);

  // Aggregate stats across active files
  const aggregateStats = useMemo(() => {
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const file of activeFiles) {
      if (file.additions !== undefined || file.deletions !== undefined) {
        totalAdditions += file.additions ?? 0;
        totalDeletions += file.deletions ?? 0;
      } else {
        const s = calculateDiffStats(file.diff);
        totalAdditions += s.additions;
        totalDeletions += s.deletions;
      }
    }

    const totalLinesChanged = totalAdditions + totalDeletions;
    const addPercentage = totalLinesChanged > 0 ? (totalAdditions / totalLinesChanged) * 100 : 50;
    const delPercentage = totalLinesChanged > 0 ? (totalDeletions / totalLinesChanged) * 100 : 50;

    return {
      totalFiles: activeFiles.length,
      totalAdditions,
      totalDeletions,
      totalLinesChanged,
      addPercentage,
      delPercentage,
    };
  }, [activeFiles]);

  const repairRoundsCount = (node.metadata?.repairRounds as number | undefined) ?? 0;

  // Toggle single file expanded state
  const handleToggleFile = useCallback((path: string, expanded: boolean) => {
    setExpandedFiles((prev) => ({ ...prev, [path]: expanded }));
  }, []);

  // Expand or collapse all files
  const handleToggleAllExpanded = useCallback(() => {
    const nextState = !allExpanded;
    setAllExpanded(nextState);
    const newExpandedMap: Record<string, boolean> = {};
    for (const f of activeFiles) {
      newExpandedMap[f.path] = nextState;
    }
    setExpandedFiles(newExpandedMap);
  }, [allExpanded, activeFiles]);

  // Copy all merged diffs
  const handleCopyAllDiffs = useCallback(async () => {
    const parts: string[] = [];
    for (const f of filteredFiles) {
      parts.push(`diff --git a/${f.path} b/${f.path}`);
      if (f.mode) parts.push(`mode: ${f.mode}`);
      if (f.diff) {
        parts.push(f.diff);
      } else {
        parts.push(`(no diff content, +${f.additions ?? 0} -${f.deletions ?? 0})`);
      }
      parts.push("");
    }
    const combined = parts.join("\n");
    const success = await copyToClipboard(combined);
    if (success) {
      setIsCopiedAll(true);
      setTimeout(() => setIsCopiedAll(false), 2000);
    }
  }, [filteredFiles]);

  // Available modes count
  const modeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: activeFiles.length,
      write: 0,
      create: 0,
      delete: 0,
      read: 0,
    };
    for (const f of activeFiles) {
      const m = f.mode ?? "write";
      counts[m] = (counts[m] ?? 0) + 1;
    }
    return counts;
  }, [activeFiles]);

  const selectedRoundData = useMemo(() => {
    return rounds.find((r) => r.id === selectedRoundId);
  }, [rounds, selectedRoundId]);

  const isEmpty = activeFiles.length === 0 && writeScope.length === 0 && rounds.length === 0;

  return (
    <div className="drawer-tab-content drawer-diffs-tab" data-testid="diffs-tab">
      {/* Assigned Write Scope Section */}
      {writeScope.length > 0 && (
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
      )}

      {/* Churn & Multi-Round Telemetry Summary */}
      {activeFiles.length > 0 && (
        <div className="drawer-diff-summary-card">
          <div className="drawer-metric-grid">
            <div className="drawer-metric">
              <span className="drawer-metric-label">Files Changed</span>
              <span className="drawer-metric-value">{aggregateStats.totalFiles}</span>
            </div>
            <div className="drawer-metric">
              <span className="drawer-metric-label">Additions</span>
              <span className="drawer-metric-value drawer-churn-add">
                {`+${aggregateStats.totalAdditions}`}
              </span>
            </div>
            <div className="drawer-metric">
              <span className="drawer-metric-label">Deletions</span>
              <span className="drawer-metric-value drawer-churn-del">
                {`-${aggregateStats.totalDeletions}`}
              </span>
            </div>
            <div className="drawer-metric">
              <span className="drawer-metric-label">Net Delta</span>
              <span className="drawer-metric-value">
                {`${aggregateStats.totalAdditions >= aggregateStats.totalDeletions ? "+" : ""}${aggregateStats.totalAdditions - aggregateStats.totalDeletions}`}
              </span>
            </div>
            {repairRoundsCount > 0 && (
              <div className="drawer-metric drawer-metric--warn">
                <span className="drawer-metric-label">Repair Rounds</span>
                <span className="drawer-metric-value">{repairRoundsCount}</span>
              </div>
            )}
          </div>

          {/* Visual Churn Ratio Bar */}
          {aggregateStats.totalLinesChanged > 0 && (
            <div className="drawer-diff-churn-bar-container">
              <div className="drawer-diff-churn-bar">
                <div
                  className="drawer-diff-churn-bar-add"
                  style={{ width: `${aggregateStats.addPercentage}%` }}
                  title={`${aggregateStats.totalAdditions} additions (${Math.round(aggregateStats.addPercentage)}%)`}
                />
                <div
                  className="drawer-diff-churn-bar-del"
                  style={{ width: `${aggregateStats.delPercentage}%` }}
                  title={`${aggregateStats.totalDeletions} deletions (${Math.round(aggregateStats.delPercentage)}%)`}
                />
              </div>
              <div className="drawer-diff-churn-bar-labels">
                <span className="drawer-churn-add">{`+${aggregateStats.totalAdditions} lines`}</span>
                <span className="drawer-diff-total-badge">{`${aggregateStats.totalLinesChanged} total lines`}</span>
                <span className="drawer-churn-del">{`-${aggregateStats.totalDeletions} lines`}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Multi-Round Selector Pills */}
      {rounds.length > 1 && (
        <div
          className="drawer-diff-rounds-selector"
          role="group"
          aria-label="Diff Submission Rounds"
        >
          <div className="drawer-diff-rounds-header">
            <span className="drawer-diff-rounds-title">
              <IconHistory size={13} />
              <span>Multi-Round Tracking</span>
            </span>
            <span className="drawer-diff-rounds-count">{`${rounds.length} rounds`}</span>
          </div>

          <div className="drawer-diff-round-pills">
            <button
              type="button"
              className={`drawer-diff-round-pill ${selectedRoundId === "all" ? "is-active" : ""}`}
              onClick={() => setSelectedRoundId("all")}
            >
              <IconGitCompare size={12} />
              <span>All Rounds Merged</span>
              <span className="drawer-round-pill-count">{activeFiles.length}</span>
            </button>

            {rounds.map((round) => {
              const isSelected = selectedRoundId === round.id;
              const isRepair = round.type === "repair" || round.type === "remediation";

              return (
                <button
                  key={round.id}
                  type="button"
                  className={`drawer-diff-round-pill ${isSelected ? "is-active" : ""} ${isRepair ? "is-repair" : ""}`}
                  onClick={() => setSelectedRoundId(round.id)}
                  title={round.title}
                >
                  {isRepair ? <IconAlertTriangle size={12} /> : <IconClock size={12} />}
                  <span>{round.title}</span>
                  {round.stats.totalChanges > 0 && (
                    <span className="drawer-round-churn-mini">
                      {round.stats.additions > 0 && (
                        <span className="drawer-churn-add">+{round.stats.additions}</span>
                      )}
                      {round.stats.deletions > 0 && (
                        <span className="drawer-churn-del">-{round.stats.deletions}</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Round Context Banner */}
          {selectedRoundData && (
            <div className="drawer-diff-round-banner">
              <div className="drawer-round-banner-header">
                <strong>{selectedRoundData.title}</strong>
                <span className={`drawer-round-type-chip type-${selectedRoundData.type}`}>
                  {selectedRoundData.type}
                </span>
                {selectedRoundData.timestamp && (
                  <span className="drawer-round-timestamp">
                    {new Date(selectedRoundData.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
              {selectedRoundData.findingId && (
                <div className="drawer-round-finding-link">
                  <span>Remediates Finding:</span>
                  <code>{selectedRoundData.findingId}</code>
                </div>
              )}
              {selectedRoundData.summary && (
                <p className="drawer-round-summary-text">{selectedRoundData.summary}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Files & Diffs Section */}
      {activeFiles.length > 0 ? (
        <DrawerSection title="Touched Files & Diffs" count={filteredFiles.length}>
          {/* Interactive Toolbar */}
          <div className="drawer-diff-toolbar">
            <div className="drawer-diff-search-box">
              <IconSearch size={14} className="drawer-search-icon" />
              <input
                type="text"
                className="drawer-diff-search-input"
                placeholder="Filter files by path..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter files by path"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="drawer-search-clear"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear file search"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="drawer-diff-actions">
              {/* File Mode Filters */}
              <div
                className="drawer-diff-mode-filters"
                role="group"
                aria-label="Filter by file mode"
              >
                <span className="drawer-filter-label">
                  <IconFilter size={12} />
                </span>
                <button
                  type="button"
                  className={`drawer-mode-filter-btn ${selectedMode === "all" ? "is-active" : ""}`}
                  onClick={() => setSelectedMode("all")}
                >
                  All ({modeCounts.all})
                </button>
                {modeCounts.write > 0 && (
                  <button
                    type="button"
                    className={`drawer-mode-filter-btn ${selectedMode === "write" ? "is-active" : ""}`}
                    onClick={() => setSelectedMode("write")}
                  >
                    Modified ({modeCounts.write})
                  </button>
                )}
                {modeCounts.create > 0 && (
                  <button
                    type="button"
                    className={`drawer-mode-filter-btn ${selectedMode === "create" ? "is-active" : ""}`}
                    onClick={() => setSelectedMode("create")}
                  >
                    Created ({modeCounts.create})
                  </button>
                )}
                {modeCounts.delete > 0 && (
                  <button
                    type="button"
                    className={`drawer-mode-filter-btn ${selectedMode === "delete" ? "is-active" : ""}`}
                    onClick={() => setSelectedMode("delete")}
                  >
                    Deleted ({modeCounts.delete})
                  </button>
                )}
              </div>

              <div className="drawer-diff-buttons-group">
                <button
                  type="button"
                  className="drawer-toolbar-btn"
                  onClick={() => setShowFileTree(!showFileTree)}
                  title={showFileTree ? "Hide file tree" : "Show file tree"}
                  aria-expanded={showFileTree}
                >
                  <IconFolder size={13} />
                  <span>File Tree</span>
                </button>

                <button
                  type="button"
                  className="drawer-toolbar-btn"
                  onClick={handleToggleAllExpanded}
                  title={allExpanded ? "Collapse all file diffs" : "Expand all file diffs"}
                  aria-label={allExpanded ? "Collapse all files" : "Expand all files"}
                >
                  <IconArrowsMinimize size={13} />
                  <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
                </button>

                <button
                  type="button"
                  className={`drawer-toolbar-btn ${isCopiedAll ? "is-copied" : ""}`}
                  onClick={handleCopyAllDiffs}
                  title="Copy all diffs to clipboard"
                  aria-label="Copy all diffs"
                >
                  {isCopiedAll ? <IconCheck size={13} /> : <IconCopy size={13} />}
                  <span>{isCopiedAll ? "Copied All" : "Copy All"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick File Tree / File List Navigation */}
          {showFileTree && filteredFiles.length > 0 && (
            <div className="drawer-diff-tree-panel">
              <div className="drawer-tree-header">
                <span className="drawer-tree-title">
                  <IconLayoutList size={13} />
                  <span>File Navigation</span>
                </span>
                <span className="drawer-tree-count">{filteredFiles.length} files</span>
              </div>
              <div className="drawer-tree-list">
                {filteredFiles.map((file, idx) => {
                  const hasFileChurn = (file.additions ?? 0) > 0 || (file.deletions ?? 0) > 0;
                  return (
                    <div
                      key={`tree-${file.path}-${idx}`}
                      className="drawer-tree-item"
                      onClick={() => {
                        const target = document.querySelector(`[data-path="${file.path}"]`);
                        if (target) {
                          target.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          const target = document.querySelector(`[data-path="${file.path}"]`);
                          if (target) {
                            target.scrollIntoView({ behavior: "smooth", block: "start" });
                          }
                        }
                      }}
                    >
                      <span className={`drawer-file-mode mode-${file.mode ?? "write"}`}>
                        {file.mode ?? "write"}
                      </span>
                      <code className="drawer-tree-path">{file.path}</code>
                      {hasFileChurn && (
                        <span className="drawer-tree-churn">
                          {(file.additions ?? 0) > 0 && (
                            <span className="drawer-churn-add">{`+${file.additions}`}</span>
                          )}
                          {(file.deletions ?? 0) > 0 && (
                            <span className="drawer-churn-del">{`-${file.deletions}`}</span>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* File Diffs List */}
          {filteredFiles.length > 0 ? (
            <div className="drawer-diff-list">
              {filteredFiles.map((file, index) => {
                const isExpanded =
                  expandedFiles[file.path] !== undefined ? expandedFiles[file.path] : allExpanded;

                return (
                  <DiffViewer
                    key={`${file.path}-${index}`}
                    file={file}
                    filePath={file.path}
                    mode={file.mode}
                    additions={file.additions}
                    deletions={file.deletions}
                    lines={file.lines}
                    diff={file.diff}
                    isExpanded={isExpanded}
                    onToggleExpand={(exp) => handleToggleFile(file.path, exp)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="drawer-empty-state">
              No files match the filter &quot;{searchQuery}&quot;.
            </div>
          )}
        </DrawerSection>
      ) : isEmpty ? (
        <div className="drawer-empty-state">No file modifications recorded for this node.</div>
      ) : null}
    </div>
  );
});

DiffsTab.displayName = "DiffsTab";
