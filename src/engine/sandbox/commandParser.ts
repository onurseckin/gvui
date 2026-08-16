/**
 * Shell Command Tokenizer, Parser, and AST Builder.
 * Handles pipes, redirects, quotes, environment variable expansions, flags, and operators.
 * 100% Zero-any type-safe implementation.
 */

import type {
  ParsedCommandLine,
  ParsedCommandNode,
  PipelineOperator,
  PipelineStage,
  RedirectType,
  ShellRedirect,
  ShellToken,
} from "./types";

/**
 * Interpolates environment variables into a string (${VAR}, $VAR, ${VAR:-default}, ${#VAR}).
 */
export function interpolateVariables(input: string, env: Record<string, string>): string {
  if (!input) return "";

  // Handle ${VAR:-default}, ${VAR:+alternate}, ${#VAR}, ${VAR}
  let result = input.replace(/\$\{([^}]+)\}/g, (_, expression: string) => {
    if (expression.startsWith("#")) {
      const varName = expression.slice(1);
      const val = env[varName] ?? "";
      return val.length.toString();
    }

    if (expression.includes(":-")) {
      const [varName, defaultVal] = expression.split(":-");
      const val = varName ? env[varName] : undefined;
      return val !== undefined && val !== "" ? val : (defaultVal ?? "");
    }

    if (expression.includes(":+")) {
      const [varName, alternateVal] = expression.split(":+");
      const val = varName ? env[varName] : undefined;
      return val !== undefined && val !== "" ? (alternateVal ?? "") : "";
    }

    return env[expression] ?? "";
  });

  // Handle simple $VAR
  result = result.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName: string) => {
    return env[varName] ?? "";
  });

  // Handle special variables: $?, $$, $0
  result = result.replace(/\$([?$0])/g, (_, special: string) => {
    if (special === "?") return env["?"] ?? "0";
    if (special === "$") return env["$"] ?? "1000";
    if (special === "0") return env["0"] ?? "sh";
    return "";
  });

  return result;
}

/**
 * Tokenizes a shell command string into a stream of ShellTokens.
 */
export function tokenizeShell(input: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i] ?? "";

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Comment
    if (char === "#") {
      const start = i;
      while (i < len && input[i] !== "\n") {
        i++;
      }
      tokens.push({
        type: "comment",
        value: input.substring(start, i),
        raw: input.substring(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Operators
    if (char === "&") {
      if (input[i + 1] === "&") {
        tokens.push({ type: "and", value: "&&", raw: "&&", start: i, end: i + 2 });
        i += 2;
        continue;
      }
      if (input[i + 1] === ">") {
        tokens.push({
          type: "redirect_all",
          value: "&>",
          raw: "&>",
          start: i,
          end: i + 2,
        });
        i += 2;
        continue;
      }
      tokens.push({
        type: "background",
        value: "&",
        raw: "&",
        start: i,
        end: i + 1,
      });
      i++;
      continue;
    }

    if (char === "|") {
      if (input[i + 1] === "|") {
        tokens.push({ type: "or", value: "||", raw: "||", start: i, end: i + 2 });
        i += 2;
        continue;
      }
      tokens.push({ type: "pipe", value: "|", raw: "|", start: i, end: i + 1 });
      i++;
      continue;
    }

    if (char === ";") {
      tokens.push({
        type: "semicolon",
        value: ";",
        raw: ";",
        start: i,
        end: i + 1,
      });
      i++;
      continue;
    }

    if (char === ">") {
      if (input[i + 1] === ">") {
        tokens.push({
          type: "redirect_append",
          value: ">>",
          raw: ">>",
          start: i,
          end: i + 2,
        });
        i += 2;
        continue;
      }
      tokens.push({
        type: "redirect_out",
        value: ">",
        raw: ">",
        start: i,
        end: i + 1,
      });
      i++;
      continue;
    }

    if (char === "<") {
      tokens.push({
        type: "redirect_in",
        value: "<",
        raw: "<",
        start: i,
        end: i + 1,
      });
      i++;
      continue;
    }

    // Check for 2>&1 or 2>
    if (char === "2" && input[i + 1] === ">") {
      if (input.substring(i, i + 4) === "2>&1") {
        tokens.push({
          type: "redirect_err_merge",
          value: "2>&1",
          raw: "2>&1",
          start: i,
          end: i + 4,
        });
        i += 4;
        continue;
      }
      tokens.push({
        type: "redirect_err",
        value: "2>",
        raw: "2>",
        start: i,
        end: i + 2,
      });
      i += 2;
      continue;
    }

    // Words, Quotes, and Environment assignments
    const start = i;
    let value = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;

    while (i < len) {
      const c = input[i] ?? "";

      if (c === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        i++;
        continue;
      }

      if (c === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        i++;
        continue;
      }

      if (c === "\\" && !inSingleQuote) {
        // Escape sequence
        const nextChar = input[i + 1] ?? "";
        if (nextChar === "n") value += "\n";
        else if (nextChar === "t") value += "\t";
        else if (nextChar === "r") value += "\r";
        else value += nextChar;
        i += 2;
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote) {
        if (/\s/.test(c) || c === "|" || c === "&" || c === ";" || c === ">" || c === "<") {
          break;
        }
      }

      value += c;
      i++;
    }

    const raw = input.substring(start, i);

    // Check if word is an environment variable assignment e.g. FOO=bar
    if (!inSingleQuote && !inDoubleQuote && /^[a-zA-Z_][a-zA-Z0-9_]*=/.test(value)) {
      tokens.push({
        type: "env_assign",
        value,
        raw,
        start,
        end: i,
      });
    } else {
      tokens.push({
        type: "word",
        value,
        raw,
        start,
        end: i,
      });
    }
  }

  return tokens;
}

/**
 * Parses argument array into flags and positional arguments.
 */
export function extractFlagsAndArgs(tokens: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i] ?? "";

    if (item === "--") {
      // End of options marker
      for (let j = i + 1; j < tokens.length; j++) {
        const nextArg = tokens[j];
        if (nextArg !== undefined) positional.push(nextArg);
      }
      break;
    }

    if (item.startsWith("--")) {
      const flagPart = item.slice(2);
      if (flagPart.includes("=")) {
        const [k, ...v] = flagPart.split("=");
        if (k) flags[k] = v.join("=");
      } else {
        const nextItem = tokens[i + 1];
        if (nextItem && !nextItem.startsWith("-")) {
          flags[flagPart] = nextItem;
          i++;
        } else {
          flags[flagPart] = true;
        }
      }
    } else if (item.startsWith("-") && item.length > 1 && item !== "-") {
      // Short flags (e.g. -v, -la, -i, -n, -e) are booleans
      const flagsCluster = item.slice(1);
      for (const char of flagsCluster) {
        flags[char] = true;
      }
    } else {
      positional.push(item);
    }
  }

  return { flags, positional };
}

