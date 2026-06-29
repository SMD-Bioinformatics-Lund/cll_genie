/// <reference types="vitest" />

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

declare const process: {
  env: Record<string, string | undefined>;
};

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