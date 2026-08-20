import type { GraphNodeData } from "../../types/graphData";

/**
 * Which node fields already have a purpose-built view, and therefore which ones fall through to the
 * generic layer. Keeping the list explicit is what stops an unfamiliar dataset from being silently
 * truncated to the fields this renderer happens to recognise.
 */

export interface GenericField {
  key: string;
  value: unknown;
}

const DEDICATED_NODE_KEYS: ReadonlySet<string> = new Set([
  "id",
  "name",
  "description",
  "kind",
  "status",
  "step",
  "stepLabel",
  "badge",
  "badges",
  "telemetry",
  "hostAgent",
  "sectionId",
  "tools",
  "scripts",
  "stateTransitions",
  "assets",
  "browserTests",
  "files",
  "metrics",
  "io",
  "prompt",
  "output",
  "logs",
  "context",
  "metadata",
  "provenance",
  "chainOfCustody",
  "timeline",
  "events",
]);

const DEDICATED_METADATA_KEYS: ReadonlySet<string> = new Set([
  "commands",
  "findings",
  "writeScope",
  "hostAgent",
  "role",
  "repairRounds",
  "repairAttempts",
  "durationMs",
  "tokens",
  "timing",
  "timingBreakdown",
  "provenance",
  "chainOfCustody",
  "timeline",
  "events",
  "leaseToken",
  "validatorLeaseToken",
  "actorId",
  "resolutionPath",
  "attempt",
  "round",
  "leaseAgent",
  "agentId",
  "branchId",
  "branchReason",
  "subTaskId",
  "subTaskStatus",
  "parentTaskId",
  "depth",
  "gate",
  "summary",
  "thinkingLevel",
  "reasoningEffort",
  "hostModel",
  "cognitiveTokens",
  "memoryMb",
  "memoryBytes",
  "memoryFootprint",
]);

function toFields(source: Record<string, unknown>, dedicated: ReadonlySet<string>): GenericField[] {
  const fields: GenericField[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (dedicated.has(key)) continue;
    fields.push({ key, value });
  }
  return fields.sort((a, b) => a.key.localeCompare(b.key));
}

export interface GenericNodeFields {
  own: GenericField[];
  metadata: GenericField[];
  total: number;
}

/** Everything this node carries that no dedicated view renders, in key order. */
export function collectGenericNodeFields(node: GraphNodeData): GenericNodeFields {
  const own = toFields(node as unknown as Record<string, unknown>, DEDICATED_NODE_KEYS);
  const metadata = node.metadata ? toFields(node.metadata, DEDICATED_METADATA_KEYS) : [];
  return { own, metadata, total: own.length + metadata.length };
}

/** How many nodes in a graph carry each field with no dedicated view, for the graph-level index. */
export function indexGenericFields(
  nodes: readonly GraphNodeData[],
): Array<{ key: string; scope: "node" | "metadata"; nodeCount: number; sample: unknown }> {
  const counts = new Map<
    string,
    { scope: "node" | "metadata"; nodeCount: number; sample: unknown }
  >();

  for (const node of nodes) {
    const fields = collectGenericNodeFields(node);
    for (const [scope, list] of [
      ["node", fields.own],
      ["metadata", fields.metadata],
    ] as const) {
      for (const field of list) {
        const key = `${scope}:${field.key}`;
        const entry = counts.get(key);
        if (entry === undefined) {
          counts.set(key, { scope, nodeCount: 1, sample: field.value });
        } else {
          entry.nodeCount += 1;
        }
      }
    }
  }

  return [...counts.entries()]
    .map(([key, entry]) => ({ key: key.slice(key.indexOf(":") + 1), ...entry }))
    .sort((a, b) => b.nodeCount - a.nodeCount || a.key.localeCompare(b.key));
}
