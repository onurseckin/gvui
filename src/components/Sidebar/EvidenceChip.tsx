import type { FC } from "react";
import React from "react";
import { evidenceLabel, type EvidenceClass } from "../../state/graphSchema";

export interface EvidenceChipProps {
  evidence: EvidenceClass;
  isEstimated?: boolean;
}

const EVIDENCE_TITLES: Readonly<Record<EvidenceClass, string>> = {
  harness_observed: "Measured by the harness itself",
  host_reported: "Reported by the host runtime",
  agent_reported: "Reported by the agent through the CLI",
  derived: "Computed from other recorded values",
  unknown: "Recorded without provenance — treat as unverified",
};

/**
 * A measured number and a guessed one must not look the same, so every aggregate that carries an
 * evidence class wears it. An estimate says so on top of its class.
 */
export const EvidenceChip: FC<EvidenceChipProps> = React.memo(function EvidenceChip({
  evidence,
  isEstimated = false,
}) {
  const label = isEstimated ? `${evidenceLabel(evidence)} · estimated` : evidenceLabel(evidence);
  return (
    <span
      className={`evidence-chip evidence-${evidence.replace(/_/g, "-")} ${isEstimated ? "is-estimated" : ""}`}
      title={
        isEstimated
          ? `${EVIDENCE_TITLES[evidence]} — an estimate, not a measurement`
          : EVIDENCE_TITLES[evidence]
      }
      data-testid={`evidence-chip-${evidence}`}
    >
      {label}
    </span>
  );
});

EvidenceChip.displayName = "EvidenceChip";
