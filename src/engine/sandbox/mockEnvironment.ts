/**
 * Virtual File System & Built-in Mock Commands Registry.
 * Provides complete in-memory shell environment simulation with zero external process dependencies.
 * 100% Zero-any type-safe implementation.
 */

import type {
  MockCommandContext,
  MockCommandDefinition,
  MockCommandResult,
  MockEnvVariables,
  VirtualFileSystem,
} from "./types";

/**
 * Normalizes and resolves a virtual file path against the current working directory.
 */
export function resolvePath(cwd: string, targetPath: string): string {
  if (!targetPath) return cwd;
  const isAbsolute = targetPath.startsWith("/");
  const base = isAbsolute ? targetPath : `${cwd.replace(/\/+$/, "")}/${targetPath}`;

  const segments = base.split("/").filter((s) => s.length > 0 && s !== ".");
  const resolvedSegments: string[] = [];

  for (const seg of segments) {
    if (seg === "..") {
      resolvedSegments.pop();
    } else {
      resolvedSegments.push(seg);
    }
  }

  return `/${resolvedSegments.join("/")}`;
}

/**
 * Creates a default initial Virtual File System for sandbox experiments.
 */
export function createDefaultVirtualFileSystem(): VirtualFileSystem {
  const timestamp = new Date().toISOString();
  return {
    "/workspace/package.json": {
      path: "/workspace/package.json",
      content: JSON.stringify(
        {
          name: "gvui-app",
          version: "1.0.0",
          scripts: {
            test: "bun test",
            build: "vite build",
          },
          dependencies: {
            react: "^19.2.0",
          },
        },
        null,
        2,
      ),
      modifiedAt: timestamp,
    },
    "/workspace/README.md": {
      path: "/workspace/README.md",
      content: "# GVUI Command Sandbox\nInteractive terminal execution debugger.\n",
      modifiedAt: timestamp,
    },
    "/workspace/src/index.ts": {
      path: "/workspace/src/index.ts",
      content: "console.log('Hello from GVUI Sandbox!');\n",
      modifiedAt: timestamp,
    },
    "/workspace/.env": {
      path: "/workspace/.env",
      content: "PORT=3000\nNODE_ENV=development\nAPI_URL=https://api.example.com\n",
      modifiedAt: timestamp,
    },
    "/workspace/data/telemetry.log": {
      path: "/workspace/data/telemetry.log",
      content:
        "[INFO] 2026-08-15 12:00:00 - Telemetry initialized\n[WARN] 2026-08-15 12:00:05 - Retry count elevated: 3\n[ERROR] 2026-08-15 12:00:10 - Lock timeout on node-42\n",
      modifiedAt: timestamp,
    },
  };
}

/**
 * Creates default mock environment variables.
 */
export function createDefaultMockEnv(): MockEnvVariables {
  return {
    PATH: "/usr/local/bin:/usr/bin:/bin:/workspace/node_modules/.bin",
    HOME: "/root",
    USER: "agent-worker",
    SHELL: "/bin/bash",
    TERM: "xterm-256color",
    PWD: "/workspace",
    NODE_ENV: "test",
    COLORTERM: "truecolor",
  };
}

/**
 * Built-in mock command definitions.
 */
