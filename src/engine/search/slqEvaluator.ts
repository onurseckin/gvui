import {
  describeNodeKind,
  describeNodeStatus,
  resolveNodeStatus,
} from "../../primitives/nodes/NodeCard/nodeKinds";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import type {
  SlqAstNode,
  SlqComparisonOp,
  SlqEdgeMatchResult,
  SlqEvaluationOptions,
  SlqEvaluationResult,
  SlqFieldPredicateNode,
  SlqHighlightSpan,
  SlqNodeMatchResult,
  SlqPredicateValue,
  SlqTermNode,
} from "./types";

/**
 * Computes Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bn; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[an][bn];
}

/**
 * Calculates similarity ratio between two strings from 0.0 (completely different) to 1.0 (exact match).
 */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return 1.0 - dist / maxLen;
}

/**
 * Deep nested property resolution from an object.
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let curr: unknown = obj;

  for (const part of parts) {
    if (curr === null || typeof curr !== "object") return undefined;
    const record = curr as Record<string, unknown>;
    curr = record[part];
  }

  return curr;
}

/**
 * Resolves a field name from a PositionedNode.
 */
export function resolveNodeFieldValue(node: PositionedNode, fieldName: string): unknown {
  const normalized = fieldName.toLowerCase().replace(/[-_]/g, "");

  switch (normalized) {
    case "id":
      return node.id;
    case "name":
    case "label":
    case "title":
      return node.name;
    case "description":
    case "desc":
      return node.description;
    case "type":
    case "kind":
    case "archetype": {
      const desc = describeNodeKind(node);
      return [node.kind, node.type, desc.label].filter(Boolean);
    }
    case "status":
    case "state": {
      const st = resolveNodeStatus(node);
      const desc = describeNodeStatus(node);
      return [node.status, st, desc.label].filter(Boolean);
    }
    case "step":
    case "stepnumber":
    case "round":
      return node.step ?? node.metadata?.round;
    case "steplabel":
      return node.stepLabel;
    case "model":
    case "llm":
    case "harnessmodel":
      return [node.model, node.harnessModel, node.hostAgent?.model].filter(Boolean);
    case "tier":
      return [node.tier, node.hostAgent?.tier].filter(Boolean);
    case "effort":
    case "reasoningeffort":
    case "thinking":
    case "thinkinglevel":
      return [node.hostAgent?.reasoningEffort, node.hostAgent?.thinkingLevel].filter(Boolean);
    case "priority":
    case "rank":
      return node.rank ?? node.group;
    case "section":
    case "sectionid":
    case "group":
      return [node.sectionId, node.group].filter(Boolean);
    case "scope":
    case "writescope":
    case "write_scope":
    case "files":
    case "file":
    case "path": {
      const scopes: string[] = [];
      if (node.metadata?.writeScope) {
        scopes.push(...node.metadata.writeScope);
      }
      if (node.files) {
        scopes.push(...node.files.map((f) => f.path));
      }
      if (typeof node.context?.repoPath === "string") {
        scopes.push(node.context.repoPath);
      }
      return scopes;
    }
    case "tool":
    case "tools":
      return node.tools ? node.tools.map((t) => t.name) : [];
    case "badge":
    case "badges": {
      const badges: string[] = [];
      if (node.badge?.text) badges.push(node.badge.text);
      if (node.badges) badges.push(...node.badges.map((b) => b.label));
      return badges;
    }
    case "duration":
    case "durationms":
    case "time":
    case "latency":
      return (
        node.metrics?.durationMs ??
        node.metadata?.durationMs ??
        (node.metrics?.timing as { wallDurationMs?: number } | undefined)?.wallDurationMs ??
        (node.metrics?.timingBreakdown as { wallDurationMs?: number } | undefined)?.wallDurationMs
      );
    case "tokens":
    case "totaltokens":
    case "token": {
      if (node.metrics?.tokens?.totalTokens !== undefined) {
        return node.metrics.tokens.totalTokens;
      }
      const tin = node.metrics?.tokensIn ?? 0;
      const tout = node.metrics?.tokensOut ?? 0;
      return tin + tout > 0 ? tin + tout : undefined;
    }
    case "tokensin":
    case "prompttokens":
    case "inputtokens":
      return node.metrics?.tokensIn ?? node.metrics?.tokens?.promptTokens;
    case "tokensout":
    case "completiontokens":
    case "outputtokens":
      return node.metrics?.tokensOut ?? node.metrics?.tokens?.completionTokens;
    case "cost":
    case "costusd":
      return node.metrics?.costUsd;
    case "retries":
    case "repairs":
    case "repairrounds":
      return node.metrics?.retries ?? node.metrics?.repairRounds ?? node.metadata?.repairRounds;
    case "actor":
    case "actorid":
    case "agent":
    case "leaseagent":
      return [node.metadata?.leaseAgent, node.hostAgent?.name, node.metadata?.actorId].filter(
        Boolean,
      );
    case "severity": {
      const severities: string[] = [];
      if (node.metadata?.findings) {
        severities.push(...node.metadata.findings.map((f) => f.severity));
      }
      return severities;
    }
    case "finding":
    case "findings":
    case "observation":
    case "remediation": {
      const findingsList: string[] = [];
      if (node.metadata?.findings) {
        for (const f of node.metadata.findings) {
          if (f.observation) findingsList.push(f.observation);
          if (f.remediation) findingsList.push(f.remediation);
          if (f.id) findingsList.push(f.id);
        }
      }
      return findingsList;
    }
    case "prompt":
      return node.prompt;
    case "output":
      return node.output;
    case "logs":
    case "log":
      return node.logs;
    default: {
      const direct = getNestedValue(node, fieldName);
      if (direct !== undefined) return direct;
      if (node.metadata) {
        const fromMeta = getNestedValue(node.metadata, fieldName);
        if (fromMeta !== undefined) return fromMeta;
      }
      if (node.context) {
        const fromContext = getNestedValue(node.context, fieldName);
        if (fromContext !== undefined) return fromContext;
      }
      return undefined;
    }
  }
}

