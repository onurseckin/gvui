import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconSearch,
  IconTimelineEvent,
} from "@tabler/icons-react";
import type { FC } from "react";
import { memo, useMemo } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { EvidenceChip } from "../EvidenceChip";
import { readStateTransitions, type TransitionClass, type TransitionRow } from "../nodeSchema";
import { formatTimestamp } from "./ProvenanceTimeline";

export interface StateMachineTabProps {
  node: GraphNodeData;
}

interface ClassDescriptor {
  label: string;
  note: string;
  className: string;
}

const CLASS_DESCRIPTORS: Readonly<Record<TransitionClass, ClassDescriptor>> = Object.freeze({
  probe: {
    label: "Adversarial Probe",
    note: "Proof demanded. A probe is not a rejection and does not consume the repair budget.",
    className: "state-transition-card is-probe",
  },
  pushback: {
    label: "Pushback",
    note: "A defect was asserted against the submitted work.",
    className: "state-transition-card is-pushback",
  },
  plain: {
    label: "Transition",
    note: "",
    className: "state-transition-card is-plain",
  },
});

function roundLabel(row: TransitionRow): string | undefined {
  if (row.round === undefined) return undefined;
  return row.transitionClass === "probe" ? `Probe Round ${row.round}` : `Round ${row.round}`;
}

const TransitionCard: FC<{ row: TransitionRow }> = ({ row }) => {
  const descriptor = CLASS_DESCRIPTORS[row.transitionClass];
  const round = roundLabel(row);
  return (
    <li className={descriptor.className}>
      <div className="state-transition-head">
        <span className="state-transition-kind">
          {row.transitionClass === "probe" ? (
            <IconSearch size={12} />
          ) : row.transitionClass === "pushback" ? (
            <IconAlertTriangle size={12} />
          ) : (
            <IconTimelineEvent size={12} />
          )}
          {descriptor.label}
        </span>
        <EvidenceChip evidenceClass={row.evidenceClass} />
      </div>

      <div className="state-transition-move">
        <code className="state-transition-state">{row.from}</code>
        <IconArrowNarrowRight size={14} />
        <code className="state-transition-state">{row.to}</code>
      </div>

      <div className="state-transition-meta">
        <span className="state-transition-actor">{row.actor ?? "actor unknown"}</span>
        {row.attempt !== undefined ? <span>{`Attempt ${row.attempt}`}</span> : null}
        {round ? <span className="state-transition-round">{round}</span> : null}
        {row.verdict ? (
          <span className={`state-transition-verdict verdict-${row.verdict.toLowerCase()}`}>
            {`verdict: ${row.verdict}`}
          </span>
        ) : null}
        {row.findingClass ? (
          <span className="state-transition-finding-class">{row.findingClass}</span>
        ) : null}
        {row.findingCount !== undefined ? (
          <span>{`${row.findingCount} finding${row.findingCount === 1 ? "" : "s"}`}</span>
        ) : null}
        {row.at ? <span className="state-transition-time">{formatTimestamp(row.at)}</span> : null}
      </div>

      {row.reason ? <p className="state-transition-reason">{row.reason}</p> : null}
      {descriptor.note ? <p className="state-transition-note">{descriptor.note}</p> : null}
    </li>
  );
};

/**
 * The recorded task state machine: every move, who made it, and — when a review caused it — the
 * verdict that did. Probe rounds and pushback rounds are rendered as the different things they are.
 */
export const StateMachineTab: FC<StateMachineTabProps> = memo(function StateMachineTab({ node }) {
  const transitions = useMemo(() => readStateTransitions(node), [node]);

  const counts = useMemo(() => {
    let probes = 0;
    let pushbacks = 0;
    for (const row of transitions) {
      if (row.transitionClass === "probe") probes += 1;
      if (row.transitionClass === "pushback") pushbacks += 1;
    }
    return { probes, pushbacks };
  }, [transitions]);

  if (transitions.length === 0) {
    return (
      <div className="drawer-tab-content" data-testid="state-machine-tab">
        <div className="drawer-empty-state">No state transitions were recorded for this node.</div>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content" data-testid="state-machine-tab">
      <DrawerSection title="Recorded State Machine" count={transitions.length}>
        <div className="state-machine-summary" data-testid="state-machine-summary">
          <span className="state-machine-summary-item is-probe" data-testid="probe-round-count">
            <IconSearch size={12} />
            {`${counts.probes} probe round${counts.probes === 1 ? "" : "s"}`}
          </span>
          <span
            className="state-machine-summary-item is-pushback"
            data-testid="pushback-round-count"
          >
            <IconAlertTriangle size={12} />
            {`${counts.pushbacks} pushback${counts.pushbacks === 1 ? "" : "s"}`}
          </span>
        </div>

        <ol className="state-transition-list">
          {transitions.map((row, index) => (
            <TransitionCard key={`${row.from}-${row.to}-${row.at ?? index}`} row={row} />
          ))}
        </ol>
      </DrawerSection>
    </div>
  );
});
