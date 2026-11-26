export function loadConfig(overrides = {}) {
  const port = Number(overrides.port ?? process.env.PORT ?? 8080);
  return {
    port: Number.isFinite(port) && port >= 0 ? port : 8080,
    payTo: overrides.payTo ?? process.env.X402_PAY_TO ?? "0x445F7447532d3e9300194E289C7C023A5f3CFc9E",
    network: overrides.network ?? process.env.X402_NETWORK ?? "eip155:8453",
    facilitatorUrl:
      overrides.facilitatorUrl ?? process.env.X402_FACILITATOR_URL ?? "https://facilitator.payai.network",
    geminiApiKey: overrides.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "",
    geminiModel: overrides.geminiModel ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    serviceBaseUrl: overrides.serviceBaseUrl ?? process.env.SERVICE_BASE_URL ?? "",
  };
}
