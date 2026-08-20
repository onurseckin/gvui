import { EVIDENCE_CLASSES, type JsonGraphDataset } from "../src/state/graphSchema";

/**
 * The current graph contract, enforced at import time.
 *
 * There is one layout. A dataset either matches what the producer emits today or it is rejected —
 * nothing is rewritten on the way in, because a rewrite is what let two spellings of the same fact
 * survive long enough for the renderer to have to know both.
 *
 * Only genuine duplicates are named here. A field that carries content of its own is not a
 * duplicate no matter how old it looks: `playwrightMetadata.screenshots` is retired because those
 * assets already live in `node.assets`, while the viewport, traces, videos, test file, duration,
 * browser and status beside it exist nowhere else and stay exactly where they are.
 *
 * Vocabulary is deliberately absent from this file. An unrecognised node kind, role, edge kind or
 * section type is a normal dataset, not a broken one; it is the shared validator's job to note it
 * and the renderer's job to draw it.
 */

interface RetiredNodeField {
  /** Key path below the node, e.g. `metadata.screenshots`. */
  readonly path: readonly string[];
  /** Where the same content lives under the current contract, relative to the node. */
  readonly canonical: string;
}

export const RETIRED_NODE_FIELDS: readonly RetiredNodeField[] = [
  { path: ["mediaAssets"], canonical: "assets" },
  { path: ["screenshots"], canonical: "assets" },
  { path: ["metadata", "assets"], canonical: "assets" },
  { path: ["metadata", "mediaAssets"], canonical: "assets" },
  { path: ["metadata", "screenshots"], canonical: "assets" },
  { path: ["metadata", "playwrightMetadata", "screenshots"], canonical: "assets" },
  { path: ["model"], canonical: "telemetry.model" },
  { path: ["harnessModel"], canonical: "telemetry.model" },
  { path: ["tier"], canonical: "telemetry.modelTier" },
];

/**
 * A finding points at the evidence it rests on; it does not carry a second copy of it. The
 * producer writes `screenshotAssetIds` and the assets themselves stay with the node that made them.
 */
const RETIRED_FINDING_FIELD = "screenshots";

/** Telemetry values that must arrive as `{ value, evidence_class }` rather than as bare scalars. */
const EVIDENCED_TELEMETRY_FIELDS: readonly string[] = [
  "model",
  "modelTier",
  "thinkingLevel",
  "tokensIn",
  "tokensOut",
];

const EVIDENCE_CLASS_SET = new Set<string>(EVIDENCE_CLASSES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/** Quotes strings and names everything else by type, so an error shows what actually arrived. */
function describeValue(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/** `dataset.nodes[3] (node-x)` — the index locates the entry, the id names it. */
function entryLabel(entry: Record<string, unknown>, collection: string, index: number): string {
  const id = entry.id;
  return typeof id === "string" && id.trim().length > 0
    ? `dataset.${collection}[${index}] (${id})`
    : `dataset.${collection}[${index}]`;
}

/** Resolves a key path without creating anything, returning the value at the leaf if it is set. */
function valueAt(root: Record<string, unknown>, path: readonly string[]): unknown {
  let cursor: Record<string, unknown> | undefined = root;
  for (const segment of path.slice(0, -1)) {
    cursor = asRecord(cursor?.[segment]);
    if (cursor === undefined) return undefined;
  }
  const leaf = path[path.length - 1];
  return leaf === undefined ? undefined : cursor?.[leaf];
}

function collectRetiredNodeFields(node: Record<string, unknown>, label: string): string[] {
  const issues: string[] = [];

  for (const field of RETIRED_NODE_FIELDS) {
    if (valueAt(node, field.path) === undefined) continue;
    issues.push(
      `${label}.${field.path.join(".")}: retired field, expected ${label}.${field.canonical}`,
    );
  }

  const findings = asRecord(node.metadata)?.findings;
  for (const [index, entry] of (Array.isArray(findings) ? findings : []).entries()) {
    if (asRecord(entry)?.[RETIRED_FINDING_FIELD] === undefined) continue;
    issues.push(
      `${label}.metadata.findings[${index}].${RETIRED_FINDING_FIELD}: retired field, expected ` +
        `${label}.metadata.findings[${index}].screenshotAssetIds referencing ${label}.assets`,
    );
  }

  return issues;
}

function collectFlatTelemetry(node: Record<string, unknown>, label: string): string[] {
  const telemetry = asRecord(node.telemetry);
  if (telemetry === undefined) return [];

  const issues: string[] = [];
  for (const field of EVIDENCED_TELEMETRY_FIELDS) {
    const declared = telemetry[field];
    if (declared === undefined) continue;
    const record = asRecord(declared);
    if (record !== undefined && "value" in record) continue;
    issues.push(
      `${label}.telemetry.${field}: expected { value, evidence_class }, received ` +
        `${describeValue(declared)}`,
    );
  }
  return issues;
}

/**
 * Every provenance label in the dataset, wherever it sits. The walk is structural rather than
 * schema-driven so a dataset the renderer has never seen is held to the same honesty rule: a value
 * that claims a provenance must claim one the reader understands.
 */
function collectEvidenceClasses(value: unknown, path: string, issues: string[]): void {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      collectEvidenceClasses(entry, `${path}[${index}]`, issues);
    }
    return;
  }

  const record = asRecord(value);
  if (record === undefined) return;

  if ("evidence_class" in record) {
    const declared = record.evidence_class;
    if (typeof declared !== "string" || !EVIDENCE_CLASS_SET.has(declared)) {
      issues.push(
        `${path}.evidence_class: ${describeValue(declared)} is not an evidence class, expected one ` +
          `of ${EVIDENCE_CLASSES.join(", ")}`,
      );
    }
  }

  for (const [key, entry] of Object.entries(record)) {
    if (key === "evidence_class") continue;
    collectEvidenceClasses(entry, `${path}.${key}`, issues);
  }
}

/**
 * Every way the dataset departs from the current contract, in one list, so a stale export is fixed
 * in a single pass. An empty list means the dataset is written the way the producer writes it today.
 */
export function findContractViolations(dataset: JsonGraphDataset): string[] {
  const issues: string[] = [];

  for (const [index, node] of dataset.nodes.entries()) {
    const label = entryLabel(node, "nodes", index);
    issues.push(...collectRetiredNodeFields(node, label));
    issues.push(...collectFlatTelemetry(node, label));
    collectEvidenceClasses(node, label, issues);
  }

  for (const [index, edge] of dataset.edges.entries()) {
    collectEvidenceClasses(edge, entryLabel(edge, "edges", index), issues);
  }

  return issues;
}
