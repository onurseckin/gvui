import type { GraphDataset, GraphNodeData, MediaAsset } from "../../types/graphData";

/**
 * How the run came to know a value. Mirrors the producer's `EvidenceClass`: a measured number and a
 * guessed one must never look alike, and a value nobody reported stays absent instead of defaulted.
 */
export type EvidenceClass =
  | "harness_observed"
  | "agent_reported"
  | "host_reported"
  | "derived"
  | "unknown";

const EVIDENCE_CLASSES = new Set<string>([
  "harness_observed",
  "agent_reported",
  "host_reported",
  "derived",
  "unknown",
]);

/**
 * A value the dataset carried. `evidenceClass` is undefined when the value came from a pre-evidence
 * dataset that never labelled its provenance — which is itself information, not a reason to guess.
 */
export interface EvidencedValue<T> {
  value: T;
  evidenceClass?: EvidenceClass;
  isEstimated: boolean;
}

export type RecordSource = "canonical" | "legacy";

export interface ScriptRow {
  id: string;
  argv: string[];
  cwd?: string;
  exitCode: number | null;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  gateId?: string;
  actor?: string;
  logPath?: string;
  stdoutTail?: string;
  stderrTail?: string;
  evidenceClass?: EvidenceClass;
  source: RecordSource;
}

export interface ToolRow {
  name: string;
  type?: string;
  firstReportedAt?: string;
  evidenceClass?: EvidenceClass;
  source: RecordSource;
}

export interface BrowserRunViewportRow {
  name?: string;
  width: number;
  height: number;
}

/**
 * One automated browser run the dataset recorded against this node. Every field is optional: a
 * runner that reported no browser, no viewport or no test file leaves those unknown, and the view
 * says so rather than filling them in.
 */
export interface BrowserRunRow {
  commandId?: string;
  runner?: string;
  testFile?: string;
  browser?: string;
  status?: string;
  durationMs?: number;
  viewport?: BrowserRunViewportRow;
  viewports: BrowserRunViewportRow[];
  traces: string[];
  videos: string[];
  reportPath?: string;
  /** How each field came to be known, keyed by the field it labels. */
  evidence: Record<string, EvidenceClass>;
}

export type TransitionClass = "probe" | "pushback" | "plain";

export interface TransitionRow {
  at?: string;
  actor?: string;
  from: string;
  to: string;
  reason?: string;
  attempt?: number;
  evidenceClass?: EvidenceClass;
  verdict?: string;
  round?: number;
  findingClass?: string;
  findingCount?: number;
  transitionClass: TransitionClass;
}

export interface TelemetryView {
  agentId?: string;
  role?: string;
  host?: string;
  grantStatus?: string;
  model?: EvidencedValue<string>;
  modelTier?: EvidencedValue<string>;
  thinkingLevel?: EvidencedValue<string>;
  tokensIn?: EvidencedValue<number>;
  tokensOut?: EvidencedValue<number>;
}

export interface BranchContext {
  branchId?: string;
  reason?: string;
  subTaskId?: string;
  subTaskStatus?: string;
  parentTaskId?: string;
  parentNodeId?: string;
  writeScope?: string[];
  depth?: number;
  gate?: string;
  summary?: string;
  sectionId?: string;
  sectionTitle?: string;
  sectionStatus?: string;
}

export interface TokenFootprint {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  isEstimated: boolean;
  evidenceClass?: EvidenceClass;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readTextArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is string => typeof entry === "string");
  return entries.length > 0 ? entries : undefined;
}

function readEvidenceClass(
  record: Record<string, unknown>,
  key: string,
): EvidenceClass | undefined {
  const value = record[key];
  return typeof value === "string" && EVIDENCE_CLASSES.has(value)
    ? (value as EvidenceClass)
    : undefined;
}

/**
 * The producer's canonical node fields land here ahead of the shared graph types, so one bridge in
 * this module keeps every consumer of it fully typed.
 */
function extraField(node: GraphNodeData, key: string): unknown {
  return (node as unknown as Record<string, unknown>)[key];
}

function extraArray(node: GraphNodeData, key: string): unknown[] {
  const value = extraField(node, key);
  return Array.isArray(value) ? value : [];
}

