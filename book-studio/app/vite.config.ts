import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2500, // the PDF engine is large; it is loaded only when exporting
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
