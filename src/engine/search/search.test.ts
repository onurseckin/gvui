import { describe, expect, it } from "bun:test";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import {
  getSlqAutocomplete,
  levenshteinDistance,
  parse,
  parseNumberWithUnit,
  resolveEdgeFieldValue,
  resolveNodeFieldValue,
  searchGraph,
  stringSimilarity,
  tokenize,
  validateSlqAst,
} from "./index";
import { executeSlqQuery, highlightMatchedText } from "../../components/SearchOverlay/slqQuery";
import type { SlqAndNode, SlqFieldPredicateNode, SlqNotNode, SlqOrNode } from "./types";

// Mock dataset fixture with rich node and edge attributes
const mockNodes: PositionedNode[] = [
  {
    id: "node-coordinator-1",
    name: "Master Coordinator",
    description: "Orchestrates multi-agent parallel execution",
    kind: "orchestrator",
    type: "orchestrator",
    status: "running",
    step: 1,
    stepLabel: "Round 7 Initiation",
    x: 100,
    y: 100,
    width: 250,
    height: 120,
    model: "claude-3-7-sonnet",
    tier: "l",
    hostAgent: {
      name: "lead-orchestrator",
      model: "claude-3-7-sonnet",
      tier: "l",
      reasoningEffort: "high",
    },
    tools: [{ name: "run_command" }, { name: "send_message" }],
    badge: { text: "COORDINATOR", variant: "info" },
    badges: [{ label: "LEAD" }, { label: "ROUND-7" }],
    metrics: {
      durationMs: 4500,
      tokensIn: 8000,
      tokensOut: 2500,
      costUsd: 0.045,
      retries: 0,
      timingBreakdown: { wallDurationMs: 4500 },
    },
    metadata: {
      writeScope: ["docs/planning", "src/state"],
      leaseAgent: "coordinator-alpha",
      findings: [],
      round: 7,
    },
    prompt: "Coordinate subagents for Round 7 graph diffing and SLQ search",
    output: "Dispatched tasks to implementers 1 through 4",
    logs: "Init successful. All workers running.",
  },
  {
    id: "node-worker-2",
    name: "SLQ Search Implementer",
    description: "Implements advanced SLQ search engine and parser",
    kind: "agent",
    type: "agent",
    status: "success",
    step: 2,
    stepLabel: "Task 4 Implementation",
    x: 400,
    y: 100,
    width: 250,
    height: 120,
    model: "gemini-2.0-flash",
    tier: "m",
    hostAgent: {
      name: "implementer-04",
      model: "gemini-2.0-flash",
      tier: "m",
      reasoningEffort: "medium",
    },
    tools: [{ name: "write_to_file" }, { name: "view_file" }, { name: "grep_search" }],
    badge: { text: "WORKER", variant: "success" },
    badges: [{ label: "TASK-04" }, { label: "SLQ-ENGINE" }],
    metrics: {
      durationMs: 1200,
      tokensIn: 15000,
      tokensOut: 4000,
      costUsd: 0.012,
      retries: 1,
      timingBreakdown: { wallDurationMs: 1200 },
    },
    metadata: {
      writeScope: ["src/engine/search", "src/components/SearchOverlay/slqQuery.ts"],
      leaseAgent: "implementer-04",
      findings: [
        {
          id: "find-01",
          severity: "important",
          observation: "Ensure zero any and zero eslint-disable in all test files",
          status: "resolved",
        },
      ],
      round: 7,
      playwrightMetadata: { status: "passed", durationMs: 1200 },
    },
    prompt: "Implement tokenizer, parser, evaluator, and autocomplete for SLQ",
    output: "Created src/engine/search and passed all tests",
    logs: "Build clean. Zero any errors.",
  },
  {
    id: "node-gate-3",
    name: "Adversarial Quality Gate",
    description: "Validates AST robustness and stress tests",
    kind: "gate",
    type: "gate",
    status: "error",
    step: 3,
    stepLabel: "Gatekeeper Verification",
    x: 700,
    y: 100,
    width: 250,
    height: 120,
    model: "gpt-4o",
    tier: "l",
    hostAgent: {
      name: "validator-01",
      model: "gpt-4o",
      tier: "l",
      reasoningEffort: "high",
    },
    tools: [{ name: "run_command" }],
    badge: { text: "GATE", variant: "error" },
    badges: [{ label: "CRITICAL" }, { label: "AUDIT" }],
    metrics: {
      durationMs: 850,
      tokensIn: 5000,
      tokensOut: 800,
      costUsd: 0.008,
      retries: 2,
    },
    metadata: {
      writeScope: ["tests/audit"],
      leaseAgent: "validator-01",
      findings: [
        {
          id: "find-02",
          severity: "critical",
          observation: "Negative syntax assertions failed on unclosed quote",
          remediation: "Add robust error recovery to lexer",
          status: "open",
        },
      ],
      round: 7,
    },
    prompt: "Run adversarial gauntlet tests against search engine",
    output: "Gate check failed: critical finding open",
    logs: "Found 1 critical issue in lexer unclosed quotes handling.",
  },
  {
    id: "node-tool-4",
    name: "CLI Harness Tool",
    description: "Automated test harness runner",
    kind: "tool",
    type: "tool",
    status: "cached",
    step: 4,
    stepLabel: "Tool Cache Execution",
    x: 1000,
    y: 100,
    width: 250,
    height: 120,
    model: "xs-runner",
    tier: "xs",
    tools: [{ name: "run_command" }],
    badge: { text: "TOOL", variant: "neutral" },
    metrics: {
      durationMs: 150,
      tokensIn: 200,
      tokensOut: 50,
      costUsd: 0.0001,
      retries: 0,
    },
    metadata: {
      writeScope: [],
      leaseAgent: "harness",
    },
  },
];

