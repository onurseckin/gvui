import type { EdgeLayoutHint, Point, PortRef, Rect } from "../engine/layout/custom/types";

/**
 * The honesty label every producer-reported value carries. `unknown` is a real answer and must be
 * rendered as "unknown" — never as a plausible-looking default.
 */
export type EvidenceClass =
  | "harness_observed"
  | "agent_reported"
  | "host_reported"
  | "derived"
  | "unknown";

export const EVIDENCE_CLASSES: readonly EvidenceClass[] = [
  "harness_observed",
  "agent_reported",
  "host_reported",
  "derived",
  "unknown",
];

/** A value plus the provenance of that value. Estimates are `derived` AND `is_estimated`. */
export interface Evidenced<T> {
  value: T;
  evidence_class: EvidenceClass;
  is_estimated?: boolean;
}

/**
 * Datasets written before the evidence spine carry values with no label at all. Absent provenance
 * is `unknown`, which the UI must show as such rather than silently promoting to a measurement.
 */
export function resolveEvidenceClass(evidenceClass?: EvidenceClass): EvidenceClass {
  return evidenceClass ?? "unknown";
}

/**
 * The tool categories this renderer ships a preset vocabulary for. A category says WHAT KIND of
 * thing a tool is; the tool's own name is a value recorded beside it, so no product is ever a
 * concept in this schema.
 */
export type KnownToolCategory =
  | "browser-automation"
  | "build"
  | "database"
  | "documentation"
  | "file-edit"
  | "formatter"
  | "http-client"
  | "linter"
  | "package-manager"
  | "search"
  | "shell"
  | "test-runner"
  | "type-checker"
  | "version-control";

/** The preset category vocabulary. A dataset may file its tools under anything it likes. */
export const TOOL_CATEGORIES: readonly KnownToolCategory[] = [
  "browser-automation",
  "build",
  "database",
  "documentation",
  "file-edit",
  "formatter",
  "http-client",
  "linter",
  "package-manager",
  "search",
  "shell",
  "test-runner",
  "type-checker",
  "version-control",
];

/**
 * What kind of tool something is. Open on the same terms as node kinds and edge kinds: a category
 * this renderer has never seen still reads as itself instead of being dropped or renamed.
 */
export type ToolCategory = KnownToolCategory | (string & {});

/** The roles this renderer ships a preset treatment for. */
export type KnownNodeRole =
  | "coordinator"
  | "planner"
  | "implementer"
  | "validator"
  | "repairer"
  | "completeness-critic"
  | "sub-implementer"
  | "sub-validator"
  | "sub-investigator";

/** The preset role vocabulary. A dataset from somewhere else may extend it or ignore it entirely. */
export const NODE_ROLES: readonly NodeRole[] = [
  "coordinator",
  "planner",
  "implementer",
  "validator",
  "repairer",
  "completeness-critic",
  "sub-implementer",
  "sub-validator",
  "sub-investigator",
];

/**
 * The role a node's agent held. Open on purpose: a graph this renderer has never seen may name any
 * role it likes, and that role must render as itself rather than as the nearest familiar one.
 */
export type NodeRole = KnownNodeRole | (string & {});

export interface NodeBadge {
  label: string;
  variant?: "success" | "info" | "amber" | "error" | "gray";
}

export interface BadgeDetail {
  text: string;
  variant?: "info" | "warning" | "error" | "success" | "neutral";
  icon?: string;
  clickable?: boolean;
  targetTab?: "overview" | "io" | "files" | "commands" | "feedback" | string;
}

/**
 * One tool the node's agent was granted or reported using. Never inferred from a command's argv,
 * so an entry here means someone actually reported the tool.
 */
export interface NodeTool {
  name: string;
  /** The generic kind of tool. Never read out of the name; absent when nobody declared it. */
  category?: ToolCategory;
  type?: "generic" | "custom";
  firstReportedAt?: string;
  /** What only this tool reports, under the names its reporter used. */
  extras?: Record<string, unknown>;
  evidence_class?: EvidenceClass;
}

export interface NodeContext {
  repoPath?: string;
  previousOutputs?: Array<{ fromNode: string; summary: string }>;
  [key: string]: unknown;
}

