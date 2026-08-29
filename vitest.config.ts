import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    pool: "threads",
    // Without this, running `npm run build` before `npm test` locally makes
    // vitest also pick up the compiled dist/**/*.test.js output alongside
    // the real src/**/*.test.ts files, silently doubling every test run.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