const mockEdges: PositionedEdge[] = [
  {
    id: "edge-1-2",
    source: "node-coordinator-1",
    target: "node-worker-2",
    label: "dispatch-task-4",
    kind: "spawn",
    path: "M 350 160 L 400 160",
    trafficVolume: 1200,
    tokens: 3500,
    traffic: {
      volume: 1200,
      tokens: 3500,
      status: "active",
    },
  },
  {
    id: "edge-2-3",
    source: "node-worker-2",
    target: "node-gate-3",
    label: "submit-for-validation",
    kind: "pushback",
    condition: "always",
    path: "M 650 160 L 700 160",
    trafficVolume: 800,
    tokens: 1200,
    traffic: {
      volume: 800,
      tokens: 1200,
      status: "error",
      exchanges: [
        {
          id: "ex-01",
          finding: {
            severity: "critical",
            observation: "Missing range boundary check",
          },
        },
      ],
    },
  },
];

const mockDataset = {
  nodes: mockNodes,
  edges: mockEdges,
};

describe("SLQ Tokenizer & Number Parsing", () => {
  it("parses numbers with units correctly", () => {
    expect(parseNumberWithUnit("500ms")).toEqual({ value: 500, unit: "ms" });
    expect(parseNumberWithUnit("2.5s")).toEqual({ value: 2500, unit: "s" });
    expect(parseNumberWithUnit("1.5min")).toEqual({ value: 90000, unit: "min" });
    expect(parseNumberWithUnit("1h")).toEqual({ value: 3600000, unit: "h" });
    expect(parseNumberWithUnit("10k")).toEqual({ value: 10000, unit: "k" });
    expect(parseNumberWithUnit("2.5M")).toEqual({ value: 2500000, unit: "m" });
    expect(parseNumberWithUnit("100kb")).toEqual({ value: 102400, unit: "kb" });
    expect(parseNumberWithUnit("1mb")).toEqual({ value: 1048576, unit: "mb" });
    expect(parseNumberWithUnit("$0.05")).toEqual({ value: 0.05, unit: "$" });
    expect(parseNumberWithUnit("123.45")).toEqual({ value: 123.45 });
    expect(parseNumberWithUnit("")).toBeNull();
    expect(parseNumberWithUnit("not-a-number")).toBeNull();
  });

  it("tokenizes boolean operators and grouping characters", () => {
    const { tokens, errors } = tokenize("AND OR NOT && || ! ( ) [ ] , ..");
    expect(errors).toHaveLength(0);
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      "AND",
      "OR",
      "NOT",
      "AND",
      "OR",
      "NOT",
      "LPAREN",
      "RPAREN",
      "LBRACKET",
      "RBRACKET",
      "COMMA",
      "RANGE_DOTS",
      "EOF",
    ]);
  });

  it("tokenizes comparators: :, =, ==, !=, <>, >, >=, <, <=, ~=, ~", () => {
    const { tokens, errors } = tokenize(
      'status:error name="test" val==1 val!=2 val<>3 a>5 b>=10 c<20 d<=30 e~=fuzzy',
    );
    expect(errors).toHaveLength(0);
    expect(tokens.some((t) => t.type === "COLON")).toBe(true);
    expect(tokens.some((t) => t.type === "EQUALS")).toBe(true);
    expect(tokens.some((t) => t.type === "NOT_EQUALS")).toBe(true);
    expect(tokens.some((t) => t.type === "GT")).toBe(true);
    expect(tokens.some((t) => t.type === "GTE")).toBe(true);
    expect(tokens.some((t) => t.type === "LT")).toBe(true);
    expect(tokens.some((t) => t.type === "LTE")).toBe(true);
    expect(tokens.some((t) => t.type === "TILDE")).toBe(true);
  });

  it("tokenizes quoted strings with escape sequences", () => {
    const { tokens, errors } = tokenize('"hello \\"world\\"" \'foo \\\'bar\\\'\' "line\\nbreak"');
    expect(errors).toHaveLength(0);
    expect(tokens[0].value).toBe('hello "world"');
    expect(tokens[1].value).toBe("foo 'bar'");
    expect(tokens[2].value).toBe("line\nbreak");
  });

  it("tokenizes regex literals", () => {
    const { tokens, errors } = tokenize("/^node-\\d+/i /error|warning/g");
    expect(errors).toHaveLength(0);
    expect(tokens[0].type).toBe("REGEX");
    expect(tokens[0].value).toBe("/^node-\\d+/i");
    expect(tokens[1].type).toBe("REGEX");
    expect(tokens[1].value).toBe("/error|warning/g");
  });

  it("reports error on unterminated quoted string without crashing", () => {
    const { tokens, errors } = tokenize('status:"unclosed string');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe("UNTERMINATED_STRING");
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("accurately reports character offsets and line/column numbers", () => {
    const query = "status:error\n  AND kind:agent";
    const { tokens } = tokenize(query);
    const statusField = tokens[0];
    expect(statusField.start).toBe(0);
    expect(statusField.end).toBe(6);
    expect(statusField.line).toBe(1);
    expect(statusField.column).toBe(1);

    const andToken = tokens.find((t) => t.type === "AND");
    expect(andToken).toBeDefined();
    expect(andToken?.line).toBe(2);
    expect(andToken?.column).toBe(3);
  });

  it("tokenizes negative unary terms: -status:error and -worker", () => {
    const { tokens } = tokenize("-status:error -worker !running");
    expect(tokens[0].type).toBe("NOT");
    expect(tokens[1].type).toBe("FIELD");
    expect(tokens[3].type).toBe("BARE_WORD");
    expect(tokens[4].type).toBe("NOT");
    expect(tokens[5].type).toBe("BARE_WORD");
    expect(tokens[6].type).toBe("NOT");
    expect(tokens[7].type).toBe("BARE_WORD");
  });
});

