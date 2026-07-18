import { defineConfig } from "vitest/config";
import path from "node:path";

// Stryker-only config: the node project in isolation (no browser mode, which
// Stryker's vitest runner cannot drive). Mutates pure logic covered by
// *.node.test.ts.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    name: "node",
    environment: "node",
    include: ["src/**/*.node.test.ts"],
  },
});
