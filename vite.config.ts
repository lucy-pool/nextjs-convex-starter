import path from "path";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      "/api/auth": {
        target: process.env.VITE_CONVEX_SITE_URL,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    tanstackStart({
      spa: { enabled: true },
    }),
    react(),
  ],
  resolve: {
    alias: [
      { find: "@/convex", replacement: path.resolve(__dirname, "./convex") },
      { find: "@/", replacement: path.resolve(__dirname, "./src") + "/" },
    ],
  },
});
