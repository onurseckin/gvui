import { describe, expect, it } from "bun:test";
import {
  computeCharSpans,
  computeSimilarity,
  diffOutputs,
  diffTextLines,
} from "../../engine/sandbox/diffEngine";

describe("diffEngine Unit Tests", () => {
  describe("computeSimilarity", () => {
    it("returns 100.0 for identical strings", () => {
      expect(computeSimilarity("test output", "test output")).toBe(100.0);
      expect(computeSimilarity("", "")).toBe(100.0);
    });

    it("returns 0.0 when one string is empty", () => {
      expect(computeSimilarity("some text", "")).toBe(0.0);
      expect(computeSimilarity("", "some text")).toBe(0.0);
    });

    it("returns proportional percentage for partially matching strings", () => {
      const sim = computeSimilarity("hello world", "hello friend");
      expect(sim).toBeGreaterThan(50);
      expect(sim).toBeLessThan(100);
    });
  });

  describe("computeCharSpans", () => {
    it("identifies character additions, deletions, and unchanged parts", () => {
      const actual = "const x = 10;";
      const expected = "const y = 10;";
      const { spansActual, spansExpected } = computeCharSpans(actual, expected);

      expect(spansActual.length).toBeGreaterThan(0);
      expect(spansExpected.length).toBeGreaterThan(0);

      const unchangedA = spansActual
        .filter((s) => s.type === "unchanged")
        .map((s) => s.text)
        .join("");
      expect(unchangedA).toBe("const  = 10;");

      const removed = spansActual.find((s) => s.type === "removed");
      expect(removed?.text).toBe("x");

      const added = spansExpected.find((s) => s.type === "added");
      expect(added?.text).toBe("y");
    });
  });

  describe("diffTextLines", () => {
    it("detects exact matching multiline texts", () => {
      const text = "Line 1\nLine 2\nLine 3";
      const result = diffTextLines(text, text);
      expect(result.summary.isExactMatch).toBe(true);
      expect(result.summary.unchangedLines).toBe(3);
      expect(result.summary.addedLines).toBe(0);
      expect(result.summary.removedLines).toBe(0);
      expect(result.summary.modifiedLines).toBe(0);
    });

    it("detects additions and removals", () => {
      const actual = "Line 1\nLine 2\nLine Extra";
      const expected = "Line 1\nLine 2";
      const result = diffTextLines(actual, expected);
      expect(result.summary.isExactMatch).toBe(false);
      expect(result.summary.unchangedLines).toBe(2);
      expect(result.summary.removedLines).toBe(1);
    });

    it("pairs consecutive removed and added lines as modified", () => {
      const actual = "apple\nbanana\norange";
      const expected = "apple\nblueberry\norange";
      const result = diffTextLines(actual, expected);
      expect(result.summary.modifiedLines).toBe(1);
      const modLine = result.lines.find((l) => l.type === "modified");
      expect(modLine?.contentActual).toBe("banana");
      expect(modLine?.contentExpected).toBe("blueberry");
    });
  });

  describe("diffOutputs", () => {
    it("compares stdout, stderr, and exit codes accurately", () => {
      const actStdout = "Test passed: 10\n";
      const actStderr = "";
      const expStdout = "Test passed: 10\n";
      const expStderr = "";

      const result = diffOutputs(actStdout, actStderr, 0, expStdout, expStderr, 0, "all");
      expect(result.summary.isExactMatch).toBe(true);
      expect(result.summary.exitCodeMatches).toBe(true);
      expect(result.summary.stdoutMatches).toBe(true);
      expect(result.summary.stderrMatches).toBe(true);
    });

    it("flags exit code and stderr mismatches", () => {
      const actStdout = "";
      const actStderr = "Error: Timeout reached\n";
      const expStdout = "Success\n";
      const expStderr = "";

      const result = diffOutputs(actStdout, actStderr, 1, expStdout, expStderr, 0, "all");
      expect(result.summary.isExactMatch).toBe(false);
      expect(result.summary.exitCodeMatches).toBe(false);
      expect(result.summary.stdoutMatches).toBe(false);
      expect(result.summary.stderrMatches).toBe(false);
    });

    it("filters diff output stream by stdout or stderr", () => {
      const actStdout = "stdout 1\nstdout 2\n";
      const actStderr = "stderr 1\n";
      const expStdout = "stdout 1\nstdout 2\n";
      const expStderr = "stderr 1\n";

      const stdoutOnly = diffOutputs(actStdout, actStderr, 0, expStdout, expStderr, 0, "stdout");
      expect(stdoutOnly.lines.every((l) => l.stream === "stdout")).toBe(true);

      const stderrOnly = diffOutputs(actStdout, actStderr, 0, expStdout, expStderr, 0, "stderr");
      expect(stderrOnly.lines.every((l) => l.stream === "stderr")).toBe(true);
    });
  });
});
