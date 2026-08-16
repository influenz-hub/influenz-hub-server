import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Tests share one seeded database, so they must not run concurrently.
    fileParallelism: false,
    env: { NODE_ENV: "test" },
    testTimeout: 20_000,
  },
});
