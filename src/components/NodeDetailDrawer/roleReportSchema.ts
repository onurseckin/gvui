import type { GraphNodeData } from "../../types/graphData";
import { isRecord, readNumber, readRole, readText } from "./nodeSchema";

/**
 * The five standing checklist domains `orchestrating-long-tasks` ships validator role contracts
 * for (`roles/validator-<domain>.md`). A domain outside this list still renders under its own name
 * rather than being dropped — the same openness the rest of this renderer's vocabulary follows.
 */
export type KnownValidatorDomain =
  | "code-quality"
  | "product"
  | "security"
  | "system-design"
  | "ui-design";

export interface ValidatorDomainProfile {
  title: string;
  tagline: string;
}

const KNOWN_VALIDATOR_DOMAIN_PROFILES: Readonly<
  Record<KnownValidatorDomain, ValidatorDomainProfile>
> = Object.freeze({
  "code-quality": {
    title: "Code Quality",
    tagline:
      "The standing bar for structure, duplication, dead code, error handling, types, tests and commit hygiene — checked in the touched area whether or not the task asked for it.",
  },
  product: {
    title: "Product Value",
    tagline:
      "Flow coherence and the empty, loading, error and partial states a real user hits, walked end to end from the entry point rather than confirmed by reading the code.",
  },
  security: {
    title: "Security",
    tagline:
      "Authorization, authentication, secrets and injection paths, probed with the negative case — a wrong identity, a replayed token, a traversal payload — rather than trusted from stated intent.",
  },
  "system-design": {
    title: "System Design",
    tagline:
      "Boundaries, data ownership, failure modes and migration safety, traced through every consumer of a changed contract rather than the caller the task named.",
  },
  "ui-design": {
    title: "UI Design",
    tagline:
      "Layout, contrast, motion and accessibility, settled by opening the rendered artifact in both themes rather than inferred from the source.",
  },
});

function titleCaseDomain(domain: string): string {
  return domain
    .split(/[-_]+/)
    .filter((word) => word.length > 0)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * A domain's presentational profile. An unrecognized domain still gets a readable title instead of
 * being silently generic-labelled — this renderer has not shipped a preset description for it, and
 * says so, rather than pretending it is one of the five it knows.
 */
export function describeValidatorDomain(
  domain: string | undefined,
): ValidatorDomainProfile | undefined {
  if (!domain) return undefined;
  const known = KNOWN_VALIDATOR_DOMAIN_PROFILES[domain as KnownValidatorDomain];
  if (known) return known;
  return {
    title: titleCaseDomain(domain) || domain,
    tagline: "A standing checklist domain this renderer has not shipped a preset description for.",
  };
}

/**
 * The domain a validator node checked, read two ways: a domain-qualified role (`validator-security`)
 * names it directly; the generic `validator` role carries it as a separate metadata field, matching
 * the producer's own data model where role and domain are orthogonal (`roles/validator-security.md`'s
 * frontmatter states them as two YAML keys, never one fused role string). Returns undefined for every
 * other role rather than reading a `domain`-named field that happens to sit on an unrelated node.
 */
export function readValidatorDomain(node: GraphNodeData): string | undefined {
  const role = readRole(node);
  if (!role) return undefined;
  if (role.startsWith("validator-")) {
    const suffix = role.slice("validator-".length).trim();
    return suffix.length > 0 ? suffix : undefined;
  }
  if (role !== "validator") return undefined;
  const metadata = node.metadata;
  if (!metadata) return undefined;
  return (
    readText(metadata, "validatorDomain") ??
    readText(metadata, "validator_domain") ??
    readText(metadata, "domain")
  );
}

/** One of the plan-validator's four mandatory questions, answered or explicitly not yet answered. */
export interface PlanValidatorAnswer {
  label: string;
  text?: string;
}

/**
 * A plan-level finding as `graph-generator-plan-validator-nodes.ts` emits it — a distinct, narrower
 * shape than a task finding: no requirement id, no evidence array, no revalidation method, because
 * there is no code yet for a plan review to cite. Rendering it through the task-finding card would
 * either drop these fields silently or show them as falsely absent task-finding fields.
 */
export interface PlanFindingRow {
  id: string;
  invariant?: string;
  severity?: string;
  observation?: string;
  remediation?: string;
}

export interface PlanValidatorReview {
  graphRevision?: number;
  verdict?: string;
  answers: PlanValidatorAnswer[];
  findings: PlanFindingRow[];
}

function planFindingRow(value: unknown): PlanFindingRow | undefined {
  if (!isRecord(value)) return undefined;
  const id = readText(value, "id");
  if (!id) return undefined;
  return {
    id,
    invariant: readText(value, "invariant"),
    severity: readText(value, "severity"),
    observation: readText(value, "observation"),
    remediation: readText(value, "remediation"),
  };
}

function planFindingRows(value: unknown): PlanFindingRow[] {
  if (!Array.isArray(value)) return [];
  const rows: PlanFindingRow[] = [];
  for (const entry of value) {
    const row = planFindingRow(entry);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * The plan-validator's own report: the four mandatory decomposition/dependency/gate/straggler
 * answers, plus the plan-shaped findings that stand apart from a task-level review. Undefined for
 * every other role, and undefined for a plan-validator round still awaiting its review — a round
 * that has not answered yet is not a round with an empty pass.
 */
export function readPlanValidatorReview(node: GraphNodeData): PlanValidatorReview | undefined {
  if (readRole(node) !== "plan-validator") return undefined;
  const metadata = node.metadata;
  if (!metadata) return undefined;
  const answers: PlanValidatorAnswer[] = [
    { label: "Decomposition", text: readText(metadata, "decompositionAnswer") },
    { label: "Dependencies", text: readText(metadata, "dependencyAnswer") },
    { label: "Gate discrimination", text: readText(metadata, "gateAnswer") },
    { label: "Straggler risk", text: readText(metadata, "stragglerAnswer") },
  ];
  const verdict = readText(metadata, "verdict");
  const findings = planFindingRows(metadata.planFindings);
  // A round the coordinator has not yet received back from the validator carries none of these —
  // rendering the section would show four false "not answered" blanks for a round still in flight.
  if (
    verdict === undefined &&
    findings.length === 0 &&
    answers.every((a) => a.text === undefined)
  ) {
    return undefined;
  }
  return { graphRevision: readNumber(metadata, "graphRevision"), verdict, answers, findings };
}