/**
 * Parses full command line into structured AST representation.
 */
export function parseCommandLine(
  rawInput: string,
  env: Record<string, string> = {},
): ParsedCommandLine {
  const errors: string[] = [];
  const stages: PipelineStage[] = [];
  const allCommands: ParsedCommandNode[] = [];

  if (!rawInput.trim()) {
    return {
      raw: rawInput,
      stages: [],
      hasErrors: false,
      errors: [],
      allCommands: [],
    };
  }

  const tokens = tokenizeShell(rawInput);
  let currentCommands: ParsedCommandNode[] = [];
  let currentWords: string[] = [];
  let currentEnv: Record<string, string> = {};
  let currentRedirects: ShellRedirect[] = [];
  let nodeCount = 0;
  let stageCount = 0;

  const flushCommandNode = () => {
    if (currentWords.length === 0 && Object.keys(currentEnv).length === 0) {
      return;
    }

    const command = currentWords[0] ?? "";
    const rawArgs = currentWords.slice(1);

    // Interpolate environment variables
    const interpolatedArgs = rawArgs.map((arg) => interpolateVariables(arg, env));
    const { flags, positional } = extractFlagsAndArgs(interpolatedArgs);

    const node: ParsedCommandNode = {
      id: `cmd-${++nodeCount}`,
      command: interpolateVariables(command, env),
      args: positional,
      flags,
      envVars: { ...currentEnv },
      redirects: [...currentRedirects],
      raw: currentWords.join(" "),
      isBackground: false,
    };

    currentCommands.push(node);
    allCommands.push(node);

    currentWords = [];
    currentEnv = {};
    currentRedirects = [];
  };

  const flushStage = (op?: PipelineOperator) => {
    flushCommandNode();
    if (currentCommands.length > 0) {
      stages.push({
        id: `stage-${++stageCount}`,
        commands: [...currentCommands],
        operator: op,
        raw: currentCommands.map((c) => c.raw).join(op === "pipe" ? " | " : " "),
      });
      currentCommands = [];
    }
  };

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    if (!token) continue;

    switch (token.type) {
      case "comment":
        // Skip comments
        break;

      case "env_assign":
        if (currentWords.length === 0) {
          const eqIdx = token.value.indexOf("=");
          const k = token.value.substring(0, eqIdx);
          const v = token.value.substring(eqIdx + 1);
          currentEnv[k] = interpolateVariables(v, env);
        } else {
          currentWords.push(token.value);
        }
        break;

      case "word":
        currentWords.push(token.value);
        break;

      case "redirect_out":
      case "redirect_append":
      case "redirect_in":
      case "redirect_err":
      case "redirect_err_merge":
      case "redirect_all": {
        const nextToken = tokens[idx + 1];
        let target = "";
        let redirectType: RedirectType = "out";

        if (token.type === "redirect_append") redirectType = "append";
        else if (token.type === "redirect_in") redirectType = "in";
        else if (token.type === "redirect_err") redirectType = "err";
        else if (token.type === "redirect_err_merge") redirectType = "err_merge";
        else if (token.type === "redirect_all") redirectType = "all";

        if (token.type === "redirect_err_merge") {
          target = "&1";
        } else if (nextToken && nextToken.type === "word") {
          target = interpolateVariables(nextToken.value, env);
          idx++;
        } else {
          errors.push(`Missing redirection target after ${token.value}`);
        }

        currentRedirects.push({
          type: redirectType,
          target,
          fd: redirectType === "err" || redirectType === "err_merge" ? 2 : 1,
        });
        break;
      }

      case "pipe":
        flushCommandNode();
        break;

      case "and":
        flushStage("and");
        break;

      case "or":
        flushStage("or");
        break;

      case "semicolon":
        flushStage("semicolon");
        break;

      case "background":
        if (currentCommands.length > 0) {
          const lastCmd = currentCommands[currentCommands.length - 1];
          if (lastCmd) lastCmd.isBackground = true;
        }
        flushStage("background");
        break;
    }
  }

  flushStage();

  return {
    raw: rawInput,
    stages,
    hasErrors: errors.length > 0,
    errors,
    allCommands,
  };
}
