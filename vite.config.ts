import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync } from "fs";
import type { Plugin } from "vite";

const host = process.env.TAURI_DEV_HOST;

// Serves ghostty-vt.wasm in dev and emits it as an asset in production.
// ghostty-web's Ghostty.load() falls back to fetching /ghostty-vt.wasm,
// so this ensures the file is reachable in both Vite dev server and Tauri builds.
function ghosttyWasmPlugin(): Plugin {
  const wasmPath = path.resolve(__dirname, "node_modules/ghostty-web/ghostty-vt.wasm");
  return {
    name: "ghostty-wasm",
    configureServer(server) {
      server.middlewares.use("/ghostty-vt.wasm", (_, res) => {
        res.setHeader("Content-Type", "application/wasm");
        res.end(readFileSync(wasmPath));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "ghostty-vt.wasm",
        source: readFileSync(wasmPath),
      });
    },
  };
}

export default defineConfig(async () => ({
  plugins: [tailwindcss(), react(), ghosttyWasmPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["collab-public", "ghostty-web"],
    entries: ["index.html", "src/**/*.{ts,tsx}"],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/.claude/**", "**/.codex/**", "**/collab-public/**"],
    },
  },
}));
