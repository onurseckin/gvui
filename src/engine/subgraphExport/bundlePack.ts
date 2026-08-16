import type { CanvasAnnotation } from "../../components/CanvasAnnotations/types";
import type {
  BookmarkPackAuthor,
  BookmarkPackBundle,
  BookmarkPackMetadata,
  BundleParseResult,
  ExtractedSubgraph,
} from "./types";

export const BUNDLE_SCHEMA_VERSION = "gvui-bookmark-pack/v1" as const;

/**
 * Computes a fast, deterministic 64-bit FNV-1a style hex checksum for the bundle contents.
 */
export function computeBundleChecksum(
  metadata: BookmarkPackMetadata,
  subgraph: ExtractedSubgraph["dataset"],
  bookmarks: CanvasAnnotation[],
): string {
  const canonicalPayload = JSON.stringify({
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    id: metadata.id,
    title: metadata.title,
    version: metadata.version,
    nodes: (subgraph.nodes || []).map((n) => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      status: n.status,
    })),
    edges: (subgraph.edges || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.kind,
    })),
    bookmarks: (bookmarks || []).map((b) => ({
      id: b.id,
      title: b.title,
      content: b.content,
      nodeId: b.nodeId,
    })),
  });

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;

  for (let i = 0; i < canonicalPayload.length; i++) {
    const code = canonicalPayload.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ (code >> 4), 0x01000193);
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `sha256-${hex1}${hex2}`;
}

/**
 * Verifies that the bundle's checksum matches its internal content.
 */
export function validateBundleChecksum(bundle: BookmarkPackBundle): boolean {
  if (!bundle || !bundle.checksum || typeof bundle.checksum !== "string") {
    return false;
  }
  const computed = computeBundleChecksum(bundle.metadata, bundle.subgraph, bundle.bookmarks || []);
  return computed === bundle.checksum;
}

/**
 * Creates a portable, versioned Bookmark Pack bundle from an extracted subgraph.
 */
export function createBookmarkPack(
  extracted: ExtractedSubgraph,
  metadataOverride?: Partial<BookmarkPackMetadata>,
  customBookmarks?: CanvasAnnotation[],
): BookmarkPackBundle {
  const now = new Date().toISOString();
  const baseTitle = extracted.dataset.title || extracted.dataset.id || "Subgraph Pack";
  const packId =
    metadataOverride?.id ||
    `pack-${baseTitle.toLowerCase().replace(/[^a-z0-9-_]+/g, "-")}-${Date.now().toString(36)}`;

  const author: BookmarkPackAuthor = {
    name: metadataOverride?.author?.name || "GVUI Architect",
    role: metadataOverride?.author?.role || "human",
    avatar: metadataOverride?.author?.avatar,
    email: metadataOverride?.author?.email,
  };

  const metadata: BookmarkPackMetadata = {
    id: packId,
    title: metadataOverride?.title || baseTitle,
    description: metadataOverride?.description || extracted.dataset.description || "",
    version: metadataOverride?.version || "1.0.0",
    author,
    tags: metadataOverride?.tags || ["subgraph", "export", "gvui"],
    license: metadataOverride?.license || "MIT",
    createdAt: metadataOverride?.createdAt || now,
    updatedAt: now,
    sourceGraphId: extracted.dataset.id,
    sourceGraphTitle: extracted.dataset.title,
    stats: extracted.stats,
    customFields: metadataOverride?.customFields,
  };

  const bookmarks = customBookmarks ?? extracted.annotations ?? [];
  const checksum = computeBundleChecksum(metadata, extracted.dataset, bookmarks);

  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    metadata,
    subgraph: extracted.dataset,
    boundaryEdges: extracted.boundaryEdges,
    bookmarks,
    checksum,
  };
}

/**
 * Serializes Bookmark Pack bundle to JSON string.
 */
export function serializeBookmarkPack(pack: BookmarkPackBundle, pretty = true): string {
  return JSON.stringify(pack, null, pretty ? 2 : 0);
}

/**
 * Helper to check if a value is a non-null object record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates SemVer version format (e.g. 1.0.0, 2.1.3-beta).
 */
export function isValidSemVer(version: string): boolean {
  if (typeof version !== "string") return false;
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version.trim());
}

