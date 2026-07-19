import { z } from "zod";

export const providerModelSchema = z.object({
  id: z.string(),
  is_free: z.boolean().nullable(),
});

export type ProviderModel = z.infer<typeof providerModelSchema>;

export type ProviderId = "nvidia" | "opencode";

export const PROVIDER_BASE_URLS: Record<ProviderId, string> = {
  nvidia: "https://integrate.api.nvidia.com/v1",
  opencode: "https://opencode.ai/zen/v1",
};

export async function fetchProviderModels(provider: ProviderId, apiKey?: string): Promise<ProviderModel[]> {
  const query = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : "";
  const response = await fetch(`/api/providers/${provider}/models${query}`);
  if (!response.ok) {
    throw new Error(`Provider models request failed with status ${response.status}`);
  }
  return z.array(providerModelSchema).parse(await response.json());
}
