import {
  IconAlertTriangle,
  IconBan,
  IconBug,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconFileCode,
  IconFileDiff,
  IconMaximize,
  IconPhotoOff,
  IconQuote,
  IconScale,
  IconSearch,
  IconShieldCheck,
  IconTerminal,
  IconX,
} from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import type { FindingDetail, GraphNodeData } from "../../../types/graphData";
import { DiffViewer } from "../DiffViewer";
import { DrawerSection } from "../DrawerSection";
import { LightboxDialog } from "../LightboxDialog";
import { readAssets, resolveAssetIds } from "../nodeSchema";
import { copyToClipboard, normalizeAssetUrl } from "../streamUtils";

export interface StackFrame {
  raw: string;
  functionName?: string;
  filePath?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  isInternal: boolean;
  isNative?: boolean;
}

export interface StructuredError {
  id: string;
  name: string;
  message: string;
  rawStack?: string;
  frames: StackFrame[];
  phase?: string;
  code?: string | number;
  source?: string;
  timestamp?: string;
}

export interface AdversarialAuditQuote {
  id: string;
  author?: string;
  role?: string;
  quote: string;
  requirementId?: string;
  round?: number;
  severity?: "critical" | "important" | "suggestion" | string;
  timestamp?: string;
}

export interface RemediationPatch {
  id: string;
  findingId?: string;
  round?: number;
  title?: string;
  explanation?: string;
  filePath?: string;
  diff?: string;
  beforeSnippet?: string;
  afterSnippet?: string;
  status?: "open" | "resolved" | "applied" | string;
  author?: string;
  additions?: number;
  deletions?: number;
}

export interface PushbackFindingItem extends FindingDetail {
  auditQuote?: string;
  adversarialQuote?: string;
  criticQuote?: string;
  quote?: string;
  author?: string;
  round?: number;
  error?: string | StructuredError | Record<string, unknown>;
  stackTrace?: string;
  stack?: string;
  remediationPatch?: string;
  patch?: string;
  diff?: string;
  beforeSnippet?: string;
  afterSnippet?: string;
  codeSnippet?: string;
  remediationGoal?: string;
  resolutionMethod?: string;
  resolutionEvidence?: string[];
  frames?: StackFrame[];
}

/**
 * Parses unstructured stack trace text into structured stack frames.
 * Supports V8/Node.js, Bun/WebKit, Python tracebacks, panics, and compiler formats.
 */
