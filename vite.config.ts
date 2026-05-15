import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the Geometry Dash Telegram Mini App MVP.
// - React for the UI shell
// - Phaser bundled normally (do not pre-bundle, it pulls in some optionals)
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  optimizeDeps: {
    exclude: ["phaser"],
  },
  build: {
    target: "es2020",
    sourcemap: false,
  },
});
