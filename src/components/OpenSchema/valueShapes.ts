/**
 * The shape layer for data this renderer has never seen. A graph may carry any property it likes,
 * so the only honest way to present an unfamiliar value is to read its shape and render it as what
 * it is — never to drop it, and never to coerce it into a field the UI happens to know.
 */

export type ValueShape = "text" | "url" | "number" | "boolean" | "empty" | "list" | "record";

/** Only absolute web links become anchors; a path-looking string stays text so nothing 404s. */
export function isLinkLike(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export function classifyValue(value: unknown): ValueShape {
  if (value === null || value === undefined) return "empty";
  if (Array.isArray(value)) return "list";
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "object":
      return "record";
    case "string": {
      const trimmed = value.trim();
      if (trimmed.length === 0) return "empty";
      return isLinkLike(trimmed) ? "url" : "text";
    }
    default:
      return "text";
  }
}

export function isScalarValue(value: unknown): boolean {
  const shape = classifyValue(value);
  return shape !== "list" && shape !== "record";
}

/** Non-finite numbers print as themselves: `NaN` is what the dataset carried, so `NaN` is shown. */
export function formatNumberValue(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** A one-line stand-in used where a container is counted rather than expanded. */
export function summarizeValue(value: unknown): string {
  switch (classifyValue(value)) {
    case "empty":
      return "empty";
    case "list": {
      const length = (value as unknown[]).length;
      return `${length} ${length === 1 ? "item" : "items"}`;
    }
    case "record": {
      const count = Object.keys(value as Record<string, unknown>).length;
      return `${count} ${count === 1 ? "field" : "fields"}`;
    }
    case "number":
      return formatNumberValue(value as number);
    case "boolean":
      return String(value);
    default: {
      const text = String(value).trim();
      return text.length > 60 ? `${text.slice(0, 57)}…` : text;
    }
  }
}

/** `residual_risks` and `residualRisks` both read as "Residual Risks"; an acronym keeps its case. */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return key;
  return words
    .map((word) =>
      word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
