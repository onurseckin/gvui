/**
 * Stdout/Stderr & Terminal Output Diff Engine.
 * Implements LCS (Longest Common Subsequence) diffing with character-level granularity and summary metrics.
 * 100% Zero-any type-safe implementation.
 */

import { stripAnsi } from "./ansiParser";
import type {
  DiffCharSpan,
  DiffLine,
  DiffStreamFilter,
  DiffSummary,
  OutputStreamType,
  OutputDiffResult,
} from "./types";

/**
 * Computes Longest Common Subsequence (LCS) matrix between two string arrays.
 */
function computeLcsMatrix(seqA: string[], seqB: string[]): number[][] {
  const m = seqA.length;
  const n = seqB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    const itemA = seqA[i - 1];
    for (let j = 1; j <= n; j++) {
      const itemB = seqB[j - 1];
      if (itemA === itemB) {
        dp[i]![j] = (dp[i - 1]![j - 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j] ?? 0, dp[i]![j - 1] ?? 0);
      }
    }
  }

  return dp;
}

/**
 * Computes character-level differences between two strings for highlighting modified lines.
 */
export function computeCharSpans(
  actual: string,
  expected: string,
): { spansActual: DiffCharSpan[]; spansExpected: DiffCharSpan[] } {
  const charsA = Array.from(actual);
  const charsB = Array.from(expected);

  const dp = computeLcsMatrix(charsA, charsB);
  let i = charsA.length;
  let j = charsB.length;

  const rawSpansA: DiffCharSpan[] = [];
  const rawSpansB: DiffCharSpan[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && charsA[i - 1] === charsB[j - 1]) {
      const ch = charsA[i - 1] ?? "";
      rawSpansA.unshift({ text: ch, type: "unchanged" });
      rawSpansB.unshift({ text: ch, type: "unchanged" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || (dp[i]![j - 1] ?? 0) >= (dp[i - 1]![j] ?? 0))) {
      const ch = charsB[j - 1] ?? "";
      rawSpansB.unshift({ text: ch, type: "added" });
      j--;
    } else if (i > 0 && (j === 0 || (dp[i]![j - 1] ?? 0) < (dp[i - 1]![j] ?? 0))) {
      const ch = charsA[i - 1] ?? "";
      rawSpansA.unshift({ text: ch, type: "removed" });
      i--;
    }
  }

  // Merge adjacent spans of the same type for cleaner rendering
  const mergeSpans = (spans: DiffCharSpan[]): DiffCharSpan[] => {
    const merged: DiffCharSpan[] = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last && last.type === span.type) {
        last.text += span.text;
      } else {
        merged.push({ ...span });
      }
    }
    return merged;
  };

  return {
    spansActual: mergeSpans(rawSpansA),
    spansExpected: mergeSpans(rawSpansB),
  };
}

/**
 * Computes similarity ratio (0.0 to 100.0) between two strings based on LCS.
 */
export function computeSimilarity(a: string, b: string): number {
  if (a === b) return 100.0;
  if (!a && !b) return 100.0;
  if (!a || !b) return 0.0;

  const charsA = Array.from(a);
  const charsB = Array.from(b);
  const dp = computeLcsMatrix(charsA, charsB);
  const lcsLength = dp[charsA.length]?.[charsB.length] ?? 0;
  const totalLength = Math.max(charsA.length, charsB.length);

  if (totalLength === 0) return 100.0;
  return Math.round((lcsLength / totalLength) * 1000) / 10;
}

/**
 * Diffs two text blocks line by line using LCS diff algorithm.
 */
