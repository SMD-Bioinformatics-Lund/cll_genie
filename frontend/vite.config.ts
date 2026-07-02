/// <reference types="vitest" />

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

declare const process: {
  env: Record<string, string | undefined>;
  getBuiltinModule(name: "node:fs"): {
    readFileSync(path: string, encoding: "utf8"): string;
  };
};

function readAppVersion(): string {
  const { readFileSync } = process.getBuiltinModule("node:fs");
  const candidates = [
    "../backend/src/cll_genie_api/version.py",
    "./app-version.py",
  ];

  for (const path of candidates) {
    try {
      const match = readFileSync(path, "utf8").match(/__version__\s*=\s*["']([^"']+)["']/);
      if (match) return match[1];
    } catch {
      // The container build copies the version module to the second path.
    }
  }

  throw new Error("Unable to read the CLL Genie application version");
}

function normalizePrefix(prefix: string): string {
  if (!prefix.startsWith("/")) {
    prefix = `/${prefix}`;
  }

  if (prefix.endsWith("/")) {
    prefix = prefix.slice(0, -1);
  }

  return prefix;
}

export default defineConfig(() => {
  const appPrefix = normalizePrefix(
    process.env.APPLICATION_PREFIX || "/cll_genie_dev",
  );

  const appBase = `${appPrefix}/`;
  const publicPort = Number(process.env.CLL_GENIE_PORT);

  return {
    base: appBase,

    define: {
      __APP_VERSION__: JSON.stringify(readAppVersion()),
    },

    plugins: [react(), tailwindcss()],

    build: {},

    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,

      watch: {
        usePolling: true,
        interval: 300,
      },

      hmr: {
        clientPort: publicPort,
      },

      proxy: {
        [`${appPrefix}/api`]: {
          target: "http://api:8000",
          changeOrigin: true,
        },

        [`${appPrefix}/health`]: {
          target: "http://api:8000",
          changeOrigin: true,
        },
      },
    },

    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.ts",
    },
  };
});