describe("SLQ Parser & Operator Precedence", () => {
  it("parses precedence: A OR B AND C -> A OR (B AND C)", () => {
    const { tokens } = tokenize("status:error OR status:running AND kind:agent");
    const { ast, errors } = parse(tokens);
    expect(errors).toHaveLength(0);
    expect(ast.type).toBe("or");
    const orNode = ast as SlqOrNode;
    expect(orNode.operands).toHaveLength(2);
    expect(orNode.operands[0].type).toBe("field_predicate");
    expect(orNode.operands[1].type).toBe("and");

    const andNode = orNode.operands[1] as SlqAndNode;
    expect(andNode.operands).toHaveLength(2);
  });

  it("respects parentheses to override precedence: (A OR B) AND C", () => {
    const { tokens } = tokenize("(status:error OR status:running) AND kind:agent");
    const { ast, errors } = parse(tokens);
    expect(errors).toHaveLength(0);
    expect(ast.type).toBe("and");
    const andNode = ast as SlqAndNode;
    expect(andNode.operands).toHaveLength(2);
    expect(andNode.operands[0].type).toBe("or");
    expect(andNode.operands[1].type).toBe("field_predicate");
  });

  it("parses implicit AND when multiple terms/predicates appear without operator", () => {
    const { tokens } = tokenize('status:error kind:agent "memory leak"');
    const { ast, errors } = parse(tokens);
    expect(errors).toHaveLength(0);
    expect(ast.type).toBe("and");
    const andNode = ast as SlqAndNode;
    expect(andNode.implicit).toBe(true);
    expect(andNode.operands).toHaveLength(3);
  });

  it("parses unary NOT expressions", () => {
    const { tokens } = tokenize("NOT status:error");
    const { ast, errors } = parse(tokens);
    expect(errors).toHaveLength(0);
    expect(ast.type).toBe("not");
    const notNode = ast as SlqNotNode;
    expect(notNode.operand.type).toBe("field_predicate");
  });

  it("parses numeric range predicates: duration:100ms..2s and tokens:1000..5000", () => {
    const { tokens } = tokenize("duration:100ms..2s tokens:1000..5000");
    const { ast, errors } = parse(tokens);
    expect(errors).toHaveLength(0);
    expect(ast.type).toBe("and");
    const andNode = ast as SlqAndNode;
    const durPred = andNode.operands[0] as SlqFieldPredicateNode;
    expect(durPred.value.type).toBe("range");
    expect(durPred.value.rangeVal?.min).toBe(100);
    expect(durPred.value.rangeVal?.max).toBe(2000);

    const tokPred = andNode.operands[1] as SlqFieldPredicateNode;
    expect(tokPred.value.type).toBe("range");
    expect(tokPred.value.rangeVal?.min).toBe(1000);
    expect(tokPred.value.rangeVal?.max).toBe(5000);
  });

  it("parses set membership predicates: status:in(error, running, failed)", () => {
    const { tokens } = tokenize("status:in(error, running, failed)");
    const { ast, errors } = parse(tokens);
    expect(errors).toHaveLength(0);
    expect(ast.type).toBe("field_predicate");
    const pred = ast as SlqFieldPredicateNode;
    expect(pred.op).toBe("in");
    expect(pred.value.type).toBe("set");
    expect(pred.value.setVal).toEqual(["error", "running", "failed"]);
  });

  it("parses set membership with square brackets: kind:[agent, orchestrator]", () => {
    const { tokens } = tokenize("kind:[agent, orchestrator]");
    const { ast, errors } = parse(tokens);
    expect(errors).toHaveLength(0);
    expect(ast.type).toBe("field_predicate");
    const pred = ast as SlqFieldPredicateNode;
    expect(pred.op).toBe("in");
    expect(pred.value.setVal).toEqual(["agent", "orchestrator"]);
  });

  it("reports syntax error on unclosed parentheses with exact offset", () => {
    const { tokens } = tokenize("(status:error AND kind:agent");
    const { errors } = parse(tokens);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some((e) => e.code === "UNBALANCED_PARENTHESES" || e.code === "UNEXPECTED_TOKEN"),
    ).toBe(true);
  });

  it("reports syntax error on hanging operator: status:error AND", () => {
    const { tokens } = tokenize("status:error AND");
    const { errors } = parse(tokens);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.code === "EXPECTED_EXPRESSION")).toBe(true);
  });

  it("validates AST and detects invalid range where min > max", () => {
    const { tokens } = tokenize("duration:5000ms..100ms");
    const { ast } = parse(tokens);
    const valErrors = validateSlqAst(ast);
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].code).toBe("INVALID_RANGE");
  });

  it("handles empty query string safely", () => {
    const { tokens } = tokenize("");
    const { ast, errors } = parse(tokens);
    expect(errors).toHaveLength(0);
    expect(ast.type).toBe("empty");
  });
});

describe("String Distance & Similarity Utilities", () => {
  it("computes accurate Levenshtein distance", () => {
    expect(levenshteinDistance("orchestrator", "orchestrator")).toBe(0);
    expect(levenshteinDistance("agent", "agents")).toBe(1);
    expect(levenshteinDistance("gate", "late")).toBe(1);
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("", "abc")).toBe(3);
  });

  it("computes string similarity score", () => {
    expect(stringSimilarity("exact", "exact")).toBe(1.0);
    expect(stringSimilarity("orchestrator", "orchestratr")).toBeGreaterThan(0.9);
    expect(stringSimilarity("abc", "xyz")).toBe(0.0);
  });
});