function metadataArray(node: GraphNodeData, key: string): unknown[] {
  const value = node.metadata?.[key];
  return Array.isArray(value) ? value : [];
}

function toMediaAsset(value: unknown): MediaAsset | undefined {
  if (!isRecord(value)) return undefined;
  const url = readText(value, "url");
  const id = readText(value, "id") ?? url;
  if (!id) return undefined;
  return { ...value, id, url: url ?? "" } as MediaAsset;
}

function collectAssets(candidates: readonly unknown[][]): MediaAsset[] {
  const collected: MediaAsset[] = [];
  const seen = new Set<string>();
  for (const group of candidates) {
    for (const candidate of group) {
      const asset = toMediaAsset(candidate);
      if (!asset) continue;
      const key = asset.url || asset.id;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(asset);
    }
  }
  return collected;
}

/** `node.assets` is the one home for a node's evidence, so it is the only place this reads. */
export function readAssets(node: GraphNodeData): MediaAsset[] {
  return collectAssets([extraArray(node, "assets")]);
}

/**
 * Resolves finding evidence references against the node's own assets. Ids the node does not own are
 * reported back rather than dropped, because a silently missing reference reads as no evidence.
 */
export function resolveAssetIds(
  ids: readonly string[] | undefined,
  assets: readonly MediaAsset[],
): { resolved: MediaAsset[]; unresolved: string[] } {
  if (!ids || ids.length === 0) return { resolved: [], unresolved: [] };
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const resolved: MediaAsset[] = [];
  const unresolved: string[] = [];
  for (const id of ids) {
    const asset = byId.get(id);
    if (asset) resolved.push(asset);
    else unresolved.push(id);
  }
  return { resolved, unresolved };
}

function canonicalScript(value: unknown): ScriptRow | undefined {
  if (!isRecord(value)) return undefined;
  const id = readText(value, "commandId");
  const argv = readTextArray(value, "argv");
  if (!id || !argv) return undefined;
  const exitCode = readNumber(value, "exitCode");
  return {
    id,
    argv,
    cwd: readText(value, "cwd"),
    exitCode: exitCode ?? null,
    status: readText(value, "status"),
    startedAt: readText(value, "startedAt"),
    finishedAt: readText(value, "finishedAt"),
    durationMs: readNumber(value, "durationMs"),
    gateId: readText(value, "gateId"),
    actor: readText(value, "actor"),
    logPath: readText(value, "logPath"),
    stdoutTail: readText(value, "stdoutTail"),
    stderrTail: readText(value, "stderrTail"),
    evidenceClass: readEvidenceClass(value, "evidence_class"),
    source: "canonical",
  };
}

function legacyScript(value: unknown): ScriptRow | undefined {
  if (!isRecord(value)) return undefined;
  const id = readText(value, "id");
  const argvList = readTextArray(value, "argv");
  const argvText = readText(value, "argv");
  const argv = argvList ?? (argvText ? [argvText] : undefined);
  if (!id || !argv) return undefined;
  const exitCode = readNumber(value, "exitCode") ?? readNumber(value, "exit_code");
  return {
    id,
    argv,
    cwd: readText(value, "cwd"),
    exitCode: exitCode ?? null,
    status: readText(value, "status"),
    startedAt: readText(value, "startedAt") ?? readText(value, "started_at"),
    finishedAt: readText(value, "finishedAt") ?? readText(value, "finished_at"),
    durationMs: readNumber(value, "durationMs") ?? readNumber(value, "duration_ms"),
    gateId: readText(value, "gateId") ?? readText(value, "gate_id"),
    actor: readText(value, "actor"),
    logPath: readText(value, "logPath") ?? readText(value, "recordPath"),
    stdoutTail: readText(value, "stdoutTail") ?? readText(value, "stdoutSnippet"),
    stderrTail: readText(value, "stderrTail") ?? readText(value, "stderrSnippet"),
    source: "legacy",
  };
}

