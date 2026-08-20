import type {
  FileRef,
  FindingDetail,
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  IoPort,
  NodeTool,
  ProvenanceRemediation,
} from "../../types/graphData";
import type {
  DiffFilterMode,
  DiffStatus,
  EdgeDiff,
  EdgeTrafficDelta,
  FileChange,
  FindingDiff,
  FindingDiffStatus,
  GraphDiffCounts,
  GraphDiffOptions,
  GraphDiffResult,
  GraphMetricSummary,
  MetricDelta,
  NodeDiff,
  NodeMetricDiff,
  PortChange,
  PropertyDiff,
  ToolChange,
} from "./types";

// ============================================================================
// Formatting & Number Utilities
// ============================================================================

export function formatMetricDeltaValue(value: number, unit = "", decimals = 1): string {
  if (!Number.isFinite(value) || value === 0) {
    return `0${unit ? ` ${unit}` : ""}`;
  }
  const sign = value > 0 ? "+" : "";
  if (Math.abs(value) >= 1_000_000) {
    return `${sign}${(value / 1_000_000).toFixed(decimals)}M${unit ? ` ${unit}` : ""}`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${sign}${(value / 1_000).toFixed(decimals)}k${unit ? ` ${unit}` : ""}`;
  }
  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(decimals);
  return `${sign}${formatted}${unit ? ` ${unit}` : ""}`;
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms === 0) return "0 ms";
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "-" : "";
  if (abs >= 60_000) {
    const mins = Math.floor(abs / 60_000);
    const secs = ((abs % 60_000) / 1000).toFixed(1);
    return `${sign}${mins}m ${secs}s`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(2)} s`;
  }
  return `${sign}${Math.round(abs)} ms`;
}

export function formatCostUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd === 0) return "$0.00";
  const abs = Math.abs(usd);
  const sign = usd < 0 ? "-" : "";
  if (abs < 0.01 || (abs < 1 && Number((abs * 100).toFixed(2)) % 1 !== 0)) {
    return `${sign}$${abs.toFixed(4)}`;
  }
  return `${sign}$${abs.toFixed(2)}`;
}

export function calculateMetricDelta(baseVal: number, compVal: number, precision = 2): MetricDelta {
  const safeBase = Number.isFinite(baseVal) ? baseVal : 0;
  const safeComp = Number.isFinite(compVal) ? compVal : 0;
  const delta = safeComp - safeBase;

  let percentChange = 0;
  if (safeBase !== 0) {
    percentChange = (delta / Math.abs(safeBase)) * 100;
  } else if (safeComp !== 0) {
    percentChange = safeComp > 0 ? 100 : -100;
  }

  // Round percentChange to specified precision
  const factor = 10 ** precision;
  percentChange = Math.round(percentChange * factor) / factor;

  const sign = delta > 0 ? "+" : "";
  const formattedDelta = `${sign}${delta % 1 === 0 ? delta.toString() : delta.toFixed(precision)} (${sign}${percentChange.toFixed(1)}%)`;

  return {
    baseValue: safeBase,
    compValue: safeComp,
    delta,
    percentChange,
    formattedDelta,
    isIncrease: delta > 0,
    isDecrease: delta < 0,
    isNeutral: delta === 0,
  };
}

// ============================================================================
// Deep Value Comparison Helper
// ============================================================================

export function isPrimitive(val: unknown): boolean {
  return (
    val === null || val === undefined || (typeof val !== "object" && typeof val !== "function")
  );
}

export function safeStringify(val: unknown): string {
  if (val === undefined) return "undefined";
  if (val === null) return "null";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export function deepEqual(a: unknown, b: unknown, visited = new Set<unknown>()): boolean {
  if (Object.is(a, b)) return true;
  if (isPrimitive(a) || isPrimitive(b)) return false;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

  if (visited.has(a) || visited.has(b)) return true; // prevent cycle recursion crash
  visited.add(a);
  visited.add(b);

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], visited)) return false;
    }
    return true;
  }

  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(recordB, key)) return false;
    if (!deepEqual(recordA[key], recordB[key], visited)) return false;
  }

  return true;
}

// ============================================================================
// Graph Topology Analysis (Cycles, Orphans, Dangling)
// ============================================================================

export function detectCycles(
  nodeIds: readonly string[],
  edges: readonly GraphEdgeData[],
): { cyclicNodeIds: Set<string>; cyclicEdgeIds: Set<string> } {
  const cyclicNodeIds = new Set<string>();
  const cyclicEdgeIds = new Set<string>();

  const adj = new Map<string, Array<{ target: string; edgeId: string }>>();
  for (const id of nodeIds) {
    adj.set(id, []);
  }

  for (const edge of edges) {
    if (!edge || !edge.id) continue;
    if (edge.isCycle || edge.source === edge.target) {
      cyclicEdgeIds.add(edge.id);
      if (edge.source) cyclicNodeIds.add(edge.source);
      if (edge.target) cyclicNodeIds.add(edge.target);
    }
    if (adj.has(edge.source)) {
      adj.get(edge.source)?.push({ target: edge.target, edgeId: edge.id });
    }
  }

  // Tarjan's strongly connected components (SCC) algorithm for directed cycle detection
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];

  function strongConnect(u: string): void {
    indices.set(u, index);
    lowlink.set(u, index);
    index++;
    stack.push(u);
    onStack.add(u);

    const neighbors = adj.get(u) ?? [];
    for (const { target: v, edgeId } of neighbors) {
      if (!indices.has(v)) {
        strongConnect(v);
        lowlink.set(u, Math.min(lowlink.get(u)!, lowlink.get(v)!));
      } else if (onStack.has(v)) {
        lowlink.set(u, Math.min(lowlink.get(u)!, indices.get(v)!));
        cyclicEdgeIds.add(edgeId);
      }
    }

    if (lowlink.get(u) === indices.get(u)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w) {
          onStack.delete(w);
          scc.push(w);
        }
      } while (w && w !== u);

      // If SCC size > 1 or self-loop, mark all nodes in SCC as cyclic
      if (scc.length > 1) {
        for (const nodeId of scc) {
          cyclicNodeIds.add(nodeId);
        }
        // Mark all edges connecting nodes within this SCC as cyclic
        for (const fromNode of scc) {
          const fromNeighbors = adj.get(fromNode) ?? [];
          for (const { target, edgeId } of fromNeighbors) {
            if (scc.includes(target)) {
              cyclicEdgeIds.add(edgeId);
            }
          }
        }
      }
    }
  }

  for (const id of nodeIds) {
    if (!indices.has(id)) {
      strongConnect(id);
    }
  }

  return { cyclicNodeIds, cyclicEdgeIds };
}

