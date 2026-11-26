export function loadConfig(overrides = {}) {
  const port = Number(overrides.port ?? process.env.PORT ?? 8080);
  const vertexProjectId =
    overrides.vertexProjectId ??
    process.env.VERTEX_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    "";
  return {
    port: Number.isFinite(port) && port >= 0 ? port : 8080,
    payTo: overrides.payTo ?? process.env.X402_PAY_TO ?? "0x445F7447532d3e9300194E289C7C023A5f3CFc9E",
    network: overrides.network ?? process.env.X402_NETWORK ?? "eip155:8453",
    facilitatorUrl:
      overrides.facilitatorUrl ?? process.env.X402_FACILITATOR_URL ?? "https://facilitator.payai.network",
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
