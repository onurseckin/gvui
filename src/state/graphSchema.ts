import {
  EDGE_KINDS,
  EVIDENCE_CLASSES,
  NODE_ROLES,
  type EvidenceClass,
  type Evidenced,
  type GraphDataset,
  type NodeRole,
} from "../types/graphData";

export { EDGE_KINDS, EVIDENCE_CLASSES, NODE_ROLES };
export type { EvidenceClass, Evidenced, NodeRole };

/**
 * The one place that understands the orchestration graph contract.
 *
 * Every fact has exactly one home and this reads that home only: a second spelling of the same
 * value is what lets two readers drift apart. Where a record carries no provenance of its own the
 * value is labelled `evidence_class: "unknown"` — never upgraded to a stronger class to make a
 * breakdown look better, and never invented when the record is missing entirely.
 */

/** Rendered wherever a value is genuinely absent, so "we do not know" never looks like a zero. */
export const UNKNOWN_LABEL = "unknown";

const EVIDENCE_LABELS: Readonly<Record<EvidenceClass, string>> = {
  harness_observed: "measured",
  agent_reported: "agent-reported",
  host_reported: "host-reported",
  derived: "derived",
  unknown: "unverified",
};

/** Weakest-wins ordering: an aggregate is only as trustworthy as its least trustworthy input. */
const EVIDENCE_RANK: Readonly<Record<EvidenceClass, number>> = {
  harness_observed: 0,
  host_reported: 1,
  agent_reported: 2,
  derived: 3,
  unknown: 4,
};

export function evidenceLabel(evidence: EvidenceClass): string {
  return EVIDENCE_LABELS[evidence];
}

export function weakestEvidence(classes: readonly EvidenceClass[]): EvidenceClass | undefined {
  let weakest: EvidenceClass | undefined;
  for (const candidate of classes) {
    if (weakest === undefined || EVIDENCE_RANK[candidate] > EVIDENCE_RANK[weakest]) {
      weakest = candidate;
    }
  }
  return weakest;
}

export const ROLE_LABELS: Readonly<Record<NodeRole, string>> = {
  coordinator: "Coordinator",
  planner: "Planner",
  implementer: "Implementer",
  validator: "Validator",
  repairer: "Repairer",
  "completeness-critic": "Completeness Critic",
  "sub-implementer": "Sub-implementer",
  "sub-validator": "Sub-validator",
  "sub-investigator": "Sub-investigator",
  "plan-validator": "Plan Validator",
};

/** The coarse buckets the sidebar groups by, per the realigned vocabulary. */
export type RoleGroup =
  | "coordination"
  | "implementer"
  | "validator"
  | "repairer"
  | "critic"
  | "sub-agent";

export const ROLE_GROUPS: readonly RoleGroup[] = [
  "coordination",
  "implementer",
  "validator",
  "repairer",
  "critic",
  "sub-agent",
];

export const ROLE_GROUP_LABELS: Readonly<Record<RoleGroup, string>> = {
  coordination: "Coordination",
  implementer: "Implementers",
  validator: "Validators",
  repairer: "Repairers",
  critic: "Critics",
  "sub-agent": "Sub-agents",
};

const ROLE_GROUP_OF: Readonly<Record<NodeRole, RoleGroup>> = {
  coordinator: "coordination",
  planner: "coordination",
  implementer: "implementer",
  validator: "validator",
  repairer: "repairer",
  "completeness-critic": "critic",
  "sub-implementer": "sub-agent",
  "sub-validator": "sub-agent",
  "sub-investigator": "sub-agent",
  "plan-validator": "validator",
};

export function roleGroupOf(role: NodeRole): RoleGroup {
  return ROLE_GROUP_OF[role];
}

/** Node vocabularies the producer emits, alongside the edge and role ones re-exported above. */
export const NODE_KINDS: readonly string[] = [
  "orchestrator",
  "agent",
  "tool",
  "router",
  "join",
  "gate",
  "critic",
  "terminal",
  "input",
];

export const NODE_STATUSES: readonly string[] = [
  "pending",
  "running",
  "success",
  "error",
  "warning",
  "skipped",
  "cached",
];

const EVIDENCE_CLASS_SET = new Set<string>(EVIDENCE_CLASSES);
const NODE_ROLE_SET = new Set<string>(NODE_ROLES);
const EDGE_KIND_SET = new Set<string>(EDGE_KINDS);
const NODE_KIND_SET = new Set<string>(NODE_KINDS);
const NODE_STATUS_SET = new Set<string>(NODE_STATUSES);

/**
 * Role spellings this renderer accepts in `metadata.role`. Translating one is a rename, not an
 * inference: the graph really did record a role, it just spelled it differently.
 */
