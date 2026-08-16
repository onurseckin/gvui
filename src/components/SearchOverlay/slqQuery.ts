import { useMemo } from "react";
import {
  evaluateSlq,
  getSlqAutocomplete,
  parse,
  tokenize,
  validateSlqAst,
} from "../../engine/search";
import type {
  SlqAstNode,
  SlqAutocompleteItem,
  SlqEvaluationOptions,
  SlqEvaluationResult,
  SlqHighlightSpan,
  SlqSyntaxError,
  SlqToken,
} from "../../engine/search";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";

/**
 * Single text segment for highlighting matches in UI.
 */
export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

/**
 * Result state returned by the `useSlqSearch` hook.
 */
export interface UseSlqSearchResult {
  query: string;
  ast: SlqAstNode;
  tokens: SlqToken[];
  syntaxErrors: SlqSyntaxError[];
  matchedNodeIds: Set<string>;
  matchedEdgeIds: Set<string>;
  matchedNodes: PositionedNode[];
  matchedEdges: PositionedEdge[];
  nodeHighlights: Map<string, SlqHighlightSpan[]>;
  edgeHighlights: Map<string, SlqHighlightSpan[]>;
  totalMatches: number;
  nodeCount: number;
  edgeCount: number;
  durationMs: number;
  isQueryValid: boolean;
}

/**
 * Executes a full SLQ search query against nodes and edges, returning structured results.
 */
export function executeSlqQuery(
  nodes: PositionedNode[],
  edges: PositionedEdge[] = [],
  query: string,
  options: SlqEvaluationOptions = {},
): SlqEvaluationResult & { tokens: SlqToken[]; isQueryValid: boolean } {
  const trimmed = query.trim();

  if (!trimmed) {
    const emptyAst: SlqAstNode = {
      type: "empty",
      range: { start: 0, end: 0 },
    };
    const res = evaluateSlq({ nodes, edges }, emptyAst, options);
    return {
      ...res,
      tokens: [],
      isQueryValid: true,
    };
  }

  const { tokens, errors: tokenErrors } = tokenize(query);
  const { ast, errors: parseErrors } = parse(tokens, tokenErrors);
  const astErrors = validateSlqAst(ast);
  const allErrors = [...tokenErrors, ...parseErrors, ...astErrors];

  const evalResult = evaluateSlq({ nodes, edges }, ast, options);
  evalResult.errors = allErrors;

  return {
    ...evalResult,
    tokens,
    isQueryValid: allErrors.length === 0,
  };
}

/**
 * Splits text into highlighted and unhighlighted segments given highlight spans or a simple search term.
 */
export function highlightMatchedText(
  text: string,
  highlightsOrTerm: readonly SlqHighlightSpan[] | string,
): HighlightSegment[] {
  if (!text) return [{ text: "", isMatch: false }];

  if (typeof highlightsOrTerm === "string") {
    const term = highlightsOrTerm.trim();
    if (!term) return [{ text, isMatch: false }];

    const lowerText = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    const segments: HighlightSegment[] = [];
    let currIndex = 0;

    while (currIndex < text.length) {
      const matchIndex = lowerText.indexOf(lowerTerm, currIndex);
      if (matchIndex === -1) {
        segments.push({ text: text.slice(currIndex), isMatch: false });
        break;
      }

      if (matchIndex > currIndex) {
        segments.push({ text: text.slice(currIndex, matchIndex), isMatch: false });
      }

      segments.push({
        text: text.slice(matchIndex, matchIndex + term.length),
        isMatch: true,
      });

      currIndex = matchIndex + term.length;
    }

    return segments;
  }

  // Handle array of SlqHighlightSpan
  if (!highlightsOrTerm || highlightsOrTerm.length === 0) {
    return [{ text, isMatch: false }];
  }

  // Sort and merge spans
  const sorted = [...highlightsOrTerm].sort((a, b) => a.start - b.start);
  const segments: HighlightSegment[] = [];
  let curr = 0;

  for (const span of sorted) {
    const start = Math.max(0, Math.min(span.start, text.length));
    const end = Math.max(start, Math.min(span.end, text.length));

    if (start > curr) {
      segments.push({ text: text.slice(curr, start), isMatch: false });
    }

    if (end > start) {
      segments.push({ text: text.slice(start, end), isMatch: true });
      curr = end;
    }
  }

  if (curr < text.length) {
    segments.push({ text: text.slice(curr), isMatch: false });
  }

  return segments;
}

/**
 * Memoized React Hook for evaluating SLQ queries on the canvas.
 */
export function useSlqSearch(
  nodes: PositionedNode[],
  edges: PositionedEdge[] = [],
  query: string,
  options: SlqEvaluationOptions = {},
): UseSlqSearchResult {
  return useMemo(() => {
    const res = executeSlqQuery(nodes, edges, query, options);

    const nodeHighlights = new Map<string, SlqHighlightSpan[]>();
    for (const r of res.nodes) {
      if (r.isMatch && r.highlights.length > 0) {
        nodeHighlights.set(r.nodeId, r.highlights);
      }
    }

    const edgeHighlights = new Map<string, SlqHighlightSpan[]>();
    for (const r of res.edges) {
      if (r.isMatch && r.highlights.length > 0) {
        edgeHighlights.set(r.edgeId, r.highlights);
      }
    }

    return {
      query,
      ast: res.ast,
      tokens: res.tokens,
      syntaxErrors: res.errors,
      matchedNodeIds: res.matchedNodeIds,
      matchedEdgeIds: res.matchedEdgeIds,
      matchedNodes: res.matchedNodes,
      matchedEdges: res.matchedEdges,
      nodeHighlights,
      edgeHighlights,
      totalMatches: res.totalMatches,
      nodeCount: res.nodeCount,
      edgeCount: res.edgeCount,
      durationMs: res.durationMs,
      isQueryValid: res.isQueryValid,
    };
  }, [nodes, edges, query, options]);
}

/**
 * Generates autocomplete suggestions at a given cursor offset.
 */
export function getSlqQuerySuggestions(
  query: string,
  cursorPosition: number,
  dataset?: { nodes: PositionedNode[]; edges?: PositionedEdge[] } | null,
): SlqAutocompleteItem[] {
  return getSlqAutocomplete({
    query,
    cursorPosition,
    dataset,
  });
}
