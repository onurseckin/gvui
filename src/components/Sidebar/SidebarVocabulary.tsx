import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset } from "../../types/graphData";
import { UNKNOWN_LABEL } from "../../state/graphSchema";
import { describeOpenEdgeKind, describeOpenKind } from "../OpenSchema";
import { SidebarAccordion } from "./SidebarAccordion";

export interface SidebarVocabularyProps {
  dataset: GraphDataset | null;
  defaultExpanded?: boolean;
}

interface VocabularyEntry {
  key: string;
  label: string;
  accent: string;
  count: number;
  recognized: boolean;
  /** False when the members carry no kind at all, which is not a word this dataset chose. */
  declared: boolean;
}

/** Its own bucket, so silence is never counted as a vocabulary member named "unknown". */
const UNDECLARED_KEY = "\u0000undeclared";

function chipTestId(prefix: string, entry: VocabularyEntry): string {
  return entry.declared ? `${prefix}-${entry.key}` : `${prefix}-unrecorded`;
}

function chipClassName(entry: VocabularyEntry): string {
  if (!entry.declared) return "open-vocab-chip is-unrecorded";
  return entry.recognized ? "open-vocab-chip" : "open-vocab-chip is-custom";
}

function chipTitle(entry: VocabularyEntry, subject: string): string {
  if (!entry.declared) return `these ${subject} recorded no kind`;
  return entry.recognized ? entry.key : `${entry.key} — this dataset's own vocabulary`;
}

function sortEntries(entries: Map<string, VocabularyEntry>): VocabularyEntry[] {
  return [...entries.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * The vocabulary this particular graph speaks: the node kinds and edge kinds it actually uses,
 * whichever they are. A member with no preset treatment is marked as this dataset's own rather than
 * folded into the nearest familiar one.
 */
export const SidebarVocabulary: FC<SidebarVocabularyProps> = React.memo(function SidebarVocabulary({
  dataset,
  defaultExpanded = true,
}) {
  const { kinds, edgeKinds } = useMemo(() => {
    const kindEntries = new Map<string, VocabularyEntry>();
    for (const node of dataset?.nodes ?? []) {
      const kind = describeOpenKind(node);
      const key = kind.raw ?? UNDECLARED_KEY;
      const entry = kindEntries.get(key);
      if (entry) entry.count += 1;
      else {
        kindEntries.set(key, {
          key: kind.raw ?? UNKNOWN_LABEL,
          label: kind.label,
          accent: kind.accent,
          count: 1,
          recognized: kind.recognized,
          declared: kind.raw !== undefined,
        });
      }
    }

    const edgeEntries = new Map<string, VocabularyEntry>();
    for (const edge of dataset?.edges ?? []) {
      const described = describeOpenEdgeKind(edge);
      const key = described.raw ?? UNDECLARED_KEY;
      const entry = edgeEntries.get(key);
      if (entry) entry.count += 1;
      else {
        edgeEntries.set(key, {
          key: described.raw ?? UNKNOWN_LABEL,
          label: described.label,
          accent: described.accent,
          count: 1,
          recognized: described.recognized,
          declared: described.raw !== undefined,
        });
      }
    }

    return { kinds: sortEntries(kindEntries), edgeKinds: sortEntries(edgeEntries) };
  }, [dataset]);

  if (kinds.length === 0) {
    return (
      <div className="sidebar-section" data-testid="sidebar-vocabulary">
        <div className="sidebar-section-header">
          <h4 className="sidebar-section-title">Vocabulary</h4>
        </div>
        <p className="sidebar-empty-state" data-testid="vocabulary-empty">
          No nodes to describe
        </p>
      </div>
    );
  }

  return (
    <SidebarAccordion
      testId="sidebar-vocabulary"
      title="Vocabulary"
      badge={`${kinds.length} ${kinds.length === 1 ? "kind" : "kinds"} • ${edgeKinds.length} edge`}
      defaultExpanded={defaultExpanded}
    >
      <div className="sidebar-vocab-block">
        <span className="sidebar-vocab-heading">Node kinds</span>
        <div className="open-vocab-list" data-testid="vocabulary-node-kinds">
          {kinds.map((entry) => (
            <span
              key={chipTestId("kind", entry)}
              className={chipClassName(entry)}
              data-testid={chipTestId("vocabulary-kind", entry)}
              title={chipTitle(entry, "nodes")}
            >
              <span className="open-vocab-dot" style={{ background: entry.accent }} />
              <span className="open-vocab-label">{entry.label}</span>
              <span className="open-vocab-count">{entry.count}</span>
            </span>
          ))}
        </div>
      </div>

      {edgeKinds.length > 0 ? (
        <div className="sidebar-vocab-block">
          <span className="sidebar-vocab-heading">Edge kinds</span>
          <div className="open-vocab-list" data-testid="vocabulary-edge-kinds">
            {edgeKinds.map((entry) => (
              <span
                key={chipTestId("edge-kind", entry)}
                className={chipClassName(entry)}
                data-testid={chipTestId("vocabulary-edge-kind", entry)}
                title={chipTitle(entry, "edges")}
              >
                <span className="open-vocab-dot" style={{ background: entry.accent }} />
                <span className="open-vocab-label">{entry.label}</span>
                <span className="open-vocab-count">{entry.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </SidebarAccordion>
  );
});

SidebarVocabulary.displayName = "SidebarVocabulary";