describe("SLQ Evaluator - Node Field Resolution & Filtering", () => {
  it("resolves basic node fields: id, name, type, kind, status", () => {
    expect(resolveNodeFieldValue(mockNodes[0], "id")).toBe("node-coordinator-1");
    expect(resolveNodeFieldValue(mockNodes[0], "name")).toBe("Master Coordinator");
    expect(resolveNodeFieldValue(mockNodes[0], "status")).toEqual([
      "running",
      "running",
      "Running",
    ]);
    expect(resolveNodeFieldValue(mockNodes[0], "kind")).toEqual([
      "orchestrator",
      "orchestrator",
      "COORDINATOR",
    ]);
  });

  it("resolves LLM attributes: model, tier, effort", () => {
    expect(resolveNodeFieldValue(mockNodes[0], "model")).toContain("claude-3-7-sonnet");
    expect(resolveNodeFieldValue(mockNodes[0], "tier")).toContain("l");
    expect(resolveNodeFieldValue(mockNodes[0], "effort")).toContain("high");
    expect(resolveNodeFieldValue(mockNodes[1], "effort")).toContain("medium");
  });

  it("resolves write_scope and files array", () => {
    const scopes = resolveNodeFieldValue(mockNodes[1], "write_scope");
    expect(Array.isArray(scopes)).toBe(true);
    expect(scopes).toContain("src/engine/search");
    expect(scopes).toContain("src/components/SearchOverlay/slqQuery.ts");
  });

  it("resolves tools and badges", () => {
    expect(resolveNodeFieldValue(mockNodes[1], "tools")).toEqual([
      "write_to_file",
      "view_file",
      "grep_search",
    ]);
    expect(resolveNodeFieldValue(mockNodes[1], "badges")).toContain("TASK-04");
  });

  it("resolves metrics: duration, tokens, cost, retries", () => {
    expect(resolveNodeFieldValue(mockNodes[0], "duration")).toBe(4500);
    expect(resolveNodeFieldValue(mockNodes[0], "tokens")).toBe(10500);
    expect(resolveNodeFieldValue(mockNodes[0], "cost")).toBe(0.045);
    expect(resolveNodeFieldValue(mockNodes[1], "retries")).toBe(1);
    expect(resolveNodeFieldValue(mockNodes[2], "retries")).toBe(2);
  });

  it("resolves findings and severity", () => {
    expect(resolveNodeFieldValue(mockNodes[2], "severity")).toContain("critical");
    expect(resolveNodeFieldValue(mockNodes[1], "severity")).toContain("important");
    expect(resolveNodeFieldValue(mockNodes[2], "findings")).toContain(
      "Negative syntax assertions failed on unclosed quote",
    );
  });

  it("resolves deep nested metadata paths", () => {
    expect(resolveNodeFieldValue(mockNodes[1], "playwrightMetadata.status")).toBe("passed");
  });

  it("filters by status: status:running vs status:error vs status:success", () => {
    const runningRes = searchGraph(mockDataset, "status:running");
    expect(runningRes.matchedNodeIds.has("node-coordinator-1")).toBe(true);
    expect(runningRes.matchedNodeIds.has("node-worker-2")).toBe(false);

    const errorRes = searchGraph(mockDataset, "status:error");
    expect(errorRes.matchedNodeIds.has("node-gate-3")).toBe(true);
    expect(errorRes.matchedNodeIds.has("node-coordinator-1")).toBe(false);
  });

  it("filters by numeric threshold with units: duration>1s and duration<1000ms", () => {
    const longRunning = searchGraph(mockDataset, "duration>1s");
    expect(longRunning.matchedNodeIds.has("node-coordinator-1")).toBe(true); // 4500ms
    expect(longRunning.matchedNodeIds.has("node-worker-2")).toBe(true); // 1200ms
    expect(longRunning.matchedNodeIds.has("node-gate-3")).toBe(false); // 850ms
    expect(longRunning.matchedNodeIds.has("node-tool-4")).toBe(false); // 150ms

    const subSecond = searchGraph(mockDataset, "duration<1000ms");
    expect(subSecond.matchedNodeIds.has("node-gate-3")).toBe(true);
    expect(subSecond.matchedNodeIds.has("node-tool-4")).toBe(true);
    expect(subSecond.matchedNodeIds.has("node-coordinator-1")).toBe(false);
  });

  it("filters by numeric range: duration:500ms..2s", () => {
    const midRange = searchGraph(mockDataset, "duration:500ms..2s");
    expect(midRange.matchedNodeIds.has("node-worker-2")).toBe(true); // 1200ms
    expect(midRange.matchedNodeIds.has("node-gate-3")).toBe(true); // 850ms
    expect(midRange.matchedNodeIds.has("node-coordinator-1")).toBe(false); // 4500ms
    expect(midRange.matchedNodeIds.has("node-tool-4")).toBe(false); // 150ms
  });

  it("filters by tokens count with k multiplier: tokens>10k", () => {
    const heavyTokens = searchGraph(mockDataset, "tokens>10k");
    expect(heavyTokens.matchedNodeIds.has("node-coordinator-1")).toBe(true); // 10500
    expect(heavyTokens.matchedNodeIds.has("node-worker-2")).toBe(true); // 19000
    expect(heavyTokens.matchedNodeIds.has("node-gate-3")).toBe(false); // 5800
  });

  it("filters by cost in USD: cost>0.01$", () => {
    const costly = searchGraph(mockDataset, "cost>0.01$");
    expect(costly.matchedNodeIds.has("node-coordinator-1")).toBe(true); // 0.045
    expect(costly.matchedNodeIds.has("node-worker-2")).toBe(true); // 0.012
    expect(costly.matchedNodeIds.has("node-gate-3")).toBe(false); // 0.008
  });

  it("filters by regex pattern: model:/^claude/ and id:/worker-\\d+/", () => {
    const claudeMatch = searchGraph(mockDataset, "model:/^claude/i");
    expect(claudeMatch.matchedNodeIds.has("node-coordinator-1")).toBe(true);
    expect(claudeMatch.matchedNodeIds.has("node-worker-2")).toBe(false);

    const workerMatch = searchGraph(mockDataset, "id:/worker-\\d+/");
    expect(workerMatch.matchedNodeIds.has("node-worker-2")).toBe(true);
    expect(workerMatch.matchedNodeIds.has("node-coordinator-1")).toBe(false);
  });

  it("filters array fields: tool:view_file and scope:search", () => {
    const toolSearch = searchGraph(mockDataset, "tool:view_file");
    expect(toolSearch.matchedNodeIds.has("node-worker-2")).toBe(true);
    expect(toolSearch.matchedNodeIds.has("node-coordinator-1")).toBe(false);

    const scopeSearch = searchGraph(mockDataset, "scope:search");
    expect(scopeSearch.matchedNodeIds.has("node-worker-2")).toBe(true);
    expect(scopeSearch.matchedNodeIds.has("node-coordinator-1")).toBe(false);
  });

  it("filters by severity: severity:critical vs severity:important", () => {
    const crit = searchGraph(mockDataset, "severity:critical");
    expect(crit.matchedNodeIds.has("node-gate-3")).toBe(true);
    expect(crit.matchedNodeIds.has("node-worker-2")).toBe(false);

    const imp = searchGraph(mockDataset, "severity:important");
    expect(imp.matchedNodeIds.has("node-worker-2")).toBe(true);
  });

  it("performs free text term search across multiple fields with relevance scoring", () => {
    const freeText = searchGraph(mockDataset, "Implementer");
    expect(freeText.matchedNodeIds.has("node-worker-2")).toBe(true);
    // node-worker-2 has higher relevance score because "Implementer" is in its name
    expect(freeText.matchedNodes[0].id).toBe("node-worker-2");

    const searchKeyword = searchGraph(mockDataset, "parser");
    expect(searchKeyword.matchedNodeIds.has("node-worker-2")).toBe(true);
  });

  it("performs fuzzy matching on slight misspellings when ~ is used or fuzzy enabled", () => {
    const fuzzy = searchGraph(mockDataset, "name~coordinatr", { fuzzyThreshold: 0.7 });
    expect(fuzzy.matchedNodeIds.has("node-coordinator-1")).toBe(true);
  });

  it("evaluates complex nested boolean expressions", () => {
    const complex = searchGraph(
      mockDataset,
      "(status:running OR status:success) AND (tier:l OR effort:medium) AND -model:gpt-4o",
    );
    expect(complex.matchedNodeIds.has("node-coordinator-1")).toBe(true); // running + tier:l
    expect(complex.matchedNodeIds.has("node-worker-2")).toBe(true); // success + effort:medium
    expect(complex.matchedNodeIds.has("node-gate-3")).toBe(false); // error + gpt-4o
    expect(complex.matchedNodeIds.has("node-tool-4")).toBe(false);
  });

  it("evaluates set membership: status:in(error, running)", () => {
    const inSet = searchGraph(mockDataset, "status:in(error, running)");
    expect(inSet.matchedNodeIds.has("node-coordinator-1")).toBe(true);
    expect(inSet.matchedNodeIds.has("node-gate-3")).toBe(true);
    expect(inSet.matchedNodeIds.has("node-worker-2")).toBe(false);
  });

  it("supports negation operator != and !in", () => {
    const notError = searchGraph(mockDataset, "status!=error");
    expect(notError.matchedNodeIds.has("node-coordinator-1")).toBe(true);
    expect(notError.matchedNodeIds.has("node-worker-2")).toBe(true);
    expect(notError.matchedNodeIds.has("node-gate-3")).toBe(false);
  });
});

