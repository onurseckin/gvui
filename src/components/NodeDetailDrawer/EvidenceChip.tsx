import type { FC, ReactNode } from "react";
import type { EvidenceClass, EvidencedValue } from "./nodeSchema";

export interface EvidenceDescriptor {
  label: string;
  className: string;
  title: string;
}

const DESCRIPTORS: Readonly<Record<EvidenceClass, EvidenceDescriptor>> = Object.freeze({
  harness_observed: {
    label: "measured",
    className: "evidence-chip evidence-chip--harness",
    title: "harness_observed — the harness measured this itself",
  },
  host_reported: {
    label: "host-reported",
    className: "evidence-chip evidence-chip--host",
    title: "host_reported — the host runtime reported this",
  },
  agent_reported: {
    label: "agent-reported",
    className: "evidence-chip evidence-chip--agent",
    title: "agent_reported — an agent claimed this through the CLI",
  },
  derived: {
    label: "derived",
    className: "evidence-chip evidence-chip--derived",
    title: "derived — computed from other recorded values",
  },
  unknown: {
    label: "unknown",
    className: "evidence-chip evidence-chip--unknown",
    title: "unknown — the run did not record where this came from",
  },
});

const UNLABELLED: EvidenceDescriptor = {
  label: "unlabelled",
  className: "evidence-chip evidence-chip--unlabelled",
  title: "This dataset predates evidence labelling, so the value carries no provenance",
};

export function describeEvidence(evidenceClass?: EvidenceClass): EvidenceDescriptor {
  return evidenceClass ? DESCRIPTORS[evidenceClass] : UNLABELLED;
}

export interface EvidenceChipProps {
  evidenceClass?: EvidenceClass;
  isEstimated?: boolean;
}

/** The provenance label that travels beside a value so a measurement never reads like a guess. */
export const EvidenceChip: FC<EvidenceChipProps> = ({ evidenceClass, isEstimated }) => {
  const descriptor = describeEvidence(evidenceClass);
  return (
    <span className="evidence-chip-group">
      <span className={descriptor.className} title={descriptor.title}>
        {descriptor.label}
      </span>
      {isEstimated ? (
        <span
          className="evidence-chip evidence-chip--estimated"
          title="This number is an estimate, not a measurement"
        >
          estimated
        </span>
      ) : null}
    </span>
  );
};

/** The one way this drawer renders an absent value, so absent never looks like data. */
export const UnknownValue: FC<{ what?: string }> = ({ what }) => (
  <span
    className="drawer-unknown-value"
    title={what ? `${what} was never reported for this node` : "never reported for this node"}
  >
    unknown
  </span>
);

export interface EvidencedFieldProps {
  label: string;
  field?: EvidencedValue<string> | EvidencedValue<number>;
  format?: (value: string | number) => ReactNode;
}

/** One labelled telemetry field: the value with its provenance, or an explicit unknown. */
export const EvidencedField: FC<EvidencedFieldProps> = ({ label, field, format }) => (
  <div className="drawer-evidenced-field">
    <span className="drawer-evidenced-label">{label}</span>
    {field ? (
      <span className="drawer-evidenced-body">
        <span className="drawer-evidenced-value">
          {format ? format(field.value) : String(field.value)}
        </span>
        <EvidenceChip evidenceClass={field.evidenceClass} isEstimated={field.isEstimated} />
      </span>
    ) : (
      <span className="drawer-evidenced-body">
        <UnknownValue what={label} />
      </span>
    )}
  </div>
);
