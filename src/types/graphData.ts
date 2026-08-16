import type { EdgeLayoutHint, Point, PortRef, Rect } from "../engine/layout/custom/types";

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

export interface NodeTool {
  name: string;
  type?: "generic" | "custom";
}

export interface NodeContext {
  repoPath?: string;
  previousOutputs?: Array<{ fromNode: string; summary: string }>;
  [key: string]: unknown;
}

export type NodeKind =
  | "orchestrator"
  | "agent"
  | "tool"
  | "router"
  | "join"
  | "gate"
  | "terminal"
  | "input"
  | "critic";
export type NodeStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "warning"
  | "skipped"
  | "cached";
export type ModelTier = "xs" | "s" | "m" | "l";
export type FileMode = "read" | "write" | "create" | "delete" | "attach";
export type EdgeKind =
  | "sequence"
  | "spawn"
  | "dispatch"
  | "data"
  | "handoff"
  | "dependency"
  | "loop"
  | "pushback"
  | "gate"
  | "validation"
  | "critic"
  | "signoff"
  | "conditional"
  | "fallback"
  | "join";
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
  remediation?: string;
  status: "open" | "resolved";
  revalidationProof?: { method: string; evidence: string[] };
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

export interface PlaywrightMetadata {
  viewport?: { width: number; height: number };
  traces?: string[];
  videos?: string[];
  screenshots?: MediaAsset[];
  testFile?: string;
  durationMs?: number;
  browser?: string;
  status?: "passed" | "failed" | "timedOut" | "interrupted" | string;
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
  verdict?: "PASS" | "FAIL" | "WARNING" | string;
  resolutionProof?: ExchangeResolutionProof | string;
  proof?: ExchangeResolutionProof | string;
  evidence?: string | string[];
  metadata?: Record<string, unknown>;
}

export interface EdgeTrafficDetail {
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

export interface GraphSection {
  id: string;
  title: string;
  description?: string;
  nodeIds: string[];
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
  findings?: FindingDetail[];
  writeScope?: string[];
  leaseAgent?: string;
  hostAgent?: HostAgentDetail;
  repairRounds?: number;
  durationMs?: number;
  mediaAssets?: MediaAsset[];
  screenshots?: MediaAsset[];
  assets?: MediaAsset[];
  playwrightMetadata?: PlaywrightMetadata;
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
  model?: string;
  harnessModel?: string;
  tier?: ModelTier;
  hostAgent?: HostAgentDetail;
  sectionId?: string;
  tools?: NodeTool[];
  files?: FileRef[];
  metrics?: NodeMetrics;
  io?: { inputs?: IoPort[]; outputs?: IoPort[] };
  prompt?: string;
  output?: string;
  logs?: string;
  context?: NodeContext;
  metadata?: NodeMetadata;
  mediaAssets?: MediaAsset[];
  screenshots?: MediaAsset[];
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