/** The node kinds this renderer ships a preset silhouette for. */
export type KnownNodeKind =
  | "orchestrator"
  | "agent"
  | "tool"
  | "router"
  | "join"
  | "gate"
  | "terminal"
  | "input"
  | "critic";

/** The preset kind vocabulary. A foreign dataset may use none of it. */
export const KNOWN_NODE_KINDS: readonly KnownNodeKind[] = [
  "orchestrator",
  "agent",
  "tool",
  "router",
  "join",
  "gate",
  "terminal",
  "input",
  "critic",
];

/**
 * What a node is. Open on purpose: an unfamiliar kind is a normal case, and the renderer owes it a
 * stable accent and a readable label instead of quietly drawing it as an agent.
 */
export type NodeKind = KnownNodeKind | (string & {});
/** The lifecycle states this renderer ships a preset colour for. */
export type KnownNodeStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "warning"
  | "skipped"
  | "cached";

/** The preset status vocabulary. */
export const KNOWN_NODE_STATUSES: readonly KnownNodeStatus[] = [
  "pending",
  "running",
  "success",
  "error",
  "warning",
  "skipped",
  "cached",
];

/**
 * Where a node stands. Open on the same terms as kind and role: a lifecycle this renderer does not
 * know is still the truth about that node and must read as itself.
 */
export type NodeStatus = KnownNodeStatus | (string & {});
export type ModelTier = "xs" | "s" | "m" | "l";
export type FileMode = "read" | "write" | "create" | "delete" | "attach";
/**
 * The relationship vocabulary this renderer ships a preset treatment for. `probe` and `pushback`
 * are deliberately separate: a probe demands proof and costs the implementer nothing, a pushback
 * asserts a defect. They must never render alike.
 */
export type KnownEdgeKind =
  | "backtrack"
  | "branch"
  | "collect"
  | "conditional"
  | "critic"
  | "data"
  | "dependency"
  | "dispatch"
  | "fallback"
  | "gate"
  | "handoff"
  | "join"
  | "loop"
  | "probe"
  | "pushback"
  | "sequence"
  | "signoff"
  | "spawn"
  | "validation";

/** The preset edge vocabulary. A graph that speaks a different one is still a valid graph. */
export const EDGE_KINDS: readonly EdgeKind[] = [
  "backtrack",
  "branch",
  "collect",
  "conditional",
  "critic",
  "data",
  "dependency",
  "dispatch",
  "fallback",
  "gate",
  "handoff",
  "join",
  "loop",
  "probe",
  "pushback",
  "sequence",
  "signoff",
  "spawn",
  "validation",
];

/**
 * What an edge means. Open on purpose: an unfamiliar relationship must keep its own identity on the
 * canvas rather than collapsing into `sequence`.
 */
export type EdgeKind = KnownEdgeKind | (string & {});

export type EdgeVariant = "info" | "warning" | "error" | "success" | "neutral" | "cyan";

export type ExchangeType =
  | "branch"
  | "collect"
  | "dependency"
  | "dispatch"
  | "handoff"
  | "probe"
  | "prompt"
  | "pushback"
  | "signoff"
  | "submission"
  | "verdict";

export type PayloadKind = "full-context" | "summary" | "artifact" | "decision" | "file" | "prompt";

export interface FileRef {
  path: string;
  mode?: FileMode;
  lines?: string;
  diff?: string;
  additions?: number;
  deletions?: number;
}

export interface IoPort {
  node?: string;
  kind: PayloadKind;
  label: string;
  tokens?: number;
  preview?: string;
  dataRef?: string;
}

export interface TokenUsageDetail {
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens?: number;
  [key: string]: unknown;
}

export interface TimingBreakdown {
  wallDurationMs?: number;
  toolDurationMs?: number;
  activeCommandDurationMs?: number;
  thinkDurationMs?: number;
  cognitiveLatencyMs?: number;
  [key: string]: unknown;
}

export interface HostAgentDetail {
  tool?: string;
  name?: string;
  model?: string;
  tier?: ModelTier | string;
  reasoningEffort?: "high" | "medium" | "low" | "off" | string;
  thinkingLevel?: "high" | "medium" | "low" | "off" | string;
  [key: string]: unknown;
}

