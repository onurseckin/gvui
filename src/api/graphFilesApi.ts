/**
 * Client for the sidebar's graph file list. `/api/graphs` only exists behind the Vite dev server
 * (see `vite.config.ts`'s `graph-files-api` plugin) — the production build is served verbatim by
 * nginx with no backend, so every call here degrades to the checked-in `manifest.json` snapshot
 * instead of throwing when that route isn't there.
 */

interface GraphFilesResponse {
  files: string[];
}

function isJsonResponse(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").includes("application/json");
}

/** The build-time snapshot every environment can read, dev or prod. */
export async function fetchManifest(): Promise<string[]> {
  try {
    const res = await fetch("/data/graphs/manifest.json", { cache: "no-store" });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data)
      ? data.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

/** Re-scans the on-disk directory. Only answers when the dev API middleware is present. */
export async function refreshGraphFiles(): Promise<string[]> {
  const res = await fetch("/api/graphs", { cache: "no-store" });
  if (!isJsonResponse(res)) {
    throw new Error("Refreshing requires the dev server (bun run dev) — unavailable here.");
  }
  if (!res.ok) throw new Error(`Refresh failed (HTTP ${res.status}).`);
  const data = (await res.json()) as GraphFilesResponse;
  return data.files;
}

/** Writes a new graph JSON file into `public/data/graphs/`. Dev-server only, see above. */
export async function uploadGraphFile(
  filename: string,
  content: string,
): Promise<{ files: string[]; id: string }> {
  const res = await fetch("/api/graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content }),
  });

  if (!isJsonResponse(res)) {
    throw new Error("Adding files requires the dev server (bun run dev) — unavailable here.");
  }

  const data = (await res.json()) as { files?: string[]; id?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Upload failed (HTTP ${res.status}).`);
  }
  return { files: data.files ?? [], id: data.id ?? filename.replace(/\.json$/i, "") };
}