/**
 * Resolves a field name from a PositionedEdge.
 */
export function resolveEdgeFieldValue(edge: PositionedEdge, fieldName: string): unknown {
  const normalized = fieldName.toLowerCase().replace(/[-_]/g, "");

  switch (normalized) {
    case "id":
      return edge.id;
    case "source":
    case "from":
      return edge.source;
    case "target":
    case "to":
      return edge.target;
    case "label":
    case "title":
      return [edge.label, edge.container?.title].filter(Boolean);
    case "description":
    case "desc":
      return edge.description;
    case "kind":
    case "type":
      return [edge.kind, edge.container?.variant].filter(Boolean);
    case "condition":
      return edge.condition;
    case "status":
      return edge.traffic?.status;
    case "volume":
    case "traffic":
    case "trafficvolume":
      return edge.trafficVolume ?? edge.traffic?.volume;
    case "tokens":
      return edge.tokens ?? edge.traffic?.tokens;
    case "bytes":
      return edge.traffic?.bytes;
    case "severity": {
      const severities: string[] = [];
      if (edge.traffic?.exchanges) {
        for (const ex of edge.traffic.exchanges) {
          if (typeof ex.finding === "object" && ex.finding?.severity) {
            severities.push(ex.finding.severity);
          }
          if (typeof ex.auditFinding === "object" && ex.auditFinding?.severity) {
            severities.push(ex.auditFinding.severity);
          }
        }
      }
      return severities;
    }
    default: {
      const direct = getNestedValue(edge, fieldName);
      if (direct !== undefined) return direct;
      if (edge.traffic) {
        const fromTraffic = getNestedValue(edge.traffic, fieldName);
        if (fromTraffic !== undefined) return fromTraffic;
      }
      return undefined;
    }
  }
}

/**
 * Evaluates a single scalar or string value against a predicate value and operator.
 */