export interface NodeMetrics {
  tokensIn?: number;
  tokensOut?: number;
  tokens?: TokenUsageDetail;
  costUsd?: number;
  durationMs?: number;
  retries?: number;
  repairRounds?: number;
  timingBreakdown?: TimingBreakdown;
  timing?: TimingBreakdown;
  [key: string]: unknown;
}

export interface CommandExecutionDetail {
  id: string;
  argv: readonly string[];
  cwd: string;
  exitCode: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  stdoutSnippet?: string;
  stderrSnippet?: string;
  stdoutTail?: string;
  stderrTail?: string;
  logPath?: string;
}

export interface FindingDetail {
  id: string;
  requirementId?: string;
  severity: "critical" | "important" | "suggestion";
  observation: string;
  pushbackReason?: string;
  opposedChanges?: string;
  remediation?: string;
  rejectionRound?: number;
  round?: number;
  author?: string;
  validatorId?: string;
  timestamp?: string;
  status: "open" | "resolved";
  targetFiles?: string[];
  fileRefs?: FileRef[];
  revalidationProof?: { method: string; evidence: string[] };
  remediationProof?: { method?: string; evidence?: string[]; verifiedAt?: string };
  evidence?:
    | string[]
    | Array<{ kind?: string; reference?: string; observation?: string; url?: string }>;
  screenshots?: MediaAsset[];
  [key: string]: unknown;
}

export interface MediaAsset {
  id: string;
  type: "image" | "video" | "audio" | "document" | "code" | "log" | string;
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  timestamp?: string;
  step?: number | string;
  author?: string;
  mimeType?: string;
  sizeBytes?: number;
  dimensions?: { width: number; height: number };
  metadata?: Record<string, unknown>;
}

/**
 * One automated browser run recorded against a node: which file drove it, which browser executed
 * it, how it ended, and the artefacts it left behind that are not renderable evidence. Any runner
 * fills the same shape and names itself in `runner`, so this is not tied to one tool.
 *
 * Screenshots are absent by design — they are evidence and evidence lives in `GraphNodeData.assets`.
 */
