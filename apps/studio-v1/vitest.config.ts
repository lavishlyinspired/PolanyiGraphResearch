import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "./src") };

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  optimizeDeps: {
    include: ["zod", "react", "react-dom", "react-dom/client", "react/jsx-dev-runtime", "lucide-react"],
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/**/*.test.{ts,tsx}"],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.node.test.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        optimizeDeps: {
          include: ["zod", "react", "react-dom", "react-dom/client", "react/jsx-dev-runtime", "lucide-react"],
        },
        test: {
          name: "browser",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./vitest.browser.setup.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