function evaluateSingleValue(
  targetVal: unknown,
  op: SlqComparisonOp,
  predVal: SlqPredicateValue,
  fieldName: string,
  options: SlqEvaluationOptions,
): { isMatch: boolean; highlights: SlqHighlightSpan[]; score: number } {
  if (targetVal === undefined || targetVal === null) {
    return { isMatch: false, highlights: [], score: 0 };
  }

  const caseSensitive = options.caseSensitive ?? false;
  const fuzzyThreshold = options.fuzzyThreshold ?? 0.75;

  // Numeric comparison
  if (typeof targetVal === "number") {
    if (predVal.type === "number" && predVal.numberVal !== undefined) {
      const expectedNum = predVal.numberVal;
      let matched = false;
      switch (op) {
        case "=":
        case "==":
        case ":":
          matched = targetVal === expectedNum;
          break;
        case "!=":
        case "<>":
          matched = targetVal !== expectedNum;
          break;
        case ">":
          matched = targetVal > expectedNum;
          break;
        case ">=":
          matched = targetVal >= expectedNum;
          break;
        case "<":
          matched = targetVal < expectedNum;
          break;
        case "<=":
          matched = targetVal <= expectedNum;
          break;
        default:
          matched = targetVal === expectedNum;
      }
      return {
        isMatch: matched,
        highlights: matched
          ? [
              {
                field: fieldName,
                start: 0,
                end: String(targetVal).length,
                matchedText: String(targetVal),
              },
            ]
          : [],
        score: matched ? 10 : 0,
      };
    }

    if (predVal.type === "range" && predVal.rangeVal) {
      const { min, max, minInclusive = true, maxInclusive = true } = predVal.rangeVal;
      let minPass = true;
      let maxPass = true;

      if (min !== undefined) {
        minPass = minInclusive ? targetVal >= min : targetVal > min;
      }
      if (max !== undefined) {
        maxPass = maxInclusive ? targetVal <= max : targetVal < max;
      }

      const matched = minPass && maxPass;
      return {
        isMatch: matched,
        highlights: matched
          ? [
              {
                field: fieldName,
                start: 0,
                end: String(targetVal).length,
                matchedText: String(targetVal),
              },
            ]
          : [],
        score: matched ? 10 : 0,
      };
    }

    if (predVal.type === "set" && predVal.setVal) {
      const matched = predVal.setVal.some((s) => Number.parseFloat(s) === targetVal);
      const isNegated = op === "!in" || op === "!=";
      const finalMatch = isNegated ? !matched : matched;
      return {
        isMatch: finalMatch,
        highlights: finalMatch
          ? [
              {
                field: fieldName,
                start: 0,
                end: String(targetVal).length,
                matchedText: String(targetVal),
              },
            ]
          : [],
        score: finalMatch ? 10 : 0,
      };
    }
  }

  // Boolean comparison
  if (typeof targetVal === "boolean") {
    if (predVal.type === "boolean" && predVal.boolVal !== undefined) {
      const matched = op === "!=" ? targetVal !== predVal.boolVal : targetVal === predVal.boolVal;
      return {
        isMatch: matched,
        highlights: matched
          ? [
              {
                field: fieldName,
                start: 0,
                end: String(targetVal).length,
                matchedText: String(targetVal),
              },
            ]
          : [],
        score: matched ? 10 : 0,
      };
    }
  }

  // String comparison
  const strTarget = String(targetVal);
  const compTarget = caseSensitive ? strTarget : strTarget.toLowerCase();

  // Regex predicate: type:/pattern/i
  if (predVal.type === "regex" && predVal.regexVal) {
    try {
      const flags =
        predVal.regexVal.flags.includes("i") || !caseSensitive
          ? predVal.regexVal.flags.includes("i")
            ? predVal.regexVal.flags
            : predVal.regexVal.flags + "i"
          : predVal.regexVal.flags;
      const re = new RegExp(predVal.regexVal.pattern, flags);
      const execRes = re.exec(strTarget);
      const matched = execRes !== null;
      const finalMatch = op === "!=" ? !matched : matched;

      const highlights: SlqHighlightSpan[] = [];
      if (finalMatch && execRes) {
        highlights.push({
          field: fieldName,
          start: execRes.index,
          end: execRes.index + execRes[0].length,
          matchedText: execRes[0],
        });
      }

      return {
        isMatch: finalMatch,
        highlights,
        score: finalMatch ? 10 : 0,
      };
    } catch {
      return { isMatch: false, highlights: [], score: 0 };
    }
  }

  // Set / In predicate: status:in(error, running)
  if (predVal.type === "set" && predVal.setVal) {
    const matched = predVal.setVal.some((item) => {
      const compItem = caseSensitive ? item : item.toLowerCase();
      return compTarget === compItem || compTarget.includes(compItem);
    });
    const finalMatch = op === "!in" || op === "!=" ? !matched : matched;
    return {
      isMatch: finalMatch,
      highlights: finalMatch
        ? [{ field: fieldName, start: 0, end: strTarget.length, matchedText: strTarget }]
        : [],
      score: finalMatch ? 10 : 0,
    };
  }

  // String value comparison: status:error, name="my node"
  const expectedStr =
    predVal.stringVal ?? (predVal.numberVal !== undefined ? String(predVal.numberVal) : "");
  const compExpected = caseSensitive ? expectedStr : expectedStr.toLowerCase();

  if (op === "=" || op === "==") {
    const matched = compTarget === compExpected;
    return {
      isMatch: matched,
      highlights: matched
        ? [{ field: fieldName, start: 0, end: strTarget.length, matchedText: strTarget }]
        : [],
      score: matched ? 10 : 0,
    };
  }

  if (op === "!=") {
    const matched = compTarget !== compExpected;
    return {
      isMatch: matched,
      highlights: [],
      score: matched ? 5 : 0,
    };
  }

  if (op === "~") {
    // Whole string similarity
    const wholeSim = stringSimilarity(compTarget, compExpected);
    if (wholeSim >= fuzzyThreshold) {
      return {
        isMatch: true,
        highlights: [{ field: fieldName, start: 0, end: strTarget.length, matchedText: strTarget }],
        score: Math.round(wholeSim * 10),
      };
    }

    // Word-level fuzzy similarity (split on whitespace and punctuation)
    const words = compTarget.split(/[\s\-_.,/]+/);
    let bestWordSim = 0;
    for (const word of words) {
      if (word.length > 0) {
        const wordSim = stringSimilarity(word, compExpected);
        if (wordSim > bestWordSim) {
          bestWordSim = wordSim;
        }
      }
    }

    if (bestWordSim >= fuzzyThreshold) {
      return {
        isMatch: true,
        highlights: [{ field: fieldName, start: 0, end: strTarget.length, matchedText: strTarget }],
        score: Math.round(bestWordSim * 10),
      };
    }

    return { isMatch: false, highlights: [], score: 0 };
  }

  // Default ':' contains match or exact match
  if (compTarget === compExpected) {
    return {
      isMatch: true,
      highlights: [{ field: fieldName, start: 0, end: strTarget.length, matchedText: strTarget }],
      score: 10,
    };
  }

  const idx = compTarget.indexOf(compExpected);
  if (idx !== -1) {
    return {
      isMatch: true,
      highlights: [
        {
          field: fieldName,
          start: idx,
          end: idx + compExpected.length,
          matchedText: strTarget.slice(idx, idx + compExpected.length),
        },
      ],
      score: 8,
    };
  }

  // Word-level fuzzy fallback if threshold met
  if (fuzzyThreshold < 1.0 && compExpected.length > 2) {
    const words = compTarget.split(/[\s\-_.,/]+/);
    for (const word of words) {
      if (word.length > 1) {
        const sim = stringSimilarity(word, compExpected);
        if (sim >= fuzzyThreshold) {
          return {
            isMatch: true,
            highlights: [
              { field: fieldName, start: 0, end: strTarget.length, matchedText: strTarget },
            ],
            score: Math.round(sim * 6),
          };
        }
      }
    }
  }

  return { isMatch: false, highlights: [], score: 0 };
}