const ROLE_SPELLINGS: Readonly<Record<string, NodeRole>> = {
  orchestrator: "coordinator",
  coordinator: "coordinator",
  planner: "planner",
  worker: "implementer",
  implementer: "implementer",
  validator: "validator",
  repairer: "repairer",
  critic: "completeness-critic",
  "completeness-critic": "completeness-critic",
  "sub-implementer": "sub-implementer",
  "sub-validator": "sub-validator",
  "sub-investigator": "sub-investigator",
  "plan-validator": "plan-validator",
};

/** What a node's `kind` implies when no role was ever recorded. Always flagged as underived. */
const KIND_IMPLIED_ROLE: Readonly<Record<string, NodeRole>> = {
  orchestrator: "coordinator",
  agent: "implementer",
  gate: "validator",
  critic: "completeness-critic",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isEvidenceClass(value: unknown): value is EvidenceClass {
  return typeof value === "string" && EVIDENCE_CLASS_SET.has(value);
}

export function isNodeRole(value: unknown): value is NodeRole {
  return typeof value === "string" && NODE_ROLE_SET.has(value);
}

function readEvidencedText(value: unknown): Evidenced<string> | undefined {
  const record = asRecord(value);
  if (!record || !isEvidenceClass(record.evidence_class)) return undefined;
  const text = readText(record.value);
  if (text === undefined) return undefined;
  return {
    value: text,
    evidence_class: record.evidence_class,
    ...(record.is_estimated === true ? { is_estimated: true } : {}),
  };
}

function readEvidencedNumber(value: unknown): Evidenced<number> | undefined {
  const record = asRecord(value);
  if (!record || !isEvidenceClass(record.evidence_class)) return undefined;
  const numeric = readFiniteNumber(record.value);
  if (numeric === undefined) return undefined;
  return {
    value: numeric,
    evidence_class: record.evidence_class,
    ...(record.is_estimated === true ? { is_estimated: true } : {}),
  };
}

/** A scalar a record stated without provenance: real, but nothing says how it was obtained. */
function unverified<T>(value: T): Evidenced<T> {
  return { value, evidence_class: "unknown" };
}

export interface NodeTelemetryView {
  agentId?: string;
  role?: NodeRole;
  host?: string;
  model?: Evidenced<string>;
  modelTier?: Evidenced<string>;
  thinkingLevel?: Evidenced<string>;
  tokensIn?: Evidenced<number>;
  tokensOut?: Evidenced<number>;
  grantStatus?: string;
}

/**
 * Token counts recorded in `metrics`. The producer fills these from the command ledger while
 * `telemetry` carries what the host itself reported: two records of the same run, not two names
 * for one field. The count keeps whatever provenance the record stated and no better.
 */
function readMetricsTokens(
  node: Record<string, unknown>,
  direction: "in" | "out",
): Evidenced<number> | undefined {
  const metrics = asRecord(node.metrics);
  const detail = asRecord(metrics?.tokens);
  const flatKey = direction === "in" ? "tokensIn" : "tokensOut";
  const detailKeys =
    direction === "in" ? ["inputTokens", "promptTokens"] : ["outputTokens", "completionTokens"];

  let candidate = readFiniteNumber(metrics?.[flatKey]);
  if (candidate === undefined && detail) {
    for (const key of detailKeys) {
      candidate = readFiniteNumber(detail[key]);
      if (candidate !== undefined) break;
    }
  }
  if (candidate === undefined) return undefined;

  const recorded = detail?.evidenceClass;
  return {
    value: candidate,
    evidence_class: isEvidenceClass(recorded) ? recorded : "unknown",
    ...(detail?.isEstimated === true ? { is_estimated: true } : {}),
  };
}

/**
 * Everything the run knows about the agent behind a node. A field the host never reported has no
 * entry, so callers that render `undefined` as "unknown" stay truthful by construction.
 */
export function readNodeTelemetry(node: unknown): NodeTelemetryView {
  const record = asRecord(node);
  if (!record) return {};

  const telemetry = asRecord(record.telemetry);
  const view: NodeTelemetryView = {};

  const agentId = readText(telemetry?.agentId);
  if (agentId !== undefined) view.agentId = agentId;

  const role = telemetry?.role;
  if (isNodeRole(role)) view.role = role;

  const host = readText(telemetry?.host);
  if (host !== undefined) view.host = host;

  const grantStatus = readText(telemetry?.grantStatus);
  if (grantStatus !== undefined) view.grantStatus = grantStatus;

  // A record of its own rather than a second spelling of `telemetry`, so it answers only where
  // telemetry stayed silent, and what it answers carries no provenance.
  const hostAgent = asRecord(record.hostAgent);

  const hostModel = readText(hostAgent?.model);
  const model =
    readEvidencedText(telemetry?.model) ??
    (hostModel === undefined ? undefined : unverified(hostModel));
  if (model !== undefined) view.model = model;

  const hostTier = readText(hostAgent?.tier);
  const modelTier =
    readEvidencedText(telemetry?.modelTier) ??
    (hostTier === undefined ? undefined : unverified(hostTier.toLowerCase()));
  if (modelTier !== undefined) view.modelTier = modelTier;

  const thinkingLevel = readEvidencedText(telemetry?.thinkingLevel);
  if (thinkingLevel !== undefined) view.thinkingLevel = thinkingLevel;

  const tokensIn = readEvidencedNumber(telemetry?.tokensIn) ?? readMetricsTokens(record, "in");
  if (tokensIn !== undefined) view.tokensIn = tokensIn;

  const tokensOut = readEvidencedNumber(telemetry?.tokensOut) ?? readMetricsTokens(record, "out");
  if (tokensOut !== undefined) view.tokensOut = tokensOut;

  return view;
}

export interface NodeTokenDetail {
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

function firstNumber(
  sources: readonly (Record<string, unknown> | undefined)[],
  keys: readonly string[],
): number | undefined {
  for (const source of sources) {
    if (source === undefined) continue;
    for (const key of keys) {
      const value = readFiniteNumber(source[key]);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

/**
 * Reasoning and cache counts, which live outside `telemetry` because the grant ledger never carried
 * them. Absent stays absent: a node that reported no cache activity gets no entry, not a zero.
 */
export function readNodeTokenDetail(node: unknown): NodeTokenDetail {
  const record = asRecord(node);
  const metrics = asRecord(record?.metrics);
  const sources = [asRecord(metrics?.tokens), metrics];

  const detail: NodeTokenDetail = {};
  const reasoning = firstNumber(sources, ["reasoningTokens", "cognitiveTokens", "thinkingTokens"]);
  if (reasoning !== undefined) detail.reasoning = reasoning;
  const cacheRead = firstNumber(sources, ["cacheReadTokens", "cacheHitTokens"]);
  if (cacheRead !== undefined) detail.cacheRead = cacheRead;
  const cacheWrite = firstNumber(sources, ["cacheCreationTokens", "cacheWriteTokens"]);
  if (cacheWrite !== undefined) detail.cacheWrite = cacheWrite;
  const total = firstNumber(sources, ["totalTokens"]);
  if (total !== undefined) detail.total = total;

  return detail;
}

export interface ResolvedRole {
  role: NodeRole;
  /** False when the role was implied by the node kind rather than recorded by the run. */
  declared: boolean;
}

export function resolveNodeRole(node: unknown): ResolvedRole | undefined {
  const record = asRecord(node);
  if (!record) return undefined;

  const telemetryRole = asRecord(record.telemetry)?.role;
  if (isNodeRole(telemetryRole)) return { role: telemetryRole, declared: true };

  const metadataRole = readText(asRecord(record.metadata)?.role);
  const alias = metadataRole === undefined ? undefined : ROLE_SPELLINGS[metadataRole];
  if (alias !== undefined) return { role: alias, declared: true };

  const kind = readText(record.kind) ?? readText(record.type);
  const implied = kind === undefined ? undefined : KIND_IMPLIED_ROLE[kind];
  if (implied !== undefined) return { role: implied, declared: false };

  return undefined;
}

export interface SectionView {
  id: string;
  title: string;
  description?: string;
  reason?: string;
  parentNodeId?: string;
  status?: string;
  nodeIds: string[];
}

export function readSections(dataset: unknown): SectionView[] {
  const entries = asArray(asRecord(dataset)?.sections) ?? [];
  const sections: SectionView[] = [];

  for (const entry of entries) {
    const record = asRecord(entry);
    const id = readText(record?.id);
    if (record === undefined || id === undefined) continue;

    const nodeIds: string[] = [];
    for (const candidate of asArray(record.nodeIds) ?? []) {
      const nodeId = readText(candidate);
      if (nodeId !== undefined) nodeIds.push(nodeId);
    }

    const section: SectionView = { id, title: readText(record.title) ?? id, nodeIds };
    const description = readText(record.description);
    if (description !== undefined) section.description = description;
    const reason = readText(record.reason);
    if (reason !== undefined) section.reason = reason;
    const parentNodeId = readText(record.parentNodeId);
    if (parentNodeId !== undefined) section.parentNodeId = parentNodeId;
    const status = readText(record.status);
    if (status !== undefined) section.status = status;

    sections.push(section);
  }

  return sections;
}

export function readEdgeKind(edge: unknown): string | undefined {
  return readText(asRecord(edge)?.kind);
}

export interface NodeStateTransitionView {
  at?: string;
  actor?: string;
  from?: string;
  to?: string;
  reason?: string;
  attempt?: number;
  evidence_class: EvidenceClass;
  verdict?: string;
  round?: number;
  findingClass?: string;
  findingCount?: number;
}

export function readStateTransitions(node: unknown): NodeStateTransitionView[] {
  const entries = asArray(asRecord(node)?.stateTransitions) ?? [];
  const transitions: NodeStateTransitionView[] = [];

  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record) continue;

    const evidence = record.evidence_class;
    const transition: NodeStateTransitionView = {
      evidence_class: isEvidenceClass(evidence) ? evidence : "unknown",
    };

    const at = readText(record.at);
    if (at !== undefined) transition.at = at;
    const actor = readText(record.actor);
    if (actor !== undefined) transition.actor = actor;
    const from = readText(record.from);
    if (from !== undefined) transition.from = from;
    const to = readText(record.to);
    if (to !== undefined) transition.to = to;
    const reason = readText(record.reason);
    if (reason !== undefined) transition.reason = reason;
    const attempt = readFiniteNumber(record.attempt);
    if (attempt !== undefined) transition.attempt = attempt;
    const verdict = readText(record.verdict);
    if (verdict !== undefined) transition.verdict = verdict.toLowerCase();
    const round = readFiniteNumber(record.round);
    if (round !== undefined) transition.round = round;
    const findingClass = readText(record.findingClass);
    if (findingClass !== undefined) transition.findingClass = findingClass;
    const findingCount = readFiniteNumber(record.findingCount);
    if (findingCount !== undefined) transition.findingCount = findingCount;

    transitions.push(transition);
  }

  return transitions;
}

function readNodeFindings(node: unknown): Record<string, unknown>[] {
  const record = asRecord(node);
  const raw = asArray(record?.findings) ?? asArray(asRecord(record?.metadata)?.findings) ?? [];
  const findings: Record<string, unknown>[] = [];
  for (const entry of raw) {
    const finding = asRecord(entry);
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Probe activity and pushback activity counted apart. A probe demands proof and costs the
 * implementer nothing; a pushback asserts a defect. Folding them into one "rejections" number is
 * what made every probed task read as rejected.
 */
export interface ReviewActivitySummary {
  probeRounds: number;
  pushbackRounds: number;
  probeEdges: number;
  pushbackEdges: number;
  probeDemands: number;
  defects: number;
  nodesProbed: number;
  nodesPushedBack: number;
  /** False when the run recorded no review activity at all, which is not the same as zero rounds. */
  hasRecord: boolean;
}

const PUSHBACK_VERDICTS = new Set<string>(["reject", "rejected", "fail", "failed"]);

export function summarizeReviewActivity(dataset: unknown): ReviewActivitySummary {
  const record = asRecord(dataset);
  const nodes = asArray(record?.nodes) ?? [];
  const edges = asArray(record?.edges) ?? [];

  const summary: ReviewActivitySummary = {
    probeRounds: 0,
    pushbackRounds: 0,
    probeEdges: 0,
    pushbackEdges: 0,
    probeDemands: 0,
    defects: 0,
    nodesProbed: 0,
    nodesPushedBack: 0,
    hasRecord: false,
  };

  for (const node of nodes) {
    const transitions = readStateTransitions(node);
    let probed = 0;
    let pushedBack = 0;

    for (const transition of transitions) {
      if (transition.verdict === undefined) continue;
      summary.hasRecord = true;
      if (transition.verdict === "probe") probed += 1;
      else if (PUSHBACK_VERDICTS.has(transition.verdict)) pushedBack += 1;
    }

    for (const finding of readNodeFindings(node)) {
      const findingClass = readText(finding.class) ?? readText(finding.findingClass);
      if (findingClass === "probe_demand") {
        summary.probeDemands += 1;
        summary.hasRecord = true;
      } else if (findingClass === "defect") {
        summary.defects += 1;
        summary.hasRecord = true;
      }
    }

    summary.probeRounds += probed;
    summary.pushbackRounds += pushedBack;
    if (probed > 0) summary.nodesProbed += 1;
    if (pushedBack > 0) summary.nodesPushedBack += 1;
  }

  for (const edge of edges) {
    const kind = readEdgeKind(edge);
    if (kind === "probe") {
      summary.probeEdges += 1;
      summary.hasRecord = true;
    } else if (kind === "pushback") {
      summary.pushbackEdges += 1;
      summary.hasRecord = true;
    }
  }

  return summary;
}

export interface TokenAggregate {
  tokensIn: number;
  tokensOut: number;
  total: number;
  reportingNodes: number;
  totalNodes: number;
  evidence: EvidenceClass | undefined;
  hasEstimates: boolean;
}

/**
 * Sums only over the nodes that actually reported tokens. `reportingNodes === 0` is the signal that
 * the run has no token data — the caller must say so instead of showing a confident zero.
 */
export function aggregateTokens(dataset: unknown): TokenAggregate {
  const nodes = asArray(asRecord(dataset)?.nodes) ?? [];
  const classes: EvidenceClass[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let reportingNodes = 0;
  let hasEstimates = false;

  for (const node of nodes) {
    const telemetry = readNodeTelemetry(node);
    let reported = false;

    if (telemetry.tokensIn !== undefined) {
      tokensIn += telemetry.tokensIn.value;
      classes.push(telemetry.tokensIn.evidence_class);
      hasEstimates = hasEstimates || telemetry.tokensIn.is_estimated === true;
      reported = true;
    }
    if (telemetry.tokensOut !== undefined) {
      tokensOut += telemetry.tokensOut.value;
      classes.push(telemetry.tokensOut.evidence_class);
      hasEstimates = hasEstimates || telemetry.tokensOut.is_estimated === true;
      reported = true;
    }
    if (reported) reportingNodes += 1;
  }

  return {
    tokensIn,
    tokensOut,
    total: tokensIn + tokensOut,
    reportingNodes,
    totalNodes: nodes.length,
    evidence: weakestEvidence(classes),
    hasEstimates,
  };
}

export interface RecordedTotal {
  total: number;
  reportingNodes: number;
}

function aggregateNodeNumber(dataset: unknown, read: (node: unknown) => number | undefined) {
  const nodes = asArray(asRecord(dataset)?.nodes) ?? [];
  let total = 0;
  let reportingNodes = 0;
  for (const node of nodes) {
    const value = read(node);
    if (value === undefined) continue;
    total += value;
    reportingNodes += 1;
  }
  return reportingNodes === 0 ? undefined : { total, reportingNodes };
}

/**
 * Recorded dollars only. There is no pricing table anywhere in this codebase: a run that never
 * recorded a cost has no cost, and the sidebar says so.
 */
export function aggregateRecordedCost(dataset: unknown): RecordedTotal | undefined {
  return aggregateNodeNumber(dataset, (node) => {
    const record = asRecord(node);
    const metrics = asRecord(record?.metrics);
    const metadata = asRecord(record?.metadata);
    return readFiniteNumber(metrics?.costUsd) ?? readFiniteNumber(metadata?.costUsd);
  });
}

export function aggregateRecordedDuration(dataset: unknown): RecordedTotal | undefined {
  return aggregateNodeNumber(dataset, (node) => {
    const record = asRecord(node);
    const metrics = asRecord(record?.metrics);
    const metadata = asRecord(record?.metadata);
    return (
      readFiniteNumber(metrics?.durationMs) ??
      readFiniteNumber(metadata?.durationMs) ??
      readFiniteNumber(asRecord(metadata?.timing)?.wallDurationMs) ??
      readFiniteNumber(asRecord(metadata?.timingBreakdown)?.wallDurationMs)
    );
  });
}

export interface JsonGraphDataset extends Record<string, unknown> {
  id: string;
  title: string;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
}

export interface DatasetValidation {
  errors: string[];
  warnings: string[];
  dataset?: JsonGraphDataset;
}

export interface ValidateDatasetOptions {
  /**
   * What to call a graph that does not name itself. It is a handle the caller already holds — the
   * capsule directory, the file the document came from — never a guess at what the graph contains.
   */
  sourceId?: string;
}

function listOf(values: readonly string[]): string {
  return values.join(", ");
}

/** Quotes strings and names everything else by type, so a warning shows what actually arrived. */
function describeValue(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  if (Array.isArray(value)) return "an array";
  if (isRecord(value)) return "an object";
  return `a ${typeof value}`;
}

/**
 * The runtime shapes a known field may arrive in; anything else the renderer cannot walk.
 *
 * `objectArray` is an array whose every entry the renderer reaches into by name. It is still an
 * array at the top, so it shares `array`'s wording — the distinction only decides whether the
 * entries are checked too.
 */
type FieldShape = "text" | "number" | "object" | "array" | "objectArray";

const SHAPE_LABELS: Readonly<Record<FieldShape, string>> = {
  text: "a string",
  number: "a finite number",
  object: "an object",
  array: "an array",
  objectArray: "an array",
};

function hasShape(value: unknown, shape: FieldShape): boolean {
  switch (shape) {
    case "text":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return isRecord(value);
    case "array":
    case "objectArray":
      return Array.isArray(value);
  }
}

/**
 * The fields the renderer walks structurally rather than through a tolerant accessor. A value here
 * of the wrong runtime shape is dropped so the rest of the entry still draws; a field absent from
 * this table is none of the renderer's business and travels through untouched.
 */
const NODE_FIELD_SHAPES: Readonly<Record<string, FieldShape>> = {
  description: "text",
  type: "text",
  kind: "text",
  status: "text",
  stepLabel: "text",
  sectionId: "text",
  prompt: "text",
  output: "text",
  logs: "text",
  group: "text",
  step: "number",
  rank: "number",
  badge: "object",
  telemetry: "object",
  metrics: "object",
  metadata: "object",
  context: "object",
  io: "object",
  provenance: "object",
  badges: "objectArray",
  tools: "objectArray",
  scripts: "objectArray",
  stateTransitions: "objectArray",
  assets: "objectArray",
  browserTests: "objectArray",
  files: "objectArray",
  timeline: "objectArray",
  events: "objectArray",
};

const EDGE_FIELD_SHAPES: Readonly<Record<string, FieldShape>> = {
  label: "text",
  description: "text",
  kind: "text",
  condition: "text",
  accent: "text",
  layoutRole: "text",
  weight: "number",
  minLen: "number",
  tokens: "number",
  trafficVolume: "number",
  badge: "object",
  container: "object",
  handoff: "object",
  traffic: "object",
  exchanges: "objectArray",
};

const SECTION_FIELD_SHAPES: Readonly<Record<string, FieldShape>> = {
  id: "text",
  title: "text",
  description: "text",
  reason: "text",
  parentNodeId: "text",
  status: "text",
  nodeIds: "array",
};

/**
 * Drops the keys whose value the renderer could not walk, leaving the entry otherwise intact and
 * returning the entry unchanged when there was nothing to drop.
 *
 * A list the renderer reaches into by name is pruned entry by entry rather than discarded whole: a
 * single `null` among ten recorded tools would otherwise take the other nine down with it, and the
 * render sites read those entries directly, so one unwalkable member blanks the canvas.
 */
function dropMisshapenFields(
  entry: Record<string, unknown>,
  shapes: Readonly<Record<string, FieldShape>>,
  label: string,
  warnings: string[],
): Record<string, unknown> {
  let kept = entry;
  for (const [field, shape] of Object.entries(shapes)) {
    const value = entry[field];
    if (value === undefined) continue;

    if (!hasShape(value, shape)) {
      warnings.push(
        `${label}.${field}: ignored, expected ${SHAPE_LABELS[shape]}, received ${describeValue(value)}`,
      );
      if (kept === entry) kept = { ...entry };
      delete kept[field];
      continue;
    }

    if (shape !== "objectArray") continue;
    const members = value as unknown[];
    const walkable = members.filter(isRecord);
    if (walkable.length === members.length) continue;

    warnings.push(
      `${label}.${field}: ${members.length - walkable.length} of ${members.length} ignored, ` +
        `each entry must be an object`,
    );
    if (kept === entry) kept = { ...entry };
    kept[field] = walkable;
  }
  return kept;
}

function readNodeEntry(
  entry: unknown,
  index: number,
  taken: Set<string>,
  warnings: string[],
): Record<string, unknown> | undefined {
  const label = `dataset.nodes[${index}]`;

  const node = asRecord(entry);
  if (node === undefined) {
    warnings.push(`${label}: ignored, expected an object, received ${describeValue(entry)}`);
    return undefined;
  }

  // Edges and regions address a node by its id, so a node without one cannot be pointed at by
  // anything. It is dropped rather than given a made-up identity the document never issued.
  const id = readText(node.id);
  if (id === undefined) {
    warnings.push(
      `${label}: ignored, a node needs a non-empty string id, received ${describeValue(node.id)}`,
    );
    return undefined;
  }
  if (taken.has(id)) {
    warnings.push(`${label}: ignored, node id "${id}" already belongs to an earlier node`);
    return undefined;
  }
  taken.add(id);

  const named = `${label} (${id})`;
  let kept = dropMisshapenFields(node, NODE_FIELD_SHAPES, named, warnings);

  if (readText(kept.name) === undefined) {
    // The id is the only name this node was given, so the card shows that rather than a blank or a
    // label borrowed from a neighbour.
    warnings.push(
      kept.name === undefined
        ? `${named}.name: absent, showing the node id instead`
        : `${named}.name: ignored, expected a non-empty string, received ` +
            `${describeValue(kept.name)}; showing the node id instead`,
    );
    kept = { ...kept, name: id };
  }

  const kind = readText(kept.kind);
  if (kind !== undefined && !NODE_KIND_SET.has(kind)) {
    warnings.push(`${named}.kind: "${kind}" is not a known node kind (${listOf(NODE_KINDS)})`);
  }
  const status = readText(kept.status);
  if (status !== undefined && !NODE_STATUS_SET.has(status)) {
    warnings.push(
      `${named}.status: "${status}" is not a known node status (${listOf(NODE_STATUSES)})`,
    );
  }

  return kept;
}

function readEdgeEnd(
  edge: Record<string, unknown>,
  end: "source" | "target",
  nodeIds: ReadonlySet<string>,
  label: string,
  warnings: string[],
): string | undefined {
  const ref = readText(edge[end]);
  if (ref === undefined) {
    warnings.push(
      `${label}: ignored, ${end} must be a non-empty node id, received ${describeValue(edge[end])}`,
    );
    return undefined;
  }
  if (!nodeIds.has(ref)) {
    warnings.push(`${label}: ignored, ${end} "${ref}" matches no node in dataset.nodes`);
    return undefined;
  }
  return ref;
}

/** A positional handle for an edge the document did not address, unique within the document. */
function unusedEdgeId(index: number, taken: ReadonlySet<string>): string {
  let candidate = `edge-${index}`;
  for (let suffix = 2; taken.has(candidate); suffix++) candidate = `edge-${index}-${suffix}`;
  return candidate;
}

function readEdgeEntry(
  entry: unknown,
  index: number,
  nodeIds: ReadonlySet<string>,
  taken: Set<string>,
  warnings: string[],
): Record<string, unknown> | undefined {
  const label = `dataset.edges[${index}]`;

  const edge = asRecord(entry);
  if (edge === undefined) {
    warnings.push(`${label}: ignored, expected an object, received ${describeValue(entry)}`);
    return undefined;
  }

  // An edge to nowhere has no two points to draw between, so it is the one thing here that cannot
  // be salvaged. Both ends are reported, so a doubly-broken edge is fixed in one pass.
  const source = readEdgeEnd(edge, "source", nodeIds, label, warnings);
  const target = readEdgeEnd(edge, "target", nodeIds, label, warnings);
  if (source === undefined || target === undefined) return undefined;

  const declaredId = readText(edge.id);
  const id =
    declaredId !== undefined && !taken.has(declaredId) ? declaredId : unusedEdgeId(index, taken);
  if (id !== declaredId) {
    warnings.push(
      declaredId === undefined
        ? `${label}.id: ignored, expected a non-empty string, received ${describeValue(edge.id)}; ` +
            `addressing this edge as "${id}"`
        : `${label}.id: "${declaredId}" already belongs to an earlier edge, addressing this one ` +
            `as "${id}"`,
    );
  }
  taken.add(id);

  const named = `${label} (${id})`;
  const kept = dropMisshapenFields(edge, EDGE_FIELD_SHAPES, named, warnings);
  const addressed = kept.id === id ? kept : { ...kept, id };

  const kind = readText(addressed.kind);
  if (kind !== undefined && !EDGE_KIND_SET.has(kind)) {
    warnings.push(`${named}.kind: "${kind}" is not a known edge kind (${listOf(EDGE_KINDS)})`);
  }

  return addressed;
}

/**
 * Region membership with the entries the graph cannot resolve removed. Returns the value untouched
 * when nothing needed removing, and `undefined` when `sections` is not something to iterate at all.
 */
function reviewSections(
  value: unknown,
  nodeIds: ReadonlySet<string>,
  warnings: string[],
): unknown[] | undefined {
  if (value === undefined) return undefined;

  const entries = asArray(value);
  if (entries === undefined) {
    warnings.push(`dataset.sections: ignored, expected an array, received ${describeValue(value)}`);
    return undefined;
  }

  const kept: unknown[] = [];
  let changed = false;

  for (const [index, entry] of entries.entries()) {
    const label = `dataset.sections[${index}]`;
    const section = asRecord(entry);
    if (section === undefined) {
      warnings.push(`${label}: ignored, expected an object, received ${describeValue(entry)}`);
      changed = true;
      continue;
    }

    const named = `${label} (${readText(section.id) ?? "no id"})`;
    const reviewed = dropMisshapenFields(section, SECTION_FIELD_SHAPES, named, warnings);
    if (reviewed !== section) changed = true;

    const memberIds = asArray(reviewed.nodeIds);
    if (memberIds === undefined) {
      kept.push(reviewed);
      continue;
    }

    const resolved = memberIds.filter((candidate) => {
      const memberId = readText(candidate);
      return memberId !== undefined && nodeIds.has(memberId);
    });
    if (resolved.length === memberIds.length) {
      kept.push(reviewed);
      continue;
    }

    warnings.push(
      `${named}.nodeIds: ${memberIds.length - resolved.length} of ${memberIds.length} ignored, ` +
        `matching no node in dataset.nodes`,
    );
    kept.push({ ...reviewed, nodeIds: resolved });
    changed = true;
  }

  return changed ? kept : entries;
}

/**
 * Reads a graph document as tolerantly as it can be read: everything understood is kept and
 * everything else is reported and left out, exactly as if it had never been written.
 *
 * Two things alone make a document unrenderable — it is not a JSON object, or it carries no `nodes`
 * and `edges` arrays to draw. Above that line nothing fails: a field of a shape the renderer cannot
 * walk is dropped without taking its entry with it, an entry nothing can address is skipped, and an
 * unrecognised vocabulary member is drawn as itself. Being strict here would mean a producer could
 * not add a field until every reader had been taught it.
 */
export function validateGraphDataset(
  value: unknown,
  options: ValidateDatasetOptions = {},
): DatasetValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const root = asRecord(value);
  if (root === undefined) {
    return {
      errors: [
        `dataset: expected a JSON object with nodes and edges arrays, received ${describeValue(value)}`,
      ],
      warnings,
    };
  }

  const rawNodes = asArray(root.nodes);
  if (rawNodes === undefined) {
    errors.push(
      `dataset.nodes: required, must be an array of node objects, received ${describeValue(root.nodes)}`,
    );
  }
  const rawEdges = asArray(root.edges);
  if (rawEdges === undefined) {
    errors.push(
      `dataset.edges: required, must be an array of edge objects, received ${describeValue(root.edges)}`,
    );
  }
  if (rawNodes === undefined || rawEdges === undefined) return { errors, warnings };

  const nodeIds = new Set<string>();
  const nodes: Record<string, unknown>[] = [];
  for (const [index, entry] of rawNodes.entries()) {
    const node = readNodeEntry(entry, index, nodeIds, warnings);
    if (node !== undefined) nodes.push(node);
  }

  const edgeIds = new Set<string>();
  const edges: Record<string, unknown>[] = [];
  for (const [index, entry] of rawEdges.entries()) {
    const edge = readEdgeEntry(entry, index, nodeIds, edgeIds, warnings);
    if (edge !== undefined) edges.push(edge);
  }

  const declaredId = readText(root.id);
  if (declaredId === undefined && root.id !== undefined) {
    warnings.push(
      `dataset.id: ignored, expected a non-empty string, received ${describeValue(root.id)}`,
    );
  }
  const id = declaredId ?? options.sourceId ?? "";
  if (declaredId === undefined) {
    warnings.push(
      id.length > 0
        ? `dataset.id: absent, naming the graph "${id}" after the source it was read from`
        : "dataset.id: absent, and the caller named no source, so the graph is left unnamed",
    );
  }

  const declaredTitle = readText(root.title);
  if (declaredTitle === undefined && root.title !== undefined) {
    warnings.push(
      `dataset.title: ignored, expected a non-empty string, received ${describeValue(root.title)}`,
    );
  }
  if (declaredTitle === undefined)
    warnings.push("dataset.title: absent, falling back to dataset.id");

  const dataset: JsonGraphDataset = { ...root, id, title: declaredTitle ?? id, nodes, edges };
  const sections = reviewSections(root.sections, nodeIds, warnings);
  if (sections === undefined) delete dataset.sections;
  else dataset.sections = sections;

  return { errors, warnings, dataset };
}

function normalizeNode(node: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...node };

  const telemetry = readNodeTelemetry(node);
  const role = resolveNodeRole(node);
  const merged: Record<string, unknown> = { ...(asRecord(node.telemetry) ?? {}) };

  if (telemetry.model !== undefined) merged.model = telemetry.model;
  if (telemetry.modelTier !== undefined) merged.modelTier = telemetry.modelTier;
  if (telemetry.thinkingLevel !== undefined) merged.thinkingLevel = telemetry.thinkingLevel;
  if (telemetry.tokensIn !== undefined) merged.tokensIn = telemetry.tokensIn;
  if (telemetry.tokensOut !== undefined) merged.tokensOut = telemetry.tokensOut;
  // Only a recorded role is written back; a role implied by the node kind stays out of the data.
  if (role?.declared === true) merged.role = role.role;

  if (Object.keys(merged).length > 0) normalized.telemetry = merged;

  return normalized;
}

/**
 * Lifts what a node recorded outside `telemetry` into it once, at import time, so no render site
 * repeats the work. Additive and idempotent: it adds no value the node did not already carry, and
 * never weakens a provenance the node stated for itself.
 */
export function normalizeGraphDataset(dataset: JsonGraphDataset): JsonGraphDataset {
  return { ...dataset, nodes: dataset.nodes.map(normalizeNode) };
}

/**
 * The single bridge between the validated JSON record and the render-time interface. Validation has
 * already proved id, nodes and edges are present and internally consistent, which is everything the
 * renderer requires; every optional field is read through the tolerant accessors above.
 */
export function toGraphDataset(dataset: JsonGraphDataset): GraphDataset {
  return dataset as unknown as GraphDataset;
}