export function detectOrphanedNodes(
  nodes: readonly GraphNodeData[],
  edges: readonly GraphEdgeData[],
): Set<string> {
  const connectedNodeIds = new Set<string>();
  for (const edge of edges) {
    if (edge.source) connectedNodeIds.add(edge.source);
    if (edge.target) connectedNodeIds.add(edge.target);
  }

  const orphaned = new Set<string>();
  for (const node of nodes) {
    if (node && node.id && !connectedNodeIds.has(node.id)) {
      orphaned.add(node.id);
    }
  }
  return orphaned;
}

export function detectDanglingEdges(
  edges: readonly GraphEdgeData[],
  validNodeIds: ReadonlySet<string>,
): Set<string> {
  const dangling = new Set<string>();
  for (const edge of edges) {
    if (!edge || !edge.id) continue;
    const isSourceMissing = !edge.source || !validNodeIds.has(edge.source);
    const isTargetMissing = !edge.target || !validNodeIds.has(edge.target);
    if (isSourceMissing || isTargetMissing) {
      dangling.add(edge.id);
    }
  }
  return dangling;
}

// ============================================================================
// Input Sanitization Helpers (Schema Fault Tolerance)
// ============================================================================

export function sanitizeNode(raw: unknown, idx: number): GraphNodeData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    const id = `node-synth-${idx}`;
    return { id, name: id, status: "pending" };
  }

  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id : `node-synth-${idx}`;
  const name = typeof record.name === "string" && record.name.trim() ? record.name : id;

  const sanitized: GraphNodeData = {
    ...record,
    id,
    name,
  };

  // Sanitize metrics numbers
  if (record.metrics && typeof record.metrics === "object" && !Array.isArray(record.metrics)) {
    const m = record.metrics as Record<string, unknown>;
    const durationMs =
      typeof m.durationMs === "number" && Number.isFinite(m.durationMs) ? m.durationMs : undefined;
    const costUsd =
      typeof m.costUsd === "number" && Number.isFinite(m.costUsd) ? m.costUsd : undefined;
    const retries =
      typeof m.retries === "number" && Number.isFinite(m.retries) ? m.retries : undefined;
    const repairRounds =
      typeof m.repairRounds === "number" && Number.isFinite(m.repairRounds)
        ? m.repairRounds
        : undefined;

    sanitized.metrics = {
      ...m,
      durationMs,
      costUsd,
      retries,
      repairRounds,
    };
  }

  return sanitized;
}

export function sanitizeEdge(raw: unknown, idx: number): GraphEdgeData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    const id = `edge-synth-${idx}`;
    return { id, source: `src-${idx}`, target: `tgt-${idx}` };
  }

  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id : `edge-synth-${idx}`;
  const source = typeof record.source === "string" ? record.source : "";
  const target = typeof record.target === "string" ? record.target : "";

  return {
    ...record,
    id,
    source,
    target,
  };
}

// ============================================================================
// Node Metric & Detail Extractors
// ============================================================================

export function getNodeDurationMs(node: GraphNodeData | null | undefined): number {
  if (!node) return 0;
  if (
    node.metrics?.durationMs !== undefined &&
    typeof node.metrics.durationMs === "number" &&
    Number.isFinite(node.metrics.durationMs)
  ) {
    return node.metrics.durationMs;
  }
  const timing =
    node.metrics?.timing ??
    node.metrics?.timingBreakdown ??
    node.metadata?.timingBreakdown ??
    node.metadata?.timing;
  if (
    timing &&
    typeof timing.wallDurationMs === "number" &&
    Number.isFinite(timing.wallDurationMs)
  ) {
    return timing.wallDurationMs;
  }
  if (
    node.metadata?.durationMs !== undefined &&
    typeof node.metadata.durationMs === "number" &&
    Number.isFinite(node.metadata.durationMs)
  ) {
    return node.metadata.durationMs;
  }
  return 0;
}

export function getNodeTokensBreakdown(node: GraphNodeData | null | undefined): {
  prompt: number;
  completion: number;
  reasoning: number;
  cacheRead: number;
  cacheCreation: number;
  total: number;
  in: number;
  out: number;
} {
  if (!node) {
    return {
      prompt: 0,
      completion: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheCreation: 0,
      total: 0,
      in: 0,
      out: 0,
    };
  }

  const m = node.metrics;
  const tokenDetail = m?.tokens ?? node.metadata?.tokens;

  const safeNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  const inVal = safeNum(m?.tokensIn ?? tokenDetail?.promptTokens);
  const outVal = safeNum(m?.tokensOut ?? tokenDetail?.completionTokens);
  const prompt = safeNum(tokenDetail?.promptTokens ?? inVal);
  const completion = safeNum(tokenDetail?.completionTokens ?? outVal);
  const reasoning = safeNum(tokenDetail?.reasoningTokens);
  const cacheRead = safeNum(tokenDetail?.cacheReadTokens);
  const cacheCreation = safeNum(tokenDetail?.cacheCreationTokens);

  let total = safeNum(tokenDetail?.totalTokens ?? inVal + outVal);
  if (total === 0 && (prompt > 0 || completion > 0 || reasoning > 0)) {
    total = prompt + completion + reasoning;
  }

  return {
    prompt,
    completion,
    reasoning,
    cacheRead,
    cacheCreation,
    total,
    in: inVal,
    out: outVal,
  };
}

export function getNodeCostUsd(node: GraphNodeData | null | undefined): number {
  if (!node) return 0;
  if (
    node.metrics?.costUsd !== undefined &&
    typeof node.metrics.costUsd === "number" &&
    Number.isFinite(node.metrics.costUsd)
  ) {
    return node.metrics.costUsd;
  }
  return 0;
}

export function getNodeRepairRounds(node: GraphNodeData | null | undefined): number {
  if (!node) return 0;
  if (
    typeof node.metrics?.repairRounds === "number" &&
    Number.isFinite(node.metrics.repairRounds)
  ) {
    return node.metrics.repairRounds;
  }
  if (
    typeof node.metadata?.repairRounds === "number" &&
    Number.isFinite(node.metadata.repairRounds)
  ) {
    return node.metadata.repairRounds;
  }
  return 0;
}

export function getNodeRetries(node: GraphNodeData | null | undefined): number {
  if (!node) return 0;
  if (typeof node.metrics?.retries === "number" && Number.isFinite(node.metrics.retries)) {
    return node.metrics.retries;
  }
  return 0;
}

