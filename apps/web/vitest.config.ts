import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.vitest.ts", "src/**/*.vitest.tsx"],
  },
  resolve: {
    alias: {
      "@": resolve(root, "src"),
      "@openloaf/ui": resolve(root, "../../packages/ui/src"),
    },
  },
});