/**
 * Type-safe structural and schema validation for Bookmark Pack bundles.
 */
export function validateBookmarkPack(candidate: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isRecord(candidate)) {
    return { valid: false, errors: ["Bundle root must be a JSON object"] };
  }

  // Schema version
  if (candidate.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    errors.push(
      `Invalid schemaVersion: expected '${BUNDLE_SCHEMA_VERSION}', got '${String(
        candidate.schemaVersion,
      )}'`,
    );
  }

  // Checksum
  if (typeof candidate.checksum !== "string" || candidate.checksum.trim().length === 0) {
    errors.push("Missing or invalid 'checksum' string");
  }

  // Metadata validation
  if (!isRecord(candidate.metadata)) {
    errors.push("Missing or invalid 'metadata' object");
  } else {
    const meta = candidate.metadata;
    if (typeof meta.id !== "string" || meta.id.trim().length === 0) {
      errors.push("Metadata 'id' must be a non-empty string");
    }
    if (typeof meta.title !== "string" || meta.title.trim().length === 0) {
      errors.push("Metadata 'title' must be a non-empty string");
    }
    if (typeof meta.version !== "string" || !isValidSemVer(meta.version)) {
      errors.push("Metadata 'version' must be a valid SemVer string (e.g., '1.0.0')");
    }
    if (
      !isRecord(meta.author) ||
      typeof meta.author.name !== "string" ||
      meta.author.name.trim().length === 0
    ) {
      errors.push("Metadata 'author' must be an object with a non-empty 'name' string");
    }
    if (meta.tags !== undefined && !Array.isArray(meta.tags)) {
      errors.push("Metadata 'tags' if provided must be an array of strings");
    }
  }

  // Subgraph validation
  if (!isRecord(candidate.subgraph)) {
    errors.push("Missing or invalid 'subgraph' object");
  } else {
    const sg = candidate.subgraph;
    if (typeof sg.id !== "string" || sg.id.trim().length === 0) {
      errors.push("Subgraph 'id' must be a non-empty string");
    }
    if (!Array.isArray(sg.nodes)) {
      errors.push("Subgraph 'nodes' must be an array");
    } else {
      for (let i = 0; i < sg.nodes.length; i++) {
        const node = sg.nodes[i];
        if (!isRecord(node) || typeof node.id !== "string" || node.id.trim().length === 0) {
          errors.push(`Subgraph node at index ${i} must be an object with a valid 'id'`);
          break;
        }
      }
    }

    if (!Array.isArray(sg.edges)) {
      errors.push("Subgraph 'edges' must be an array");
    } else {
      for (let i = 0; i < sg.edges.length; i++) {
        const edge = sg.edges[i];
        if (
          !isRecord(edge) ||
          typeof edge.id !== "string" ||
          typeof edge.source !== "string" ||
          typeof edge.target !== "string"
        ) {
          errors.push(
            `Subgraph edge at index ${i} must be an object with 'id', 'source', and 'target'`,
          );
          break;
        }
      }
    }
  }

  // Bookmarks validation
  if (!Array.isArray(candidate.bookmarks)) {
    errors.push("Missing or invalid 'bookmarks' array");
  } else {
    for (let i = 0; i < candidate.bookmarks.length; i++) {
      const b = candidate.bookmarks[i];
      if (!isRecord(b) || typeof b.id !== "string" || typeof b.content !== "string") {
        errors.push(`Bookmark at index ${i} must be an object with string 'id' and 'content'`);
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Safely parses and validates a Bookmark Pack bundle from a JSON string or raw unknown object.
 */
export function parseBookmarkPack(input: unknown): BundleParseResult {
  let parsedObject: unknown = input;

  if (typeof input === "string") {
    try {
      parsedObject = JSON.parse(input);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `JSON parse failure: ${errorMsg}`,
        details: [errorMsg],
      };
    }
  }

  const validation = validateBookmarkPack(parsedObject);
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed for Bookmark Pack: ${validation.errors.join("; ")}`,
      details: validation.errors,
    };
  }

  // Safe cast after full schema validation
  const validBundle = parsedObject as unknown as BookmarkPackBundle;

  return {
    success: true,
    bundle: validBundle,
  };
}