export function createDefaultMockCommands(): Record<string, MockCommandDefinition> {
  const commands: Record<string, MockCommandDefinition> = {
    // ----------------------------------------------------
    // echo
    // ----------------------------------------------------
    echo: {
      name: "echo",
      description: "Prints text arguments to stdout with escape and newline control",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        const noNewline = Boolean(ctx.flags.n);
        const interpretEscapes = Boolean(ctx.flags.e);

        const textArgs = ctx.args.filter(
          (a) => a !== "-n" && a !== "-e" && a !== "-ne" && a !== "-en",
        );
        let output = textArgs.join(" ");

        if (interpretEscapes) {
          // Replace \e and \033 with ANSI escape
          output = output
            .replace(/\\e/g, "\x1b")
            .replace(/\\033/g, "\x1b")
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\r/g, "\r");
        }

        if (!noNewline) {
          output += "\n";
        }

        return {
          exitCode: 0,
          stdout: output,
          stderr: "",
          executionTimeMs: 2,
        };
      },
    },

    // ----------------------------------------------------
    // printf
    // ----------------------------------------------------
    printf: {
      name: "printf",
      description: "Formats and prints text with ANSI escape codes",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        if (ctx.args.length === 0) {
          return { exitCode: 0, stdout: "", stderr: "", executionTimeMs: 1 };
        }
        const format = ctx.args[0] ?? "";
        let output = format
          .replace(/\\e/g, "\x1b")
          .replace(/\\033/g, "\x1b")
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\r/g, "\r")
          .replace(/%s/g, ctx.args.slice(1).join(" "));

        return {
          exitCode: 0,
          stdout: output,
          stderr: "",
          executionTimeMs: 2,
        };
      },
    },

    // ----------------------------------------------------
    // cat
    // ----------------------------------------------------
    cat: {
      name: "cat",
      description: "Concatenates file contents or standard input to stdout",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        if (ctx.args.length === 0 || (ctx.args.length === 1 && ctx.args[0] === "-")) {
          return {
            exitCode: 0,
            stdout: ctx.stdin,
            stderr: "",
            executionTimeMs: 3,
          };
        }

        let combined = "";
        let stderr = "";
        let hasError = false;

        for (const arg of ctx.args) {
          if (arg.startsWith("-") && arg !== "-") continue;
          const target = resolvePath(ctx.cwd, arg);
          const file = ctx.fs[target];
          if (file) {
            combined += file.content;
            if (!file.content.endsWith("\n")) combined += "\n";
          } else {
            hasError = true;
            stderr += `cat: ${arg}: No such file or directory\n`;
          }
        }

        return {
          exitCode: hasError ? 1 : 0,
          stdout: combined,
          stderr,
          executionTimeMs: 4,
        };
      },
    },

    // ----------------------------------------------------
    // ls
    // ----------------------------------------------------
    ls: {
      name: "ls",
      description: "Lists directory contents in the virtual filesystem",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        const showAll = Boolean(ctx.flags.a || ctx.flags.all);
        const longFormat = Boolean(ctx.flags.l);
        const onePerLine = Boolean(ctx.flags["1"]);

        const targetDir = resolvePath(ctx.cwd, ctx.args[0] ?? "");
        const prefix = targetDir === "/" ? "/" : `${targetDir}/`;

        const matchingPaths = Object.keys(ctx.fs).filter(
          (p) => p.startsWith(prefix) || p === targetDir,
        );

        const immediateChildren = new Set<string>();

        for (const p of matchingPaths) {
          if (p === targetDir) continue;
          const relative = p.slice(prefix.length);
          const firstSeg = relative.split("/")[0];
          if (firstSeg) {
            if (!showAll && firstSeg.startsWith(".")) continue;
            immediateChildren.add(firstSeg);
          }
        }

        const items = Array.from(immediateChildren).sort();

        if (items.length === 0 && !ctx.fs[targetDir]) {
          return {
            exitCode: 0,
            stdout: "",
            stderr: "",
            executionTimeMs: 2,
          };
        }

        let output = "";
        if (longFormat) {
          output = items
            .map(
              (item) => `-rw-r--r-- 1 ${ctx.env.USER ?? "agent"} staff 1024 Aug 15 12:00 ${item}`,
            )
            .join("\n");
          if (output.length > 0) output += "\n";
        } else if (onePerLine) {
          output = items.join("\n") + (items.length > 0 ? "\n" : "");
        } else {
          output = items.join("  ") + (items.length > 0 ? "\n" : "");
        }

        return {
          exitCode: 0,
          stdout: output,
          stderr: "",
          executionTimeMs: 3,
        };
      },
    },

    // ----------------------------------------------------
    // grep
    // ----------------------------------------------------
    grep: {
      name: "grep",
      description: "Searches text patterns in files or standard input",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        const isCaseInsensitive = Boolean(ctx.flags.i);
        const isInvert = Boolean(ctx.flags.v);
        const isCount = Boolean(ctx.flags.c);
        const isLineNumber = Boolean(ctx.flags.n);

        const pattern = ctx.args[0];
        if (!pattern) {
          return {
            exitCode: 2,
            stdout: "",
            stderr: "grep: missing search pattern\n",
            executionTimeMs: 2,
          };
        }

        const targetFiles = ctx.args.slice(1);
        let inputText = ctx.stdin;

        if (targetFiles.length > 0) {
          inputText = "";
          for (const fileArg of targetFiles) {
            const path = resolvePath(ctx.cwd, fileArg);
            const file = ctx.fs[path];
            if (file) {
              inputText += file.content;
            } else {
              return {
                exitCode: 2,
                stdout: "",
                stderr: `grep: ${fileArg}: No such file or directory\n`,
                executionTimeMs: 2,
              };
            }
          }
        }

        let regex: RegExp;
        try {
          regex = new RegExp(pattern, isCaseInsensitive ? "i" : "");
        } catch {
          regex = new RegExp(
            pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            isCaseInsensitive ? "i" : "",
          );
        }

        const lines = inputText.split("\n");
        const matchedLines: string[] = [];

        for (let idx = 0; idx < lines.length; idx++) {
          const line = lines[idx] ?? "";
          if (idx === lines.length - 1 && line === "") continue;

          const matches = regex.test(line);
          const isSelected = isInvert ? !matches : matches;

          if (isSelected) {
            if (isLineNumber) {
              matchedLines.push(`${idx + 1}:${line}`);
            } else {
              matchedLines.push(line);
            }
          }
        }

        if (isCount) {
          return {
            exitCode: matchedLines.length > 0 ? 0 : 1,
            stdout: `${matchedLines.length}\n`,
            stderr: "",
            executionTimeMs: 4,
          };
        }

        const output = matchedLines.length > 0 ? matchedLines.join("\n") + "\n" : "";

        return {
          exitCode: matchedLines.length > 0 ? 0 : 1,
          stdout: output,
          stderr: "",
          executionTimeMs: 4,
        };
      },
    },

    // ----------------------------------------------------
    // pwd
    // ----------------------------------------------------
    pwd: {
      name: "pwd",
      description: "Prints current working directory",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        return {
          exitCode: 0,
          stdout: `${ctx.cwd}\n`,
          stderr: "",
          executionTimeMs: 1,
        };
      },
    },

    // ----------------------------------------------------
    // touch
    // ----------------------------------------------------
    touch: {
      name: "touch",
      description: "Creates an empty file or updates timestamp",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        if (ctx.args.length === 0) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: "touch: missing file operand\n",
            executionTimeMs: 1,
          };
        }

        const modified: Record<string, string> = {};
        for (const arg of ctx.args) {
          const path = resolvePath(ctx.cwd, arg);
          const existing = ctx.fs[path];
          modified[path] = existing ? existing.content : "";
        }

        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          modifiedFiles: modified,
          executionTimeMs: 2,
        };
      },
    },

    // ----------------------------------------------------
    // head
    // ----------------------------------------------------
    head: {
      name: "head",
      description: "Outputs the first part of files or stdin",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        let count = 10;
        let fileArg: string | undefined;

        if (ctx.flags.n) {
          if (typeof ctx.flags.n === "string") {
            count = parseInt(ctx.flags.n, 10) || 10;
            fileArg = ctx.args[0];
          } else if (ctx.args.length > 0 && /^\d+$/.test(ctx.args[0] ?? "")) {
            count = parseInt(ctx.args[0] ?? "10", 10) || 10;
            fileArg = ctx.args[1];
          } else {
            fileArg = ctx.args[0];
          }
        } else {
          fileArg = ctx.args[0];
        }

        let content = ctx.stdin;
        if (fileArg) {
          const path = resolvePath(ctx.cwd, fileArg);
          const file = ctx.fs[path];
          if (file) content = file.content;
          else {
            return {
              exitCode: 1,
              stdout: "",
              stderr: `head: cannot open '${fileArg}': No such file\n`,
              executionTimeMs: 2,
            };
          }
        }

        const lines = content.replace(/\n$/, "").split("\n").slice(0, count);
        return {
          exitCode: 0,
          stdout: lines.join("\n") + (lines.length > 0 ? "\n" : ""),
          stderr: "",
          executionTimeMs: 2,
        };
      },
    },

    // ----------------------------------------------------
    // tail
    // ----------------------------------------------------
    tail: {
      name: "tail",
      description: "Outputs the last part of files or stdin",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        let count = 10;
        let fileArg: string | undefined;

        if (ctx.flags.n) {
          if (typeof ctx.flags.n === "string") {
            count = parseInt(ctx.flags.n, 10) || 10;
            fileArg = ctx.args[0];
          } else if (ctx.args.length > 0 && /^\d+$/.test(ctx.args[0] ?? "")) {
            count = parseInt(ctx.args[0] ?? "10", 10) || 10;
            fileArg = ctx.args[1];
          } else {
            fileArg = ctx.args[0];
          }
        } else {
          fileArg = ctx.args[0];
        }

        let content = ctx.stdin;
        if (fileArg) {
          const path = resolvePath(ctx.cwd, fileArg);
          const file = ctx.fs[path];
          if (file) content = file.content;
          else {
            return {
              exitCode: 1,
              stdout: "",
              stderr: `tail: cannot open '${fileArg}': No such file\n`,
              executionTimeMs: 2,
            };
          }
        }

        const lines = content.replace(/\n$/, "").split("\n");
        const sliced = lines.slice(-count);
        return {
          exitCode: 0,
          stdout: sliced.join("\n") + (sliced.length > 0 ? "\n" : ""),
          stderr: "",
          executionTimeMs: 2,
        };
      },
    },

    // ----------------------------------------------------
    // wc
    // ----------------------------------------------------
    wc: {
      name: "wc",
      description: "Prints newline, word, and byte counts for stdin or files",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        const countLinesOnly = Boolean(ctx.flags.l);
        const countWordsOnly = Boolean(ctx.flags.w);
        const countBytesOnly = Boolean(ctx.flags.c);

        let content = ctx.stdin;
        if (ctx.args.length > 0) {
          const path = resolvePath(ctx.cwd, ctx.args[0] ?? "");
          const file = ctx.fs[path];
          if (file) content = file.content;
        }

        const lines = content.length > 0 ? content.split("\n").length - 1 : 0;
        const words = content.trim().length > 0 ? content.trim().split(/\s+/).length : 0;
        const bytes = new TextEncoder().encode(content).length;

        let output = "";
        if (countLinesOnly) output = `      ${lines}\n`;
        else if (countWordsOnly) output = `      ${words}\n`;
        else if (countBytesOnly) output = `      ${bytes}\n`;
        else output = `      ${lines}      ${words}      ${bytes}\n`;

        return {
          exitCode: 0,
          stdout: output,
          stderr: "",
          executionTimeMs: 2,
        };
      },
    },

    // ----------------------------------------------------
    // sort
    // ----------------------------------------------------
    sort: {
      name: "sort",
      description: "Sorts lines of text files or standard input",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        const reverse = Boolean(ctx.flags.r);
        const numeric = Boolean(ctx.flags.n);
        const unique = Boolean(ctx.flags.u);

        let content = ctx.stdin;
        if (ctx.args.length > 0) {
          const path = resolvePath(ctx.cwd, ctx.args[0] ?? "");
          const file = ctx.fs[path];
          if (file) content = file.content;
        }

        let lines = content.split("\n").filter((l, idx, arr) => idx < arr.length - 1 || l !== "");

        if (unique) {
          lines = Array.from(new Set(lines));
        }

        lines.sort((a, b) => {
          if (numeric) {
            const numA = parseFloat(a) || 0;
            const numB = parseFloat(b) || 0;
            return numA - numB;
          }
          return a.localeCompare(b);
        });

        if (reverse) {
          lines.reverse();
        }

        return {
          exitCode: 0,
          stdout: lines.join("\n") + (lines.length > 0 ? "\n" : ""),
          stderr: "",
          executionTimeMs: 3,
        };
      },
    },

    // ----------------------------------------------------
    // uniq
    // ----------------------------------------------------
    uniq: {
      name: "uniq",
      description: "Reports or omits repeated lines in standard input",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        const showCount = Boolean(ctx.flags.c);
        const duplicatesOnly = Boolean(ctx.flags.d);
        const uniqueOnly = Boolean(ctx.flags.u);

        const lines = ctx.stdin
          .split("\n")
          .filter((l, idx, arr) => idx < arr.length - 1 || l !== "");
        const outputLines: string[] = [];

        let currentLine: string | null = null;
        let count = 0;

        const flush = () => {
          if (currentLine !== null) {
            const isDup = count > 1;
            if (
              (!duplicatesOnly && !uniqueOnly) ||
              (duplicatesOnly && isDup) ||
              (uniqueOnly && !isDup)
            ) {
              if (showCount) {
                outputLines.push(`   ${count} ${currentLine}`);
              } else {
                outputLines.push(currentLine);
              }
            }
          }
        };

        for (const line of lines) {
          if (line === currentLine) {
            count++;
          } else {
            flush();
            currentLine = line;
            count = 1;
          }
        }
        flush();

        return {
          exitCode: 0,
          stdout: outputLines.join("\n") + (outputLines.length > 0 ? "\n" : ""),
          stderr: "",
          executionTimeMs: 2,
        };
      },
    },

    // ----------------------------------------------------
    // env / printenv
    // ----------------------------------------------------
    env: {
      name: "env",
      description: "Prints environment variables",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        const entries = Object.entries(ctx.env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n");
        return {
          exitCode: 0,
          stdout: entries + (entries.length > 0 ? "\n" : ""),
          stderr: "",
          executionTimeMs: 1,
        };
      },
    },
    printenv: {
      name: "printenv",
      description: "Prints specific or all environment variables",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        if (ctx.args.length > 0) {
          const varName = ctx.args[0] ?? "";
          const val = ctx.env[varName];
          if (val !== undefined) {
            return { exitCode: 0, stdout: `${val}\n`, stderr: "", executionTimeMs: 1 };
          }
          return { exitCode: 1, stdout: "", stderr: "", executionTimeMs: 1 };
        }
        const entries = Object.entries(ctx.env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n");
        return {
          exitCode: 0,
          stdout: entries + (entries.length > 0 ? "\n" : ""),
          stderr: "",
          executionTimeMs: 1,
        };
      },
    },

    // ----------------------------------------------------
    // true / false
    // ----------------------------------------------------
    true: {
      name: "true",
      description: "Returns successful status (exit code 0)",
      customHandler: (): MockCommandResult => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
        executionTimeMs: 1,
      }),
    },
    false: {
      name: "false",
      description: "Returns failure status (exit code 1)",
      customHandler: (): MockCommandResult => ({
        exitCode: 1,
        stdout: "",
        stderr: "",
        executionTimeMs: 1,
      }),
    },

    // ----------------------------------------------------
    // git
    // ----------------------------------------------------
    git: {
      name: "git",
      description: "Mock git version control tool",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        const subcmd = ctx.args[0];
        if (subcmd === "status") {
          return {
            exitCode: 0,
            stdout:
              "On branch main\nYour branch is up to date with 'origin/main'.\n\nNothing to commit, working tree clean\n",
            stderr: "",
            executionTimeMs: 5,
          };
        }
        if (subcmd === "branch") {
          return {
            exitCode: 0,
            stdout: "* \x1b[32mmain\x1b[0m\n  feature/sandbox\n",
            stderr: "",
            executionTimeMs: 4,
          };
        }
        if (subcmd === "log") {
          return {
            exitCode: 0,
            stdout:
              "\x1b[33mcommit a72016a07b6914a5150d99f42a918ae92ffe80b9\x1b[0m (HEAD -> main)\nAuthor: Agent Worker <agent@gvui.local>\nDate:   Sat Aug 15 12:00:00 2026 -0700\n\n    feat: implement command sandbox replay\n",
            stderr: "",
            executionTimeMs: 6,
          };
        }
        return {
          exitCode: 0,
          stdout: `git version 2.45.0 (gvui-sandbox-mock)\n`,
          stderr: "",
          executionTimeMs: 3,
        };
      },
    },

    // ----------------------------------------------------
    // bun / node
    // ----------------------------------------------------
    bun: {
      name: "bun",
      description: "Mock Bun JavaScript/TypeScript runtime & test runner",
      customHandler: (ctx: MockCommandContext): MockCommandResult => {
        const subcmd = ctx.args[0];
        if (subcmd === "test") {
          return {
            exitCode: 0,
            stdout:
              "\x1b[1m\x1b[32m(pass)\x1b[0m commandParser.test.ts\n\x1b[1m\x1b[32m(pass)\x1b[0m ansiParser.test.ts\n\x1b[1m\x1b[32m(pass)\x1b[0m diffEngine.test.ts\n\x1b[1m\x1b[32m(pass)\x1b[0m simulator.test.ts\n\n\x1b[32m4 passed\x1b[0m, 0 failed, 48 total assertions\n",
            stderr: "",
            executionTimeMs: 15,
          };
        }
        if (subcmd === "--version" || subcmd === "-v") {
          return {
            exitCode: 0,
            stdout: "1.2.0\n",
            stderr: "",
            executionTimeMs: 2,
          };
        }
        return {
          exitCode: 0,
          stdout: `[bun mock] executed ${ctx.args.join(" ")}\n`,
          stderr: "",
          executionTimeMs: 5,
        };
      },
    },
  };

  return commands;
}
