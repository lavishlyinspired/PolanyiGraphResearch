/** Studio's provider switcher: the API key lives in the browser only,
 * never sent anywhere except as part of an /api/ask request the user
 * themselves triggers. Nothing here persists to any server. */

const STORAGE_KEY = "polanyi.providerOverride";

export type ProviderOverride = {
  model: string;
  apiKey: string;
  baseUrl?: string;
};

export function loadProviderOverride(): ProviderOverride | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { model?: unknown }).model === "string" &&
      typeof (parsed as { apiKey?: unknown }).apiKey === "string"
    ) {
      const { model, apiKey, baseUrl } = parsed as ProviderOverride;
      return baseUrl === undefined ? { model, apiKey } : { model, apiKey, baseUrl };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveProviderOverride(override: ProviderOverride): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(override));
}

export function clearProviderOverride(): void {
  localStorage.removeItem(STORAGE_KEY);
}
