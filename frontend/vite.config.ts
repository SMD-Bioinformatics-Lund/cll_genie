import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/cll_genie/",
  plugins: [react(), tailwindcss()],
  build: {},
  server: {
    port: 5173,
    proxy: {
      "/cll_genie/api": "http://localhost:8000",
      "/cll_genie/health": "http://localhost:8000",
    },
  },
});
