export const BASE_MAINNET_CAIP2 = "eip155:8453";
export const CELO_MAINNET_CAIP2 = "eip155:42220";
export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const CELO_USDC_ADDRESS = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
export const DEFAULT_PAY_TO = "0x445F7447532d3e9300194E289C7C023A5f3CFc9E";
export const DEFAULT_BASE_FACILITATOR_URL = "https://facilitator.payai.network";
export const DEFAULT_CELO_FACILITATOR_URL = "https://api.x402.celo.org";

export function loadConfig(overrides = {}) {
  const port = Number(overrides.port ?? process.env.PORT ?? 8080);
  const vertexProjectId =
    overrides.vertexProjectId ??
    process.env.VERTEX_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    "";
  const network = overrides.network ?? process.env.X402_NETWORK ?? BASE_MAINNET_CAIP2;
  const celoNetwork =
    overrides.celoNetwork ?? process.env.X402_CELO_NETWORK ?? CELO_MAINNET_CAIP2;
  const enableCelo =
    overrides.enableCelo ?? (process.env.X402_ENABLE_CELO !== "false");
  const envNetworks = process.env.X402_NETWORKS
    ? process.env.X402_NETWORKS.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const networks = Array.from(
    new Set(
      overrides.networks ??
        envNetworks ?? [network, ...(enableCelo && celoNetwork ? [celoNetwork] : [])]
    )
  );

  return {
    port: Number.isFinite(port) && port >= 0 ? port : 8080,
    payTo: overrides.payTo ?? process.env.X402_PAY_TO ?? DEFAULT_PAY_TO,
    network,
    celoNetwork,
    enableCelo,
    networks,
    facilitatorUrl:
      overrides.facilitatorUrl ??
      process.env.X402_FACILITATOR_URL ??
      DEFAULT_BASE_FACILITATOR_URL,
    celoFacilitatorUrl:
      overrides.celoFacilitatorUrl ??
      process.env.X402_CELO_FACILITATOR_URL ??
      DEFAULT_CELO_FACILITATOR_URL,
    geminiApiKey: overrides.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "",
    geminiModel: overrides.geminiModel ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    vertexProjectId,
    vertexLocation: overrides.vertexLocation ?? process.env.VERTEX_LOCATION ?? "us-central1",
    useVertexAi:
      overrides.useVertexAi ??
      (process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" ||
        Boolean(overrides.vertexProjectId ?? process.env.VERTEX_PROJECT_ID)),
    serviceBaseUrl: overrides.serviceBaseUrl ?? process.env.SERVICE_BASE_URL ?? "",
  };
}