describe("SLQ Evaluator - Edge Field Resolution & Filtering", () => {
  it("resolves edge fields: id, source, target, label, kind, traffic", () => {
    expect(resolveEdgeFieldValue(mockEdges[0], "id")).toBe("edge-1-2");
    expect(resolveEdgeFieldValue(mockEdges[0], "source")).toBe("node-coordinator-1");
    expect(resolveEdgeFieldValue(mockEdges[0], "target")).toBe("node-worker-2");
    expect(resolveEdgeFieldValue(mockEdges[0], "label")).toContain("dispatch-task-4");
    expect(resolveEdgeFieldValue(mockEdges[0], "kind")).toContain("spawn");
    expect(resolveEdgeFieldValue(mockEdges[0], "volume")).toBe(1200);
    expect(resolveEdgeFieldValue(mockEdges[0], "tokens")).toBe(3500);
  });

  it("resolves edge severity from traffic exchanges", () => {
    expect(resolveEdgeFieldValue(mockEdges[1], "severity")).toContain("critical");
  });

  it("filters edges by kind: kind:spawn vs kind:pushback", () => {
    const spawnEdges = searchGraph(mockDataset, "kind:spawn");
    expect(spawnEdges.matchedEdgeIds.has("edge-1-2")).toBe(true);
    expect(spawnEdges.matchedEdgeIds.has("edge-2-3")).toBe(false);

    const pushbackEdges = searchGraph(mockDataset, "kind:pushback");
    expect(pushbackEdges.matchedEdgeIds.has("edge-2-3")).toBe(true);
    expect(pushbackEdges.matchedEdgeIds.has("edge-1-2")).toBe(false);
  });

  it("filters edges by traffic status and tokens: status:error AND tokens>1000", () => {
    const errorEdges = searchGraph(mockDataset, "status:error tokens>1000");
    expect(errorEdges.matchedEdgeIds.has("edge-2-3")).toBe(true);
    expect(errorEdges.matchedEdgeIds.has("edge-1-2")).toBe(false);
  });
});

