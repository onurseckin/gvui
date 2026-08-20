import type {
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  PositionedEdge,
  PositionedNode,
} from "../../types/graphData";
import type { SlqAutocompleteContext, SlqAutocompleteItem, SlqFieldDefinition } from "./types";

/**
 * Standard predefined field definitions for GVUI canvas search.
 */
export const STANDARD_FIELDS: readonly SlqFieldDefinition[] = Object.freeze([
  {
    name: "status",
    aliases: ["state"],
    description: "Execution status of node or edge traffic",
    type: "enum",
    enumValues: [
      "success",
      "error",
      "running",
      "pending",
      "skipped",
      "cached",
      "warning",
      "failed",
    ],
    target: "both",
  },
  {
    name: "kind",
    aliases: ["type", "archetype"],
    description: "Archetype/kind of node or edge",
    type: "enum",
    enumValues: [
      "orchestrator",
      "agent",
      "gate",
      "tool",
      "critic",
      "router",
      "join",
      "terminal",
      "input",
      "sequence",
      "spawn",
      "dispatch",
      "data",
      "handoff",
      "dependency",
      "loop",
      "pushback",
      "validation",
      "signoff",
    ],
    target: "both",
  },
  {
    name: "model",
    aliases: ["llm", "harnessModel"],
    // No baked-in vendor names: the only models worth suggesting are the ones the loaded dataset
    // actually carries, which the dynamic pass below contributes.
    description: "LLM model powering the node agent",
    type: "string",
    target: "node",
  },
  {
    name: "tier",
    aliases: [],
    description: "Model tier sizing",
    type: "enum",
    enumValues: ["xs", "s", "m", "l"],
    target: "node",
  },
  {
    name: "effort",
    aliases: ["reasoningEffort", "thinking", "thinkingLevel"],
    description: "Model reasoning effort level",
    type: "enum",
    enumValues: ["high", "medium", "low", "off"],
    target: "node",
  },
  {
    name: "scope",
    aliases: ["write_scope", "writescope", "files", "file", "path"],
    description: "Write scope or touched file paths",
    type: "string",
    target: "node",
  },
  {
    name: "tool",
    aliases: ["tools"],
    description: "Attached tools invoked by the agent",
    type: "string",
    target: "node",
  },
  {
    name: "duration",
    aliases: ["durationMs", "time", "latency"],
    description: "Execution wall duration (e.g. >500ms, >2s, 100ms..2s)",
    type: "time",
    target: "both",
    unit: "ms",
  },
  {
    name: "tokens",
    aliases: ["totalTokens"],
    description: "Total token usage count (e.g. >10k, 1000..5000)",
    type: "number",
    target: "both",
  },
  {
    name: "cost",
    aliases: ["costUsd"],
    description: "Execution cost in USD (e.g. >0.01, <1.00)",
    type: "currency",
    target: "node",
    unit: "$",
  },
  {
    name: "retries",
    aliases: ["repairs", "repairRounds"],
    description: "Retry and repair attempt counts",
    type: "number",
    target: "node",
  },
  {
    name: "severity",
    aliases: [],
    description: "Finding or audit severity",
    type: "enum",
    enumValues: ["critical", "important", "suggestion"],
    target: "both",
  },
  {
    name: "id",
    aliases: [],
    description: "Unique node or edge ID",
    type: "string",
    target: "both",
  },
  {
    name: "label",
    aliases: ["name", "title"],
    description: "Display label or name of node/edge",
    type: "string",
    target: "both",
  },
  {
    name: "actor",
    aliases: ["actorId", "agent", "leaseAgent"],
    description: "Agent ID or actor leasing the task",
    type: "string",
    target: "node",
  },
  {
    name: "section",
    aliases: ["sectionId", "group"],
    description: "Canvas section or group identifier",
    type: "string",
    target: "node",
  },
]);

/**
 * Extracts unique dynamic values from the active graph dataset.
 */
