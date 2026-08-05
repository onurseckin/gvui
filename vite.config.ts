import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const GRAPHS_DIR = path.resolve(import.meta.dirname, "public/data/graphs");
const MANIFEST_PATH = path.join(GRAPHS_DIR, "manifest.json");
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // generous for a graph JSON file, small enough to bound memory

/**
 * The dev server binds `0.0.0.0` (so Docker's port mapping and LAN access work), which makes
 * `/api/graphs` reachable by anything that can reach the host — including a malicious page open in
 * another browser tab, via a plain cross-origin `fetch`. Browsers always attach `Origin` to a
 * cross-origin request, so rejecting a mismatched one blocks that CSRF-style write without having
 * to hardcode "localhost" and break LAN access.
 */
function isSameOriginRequest(req: { headers: { origin?: string; host?: string } }): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // no Origin header: curl, direct navigation, same-origin legacy clients
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function listGraphFiles(): string[] {
  if (!existsSync(GRAPHS_DIR)) return [];
  return readdirSync(GRAPHS_DIR)
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .map((file) => file.slice(0, -".json".length))
    .sort((a, b) => a.localeCompare(b));
}

function writeManifest(files: string[]): void {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(files, null, 2)}\n`, "utf-8");
}

/**
 * Dev-only filesystem bridge for the sidebar's graph list. `public/` is served verbatim with no
 * server-side code behind it in production (nginx), so this plugin only wires up `/api/graphs`
 * via `configureServer` — the prod static build has no such route, and the client falls back to
 * the checked-in `manifest.json` snapshot instead of calling it.
 */
function graphFilesApiPlugin(): Plugin {
  return {
    name: "graph-files-api",
    configureServer(server) {
      server.middlewares.use("/api/graphs", (req, res) => {
        res.setHeader("Content-Type", "application/json");

        if (!isSameOriginRequest(req)) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "Cross-origin requests are not allowed" }));
          return;
        }

        if (req.method === "GET") {
          const files = listGraphFiles();
          writeManifest(files);
          res.statusCode = 200;
          res.end(JSON.stringify({ files }));
          return;
        }

        if (req.method === "POST") {
          const chunks: Buffer[] = [];
          let receivedBytes = 0;
          let rejectedForSize = false;

          req.on("data", (chunk: Buffer) => {
            if (rejectedForSize) return;
            receivedBytes += chunk.length;
            if (receivedBytes > MAX_UPLOAD_BYTES) {
              rejectedForSize = true;
              res.statusCode = 413;
              res.end(JSON.stringify({ error: "Upload too large (5MB limit)" }));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });
          req.on("error", () => {
            if (rejectedForSize) return;
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Request stream failed" }));
          });
          req.on("end", () => {
            if (rejectedForSize) return;
            try {
              const body = Buffer.concat(chunks).toString("utf-8");
              const parsed = JSON.parse(body) as {
                filename?: unknown;
                content?: unknown;
                overwrite?: unknown;
              };
              const rawName = typeof parsed.filename === "string" ? parsed.filename.trim() : "";
              if (!rawName) throw new Error("filename is required");

              const baseName = path.basename(rawName).replace(/\.json$/i, "");
              if (!/^[a-zA-Z0-9_-]+$/.test(baseName)) {
                throw new Error(
                  "filename must contain only letters, numbers, hyphens and underscores",
                );
              }

              const content = typeof parsed.content === "string" ? parsed.content : "";
              JSON.parse(content); // validate it's parseable JSON before it touches disk

              const targetPath = path.join(GRAPHS_DIR, `${baseName}.json`);
              if (existsSync(targetPath) && parsed.overwrite !== true) {
                res.statusCode = 409;
                res.end(
                  JSON.stringify({
                    error: `"${baseName}.json" already exists. Remove it or rename the upload.`,
                  }),
                );
                return;
              }

              mkdirSync(GRAPHS_DIR, { recursive: true });
              writeFileSync(targetPath, content, "utf-8");

              const files = listGraphFiles();
              writeManifest(files);
              res.statusCode = 200;
              res.end(JSON.stringify({ files, id: baseName }));
            } catch (err) {
              res.statusCode = 400;
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : "Invalid request",
                }),
              );
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method not allowed" }));
      });
    },
  };
}

function wasmAutoRebuildPlugin(): Plugin {
  return {
    name: "wasm-auto-rebuild",
    handleHotUpdate({ file, server }) {
      if (file.endsWith(".rs") || file.endsWith("Cargo.toml") || file.includes("/crates/")) {
        console.log("\n⚡ Rust source file changed. Rebuilding WASM package...");
        try {
          execSync("bun run build:wasm", { stdio: "inherit" });
          console.log("✨ WASM package rebuilt successfully! Triggering browser reload...");
          server.ws.send({ type: "full-reload" });
          return [];
        } catch (error) {
          console.error("❌ WASM rebuild failed:", error);
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), wasmAutoRebuildPlugin(), graphFilesApiPlugin()],
  server: {
    host: "0.0.0.0",
    port: 4444,
    watch: {
      usePolling: true,
      ignored: ["**/target/**", "**/scratch/**", "**/.git/**", "**/.tmp/**"],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5555,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/@tanstack")
          ) {
            return "vendor";
          }
          if (id.includes("node_modules/@dagrejs")) {
            return "dagre";
          }
        },
      },
    },
  },
});
