import { parseNumberWithUnit } from "./slqTokenizer";
import type {
  SlqAndNode,
  SlqAstNode,
  SlqComparisonOp,
  SlqEmptyNode,
  SlqFieldPredicateNode,
  SlqNotNode,
  SlqOrNode,
  SlqPredicateValue,
  SlqRangeSpec,
  SlqRegexSpec,
  SlqSyntaxError,
  SlqTermNode,
  SlqToken,
  SlqTokenType,
} from "./types";

/**
 * Result returned by the parser.
 */
export interface ParseResult {
  ast: SlqAstNode;
  errors: SlqSyntaxError[];
}

/**
 * Recursive descent AST parser for SLQ search queries.
 */
export class SlqParser {
  private readonly tokens: readonly SlqToken[];
  private pos = 0;
  private readonly errors: SlqSyntaxError[] = [];

  constructor(tokens: readonly SlqToken[], initialErrors: readonly SlqSyntaxError[] = []) {
    this.tokens = tokens;
    this.errors = [...initialErrors];
  }

  private peek(): SlqToken {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  private atEnd(): boolean {
    const token = this.peek();
    return !token || token.type === "EOF";
  }

  private advance(): SlqToken {
    const curr = this.peek();
    if (!this.atEnd()) {
      this.pos++;
    }
    return curr;
  }

  private match(...types: SlqTokenType[]): boolean {
    const curr = this.peek();
    return types.includes(curr.type);
  }

  private addError(
    message: string,
    code: import("./types").SlqErrorCode,
    start: number,
    end: number,
    line: number,
    column: number,
    expected?: string[],
    found?: string,
  ): void {
    this.errors.push({
      message,
      code,
      start,
      end,
      line,
      column,
      expected,
      found,
    });
  }

  public parse(): ParseResult {
    if (this.tokens.length === 0 || (this.tokens.length === 1 && this.tokens[0].type === "EOF")) {
      const emptyAst: SlqEmptyNode = {
        type: "empty",
        range: { start: 0, end: 0 },
      };
      return { ast: emptyAst, errors: this.errors };
    }

    const ast = this.parseDisjunction();

    while (!this.atEnd()) {
      const remaining = this.advance();
      this.addError(
        `Unexpected token '${remaining.raw}' after valid query expression`,
        "UNEXPECTED_TOKEN",
        remaining.start,
        remaining.end,
        remaining.line,
        remaining.column,
        undefined,
        remaining.raw,
      );
    }

    return { ast, errors: this.errors };
  }

  /**
   * Disjunction: Conjunction ( ('OR' | '||') Conjunction )*
   */
  private parseDisjunction(): SlqAstNode {
    const startToken = this.peek();
    const first = this.parseConjunction();
    const disjuncts: SlqAstNode[] = [first];

    while (this.match("OR")) {
      this.advance(); // consume OR
      if (this.atEnd() || this.match("RPAREN", "RBRACKET")) {
        const errToken = this.peek();
        this.addError(
          "Expected expression after 'OR' operator",
          "EXPECTED_EXPRESSION",
          errToken.start,
          errToken.end,
          errToken.line,
          errToken.column,
        );
        break;
      }
      disjuncts.push(this.parseConjunction());
    }

    if (disjuncts.length === 1) {
      return disjuncts[0];
    }

    const last = disjuncts[disjuncts.length - 1];
    const orNode: SlqOrNode = {
      type: "or",
      operands: disjuncts,
      range: {
        start: startToken.start,
        end: last.range.end,
      },
    };
    return orNode;
  }

  /**
   * Conjunction: Factor ( ('AND' | '&&' | <implicit>) Factor )*
   */
  private parseConjunction(): SlqAstNode {
    const startToken = this.peek();
    const first = this.parseFactor();
    const conjuncts: SlqAstNode[] = [first];
    let hasExplicitAnd = false;

    while (!this.atEnd() && !this.match("OR", "RPAREN", "RBRACKET", "COMMA")) {
      if (this.match("AND")) {
        hasExplicitAnd = true;
        this.advance(); // consume AND
        if (this.atEnd() || this.match("OR", "RPAREN", "RBRACKET")) {
          const errToken = this.peek();
          this.addError(
            "Expected expression after 'AND' operator",
            "EXPECTED_EXPRESSION",
            errToken.start,
            errToken.end,
            errToken.line,
            errToken.column,
          );
          break;
        }
      }

      const next = this.parseFactor();
      conjuncts.push(next);
    }

    if (conjuncts.length === 1) {
      return conjuncts[0];
    }

    const last = conjuncts[conjuncts.length - 1];
    const andNode: SlqAndNode = {
      type: "and",
      operands: conjuncts,
      implicit: !hasExplicitAnd,
      range: {
        start: startToken.start,
        end: last.range.end,
      },
    };
    return andNode;
  }

  /**
   * Factor: ('NOT' | '!' | '-') Factor | Primary
   */
  private parseFactor(): SlqAstNode {
    const curr = this.peek();

    if (curr.type === "NOT") {
      const notToken = this.advance();
      if (this.atEnd() || this.match("OR", "AND", "RPAREN", "RBRACKET")) {
        this.addError(
          "Expected expression after 'NOT' operator",
          "EXPECTED_EXPRESSION",
          notToken.start,
          notToken.end,
          notToken.line,
          notToken.column,
        );
        const emptyNode: SlqEmptyNode = {
          type: "empty",
          range: { start: notToken.start, end: notToken.end },
        };
        return emptyNode;
      }
      const operand = this.parseFactor();
      const notNode: SlqNotNode = {
        type: "not",
        operand,
        range: {
          start: notToken.start,
          end: operand.range.end,
        },
      };
      return notNode;
    }

    return this.parsePrimary();
  }

  /**
   * Primary: '(' Disjunction ')' | FieldPredicate | RangeTerm | SetTerm | StringTerm | RegexTerm | NumberTerm | BareTerm
   */
  private parsePrimary(): SlqAstNode {
    const curr = this.peek();

    // 1. Parenthesized group: ( ... )
    if (curr.type === "LPAREN") {
      const lParen = this.advance();
      if (this.match("RPAREN")) {
        const rParen = this.advance();
        const emptyNode: SlqEmptyNode = {
          type: "empty",
          range: { start: lParen.start, end: rParen.end },
        };
        return emptyNode;
      }

      const inner = this.parseDisjunction();
      if (this.match("RPAREN")) {
        this.advance();
      } else {
        this.addError(
          `Unbalanced parenthesis: missing closing ')' for opening at line ${lParen.line}, column ${lParen.column}`,
          "UNBALANCED_PARENTHESES",
          lParen.start,
          this.peek().end,
          lParen.line,
          lParen.column,
          [")"],
        );
      }
      return inner;
    }

    // 2. Field predicate: field:value, field>val, field<=val, etc.
    if (curr.type === "FIELD") {
      const fieldToken = this.advance();
      const next = this.peek();

      const isComparator =
        next.type === "COLON" ||
        next.type === "EQUALS" ||
        next.type === "NOT_EQUALS" ||
        next.type === "GT" ||
        next.type === "GTE" ||
        next.type === "LT" ||
        next.type === "LTE" ||
        next.type === "TILDE";

      if (isComparator) {
        const opToken = this.advance();
        return this.parseFieldPredicateValue(fieldToken, opToken);
      }

      // Check for 'in' as keyword after field: field in (...)
      if (next.type === "BARE_WORD" && next.value.toLowerCase() === "in") {
        const inToken = this.advance();
        return this.parseFieldInPredicate(fieldToken, inToken);
      }

      // Field token without comparator is treated as bare search term
      const termNode: SlqTermNode = {
        type: "term",
        value: fieldToken.value,
        range: { start: fieldToken.start, end: fieldToken.end },
      };
      return termNode;
    }

    // 3. String literal
    if (curr.type === "STRING") {
      const strToken = this.advance();
      const termNode: SlqTermNode = {
        type: "term",
        value: strToken.value,
        isExact: true,
        range: { start: strToken.start, end: strToken.end },
      };
      return termNode;
    }

    // 4. Regex literal
    if (curr.type === "REGEX") {
      const regexToken = this.advance();
      const match = /^\/(.*)\/([a-z]*)$/i.exec(regexToken.value);
      const pattern = match ? match[1] : regexToken.value;
      const flags = match ? match[2] : "";

      const termNode: SlqTermNode = {
        type: "term",
        value: pattern,
        isRegex: true,
        regexFlags: flags,
        range: { start: regexToken.start, end: regexToken.end },
      };
      return termNode;
    }

    // 5. Numeric literal
    if (curr.type === "NUMBER") {
      const numToken = this.advance();

      // Check if followed by .. (range: 100..500)
      if (this.match("RANGE_DOTS")) {
        this.advance(); // consume ..
        const maxToken = this.peek();
        let maxVal: number | undefined;
        let endPos = numToken.end;

        if (maxToken.type === "NUMBER") {
          this.advance();
          maxVal = maxToken.numericValue ?? Number.parseFloat(maxToken.value);
          endPos = maxToken.end;
        }

        const minVal = numToken.numericValue ?? Number.parseFloat(numToken.value);
        const termNode: SlqTermNode = {
          type: "term",
          value: `${minVal}..${maxVal ?? ""}`,
          range: { start: numToken.start, end: endPos },
        };
        return termNode;
      }

      const termNode: SlqTermNode = {
        type: "term",
        value: numToken.raw,
        range: { start: numToken.start, end: numToken.end },
      };
      return termNode;
    }

    // 6. Bare word
    if (curr.type === "BARE_WORD") {
      const wordToken = this.advance();
      const termNode: SlqTermNode = {
        type: "term",
        value: wordToken.value,
        range: { start: wordToken.start, end: wordToken.end },
      };
      return termNode;
    }

    // 7. Fallback error recovery
    const unexpected = this.advance();
    this.addError(
      `Unexpected token '${unexpected.raw}' in expression`,
      "UNEXPECTED_TOKEN",
      unexpected.start,
      unexpected.end,
      unexpected.line,
      unexpected.column,
      undefined,
      unexpected.raw,
    );

    const emptyNode: SlqEmptyNode = {
      type: "empty",
      range: { start: unexpected.start, end: unexpected.end },
    };
    return emptyNode;
  }

  /**
   * Parses the value portion of a field predicate.
   */
  private parseFieldPredicateValue(fieldToken: SlqToken, opToken: SlqToken): SlqFieldPredicateNode {
    const rawOp = opToken.value;
    let op: SlqComparisonOp = ":";
    if (rawOp === "=" || rawOp === "==") op = "=";
    else if (rawOp === "!=" || rawOp === "<>") op = "!=";
    else if (rawOp === ">") op = ">";
    else if (rawOp === ">=") op = ">=";
    else if (rawOp === "<") op = "<";
    else if (rawOp === "<=") op = "<=";
    else if (rawOp === "~" || rawOp === "~=") op = "~";
    else op = ":";

    if (this.atEnd() || this.match("OR", "AND", "RPAREN", "RBRACKET")) {
      this.addError(
        `Field predicate '${fieldToken.value}${opToken.raw}' is missing a value`,
        "EMPTY_PREDICATE",
        fieldToken.start,
        opToken.end,
        fieldToken.line,
        fieldToken.column,
      );
      const emptyVal: SlqPredicateValue = {
        type: "string",
        stringVal: "",
      };
      return {
        type: "field_predicate",
        field: fieldToken.value,
        op,
        value: emptyVal,
        rawField: fieldToken.value,
        rawValue: "",
        range: { start: fieldToken.start, end: opToken.end },
      };
    }

    const next = this.peek();

    // Check for negated value: status:!error
    let isNegatedValue = false;
    if (next.type === "NOT") {
      this.advance();
      isNegatedValue = true;
      if (op === ":" || op === "=") {
        op = "!=";
      }
    }

    const valToken = this.peek();

    // Case 1: In / Set predicate: status:in(error, running) or status:(error, running) or status:[error, running]
    if (
      (valToken.type === "BARE_WORD" && valToken.value.toLowerCase() === "in") ||
      valToken.type === "LPAREN" ||
      valToken.type === "LBRACKET"
    ) {
      if (valToken.type === "BARE_WORD" && valToken.value.toLowerCase() === "in") {
        this.advance(); // consume 'in'
      }
      return this.parseFieldInPredicate(fieldToken, opToken, isNegatedValue ? "!in" : "in");
    }

    // Case 2: String literal: status:"in progress"
    if (valToken.type === "STRING") {
      this.advance();
      const predValue: SlqPredicateValue = {
        type: "string",
        stringVal: valToken.value,
      };
      return {
        type: "field_predicate",
        field: fieldToken.value,
        op,
        value: predValue,
        rawField: fieldToken.value,
        rawValue: valToken.raw,
        range: { start: fieldToken.start, end: valToken.end },
      };
    }

    // Case 3: Regex literal: type:/agent-\d+/i
    if (valToken.type === "REGEX") {
      this.advance();
      const match = /^\/(.*)\/([a-z]*)$/i.exec(valToken.value);
      const pattern = match ? match[1] : valToken.value;
      const flags = match ? match[2] : "";

      const regexSpec: SlqRegexSpec = { pattern, flags };
      const predValue: SlqPredicateValue = {
        type: "regex",
        regexVal: regexSpec,
        stringVal: pattern,
      };
      return {
        type: "field_predicate",
        field: fieldToken.value,
        op: "~",
        value: predValue,
        rawField: fieldToken.value,
        rawValue: valToken.raw,
        range: { start: fieldToken.start, end: valToken.end },
      };
    }

    // Case 4: Number or Range: duration:100ms..2s or tokens:1000
    if (valToken.type === "NUMBER") {
      this.advance();

      // Check for range: 100ms..2s
      if (this.match("RANGE_DOTS")) {
        this.advance(); // consume ..
        const maxToken = this.peek();
        let maxVal: number | undefined;
        let maxUnit: string | undefined;
        let endPos = valToken.end;

        if (maxToken.type === "NUMBER") {
          this.advance();
          maxVal = maxToken.numericValue ?? Number.parseFloat(maxToken.value);
          maxUnit = maxToken.unit;
          endPos = maxToken.end;
        }

        const minVal = valToken.numericValue ?? Number.parseFloat(valToken.value);
        const rangeSpec: SlqRangeSpec = {
          min: minVal,
          max: maxVal,
          minInclusive: true,
          maxInclusive: true,
          unit: valToken.unit ?? maxUnit,
        };

        const predValue: SlqPredicateValue = {
          type: "range",
          rangeVal: rangeSpec,
          unit: rangeSpec.unit,
        };

        return {
          type: "field_predicate",
          field: fieldToken.value,
          op: ":",
          value: predValue,
          rawField: fieldToken.value,
          rawValue: `${valToken.raw}..${maxToken.raw}`,
          unit: rangeSpec.unit,
          range: { start: fieldToken.start, end: endPos },
        };
      }

      const numVal = valToken.numericValue ?? Number.parseFloat(valToken.value);
      const predValue: SlqPredicateValue = {
        type: "number",
        numberVal: numVal,
        unit: valToken.unit,
      };

      return {
        type: "field_predicate",
        field: fieldToken.value,
        op,
        value: predValue,
        rawField: fieldToken.value,
        rawValue: valToken.raw,
        unit: valToken.unit,
        range: { start: fieldToken.start, end: valToken.end },
      };
    }

    // Case 5: Bare word or Boolean
    if (valToken.type === "BARE_WORD" || valToken.type === "FIELD") {
      this.advance();

      // Check for range in bare word format (e.g. 100..500 if tokenized as bare word)
      if (valToken.value.includes("..")) {
        const parts = valToken.value.split("..");
        const minParsed = parseNumberWithUnit(parts[0]);
        const maxParsed = parts[1] ? parseNumberWithUnit(parts[1]) : null;

        if (minParsed !== null) {
          const rangeSpec: SlqRangeSpec = {
            min: minParsed.value,
            max: maxParsed?.value,
            minInclusive: true,
            maxInclusive: true,
            unit: minParsed.unit ?? maxParsed?.unit,
          };
          const predValue: SlqPredicateValue = {
            type: "range",
            rangeVal: rangeSpec,
            unit: rangeSpec.unit,
          };
          return {
            type: "field_predicate",
            field: fieldToken.value,
            op: ":",
            value: predValue,
            rawField: fieldToken.value,
            rawValue: valToken.raw,
            unit: rangeSpec.unit,
            range: { start: fieldToken.start, end: valToken.end },
          };
        }
      }

      // Check boolean values
      const lower = valToken.value.toLowerCase();
      if (lower === "true" || lower === "false") {
        const predValue: SlqPredicateValue = {
          type: "boolean",
          boolVal: lower === "true",
        };
        return {
          type: "field_predicate",
          field: fieldToken.value,
          op,
          value: predValue,
          rawField: fieldToken.value,
          rawValue: valToken.raw,
          range: { start: fieldToken.start, end: valToken.end },
        };
      }

      const predValue: SlqPredicateValue = {
        type: "string",
        stringVal: valToken.value,
      };

      return {
        type: "field_predicate",
        field: fieldToken.value,
        op,
        value: predValue,
        rawField: fieldToken.value,
        rawValue: valToken.raw,
        range: { start: fieldToken.start, end: valToken.end },
      };
    }

    // Fallback: unexpected token
    const fallback = this.advance();
    this.addError(
      `Unexpected token '${fallback.raw}' as value for field '${fieldToken.value}'`,
      "UNEXPECTED_TOKEN",
      fallback.start,
      fallback.end,
      fallback.line,
      fallback.column,
    );

    const emptyVal: SlqPredicateValue = {
      type: "string",
      stringVal: fallback.raw,
    };
    return {
      type: "field_predicate",
      field: fieldToken.value,
      op,
      value: emptyVal,
      rawField: fieldToken.value,
      rawValue: fallback.raw,
      range: { start: fieldToken.start, end: fallback.end },
    };
  }

  /**
   * Parses 'field in (a, b, c)' or 'field:in(a, b, c)' or 'field:[a, b, c]'.
   */
  private parseFieldInPredicate(
    fieldToken: SlqToken,
    _opToken: SlqToken,
    explicitOp: "in" | "!in" = "in",
  ): SlqFieldPredicateNode {
    const openToken = this.peek();
    const isParen = openToken.type === "LPAREN";
    const isBracket = openToken.type === "LBRACKET";

    if (!isParen && !isBracket) {
      this.addError(
        "Expected '(' or '[' after 'in' operator",
        "UNEXPECTED_TOKEN",
        openToken.start,
        openToken.end,
        openToken.line,
        openToken.column,
        ["(", "["],
        openToken.raw,
      );
      const emptyVal: SlqPredicateValue = { type: "set", setVal: [] };
      return {
        type: "field_predicate",
        field: fieldToken.value,
        op: explicitOp,
        value: emptyVal,
        rawField: fieldToken.value,
        range: { start: fieldToken.start, end: openToken.end },
      };
    }

    this.advance(); // consume ( or [
    const closingType: SlqTokenType = isParen ? "RPAREN" : "RBRACKET";
    const values: string[] = [];

    while (!this.atEnd() && this.peek().type !== closingType) {
      const itemToken = this.peek();
      if (
        itemToken.type === "BARE_WORD" ||
        itemToken.type === "STRING" ||
        itemToken.type === "NUMBER" ||
        itemToken.type === "FIELD"
      ) {
        values.push(itemToken.value);
        this.advance();
      } else {
        this.addError(
          `Unexpected token '${itemToken.raw}' in set list`,
          "UNEXPECTED_TOKEN",
          itemToken.start,
          itemToken.end,
          itemToken.line,
          itemToken.column,
        );
        this.advance();
      }

      if (this.match("COMMA")) {
        this.advance(); // consume comma
      } else if (this.peek().type !== closingType) {
        // Allow space-separated items inside set
      }
    }

    let endPos = openToken.end;
    if (this.match(closingType)) {
      const close = this.advance();
      endPos = close.end;
    } else {
      this.addError(
        `Unclosed set list: expected '${isParen ? ")" : "]"}'`,
        isParen ? "UNBALANCED_PARENTHESES" : "UNBALANCED_BRACKETS",
        openToken.start,
        this.peek().end,
        openToken.line,
        openToken.column,
      );
    }

    const setVal: SlqPredicateValue = {
      type: "set",
      setVal: values,
    };

    return {
      type: "field_predicate",
      field: fieldToken.value,
      op: explicitOp,
      value: setVal,
      rawField: fieldToken.value,
      rawValue: values.join(", "),
      range: { start: fieldToken.start, end: endPos },
    };
  }
}

/**
 * Parses an SLQ token stream into an AST with complete syntax error diagnostics.
 */
export function parse(
  tokens: readonly SlqToken[],
  initialErrors: readonly SlqSyntaxError[] = [],
): ParseResult {
  const parser = new SlqParser(tokens, initialErrors);
  return parser.parse();
}

/**
 * Validates an SLQ AST and detects potential logical or type errors.
 */
export function validateSlqAst(ast: SlqAstNode): SlqSyntaxError[] {
  const errors: SlqSyntaxError[] = [];

  function walk(node: SlqAstNode): void {
    if (node.type === "field_predicate") {
      if (node.value.type === "range" && node.value.rangeVal) {
        const { min, max } = node.value.rangeVal;
        if (min !== undefined && max !== undefined && min > max) {
          errors.push({
            message: `Invalid range: min (${min}) cannot be greater than max (${max})`,
            code: "INVALID_RANGE",
            start: node.range.start,
            end: node.range.end,
            line: 1,
            column: node.range.start + 1,
          });
        }
      }

      if (node.value.type === "regex" && node.value.regexVal) {
        try {
          new RegExp(node.value.regexVal.pattern, node.value.regexVal.flags);
        } catch (e: unknown) {
          const err = e instanceof Error ? e.message : "Invalid regular expression";
          errors.push({
            message: `Invalid regex pattern: ${err}`,
            code: "INVALID_REGEX",
            start: node.range.start,
            end: node.range.end,
            line: 1,
            column: node.range.start + 1,
          });
        }
      }
    } else if (node.type === "not") {
      walk(node.operand);
    } else if (node.type === "and" || node.type === "or") {
      for (const op of node.operands) {
        walk(op);
      }
    }
  }

  walk(ast);
  return errors;
}