/** Canonical `node.scripts` when the dataset has them, otherwise the legacy command records. */
export function readScripts(node: GraphNodeData): ScriptRow[] {
  const canonical = extraArray(node, "scripts")
    .map(canonicalScript)
    .filter((row): row is ScriptRow => row !== undefined);
  if (canonical.length > 0) return canonical;
  return metadataArray(node, "commands")
    .map(legacyScript)
    .filter((row): row is ScriptRow => row !== undefined);
}

/** Tools the ledger recorded. Nothing here is inferred from a command line. */
export function readTools(node: GraphNodeData): ToolRow[] {
  const rows: ToolRow[] = [];
  const seen = new Set<string>();
  for (const entry of extraArray(node, "tools")) {
    if (!isRecord(entry)) continue;
    const name = readText(entry, "name");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const evidenceClass = readEvidenceClass(entry, "evidence_class");
    rows.push({
      name,
      type: readText(entry, "type"),
      firstReportedAt: readText(entry, "firstReportedAt"),
      evidenceClass,
      source: evidenceClass ? "canonical" : "legacy",
    });
  }
  return rows;
}

function viewportRow(value: unknown): BrowserRunViewportRow | undefined {
  if (!isRecord(value)) return undefined;
  const width = readNumber(value, "width");
  const height = readNumber(value, "height");
  if (width === undefined || height === undefined) return undefined;
  const name = readText(value, "name");
  return { ...(name === undefined ? {} : { name }), width, height };
}

function evidenceMap(value: unknown): Record<string, EvidenceClass> {
  if (!isRecord(value)) return {};
  const map: Record<string, EvidenceClass> = {};
  for (const key of Object.keys(value)) {
    const evidenceClass = readEvidenceClass(value, key);
    if (evidenceClass) map[key] = evidenceClass;
  }
  return map;
}

function browserRunRow(value: unknown): BrowserRunRow | undefined {
  if (!isRecord(value)) return undefined;
  const viewports = Array.isArray(value.viewports)
    ? value.viewports
        .map(viewportRow)
        .filter((row): row is BrowserRunViewportRow => row !== undefined)
    : [];
  const row: BrowserRunRow = {
    commandId: readText(value, "commandId"),
    runner: readText(value, "runner"),
    testFile: readText(value, "testFile"),
    browser: readText(value, "browser"),
    status: readText(value, "status"),
    durationMs: readNumber(value, "durationMs"),
    viewport: viewportRow(value.viewport),
    viewports,
    traces: readTextArray(value, "traces") ?? [],
    videos: readTextArray(value, "videos") ?? [],
    reportPath: readText(value, "reportPath"),
    evidence: evidenceMap(value.evidence),
  };
  // An entry that carried no fact is not a run that happened; rendering it would invent a scaffold.
  const carriesFact =
    row.commandId !== undefined ||
    row.runner !== undefined ||
    row.testFile !== undefined ||
    row.browser !== undefined ||
    row.status !== undefined ||
    row.durationMs !== undefined ||
    row.viewport !== undefined ||
    viewports.length > 0 ||
    row.traces.length > 0 ||
    row.videos.length > 0;
  return carriesFact ? row : undefined;
}

/** The browser runs this node owns. `node.browserTests` is their one home in the dataset. */
export function readBrowserTests(node: GraphNodeData): BrowserRunRow[] {
  return extraArray(node, "browserTests")
    .map(browserRunRow)
    .filter((row): row is BrowserRunRow => row !== undefined);
}

/**
 * A probe demands proof; a pushback asserts a defect. They are separate recorded facts and the view
 * must not blur them, which is what made every probed task look rejected.
 */
export function classifyTransition(row: {
  verdict?: string;
  findingClass?: string;
  to: string;
}): TransitionClass {
  const verdict = (row.verdict ?? "").toLowerCase();
  const findingClass = (row.findingClass ?? "").toLowerCase();
  if (verdict === "probe" || findingClass === "probe_demand") return "probe";
  if (verdict === "reject" || verdict === "fail" || findingClass === "defect") return "pushback";
  if (row.to === "rejected") return "pushback";
  return "plain";
}