export interface BrowserTestRun {
  /** The generic kind of tool this was, which the producer derived from how it read the report. */
  category?: ToolCategory;
  runner?: string;
  testFile?: string;
  browser?: string;
  status?: "passed" | "failed" | "timedOut" | "interrupted" | string;
  durationMs?: number;
  viewport?: { width: number; height: number };
  /** Runner trace bundles, by path or url. Opened in an external viewer, not rendered inline. */
  traces?: string[];
  /** Recorded session videos, by path or url. */
  videos?: string[];
  /** What this runner reported that no other runner in its category would, under its own names. */
  extras?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExchangeTransferredFile {
  path: string;
  mode?: FileMode;
  additions?: number;
  deletions?: number;
  diff?: string;
}

export interface ExchangeFinding {
  id?: string;
  requirementId?: string;
  /** "defect" asserts something is broken; "probe_demand" asks for proof. Never render them alike. */
  class?: "defect" | "probe_demand" | string;
  round?: number;
  severity?: "critical" | "important" | "suggestion" | string;
  observation?: string;
  remediation?: string;
  status?: "open" | "resolved" | string;
  revalidationProof?: { method?: string; evidence?: string[] };
}

export interface ExchangeResolutionProof {
  method?: string;
  evidence?: string[] | string;
  details?: string;
}

export interface EdgeTrafficExchange {
  id: string;
  timestamp?: string;
  source?: string;
  target?: string;
  step?: number | string;
  stepNumber?: number | string;
  direction?: "forward" | "reverse" | string;
  detail?: string;
  /** Provenance of this exchange's bytes/duration. Absent means nothing was measured. */
  evidence_class?: EvidenceClass;
  type?:
    | "submission"
    | "rejection"
    | "repair"
    | "approval"
    | "prompt"
    | "artifact"
    | "feedback"
    | "decision"
    | string;
  kind?: PayloadKind | string;
  summary?: string;
  tokens?: number;
  bytes?: number;
  durationMs?: number;
  latencyMs?: number;
  status?: "success" | "error" | "warning" | "in_transit" | string;
  payloadSnippet?: string;
  payloadPreview?: string;
  fullPayload?: string;
  inputGoal?: string;
  outputPassed?: string;
  filesTransferred?: Array<ExchangeTransferredFile | string>;
  files?: Array<ExchangeTransferredFile | string>;
  auditFinding?: ExchangeFinding | string;
  finding?: ExchangeFinding | string;
  rejectionObservation?: string;
  observation?: string;
  requiredRemediation?: string;
  remediation?: string;
  remediatedPayload?: string;
  verdict?: "PASS" | "FAIL" | "PROBE" | "WARNING" | string;
  resolutionProof?: ExchangeResolutionProof | string;
  proof?: ExchangeResolutionProof | string;
  evidence?: string | string[];
  metadata?: Record<string, unknown>;
}

/** The producer's name for a recorded message along an edge; the shape stays legacy-tolerant. */
export type EdgeExchange = EdgeTrafficExchange;

export interface EdgeTrafficDetail {
  /** Provenance of the numbers below; absent means the run recorded nothing measured. */
  evidence_class?: EvidenceClass;
  volume?: number;
  tokens?: number;
  bytes?: number;
  messagesCount?: number;
  avgLatencyMs?: number;
  exchanges?: EdgeTrafficExchange[];
  ratePerSec?: number;
  lastActive?: string;
  status?: "active" | "idle" | "congested" | "error" | string;
  glowColor?: string;
  glowIntensity?: number;
  activeSteps?: Array<number | string>;
  callingRelationship?: string;
}

/** One command the harness itself ran and timed for this node. Never agent-reported. */
export interface NodeScript {
  commandId: string;
  argv: readonly string[];
  cwd?: string;
  exitCode: number | null;
  status?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  gateId?: string;
  actor?: string;
  logPath?: string;
  stdoutTail?: string;
  stderrTail?: string;
  /** What the caller declared this command to be. Never read out of the argv. */
  category?: ToolCategory;
  tool?: string;
  extras?: Record<string, unknown>;
  evidence_class?: EvidenceClass;
  /** Provenance of the declared fields above, keyed by the field name it labels. */
  evidence?: Record<string, EvidenceClass>;
}

/** One recorded move of the task state machine, plus what the review carried when it caused one. */
export interface NodeStateTransition {
  at: string;
  actor: string;
  from: string;
  to: string;
  reason: string;
  attempt: number;
  evidence_class?: EvidenceClass;
  verdict?: string;
  round?: number;
  findingClass?: string;
  findingCount?: number;
}

/**
 * Per-agent telemetry from the grant ledger. A field the host never reported has no entry at all —
 * the node then simply has no model, and that absence is the truthful rendering.
 */
export interface NodeTelemetry {
  agentId?: string;
  role?: NodeRole;
  host?: string;
  /** Who served the model, as the host named it. Never taken off the front of the model string. */
  provider?: Evidenced<string>;
  /** The model string exactly as the host reported it, never parsed or matched by substring. */
  model?: Evidenced<string>;
  modelTier?: Evidenced<ModelTier | string>;
  thinkingLevel?: Evidenced<string>;
  contextWindow?: Evidenced<number>;
  tokensIn?: Evidenced<number>;
  tokensOut?: Evidenced<number>;
  /** Counters only some providers keep, under the names those providers reported them by. */
  tokenExtras?: Record<string, Evidenced<number>>;
  grantStatus?: string;
}

/**
 * A finding as it hangs off a node. Its screenshots live in `node.assets`, so what stays here is
 * the reference, not a second copy of the asset.
 */
export interface NodeFinding extends FindingDetail {
  screenshotAssetIds?: string[];
}

/** The section types this renderer ships a preset treatment for. */
export type KnownSectionType = "branch" | "wave" | "phase";

/** The preset section vocabulary. A dataset may group its nodes by anything it likes. */
export const KNOWN_SECTION_TYPES: readonly KnownSectionType[] = ["branch", "wave", "phase"];

/**
 * What a region stands for. Open on purpose, on the same terms as node kinds and edge kinds.
 */
export type SectionType = KnownSectionType | (string & {});

/**
 * A region of the canvas that belongs together. A branch excursion is expressed as a section plus
 * its nodes and edges — there are no compound nodes in the layout engine and none are needed.
 */
export interface GraphSection {
  id: string;
  title: string;
  description?: string;
  /** What kind of region this is. Absent means the renderer treats it as a plain grouping. */
  type?: SectionType;
  nodeIds: string[];
  collapsed?: boolean;
  /** Why this region exists. For a branch region this is the recorded branch reason. */
  reason?: string;
  /**
   * The node this region hangs off. Nesting these gives a region its depth, which is how the canvas
   * decides that a deeply subdivided excursion should arrive folded up.
   */
  parentNodeId?: string;
  status?: string;
}

export type ProvenanceEventStatus =
  | "leased"
  | "validating"
  | "satisfied"
  | "rejected"
  | "repaired"
  | "running"
  | "success"
  | "error"
  | "warning"
  | "pending"
  | "skipped"
  | string;

export interface ProvenanceRemediation {
  findingId?: string;
  id?: string;
  severity?: "critical" | "important" | "suggestion" | string;
  observation?: string;
  remediation?: string;
  status?: "open" | "resolved" | string;
  proof?:
    | {
        method?: string;
        evidence?: string[] | string;
        [key: string]: unknown;
      }
    | string;
  [key: string]: unknown;
}

export interface ProvenanceCommandRef {
  id?: string;
  argv?: readonly string[] | string;
  exitCode?: number;
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
  stdoutSnippet?: string;
  stderrSnippet?: string;
  cwd?: string;
  [key: string]: unknown;
}

export interface ProvenanceEvent {
  id: string;
  title?: string;
  label?: string;
  type?: string;
  timestamp?: string | number;
  durationMs?: number;
  status?: ProvenanceEventStatus;
  actorId?: string;
  actor?: string;
  agent?: string;
  role?: string;
  attempt?: number;
  totalAttempts?: number;
  round?: number;
  leaseToken?: string;
  validatorLeaseToken?: string;
  tokenDigest?: string;
  commandRef?: string | ProvenanceCommandRef;
  commandId?: string;
  command?: string | ProvenanceCommandRef;
  remediations?: ProvenanceRemediation[];
  remediation?: string | ProvenanceRemediation;
  resolutionPath?: string | string[];
  payload?: unknown;
  payloadSnippet?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChainOfCustodyRecord {
  actorId?: string;
  actor?: string;
  role?: string;
  agent?: string;
  leaseToken?: string;
  validatorLeaseToken?: string;
  tokenDigest?: string;
  attempt?: number;
  maxAttempts?: number;
  totalAttempts?: number;
  round?: number;
  status?: ProvenanceEventStatus;
  timestamp?: string;
  durationMs?: number;
  remediations?: ProvenanceRemediation[];
  commandRefs?: Array<string | ProvenanceCommandRef>;
  commands?: Array<string | CommandExecutionDetail | ProvenanceCommandRef>;
  resolutionPath?: string | string[];
  findings?: FindingDetail[] | ProvenanceRemediation[];
  [key: string]: unknown;
}

export interface NodeProvenanceData {
  custody?: ChainOfCustodyRecord | ChainOfCustodyRecord[];
  chainOfCustody?: ChainOfCustodyRecord | ChainOfCustodyRecord[];
  events?: ProvenanceEvent[];
  timeline?: ProvenanceEvent[];
  leaseToken?: string;
  validatorLeaseToken?: string;
  actorId?: string;
  attempt?: number;
  totalAttempts?: number;
  round?: number;
  status?: ProvenanceEventStatus;
  resolutionPath?: string | string[];
  remediations?: ProvenanceRemediation[];
  [key: string]: unknown;
}

export interface NodeMetadata {
  commands?: CommandExecutionDetail[];
  findings?: NodeFinding[];
  writeScope?: string[];
  leaseAgent?: string;
  hostAgent?: HostAgentDetail;
  repairRounds?: number;
  durationMs?: number;
  /** The role the producer recorded for this node when it carries no `telemetry` of its own. */
  role?: NodeRole;
  timingBreakdown?: TimingBreakdown;
  timing?: TimingBreakdown;
  tokens?: TokenUsageDetail;
  provenance?: NodeProvenanceData;
  chainOfCustody?: ChainOfCustodyRecord | ChainOfCustodyRecord[];
  timeline?: ProvenanceEvent[];
  events?: ProvenanceEvent[];
  leaseToken?: string;
  validatorLeaseToken?: string;
  actorId?: string;
  resolutionPath?: string | string[];
  attempt?: number;
  round?: number;
  [key: string]: unknown;
}

export interface GraphNodeData {
  id: string;
  name: string;
  description?: string;
  type?: string;
  kind?: NodeKind;
  status?: NodeStatus;
  step?: number;
  stepLabel?: string;
  badge?: BadgeDetail;
  badges?: NodeBadge[];
  /** The one home for this node's model, tier and token provenance, each with its evidence class. */
  telemetry?: NodeTelemetry;
  /** Superseded by `telemetry`, which carries the same values plus the evidence class for each. */
  model?: string;
  harnessModel?: string;
  tier?: ModelTier;
  hostAgent?: HostAgentDetail;
  sectionId?: string;
  tools?: NodeTool[];
  /** Commands the harness ran and timed for this node. */
  scripts?: NodeScript[];
  /** Recorded moves of the task state machine, in order. */
  stateTransitions?: NodeStateTransition[];
  /** The one canonical home for this node's evidence. Nothing else in the graph repeats it. */
  assets?: MediaAsset[];
  /** Automated browser runs recorded for this node. Their screenshots live in `assets`. */
  browserTests?: BrowserTestRun[];
  files?: FileRef[];
  metrics?: NodeMetrics;
  io?: { inputs?: IoPort[]; outputs?: IoPort[] };
  prompt?: string;
  output?: string;
  logs?: string;
  context?: NodeContext;
  metadata?: NodeMetadata;
  /** Superseded by `assets`, the single home for a node's evidence. */
  mediaAssets?: MediaAsset[];
  provenance?: NodeProvenanceData;
  chainOfCustody?: ChainOfCustodyRecord | ChainOfCustodyRecord[];
  timeline?: ProvenanceEvent[];
  events?: ProvenanceEvent[];
  rank?: number;
  group?: string;
}

export interface EdgeHandoff {
  kind: PayloadKind;
  summary?: string;
  tokens?: number;
  preview?: string;
}

export interface EdgeContainerDetail {
  stepBadge?: string;
  title?: string;
  detail?: string;
  variant?:
    | "info"
    | "warning"
    | "error"
    | "success"
    | "neutral"
    | "cyan"
    | "indigo"
    | "slate"
    | "amber"
    | "emerald"
    | "critic"
    | "spawn"
    | "sequence"
    | "data"
    | "dependency"
    | "loop"
    | "gate"
    | "signoff"
    | string;
  icon?: string;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
  description?: string;
  directed?: boolean;
  isCycle?: boolean;
  kind?: EdgeKind;
  condition?: string;
  stepNumber?: number | string;
  badge?: BadgeDetail;
  container?: EdgeContainerDetail;
  /** Per-edge accent. Overrides the kind accent; the renderer never borrows a node's colour. */
  accent?: string;
  handoff?: EdgeHandoff;
  layoutRole?: EdgeLayoutHint;
  weight?: number;
  minLen?: number;
  traffic?: EdgeTrafficDetail;
  isHighTraffic?: boolean;
  trafficVolume?: number;
  bundleCount?: number;
  bundleIndex?: number;
  tokens?: number;
  exchanges?: EdgeTrafficExchange[];
}

export interface GraphDataset {
  id: string;
  title: string;
  description?: string;
  directed?: boolean;
  entry?: string;
  exits?: string[];
  sections?: GraphSection[];
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

export interface PositionedNode extends GraphNodeData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge extends GraphEdgeData {
  path: string;
  points?: Point[];
  labelX?: number;
  labelY?: number;
  badgeRect?: Rect;
  anchorPoint?: Point;
  leaderPoints?: Point[];
  sourcePort?: PortRef;
  targetPort?: PortRef;
  bundleOffset?: number;
  bundleCount?: number;
  bundleIndex?: number;
  sharedAnchor?: Point;
}
