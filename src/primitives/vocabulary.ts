/**
 * Shared treatment for vocabulary members this renderer ships no preset for.
 *
 * Node kind, node role, node status, edge kind and section type are all open vocabularies: a graph
 * from another project may use none of the presets, and every member it does use has to arrive with
 * an identity of its own. An unfamiliar member is a normal case, never an error, and never a silent
 * redraw of something familiar.
 */

/** Used where nothing was recorded at all, so absence never wears a generated colour. */
export const NEUTRAL_ACCENT = "#71717a";

/**
 * A deterministic accent for a member with no preset: FNV-1a over the member's own name, spread
 * across hue, saturation and lightness. The same name yields the same colour in every view and
 * across reloads, and two unfamiliar members are told apart at a glance.
 *
 * Hue alone is not enough — 360 buckets collide often enough that a vocabulary of twenty would be
 * expected to contain a clash — so independent digits of the hash drive the other two channels as
 * well. Both stay inside a narrow band, which keeps every generated accent legible on the canvas
 * and out of the greys the presets reserve for structure.
 */
export function stableAccent(seed: string): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  const hue = unsigned % 360;
  const saturation = 52 + (Math.floor(unsigned / 360) % 26);
  const lightness = 50 + (Math.floor(unsigned / (360 * 26)) % 18);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * The member's own name, made readable. `sub_investigator`, `subInvestigator` and
 * `sub-investigator` all read as "SUB INVESTIGATOR", which is what the preset labels look like, so
 * an unfamiliar member sits in the same visual register as a familiar one.
 */
export function vocabularyLabel(raw: string): string {
  const words = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.:/]+/)
    .filter((word) => word.length > 0);
  return words.length === 0 ? raw : words.join(" ").toUpperCase();
}

/** True when the table itself owns the key, so nothing inherited from Object passes for a preset. */
export function hasPreset(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

/** The member exactly as the dataset spelled it, or undefined when it declared nothing usable. */
export function readVocabularyMember(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