export function readStateTransitions(node: GraphNodeData): TransitionRow[] {
  const rows: TransitionRow[] = [];
  for (const entry of extraArray(node, "stateTransitions")) {
    if (!isRecord(entry)) continue;
    const from = readText(entry, "from");
    const to = readText(entry, "to");
    if (!from || !to) continue;
    const verdict = readText(entry, "verdict");
    const findingClass = readText(entry, "findingClass");
    rows.push({
      at: readText(entry, "at"),
      actor: readText(entry, "actor"),
      from,
      to,
      reason: readText(entry, "reason"),
      attempt: readNumber(entry, "attempt"),
      evidenceClass: readEvidenceClass(entry, "evidence_class"),
      verdict,
      round: readNumber(entry, "round"),
      findingClass,
      findingCount: readNumber(entry, "findingCount"),
      transitionClass: classifyTransition({ verdict, findingClass, to }),
    });
  }
  return rows;
}

function evidencedFrom(value: unknown): EvidencedValue<string> | undefined {
  if (!isRecord(value)) return undefined;
  const inner = readText(value, "value");
  if (!inner) return undefined;
  return {
    value: inner,
    evidenceClass: readEvidenceClass(value, "evidence_class"),
    isEstimated: value.is_estimated === true,
  };
}

function evidencedNumberFrom(value: unknown): EvidencedValue<number> | undefined {
  if (!isRecord(value)) return undefined;
  const inner = readNumber(value, "value");
  if (inner === undefined) return undefined;
  return {
    value: inner,
    evidenceClass: readEvidenceClass(value, "evidence_class"),
    isEstimated: value.is_estimated === true,
  };
}

function unlabelled<T>(value: T | undefined): EvidencedValue<T> | undefined {
  return value === undefined ? undefined : { value, isEstimated: false };
}

/** The host runtime record, which carries the tool and effort fields telemetry has no home for. */
function hostAgentRecord(node: GraphNodeData): Record<string, unknown> {
  const fromMetrics = node.metrics?.hostAgent;
  if (isRecord(fromMetrics)) return fromMetrics;
  const fromMetadata = node.metadata?.hostAgent;
  if (isRecord(fromMetadata)) return fromMetadata;
  const fromNode = extraField(node, "hostAgent");
  return isRecord(fromNode) ? fromNode : {};
}

/**
 * Per-agent telemetry from the grant ledger. A field the host never reported has no entry at all —
 * the node then simply has no model, and the view says so rather than showing a plausible default.
 */
export function readTelemetry(node: GraphNodeData): TelemetryView {
  const canonical = extraField(node, "telemetry");
  if (isRecord(canonical)) {
    return {
      agentId: readText(canonical, "agentId"),
      role: readText(canonical, "role"),
      host: readText(canonical, "host"),
      grantStatus: readText(canonical, "grantStatus"),
      model: evidencedFrom(canonical.model),
      modelTier: evidencedFrom(canonical.modelTier),
      thinkingLevel: evidencedFrom(canonical.thinkingLevel),
      tokensIn: evidencedNumberFrom(canonical.tokensIn),
      tokensOut: evidencedNumberFrom(canonical.tokensOut),
    };
  }

  const host = hostAgentRecord(node);
  const metadata = node.metadata ?? {};
  return {
    agentId: readText(metadata, "agentId") ?? readText(metadata, "leaseAgent"),
    role: readText(metadata, "role"),
    host: readText(host, "hostTool") ?? readText(host, "tool"),
    model: unlabelled(
      readText(host, "modelName") ?? readText(host, "model") ?? readText(metadata, "hostModel"),
    ),
    modelTier: unlabelled(readText(host, "modelTier") ?? readText(host, "tier")),
    thinkingLevel: unlabelled(
      readText(host, "thinkingLevel") ??
        readText(host, "reasoningEffort") ??
        readText(metadata, "thinkingLevel"),
    ),
    tokensIn: unlabelled(node.metrics?.tokensIn),
    tokensOut: unlabelled(node.metrics?.tokensOut),
  };
}

const AGENT_BEARING_KINDS: ReadonlySet<string> = new Set([
  "agent",
  "orchestrator",
  "critic",
  "gate",
]);

/**
 * Whether an agent ever stood behind this node. A prompt node, a terminal node or a node in a graph
 * that has nothing to do with agents has no model to be unknown about, so it is not asked the
 * question at all. A recorded role is not enough on its own: graphs outside this domain name roles
 * too, and a role says nothing about a model.
 */