/**
 * Matches a field predicate against a resolved value (which may be scalar, array, or undefined).
 */
export function matchFieldPredicate(
  resolved: unknown,
  predicate: SlqFieldPredicateNode,
  options: SlqEvaluationOptions,
): { isMatch: boolean; highlights: SlqHighlightSpan[]; score: number } {
  if (resolved === undefined || resolved === null) {
    return {
      isMatch: predicate.op === "!=" || predicate.op === "!in",
      highlights: [],
      score: 0,
    };
  }

  if (Array.isArray(resolved)) {
    // For inequality operators (!=, !in), we check if any element matches the POSITIVE condition.
    // If ANY element matches the positive value, the != condition fails (returns false).
    // If NO element matches the positive value, the != condition holds (returns true).
    if (predicate.op === "!=" || predicate.op === "!in") {
      const positiveOp: SlqComparisonOp = predicate.op === "!=" ? "=" : "in";
      const hasAnyPositiveMatch = resolved.some((item) => {
        const res = evaluateSingleValue(
          item,
          positiveOp,
          predicate.value,
          predicate.field,
          options,
        );
        return res.isMatch;
      });
      return {
        isMatch: !hasAnyPositiveMatch,
        highlights: [],
        score: !hasAnyPositiveMatch ? 5 : 0,
      };
    }

    let anyMatch = false;
    let totalScore = 0;
    const allHighlights: SlqHighlightSpan[] = [];

    for (const item of resolved) {
      const res = evaluateSingleValue(
        item,
        predicate.op,
        predicate.value,
        predicate.field,
        options,
      );
      if (res.isMatch) {
        anyMatch = true;
        totalScore += res.score;
        allHighlights.push(...res.highlights);
      }
    }

    return {
      isMatch: anyMatch,
      highlights: allHighlights,
      score: totalScore,
    };
  }

  return evaluateSingleValue(resolved, predicate.op, predicate.value, predicate.field, options);
}

