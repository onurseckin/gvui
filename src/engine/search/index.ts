import { tokenize } from "./slqTokenizer";
import { parse, validateSlqAst } from "./slqParser";
import { evaluateSlq } from "./slqEvaluator";
import type {
  SlqAstNode,
  SlqEvaluationOptions,
  SlqEvaluationResult,
  SlqSyntaxError,
} from "./types";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";

export * from "./types";
export * from "./slqTokenizer";
export * from "./slqParser";
export * from "./slqEvaluator";
export * from "./slqAutocomplete";

/**
 * Top-level convenience API: parses and evaluates an SLQ search query string
 * against a graph dataset of nodes and edges.
 */
export function searchGraph(
  dataset: { nodes: PositionedNode[]; edges?: PositionedEdge[] },
  query: string,
  options: SlqEvaluationOptions = {},
): SlqEvaluationResult {
  const trimmed = query.trim();

  // Empty query -> match all or empty default
  if (!trimmed) {
    const emptyAst: SlqAstNode = {
      type: "empty",
      range: { start: 0, end: 0 },
    };
    return evaluateSlq(dataset, emptyAst, options);
  }

  const { tokens, errors: tokenErrors } = tokenize(query);
  const { ast, errors: parseErrors } = parse(tokens, tokenErrors);
  const astErrors = validateSlqAst(ast);
  const allErrors: SlqSyntaxError[] = [...tokenErrors, ...parseErrors, ...astErrors];

  const evalResult = evaluateSlq(dataset, ast, options);
  evalResult.errors = allErrors;

  return evalResult;
}