export function nodeCarriesAgent(node: GraphNodeData): boolean {
  if (node.kind !== undefined && AGENT_BEARING_KINDS.has(node.kind)) return true;
  const telemetry = readTelemetry(node);
  return [
    telemetry.agentId,
    telemetry.host,
    telemetry.grantStatus,
    telemetry.model,
    telemetry.modelTier,
    telemetry.thinkingLevel,
    telemetry.tokensIn,
    telemetry.tokensOut,
  ].some((field) => field !== undefined);
}

/** The role the node's agent held, from the grant ledger or the recorded node metadata. */
export function readRole(node: GraphNodeData): string | undefined {
  const telemetry = extraField(node, "telemetry");
  if (isRecord(telemetry)) {
    const role = readText(telemetry, "role");
    if (role) return role;
  }
  return node.metadata ? readText(node.metadata, "role") : undefined;
}

/**
 * Real token counts only. `costUsd` survives solely when the dataset carried one, so a node with no
 * reported cost shows no cost instead of a figure derived from a price list.
 */
export function readTokenFootprint(node: GraphNodeData): TokenFootprint {
  const tokens = isRecord(node.metrics?.tokens)
    ? node.metrics.tokens
    : isRecord(node.metadata?.tokens)
      ? node.metadata.tokens
      : {};
  const telemetry = readTelemetry(node);

  const inputTokens =
    readNumber(tokens, "inputTokens") ??
    readNumber(tokens, "promptTokens") ??
    telemetry.tokensIn?.value;
  const outputTokens =
    readNumber(tokens, "outputTokens") ??
    readNumber(tokens, "completionTokens") ??
    telemetry.tokensOut?.value;
  const reasoningTokens = readNumber(tokens, "reasoningTokens");
  const cacheCreationTokens = readNumber(tokens, "cacheCreationTokens");
  const cacheReadTokens = readNumber(tokens, "cacheReadTokens");
  const declaredTotal = readNumber(tokens, "totalTokens");
  const summedTotal =
    inputTokens === undefined && outputTokens === undefined && reasoningTokens === undefined
      ? undefined
      : (inputTokens ?? 0) + (outputTokens ?? 0) + (reasoningTokens ?? 0);

  const costUsd = node.metrics?.costUsd ?? readNumber(tokens, "costUsd");

  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens: declaredTotal ?? summedTotal,
    costUsd: typeof costUsd === "number" && Number.isFinite(costUsd) ? costUsd : undefined,
    isEstimated: tokens.isEstimated === true,
    evidenceClass: readEvidenceClass(tokens, "evidenceClass"),
  };
}

/**
 * What a branch sub-agent node owns and why it exists. The section carries the recorded branch
 * reason, so it is looked up by the node's own `sectionId` rather than searched for.
 */
export function readBranchContext(
  node: GraphNodeData,
  dataset?: GraphDataset | null,
): BranchContext | undefined {
  const metadata = node.metadata ?? {};
  const branchId = readText(metadata, "branchId");
  const sectionId = node.sectionId;
  const section = sectionId
    ? (dataset?.sections ?? []).find((candidate) => candidate.id === sectionId)
    : undefined;
  const sectionRecord = isRecord(section) ? section : undefined;
  const sectionReason = sectionRecord ? readText(sectionRecord, "reason") : undefined;

  if (!branchId && !sectionReason) return undefined;

  return {
    branchId,
    reason: readText(metadata, "branchReason") ?? sectionReason,
    subTaskId: readText(metadata, "subTaskId"),
    subTaskStatus: readText(metadata, "subTaskStatus"),
    parentTaskId: readText(metadata, "parentTaskId"),
    parentNodeId: sectionRecord ? readText(sectionRecord, "parentNodeId") : undefined,
    writeScope: readTextArray(metadata, "writeScope"),
    depth: readNumber(metadata, "depth"),
    gate: readText(metadata, "gate"),
    summary: readText(metadata, "summary"),
    sectionId,
    sectionTitle: sectionRecord ? readText(sectionRecord, "title") : undefined,
    sectionStatus: sectionRecord ? readText(sectionRecord, "status") : undefined,
  };
}