/**
 * Evaluates a bare term against all searchable text fields of a node.
 */
function matchTermAgainstNode(
  node: PositionedNode,
  termNode: SlqTermNode,
  options: SlqEvaluationOptions,
): { isMatch: boolean; highlights: SlqHighlightSpan[]; score: number } {
  const searchableFields: Array<{ name: string; weight: number; value: unknown }> = [
    { name: "name", weight: 10, value: node.name },
    { name: "id", weight: 8, value: node.id },
    { name: "stepLabel", weight: 7, value: node.stepLabel },
    { name: "type", weight: 6, value: [node.kind, node.type, describeNodeKind(node).label] },
    {
      name: "status",
      weight: 6,
      value: [node.status, resolveNodeStatus(node), describeNodeStatus(node).label],
    },
    { name: "model", weight: 6, value: [node.model, node.harnessModel, node.hostAgent?.model] },
    { name: "description", weight: 5, value: node.description },
    {
      name: "badge",
      weight: 5,
      value: [node.badge?.text, ...(node.badges?.map((b) => b.label) ?? [])],
    },
    { name: "tools", weight: 5, value: node.tools?.map((t) => t.name) },
    { name: "writeScope", weight: 5, value: node.metadata?.writeScope },
    { name: "files", weight: 4, value: node.files?.map((f) => f.path) },
    { name: "prompt", weight: 3, value: node.prompt },
    { name: "output", weight: 3, value: node.output },
    { name: "logs", weight: 2, value: node.logs },
  ];

  let matched = false;
  let totalScore = 0;
  const allHighlights: SlqHighlightSpan[] = [];

  const predVal: SlqPredicateValue = termNode.isRegex
    ? {
        type: "regex",
        regexVal: { pattern: termNode.value, flags: termNode.regexFlags ?? "i" },
      }
    : {
        type: "string",
        stringVal: termNode.value,
      };

  for (const field of searchableFields) {
    const res = matchFieldPredicate(
      field.value,
      {
        type: "field_predicate",
        field: field.name,
        op: termNode.isExact ? "=" : ":",
        value: predVal,
        range: termNode.range,
      },
      options,
    );

    if (res.isMatch) {
      matched = true;
      totalScore += res.score * (field.weight / 10);
      allHighlights.push(...res.highlights);
    }
  }

  return {
    isMatch: matched,
    highlights: allHighlights,
    score: totalScore,
  };
}

