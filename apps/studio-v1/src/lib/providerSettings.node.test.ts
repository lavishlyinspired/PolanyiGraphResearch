import { beforeEach, describe, expect, test } from "vitest";
import { clearProviderOverride, loadProviderOverride, saveProviderOverride } from "./providerSettings";

const STORAGE_KEY = "polanyi.providerOverride";

// Node's real `localStorage` global needs a --localstorage-file backing
// store this test environment doesn't configure. The production code uses
// the real browser localStorage (verified in Browser Mode tests); this is
// a minimal in-memory stand-in just so the same code path runs under Node.
function installFakeLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  installFakeLocalStorage();
  localStorage.clear();
});

describe("loadProviderOverride", () => {
  test("returns null when nothing has been saved", () => {
    expect(loadProviderOverride()).toBeNull();
  });

  test("returns the real saved override", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ model: "deepseek-v4-flash", apiKey: "sk-real-key", baseUrl: "https://opencode.ai/zen/v1" }),
    );
    expect(loadProviderOverride()).toEqual({
      model: "deepseek-v4-flash",
      apiKey: "sk-real-key",
      baseUrl: "https://opencode.ai/zen/v1",
    });
  });

  test("returns null for corrupted storage rather than throwing", () => {
    localStorage.setItem(STORAGE_KEY, "not valid json{{{");
    expect(loadProviderOverride()).toBeNull();
  });

  test("returns null when the model field is missing", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: "k" }));
    expect(loadProviderOverride()).toBeNull();
  });

  test("returns null when the apiKey field is missing", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ model: "gpt-4o" }));
    expect(loadProviderOverride()).toBeNull();
  });
});

describe("saveProviderOverride", () => {
  test("persists a real override that loadProviderOverride can read back", () => {
    saveProviderOverride({ model: "gpt-4o", apiKey: "sk-abc" });
    expect(loadProviderOverride()).toEqual({ model: "gpt-4o", apiKey: "sk-abc" });
  });
});

describe("clearProviderOverride", () => {
  test("removes a previously saved override", () => {
    saveProviderOverride({ model: "gpt-4o", apiKey: "sk-abc" });
    clearProviderOverride();
    expect(loadProviderOverride()).toBeNull();
  });

  test("is a no-op when nothing was saved", () => {
    expect(() => clearProviderOverride()).not.toThrow();
  });
});
