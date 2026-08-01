import { execSync } from "child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function wasmAutoRebuildPlugin(): Plugin {
  return {
    name: "wasm-auto-rebuild",
    handleHotUpdate({ file }) {
      if (file.endsWith(".rs") || file.endsWith("Cargo.toml")) {
        console.log("\n⚡ Rust source file changed. Rebuilding WASM package...");
        try {
          execSync("bun run build:wasm", { stdio: "inherit" });
          console.log("✨ WASM package rebuilt successfully!");
        } catch (err) {
          console.error("❌ WASM rebuild failed:", err);
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), wasmAutoRebuildPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      usePolling: true,
    },
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
