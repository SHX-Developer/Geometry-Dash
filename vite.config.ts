import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the Geometry Dash Telegram Mini App MVP.
// - React for the UI shell
// - Phaser is pre-bundled by Vite for stable dev-mode ESM interop
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2020",
    sourcemap: false,
  },
});