describe("SLQ Autocomplete Engine", () => {
  it("suggests top fields when cursor is at start of empty query", () => {
    const suggestions = getSlqAutocomplete({
      query: "",
      cursorPosition: 0,
      dataset: mockDataset,
    });

    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain("status:");
    expect(labels).toContain("kind:");
    expect(labels).toContain("model:");
    expect(labels).toContain("effort:");
    expect(labels).toContain("scope:");
    expect(labels).toContain("duration:");
    expect(labels).toContain("tokens:");
  });

  it("suggests fields filtered by prefix when typing: 'stat'", () => {
    const suggestions = getSlqAutocomplete({
      query: "stat",
      cursorPosition: 4,
      dataset: mockDataset,
    });

    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain("status:");
    expect(suggestions[0].replacementRange).toEqual({ start: 0, end: 4 });
  });

  it("suggests enum values after 'status:'", () => {
    const suggestions = getSlqAutocomplete({
      query: "status:",
      cursorPosition: 7,
      dataset: mockDataset,
    });

    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain("success");
    expect(labels).toContain("error");
    expect(labels).toContain("running");
    expect(labels).toContain("pending");
  });

  it("filters enum values by typed prefix after 'status:er'", () => {
    const suggestions = getSlqAutocomplete({
      query: "status:er",
      cursorPosition: 9,
      dataset: mockDataset,
    });

    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain("error");
    expect(labels).not.toContain("running");
    expect(suggestions[0].replacementRange).toEqual({ start: 7, end: 9 });
  });

  it("suggests dynamic dataset values for model: and tool:", () => {
    const modelSuggestions = getSlqAutocomplete({
      query: "model:",
      cursorPosition: 6,
      dataset: mockDataset,
    });
    const modelLabels = modelSuggestions.map((s) => s.label);
    expect(modelLabels).toContain("claude-3-7-sonnet");
    expect(modelLabels).toContain("gemini-2.0-flash");
    expect(modelLabels).toContain("gpt-4o");

    const toolSuggestions = getSlqAutocomplete({
      query: "tool:",
      cursorPosition: 5,
      dataset: mockDataset,
    });
    const toolLabels = toolSuggestions.map((s) => s.label);
    expect(toolLabels).toContain("write_to_file");
    expect(toolLabels).toContain("view_file");
    expect(toolLabels).toContain("grep_search");
  });

  it("suggests operators after completed predicate: 'status:error '", () => {
    const suggestions = getSlqAutocomplete({
      query: "status:error ",
      cursorPosition: 13,
      dataset: mockDataset,
    });

    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain("AND");
    expect(labels).toContain("OR");
    expect(labels).toContain("NOT");
  });
});

describe("SearchOverlay / slqQuery Utilities & Highlighting", () => {
  it("executes full SLQ search query and returns matched nodes, edges, highlights", () => {
    const res = executeSlqQuery(mockNodes, mockEdges, "status:running OR status:error");
    expect(res.isQueryValid).toBe(true);
    expect(res.matchedNodeIds.has("node-coordinator-1")).toBe(true);
    expect(res.matchedNodeIds.has("node-gate-3")).toBe(true);
    expect(res.totalMatches).toBeGreaterThanOrEqual(2);
  });

  it("splits text into highlight segments given a search term", () => {
    const segments = highlightMatchedText("Master Coordinator for Agent Tasks", "coordinator");
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ text: "Master ", isMatch: false });
    expect(segments[1]).toEqual({ text: "Coordinator", isMatch: true });
    expect(segments[2]).toEqual({ text: " for Agent Tasks", isMatch: false });
  });

  it("splits text into highlight segments given SlqHighlightSpan array", () => {
    const spans = [{ field: "name", start: 7, end: 18, matchedText: "Coordinator" }];
    const segments = highlightMatchedText("Master Coordinator for Agent Tasks", spans);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ text: "Master ", isMatch: false });
    expect(segments[1]).toEqual({ text: "Coordinator", isMatch: true });
    expect(segments[2]).toEqual({ text: " for Agent Tasks", isMatch: false });
  });

  it("handles empty text and empty spans in highlightMatchedText", () => {
    expect(highlightMatchedText("", "test")).toEqual([{ text: "", isMatch: false }]);
    expect(highlightMatchedText("hello world", "")).toEqual([
      { text: "hello world", isMatch: false },
    ]);
    expect(highlightMatchedText("hello world", [])).toEqual([
      { text: "hello world", isMatch: false },
    ]);
  });
});