export function parseStackTrace(
  rawStack?: string,
  defaultName = "Error",
  defaultMessage = "",
): StructuredError {
  if (!rawStack || typeof rawStack !== "string" || !rawStack.trim()) {
    return {
      id: `err-${Math.random().toString(36).slice(2, 9)}`,
      name: defaultName,
      message: defaultMessage,
      frames: [],
    };
  }

  const lines = rawStack.split(/\r?\n/).map((l) => l.trimEnd());
  const nonBlank = lines.filter((l) => l.trim().length > 0);

  let errorName = defaultName;
  let errorMessage = defaultMessage;
  const frames: StackFrame[] = [];

  const first = nonBlank[0]?.trim() ?? "";
  const last = nonBlank[nonBlank.length - 1]?.trim() ?? "";

  let startIndex = 0;
  let endIndex = lines.length;

  if (nonBlank.length > 0) {
    if (first.startsWith("Traceback (most recent call last)") || first.startsWith("Traceback ")) {
      errorName = "Traceback (most recent call last)";
      startIndex = 1;
      if (
        last &&
        (last.includes("Error:") ||
          last.includes("Exception:") ||
          last.includes("Panic:") ||
          last.includes("ValueError:"))
      ) {
        errorMessage = last;
        endIndex = lines.length - 1;
      }
    } else {
      const colonIdx = first.indexOf(":");
      if (
        colonIdx > 0 &&
        (first.endsWith("Error") ||
          first.includes("Error:") ||
          first.includes("Exception:") ||
          first.includes("AssertionError") ||
          first.includes("Panic") ||
          first.includes("HarnessError") ||
          first.includes("GateFailure"))
      ) {
        errorName = first.slice(0, colonIdx).trim();
        errorMessage = first.slice(colonIdx + 1).trim();
        startIndex = 1;
      } else if (
        first.startsWith("Error:") ||
        first.startsWith("TypeError:") ||
        first.startsWith("ReferenceError:") ||
        first.startsWith("SyntaxError:") ||
        first.startsWith("AssertionError:")
      ) {
        const parts = first.split(":");
        errorName = parts[0]?.trim() ?? "Error";
        errorMessage = parts.slice(1).join(":").trim();
        startIndex = 1;
      } else if (!defaultMessage && !first.startsWith("at ") && !first.includes("@")) {
        errorMessage = first;
        startIndex = 1;
      }
    }
  }

  // 2. Parse frame lines
  for (let i = startIndex; i < endIndex; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    if (line.startsWith("Traceback ")) continue;

    // V8 format: at functionName (/path/to/file.ts:12:34) OR at /path/to/file.ts:12:34
    const v8ParenMatch = line.match(/^at\s+(?:async\s+)?(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
    if (v8ParenMatch) {
      const func = v8ParenMatch[1]?.trim();
      const path = v8ParenMatch[2]?.trim();
      const lineNo = parseInt(v8ParenMatch[3] ?? "0", 10);
      const colNo = parseInt(v8ParenMatch[4] ?? "0", 10);
      const fileName = path?.split("/").pop() ?? path;
      const isInternal = Boolean(
        path &&
        (path.includes("node_modules") ||
          path.startsWith("node:") ||
          path.startsWith("bun:") ||
          path.includes("internal/") ||
          path === "<anonymous>"),
      );

      frames.push({
        raw: line,
        functionName: func,
        filePath: path,
        fileName,
        lineNumber: lineNo > 0 ? lineNo : undefined,
        columnNumber: colNo > 0 ? colNo : undefined,
        isInternal,
      });
      continue;
    }

    const v8NoParenMatch = line.match(/^at\s+(?:async\s+)?(.+?):(\d+):(\d+)$/);
    if (v8NoParenMatch) {
      const path = v8NoParenMatch[1]?.trim();
      const lineNo = parseInt(v8NoParenMatch[2] ?? "0", 10);
      const colNo = parseInt(v8NoParenMatch[3] ?? "0", 10);
      const fileName = path?.split("/").pop() ?? path;
      const isInternal = Boolean(
        path &&
        (path.includes("node_modules") ||
          path.startsWith("node:") ||
          path.startsWith("bun:") ||
          path.includes("internal/") ||
          path === "<anonymous>"),
      );

      frames.push({
        raw: line,
        filePath: path,
        fileName,
        lineNumber: lineNo > 0 ? lineNo : undefined,
        columnNumber: colNo > 0 ? colNo : undefined,
        isInternal,
      });
      continue;
    }

    // Bun / WebKit format: functionName@/path/to/file.ts:12:34 or @/path/to/file.ts:12:34
    const bunMatch = line.match(/^(?:([^@]*)@)?(.+?):(\d+):(\d+)$/);
    if (bunMatch) {
      const func = bunMatch[1]?.trim() || undefined;
      const path = bunMatch[2]?.trim();
      const lineNo = parseInt(bunMatch[3] ?? "0", 10);
      const colNo = parseInt(bunMatch[4] ?? "0", 10);
      const fileName = path?.split("/").pop() ?? path;
      const isInternal = Boolean(
        path &&
        (path.includes("node_modules") ||
          path.startsWith("node:") ||
          path.startsWith("bun:") ||
          path.includes("internal/") ||
          path === "<anonymous>"),
      );

      frames.push({
        raw: line,
        functionName: func,
        filePath: path,
        fileName,
        lineNumber: lineNo > 0 ? lineNo : undefined,
        columnNumber: colNo > 0 ? colNo : undefined,
        isInternal,
      });
      continue;
    }

    // Python format: File "/path/to/file.py", line 42, in my_func
    const pyMatch = line.match(/^File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+(.+))?$/);
    if (pyMatch) {
      const path = pyMatch[1]?.trim();
      const lineNo = parseInt(pyMatch[2] ?? "0", 10);
      const func = pyMatch[3]?.trim();
      const fileName = path?.split("/").pop() ?? path;
      const isInternal = Boolean(
        path &&
        (path.includes("site-packages") ||
          path.includes("lib/python") ||
          path.includes("<string>")),
      );

      frames.push({
        raw: line,
        functionName: func,
        filePath: path,
        fileName,
        lineNumber: lineNo > 0 ? lineNo : undefined,
        isInternal,
      });
      continue;
    }

    if (first.startsWith("Traceback ") && i === lines.length - 1 && line.includes(":")) {
      const pyParts = line.split(":");
      errorName = pyParts[0]?.trim() ?? errorName;
      errorMessage = pyParts.slice(1).join(":").trim() || errorMessage;
      continue;
    }

    // Generic frame fallback (e.g. panics, compiler frames)
    frames.push({
      raw: line,
      isInternal:
        line.includes("node_modules") || line.startsWith("node:") || line.startsWith("bun:"),
    });
  }

  return {
    id: `err-${Math.random().toString(36).slice(2, 9)}`,
    name: errorName || "Error",
    message: errorMessage,
    rawStack,
    frames,
  };
}

/**
 * Robust extraction of structured errors from various node metadata locations.
 */
export function extractStructuredErrors(node: GraphNodeData): StructuredError[] {
  const errors: StructuredError[] = [];
  const meta = node.metadata;

  // 1. Direct metadata error object / string
  if (meta?.error) {
    if (typeof meta.error === "string") {
      errors.push(parseStackTrace(meta.error, "ExecutionError", meta.error.split("\n")[0] ?? ""));
    } else if (typeof meta.error === "object" && meta.error !== null) {
      const errObj = meta.error as unknown as Record<string, unknown>;
      const stack = typeof errObj.stack === "string" ? errObj.stack : undefined;
      const msg =
        typeof errObj.message === "string"
          ? errObj.message
          : typeof errObj.detail === "string"
            ? errObj.detail
            : typeof errObj.error === "string"
              ? errObj.error
              : JSON.stringify(errObj);
      const name = typeof errObj.name === "string" ? errObj.name : "Error";
      const parsed = parseStackTrace(stack ?? msg, name, msg);
      if (typeof errObj.phase === "string") parsed.phase = errObj.phase;
      if (typeof errObj.code === "string" || typeof errObj.code === "number")
        parsed.code = errObj.code;
      errors.push(parsed);
    }
  }

  // 2. Direct metadata stackTrace / stack
  if (typeof meta?.stackTrace === "string" && meta.stackTrace.trim()) {
    errors.push(parseStackTrace(meta.stackTrace, "RuntimeError", "Stack trace recorded"));
  } else if (typeof meta?.stack === "string" && meta.stack.trim()) {
    errors.push(parseStackTrace(meta.stack, "RuntimeError", "Stack trace recorded"));
  }

  // 3. Metadata errors array
  if (Array.isArray(meta?.errors)) {
    for (const err of meta.errors) {
      if (typeof err === "string") {
        errors.push(parseStackTrace(err, "Error", err.split("\n")[0] ?? ""));
      } else if (typeof err === "object" && err !== null) {
        const errObj = err as unknown as Record<string, unknown>;
        const stack = typeof errObj.stack === "string" ? errObj.stack : undefined;
        const msg =
          typeof errObj.message === "string"
            ? errObj.message
            : typeof errObj.detail === "string"
              ? errObj.detail
              : "Error occurred";
        const name = typeof errObj.name === "string" ? errObj.name : "Error";
        errors.push(parseStackTrace(stack ?? msg, name, msg));
      }
    }
  }

  // 4. Failed command executions with stderr stack traces
  if (Array.isArray(meta?.commands)) {
    for (const cmd of meta.commands) {
      if (cmd && cmd.exitCode !== 0) {
        const stderr = cmd.stderrSnippet ?? cmd.stderrTail;
        if (stderr && stderr.trim()) {
          const cmdTitle = Array.isArray(cmd.argv) ? cmd.argv.join(" ") : String(cmd.argv);
          const parsed = parseStackTrace(
            stderr,
            `CommandError (Exit ${cmd.exitCode})`,
            `Command failed: ${cmdTitle}`,
          );
          if (!parsed.name.includes("CommandError")) {
            parsed.name = `CommandError (Exit ${cmd.exitCode}): ${parsed.name}`;
          }
          parsed.source = cmdTitle;
          errors.push(parsed);
        }
      }
    }
  }

  // 5. Findings with embedded stack traces or error objects
  const findings = (meta?.findings ?? []) as PushbackFindingItem[];
  for (const f of findings) {
    if (f.stackTrace || f.stack) {
      const parsed = parseStackTrace(
        f.stackTrace ?? f.stack,
        `FindingError (${f.id})`,
        f.observation,
      );
      if (!parsed.name.includes(f.id)) {
        parsed.name = `FindingError (${f.id}): ${parsed.name}`;
      }
      errors.push(parsed);
    } else if (f.error) {
      if (typeof f.error === "string") {
        errors.push(parseStackTrace(f.error, `FindingError (${f.id})`, f.observation));
      } else if (typeof f.error === "object") {
        const errObj = f.error as unknown as Record<string, unknown>;
        const stack = typeof errObj.stack === "string" ? errObj.stack : undefined;
        const msg =
          typeof errObj.message === "string"
            ? errObj.message
            : typeof errObj.detail === "string"
              ? errObj.detail
              : f.observation;
        const name = typeof errObj.name === "string" ? errObj.name : `FindingError (${f.id})`;
        errors.push(parseStackTrace(stack ?? msg, name, msg));
      }
    }
  }

  // 6. Node logs if status is error and logs contain stack trace
  if (errors.length === 0 && node.status === "error" && node.logs) {
    if (
      node.logs.includes("Error:") ||
      node.logs.includes("Exception:") ||
      node.logs.includes("Traceback") ||
      node.logs.includes("   at ")
    ) {
      errors.push(parseStackTrace(node.logs, "LogError", "Error extracted from node logs"));
    }
  }

  return errors;
}

/**
 * Extracts adversarial audit quotes from findings, metadata, and provenance.
 */
export function extractAuditQuotes(node: GraphNodeData): AdversarialAuditQuote[] {
  const quotes: AdversarialAuditQuote[] = [];
  const meta = node.metadata;

  // 1. Direct metadata quotes
  const rawAuditQuotes = (meta?.adversarialQuotes ?? meta?.auditQuotes ?? meta?.criticQuotes) as
    | Array<
        | string
        | {
            id?: string;
            author?: string;
            quote?: string;
            role?: string;
            requirementId?: string;
            round?: number;
            severity?: string;
          }
      >
    | undefined;

  if (Array.isArray(rawAuditQuotes)) {
    for (let i = 0; i < rawAuditQuotes.length; i++) {
      const q = rawAuditQuotes[i];
      if (typeof q === "string" && q.trim()) {
        quotes.push({
          id: `quote-${i + 1}`,
          quote: q,
          role: "Adversarial Auditor",
        });
      } else if (typeof q === "object" && q !== null) {
        quotes.push({
          id: q.id ?? `quote-${i + 1}`,
          quote: q.quote ?? "",
          author: q.author,
          role: q.role ?? "Adversarial Auditor",
          requirementId: q.requirementId,
          round: q.round,
          severity: q.severity,
        });
      }
    }
  }

  // 2. Findings with adversarial quotes or pushback reasons
  const findings = (meta?.findings ?? []) as PushbackFindingItem[];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    if (!f) continue;
    const quoteText =
      f.pushbackReason ?? f.adversarialQuote ?? f.auditQuote ?? f.criticQuote ?? f.quote;
    if (quoteText && quoteText.trim()) {
      quotes.push({
        id: `finding-quote-${f.id || i + 1}`,
        quote: quoteText,
        author: f.validatorId ?? f.author ?? "Critic Agent",
        role: f.validatorId ? "Gate Validator" : "Adversarial Auditor",
        requirementId: f.requirementId,
        round: f.rejectionRound ?? f.round,
        severity: f.severity,
      });
    }
  }

  return quotes;
}

/**
 * Extracts remediation patches and diffs from findings and metadata.
 */