/**
 * Evaluates a bare term against all searchable text fields of an edge.
 */
function matchTermAgainstEdge(
  edge: PositionedEdge,
  termNode: SlqTermNode,
  options: SlqEvaluationOptions,
): { isMatch: boolean; highlights: SlqHighlightSpan[]; score: number } {
  const searchableFields: Array<{ name: string; weight: number; value: unknown }> = [
    { name: "id", weight: 8, value: edge.id },
    { name: "label", weight: 10, value: [edge.label, edge.container?.title] },
    { name: "source", weight: 7, value: edge.source },
    { name: "target", weight: 7, value: edge.target },
    { name: "kind", weight: 6, value: [edge.kind, edge.container?.variant] },
    { name: "condition", weight: 5, value: edge.condition },
    { name: "description", weight: 5, value: edge.description },
  ];

  let matched = false;
  let totalScore = 0;
  const allHighlights: SlqHighlightSpan[] = [];

  const predVal: SlqPredicateValue = termNode.isRegex
    ? {
        type: "regex",
        regexVal: { pattern: termNode.value, flags: termNode.regexFlags ?? "i" },
      }
    : {
        type: "string",
        stringVal: termNode.value,
      };

  for (const field of searchableFields) {
    const res = matchFieldPredicate(
      field.value,
      {
        type: "field_predicate",
        field: field.name,
        op: termNode.isExact ? "=" : ":",
        value: predVal,
        range: termNode.range,
      },
      options,
    );

    if (res.isMatch) {
      matched = true;
      totalScore += res.score * (field.weight / 10);
      allHighlights.push(...res.highlights);
    }
  }

  return {
    isMatch: matched,
    highlights: allHighlights,
    score: totalScore,
  };
}

/**
 * Evaluates an AST node against a single target (node or edge).
 */
function evaluateAstNode(
  target: PositionedNode | PositionedEdge,
  isEdge: boolean,
  ast: SlqAstNode,
  options: SlqEvaluationOptions,
): { isMatch: boolean; highlights: SlqHighlightSpan[]; score: number } {
  if (ast.type === "empty") {
    const defaultMatch = options.defaultEmptyMatchAll ?? true;
    return { isMatch: defaultMatch, highlights: [], score: defaultMatch ? 1 : 0 };
  }

  if (ast.type === "term") {
    if (isEdge) {
      return matchTermAgainstEdge(target as PositionedEdge, ast, options);
    }
    return matchTermAgainstNode(target as PositionedNode, ast, options);
  }

  if (ast.type === "field_predicate") {
    let resolved: unknown;
    if (options.customResolvers && ast.field in options.customResolvers) {
      resolved = options.customResolvers[ast.field](target);
    } else if (isEdge) {
      resolved = resolveEdgeFieldValue(target as PositionedEdge, ast.field);
    } else {
      resolved = resolveNodeFieldValue(target as PositionedNode, ast.field);
    }
    return matchFieldPredicate(resolved, ast, options);
  }

  if (ast.type === "not") {
    const res = evaluateAstNode(target, isEdge, ast.operand, options);
    return {
      isMatch: !res.isMatch,
      highlights: [],
      score: !res.isMatch ? 5 : 0,
    };
  }

  if (ast.type === "and") {
    let allMatch = true;
    let totalScore = 0;
    const allHighlights: SlqHighlightSpan[] = [];

    for (const operand of ast.operands) {
      const res = evaluateAstNode(target, isEdge, operand, options);
      if (!res.isMatch) {
        allMatch = false;
        break;
      }
      totalScore += res.score;
      allHighlights.push(...res.highlights);
    }

    return {
      isMatch: allMatch,
      highlights: allMatch ? allHighlights : [],
      score: allMatch ? totalScore : 0,
    };
  }

  if (ast.type === "or") {
    let anyMatch = false;
    let bestScore = 0;
    const allHighlights: SlqHighlightSpan[] = [];

    for (const operand of ast.operands) {
      const res = evaluateAstNode(target, isEdge, operand, options);
      if (res.isMatch) {
        anyMatch = true;
        bestScore = Math.max(bestScore, res.score);
        allHighlights.push(...res.highlights);
      }
    }

    return {
      isMatch: anyMatch,
      highlights: anyMatch ? allHighlights : [],
      score: bestScore,
    };
  }

  return { isMatch: false, highlights: [], score: 0 };
}

