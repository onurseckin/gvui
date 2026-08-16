import type { SlqErrorCode, SlqSyntaxError, SlqToken, SlqTokenType } from "./types";

/**
 * Standard unit multipliers converting units to canonical base units:
 * - Time -> milliseconds (ms)
 * - Bytes -> bytes (B)
 * - Multipliers -> scalar count (k=1000, M=1,000,000, B=1,000,000,000)
 */
const TIME_UNIT_FACTORS: Readonly<Record<string, number>> = Object.freeze({
  ms: 1,
  s: 1000,
  sec: 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
});

const BYTE_UNIT_FACTORS: Readonly<Record<string, number>> = Object.freeze({
  b: 1,
  kb: 1024,
  kib: 1024,
  mb: 1024 * 1024,
  mib: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  gib: 1024 * 1024 * 1024,
});

const SCALAR_UNIT_FACTORS: Readonly<Record<string, number>> = Object.freeze({
  k: 1000,
  m: 1_000_000,
  b: 1_000_000_000,
});

/**
 * Parses numeric string and optional unit suffix into a canonical numeric value.
 */
export function parseNumberWithUnit(raw: string): { value: number; unit?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Currency prefix: $1.50
  if (trimmed.startsWith("$")) {
    const numPart = trimmed.slice(1);
    const parsed = Number.parseFloat(numPart);
    if (!Number.isNaN(parsed)) {
      return { value: parsed, unit: "$" };
    }
    return null;
  }

  // Regex matching number + optional unit suffix
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z$]+)?$/.exec(trimmed);
  if (!match) return null;

  const numPart = match[1];
  const rawUnit = match[2];

  const baseNum = Number.parseFloat(numPart);
  if (Number.isNaN(baseNum)) return null;

  if (!rawUnit) {
    return { value: baseNum };
  }

  if (rawUnit === "$") {
    return { value: baseNum, unit: "$" };
  }

  const lowerUnit = rawUnit.toLowerCase();

  // Explicit time units
  if (lowerUnit in TIME_UNIT_FACTORS) {
    const factor = TIME_UNIT_FACTORS[lowerUnit];
    return { value: baseNum * factor, unit: lowerUnit };
  }

  // Byte units
  if (lowerUnit in BYTE_UNIT_FACTORS) {
    const factor = BYTE_UNIT_FACTORS[lowerUnit];
    return { value: baseNum * factor, unit: lowerUnit };
  }

  // Scalar multipliers (k, M, B)
  // Note: M is million; min is minute; m is minute if lowercase and context is time, but million if scalar
  if (rawUnit === "M" || rawUnit === "m" || lowerUnit === "k" || lowerUnit === "b") {
    const factor = SCALAR_UNIT_FACTORS[lowerUnit];
    if (factor !== undefined) {
      return { value: baseNum * factor, unit: lowerUnit };
    }
  }

  return { value: baseNum, unit: rawUnit };
}

/**
 * Unescapes string literal escape sequences.
 */
function unescapeString(raw: string): string {
  return raw.replace(/\\(.)/g, (_match, ch: string) => {
    switch (ch) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "\\":
        return "\\";
      case '"':
        return '"';
      case "'":
        return "'";
      case "/":
        return "/";
      case "0":
        return "\0";
      default:
        return ch;
    }
  });
}

/**
 * Checks if a character is a valid identifier / field name start character.
 */
function isIdentStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

/**
 * Checks if a character is whitespace.
 */
function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * Lexer result containing generated tokens and any collected syntax errors.
 */
export interface TokenizeResult {
  tokens: SlqToken[];
  errors: SlqSyntaxError[];
}

/**
 * Tokenizes an SLQ query string into a stream of tokens with accurate offsets.
 */