export function extractDatasetDynamicValues(
  dataset?:
    | GraphDataset
    | {
        nodes: Array<PositionedNode | GraphNodeData>;
        edges?: Array<PositionedEdge | GraphEdgeData>;
      }
    | null,
): {
  models: string[];
  tools: string[];
  scopes: string[];
  actors: string[];
  sections: string[];
  nodeTypes: string[];
  edgeTypes: string[];
  statuses: string[];
} {
  const models = new Set<string>();
  const tools = new Set<string>();
  const scopes = new Set<string>();
  const actors = new Set<string>();
  const sections = new Set<string>();
  const nodeTypes = new Set<string>();
  const edgeTypes = new Set<string>();
  const statuses = new Set<string>();

  if (dataset?.nodes) {
    for (const node of dataset.nodes) {
      if (node.model) models.add(node.model);
      if (node.harnessModel) models.add(node.harnessModel);
      if (node.hostAgent?.model) models.add(node.hostAgent.model);

      if (node.tools) {
        for (const t of node.tools) {
          if (t.name) tools.add(t.name);
        }
      }

      if (node.metadata?.writeScope) {
        for (const s of node.metadata.writeScope) {
          if (s) scopes.add(s);
        }
      }
      if (node.files) {
        for (const f of node.files) {
          if (f.path) scopes.add(f.path);
        }
      }
      if (typeof node.context?.repoPath === "string") {
        scopes.add(node.context.repoPath);
      }

      if (node.metadata?.leaseAgent) actors.add(node.metadata.leaseAgent);
      if (node.hostAgent?.name) actors.add(node.hostAgent.name);
      if (node.metadata?.actorId) actors.add(node.metadata.actorId);

      if (node.sectionId) sections.add(node.sectionId);
      if (node.group) sections.add(node.group);

      if (node.kind) nodeTypes.add(node.kind);
      if (node.type) nodeTypes.add(node.type);

      if (node.status) statuses.add(node.status);
    }
  }

  if (dataset?.edges) {
    for (const edge of dataset.edges) {
      if (edge.kind) edgeTypes.add(edge.kind);
      if (edge.traffic?.status) statuses.add(edge.traffic.status);
    }
  }

  return {
    models: Array.from(models).sort(),
    tools: Array.from(tools).sort(),
    scopes: Array.from(scopes).sort(),
    actors: Array.from(actors).sort(),
    sections: Array.from(sections).sort(),
    nodeTypes: Array.from(nodeTypes).sort(),
    edgeTypes: Array.from(edgeTypes).sort(),
    statuses: Array.from(statuses).sort(),
  };
}

/**
 * Generates context-aware autocomplete suggestions for a given query and cursor position.
 */
