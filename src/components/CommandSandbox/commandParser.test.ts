import { describe, expect, it } from "bun:test";
import {
  extractFlagsAndArgs,
  interpolateVariables,
  parseCommandLine,
  tokenizeShell,
} from "../../engine/sandbox/commandParser";

describe("commandParser Unit Tests", () => {
  describe("interpolateVariables", () => {
    const env = {
      NAME: "Alice",
      HOST: "localhost",
      EMPTY: "",
      "?": "0",
    };

    it("interpolates simple $VAR and ${VAR}", () => {
      expect(interpolateVariables("Hello $NAME", env)).toBe("Hello Alice");
      expect(interpolateVariables("http://${HOST}:3000", env)).toBe("http://localhost:3000");
    });

    it("interpolates default values ${VAR:-default}", () => {
      expect(interpolateVariables("${UNSET:-fallback}", env)).toBe("fallback");
      expect(interpolateVariables("${EMPTY:-fallback}", env)).toBe("fallback");
      expect(interpolateVariables("${NAME:-fallback}", env)).toBe("Alice");
    });

    it("interpolates alternate values ${VAR:+alt}", () => {
      expect(interpolateVariables("${NAME:+present}", env)).toBe("present");
      expect(interpolateVariables("${UNSET:+present}", env)).toBe("");
    });

    it("interpolates length ${#VAR}", () => {
      expect(interpolateVariables("${#NAME}", env)).toBe("5");
      expect(interpolateVariables("${#UNSET}", env)).toBe("0");
    });

    it("interpolates special variables $?", () => {
      expect(interpolateVariables("Exit was $?", env)).toBe("Exit was 0");
    });
  });

  describe("tokenizeShell", () => {
    it("tokenizes words and whitespace", () => {
      const tokens = tokenizeShell("echo hello world");
      expect(tokens.length).toBe(3);
      expect(tokens[0]!.type).toBe("word");
      expect(tokens[0]!.value).toBe("echo");
      expect(tokens[1]!.value).toBe("hello");
      expect(tokens[2]!.value).toBe("world");
    });

    it("tokenizes single and double quotes", () => {
      const tokens = tokenizeShell(`echo 'hello world' "foo bar"`);
      expect(tokens.length).toBe(3);
      expect(tokens[1]!.value).toBe("hello world");
      expect(tokens[2]!.value).toBe("foo bar");
    });

    it("tokenizes escape characters", () => {
      const tokens = tokenizeShell('echo "line1\\nline2"');
      expect(tokens[1]!.value).toBe("line1\nline2");
    });

    it("tokenizes operators: pipe, and, or, semicolon, background", () => {
      const tokens = tokenizeShell("cmd1 | cmd2 && cmd3 || cmd4 ; cmd5 &");
      const types = tokens.map((t) => t.type);
      expect(types).toEqual([
        "word",
        "pipe",
        "word",
        "and",
        "word",
        "or",
        "word",
        "semicolon",
        "word",
        "background",
      ]);
    });

    it("tokenizes redirects: >, >>, <, 2>, 2>&1, &>", () => {
      const tokens = tokenizeShell("cat < in.txt > out.txt 2> err.log >> app.log &> all.log 2>&1");
      const types = tokens.map((t) => t.type);
      expect(types).toContain("redirect_in");
      expect(types).toContain("redirect_out");
      expect(types).toContain("redirect_err");
      expect(types).toContain("redirect_append");
      expect(types).toContain("redirect_all");
      expect(types).toContain("redirect_err_merge");
    });

    it("tokenizes prefixed environment assignments", () => {
      const tokens = tokenizeShell("NODE_ENV=test PORT=8080 node server.js");
      expect(tokens[0]!.type).toBe("env_assign");
      expect(tokens[0]!.value).toBe("NODE_ENV=test");
      expect(tokens[1]!.type).toBe("env_assign");
      expect(tokens[1]!.value).toBe("PORT=8080");
      expect(tokens[2]!.type).toBe("word");
      expect(tokens[2]!.value).toBe("node");
    });
  });

  describe("extractFlagsAndArgs", () => {
    it("extracts short flags, long flags, and positional arguments", () => {
      const { flags, positional } = extractFlagsAndArgs([
        "-v",
        "-la",
        "--config=custom.json",
        "--port",
        "3000",
        "file1.txt",
        "file2.txt",
      ]);

      expect(flags.v).toBe(true);
      expect(flags.l).toBe(true);
      expect(flags.a).toBe(true);
      expect(flags.config).toBe("custom.json");
      expect(flags.port).toBe("3000");
      expect(positional).toEqual(["file1.txt", "file2.txt"]);
    });

    it("respects -- delimiter for positional arguments", () => {
      const { flags, positional } = extractFlagsAndArgs(["-v", "--", "-not-a-flag", "file.txt"]);
      expect(flags.v).toBe(true);
      expect(flags["not-a-flag"]).toBeUndefined();
      expect(positional).toEqual(["-not-a-flag", "file.txt"]);
    });
  });

  describe("parseCommandLine", () => {
    it("parses single command with args and flags", () => {
      const ast = parseCommandLine("bun test src/components --verbose");
      expect(ast.stages.length).toBe(1);
      expect(ast.stages[0]!.commands.length).toBe(1);
      const cmd = ast.stages[0]!.commands[0]!;
      expect(cmd.command).toBe("bun");
      expect(cmd.args).toEqual(["test", "src/components"]);
      expect(cmd.flags.verbose).toBe(true);
    });

    it("parses multi-stage pipeline with redirects and env variables", () => {
      const ast = parseCommandLine(
        "ENV=prod cat input.txt | grep error > output.log 2>&1 && echo done",
      );
      expect(ast.stages.length).toBe(2);
      expect(ast.stages[0]!.operator).toBe("and");

      const stage1Cmds = ast.stages[0]!.commands;
      expect(stage1Cmds.length).toBe(2);
      expect(stage1Cmds[0]!.envVars.ENV).toBe("prod");
      expect(stage1Cmds[0]!.command).toBe("cat");
      expect(stage1Cmds[1]!.command).toBe("grep");
      expect(stage1Cmds[1]!.redirects.length).toBe(2);
      expect(stage1Cmds[1]!.redirects[0]!.type).toBe("out");
      expect(stage1Cmds[1]!.redirects[0]!.target).toBe("output.log");
      expect(stage1Cmds[1]!.redirects[1]!.type).toBe("err_merge");

      const stage2Cmds = ast.stages[1]!.commands;
      expect(stage2Cmds[0]!.command).toBe("echo");
      expect(stage2Cmds[0]!.args).toEqual(["done"]);
    });

    it("detects syntax error when redirection target is missing", () => {
      const ast = parseCommandLine("echo 'hello' >");
      expect(ast.hasErrors).toBe(true);
      expect(ast.errors.length).toBeGreaterThan(0);
    });
  });
});