export function extractRemediationPatches(node: GraphNodeData): RemediationPatch[] {
  const patches: RemediationPatch[] = [];
  const meta = node.metadata;

  // 1. Metadata remediations array
  const rawRemediations = (meta?.remediationPatches ?? meta?.remediations) as
    | Array<{
        id?: string;
        findingId?: string;
        round?: number;
        title?: string;
        diff?: string;
        patch?: string;
        remediation?: string;
        explanation?: string;
        filePath?: string;
        path?: string;
        beforeSnippet?: string;
        afterSnippet?: string;
        status?: string;
        author?: string;
      }>
    | undefined;

  if (Array.isArray(rawRemediations)) {
    for (let i = 0; i < rawRemediations.length; i++) {
      const r = rawRemediations[i];
      if (!r) continue;
      const diff = r.diff ?? r.patch;
      if (diff || r.beforeSnippet || r.afterSnippet || r.remediation) {
        patches.push({
          id: r.id ?? `patch-${i + 1}`,
          findingId: r.findingId,
          round: r.round,
          title:
            r.title ??
            (r.findingId ? `Remediation for ${r.findingId}` : `Remediation Patch ${i + 1}`),
          explanation: r.explanation ?? r.remediation,
          filePath: r.filePath ?? r.path,
          diff,
          beforeSnippet: r.beforeSnippet,
          afterSnippet: r.afterSnippet,
          status: r.status,
          author: r.author,
        });
      }
    }
  }

  // 2. Findings with patches
  const findings = (meta?.findings ?? []) as PushbackFindingItem[];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    if (!f) continue;
    const diff = f.remediationPatch ?? f.patch ?? f.diff;
    if (diff || f.beforeSnippet || f.afterSnippet) {
      patches.push({
        id: `finding-patch-${f.id || i + 1}`,
        findingId: f.id,
        round: f.round,
        title: `Remediation Patch for ${f.id}`,
        explanation: f.remediation,
        diff,
        beforeSnippet: f.beforeSnippet,
        afterSnippet: f.afterSnippet,
        status: f.status,
      });
    }
  }

  return patches;
}

/* =========================================================================
   Stack Trace Inspector View
   ========================================================================= */

interface StackTraceViewerProps {
  error: StructuredError;
  onCopySuccess?: () => void;
  defaultExpanded?: boolean;
}