export function getSlqAutocomplete(context: SlqAutocompleteContext): SlqAutocompleteItem[] {
  const { query, cursorPosition, dataset, customFields, customEnumValues } = context;
  const clampedCursor = Math.max(0, Math.min(cursorPosition, query.length));
  const queryUpToCursor = query.slice(0, clampedCursor);

  const dynamicValues = extractDatasetDynamicValues(dataset);

  // 1. Detect if cursor is immediately after a field comparator: e.g. "status:", "kind=", "duration>"
  const fieldPredicateMatch = /([a-zA-Z0-9_\.\-]+)(?:[:=><~]|!=|>=|<=|~=)\s*([^\s()]*)$/.exec(
    queryUpToCursor,
  );

  if (fieldPredicateMatch) {
    const rawFieldName = fieldPredicateMatch[1];
    const partialVal = fieldPredicateMatch[2] ?? "";
    const matchStart = queryUpToCursor.length - partialVal.length;
    const matchEnd = clampedCursor;

    const normalizedField = rawFieldName.toLowerCase().replace(/[-_]/g, "");
    const fieldDef = STANDARD_FIELDS.find(
      (f) =>
        f.name.toLowerCase() === normalizedField ||
        f.aliases.some((a) => a.toLowerCase() === normalizedField),
    );

    const suggestions: SlqAutocompleteItem[] = [];

    // Gather candidate values
    const candidateValues: Array<{
      val: string;
      detail?: string;
      kind: import("./types").SlqAutocompleteKind;
    }> = [];

    // Check custom enum values first
    if (customEnumValues && rawFieldName in customEnumValues) {
      for (const val of customEnumValues[rawFieldName]) {
        candidateValues.push({ val, detail: `Custom value for ${rawFieldName}`, kind: "enum" });
      }
    }

    // Check standard enums
    if (fieldDef?.enumValues) {
      for (const val of fieldDef.enumValues) {
        candidateValues.push({ val, detail: `${fieldDef.name} enum`, kind: "enum" });
      }
    }

    // Add dynamic values from dataset
    if (normalizedField === "model" || normalizedField === "llm") {
      for (const m of dynamicValues.models) {
        if (!candidateValues.some((c) => c.val === m)) {
          candidateValues.push({ val: m, detail: "Model in dataset", kind: "value" });
        }
      }
    } else if (normalizedField === "tool" || normalizedField === "tools") {
      for (const t of dynamicValues.tools) {
        if (!candidateValues.some((c) => c.val === t)) {
          candidateValues.push({ val: t, detail: "Tool in dataset", kind: "value" });
        }
      }
    } else if (
      normalizedField === "scope" ||
      normalizedField === "writescope" ||
      normalizedField === "files"
    ) {
      for (const s of dynamicValues.scopes) {
        if (!candidateValues.some((c) => c.val === s)) {
          candidateValues.push({ val: s, detail: "File scope in dataset", kind: "scope" });
        }
      }
    } else if (
      normalizedField === "actor" ||
      normalizedField === "actorid" ||
      normalizedField === "agent"
    ) {
      for (const a of dynamicValues.actors) {
        if (!candidateValues.some((c) => c.val === a)) {
          candidateValues.push({ val: a, detail: "Actor in dataset", kind: "value" });
        }
      }
    } else if (normalizedField === "section" || normalizedField === "group") {
      for (const s of dynamicValues.sections) {
        if (!candidateValues.some((c) => c.val === s)) {
          candidateValues.push({ val: s, detail: "Section in dataset", kind: "value" });
        }
      }
    } else if (
      normalizedField === "duration" ||
      normalizedField === "durationms" ||
      normalizedField === "time"
    ) {
      candidateValues.push(
        { val: "500ms", detail: "500 milliseconds", kind: "value" },
        { val: "1s", detail: "1 second", kind: "value" },
        { val: "2s", detail: "2 seconds", kind: "value" },
        { val: "5s", detail: "5 seconds", kind: "value" },
        { val: "100ms..2s", detail: "Range 100ms to 2s", kind: "template" },
      );
    } else if (normalizedField === "tokens" || normalizedField === "totaltokens") {
      candidateValues.push(
        { val: "1000", detail: "1,000 tokens", kind: "value" },
        { val: "5k", detail: "5,000 tokens", kind: "value" },
        { val: "10k", detail: "10,000 tokens", kind: "value" },
        { val: "100k", detail: "100,000 tokens", kind: "value" },
        { val: "1000..5000", detail: "Range 1k to 5k", kind: "template" },
      );
    } else if (normalizedField === "cost" || normalizedField === "costusd") {
      candidateValues.push(
        { val: "0.01", detail: "$0.01", kind: "value" },
        { val: "0.05", detail: "$0.05", kind: "value" },
        { val: "0.10", detail: "$0.10", kind: "value" },
        { val: "1.00", detail: "$1.00", kind: "value" },
      );
    }

    // Filter by partial value
    const lowerPartial = partialVal.toLowerCase();
    for (const item of candidateValues) {
      const lowerVal = item.val.toLowerCase();
      if (!lowerPartial || lowerVal.includes(lowerPartial)) {
        // If value has spaces, wrap in quotes
        const insertText = item.val.includes(" ") ? `"${item.val}"` : item.val;
        const score = lowerVal.startsWith(lowerPartial) ? 100 : 50;
        suggestions.push({
          label: item.val,
          insertText,
          kind: item.kind,
          detail: item.detail,
          replacementRange: { start: matchStart, end: matchEnd },
          score,
        });
      }
    }

    if (suggestions.length > 0) {
      return suggestions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
  }

  // 2. Detect if cursor is typing a field prefix or at token start
  const lastWordMatch = /([a-zA-Z0-9_\.\-]+)$/.exec(queryUpToCursor);
  const partialWord = lastWordMatch ? lastWordMatch[1] : "";
  const wordStart = lastWordMatch ? queryUpToCursor.length - partialWord.length : clampedCursor;
  const lowerWord = partialWord.toLowerCase();

  const suggestions: SlqAutocompleteItem[] = [];

  // Suggest fields
  for (const field of STANDARD_FIELDS) {
    const lowerName = field.name.toLowerCase();
    if (
      !lowerWord ||
      lowerName.includes(lowerWord) ||
      field.aliases.some((a) => a.toLowerCase().includes(lowerWord))
    ) {
      const score = lowerName.startsWith(lowerWord) ? 90 : 40;
      suggestions.push({
        label: `${field.name}:`,
        insertText: `${field.name}:`,
        kind: "field",
        detail: field.description,
        documentation: `Type: ${field.type}${field.enumValues ? ` (${field.enumValues.join(", ")})` : ""}`,
        replacementRange: { start: wordStart, end: clampedCursor },
        score,
      });
    }
  }

  // Suggest custom fields
  if (customFields) {
    for (const custom of customFields) {
      const lowerCustom = custom.toLowerCase();
      if (!lowerWord || lowerCustom.includes(lowerWord)) {
        suggestions.push({
          label: `${custom}:`,
          insertText: `${custom}:`,
          kind: "field",
          detail: `Custom field: ${custom}`,
          replacementRange: { start: wordStart, end: clampedCursor },
          score: 85,
        });
      }
    }
  }

  // Suggest operators if preceded by a term or at top level
  const isAfterTerm = /\S+\s+$/.test(queryUpToCursor);
  if (isAfterTerm || !partialWord) {
    suggestions.push(
      {
        label: "AND",
        insertText: "AND ",
        kind: "operator",
        detail: "Logical conjunction",
        replacementRange: { start: wordStart, end: clampedCursor },
        score: 30,
      },
      {
        label: "OR",
        insertText: "OR ",
        kind: "operator",
        detail: "Logical disjunction",
        replacementRange: { start: wordStart, end: clampedCursor },
        score: 25,
      },
      {
        label: "NOT",
        insertText: "NOT ",
        kind: "operator",
        detail: "Logical negation",
        replacementRange: { start: wordStart, end: clampedCursor },
        score: 20,
      },
    );
  }

  // Suggest helpful starter query templates if query is empty or at root
  if (query.trim() === "" || (!partialWord && !isAfterTerm)) {
    suggestions.push(
      {
        label: "status:error",
        insertText: "status:error",
        kind: "template",
        detail: "Find all failed nodes and errors",
        replacementRange: { start: 0, end: query.length },
        score: 15,
      },
      {
        label: "status:running",
        insertText: "status:running",
        kind: "template",
        detail: "Find actively running nodes",
        replacementRange: { start: 0, end: query.length },
        score: 14,
      },
      {
        label: "kind:agent",
        insertText: "kind:agent",
        kind: "template",
        detail: "Filter to agent worker nodes",
        replacementRange: { start: 0, end: query.length },
        score: 13,
      },
      {
        label: "effort:high",
        insertText: "effort:high",
        kind: "template",
        detail: "Filter nodes with high reasoning effort",
        replacementRange: { start: 0, end: query.length },
        score: 12,
      },
      {
        label: "duration:>1s",
        insertText: "duration:>1s",
        kind: "template",
        detail: "Filter long-running nodes (> 1 second)",
        replacementRange: { start: 0, end: query.length },
        score: 11,
      },
      {
        label: "tokens:>10k",
        insertText: "tokens:>10k",
        kind: "template",
        detail: "Filter heavy token usage (> 10,000 tokens)",
        replacementRange: { start: 0, end: query.length },
        score: 10,
      },
    );
  }

  return suggestions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