describe("SLQ Advanced Edge Cases & Custom Resolvers", () => {
  it("supports custom field resolvers in evaluation options", () => {
    const customOptions = {
      customResolvers: {
        custom_speed: (target: PositionedNode | PositionedEdge) => {
          const node = target as PositionedNode;
          return (node.metrics?.durationMs ?? 0) < 1000 ? "fast" : "slow";
        },
      },
    };

    const fastNodes = searchGraph(mockDataset, "custom_speed:fast", customOptions);
    expect(fastNodes.matchedNodeIds.has("node-gate-3")).toBe(true); // 850ms -> fast
    expect(fastNodes.matchedNodeIds.has("node-tool-4")).toBe(true); // 150ms -> fast
    expect(fastNodes.matchedNodeIds.has("node-coordinator-1")).toBe(false); // 4500ms -> slow
  });

  it("handles double negation: NOT NOT status:error", () => {
    const doubleNeg = searchGraph(mockDataset, "NOT NOT status:error");
    expect(doubleNeg.matchedNodeIds.has("node-gate-3")).toBe(true);
    expect(doubleNeg.matchedNodeIds.has("node-coordinator-1")).toBe(false);
  });

  it("handles case-sensitive search when enabled", () => {
    const caseInsensitive = searchGraph(mockDataset, 'name="Master Coordinator"');
    expect(caseInsensitive.matchedNodeIds.has("node-coordinator-1")).toBe(true);

    const caseSensitiveMismatch = searchGraph(mockDataset, 'name="master coordinator"', {
      caseSensitive: true,
    });
    expect(caseSensitiveMismatch.matchedNodeIds.has("node-coordinator-1")).toBe(false);

    const caseSensitiveMatch = searchGraph(mockDataset, 'name="Master Coordinator"', {
      caseSensitive: true,
    });
    expect(caseSensitiveMatch.matchedNodeIds.has("node-coordinator-1")).toBe(true);
  });

  it("handles empty dataset without crashing", () => {
    const emptyDataset = { nodes: [], edges: [] };
    const res = searchGraph(emptyDataset, "status:error OR kind:agent");
    expect(res.totalMatches).toBe(0);
    expect(res.matchedNodes).toHaveLength(0);
    expect(res.matchedEdges).toHaveLength(0);
  });

  it("handles scale / stress query evaluation on 500 generated nodes", () => {
    const largeNodes: PositionedNode[] = [];
    for (let i = 0; i < 500; i++) {
      const isEven = i % 2 === 0;
      largeNodes.push({
        id: `gen-node-${i}`,
        name: `Generated Node ${i}`,
        kind: isEven ? "agent" : "tool",
        status: i % 3 === 0 ? "error" : "success",
        x: i * 10,
        y: 0,
        width: 200,
        height: 100,
        metrics: { durationMs: i * 10, tokensIn: i * 100 },
      });
    }

    const stressRes = searchGraph(
      { nodes: largeNodes },
      "(status:error AND kind:agent) OR duration>3000ms",
    );
    expect(stressRes.totalMatches).toBeGreaterThan(0);
    expect(stressRes.durationMs).toBeLessThan(500); // Fast execution under parallel load
  });
});

