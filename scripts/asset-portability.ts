import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { JsonGraphDataset } from "../src/state/graphSchema";

/**
 * The producer (the orchestration harness, on whatever machine ran the orchestration) writes
 * `assets[].url`/`thumbnailUrl` and `browserTests[].traces`/`videos` as filesystem paths that were
 * only ever meaningful on that machine — often absolute paths under its own gitignored `.capsules/`
 * directory. A browser can never load those, on the producing machine or anywhere else: there is no
 * production route that resolves an absolute local path, and the dev-only bridge that does resolve
 * one requires the exact producing machine.
 *
 * Only these two canonical locations are targeted, and deliberately not by key name alone: the
 * retired `metadata.playwrightMetadata.traces`/`videos` (superseded by `browserTests`, kept in
 * metadata as unique content per the no-backward-compatibility contract) uses the same key names
 * for values this importer must leave exactly as recorded, so scoping by key name only would
 * mis-fire on it. A generic string walk would additionally mis-fire on prose that happens to end in
 * something extension-like, e.g. a title mentioning a filename.
 */
function isAlreadyPortable(value: string, publicUrlPrefix: string): boolean {
  return (
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    /^https?:\/\//i.test(value) ||
    value.startsWith(publicUrlPrefix)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function existsAsFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves an asset reference to a real local file, trying it as given, then relative to the
 * capsule that recorded it, then relative to the repository the capsule belongs to — the two
 * places a capsule-relative path (rather than the producer's absolute one) could mean. Returns
 * undefined rather than a path that does not exist; nothing here fabricates a location.
 */
function resolveAssetSource(
  value: string,
  capsuleDir: string,
  repoRoot: string,
): string | undefined {
  let candidate = value;
  if (candidate.startsWith("file://")) candidate = candidate.slice(7);
  if (candidate.trim().length === 0) return undefined;

  if (isAbsolute(candidate)) {
    return existsAsFile(candidate) ? candidate : undefined;
  }
  const relativeToCapsule = resolve(capsuleDir, candidate);
  if (existsAsFile(relativeToCapsule)) return relativeToCapsule;
  const relativeToRepo = resolve(repoRoot, candidate);
  if (existsAsFile(relativeToRepo)) return relativeToRepo;
  return undefined;
}

/** Rewrites `url` and `thumbnailUrl` in place on one asset record, if either is a string. */
function rewriteMediaAsset(
  asset: Record<string, unknown>,
  rewrite: (value: string) => string | undefined,
): void {
  if (typeof asset.url === "string") {
    const replaced = rewrite(asset.url);
    if (replaced !== undefined) asset.url = replaced;
  }
  if (typeof asset.thumbnailUrl === "string") {
    const replaced = rewrite(asset.thumbnailUrl);
    if (replaced !== undefined) asset.thumbnailUrl = replaced;
  }
}

/** Rewrites every string entry of `traces` and `videos` in place on one browser-test record. */
function rewriteBrowserTestPaths(
  browserTest: Record<string, unknown>,
  rewrite: (value: string) => string | undefined,
): void {
  for (const key of ["traces", "videos"] as const) {
    const entries = browserTest[key];
    if (!Array.isArray(entries)) continue;
    for (let i = 0; i < entries.length; i++) {
      if (typeof entries[i] !== "string") continue;
      const replaced = rewrite(entries[i] as string);
      if (replaced !== undefined) entries[i] = replaced;
    }
  }
}

/**
 * Walks only `node.assets[]` and `node.browserTests[]` — the two canonical homes the graph
 * contract uses for asset references (see the module comment above) — and, for each reference that
 * resolves to a real local file, copies the bytes under the dataset's own portable assets directory
 * and rewrites the reference to the root-relative URL that serves them. The destination name is the
 * content hash: identical bytes referenced under different original names or from different
 * evidence directories collapse onto one copy instead of duplicating it.
 */
function walkAssetReferences(
  dataset: JsonGraphDataset,
  rewrite: (value: string) => string | undefined,
): void {
  for (const node of dataset.nodes) {
    if (Array.isArray(node.assets)) {
      for (const asset of node.assets) {
        if (isRecord(asset)) rewriteMediaAsset(asset, rewrite);
      }
    }
    if (Array.isArray(node.browserTests)) {
      for (const browserTest of node.browserTests) {
        if (isRecord(browserTest)) rewriteBrowserTestPaths(browserTest, rewrite);
      }
    }
  }
}

export interface PortabilizeOptions {
  /** The capsule directory the dataset was read from; capsule-relative references resolve here. */
  capsuleDir: string;
  /** The repository the capsule belongs to; repo-relative references resolve here as a fallback. */
  repoRoot: string;
  /** Where copied asset bytes land. */
  assetsDir: string;
  /** The root-relative URL prefix already-portable and newly-copied references share. */
  publicUrlPrefix: string;
}

export interface PortabilizeSummary {
  /** Distinct original references that now point at a file this importer copied. */
  rewrittenCount: number;
  /** Distinct original references that named a local file and could not be resolved. */
  unresolvedCount: number;
  warnings: string[];
}

/**
 * Rewrites every asset reference the dataset carries so it loads on any machine, not just the one
 * that produced the capsule — see the module comment above. Mutates the dataset in place: it is
 * the object about to be serialised, so what is mutated here is exactly what ships.
 */
export function portabilizeAssetReferences(
  dataset: JsonGraphDataset,
  options: PortabilizeOptions,
): PortabilizeSummary {
  const warnings: string[] = [];
  const rewritten = new Map<string, string>();
  const unresolved = new Set<string>();

  const rewrite = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || isAlreadyPortable(trimmed, options.publicUrlPrefix))
      return undefined;

    const already = rewritten.get(value);
    if (already !== undefined) return already;

    const sourcePath = resolveAssetSource(value, options.capsuleDir, options.repoRoot);
    if (sourcePath === undefined) {
      if (!unresolved.has(value)) {
        unresolved.add(value);
        warnings.push(
          `asset reference "${value}" does not resolve to a local file on this machine; left ` +
            `unchanged and it will not load in the browser`,
        );
      }
      return undefined;
    }

    const bytes = readFileSync(sourcePath);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const ext = extname(sourcePath).toLowerCase();
    const destName = `${hash}${ext}`;
    const destPath = join(options.assetsDir, destName);
    const destUrl = `${options.publicUrlPrefix}/${destName}`;

    if (!existsSync(destPath)) {
      if (!existsSync(options.assetsDir)) mkdirSync(options.assetsDir, { recursive: true });
      writeFileSync(destPath, bytes);
    }

    rewritten.set(value, destUrl);
    warnings.push(
      `rewrote asset "${value}" -> "${destUrl}" (copied from the capsule's own evidence)`,
    );
    return destUrl;
  };

  walkAssetReferences(dataset, rewrite);

  return { rewrittenCount: rewritten.size, unresolvedCount: unresolved.size, warnings };
}