/**
 * Evaluates an AST against a single node.
 */
export function evaluateSlqNode(
  node: PositionedNode,
  ast: SlqAstNode,
  options: SlqEvaluationOptions = {},
): SlqNodeMatchResult {
  const res = evaluateAstNode(node, false, ast, options);
  return {
    node,
    nodeId: node.id,
    isMatch: res.isMatch,
    score: res.score,
    highlights: res.highlights,
  };
}

/**
 * Evaluates an AST against a single edge.
 */
export function evaluateSlqEdge(
  edge: PositionedEdge,
  ast: SlqAstNode,
  options: SlqEvaluationOptions = {},
): SlqEdgeMatchResult {
  const res = evaluateAstNode(edge, true, ast, options);
  return {
    edge,
    edgeId: edge.id,
    isMatch: res.isMatch,
    score: res.score,
    highlights: res.highlights,
  };
}

/**
 * Evaluates an SLQ query AST across an entire graph dataset of nodes and edges.
 */
export function evaluateSlq(
  dataset: { nodes: PositionedNode[]; edges?: PositionedEdge[] },
  ast: SlqAstNode,
  options: SlqEvaluationOptions = {},
): SlqEvaluationResult {
  const startTime = performance.now();
  const includeNodes = options.includeNodes ?? true;
  const includeEdges = options.includeEdges ?? true;

  const nodeResults: SlqNodeMatchResult[] = [];
  const edgeResults: SlqEdgeMatchResult[] = [];
  const matchedNodeIds = new Set<string>();
  const matchedEdgeIds = new Set<string>();
  const matchedNodes: PositionedNode[] = [];
  const matchedEdges: PositionedEdge[] = [];

  if (includeNodes && dataset.nodes) {
    for (const node of dataset.nodes) {
      const res = evaluateSlqNode(node, ast, options);
      nodeResults.push(res);
      if (res.isMatch) {
        matchedNodeIds.add(node.id);
        matchedNodes.push(node);
      }
    }
  }

  if (includeEdges && dataset.edges) {
    for (const edge of dataset.edges) {
      const res = evaluateSlqEdge(edge, ast, options);
      edgeResults.push(res);
      if (res.isMatch) {
        matchedEdgeIds.add(edge.id);
        matchedEdges.push(edge);
      }
    }
  }

  // Sort matched nodes and edges by relevance score descending
  matchedNodes.sort((a, b) => {
    const scoreA = nodeResults.find((r) => r.nodeId === a.id)?.score ?? 0;
    const scoreB = nodeResults.find((r) => r.nodeId === b.id)?.score ?? 0;
    return scoreB - scoreA;
  });

  const durationMs = performance.now() - startTime;

  return {
    nodes: nodeResults,
    edges: edgeResults,
    matchedNodeIds,
    matchedEdgeIds,
    matchedNodes,
    matchedEdges,
    totalMatches: matchedNodeIds.size + matchedEdgeIds.size,
    nodeCount: matchedNodeIds.size,
    edgeCount: matchedEdgeIds.size,
    durationMs,
    ast,
    errors: [],
  };
}