export function getNodeModel(node: GraphNodeData | null | undefined): string | null {
  if (!node) return null;
  const reported = node.telemetry?.model?.value;
  if (reported) return reported;
  if (node.hostAgent?.model) return node.hostAgent.model;
  if (node.metadata?.hostAgent?.model) return node.metadata.hostAgent.model;
  return null;
}

export function getNodeFindings(node: GraphNodeData | null | undefined): FindingDetail[] {
  if (!node) return [];

  // Check metadata findings
  if (Array.isArray(node.metadata?.findings)) {
    return node.metadata.findings;
  }

  // Check provenance remediations
  const remediations: ProvenanceRemediation[] = [];
  if (Array.isArray(node.provenance?.remediations)) {
    remediations.push(...node.provenance.remediations);
  }
  if (Array.isArray(node.metadata?.provenance?.remediations)) {
    remediations.push(...node.metadata.provenance.remediations);
  }

  // Check custody records
  const custodyList = [
    ...(Array.isArray(node.provenance?.custody)
      ? node.provenance.custody
      : [node.provenance?.custody]),
    ...(Array.isArray(node.provenance?.chainOfCustody)
      ? node.provenance.chainOfCustody
      : [node.provenance?.chainOfCustody]),
    ...(Array.isArray(node.metadata?.chainOfCustody)
      ? node.metadata.chainOfCustody
      : [node.metadata?.chainOfCustody]),
  ];

  for (const c of custodyList) {
    if (c && Array.isArray(c.findings)) {
      for (const f of c.findings) {
        if ("observation" in f && typeof f.observation === "string") {
          return c.findings as FindingDetail[];
        }
      }
    }
    if (c && Array.isArray(c.remediations)) {
      remediations.push(...c.remediations);
    }
  }

  if (remediations.length > 0) {
    return remediations.map((rem, idx) => {
      const severityStr =
        typeof rem.severity === "string" ? rem.severity.toLowerCase() : "suggestion";
      const validSeverity: "critical" | "important" | "suggestion" =
        severityStr === "critical" || severityStr === "important" ? severityStr : "suggestion";
      const statusStr =
        typeof rem.status === "string" && rem.status.toLowerCase() === "resolved"
          ? "resolved"
          : "open";

      let proofObj: { method: string; evidence: string[] } | undefined;
      if (rem.proof && typeof rem.proof === "object" && "method" in rem.proof) {
        const p = rem.proof as { method?: string; evidence?: unknown };
        proofObj = {
          method: p.method ?? "audit",
          evidence: Array.isArray(p.evidence) ? p.evidence.map(String) : [String(p.evidence ?? "")],
        };
      }

      return {
        id: rem.findingId ?? rem.id ?? `rem-${node.id}-${idx}`,
        requirementId: rem.findingId ?? `req-${idx}`,
        severity: validSeverity,
        observation: rem.observation ?? "Audit finding identified during evaluation",
        remediation: rem.remediation,
        status: statusStr,
        revalidationProof: proofObj,
      };
    });
  }

  return [];
}

export function getEdgeTraffic(edge: GraphEdgeData | null | undefined): {
  volume: number;
  tokens: number;
  bytes: number;
  messagesCount: number;
  exchangesCount: number;
} {
  if (!edge) {
    return { volume: 0, tokens: 0, bytes: 0, messagesCount: 0, exchangesCount: 0 };
  }
  const traffic = edge.traffic;
  const exchanges = edge.exchanges ?? traffic?.exchanges ?? [];
  const exchangesCount = Array.isArray(exchanges) ? exchanges.length : 0;
  const safeNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  const volume = safeNum(traffic?.volume ?? edge.trafficVolume ?? exchangesCount);
  const tokens = safeNum(traffic?.tokens ?? edge.tokens);
  const bytes = safeNum(traffic?.bytes);
  const messagesCount = safeNum(traffic?.messagesCount ?? exchangesCount);

  return { volume, tokens, bytes, messagesCount, exchangesCount };
}

// ============================================================================
// Sub-entity Diff Comparison Engines
// ============================================================================

export function comparePorts(
  portsBase: IoPort[] | undefined,
  portsComp: IoPort[] | undefined,
): PortChange[] {
  const result: PortChange[] = [];
  const baseMap = new Map<string, IoPort>();
  const compMap = new Map<string, IoPort>();

  for (const p of Array.isArray(portsBase) ? portsBase : []) {
    if (p && p.label) {
      const key = `${p.label}::${p.kind}::${p.node ?? ""}`;
      baseMap.set(key, p);
    }
  }
  for (const p of Array.isArray(portsComp) ? portsComp : []) {
    if (p && p.label) {
      const key = `${p.label}::${p.kind}::${p.node ?? ""}`;
      compMap.set(key, p);
    }
  }

  for (const [key, basePort] of baseMap.entries()) {
    const compPort = compMap.get(key);
    if (!compPort) {
      result.push({
        portId: basePort.node,
        label: basePort.label,
        kind: basePort.kind,
        tokens: basePort.tokens,
        status: "removed",
      });
    } else {
      const isMod = basePort.tokens !== compPort.tokens || basePort.preview !== compPort.preview;
      result.push({
        portId: compPort.node,
        label: compPort.label,
        kind: compPort.kind,
        tokens: compPort.tokens,
        status: isMod ? "modified" : "unchanged",
      });
    }
  }

  for (const [key, compPort] of compMap.entries()) {
    if (!baseMap.has(key)) {
      result.push({
        portId: compPort.node,
        label: compPort.label,
        kind: compPort.kind,
        tokens: compPort.tokens,
        status: "added",
      });
    }
  }

  return result;
}

export function compareTools(
  toolsBase: NodeTool[] | undefined,
  toolsComp: NodeTool[] | undefined,
): ToolChange[] {
  const result: ToolChange[] = [];
  const baseMap = new Map<string, NodeTool>();
  const compMap = new Map<string, NodeTool>();

  for (const t of Array.isArray(toolsBase) ? toolsBase : []) {
    if (t && t.name) baseMap.set(t.name, t);
  }
  for (const t of Array.isArray(toolsComp) ? toolsComp : []) {
    if (t && t.name) compMap.set(t.name, t);
  }

  for (const [name, baseTool] of baseMap.entries()) {
    const compTool = compMap.get(name);
    if (!compTool) {
      result.push({ name, type: baseTool.type, status: "removed" });
    } else {
      const isMod = baseTool.type !== compTool.type;
      result.push({ name, type: compTool.type, status: isMod ? "modified" : "unchanged" });
    }
  }

  for (const [name, compTool] of compMap.entries()) {
    if (!baseMap.has(name)) {
      result.push({ name, type: compTool.type, status: "added" });
    }
  }

  return result;
}

