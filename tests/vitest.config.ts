import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Tests share one local database; run files sequentially for deterministic rate-limit checks.
    fileParallelism: false,
  },
});