export function diffTextLines(
  actualText: string,
  expectedText: string,
  stream: OutputStreamType = "stdout",
): OutputDiffResult {
  const cleanActual = stripAnsi(actualText).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cleanExpected = stripAnsi(expectedText).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const linesActual = cleanActual.length > 0 ? cleanActual.split("\n") : [];
  const linesExpected = cleanExpected.length > 0 ? cleanExpected.split("\n") : [];

  const dp = computeLcsMatrix(linesActual, linesExpected);
  let i = linesActual.length;
  let j = linesExpected.length;

  const rawDiff: Array<{
    type: "unchanged" | "added" | "removed";
    actual?: { line: string; num: number };
    expected?: { line: string; num: number };
  }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesActual[i - 1] === linesExpected[j - 1]) {
      rawDiff.unshift({
        type: "unchanged",
        actual: { line: linesActual[i - 1] ?? "", num: i },
        expected: { line: linesExpected[j - 1] ?? "", num: j },
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || (dp[i]![j - 1] ?? 0) >= (dp[i - 1]![j] ?? 0))) {
      rawDiff.unshift({
        type: "added",
        expected: { line: linesExpected[j - 1] ?? "", num: j },
      });
      j--;
    } else if (i > 0 && (j === 0 || (dp[i]![j - 1] ?? 0) < (dp[i - 1]![j] ?? 0))) {
      rawDiff.unshift({
        type: "removed",
        actual: { line: linesActual[i - 1] ?? "", num: i },
      });
      i--;
    }
  }

  // Post-process to detect modified pairs (removed followed directly by added)
  const diffLines: DiffLine[] = [];
  let unchangedCount = 0;
  let addedCount = 0;
  let removedCount = 0;
  let modifiedCount = 0;
  let lineId = 0;

  for (let k = 0; k < rawDiff.length; k++) {
    const curr = rawDiff[k];
    const next = rawDiff[k + 1];

    if (curr && curr.type === "removed" && next && next.type === "added") {
      // Pair into a modified line
      const contentAct = curr.actual?.line ?? "";
      const contentExp = next.expected?.line ?? "";
      const { spansActual, spansExpected } = computeCharSpans(contentAct, contentExp);

      diffLines.push({
        id: `${stream}-diff-line-${++lineId}`,
        type: "modified",
        lineNumberActual: curr.actual?.num,
        lineNumberExpected: next.expected?.num,
        contentActual: contentAct,
        contentExpected: contentExp,
        spansActual,
        spansExpected,
        stream,
      });
      modifiedCount++;
      k++; // Skip next because it was paired
    } else if (curr && curr.type === "unchanged") {
      diffLines.push({
        id: `${stream}-diff-line-${++lineId}`,
        type: "unchanged",
        lineNumberActual: curr.actual?.num,
        lineNumberExpected: curr.expected?.num,
        contentActual: curr.actual?.line,
        contentExpected: curr.expected?.line,
        stream,
      });
      unchangedCount++;
    } else if (curr && curr.type === "added") {
      diffLines.push({
        id: `${stream}-diff-line-${++lineId}`,
        type: "added",
        lineNumberExpected: curr.expected?.num,
        contentExpected: curr.expected?.line,
        stream,
      });
      addedCount++;
    } else if (curr && curr.type === "removed") {
      diffLines.push({
        id: `${stream}-diff-line-${++lineId}`,
        type: "removed",
        lineNumberActual: curr.actual?.num,
        contentActual: curr.actual?.line,
        stream,
      });
      removedCount++;
    }
  }

  const similarity = computeSimilarity(cleanActual, cleanExpected);
  const isExact = cleanActual === cleanExpected;

  const summary: DiffSummary = {
    totalLinesActual: linesActual.length,
    totalLinesExpected: linesExpected.length,
    unchangedLines: unchangedCount,
    addedLines: addedCount,
    removedLines: removedCount,
    modifiedLines: modifiedCount,
    similarityPercent: similarity,
    isExactMatch: isExact,
    exitCodeActual: 0,
    exitCodeExpected: 0,
    exitCodeMatches: true,
    stdoutMatches: isExact,
    stderrMatches: true,
  };

  return {
    lines: diffLines,
    summary,
  };
}

/**
 * Performs full multi-stream diff comparing actual execution output against expected baselines.
 */
export function diffOutputs(
  actualStdout: string,
  actualStderr: string,
  actualExitCode: number,
  expectedStdout: string,
  expectedStderr: string,
  expectedExitCode: number,
  filter: DiffStreamFilter = "all",
): OutputDiffResult {
  const stdoutDiff = diffTextLines(actualStdout, expectedStdout, "stdout");
  const stderrDiff = diffTextLines(actualStderr, expectedStderr, "stderr");

  const stdoutClean = stripAnsi(actualStdout).trim();
  const expStdoutClean = stripAnsi(expectedStdout).trim();
  const stderrClean = stripAnsi(actualStderr).trim();
  const expStderrClean = stripAnsi(expectedStderr).trim();

  const stdoutMatches = stdoutClean === expStdoutClean;
  const stderrMatches = stderrClean === expStderrClean;
  const exitCodeMatches = actualExitCode === expectedExitCode;

  let combinedLines: DiffLine[] = [];

  if (filter === "stdout") {
    combinedLines = stdoutDiff.lines;
  } else if (filter === "stderr") {
    combinedLines = stderrDiff.lines;
  } else {
    // Combine stdout and stderr lines
    combinedLines = [...stdoutDiff.lines, ...stderrDiff.lines];
  }

  const totalLinesAct = stdoutDiff.summary.totalLinesActual + stderrDiff.summary.totalLinesActual;
  const totalLinesExp =
    stdoutDiff.summary.totalLinesExpected + stderrDiff.summary.totalLinesExpected;
  const unchangedTotal = stdoutDiff.summary.unchangedLines + stderrDiff.summary.unchangedLines;
  const addedTotal = stdoutDiff.summary.addedLines + stderrDiff.summary.addedLines;
  const removedTotal = stdoutDiff.summary.removedLines + stderrDiff.summary.removedLines;
  const modifiedTotal = stdoutDiff.summary.modifiedLines + stderrDiff.summary.modifiedLines;

  const stdoutSim = stdoutDiff.summary.similarityPercent;
  const stderrSim = stderrDiff.summary.similarityPercent;
  const avgSim = Math.round(((stdoutSim + stderrSim) / 2) * 10) / 10;

  const isExact = stdoutMatches && stderrMatches && exitCodeMatches;

  const summary: DiffSummary = {
    totalLinesActual: totalLinesAct,
    totalLinesExpected: totalLinesExp,
    unchangedLines: unchangedTotal,
    addedLines: addedTotal,
    removedLines: removedTotal,
    modifiedLines: modifiedTotal,
    similarityPercent: isExact ? 100.0 : avgSim,
    isExactMatch: isExact,
    exitCodeActual: actualExitCode,
    exitCodeExpected: expectedExitCode,
    exitCodeMatches,
    stdoutMatches,
    stderrMatches,
  };

  return {
    lines: combinedLines,
    summary,
  };
}