export function compareFiles(
  filesBase: FileRef[] | undefined,
  filesComp: FileRef[] | undefined,
): FileChange[] {
  const result: FileChange[] = [];
  const baseMap = new Map<string, FileRef>();
  const compMap = new Map<string, FileRef>();

  for (const f of Array.isArray(filesBase) ? filesBase : []) {
    if (f && f.path) baseMap.set(f.path, f);
  }
  for (const f of Array.isArray(filesComp) ? filesComp : []) {
    if (f && f.path) compMap.set(f.path, f);
  }

  for (const [path, baseFile] of baseMap.entries()) {
    const compFile = compMap.get(path);
    if (!compFile) {
      result.push({
        path,
        mode: baseFile.mode,
        status: "removed",
        additionsDelta: -(baseFile.additions ?? 0),
        deletionsDelta: -(baseFile.deletions ?? 0),
      });
    } else {
      const isMod =
        baseFile.mode !== compFile.mode ||
        baseFile.additions !== compFile.additions ||
        baseFile.deletions !== compFile.deletions ||
        baseFile.diff !== compFile.diff;
      result.push({
        path,
        mode: compFile.mode,
        status: isMod ? "modified" : "unchanged",
        additionsDelta: (compFile.additions ?? 0) - (baseFile.additions ?? 0),
        deletionsDelta: (compFile.deletions ?? 0) - (baseFile.deletions ?? 0),
      });
    }
  }

  for (const [path, compFile] of compMap.entries()) {
    if (!baseMap.has(path)) {
      result.push({
        path,
        mode: compFile.mode,
        status: "added",
        additionsDelta: compFile.additions ?? 0,
        deletionsDelta: compFile.deletions ?? 0,
      });
    }
  }

  return result;
}

export function compareFindings(
  findingsBase: FindingDetail[],
  findingsComp: FindingDetail[],
  nodeId?: string,
): FindingDiff[] {
  const result: FindingDiff[] = [];
  const baseMap = new Map<string, FindingDetail>();
  const compMap = new Map<string, FindingDetail>();

  for (const f of Array.isArray(findingsBase) ? findingsBase : []) {
    if (f) {
      const key = f.id || f.requirementId || f.observation;
      if (key) baseMap.set(key, f);
    }
  }
  for (const f of Array.isArray(findingsComp) ? findingsComp : []) {
    if (f) {
      const key = f.id || f.requirementId || f.observation;
      if (key) compMap.set(key, f);
    }
  }

  for (const [key, baseF] of baseMap.entries()) {
    const compF = compMap.get(key);
    const baseStatus = baseF.status ?? "open";

    if (!compF) {
      result.push({
        id: baseF.id,
        requirementId: baseF.requirementId,
        severity: baseF.severity,
        observation: baseF.observation,
        remediation: baseF.remediation,
        status: "repaired",
        statusBase: baseStatus,
        statusComp: "resolved",
        nodeId,
        revalidationProof: baseF.revalidationProof,
      });
    } else {
      const compStatus = compF.status ?? "open";
      let status: FindingDiffStatus;

      if (baseStatus === "open" && compStatus === "resolved") {
        status = "repaired";
      } else if (baseStatus === "resolved" && compStatus === "open") {
        status = "regressed";
      } else if (baseStatus === "open" && compStatus === "open") {
        status = "persistent_open";
      } else {
        status = "persistent_resolved";
      }

      result.push({
        id: compF.id,
        requirementId: compF.requirementId ?? baseF.requirementId,
        severity: compF.severity,
        observation: compF.observation,
        remediation: compF.remediation ?? baseF.remediation,
        status,
        statusBase: baseStatus,
        statusComp: compStatus,
        nodeId,
        revalidationProof: compF.revalidationProof ?? baseF.revalidationProof,
      });
    }
  }

  for (const [key, compF] of compMap.entries()) {
    if (!baseMap.has(key)) {
      const compStatus = compF.status ?? "open";
      const status: FindingDiffStatus = compStatus === "resolved" ? "persistent_resolved" : "new";
      result.push({
        id: compF.id,
        requirementId: compF.requirementId,
        severity: compF.severity,
        observation: compF.observation,
        remediation: compF.remediation,
        status,
        statusBase: null,
        statusComp: compStatus,
        nodeId,
        revalidationProof: compF.revalidationProof,
      });
    }
  }

  return result;
}

// ============================================================================
// Node Property Comparison Engine
// ============================================================================

export function compareNodeProperties(
  base: GraphNodeData | null,
  comp: GraphNodeData | null,
): PropertyDiff[] {
  if (!base && !comp) return [];
  const diffs: PropertyDiff[] = [];

  // `read` covers the fields that live behind a reader rather than at the top of the node, so a
  // model comparison follows the same path the rest of the UI reads it through.
  const fieldsToCheck: Array<{
    key: string;
    label: string;
    read?: (node: GraphNodeData) => unknown;
  }> = [
    { key: "name", label: "Name" },
    { key: "kind", label: "Node Kind" },
    { key: "status", label: "Execution Status" },
    { key: "model", label: "Model", read: (node) => getNodeModel(node) ?? undefined },
    { key: "tier", label: "Model Tier", read: (node) => node.telemetry?.modelTier?.value },
    { key: "description", label: "Description" },
    { key: "group", label: "Group / Section" },
    { key: "rank", label: "Topological Rank" },
    { key: "step", label: "Step Number" },
    { key: "stepLabel", label: "Step Label" },
    { key: "prompt", label: "Prompt Template" },
    { key: "output", label: "Output Preview" },
  ];

  const readField = (node: GraphNodeData | null, field: (typeof fieldsToCheck)[number]) => {
    if (!node) return undefined;
    if (field.read) return field.read(node);
    return (node as unknown as Record<string, unknown>)[field.key];
  };

  for (const field of fieldsToCheck) {
    const valA = readField(base, field);
    const valB = readField(comp, field);
    const isDiff = !deepEqual(valA, valB);
    if (isDiff || (valA !== undefined && valB !== undefined)) {
      diffs.push({
        field: String(field.key),
        label: field.label,
        oldValue: valA,
        newValue: valB,
        isDifferent: isDiff,
      });
    }
  }

  return diffs;
}

