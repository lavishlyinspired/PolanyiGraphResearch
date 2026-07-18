import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll } from "vitest";
import "@/theme/tokens.css";
import "@/theme/components.css";

export const worker = setupWorker();

beforeAll(async () => {
  await worker.start({ quiet: true, onUnhandledRequest: "bypass" });
});

afterEach(() => {
  worker.resetHandlers();
});

afterAll(() => {
  worker.stop();
});
