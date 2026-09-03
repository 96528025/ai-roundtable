import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url))
    }
  },
  test: {
    environment: "node",
    restoreMocks: true,
    // Vitest owns `*.test.ts` under tests/ and evals/ only. Browser specs live in
    // tests/browser/ with a `.spec.ts` suffix and belong to Playwright.
    include: ["tests/**/*.test.ts", "evals/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "tests/browser/**"]
  }
});