export function compareEdgeProperties(
  base: GraphEdgeData | null,
  comp: GraphEdgeData | null,
): PropertyDiff[] {
  if (!base && !comp) return [];
  const diffs: PropertyDiff[] = [];

  const fieldsToCheck: Array<{ key: keyof GraphEdgeData; label: string }> = [
    { key: "source", label: "Source Node" },
    { key: "target", label: "Target Node" },
    { key: "kind", label: "Edge Kind" },
    { key: "label", label: "Label" },
    { key: "description", label: "Description" },
    { key: "condition", label: "Branch Condition" },
    { key: "weight", label: "Routing Weight" },
    { key: "isCycle", label: "Feedback Cycle" },
  ];

  for (const field of fieldsToCheck) {
    const valA = base ? base[field.key] : undefined;
    const valB = comp ? comp[field.key] : undefined;
    const isDiff = !deepEqual(valA, valB);
    if (isDiff || (valA !== undefined && valB !== undefined)) {
      diffs.push({
        field: String(field.key),
        label: field.label,
        oldValue: valA,
        newValue: valB,
        isDifferent: isDiff,
      });
    }
  }

  return diffs;
}

// ============================================================================
// Core Diff Calculation Engine
// ============================================================================

export function computeGraphDiff(
  baseDataset?: GraphDataset | null,
  compDataset?: GraphDataset | null,
  options?: GraphDiffOptions,
): GraphDiffResult {
  const hasBase = Boolean(
    baseDataset && (Array.isArray(baseDataset.nodes) || typeof baseDataset.id === "string"),
  );
  const hasComp = Boolean(
    compDataset && (Array.isArray(compDataset.nodes) || typeof compDataset.id === "string"),
  );
  const hasDatasets = hasBase || hasComp;

  const baseTitle = baseDataset?.title ?? baseDataset?.id ?? "Baseline Run";
  const compTitle = compDataset?.title ?? compDataset?.id ?? "Comparison Run";
  const baseRunId = options?.baseRunId ?? baseDataset?.id ?? null;
  const compRunId = options?.compRunId ?? compDataset?.id ?? null;

  if (!hasDatasets) {
    const emptyDelta = calculateMetricDelta(0, 0);
    const emptySummary: GraphMetricSummary = {
      totalDurationMs: emptyDelta,
      totalTokens: emptyDelta,
      totalPromptTokens: emptyDelta,
      totalCompletionTokens: emptyDelta,
      totalReasoningTokens: emptyDelta,
      totalCostUsd: emptyDelta,
      gateCount: emptyDelta,
      repairRoundsCount: emptyDelta,
      findingsCount: emptyDelta,
      resolvedFindingsCount: emptyDelta,
      unresolvedFindingsCount: emptyDelta,
      nodeCount: emptyDelta,
      edgeCount: emptyDelta,
    };
    const emptyCounts: GraphDiffCounts = {
      nodes: { added: 0, removed: 0, modified: 0, unchanged: 0, total: 0 },
      edges: { added: 0, removed: 0, modified: 0, unchanged: 0, total: 0 },
      findings: {
        repaired: 0,
        new: 0,
        regressed: 0,
        persistentOpen: 0,
        persistentResolved: 0,
        total: 0,
      },
      orphans: { baseNodes: 0, compNodes: 0, baseEdges: 0, compEdges: 0 },
      cycles: { baseEdges: 0, compEdges: 0 },
    };

    return {
      hasDatasets: false,
      isIdentical: false,
      baseRunId,
      compRunId,
      baseTitle,
      compTitle,
      nodeDiffs: [],
      edgeDiffs: [],
      nodeDiffMap: {},
      edgeDiffMap: {},
      counts: emptyCounts,
      metrics: emptySummary,
      topologyChanged: false,
      executionMetricsChanged: false,
      findingsChanged: false,
      computedAt: new Date().toISOString(),
    };
  }

  // Sanitize node and edge inputs
  const rawBaseNodes = Array.isArray(baseDataset?.nodes) ? baseDataset.nodes : [];
  const rawCompNodes = Array.isArray(compDataset?.nodes) ? compDataset.nodes : [];
  const rawBaseEdges = Array.isArray(baseDataset?.edges) ? baseDataset.edges : [];
  const rawCompEdges = Array.isArray(compDataset?.edges) ? compDataset.edges : [];

  const baseNodes = rawBaseNodes.map((n, i) => sanitizeNode(n, i));
  const compNodes = rawCompNodes.map((n, i) => sanitizeNode(n, i));
  const baseEdges = rawBaseEdges.map((e, i) => sanitizeEdge(e, i));
  const compEdges = rawCompEdges.map((e, i) => sanitizeEdge(e, i));

  // Topology Analysis
  const baseNodeIds = new Set(baseNodes.map((n) => n.id));
  const compNodeIds = new Set(compNodes.map((n) => n.id));

  const baseCycles = detectCycles(Array.from(baseNodeIds), baseEdges);
  const compCycles = detectCycles(Array.from(compNodeIds), compEdges);

  const baseOrphans = detectOrphanedNodes(baseNodes, baseEdges);
  const compOrphans = detectOrphanedNodes(compNodes, compEdges);

  const baseDangling = detectDanglingEdges(baseEdges, baseNodeIds);
  const compDangling = detectDanglingEdges(compEdges, compNodeIds);

  const baseNodeMap = new Map<string, GraphNodeData>();
  const compNodeMap = new Map<string, GraphNodeData>();
  for (const n of baseNodes) baseNodeMap.set(n.id, n);
  for (const n of compNodes) compNodeMap.set(n.id, n);

  const baseEdgeMap = new Map<string, GraphEdgeData>();
  const compEdgeMap = new Map<string, GraphEdgeData>();
  for (const e of baseEdges) baseEdgeMap.set(e.id, e);
  for (const e of compEdges) compEdgeMap.set(e.id, e);

  const allNodeIds = Array.from(new Set([...baseNodeMap.keys(), ...compNodeMap.keys()]));
  const allEdgeIds = Array.from(new Set([...baseEdgeMap.keys(), ...compEdgeMap.keys()]));

  const toleranceMs = options?.toleranceMs ?? 0;
  const toleranceTokens = options?.toleranceTokens ?? 0;

  // Node diff computation
  const nodeDiffs: NodeDiff[] = [];
  const nodeDiffMap: Record<string, NodeDiff> = {};

  let nodesAddedCount = 0;
  let nodesRemovedCount = 0;
  let nodesModifiedCount = 0;
  let nodesUnchangedCount = 0;

  let totalBaseDuration = 0;
  let totalCompDuration = 0;
  let totalBaseTokens = 0;
  let totalCompTokens = 0;
  let totalBasePromptTokens = 0;
  let totalCompPromptTokens = 0;
  let totalBaseCompletionTokens = 0;
  let totalCompCompletionTokens = 0;
  let totalBaseReasoningTokens = 0;
  let totalCompReasoningTokens = 0;
  let totalBaseCost = 0;
  let totalCompCost = 0;
  let totalBaseRepairRounds = 0;
  let totalCompRepairRounds = 0;
  let totalBaseGates = 0;
  let totalCompGates = 0;

  const allFindingsDiffs: FindingDiff[] = [];

  for (const id of allNodeIds) {
    const baseNode = baseNodeMap.get(id) ?? null;
    const compNode = compNodeMap.get(id) ?? null;

    const name = compNode?.name ?? baseNode?.name ?? id;
    const kindBase = baseNode?.kind ?? null;
    const kindComp = compNode?.kind ?? null;
    const nodeStatusBase = baseNode?.status ?? null;
    const nodeStatusComp = compNode?.status ?? null;
    const modelBase = getNodeModel(baseNode);
    const modelComp = getNodeModel(compNode);

    const durA = getNodeDurationMs(baseNode);
    const durB = getNodeDurationMs(compNode);
    const tokensA = getNodeTokensBreakdown(baseNode);
    const tokensB = getNodeTokensBreakdown(compNode);
    const costA = getNodeCostUsd(baseNode);
    const costB = getNodeCostUsd(compNode);
    const repairA = getNodeRepairRounds(baseNode);
    const repairB = getNodeRepairRounds(compNode);
    const retriesA = getNodeRetries(baseNode);
    const retriesB = getNodeRetries(compNode);

    if (baseNode) {
      totalBaseDuration += durA;
      totalBaseTokens += tokensA.total;
      totalBasePromptTokens += tokensA.prompt;
      totalBaseCompletionTokens += tokensA.completion;
      totalBaseReasoningTokens += tokensA.reasoning;
      totalBaseCost += costA;
      totalBaseRepairRounds += repairA;
      if (
        baseNode.kind === "gate" ||
        (baseNode.name && baseNode.name.toLowerCase().includes("gate"))
      ) {
        totalBaseGates++;
      }
    }
    if (compNode) {
      totalCompDuration += durB;
      totalCompTokens += tokensB.total;
      totalCompPromptTokens += tokensB.prompt;
      totalCompCompletionTokens += tokensB.completion;
      totalCompReasoningTokens += tokensB.reasoning;
      totalCompCost += costB;
      totalCompRepairRounds += repairB;
      if (
        compNode.kind === "gate" ||
        (compNode.name && compNode.name.toLowerCase().includes("gate"))
      ) {
        totalCompGates++;
      }
    }

    const durationDelta = calculateMetricDelta(durA, durB);
    const tokensTotalDelta = calculateMetricDelta(tokensA.total, tokensB.total);
    const tokensInDelta = calculateMetricDelta(tokensA.in, tokensB.in);
    const tokensOutDelta = calculateMetricDelta(tokensA.out, tokensB.out);
    const promptTokensDelta = calculateMetricDelta(tokensA.prompt, tokensB.prompt);
    const completionTokensDelta = calculateMetricDelta(tokensA.completion, tokensB.completion);
    const reasoningTokensDelta = calculateMetricDelta(tokensA.reasoning, tokensB.reasoning);
    const cacheReadTokensDelta = calculateMetricDelta(tokensA.cacheRead, tokensB.cacheRead);
    const cacheCreationTokensDelta = calculateMetricDelta(
      tokensA.cacheCreation,
      tokensB.cacheCreation,
    );
    const costDelta = calculateMetricDelta(costA, costB, 4);
    const retriesDelta = calculateMetricDelta(retriesA, retriesB, 0);
    const repairRoundsDelta = calculateMetricDelta(repairA, repairB, 0);

    const nodeMetrics: NodeMetricDiff = {
      durationMs: durationDelta,
      tokensIn: tokensInDelta,
      tokensOut: tokensOutDelta,
      tokensTotal: tokensTotalDelta,
      promptTokens: promptTokensDelta,
      completionTokens: completionTokensDelta,
      reasoningTokens: reasoningTokensDelta,
      cacheReadTokens: cacheReadTokensDelta,
      cacheCreationTokens: cacheCreationTokensDelta,
      costUsd: costDelta,
      retries: retriesDelta,
      repairRounds: repairRoundsDelta,
    };

    const propChanges = compareNodeProperties(baseNode, compNode);
    const inputPortChanges = comparePorts(baseNode?.io?.inputs, compNode?.io?.inputs);
    const outputPortChanges = comparePorts(baseNode?.io?.outputs, compNode?.io?.outputs);
    const toolChanges = compareTools(baseNode?.tools, compNode?.tools);
    const fileChanges = compareFiles(baseNode?.files, compNode?.files);

    const findingsBase = getNodeFindings(baseNode);
    const findingsComp = getNodeFindings(compNode);
    const findingsDiff = compareFindings(findingsBase, findingsComp, id);
    allFindingsDiffs.push(...findingsDiff);

    let status: DiffStatus;
    let isStructuralChange = false;
    let isExecutionChange = false;
    let hasMetricChanges = false;

    if (!baseNode && compNode) {
      status = "added";
      isStructuralChange = true;
      isExecutionChange = true;
      nodesAddedCount++;
    } else if (baseNode && !compNode) {
      status = "removed";
      isStructuralChange = true;
      isExecutionChange = true;
      nodesRemovedCount++;
    } else {
      const hasPropDiff = propChanges.some((p) => p.isDifferent);
      const hasPortDiff =
        inputPortChanges.some((p) => p.status !== "unchanged") ||
        outputPortChanges.some((p) => p.status !== "unchanged");
      const hasToolDiff = toolChanges.some((t) => t.status !== "unchanged");
      const hasFileDiff = fileChanges.some((f) => f.status !== "unchanged");
      const hasFindingDiff = findingsDiff.some(
        (f) => f.status !== "persistent_resolved" && f.status !== "persistent_open",
      );

      const durDiff = Math.abs(durB - durA) > toleranceMs;
      const tokDiff = Math.abs(tokensB.total - tokensA.total) > toleranceTokens;
      const statusDiff = nodeStatusBase !== nodeStatusComp;
      const repairDiff = repairA !== repairB;

      hasMetricChanges = durDiff || tokDiff || costA !== costB || repairDiff;

      if (
        hasPropDiff ||
        hasPortDiff ||
        hasToolDiff ||
        hasFileDiff ||
        hasFindingDiff ||
        statusDiff ||
        hasMetricChanges
      ) {
        status = "modified";
        nodesModifiedCount++;
        if (hasPortDiff || kindBase !== kindComp) {
          isStructuralChange = true;
        }
        if (statusDiff || durDiff || tokDiff || repairDiff || hasFindingDiff) {
          isExecutionChange = true;
        }
      } else {
        status = "unchanged";
        nodesUnchangedCount++;
      }
    }

    const nodeDiffObj: NodeDiff = {
      id,
      name,
      status,
      baseNode,
      compNode,
      kindBase,
      kindComp,
      nodeStatusBase,
      nodeStatusComp,
      modelBase,
      modelComp,
      metrics: nodeMetrics,
      propertyChanges: propChanges,
      inputPortChanges,
      outputPortChanges,
      toolChanges,
      fileChanges,
      findingsDiff,
      isStructuralChange,
      isExecutionChange,
      hasMetricChanges,
      isOrphanedBase: baseOrphans.has(id),
      isOrphanedComp: compOrphans.has(id),
      isInCycleBase: baseCycles.cyclicNodeIds.has(id),
      isInCycleComp: compCycles.cyclicNodeIds.has(id),
    };

    nodeDiffs.push(nodeDiffObj);
    nodeDiffMap[id] = nodeDiffObj;
  }

  // Edge diff computation
  const edgeDiffs: EdgeDiff[] = [];
  const edgeDiffMap: Record<string, EdgeDiff> = {};

  let edgesAddedCount = 0;
  let edgesRemovedCount = 0;
  let edgesModifiedCount = 0;
  let edgesUnchangedCount = 0;

  for (const id of allEdgeIds) {
    const baseEdge = baseEdgeMap.get(id) ?? null;
    const compEdge = compEdgeMap.get(id) ?? null;

    const source = compEdge?.source ?? baseEdge?.source ?? "";
    const target = compEdge?.target ?? baseEdge?.target ?? "";
    const kindBase = baseEdge?.kind ?? null;
    const kindComp = compEdge?.kind ?? null;
    const labelBase = baseEdge?.label ?? null;
    const labelComp = compEdge?.label ?? null;
    const conditionBase = baseEdge?.condition ?? null;
    const conditionComp = compEdge?.condition ?? null;
    const weightBase = typeof baseEdge?.weight === "number" ? baseEdge.weight : null;
    const weightComp = typeof compEdge?.weight === "number" ? compEdge.weight : null;

    const trafficA = getEdgeTraffic(baseEdge);
    const trafficB = getEdgeTraffic(compEdge);

    const trafficDelta: EdgeTrafficDelta = {
      volume: calculateMetricDelta(trafficA.volume, trafficB.volume),
      tokens: calculateMetricDelta(trafficA.tokens, trafficB.tokens),
      bytes: calculateMetricDelta(trafficA.bytes, trafficB.bytes),
      messagesCount: calculateMetricDelta(trafficA.messagesCount, trafficB.messagesCount),
      exchangesCount: calculateMetricDelta(trafficA.exchangesCount, trafficB.exchangesCount),
    };

    const propChanges = compareEdgeProperties(baseEdge, compEdge);
    let status: DiffStatus;
    let isStructuralChange = false;
    const hasTrafficChanges =
      trafficDelta.volume.delta !== 0 ||
      trafficDelta.tokens.delta !== 0 ||
      trafficDelta.exchangesCount.delta !== 0;

    if (!baseEdge && compEdge) {
      status = "added";
      isStructuralChange = true;
      edgesAddedCount++;
    } else if (baseEdge && !compEdge) {
      status = "removed";
      isStructuralChange = true;
      edgesRemovedCount++;
    } else {
      const hasPropDiff = propChanges.some((p) => p.isDifferent);
      if (
        hasPropDiff ||
        hasTrafficChanges ||
        source !== baseEdge?.source ||
        target !== baseEdge?.target
      ) {
        status = "modified";
        edgesModifiedCount++;
        if (source !== baseEdge?.source || target !== baseEdge?.target || kindBase !== kindComp) {
          isStructuralChange = true;
        }
      } else {
        status = "unchanged";
        edgesUnchangedCount++;
      }
    }

    const edgeDiffObj: EdgeDiff = {
      id,
      source,
      target,
      status,
      baseEdge,
      compEdge,
      kindBase,
      kindComp,
      labelBase,
      labelComp,
      conditionBase,
      conditionComp,
      weightBase,
      weightComp,
      traffic: trafficDelta,
      propertyChanges: propChanges,
      isStructuralChange,
      hasTrafficChanges,
      isDanglingBase: baseDangling.has(id),
      isDanglingComp: compDangling.has(id),
      isCycleBase: Boolean(baseEdge?.isCycle || baseCycles.cyclicEdgeIds.has(id)),
      isCycleComp: Boolean(compEdge?.isCycle || compCycles.cyclicEdgeIds.has(id)),
    };

    edgeDiffs.push(edgeDiffObj);
    edgeDiffMap[id] = edgeDiffObj;
  }

  // Findings summary aggregation
  let findingsRepaired = 0;
  let findingsNew = 0;
  let findingsRegressed = 0;
  let findingsPersistentOpen = 0;
  let findingsPersistentResolved = 0;

  for (const f of allFindingsDiffs) {
    if (f.status === "repaired") findingsRepaired++;
    else if (f.status === "new") findingsNew++;
    else if (f.status === "regressed") findingsRegressed++;
    else if (f.status === "persistent_open") findingsPersistentOpen++;
    else if (f.status === "persistent_resolved") findingsPersistentResolved++;
  }

  const baseFindingsCount = findingsRepaired + findingsPersistentOpen + findingsPersistentResolved;
  const compFindingsCount =
    findingsNew + findingsRegressed + findingsPersistentOpen + findingsPersistentResolved;
  const baseResolved = findingsPersistentResolved;
  const compResolved = findingsRepaired + findingsPersistentResolved;
  const baseUnresolved = findingsRepaired + findingsPersistentOpen;
  const compUnresolved = findingsNew + findingsRegressed + findingsPersistentOpen;

  const counts: GraphDiffCounts = {
    nodes: {
      added: nodesAddedCount,
      removed: nodesRemovedCount,
      modified: nodesModifiedCount,
      unchanged: nodesUnchangedCount,
      total: allNodeIds.length,
    },
    edges: {
      added: edgesAddedCount,
      removed: edgesRemovedCount,
      modified: edgesModifiedCount,
      unchanged: edgesUnchangedCount,
      total: allEdgeIds.length,
    },
    findings: {
      repaired: findingsRepaired,
      new: findingsNew,
      regressed: findingsRegressed,
      persistentOpen: findingsPersistentOpen,
      persistentResolved: findingsPersistentResolved,
      total: allFindingsDiffs.length,
    },
    orphans: {
      baseNodes: baseOrphans.size,
      compNodes: compOrphans.size,
      baseEdges: baseDangling.size,
      compEdges: compDangling.size,
    },
    cycles: {
      baseEdges: baseCycles.cyclicEdgeIds.size,
      compEdges: compCycles.cyclicEdgeIds.size,
    },
  };

  const metrics: GraphMetricSummary = {
    totalDurationMs: calculateMetricDelta(totalBaseDuration, totalCompDuration),
    totalTokens: calculateMetricDelta(totalBaseTokens, totalCompTokens),
    totalPromptTokens: calculateMetricDelta(totalBasePromptTokens, totalCompPromptTokens),
    totalCompletionTokens: calculateMetricDelta(
      totalBaseCompletionTokens,
      totalCompCompletionTokens,
    ),
    totalReasoningTokens: calculateMetricDelta(totalBaseReasoningTokens, totalCompReasoningTokens),
    totalCostUsd: calculateMetricDelta(totalBaseCost, totalCompCost, 4),
    gateCount: calculateMetricDelta(totalBaseGates, totalCompGates, 0),
    repairRoundsCount: calculateMetricDelta(totalBaseRepairRounds, totalCompRepairRounds, 0),
    findingsCount: calculateMetricDelta(baseFindingsCount, compFindingsCount, 0),
    resolvedFindingsCount: calculateMetricDelta(baseResolved, compResolved, 0),
    unresolvedFindingsCount: calculateMetricDelta(baseUnresolved, compUnresolved, 0),
    nodeCount: calculateMetricDelta(baseNodes.length, compNodes.length, 0),
    edgeCount: calculateMetricDelta(baseEdges.length, compEdges.length, 0),
  };

  const topologyChanged =
    nodesAddedCount > 0 || nodesRemovedCount > 0 || edgesAddedCount > 0 || edgesRemovedCount > 0;
  const executionMetricsChanged =
    nodesModifiedCount > 0 ||
    edgesModifiedCount > 0 ||
    metrics.totalDurationMs.delta !== 0 ||
    metrics.totalTokens.delta !== 0;
  const findingsChanged = findingsRepaired > 0 || findingsNew > 0 || findingsRegressed > 0;
  const isIdentical =
    !topologyChanged && nodesModifiedCount === 0 && edgesModifiedCount === 0 && !findingsChanged;

  return {
    hasDatasets: true,
    isIdentical,
    baseRunId,
    compRunId,
    baseTitle,
    compTitle,
    nodeDiffs,
    edgeDiffs,
    nodeDiffMap,
    edgeDiffMap,
    counts,
    metrics,
    topologyChanged,
    executionMetricsChanged,
    findingsChanged,
    computedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Filtering Utilities
// ============================================================================

export function filterNodeDiffs(
  nodes: NodeDiff[],
  filter: DiffFilterMode,
  searchQuery?: string,
): NodeDiff[] {
  if (!Array.isArray(nodes)) return [];
  const query = searchQuery?.toLowerCase().trim() ?? "";

  return nodes.filter((node) => {
    switch (filter) {
      case "changes-only":
        if (node.status === "unchanged") return false;
        break;
      case "added-only":
        if (node.status !== "added") return false;
        break;
      case "removed-only":
        if (node.status !== "removed") return false;
        break;
      case "modified-only":
        if (node.status !== "modified") return false;
        break;
      case "unchanged-only":
        if (node.status !== "unchanged") return false;
        break;
      case "all":
      default:
        break;
    }

    if (!query) return true;

    if (node.id.toLowerCase().includes(query)) return true;
    if (node.name.toLowerCase().includes(query)) return true;
    if (node.kindBase?.toLowerCase().includes(query)) return true;
    if (node.kindComp?.toLowerCase().includes(query)) return true;
    if (node.modelBase?.toLowerCase().includes(query)) return true;
    if (node.modelComp?.toLowerCase().includes(query)) return true;
    if (node.nodeStatusBase?.toLowerCase().includes(query)) return true;
    if (node.nodeStatusComp?.toLowerCase().includes(query)) return true;

    for (const prop of node.propertyChanges) {
      if (prop.label.toLowerCase().includes(query) || prop.field.toLowerCase().includes(query)) {
        return true;
      }
      if (safeStringify(prop.oldValue).toLowerCase().includes(query)) return true;
      if (safeStringify(prop.newValue).toLowerCase().includes(query)) return true;
    }

    for (const tool of node.toolChanges) {
      if (tool.name.toLowerCase().includes(query)) return true;
    }

    for (const file of node.fileChanges) {
      if (file.path.toLowerCase().includes(query)) return true;
    }

    for (const f of node.findingsDiff) {
      if (f.observation.toLowerCase().includes(query)) return true;
      if (f.remediation?.toLowerCase().includes(query)) return true;
    }

    return false;
  });
}

export function filterEdgeDiffs(
  edges: EdgeDiff[],
  filter: DiffFilterMode,
  searchQuery?: string,
): EdgeDiff[] {
  if (!Array.isArray(edges)) return [];
  const query = searchQuery?.toLowerCase().trim() ?? "";

  return edges.filter((edge) => {
    switch (filter) {
      case "changes-only":
        if (edge.status === "unchanged") return false;
        break;
      case "added-only":
        if (edge.status !== "added") return false;
        break;
      case "removed-only":
        if (edge.status !== "removed") return false;
        break;
      case "modified-only":
        if (edge.status !== "modified") return false;
        break;
      case "unchanged-only":
        if (edge.status !== "unchanged") return false;
        break;
      case "all":
      default:
        break;
    }

    if (!query) return true;

    if (edge.id.toLowerCase().includes(query)) return true;
    if (edge.source.toLowerCase().includes(query)) return true;
    if (edge.target.toLowerCase().includes(query)) return true;
    if (edge.labelBase?.toLowerCase().includes(query)) return true;
    if (edge.labelComp?.toLowerCase().includes(query)) return true;
    if (edge.kindBase?.toLowerCase().includes(query)) return true;
    if (edge.kindComp?.toLowerCase().includes(query)) return true;
    if (edge.conditionBase?.toLowerCase().includes(query)) return true;
    if (edge.conditionComp?.toLowerCase().includes(query)) return true;

    return false;
  });
}
