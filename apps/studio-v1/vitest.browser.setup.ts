import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll } from "vitest";

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