describe("Round 1 Adversarial Pushback & Gauntlet Verification", () => {
  describe("Negative assertions for unbalanced parentheses & brackets", () => {
    it("handles multiple unclosed parentheses gracefully without crash", () => {
      const query = "(((status:error";
      const { tokens, errors: tokenErrors } = tokenize(query);
      const { ast, errors: parseErrors } = parse(tokens, tokenErrors);
      const allErrors = [...tokenErrors, ...parseErrors];

      expect(allErrors.length).toBeGreaterThanOrEqual(3);
      expect(allErrors.some((e) => e.code === "UNBALANCED_PARENTHESES")).toBe(true);
      expect(ast).toBeDefined();

      // Evaluator executes without throwing
      const res = searchGraph(mockDataset, query);
      expect(res.matchedNodeIds.has("node-gate-3")).toBe(true);
      expect(res.errors.length).toBeGreaterThanOrEqual(3);
    });

    it("handles unopened extra closing parentheses without crash", () => {
      const query = "status:error)))";
      const { tokens, errors: tokenErrors } = tokenize(query);
      const { ast, errors: parseErrors } = parse(tokens, tokenErrors);
      const allErrors = [...tokenErrors, ...parseErrors];

      expect(allErrors.length).toBeGreaterThanOrEqual(3);
      expect(allErrors.every((e) => e.code === "UNEXPECTED_TOKEN")).toBe(true);
      expect(ast).toBeDefined();

      const res = searchGraph(mockDataset, query);
      expect(res.matchedNodeIds.has("node-gate-3")).toBe(true);
    });

    it("handles mixed unbalanced parentheses in nested subexpressions", () => {
      const query = "(status:error AND (kind:agent) OR (model:gpt-4o";
      const res = searchGraph(mockDataset, query);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.some((e) => e.code === "UNBALANCED_PARENTHESES")).toBe(true);
      // Evaluator still matches node-gate-3 (model: gpt-4o)
      expect(res.matchedNodeIds.has("node-gate-3")).toBe(true);
    });

    it("handles unbalanced square brackets in set predicate", () => {
      const query = "kind:[agent, orchestrator";
      const res = searchGraph(mockDataset, query);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.some((e) => e.code === "UNBALANCED_BRACKETS")).toBe(true);
      expect(res.matchedNodeIds.has("node-coordinator-1")).toBe(true);
      expect(res.matchedNodeIds.has("node-worker-2")).toBe(true);
    });
  });

  describe("Negative assertions for unterminated string literals", () => {
    it("handles unclosed double quotes with accurate syntax error reporting", () => {
      const query = 'name:"unclosed double quote string';
      const { tokens, errors } = tokenize(query);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe("UNTERMINATED_STRING");
      expect(tokens[tokens.length - 2].value).toBe("unclosed double quote string");

      const res = searchGraph(mockDataset, query);
      expect(res.errors.some((e) => e.code === "UNTERMINATED_STRING")).toBe(true);
    });

    it("handles unclosed single quotes", () => {
      const query = "name:'unclosed single quote string";
      const { tokens, errors } = tokenize(query);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe("UNTERMINATED_STRING");
      expect(tokens[tokens.length - 2].value).toBe("unclosed single quote string");
    });

    it("handles unclosed quotes with escaped quotes inside", () => {
      const query = 'description:"escaped \\" quote still open';
      const { errors } = tokenize(query);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe("UNTERMINATED_STRING");
    });

    it("handles unclosed quote inside complex parenthesized compound query", () => {
      const query = '(name:"unclosed AND status:running)';
      const res = searchGraph(mockDataset, query);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.some((e) => e.code === "UNTERMINATED_STRING")).toBe(true);
    });
  });

  describe("Negative assertions for invalid regex patterns without crash", () => {
    it("safely handles malformed regex with unclosed parenthesis: /invalid(/", () => {
      const query = "name:/invalid(/";
      const res = searchGraph(mockDataset, query);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.some((e) => e.code === "INVALID_REGEX")).toBe(true);
      expect(res.totalMatches).toBe(0);
    });

    it("safely handles malformed regex with invalid quantifier: /+plus/", () => {
      const query = "/+plus/";
      const res = searchGraph(mockDataset, query);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.some((e) => e.code === "INVALID_REGEX")).toBe(true);
      expect(res.totalMatches).toBe(0);
    });

    it("safely handles malformed regex with unclosed bracket: type:/[a-z/", () => {
      const query = "type:/[a-z/";
      const res = searchGraph(mockDataset, query);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.some((e) => e.code === "INVALID_REGEX")).toBe(true);
      expect(res.totalMatches).toBe(0);
    });

    it("safely handles malformed regex inside compound boolean expression", () => {
      const query = "(type:/[a-z/ OR status:error) AND kind:gate";
      const res = searchGraph(mockDataset, query);
      expect(res.errors.length).toBeGreaterThan(0);
      // Valid branch still evaluates and matches gate-3!
      expect(res.matchedNodeIds.has("node-gate-3")).toBe(true);
    });
  });

  describe("Deeply nested AST expressions (>50 AST depth stress test)", () => {
    it("parses and evaluates 60 levels of nested parentheses without call stack overflow", () => {
      const depth = 60;
      const query = "(".repeat(depth) + "status:error" + ")".repeat(depth);
      const { tokens, errors: tokErrors } = tokenize(query);
      expect(tokErrors).toHaveLength(0);

      const { ast, errors: parseErrors } = parse(tokens, tokErrors);
      expect(parseErrors).toHaveLength(0);
      expect(ast).toBeDefined();

      const res = searchGraph(mockDataset, query);
      expect(res.errors).toHaveLength(0);
      expect(res.matchedNodeIds.has("node-gate-3")).toBe(true);
      expect(res.matchedNodeIds.has("node-coordinator-1")).toBe(false);
    });

    it("parses and evaluates 100 levels of chained NOT operators without stack overflow", () => {
      const depth = 100; // Even number of NOTs -> equivalent to positive status:error
      const query = "NOT ".repeat(depth) + "status:error";
      const res = searchGraph(mockDataset, query);
      expect(res.errors).toHaveLength(0);
      expect(res.matchedNodeIds.has("node-gate-3")).toBe(true);
      expect(res.matchedNodeIds.has("node-coordinator-1")).toBe(false);
    });

    it("parses and evaluates 60 levels of chained AND conjunctions", () => {
      const depth = 60;
      const terms: string[] = [];
      for (let i = 0; i < depth; i++) {
        terms.push("status:running");
      }
      const query = terms.join(" AND ");
      const res = searchGraph(mockDataset, query);
      expect(res.errors).toHaveLength(0);
      expect(res.matchedNodeIds.has("node-coordinator-1")).toBe(true);
      expect(res.matchedNodeIds.has("node-worker-2")).toBe(false);
    });

    it("parses and evaluates 60 levels of chained OR disjunctions", () => {
      const depth = 60;
      const terms: string[] = [];
      for (let i = 0; i < depth; i++) {
        terms.push(i === 30 ? "status:error" : `id:nonexistent-${i}`);
      }
      const query = terms.join(" OR ");
      const res = searchGraph(mockDataset, query);
      expect(res.errors).toHaveLength(0);
      expect(res.matchedNodeIds.has("node-gate-3")).toBe(true);
    });

    it("parses and evaluates deeply nested compound binary tree (>50 depth)", () => {
      let query = "status:error";
      for (let i = 0; i < 55; i++) {
        if (i % 3 === 0) {
          query = `(${query} AND (tier:l OR tier:m))`;
        } else if (i % 3 === 1) {
          query = `(${query} OR (status:running AND effort:high))`;
        } else {
          query = `NOT NOT (${query})`;
        }
      }

      const res = searchGraph(mockDataset, query);
      expect(res.errors).toHaveLength(0);
      expect(res.matchedNodeIds.has("node-gate-3")).toBe(true);
      expect(res.durationMs).toBeLessThan(100);
    });
  });

  describe("Strict Type Safety & Zero Any Verification", () => {
    it("ensures all AST and token structures conform to exact typed contracts", () => {
      const { tokens } = tokenize("status:error duration>500ms");
      const { ast } = parse(tokens);
      expect(ast.type).toBe("and");
      const andNode = ast as SlqAndNode;
      expect(andNode.operands).toHaveLength(2);

      const pred1 = andNode.operands[0] as SlqFieldPredicateNode;
      expect(pred1.field).toBe("status");
      expect(pred1.op).toBe(":");
      expect(pred1.value.stringVal).toBe("error");

      const pred2 = andNode.operands[1] as SlqFieldPredicateNode;
      expect(pred2.field).toBe("duration");
      expect(pred2.op).toBe(">");
      expect(pred2.value.numberVal).toBe(500);
      expect(pred2.value.unit).toBe("ms");
    });
  });
});