export const StackTraceViewer: FC<StackTraceViewerProps> = memo(function StackTraceViewer({
  error,
  defaultExpanded = true,
}) {
  const [hideInternal, setHideInternal] = useState<boolean>(true);
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [isCopiedStack, setIsCopiedStack] = useState<boolean>(false);
  const [isCopiedMessage, setIsCopiedMessage] = useState<boolean>(false);
  const [isCardExpanded, setIsCardExpanded] = useState<boolean>(defaultExpanded);
  const [isFramesExpanded, setIsFramesExpanded] = useState<boolean>(false);

  const visibleFrames = useMemo(() => {
    if (!hideInternal) return error.frames;
    const filtered = error.frames.filter((f) => !f.isInternal);
    return filtered.length > 0 ? filtered : error.frames;
  }, [error.frames, hideInternal]);

  const internalCount = useMemo(() => {
    return error.frames.filter((f) => f.isInternal).length;
  }, [error.frames]);

  const maxInitialFrames = 5;
  const displayedFrames = useMemo(() => {
    if (isFramesExpanded || visibleFrames.length <= maxInitialFrames) {
      return visibleFrames;
    }
    return visibleFrames.slice(0, maxInitialFrames);
  }, [visibleFrames, isFramesExpanded]);

  const handleCopyStack = useCallback(async () => {
    const content =
      error.rawStack ||
      `${error.name}: ${error.message}\n` + error.frames.map((f) => `    ${f.raw}`).join("\n");
    const ok = await copyToClipboard(content);
    if (ok) {
      setIsCopiedStack(true);
      setTimeout(() => setIsCopiedStack(false), 2000);
    }
  }, [error]);

  const handleCopyMessage = useCallback(async () => {
    const ok = await copyToClipboard(`${error.name}: ${error.message}`);
    if (ok) {
      setIsCopiedMessage(true);
      setTimeout(() => setIsCopiedMessage(false), 2000);
    }
  }, [error]);

  return (
    <div
      className="drawer-stacktrace-card"
      style={{
        backgroundColor: "#0d0d11",
        border: "1px solid rgba(248, 113, 113, 0.25)",
        borderRadius: "6px",
        padding: "12px",
        margin: "8px 0",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "10px",
          marginBottom: "8px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setIsCardExpanded(!isCardExpanded)}
            style={{
              background: "transparent",
              border: "none",
              color: "#a1a1aa",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
            }}
            aria-label={isCardExpanded ? "Collapse error details" : "Expand error details"}
          >
            {isCardExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(248, 113, 113, 0.15)",
              border: "1px solid rgba(248, 113, 113, 0.4)",
              color: "#f87171",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
            }}
          >
            <IconBug size={13} />
            <span>{error.name}</span>
          </span>

          {error.code !== undefined && (
            <span
              style={{
                background: "rgba(161, 161, 170, 0.1)",
                border: "1px solid #3f3f46",
                color: "#a1a1aa",
                padding: "1px 6px",
                borderRadius: "4px",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
              }}
            >
              {`Code: ${error.code}`}
            </span>
          )}

          {error.phase && (
            <span
              style={{
                background: "rgba(251, 146, 60, 0.12)",
                color: "#fb923c",
                padding: "1px 6px",
                borderRadius: "4px",
                fontSize: "11px",
              }}
            >
              {`Phase: ${error.phase}`}
            </span>
          )}
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {error.frames.length > 0 && internalCount > 0 && (
            <button
              type="button"
              onClick={() => setHideInternal(!hideInternal)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid #3f3f46",
                color: "#a1a1aa",
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "4px",
                cursor: "pointer",
              }}
              title={
                hideInternal
                  ? `Showing user frames only (${internalCount} vendor frames hidden)`
                  : "Hiding vendor frames"
              }
              aria-label={hideInternal ? "Show all vendor frames" : "Hide vendor frames"}
            >
              {hideInternal ? <IconEye size={12} /> : <IconEyeOff size={12} />}
              <span>
                {hideInternal
                  ? `User Code (${visibleFrames.length})`
                  : `All (${error.frames.length})`}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid #3f3f46",
              color: "#a1a1aa",
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            aria-label="Toggle raw stack view"
          >
            <IconTerminal size={12} />
            <span>{showRaw ? "Structured" : "Raw"}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyMessage}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid #3f3f46",
              color: isCopiedMessage ? "#34d399" : "#a1a1aa",
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            title="Copy Error Message"
            aria-label="Copy Error Message"
          >
            {isCopiedMessage ? <IconCheck size={12} /> : <IconCopy size={12} />}
            <span>{isCopiedMessage ? "Copied Msg!" : "Copy Msg"}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyStack}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(248, 113, 113, 0.12)",
              border: "1px solid rgba(248, 113, 113, 0.3)",
              color: isCopiedStack ? "#34d399" : "#fca5a5",
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600,
            }}
            title="Copy Full Stack Trace"
            aria-label="Copy Full Stack Trace"
          >
            {isCopiedStack ? <IconCheck size={12} /> : <IconCopy size={12} />}
            <span>{isCopiedStack ? "Copied Stack!" : "Copy Stack"}</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error.message && (
        <div
          style={{
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderLeft: "3px solid #f87171",
            borderRadius: "4px",
            padding: "8px 10px",
            color: "#fafafa",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            marginBottom: "10px",
          }}
        >
          {error.message}
        </div>
      )}

      {/* Expandable Body */}
      {isCardExpanded && (
        <>
          {/* Raw View */}
          {showRaw ? (
            <pre
              style={{
                margin: 0,
                padding: "10px",
                backgroundColor: "#050507",
                border: "1px solid #27272a",
                borderRadius: "4px",
                color: "#fca5a5",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                overflowX: "auto",
                maxHeight: "300px",
                whiteSpace: "pre-wrap",
              }}
            >
              {error.rawStack ||
                `${error.name}: ${error.message}\n` +
                  error.frames.map((f) => `    ${f.raw}`).join("\n")}
            </pre>
          ) : (
            /* Structured Frames */
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {displayedFrames.length > 0 ? (
                <>
                  {displayedFrames.map((frame, idx) => {
                    const isFirst = idx === 0;
                    const formattedPath = `${frame.fileName ?? frame.filePath ?? ""}${frame.lineNumber !== undefined ? `:${frame.lineNumber}` : ""}${frame.columnNumber !== undefined ? `:${frame.columnNumber}` : ""}`;

                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "4px 8px",
                          backgroundColor: isFirst
                            ? "rgba(248, 113, 113, 0.08)"
                            : frame.isInternal
                              ? "#111113"
                              : "#141418",
                          border: `1px solid ${isFirst ? "rgba(248, 113, 113, 0.25)" : "#27272a"}`,
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          <span
                            style={{
                              color: isFirst ? "#f87171" : "#71717a",
                              fontWeight: 600,
                              minWidth: "16px",
                            }}
                          >
                            {idx + 1}
                          </span>
                          {frame.functionName && (
                            <span style={{ color: "#38bdf8", fontWeight: 600 }}>
                              {frame.functionName}
                            </span>
                          )}
                          {frame.filePath && (
                            <span
                              style={{ color: frame.isInternal ? "#71717a" : "#e4e4e7" }}
                              title={frame.filePath}
                            >
                              {formattedPath}
                            </span>
                          )}
                          {!frame.functionName && !frame.filePath && (
                            <span style={{ color: "#a1a1aa" }}>{frame.raw}</span>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            flexShrink: 0,
                          }}
                        >
                          {frame.isInternal && (
                            <span
                              style={{
                                fontSize: "9.5px",
                                color: "#71717a",
                                background: "#1e1e24",
                                padding: "1px 4px",
                                borderRadius: "3px",
                                textTransform: "uppercase",
                              }}
                            >
                              vendor
                            </span>
                          )}
                          {isFirst && (
                            <span
                              style={{
                                fontSize: "9.5px",
                                color: "#f87171",
                                background: "rgba(248, 113, 113, 0.15)",
                                padding: "1px 4px",
                                borderRadius: "3px",
                                fontWeight: 700,
                              }}
                            >
                              origin
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Expand/Collapse for long frame lists */}
                  {visibleFrames.length > maxInitialFrames && (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: "4px" }}>
                      <button
                        type="button"
                        onClick={() => setIsFramesExpanded(!isFramesExpanded)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: "rgba(255, 255, 255, 0.04)",
                          border: "1px solid #27272a",
                          color: "#38bdf8",
                          fontSize: "11px",
                          padding: "3px 10px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                        }}
                        aria-label={
                          isFramesExpanded
                            ? "Collapse frame list"
                            : `Show ${visibleFrames.length - maxInitialFrames} more frames`
                        }
                      >
                        {isFramesExpanded ? (
                          <IconChevronDown size={13} />
                        ) : (
                          <IconChevronRight size={13} />
                        )}
                        <span>
                          {isFramesExpanded
                            ? "Collapse Frames"
                            : `+${visibleFrames.length - maxInitialFrames} More Frames (${visibleFrames.length} total)`}
                        </span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* Unformatted raw error fallback */
                <div
                  className="drawer-unformatted-error-banner"
                  style={{
                    backgroundColor: "rgba(248, 113, 113, 0.04)",
                    border: "1px dashed rgba(248, 113, 113, 0.3)",
                    borderRadius: "4px",
                    padding: "8px 10px",
                    margin: "4px 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 700,
                        color: "#f87171",
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}
                    >
                      Unformatted Raw Error Output
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#71717a",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      No call frames detected
                    </span>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      color: "#fca5a5",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {error.rawStack || error.message || "Unformatted raw error string."}
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
});

StackTraceViewer.displayName = "StackTraceViewer";

/* =========================================================================
   Adversarial Audit Quote Callout Box
   ========================================================================= */

interface AdversarialQuoteBoxProps {
  quote: AdversarialAuditQuote;
}

export const AdversarialQuoteBox: FC<AdversarialQuoteBoxProps> = memo(function AdversarialQuoteBox({
  quote,
}) {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const handleCopy = useCallback(
    async (e: MouseEvent) => {
      e.stopPropagation();
      const textToCopy = `"${quote.quote}" — ${quote.author || quote.role || "Adversarial Auditor"}`;
      const ok = await copyToClipboard(textToCopy);
      if (ok) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    },
    [quote],
  );

  return (
    <div
      className="drawer-adversarial-quote-card"
      style={{
        backgroundColor: "rgba(251, 146, 60, 0.04)",
        border: "1px solid rgba(251, 146, 60, 0.3)",
        borderLeft: "4px solid #fb923c",
        borderRadius: "6px",
        padding: "10px 12px",
        margin: "8px 0",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "6px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <IconQuote size={14} style={{ color: "#fb923c" }} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#fb923c",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            Adversarial Audit Feedback
          </span>
          {quote.round !== undefined && (
            <span
              style={{
                fontSize: "10.5px",
                color: "#a1a1aa",
                background: "#27272a",
                padding: "1px 5px",
                borderRadius: "3px",
                fontFamily: "var(--font-mono)",
              }}
            >
              {`Round ${quote.round}`}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid #3f3f46",
            color: isCopied ? "#34d399" : "#a1a1aa",
            fontSize: "10.5px",
            padding: "2px 6px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
          title="Copy Audit Quote"
          aria-label="Copy Audit Quote"
        >
          {isCopied ? <IconCheck size={11} /> : <IconCopy size={11} />}
          <span>{isCopied ? "Copied!" : "Copy Quote"}</span>
        </button>
      </div>

      <blockquote
        style={{
          margin: 0,
          color: "#f4f4f5",
          fontSize: "12px",
          fontStyle: "italic",
          lineHeight: "1.5",
          fontFamily: "var(--font-sans)",
        }}
      >
        &ldquo;{quote.quote}&rdquo;
      </blockquote>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "6px",
          fontSize: "10.5px",
          color: "#71717a",
        }}
      >
        <span>
          —{" "}
          <strong style={{ color: "#a1a1aa", fontWeight: 600 }}>
            {quote.author || quote.role || "Adversarial Auditor"}
          </strong>
        </span>
        {quote.requirementId && (
          <span style={{ fontFamily: "var(--font-mono)", color: "#a1a1aa" }}>
            {`Target: ${quote.requirementId}`}
          </span>
        )}
      </div>
    </div>
  );
});

AdversarialQuoteBox.displayName = "AdversarialQuoteBox";

/* =========================================================================
   Remediation Patch & Diff Viewer Component
   ========================================================================= */

interface RemediationPatchViewerProps {
  patch: RemediationPatch;
}

export const RemediationPatchViewer: FC<RemediationPatchViewerProps> = memo(
  function RemediationPatchViewer({ patch }) {
    const [isCopied, setIsCopied] = useState<boolean>(false);

    const handleCopyPatch = useCallback(
      async (e: MouseEvent) => {
        e.stopPropagation();
        const content =
          patch.diff ||
          (patch.beforeSnippet && patch.afterSnippet
            ? `--- BEFORE\n${patch.beforeSnippet}\n+++ AFTER\n${patch.afterSnippet}`
            : patch.explanation || "");
        const ok = await copyToClipboard(content);
        if (ok) {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        }
      },
      [patch],
    );

    return (
      <div
        className="drawer-remediation-patch-card"
        style={{
          backgroundColor: "#0d0d11",
          border: "1px solid rgba(52, 211, 153, 0.25)",
          borderLeft: "4px solid #34d399",
          borderRadius: "6px",
          padding: "10px 12px",
          margin: "8px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            marginBottom: "6px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <IconFileDiff size={14} style={{ color: "#34d399" }} />
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#34d399",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              {patch.title || "Remediation Patch"}
            </span>
            {patch.round !== undefined && (
              <span
                style={{
                  fontSize: "10.5px",
                  color: "#a1a1aa",
                  background: "#27272a",
                  padding: "1px 5px",
                  borderRadius: "3px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {`Round ${patch.round}`}
              </span>
            )}
            {patch.status && (
              <span
                style={{
                  fontSize: "10px",
                  color:
                    patch.status === "resolved" || patch.status === "applied"
                      ? "#34d399"
                      : "#fb923c",
                  background: "rgba(255, 255, 255, 0.05)",
                  padding: "1px 5px",
                  borderRadius: "3px",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {patch.status}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyPatch}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(52, 211, 153, 0.12)",
              border: "1px solid rgba(52, 211, 153, 0.3)",
              color: isCopied ? "#34d399" : "#a7f3d0",
              fontSize: "10.5px",
              padding: "2px 6px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600,
            }}
            title="Copy Remediation Patch"
            aria-label="Copy Remediation Patch"
          >
            {isCopied ? <IconCheck size={11} /> : <IconCopy size={11} />}
            <span>{isCopied ? "Copied Patch!" : "Copy Patch"}</span>
          </button>
        </div>

        {patch.explanation && (
          <p
            style={{
              color: "#e4e4e7",
              fontSize: "11.5px",
              margin: "4px 0 8px 0",
              fontFamily: "var(--font-sans)",
              lineHeight: "1.4",
            }}
          >
            <strong style={{ color: "#34d399" }}>Remediation Strategy:</strong> {patch.explanation}
          </p>
        )}

        {/* Render diff via DiffViewer or Before/After split */}
        {patch.diff ? (
          <DiffViewer
            diff={patch.diff}
            filePath={patch.filePath || "remediation.diff"}
            mode="write"
            showHeader={true}
            defaultExpanded={true}
          />
        ) : patch.beforeSnippet || patch.afterSnippet ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", margin: "6px 0" }}>
            {patch.beforeSnippet && (
              <div
                style={{
                  backgroundColor: "rgba(248, 113, 113, 0.08)",
                  border: "1px solid rgba(248, 113, 113, 0.3)",
                  borderRadius: "4px",
                  padding: "6px 8px",
                }}
              >
                <div
                  style={{
                    color: "#f87171",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    marginBottom: "4px",
                    textTransform: "uppercase",
                  }}
                >
                  Before Remediation:
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                  {patch.beforeSnippet.split(/\r?\n/).map((line, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        gap: "8px",
                        color: "#fca5a5",
                        lineHeight: "1.4",
                      }}
                    >
                      <span
                        style={{
                          color: "#71717a",
                          minWidth: "22px",
                          userSelect: "none",
                          textAlign: "right",
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ whiteSpace: "pre-wrap" }}>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {patch.afterSnippet && (
              <div
                style={{
                  backgroundColor: "rgba(52, 211, 153, 0.08)",
                  border: "1px solid rgba(52, 211, 153, 0.3)",
                  borderRadius: "4px",
                  padding: "6px 8px",
                }}
              >
                <div
                  style={{
                    color: "#34d399",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    marginBottom: "4px",
                    textTransform: "uppercase",
                  }}
                >
                  After Remediation:
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                  {patch.afterSnippet.split(/\r?\n/).map((line, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        gap: "8px",
                        color: "#86efac",
                        lineHeight: "1.4",
                      }}
                    >
                      <span
                        style={{
                          color: "#71717a",
                          minWidth: "22px",
                          userSelect: "none",
                          textAlign: "right",
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ whiteSpace: "pre-wrap" }}>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  },
);

RemediationPatchViewer.displayName = "RemediationPatchViewer";

/* =========================================================================
   Individual Pushback Finding Detail Card
   ========================================================================= */

interface FindingDetailCardProps {
  finding: PushbackFindingItem;
  defaultExpanded?: boolean;
}

export const FindingDetailCard: FC<FindingDetailCardProps> = memo(function FindingDetailCard({
  finding,
  defaultExpanded = false,
}) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [findingLightboxIndex, setFindingLightboxIndex] = useState<number | null>(null);
  const [failedFindingThumbnails, setFailedFindingThumbnails] = useState<Set<string>>(new Set());

  const handleFindingThumbError = useCallback((id: string) => {
    setFailedFindingThumbnails((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleCopyText = useCallback(async (text: string, key: string, e: MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const structuredError = useMemo(() => {
    if (finding.stackTrace || finding.stack) {
      return parseStackTrace(
        finding.stackTrace ?? finding.stack,
        `FindingError (${finding.id})`,
        finding.observation,
      );
    }
    if (finding.error) {
      if (typeof finding.error === "string") {
        return parseStackTrace(finding.error, `FindingError (${finding.id})`, finding.observation);
      }
      if (typeof finding.error === "object") {
        return finding.error as unknown as StructuredError;
      }
    }
    return null;
  }, [finding]);

  const auditQuote = useMemo<AdversarialAuditQuote | null>(() => {
    const q =
      finding.adversarialQuote ?? finding.auditQuote ?? finding.criticQuote ?? finding.quote;
    if (q && q.trim() && q.trim() !== finding.pushbackReason?.trim()) {
      return {
        id: `quote-${finding.id}`,
        quote: q,
        author: finding.validatorId ?? finding.author ?? "Critic Agent",
        requirementId: finding.requirementId,
        round: finding.rejectionRound ?? finding.round,
        severity: finding.severity,
      };
    }
    return null;
  }, [finding]);

  const patch = useMemo<RemediationPatch | null>(() => {
    const diff = finding.remediationPatch ?? finding.patch ?? finding.diff;
    if (diff || finding.beforeSnippet || finding.afterSnippet) {
      return {
        id: `patch-${finding.id}`,
        findingId: finding.id,
        round: finding.round,
        title: `Remediation Patch for ${finding.id}`,
        explanation: finding.remediation,
        diff,
        beforeSnippet: finding.beforeSnippet,
        afterSnippet: finding.afterSnippet,
        status: finding.status,
      };
    }
    return null;
  }, [finding]);

  const effectiveRound = finding.rejectionRound ?? finding.round;
  const effectiveValidator = finding.validatorId ?? finding.author;
  const proof = finding.revalidationProof ?? finding.remediationProof;
  const targetFileList = finding.targetFiles ?? [];
  const fileRefList = finding.fileRefs ?? [];
  const hasOpposedScope =
    Boolean(finding.opposedChanges) || targetFileList.length > 0 || fileRefList.length > 0;

  return (
    <div
      className={`drawer-finding-card severity-${finding.severity}`}
      style={{
        backgroundColor: "#121215",
        border: "1px solid #27272a",
        borderRadius: "6px",
        padding: "12px",
        marginBottom: "10px",
      }}
    >
      {/* Header */}
      <div
        className="drawer-finding-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span className={`drawer-finding-severity ${finding.severity}`}>{finding.severity}</span>
          <code style={{ fontSize: "11px", color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>
            {finding.id}
          </code>
          {effectiveRound !== undefined && (
            <span
              style={{
                fontSize: "10.5px",
                color: "#a1a1aa",
                background: "#27272a",
                padding: "1px 5px",
                borderRadius: "3px",
                fontFamily: "var(--font-mono)",
              }}
            >
              {`Round ${effectiveRound}`}
            </span>
          )}
          {effectiveValidator && (
            <span
              style={{
                fontSize: "10.5px",
                color: "#38bdf8",
                background: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.25)",
                padding: "1px 6px",
                borderRadius: "3px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontFamily: "var(--font-mono)",
              }}
              title="Auditing Validator Attribution"
            >
              <IconShieldCheck size={11} />
              <span>{effectiveValidator}</span>
            </span>
          )}
          {finding.timestamp && (
            <span
              style={{
                fontSize: "10px",
                color: "#71717a",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                fontFamily: "var(--font-mono)",
              }}
            >
              <IconClock size={10} />
              <span>{new Date(finding.timestamp).toLocaleTimeString()}</span>
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "11px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              color: finding.status === "resolved" ? "#34d399" : "#fb923c",
            }}
          >
            {finding.status === "resolved" ? (
              <>
                <IconCheck size={13} />
                <span>Resolved</span>
              </>
            ) : (
              <>
                <IconAlertTriangle size={13} />
                <span>Open</span>
              </>
            )}
          </span>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
              background: "transparent",
              border: "none",
              color: "#a1a1aa",
              cursor: "pointer",
              padding: "2px",
            }}
            title={isExpanded ? "Collapse Details" : "Expand Details"}
            aria-label={
              isExpanded ? `Collapse finding ${finding.id}` : `Expand finding ${finding.id}`
            }
          >
            {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Pushback Rationale Banner */}
      {finding.pushbackReason && (
        <div
          className="drawer-pushback-banner"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderLeft: "4px solid #ef4444",
            borderRadius: "6px",
            padding: "10px 12px",
            margin: "8px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <IconQuote size={14} style={{ color: "#ef4444" }} />
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#ef4444",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                Gate Pushback Rationale
              </span>
              {effectiveRound !== undefined && (
                <span
                  style={{
                    fontSize: "10px",
                    color: "#fca5a5",
                    background: "rgba(239, 68, 68, 0.15)",
                    padding: "1px 5px",
                    borderRadius: "3px",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {`Round ${effectiveRound}`}
                </span>
              )}
              {effectiveValidator && (
                <span
                  style={{
                    fontSize: "10px",
                    color: "#a1a1aa",
                    background: "#27272a",
                    padding: "1px 5px",
                    borderRadius: "3px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <IconScale size={10} />
                  <span>{effectiveValidator}</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => handleCopyText(finding.pushbackReason!, `pushback-${finding.id}`, e)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid #3f3f46",
                color: copiedKey === `pushback-${finding.id}` ? "#34d399" : "#a1a1aa",
                fontSize: "10.5px",
                padding: "2px 6px",
                borderRadius: "3px",
                cursor: "pointer",
              }}
              title="Copy Pushback Rationale"
              aria-label={`Copy pushback rationale for ${finding.id}`}
            >
              {copiedKey === `pushback-${finding.id}` ? (
                <IconCheck size={11} />
              ) : (
                <IconCopy size={11} />
              )}
              <span>{copiedKey === `pushback-${finding.id}` ? "Copied" : "Copy Rationale"}</span>
            </button>
          </div>
          <blockquote
            style={{
              margin: 0,
              color: "#fecaca",
              fontSize: "12px",
              fontStyle: "italic",
              lineHeight: "1.5",
              fontFamily: "var(--font-sans)",
            }}
          >
            &ldquo;{finding.pushbackReason}&rdquo;
          </blockquote>
        </div>
      )}

      {/* Opposed Changes Callout */}
      {hasOpposedScope && (
        <div
          className="drawer-opposed-changes-callout"
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.05)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            borderLeft: "4px solid #f59e0b",
            borderRadius: "6px",
            padding: "10px 12px",
            margin: "8px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <IconBan size={14} style={{ color: "#f59e0b" }} />
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#f59e0b",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                Opposed Changes & Target Scope
              </span>
            </div>
          </div>

          {finding.opposedChanges && (
            <p
              style={{
                margin: "4px 0 8px 0",
                color: "#fef3c7",
                fontSize: "12px",
                lineHeight: "1.4",
              }}
            >
              {finding.opposedChanges}
            </p>
          )}

          {/* Target Files Badges */}
          {(targetFileList.length > 0 || fileRefList.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
              {targetFileList.map((file, fIdx) => (
                <button
                  key={`tf-${fIdx}`}
                  type="button"
                  onClick={(e) => handleCopyText(file, `file-${finding.id}-${fIdx}`, e)}
                  className="drawer-target-file-badge"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: copiedKey === `file-${finding.id}-${fIdx}` ? "#34d399" : "#e4e4e7",
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer",
                  }}
                  title="Click to copy file path"
                  aria-label={`Copy target file ${file}`}
                >
                  <IconFileCode size={12} style={{ color: "#f59e0b" }} />
                  <span>{file}</span>
                  {copiedKey === `file-${finding.id}-${fIdx}` ? (
                    <IconCheck size={11} style={{ color: "#34d399" }} />
                  ) : null}
                </button>
              ))}
              {fileRefList.map((fr, frIdx) => (
                <button
                  key={`fr-${frIdx}`}
                  type="button"
                  onClick={(e) => handleCopyText(fr.path, `fileref-${finding.id}-${frIdx}`, e)}
                  className="drawer-target-file-badge"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: copiedKey === `fileref-${finding.id}-${frIdx}` ? "#34d399" : "#e4e4e7",
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer",
                  }}
                  title="Click to copy file path"
                  aria-label={`Copy target file ref ${fr.path}`}
                >
                  <IconFileDiff size={12} style={{ color: "#f59e0b" }} />
                  <span>{fr.path}</span>
                  {fr.mode && (
                    <span
                      style={{
                        fontSize: "9px",
                        textTransform: "uppercase",
                        padding: "0 3px",
                        borderRadius: "2px",
                        background: "rgba(255, 255, 255, 0.1)",
                        color: "#a1a1aa",
                      }}
                    >
                      {fr.mode}
                    </span>
                  )}
                  {(fr.additions !== undefined || fr.deletions !== undefined) && (
                    <span style={{ fontSize: "10px" }}>
                      {fr.additions !== undefined && (
                        <span style={{ color: "#34d399" }}>{`+${fr.additions}`} </span>
                      )}
                      {fr.deletions !== undefined && (
                        <span style={{ color: "#f87171" }}>{`-${fr.deletions}`}</span>
                      )}
                    </span>
                  )}
                  {copiedKey === `fileref-${finding.id}-${frIdx}` ? (
                    <IconCheck size={11} style={{ color: "#34d399" }} />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Observation */}
      <div style={{ margin: "8px 0" }}>
        <p
          className="drawer-prose"
          style={{ margin: "4px 0", color: "#fafafa", fontSize: "12px", lineHeight: "1.4" }}
        >
          {finding.observation}
        </p>
      </div>

      {/* Remediation Text */}
      {finding.remediation ? (
        <p
          className="drawer-prose"
          style={{
            margin: "6px 0",
            color: "#a1a1aa",
            fontSize: "11.5px",
            lineHeight: "1.4",
            background: "rgba(255, 255, 255, 0.02)",
            padding: "6px 8px",
            borderRadius: "4px",
            border: "1px solid #1f1f23",
          }}
        >
          <strong style={{ color: "#e4e4e7" }}>Remediation:</strong> {finding.remediation}
        </p>
      ) : null}

      {/* Embedded Finding Screenshots Gallery */}
      {finding.screenshots && finding.screenshots.length > 0 && (
        <div className="drawer-finding-screenshots-section" style={{ margin: "10px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              fontWeight: 700,
              color: "#38bdf8",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              marginBottom: "6px",
            }}
          >
            <IconMaximize size={13} />
            <span>{`Validation Evidence Screenshots (${finding.screenshots.length})`}</span>
          </div>
          <div
            className="drawer-finding-screenshots-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: "8px",
            }}
          >
            {finding.screenshots.map((shot, sIdx) => {
              const shotId = shot.id || `shot-${sIdx}`;
              const hasNoUrl = !shot.url || !shot.url.trim();
              const isFailed = hasNoUrl || failedFindingThumbnails.has(shotId);
              const shotDims =
                shot.dimensions ||
                (shot.metadata?.dimensions as { width: number; height: number } | undefined) ||
                (shot.metadata?.viewport as { width: number; height: number } | undefined);

              return (
                <div
                  key={shotId}
                  className="drawer-finding-thumb-card"
                  onClick={() => setFindingLightboxIndex(sIdx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFindingLightboxIndex(sIdx);
                    }
                  }}
                  style={{
                    position: "relative",
                    borderRadius: "4px",
                    overflow: "hidden",
                    border: "1px solid #27272a",
                    backgroundColor: "#09090b",
                    cursor: "pointer",
                    aspectRatio: "16 / 9",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                  }}
                  aria-label={`Inspect evidence screenshot ${shot.title ?? shot.id}`}
                >
                  {isFailed ? (
                    <div
                      className="drawer-finding-thumb-error"
                      role="img"
                      aria-label={`Preview unavailable for ${shot.title ?? shot.id}`}
                    >
                      <IconPhotoOff size={20} />
                      <span style={{ fontSize: "9px", fontFamily: "var(--font-sans)" }}>
                        {hasNoUrl ? "No URL provided" : "Preview unavailable"}
                      </span>
                    </div>
                  ) : (
                    <img
                      src={normalizeAssetUrl(shot.thumbnailUrl ?? shot.url)}
                      alt={shot.title ?? `Evidence ${sIdx + 1}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        position: "absolute",
                        top: 0,
                        left: 0,
                      }}
                      loading="lazy"
                      onError={() => handleFindingThumbError(shotId)}
                    />
                  )}
                  <div
                    style={{
                      position: "relative",
                      background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
                      padding: "4px 6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: "#fafafa",
                      fontSize: "10px",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {shot.title ?? `Screenshot ${sIdx + 1}`}
                    </span>
                    {shotDims && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          opacity: 0.8,
                          marginLeft: "4px",
                          flexShrink: 0,
                        }}
                      >
                        {`${shotDims.width}×${shotDims.height}`}
                      </span>
                    )}
                    <IconMaximize
                      size={12}
                      style={{ flexShrink: 0, opacity: 0.8, marginLeft: "4px" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {findingLightboxIndex !== null && (
            <LightboxDialog
              isOpen={true}
              assets={finding.screenshots}
              initialIndex={findingLightboxIndex}
              onClose={() => setFindingLightboxIndex(null)}
            />
          )}
        </div>
      )}

      {/* Adversarial Audit Quote */}
      {auditQuote && <AdversarialQuoteBox quote={auditQuote} />}

      {/* Remediation Patch / Diff */}
      {patch && <RemediationPatchViewer patch={patch} />}

      {/* Structured Stack Trace */}
      {structuredError && <StackTraceViewer error={structuredError} />}

      {/* Revalidation & Remediation Proof Scorecard */}
      {proof && (
        <div
          className="drawer-proof-scorecard"
          style={{
            marginTop: "8px",
            padding: "8px 10px",
            backgroundColor: "rgba(52, 211, 153, 0.05)",
            border: "1px solid rgba(52, 211, 153, 0.25)",
            borderRadius: "5px",
            fontSize: "11px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "4px",
              flexWrap: "wrap",
              gap: "4px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                color: "#34d399",
                fontWeight: 600,
              }}
            >
              <IconShieldCheck size={14} />
              <span>{`Revalidation Proof (${proof.method ?? "Automated Gate Verification"})`}</span>
            </div>
            {"verifiedAt" in proof && typeof proof.verifiedAt === "string" && proof.verifiedAt ? (
              <span style={{ fontSize: "10px", color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>
                {`Verified: ${new Date(proof.verifiedAt).toLocaleTimeString()}`}
              </span>
            ) : null}
          </div>
          {Array.isArray(proof.evidence) && proof.evidence.length > 0 && (
            <ul style={{ margin: "4px 0 0 16px", padding: 0, color: "#a1a1aa" }}>
              {proof.evidence.map((ev, i) => (
                <li key={i} style={{ margin: "2px 0" }}>
                  {typeof ev === "string" ? ev : JSON.stringify(ev)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Generic Evidence List */}
      {finding.evidence &&
        Array.isArray(finding.evidence) &&
        finding.evidence.length > 0 &&
        !proof && (
          <div
            style={{
              marginTop: "8px",
              padding: "6px 8px",
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              border: "1px solid #27272a",
              borderRadius: "4px",
              fontSize: "11px",
            }}
          >
            <span style={{ color: "#a1a1aa", fontWeight: 600 }}>Supporting Evidence:</span>
            <ul style={{ margin: "2px 0 0 16px", padding: 0, color: "#71717a" }}>
              {finding.evidence.map((ev, i) => (
                <li key={i}>
                  {typeof ev === "string"
                    ? ev
                    : (ev.observation ?? ev.reference ?? ev.url ?? JSON.stringify(ev))}
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* Footer Meta & Quick Copy Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#71717a",
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          marginTop: "8px",
          paddingTop: "6px",
          borderTop: "1px solid #1f1f23",
          flexWrap: "wrap",
          gap: "6px",
        }}
      >
        <div>
          {finding.requirementId ? (
            <span>{`Requirement: ${finding.requirementId}`}</span>
          ) : (
            <span />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            onClick={(e) => handleCopyText(finding.observation, `obs-${finding.id}`, e)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid #27272a",
              color: copiedKey === `obs-${finding.id}` ? "#34d399" : "#a1a1aa",
              fontSize: "10.5px",
              padding: "2px 6px",
              borderRadius: "3px",
              cursor: "pointer",
            }}
            title="Copy Observation"
            aria-label={`Copy observation for ${finding.id}`}
          >
            {copiedKey === `obs-${finding.id}` ? <IconCheck size={11} /> : <IconCopy size={11} />}
            <span>{copiedKey === `obs-${finding.id}` ? "Copied Obs" : "Copy Obs"}</span>
          </button>

          {finding.remediation && (
            <button
              type="button"
              onClick={(e) => handleCopyText(finding.remediation ?? "", `rem-${finding.id}`, e)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid #27272a",
                color: copiedKey === `rem-${finding.id}` ? "#34d399" : "#a1a1aa",
                fontSize: "10.5px",
                padding: "2px 6px",
                borderRadius: "3px",
                cursor: "pointer",
              }}
              title="Copy Remediation Plan"
              aria-label={`Copy remediation for ${finding.id}`}
            >
              {copiedKey === `rem-${finding.id}` ? <IconCheck size={11} /> : <IconCopy size={11} />}
              <span>{copiedKey === `rem-${finding.id}` ? "Copied Rem" : "Copy Rem"}</span>
            </button>
          )}

          <code>{finding.id}</code>
        </div>
      </div>
    </div>
  );
});

FindingDetailCard.displayName = "FindingDetailCard";

/* =========================================================================
   Main ErrorInspector Component
   ========================================================================= */

export interface ErrorInspectorProps {
  node?: GraphNodeData;
  findings?: PushbackFindingItem[];
  errors?: StructuredError[];
  auditQuotes?: AdversarialAuditQuote[];
  remediationPatches?: RemediationPatch[];
  repairRounds?: number;
  title?: string;
  showMetrics?: boolean;
  showFilters?: boolean;
}

/**
 * Deep inspection suite for validation findings, pushback cycles, structured error stack traces,
 * adversarial audit feedback quotes, and syntax-colored remediation patches with copy actions.
 */
export const ErrorInspector: FC<ErrorInspectorProps> = memo(function ErrorInspector({
  node,
  findings: controlledFindings,
  errors: controlledErrors,
  auditQuotes: controlledQuotes,
  remediationPatches: controlledPatches,
  repairRounds: controlledRounds,
  title = "Error Stacktrace & Pushback Remediation Inspector",
  showMetrics = true,
  showFilters = true,
}) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"all" | "errors" | "findings" | "quotes" | "patches">(
    "all",
  );

  const findings = useMemo<PushbackFindingItem[]>(() => {
    if (controlledFindings) return controlledFindings;
    if (!node) return [];
    const declared = (node.metadata?.findings ?? []) as PushbackFindingItem[];
    const owned = readAssets(node);
    // A finding references its evidence by id now; the asset object itself lives on the node.
    return declared.map((finding) => {
      const ids = Array.isArray(finding.screenshotAssetIds)
        ? finding.screenshotAssetIds.filter((id): id is string => typeof id === "string")
        : undefined;
      const { resolved } = resolveAssetIds(ids, owned);
      return resolved.length > 0 ? { ...finding, screenshots: resolved } : finding;
    });
  }, [controlledFindings, node]);

  const errors = useMemo<StructuredError[]>(() => {
    if (controlledErrors) return controlledErrors;
    if (!node) return [];
    return extractStructuredErrors(node);
  }, [controlledErrors, node]);

  const auditQuotes = useMemo<AdversarialAuditQuote[]>(() => {
    if (controlledQuotes) return controlledQuotes;
    if (!node) return [];
    return extractAuditQuotes(node);
  }, [controlledQuotes, node]);

  const remediationPatches = useMemo<RemediationPatch[]>(() => {
    if (controlledPatches) return controlledPatches;
    if (!node) return [];
    return extractRemediationPatches(node);
  }, [controlledPatches, node]);

  const repairRounds = useMemo<number>(() => {
    if (controlledRounds !== undefined) return controlledRounds;
    if (!node) return 0;
    return (node.metadata?.repairRounds as number | undefined) ?? 0;
  }, [controlledRounds, node]);

  // Metrics computation
  const metrics = useMemo(() => {
    const totalFindings = findings.length;
    const criticalCount = findings.filter((f) => f.severity === "critical").length;
    const importantCount = findings.filter((f) => f.severity === "important").length;
    const suggestionCount = findings.filter((f) => f.severity === "suggestion").length;
    const resolvedCount = findings.filter((f) => f.status === "resolved").length;
    const openCount = findings.filter((f) => f.status === "open").length;
    const errorCount = errors.length;
    const quotesCount = auditQuotes.length;
    const patchesCount = remediationPatches.length;

    return {
      totalFindings,
      criticalCount,
      importantCount,
      suggestionCount,
      resolvedCount,
      openCount,
      errorCount,
      quotesCount,
      patchesCount,
    };
  }, [findings, errors, auditQuotes, remediationPatches]);

  // Filtering findings
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (severityFilter !== "all" && f.severity !== severityFilter) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesObs = f.observation.toLowerCase().includes(query);
        const matchesRem = Boolean(f.remediation?.toLowerCase().includes(query));
        const matchesId = f.id.toLowerCase().includes(query);
        const matchesReq = Boolean(f.requirementId?.toLowerCase().includes(query));
        const matchesPushback = Boolean(f.pushbackReason?.toLowerCase().includes(query));
        const matchesOpposed = Boolean(f.opposedChanges?.toLowerCase().includes(query));
        const matchesValidator = Boolean(
          f.validatorId?.toLowerCase().includes(query) || f.author?.toLowerCase().includes(query),
        );
        const matchesFiles = Boolean(
          f.targetFiles?.some((file) => file.toLowerCase().includes(query)) ||
          f.fileRefs?.some((fr) => fr.path.toLowerCase().includes(query)),
        );
        const matchesQuote = Boolean(
          f.auditQuote?.toLowerCase().includes(query) ||
          f.adversarialQuote?.toLowerCase().includes(query),
        );
        if (
          !matchesObs &&
          !matchesRem &&
          !matchesId &&
          !matchesReq &&
          !matchesQuote &&
          !matchesPushback &&
          !matchesOpposed &&
          !matchesValidator &&
          !matchesFiles
        ) {
          return false;
        }
      }
      return true;
    });
  }, [findings, severityFilter, statusFilter, searchQuery]);

  const hasAnyData =
    findings.length > 0 ||
    errors.length > 0 ||
    auditQuotes.length > 0 ||
    remediationPatches.length > 0 ||
    repairRounds > 0 ||
    node?.kind === "critic";

  if (!hasAnyData) {
    return (
      <div className="drawer-tab-content">
        <div className="drawer-empty-state">
          No validation findings or pushback cycles recorded for this node.
        </div>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content drawer-error-inspector" title={title}>
      {/* Metric Summary Grid */}
      {showMetrics && (
        <DrawerSection
          title={repairRounds > 0 ? "Repair History" : "Pushback & Remediation Metrics"}
        >
          <div className="drawer-metric-grid" style={{ marginBottom: "12px" }}>
            {repairRounds > 0 && (
              <div className="drawer-metric drawer-metric--warn">
                <span className="drawer-metric-label">Repair Rounds</span>
                <span className="drawer-metric-value">{repairRounds}</span>
              </div>
            )}
            <div className="drawer-metric">
              <span className="drawer-metric-label">Findings Recorded</span>
              <span className="drawer-metric-value">{metrics.totalFindings}</span>
            </div>
            {metrics.criticalCount > 0 && (
              <div className="drawer-metric drawer-metric--warn">
                <span className="drawer-metric-label">Critical</span>
                <span className="drawer-metric-value" style={{ color: "#f87171" }}>
                  {metrics.criticalCount}
                </span>
              </div>
            )}
            {metrics.openCount > 0 && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">Open Issues</span>
                <span className="drawer-metric-value" style={{ color: "#fb923c" }}>
                  {metrics.openCount}
                </span>
              </div>
            )}
            {metrics.resolvedCount > 0 && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">Resolved</span>
                <span className="drawer-metric-value" style={{ color: "#34d399" }}>
                  {metrics.resolvedCount}
                </span>
              </div>
            )}
            {metrics.errorCount > 0 && (
              <div className="drawer-metric">
                <span className="drawer-metric-label">Errors Detected</span>
                <span className="drawer-metric-value" style={{ color: "#f87171" }}>
                  {metrics.errorCount}
                </span>
              </div>
            )}
          </div>
        </DrawerSection>
      )}

      {/* Category View Tabs */}
      {(errors.length > 0 || auditQuotes.length > 0 || remediationPatches.length > 0) && (
        <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
          {[
            {
              id: "all",
              label: "All Details",
              count:
                findings.length + errors.length + auditQuotes.length + remediationPatches.length,
            },
            { id: "findings", label: "Findings", count: findings.length },
            { id: "errors", label: "Errors & Stacks", count: errors.length },
            { id: "quotes", label: "Audit Quotes", count: auditQuotes.length },
            { id: "patches", label: "Remediations", count: remediationPatches.length },
          ]
            .filter((tab) => tab.id === "all" || tab.count > 0)
            .map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setActiveTab(tab.id as "all" | "errors" | "findings" | "quotes" | "patches")
                }
                style={{
                  background:
                    activeTab === tab.id
                      ? "rgba(255, 255, 255, 0.12)"
                      : "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${activeTab === tab.id ? "#71717a" : "#27272a"}`,
                  color: activeTab === tab.id ? "#fafafa" : "#a1a1aa",
                  fontSize: "10.5px",
                  padding: "2px 7px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: "9.5px",
                    color: "#71717a",
                    background: "#1f1f23",
                    padding: "0 3px",
                    borderRadius: "2px",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
        </div>
      )}

      {/* Structured Error Stack Traces Section */}
      {errors.length > 0 && (activeTab === "all" || activeTab === "errors") && (
        <DrawerSection title="Structured Error Stack Traces" count={errors.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {errors.map((err, idx) => (
              <StackTraceViewer key={err.id || idx} error={err} />
            ))}
          </div>
        </DrawerSection>
      )}

      {/* Adversarial Audit Feedback Quotes Section */}
      {auditQuotes.length > 0 && (activeTab === "all" || activeTab === "quotes") && (
        <DrawerSection
          title="Adversarial Audit Quotes & Critic Feedback"
          count={auditQuotes.length}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {auditQuotes.map((q, idx) => (
              <AdversarialQuoteBox key={q.id || idx} quote={q} />
            ))}
          </div>
        </DrawerSection>
      )}

      {/* Remediation Patches Section */}
      {remediationPatches.length > 0 && (activeTab === "all" || activeTab === "patches") && (
        <DrawerSection title="Remediation Patches & Diffs" count={remediationPatches.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {remediationPatches.map((p, idx) => (
              <RemediationPatchViewer key={p.id || idx} patch={p} />
            ))}
          </div>
        </DrawerSection>
      )}

      {/* Pushback & Quality Findings Section with Search & Filtering */}
      {findings.length > 0 && (activeTab === "all" || activeTab === "findings") && (
        <DrawerSection title="Quality Findings & Pushbacks" count={filteredFindings.length}>
          {/* Search & Filter Toolbar */}
          {showFilters && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                marginBottom: "12px",
                backgroundColor: "#0d0d11",
                border: "1px solid #27272a",
                borderRadius: "6px",
                padding: "8px 10px",
              }}
            >
              {/* Search Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: "4px",
                  padding: "4px 8px",
                }}
              >
                <IconSearch size={13} style={{ color: "#71717a" }} />
                <input
                  type="text"
                  placeholder="Search findings, observations, remediations, requirements..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#fafafa",
                    fontSize: "11.5px",
                    fontFamily: "var(--font-sans)",
                  }}
                  aria-label="Filter findings"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#71717a",
                      cursor: "pointer",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                    aria-label="Clear search"
                  >
                    <IconX size={13} />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "6px",
                  fontSize: "11px",
                }}
              >
                {/* Severity Filter */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span
                    style={{ color: "#71717a", fontSize: "10.5px", textTransform: "uppercase" }}
                  >
                    Severity:
                  </span>
                  {(["all", "critical", "important", "suggestion"] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverityFilter(sev)}
                      style={{
                        background:
                          severityFilter === sev
                            ? "rgba(255, 255, 255, 0.12)"
                            : "rgba(255, 255, 255, 0.03)",
                        border: `1px solid ${severityFilter === sev ? "#71717a" : "#27272a"}`,
                        color: severityFilter === sev ? "#fafafa" : "#a1a1aa",
                        fontSize: "10.5px",
                        padding: "1px 6px",
                        borderRadius: "3px",
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {sev}
                    </button>
                  ))}
                </div>

                {/* Status Filter */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span
                    style={{ color: "#71717a", fontSize: "10.5px", textTransform: "uppercase" }}
                  >
                    Status:
                  </span>
                  {(["all", "open", "resolved"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      style={{
                        background:
                          statusFilter === st
                            ? "rgba(255, 255, 255, 0.12)"
                            : "rgba(255, 255, 255, 0.03)",
                        border: `1px solid ${statusFilter === st ? "#71717a" : "#27272a"}`,
                        color: statusFilter === st ? "#fafafa" : "#a1a1aa",
                        fontSize: "10.5px",
                        padding: "1px 6px",
                        borderRadius: "3px",
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Render Filtered Findings */}
          {filteredFindings.length > 0 ? (
            filteredFindings.map((f, index) => (
              <FindingDetailCard
                key={`${f.id}-${index}`}
                finding={f}
                defaultExpanded={f.severity === "critical"}
              />
            ))
          ) : (
            <div
              style={{
                padding: "12px",
                textAlign: "center",
                color: "#71717a",
                fontSize: "11.5px",
                backgroundColor: "#0d0d11",
                borderRadius: "4px",
                border: "1px dashed #27272a",
              }}
            >
              No findings matched the selected filters.
            </div>
          )}
        </DrawerSection>
      )}

      {/* Critic Completeness Verification */}
      {node?.kind === "critic" && (
        <DrawerSection title="Completeness Verification">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#34d399",
              fontSize: "12px",
              fontFamily: "var(--font-sans)",
            }}
          >
            <IconShieldCheck size={16} />
            <span>Whole-Run Completeness Scope Audited</span>
          </div>
        </DrawerSection>
      )}
    </div>
  );
});

ErrorInspector.displayName = "ErrorInspector";
