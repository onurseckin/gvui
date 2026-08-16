import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";

/**
 * Token types produced by the SLQ lexer.
 */
export type SlqTokenType =
  | "FIELD"
  | "COLON"
  | "EQUALS"
  | "NOT_EQUALS"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "TILDE"
  | "AND"
  | "OR"
  | "NOT"
  | "LPAREN"
  | "RPAREN"
  | "LBRACKET"
  | "RBRACKET"
  | "COMMA"
  | "RANGE_DOTS"
  | "STRING"
  | "REGEX"
  | "NUMBER"
  | "BARE_WORD"
  | "EOF";

/**
 * Comparison operators supported by SLQ field predicates.
 */
export type SlqComparisonOp =
  | ":"
  | "="
  | "=="
  | "!="
  | "<>"
  | ">"
  | ">="
  | "<"
  | "<="
  | "~"
  | "~="
  | "in"
  | "!in";

/**
 * Error codes emitted during tokenization, parsing, or AST validation.
 */
export type SlqErrorCode =
  | "UNEXPECTED_TOKEN"
  | "UNTERMINATED_STRING"
  | "UNTERMINATED_REGEX"
  | "INVALID_ESCAPE_SEQUENCE"
  | "UNBALANCED_PARENTHESES"
  | "UNBALANCED_BRACKETS"
  | "EXPECTED_EXPRESSION"
  | "INVALID_OPERATOR"
  | "INVALID_RANGE"
  | "INVALID_NUMBER"
  | "EMPTY_PREDICATE"
  | "INVALID_REGEX"
  | "UNKNOWN_FIELD";

/**
 * A token produced by the SLQ lexer.
 */
export interface SlqToken {
  type: SlqTokenType;
  value: string;
  raw: string;
  start: number;
  end: number;
  line: number;
  column: number;
  unit?: string;
  numericValue?: number;
}

/**
 * Detailed syntax error report with character offset, line, and column.
 */
export interface SlqSyntaxError {
  message: string;
  code: SlqErrorCode;
  start: number;
  end: number;
  line: number;
  column: number;
  expected?: string[];
  found?: string;
}

/**
 * Base AST node properties.
 */
export interface SlqBaseAstNode {
  range: {
    start: number;
    end: number;
  };
}

/**
 * Bare term / free text search AST node.
 */
export interface SlqTermNode extends SlqBaseAstNode {
  type: "term";
  value: string;
  isRegex?: boolean;
  isExact?: boolean;
  isFuzzy?: boolean;
  regexFlags?: string;
}

/**
 * Numeric range specification in a predicate (e.g. 100ms..2s).
 */
export interface SlqRangeSpec {
  min?: number;
  max?: number;
  minInclusive?: boolean;
  maxInclusive?: boolean;
  unit?: string;
}

/**
 * Regex specification in a predicate.
 */
export interface SlqRegexSpec {
  pattern: string;
  flags: string;
}

/**
 * Literal value container inside a field predicate.
 */
export interface SlqPredicateValue {
  type: "string" | "number" | "boolean" | "regex" | "range" | "set";
  stringVal?: string;
  numberVal?: number;
  unit?: string;
  boolVal?: boolean;
  regexVal?: SlqRegexSpec;
  rangeVal?: SlqRangeSpec;
  setVal?: string[];
}

/**
 * Field predicate AST node (e.g., status:error, duration>500ms, effort:high).
 */
export interface SlqFieldPredicateNode extends SlqBaseAstNode {
  type: "field_predicate";
  field: string;
  op: SlqComparisonOp;
  value: SlqPredicateValue;
  rawField?: string;
  rawValue?: string;
  unit?: string;
}

/**
 * Logical NOT AST node.
 */
export interface SlqNotNode extends SlqBaseAstNode {
  type: "not";
  operand: SlqAstNode;
}

/**
 * Logical AND AST node.
 */
export interface SlqAndNode extends SlqBaseAstNode {
  type: "and";
  operands: SlqAstNode[];
  implicit?: boolean;
}

/**
 * Logical OR AST node.
 */
export interface SlqOrNode extends SlqBaseAstNode {
  type: "or";
  operands: SlqAstNode[];
}

/**
 * Empty query AST node (matches all nodes/edges by default).
 */
export interface SlqEmptyNode extends SlqBaseAstNode {
  type: "empty";
}

/**
 * Union of all SLQ AST node types.
 */
export type SlqAstNode =
  | SlqTermNode
  | SlqFieldPredicateNode
  | SlqNotNode
  | SlqAndNode
  | SlqOrNode
  | SlqEmptyNode;

/**
 * Highlight span indicating a match inside a field value.
 */
export interface SlqHighlightSpan {
  field: string;
  start: number;
  end: number;
  matchedText: string;
}

/**
 * Evaluation match result for a single node.
 */
export interface SlqNodeMatchResult {
  node: PositionedNode;
  nodeId: string;
  isMatch: boolean;
  score: number;
  highlights: SlqHighlightSpan[];
}

/**
 * Evaluation match result for a single edge.
 */
export interface SlqEdgeMatchResult {
  edge: PositionedEdge;
  edgeId: string;
  isMatch: boolean;
  score: number;
  highlights: SlqHighlightSpan[];
}

/**
 * Full query evaluation result across all nodes and edges.
 */
export interface SlqEvaluationResult {
  nodes: SlqNodeMatchResult[];
  edges: SlqEdgeMatchResult[];
  matchedNodeIds: Set<string>;
  matchedEdgeIds: Set<string>;
  matchedNodes: PositionedNode[];
  matchedEdges: PositionedEdge[];
  totalMatches: number;
  nodeCount: number;
  edgeCount: number;
  durationMs: number;
  ast: SlqAstNode;
  errors: SlqSyntaxError[];
}

/**
 * Options configuring evaluation behavior.
 */
export interface SlqEvaluationOptions {
  caseSensitive?: boolean;
  fuzzyThreshold?: number;
  includeEdges?: boolean;
  includeNodes?: boolean;
  defaultEmptyMatchAll?: boolean;
  customResolvers?: Record<string, (target: PositionedNode | PositionedEdge) => unknown>;
}

/**
 * Autocomplete item kind.
 */
export type SlqAutocompleteKind =
  | "field"
  | "operator"
  | "value"
  | "enum"
  | "keyword"
  | "template"
  | "scope";

/**
 * Autocomplete suggestion item.
 */
export interface SlqAutocompleteItem {
  label: string;
  insertText: string;
  kind: SlqAutocompleteKind;
  detail?: string;
  documentation?: string;
  replacementRange: {
    start: number;
    end: number;
  };
  score?: number;
}

/**
 * Context provided to query autocomplete generator.
 */
export interface SlqAutocompleteContext {
  query: string;
  cursorPosition: number;
  dataset?: GraphDataset | { nodes: PositionedNode[]; edges?: PositionedEdge[] } | null;
  customFields?: string[];
  customEnumValues?: Record<string, string[]>;
}

/**
 * Standard known field definition for autocomplete and validation.
 */
export interface SlqFieldDefinition {
  name: string;
  aliases: readonly string[];
  description: string;
  type: "string" | "number" | "enum" | "boolean" | "array" | "time" | "bytes" | "currency";
  enumValues?: readonly string[];
  target: "node" | "edge" | "both";
  unit?: string;
}