export function tokenize(input: string): TokenizeResult {
  const tokens: SlqToken[] = [];
  const errors: SlqSyntaxError[] = [];

  const len = input.length;
  let pos = 0;
  let line = 1;
  let col = 1;

  function advance(count = 1): void {
    for (let i = 0; i < count; i++) {
      if (pos < len) {
        if (input[pos] === "\n") {
          line++;
          col = 1;
        } else {
          col++;
        }
        pos++;
      }
    }
  }

  function addToken(
    type: SlqTokenType,
    value: string,
    raw: string,
    start: number,
    end: number,
    startLine: number,
    startCol: number,
    extras?: { unit?: string; numericValue?: number },
  ): void {
    tokens.push({
      type,
      value,
      raw,
      start,
      end,
      line: startLine,
      column: startCol,
      unit: extras?.unit,
      numericValue: extras?.numericValue,
    });
  }

  function addError(
    message: string,
    code: SlqErrorCode,
    start: number,
    end: number,
    errLine: number,
    errCol: number,
    expected?: string[],
    found?: string,
  ): void {
    errors.push({
      message,
      code,
      start,
      end,
      line: errLine,
      column: errCol,
      expected,
      found,
    });
  }

  while (pos < len) {
    const ch = input[pos];

    // 1. Whitespace
    if (isWhitespace(ch)) {
      advance();
      continue;
    }

    const startPos = pos;
    const startLine = line;
    const startCol = col;

    // 2. Parentheses & Brackets & Commas
    if (ch === "(") {
      advance();
      addToken("LPAREN", "(", "(", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === ")") {
      advance();
      addToken("RPAREN", ")", ")", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "[") {
      advance();
      addToken("LBRACKET", "[", "[", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "]") {
      advance();
      addToken("RBRACKET", "]", "]", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === ",") {
      advance();
      addToken("COMMA", ",", ",", startPos, pos, startLine, startCol);
      continue;
    }

    // 3. Multi-character & Single-character operators
    // Range dots: ..
    if (ch === "." && pos + 1 < len && input[pos + 1] === ".") {
      advance(2);
      addToken("RANGE_DOTS", "..", "..", startPos, pos, startLine, startCol);
      continue;
    }

    // Logical AND operator: &&
    if (ch === "&" && pos + 1 < len && input[pos + 1] === "&") {
      advance(2);
      addToken("AND", "AND", "&&", startPos, pos, startLine, startCol);
      continue;
    }

    // Logical OR operator: ||
    if (ch === "|" && pos + 1 < len && input[pos + 1] === "|") {
      advance(2);
      addToken("OR", "OR", "||", startPos, pos, startLine, startCol);
      continue;
    }

    // Not equals: != or <>
    if (ch === "!" && pos + 1 < len && input[pos + 1] === "=") {
      advance(2);
      addToken("NOT_EQUALS", "!=", "!=", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "<" && pos + 1 < len && input[pos + 1] === ">") {
      advance(2);
      addToken("NOT_EQUALS", "<>", "<>", startPos, pos, startLine, startCol);
      continue;
    }

    // Comparison: >= or <= or == or ~=
    if (ch === ">" && pos + 1 < len && input[pos + 1] === "=") {
      advance(2);
      addToken("GTE", ">=", ">=", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "<" && pos + 1 < len && input[pos + 1] === "=") {
      advance(2);
      addToken("LTE", "<=", "<=", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "=" && pos + 1 < len && input[pos + 1] === "=") {
      advance(2);
      addToken("EQUALS", "==", "==", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "~" && pos + 1 < len && input[pos + 1] === "=") {
      advance(2);
      addToken("TILDE", "~=", "~=", startPos, pos, startLine, startCol);
      continue;
    }

    // Single char operators: :, =, >, <, ~, !
    if (ch === ":") {
      advance();
      addToken("COLON", ":", ":", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "=") {
      advance();
      addToken("EQUALS", "=", "=", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === ">") {
      advance();
      addToken("GT", ">", ">", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "<") {
      advance();
      addToken("LT", "<", "<", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "~") {
      advance();
      addToken("TILDE", "~", "~", startPos, pos, startLine, startCol);
      continue;
    }
    if (ch === "!") {
      advance();
      addToken("NOT", "NOT", "!", startPos, pos, startLine, startCol);
      continue;
    }

    // Unary minus '-' for negation: e.g. -status:error or -agent
    if (ch === "-" && pos + 1 < len && !isWhitespace(input[pos + 1]) && input[pos + 1] !== "-") {
      if (
        (input[pos + 1] >= "0" && input[pos + 1] <= "9") ||
        (input[pos + 1] === "." && pos + 2 < len && input[pos + 2] >= "0" && input[pos + 2] <= "9")
      ) {
        // Fall through to number parsing
      } else {
        advance();
        addToken("NOT", "NOT", "-", startPos, pos, startLine, startCol);
        continue;
      }
    }

    // 4. Quoted Strings ('...' or "...")
    if (ch === '"' || ch === "'") {
      const quote = ch;
      advance();
      let strContent = "";
      let escaped = false;
      let closed = false;

      while (pos < len) {
        const curr = input[pos];
        if (escaped) {
          strContent += "\\" + curr;
          escaped = false;
          advance();
        } else if (curr === "\\") {
          escaped = true;
          advance();
        } else if (curr === quote) {
          advance();
          closed = true;
          break;
        } else {
          strContent += curr;
          advance();
        }
      }

      const raw = input.slice(startPos, pos);
      if (!closed) {
        addError(
          `Unterminated string literal starting at line ${startLine}, column ${startCol}`,
          "UNTERMINATED_STRING",
          startPos,
          pos,
          startLine,
          startCol,
          [quote],
          raw,
        );
      }

      const unescaped = unescapeString(strContent);
      addToken("STRING", unescaped, raw, startPos, pos, startLine, startCol);
      continue;
    }

    // 5. Regex Literals: /pattern/flags
    if (ch === "/") {
      let isRegexCandidate = true;
      const prevToken = tokens[tokens.length - 1];
      if (prevToken && (prevToken.type === "BARE_WORD" || prevToken.type === "NUMBER")) {
        isRegexCandidate = false;
      }

      if (isRegexCandidate) {
        let patternPos = pos + 1;
        let regexEscaped = false;
        let regexClosed = false;

        while (patternPos < len) {
          const rCh = input[patternPos];
          if (regexEscaped) {
            regexEscaped = false;
            patternPos++;
          } else if (rCh === "\\") {
            regexEscaped = true;
            patternPos++;
          } else if (rCh === "/") {
            patternPos++;
            regexClosed = true;
            break;
          } else if (rCh === "\n" || rCh === "\r") {
            break;
          } else {
            patternPos++;
          }
        }

        if (regexClosed) {
          let flags = "";
          while (patternPos < len && /[a-z]/i.test(input[patternPos])) {
            flags += input[patternPos];
            patternPos++;
          }

          const rawRegex = input.slice(startPos, patternPos);
          const patternBody = input.slice(startPos + 1, patternPos - flags.length - 1);

          try {
            new RegExp(patternBody, flags);
            advance(patternPos - startPos);
            addToken("REGEX", rawRegex, rawRegex, startPos, pos, startLine, startCol);
            continue;
          } catch (e: unknown) {
            const err = e instanceof Error ? e.message : "Invalid regular expression";
            advance(patternPos - startPos);
            addError(
              `Invalid regular expression ${rawRegex}: ${err}`,
              "INVALID_REGEX",
              startPos,
              patternPos,
              startLine,
              startCol,
            );
            addToken("BARE_WORD", rawRegex, rawRegex, startPos, pos, startLine, startCol);
            continue;
          }
        }
      }
    }

    // 6. Currency numbers ($0.05)
    if (ch === "$" && pos + 1 < len && input[pos + 1] >= "0" && input[pos + 1] <= "9") {
      let numEnd = pos + 1;
      while (
        numEnd < len &&
        ((input[numEnd] >= "0" && input[numEnd] <= "9") || input[numEnd] === ".")
      ) {
        numEnd++;
      }
      const raw = input.slice(startPos, numEnd);
      const parsed = parseNumberWithUnit(raw);
      if (parsed) {
        advance(numEnd - startPos);
        addToken("NUMBER", String(parsed.value), raw, startPos, pos, startLine, startCol, {
          unit: parsed.unit,
          numericValue: parsed.value,
        });
        continue;
      }
    }

    // 7. Numbers with optional units (e.g. 500ms, 2s, 10k, 1.5M, 100kb, 42)
    const isNumStart =
      (ch >= "0" && ch <= "9") ||
      (ch === "-" && pos + 1 < len && input[pos + 1] >= "0" && input[pos + 1] <= "9") ||
      (ch === "." && pos + 1 < len && input[pos + 1] >= "0" && input[pos + 1] <= "9");

    if (isNumStart) {
      let numEnd = pos + 1;
      while (numEnd < len) {
        const c = input[numEnd];
        if (
          isWhitespace(c) ||
          c === ")" ||
          c === "]" ||
          c === "," ||
          c === ":" ||
          c === "=" ||
          c === ">" ||
          c === "<" ||
          c === "!" ||
          c === "&" ||
          c === "|" ||
          (c === "." && numEnd + 1 < len && input[numEnd + 1] === ".")
        ) {
          break;
        }
        numEnd++;
      }

      const candidate = input.slice(startPos, numEnd);
      const parsed = parseNumberWithUnit(candidate);
      if (parsed !== null) {
        advance(numEnd - startPos);
        addToken("NUMBER", String(parsed.value), candidate, startPos, pos, startLine, startCol, {
          unit: parsed.unit,
          numericValue: parsed.value,
        });
        continue;
      }
    }

    // 8. Identifiers, Keywords, and Bare Words
    let wordEnd = pos;
    while (wordEnd < len) {
      const c = input[wordEnd];
      if (
        isWhitespace(c) ||
        c === "(" ||
        c === ")" ||
        c === "[" ||
        c === "]" ||
        c === "," ||
        c === ":" ||
        c === "=" ||
        c === ">" ||
        c === "<" ||
        c === "~" ||
        c === "!" ||
        c === '"' ||
        c === "'" ||
        (c === "&" && wordEnd + 1 < len && input[wordEnd + 1] === "&") ||
        (c === "|" && wordEnd + 1 < len && input[wordEnd + 1] === "|") ||
        (c === "." && wordEnd + 1 < len && input[wordEnd + 1] === ".")
      ) {
        break;
      }
      wordEnd++;
    }

    if (wordEnd > pos) {
      const word = input.slice(startPos, wordEnd);
      advance(wordEnd - startPos);

      const upper = word.toUpperCase();
      if (upper === "AND") {
        addToken("AND", "AND", word, startPos, pos, startLine, startCol);
        continue;
      }
      if (upper === "OR") {
        addToken("OR", "OR", word, startPos, pos, startLine, startCol);
        continue;
      }
      if (upper === "NOT") {
        addToken("NOT", "NOT", word, startPos, pos, startLine, startCol);
        continue;
      }

      let nextPos = pos;
      while (nextPos < len && isWhitespace(input[nextPos])) {
        nextPos++;
      }
      const nextChar = nextPos < len ? input[nextPos] : "";
      const isFieldCandidate =
        nextChar === ":" ||
        nextChar === "=" ||
        nextChar === ">" ||
        nextChar === "<" ||
        nextChar === "~" ||
        (nextChar === "!" && nextPos + 1 < len && input[nextPos + 1] === "=");

      if (isFieldCandidate && isIdentStart(word[0])) {
        addToken("FIELD", word, word, startPos, pos, startLine, startCol);
      } else {
        addToken("BARE_WORD", word, word, startPos, pos, startLine, startCol);
      }
      continue;
    }

    const fallbackChar = input[pos];
    advance();
    addError(
      `Unexpected character '${fallbackChar}' at line ${startLine}, column ${startCol}`,
      "UNEXPECTED_TOKEN",
      startPos,
      pos,
      startLine,
      startCol,
      undefined,
      fallbackChar,
    );
  }

  addToken("EOF", "", "", pos, pos, line, col);

  return { tokens, errors };
}
