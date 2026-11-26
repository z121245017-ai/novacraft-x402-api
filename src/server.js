import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import {
  ExpressAdapter,
  paymentMiddleware,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/express";
import {
  FacilitatorResponseError,
  HTTPFacilitatorClient,
  getFacilitatorResponseError,
  prepareHttpServer,
  withPrivateCacheControl,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";

import { loadConfig } from "./config.js";
import { synthesizeJson } from "./gemini.js";
import { analyzeSolidity } from "./analyzers/solidity.js";
import { analyzeTokenRisk } from "./analyzers/token.js";
import { buildStoryboardPlan } from "./analyzers/storyboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

export const MCP_TOOLS = [
  {
    name: "solidity_triage",
    description:
      "Deterministic + Gemini Solidity static security triage ($0.05 Base USDC). Detects reentrancy, tx.origin, delegatecall, stale Chainlink oracle, unchecked calls.",
    inputSchema: {
      type: "object",
      required: ["sourceCode"],
      properties: {
        contractName: { type: "string", default: "VaultSample", examples: ["VaultSample"] },
        sourceCode: {
          type: "string",
          minLength: 10,
          examples: ["pragma solidity ^0.8.20; contract Vault { uint256 public balance; }"],
        },
      },
    },
  },
  {
    name: "token_risk_brief",
    description:
      "Live Base/EVM/Solana token liquidity, honeypot, tax, and concentration risk brief ($0.02 Base USDC) via DexScreener + GoPlus + Gemini.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        chain: { type: "string", default: "base", examples: ["base"] },
        address: {
          type: "string",
          default: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          examples: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
        },
      },
    },
  },
  {
    name: "video_storyboard",
    description:
      "Structured 4-scene Google Flow (Veo 3) / MiniMax-H3 launch video storyboard, visual prompts, and Flow Music score ($0.03 Base USDC).",
    inputSchema: {
      type: "object",
      required: ["productName", "tagline"],
      properties: {
        productName: { type: "string", default: "CrossTape Desk", examples: ["CrossTape Desk"] },
        tagline: {
          type: "string",
          default: "One-person on-chain finance desk",
          examples: ["One-person on-chain finance desk"],
        },
        features: { type: "array", items: { type: "string" } },
        targetAudience: { type: "string" },
        durationSeconds: { type: "number", default: 32 },
        platform: { type: "string" },
      },
    },
  },
];

export function buildRoutesConfig(config) {
  const solidityRoute = {
    accepts: [
      {
        scheme: "exact",
        price: "$0.05",
        network: config.network,
        payTo: config.payTo,
      },
    ],
    description:
      "Deterministic + Gemini Solidity static security triage (reentrancy, tx.origin, delegatecall, stale Chainlink oracle, unchecked calls).",
    mimeType: "application/json",
    serviceName: "NovaCraft Solidity Security Triage",
    tags: ["security", "solidity", "audit", "evm", "gemini"],
    extensions: {
      ...declareDiscoveryExtension({
        bodyType: "json",
        input: {
          contractName: "VaultSample",
          sourceCode: "pragma solidity ^0.8.20; contract Vault { ... }",
        },
        inputSchema: {
          type: "object",
          required: ["sourceCode"],
          properties: {
            contractName: { type: "string" },
            sourceCode: { type: "string", minLength: 10 },
          },
        },
        output: {
          example: {
            ok: true,
            analysis: { riskScore: 80, riskTier: "CRITICAL", findingCount: 3 },
          },
        },
      }),
    },
  };

  const tokenRoute = {
    accepts: [
      {
        scheme: "exact",
        price: "$0.02",
        network: config.network,
        payTo: config.payTo,
      },
    ],
    description:
      "Live Base/EVM/Solana token liquidity, honeypot, tax, and concentration risk brief via DexScreener + GoPlus + Gemini.",
    mimeType: "application/json",
    serviceName: "NovaCraft Token Risk Brief",
    tags: ["defi", "token", "risk", "base", "honeypot"],
    extensions: {
      ...declareDiscoveryExtension({
        bodyType: "json",
        input: {
          chain: "base",
          address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        },
        inputSchema: {
          type: "object",
          required: ["address"],
          properties: {
            chain: { type: "string", default: "base" },
            address: { type: "string" },
          },
        },
        output: {
          example: {
            ok: true,
            analysis: { riskScore: 0, verdict: "LOWER_RISK" },
          },
        },
      }),
    },
  };

  const storyboardRoute = {
    accepts: [
      {
        scheme: "exact",
        price: "$0.03",
        network: config.network,
        payTo: config.payTo,
      },
    ],
    description:
      "Structured 4-scene Google Flow (Veo 3) / MiniMax-H3 launch video storyboard, visual prompts, and Flow Music score.",
    mimeType: "application/json",
    serviceName: "NovaCraft AI Video Storyboard",
    tags: ["video", "veo3", "storyboard", "marketing", "gemini"],
    extensions: {
      ...declareDiscoveryExtension({
        bodyType: "json",
        input: {
          productName: "CrossTape Desk",
          tagline: "One-person on-chain finance desk",
          features: ["Live orderbook basis radar", "4-gate risk guardrails"],
          durationSeconds: 32,
        },
        inputSchema: {
          type: "object",
          required: ["productName", "tagline"],
          properties: {
            productName: { type: "string" },
            tagline: { type: "string" },
            features: { type: "array", items: { type: "string" } },
            targetAudience: { type: "string" },
            durationSeconds: { type: "number" },
            platform: { type: "string" },
          },
        },
        output: {
          example: {
            ok: true,
            storyboard: { totalDurationSeconds: 32, scenes: [] },
          },
        },
      }),
    },
  };

  return {
    "POST /api/v1/solidity-triage": solidityRoute,
    "POST /api/v1/token-risk-brief": tokenRoute,
    "POST /api/v1/video-storyboard": storyboardRoute,
    "POST /mcp/solidity_triage": solidityRoute,
    "POST /mcp/token_risk_brief": tokenRoute,
    "POST /mcp/video_storyboard": storyboardRoute,
  };
}

async function executeSolidityTriage(body, config) {
  const { sourceCode, contractName } = body || {};
  const staticAnalysis = analyzeSolidity(sourceCode, contractName);

  const fallbackSummary = {
    executiveSummary:
      staticAnalysis.findingCount === 0
        ? `No critical or high patterns matched in ${staticAnalysis.contractName}; perform full manual business-logic and invariant review.`
        : `Detected ${staticAnalysis.findingCount} pattern finding(s) in ${staticAnalysis.contractName} (risk tier: ${staticAnalysis.riskTier}). Prioritize fixing critical/high items first.`,
    priorityOrder: staticAnalysis.findings.slice(0, 5).map((f) => `${f.id} (L${f.line}): ${f.title}`),
  };

  const ai = await synthesizeJson({
    useVertexAi: config.useVertexAi,
    vertexProjectId: config.vertexProjectId,
    vertexLocation: config.vertexLocation,
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    systemInstruction:
      "You are a senior EVM smart-contract auditor. Return strict JSON with keys executiveSummary (string) and priorityOrder (array of short actionable strings).",
    prompt: `Contract: ${staticAnalysis.contractName}\nStatic findings:\n${JSON.stringify(
      staticAnalysis.findings
    )}\nSource snippet (first 3000 chars):\n${String(sourceCode).slice(0, 3000)}`,
    fallback: fallbackSummary,
  });

  return {
    ok: true,
    analysis: staticAnalysis,
    synthesis: ai.data,
    gemini: { enabled: ai.enabled, model: ai.model, note: ai.note },
  };
}

async function executeTokenRiskBrief(body, config, fetchImpl) {
  const { chain = "base", address } = body || {};
  const analysis = await analyzeTokenRisk({
    chain,
    address,
    fetchImpl: fetchImpl || fetch,
  });

  const fallbackSummary = {
    brief: `Token ${analysis.token.symbol || analysis.address} on ${analysis.chain} scored ${analysis.riskScore}/100 (${analysis.verdict}) across ${analysis.market.poolCount} pool(s).`,
    watchouts: analysis.flags.map((f) => `[${f.severity.toUpperCase()}] ${f.detail}`),
  };

  const ai = await synthesizeJson({
    useVertexAi: config.useVertexAi,
    vertexProjectId: config.vertexProjectId,
    vertexLocation: config.vertexLocation,
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    systemInstruction:
      "You are a DeFi quantitative risk analyst. Return strict JSON with keys brief (concise 2-sentence assessment) and watchouts (array of strings). Never invent numbers not present in telemetry.",
    prompt: `Telemetry:\n${JSON.stringify(analysis)}`,
    fallback: fallbackSummary,
  });

  return {
    ok: true,
    analysis,
    synthesis: ai.data,
    gemini: { enabled: ai.enabled, model: ai.model, note: ai.note },
  };
}

async function executeVideoStoryboard(body, config) {
  const plan = buildStoryboardPlan(body || {});
  const ai = await synthesizeJson({
    useVertexAi: config.useVertexAi,
    vertexProjectId: config.vertexProjectId,
    vertexLocation: config.vertexLocation,
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    systemInstruction:
      "You are a Web3 product launch creative director. Polish the 4 Veo 3 visual prompts while preserving JSON schema { hookAngle, voiceoverScript, flowMusicPrompt, scenes }.",
    prompt: `Refine this storyboard blueprint:\n${JSON.stringify(plan)}`,
    fallback: {
      hookAngle: `${plan.productName}: ${plan.tagline}`,
      voiceoverScript: plan.scenes.map((s) => s.caption),
      flowMusicPrompt: plan.flowMusicPrompt,
      scenes: plan.scenes,
    },
  });

  return {
    ok: true,
    storyboard: {
      ...plan,
      ...ai.data,
    },
    gemini: { enabled: ai.enabled, model: ai.model, note: ai.note },
  };
}

function sendX402ErrorResponse(res, response) {
  res.status(response.status);
  Object.entries(response.headers || {}).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  const contentType = response.headers?.["Content-Type"] ?? response.headers?.["content-type"] ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  if (response.isHtml || (mediaType === "text/plain" && typeof response.body === "string")) {
    return res.send(response.body ?? "");
  }
  return res.json(response.body ?? {});
}

export function createApp(options = {}) {
  const config = loadConfig(options.config || {});
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  const endpointsCatalog = [
    {
      method: "POST",
      path: "/api/v1/solidity-triage",
      priceUsd: "$0.05",
      network: config.network,
      description: "Solidity vulnerability triage & remediation plan",
    },
    {
      method: "POST",
      path: "/api/v1/token-risk-brief",
      priceUsd: "$0.02",
      network: config.network,
      description: "DEX liquidity + GoPlus honeypot/tax token risk brief",
    },
    {
      method: "POST",
      path: "/api/v1/video-storyboard",
      priceUsd: "$0.03",
      network: config.network,
      description: "4-scene Veo 3 / Flow launch video storyboard & music prompt",
    },
  ];

  // Free public routes BEFORE payment middleware
  app.get("/", (_req, res) => {
    const htmlPath = path.join(PUBLIC_DIR, "index.html");
    if (fs.existsSync(htmlPath)) {
      return res.type("html").send(fs.readFileSync(htmlPath, "utf8"));
    }
    return res.json({ ok: true, service: "novacraft-x402-api", endpoints: endpointsCatalog });
  });

  app.get("/health", (_req, res) => {
    const geminiMode =
      config.useVertexAi && config.vertexProjectId
        ? "vertexai"
        : config.geminiApiKey
        ? "api_key"
        : "deterministic_only";
    res.json({
      ok: true,
      service: "novacraft-x402-api",
      network: config.network,
      facilitator: config.facilitatorUrl,
      payTo: config.payTo,
      geminiConfigured: geminiMode !== "deterministic_only",
      geminiMode,
      endpoints: endpointsCatalog,
    });
  });

  app.get("/.well-known/x402.json", (req, res) => {
    const origin =
      config.serviceBaseUrl ||
      `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;
    res.json({
      x402Version: 2,
      service: "NovaCraft x402 API",
      payTo: config.payTo,
      network: config.network,
      facilitator: config.facilitatorUrl,
      resources: endpointsCatalog.map((ep) => ({
        ...ep,
        url: `${origin}${ep.path}`,
      })),
    });
  });

  // x402 payment middleware protecting paid REST & MCP endpoints
  const facilitatorClient =
    options.facilitatorClient || new HTTPFacilitatorClient({ url: config.facilitatorUrl });

  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(config.network, new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension);

  const routes = buildRoutesConfig(config);
  const syncOnStart = options.syncFacilitatorOnStart ?? true;

  const mcpHttpServer = new x402HTTPResourceServer(resourceServer, routes);
  const { init: initializeMcpHttpServer } = prepareHttpServer(
    mcpHttpServer,
    undefined,
    syncOnStart
  );

  const mcpToolHandlers = {
    solidity_triage: (args) => executeSolidityTriage(args, config),
    token_risk_brief: (args) => executeTokenRiskBrief(args, config, options.fetchImpl),
    video_storyboard: (args) => executeVideoStoryboard(args, config),
  };

  // Streamable HTTP MCP endpoint BEFORE REST paymentMiddleware so initialize/tools/list stay free
  // while tools/call enforces per-tool Base USDC x402 pricing via x402HTTPResourceServer.
  app.post("/mcp", async (req, res) => {
    const rpc = req.body;
    if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
      return res.status(400).json({
        jsonrpc: "2.0",
        id: rpc?.id ?? null,
        error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" },
      });
    }

    const id = rpc.id ?? null;

    if (rpc.method === "initialize") {
      const sessionId = req.header("mcp-session-id") || crypto.randomUUID();
      res.setHeader("mcp-session-id", sessionId);
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "novacraft-x402-api", version: "1.0.0" },
        },
      });
    }

    if (rpc.method === "notifications/initialized" || rpc.method.startsWith("notifications/")) {
      return res.status(202).end();
    }

    if (rpc.method === "ping") {
      return res.json({ jsonrpc: "2.0", id, result: {} });
    }

    if (rpc.method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: { tools: MCP_TOOLS },
      });
    }

    if (rpc.method !== "tools/call") {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${rpc.method}` },
      });
    }

    const toolName = rpc.params?.name;
    const handler = typeof toolName === "string" ? mcpToolHandlers[toolName] : undefined;
    if (!handler) {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Unknown tool: ${String(toolName)}` },
      });
    }

    if (syncOnStart) {
      try {
        await initializeMcpHttpServer();
      } catch (error) {
        const facilitatorError = getFacilitatorResponseError(error);
        if (facilitatorError) {
          return res.status(502).json({ error: facilitatorError.message });
        }
        return res.status(500).json({ error: "Internal Server Error" });
      }
    }

    const adapter = new ExpressAdapter(req);
    const virtualPath = `/mcp/${toolName}`;
    const paymentHeader = adapter.getHeader("payment-signature") || adapter.getHeader("x-payment");
    const context = {
      adapter,
      path: virtualPath,
      decodedPath: virtualPath,
      method: "POST",
      paymentHeader,
    };

    let gateResult;
    try {
      gateResult = await mcpHttpServer.processHTTPRequest(context);
    } catch (error) {
      if (error instanceof FacilitatorResponseError) {
        return res.status(502).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (gateResult.type === "payment-error") {
      return sendX402ErrorResponse(res, gateResult.response);
    }

    if (gateResult.type !== "payment-verified") {
      return res.status(500).json({ error: "Unexpected x402 gate state" });
    }

    const {
      cancellationDispatcher,
      beforeHandlerSettlement,
      paymentPayload,
      paymentRequirements,
      declaredExtensions,
    } = gateResult;

    let toolOutput;
    try {
      toolOutput = await handler(rpc.params?.arguments || {});
    } catch (err) {
      const cancelSettlement = await cancellationDispatcher.cancel({
        reason: "handler_failed",
        responseStatus: 400,
      });
      const failureHeaders = mcpHttpServer.createFailurePathSettlementHeaders(
        cancelSettlement,
        beforeHandlerSettlement,
        paymentPayload,
        null
      );
      if (failureHeaders) {
        Object.entries(failureHeaders).forEach(([key, value]) => {
          res.setHeader(key, String(value));
        });
      }
      return res.status(400).json({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: err?.message || "Invalid tool arguments" },
      });
    }

    const rpcBody = {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(toolOutput) }],
        structuredContent: toolOutput,
      },
    };
    const responseBuffer = Buffer.from(JSON.stringify(rpcBody), "utf8");
    const settleResult = await mcpHttpServer.processSettlement(
      paymentPayload,
      paymentRequirements,
      declaredExtensions,
      {
        request: context,
        responseBody: responseBuffer,
        responseHeaders: { "Content-Type": "application/json" },
      },
      undefined,
      beforeHandlerSettlement
    );

    if (!settleResult.success) {
      return sendX402ErrorResponse(res, settleResult.response);
    }

    Object.entries(settleResult.headers || {}).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.setHeader("Cache-Control", withPrivateCacheControl(null));
    return res.status(200).json(rpcBody);
  });

  app.delete("/mcp", (_req, res) => {
    res.status(204).end();
  });

  app.get("/mcp", (_req, res) => {
    res
      .status(405)
      .set("Allow", "POST, DELETE")
      .json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "Use POST /mcp for Streamable HTTP MCP requests" },
      });
  });

  app.use(paymentMiddleware(routes, resourceServer, undefined, undefined, syncOnStart));

  // Paid Route 1: Solidity Triage ($0.05 USDC on Base)
  app.post("/api/v1/solidity-triage", async (req, res) => {
    try {
      res.json(await executeSolidityTriage(req.body, config));
    } catch (err) {
      res.status(400).json({ ok: false, error: err?.message || "Invalid request payload" });
    }
  });

  // Paid Route 2: Token Risk Brief ($0.02 USDC on Base)
  app.post("/api/v1/token-risk-brief", async (req, res) => {
    try {
      res.json(await executeTokenRiskBrief(req.body, config, options.fetchImpl));
    } catch (err) {
      res.status(400).json({ ok: false, error: err?.message || "Invalid request payload" });
    }
  });

  // Paid Route 3: Video Storyboard ($0.03 USDC on Base)
  app.post("/api/v1/video-storyboard", async (req, res) => {
    try {
      res.json(await executeVideoStoryboard(req.body, config));
    } catch (err) {
      res.status(400).json({ ok: false, error: err?.message || "Invalid request payload" });
    }
  });

  return { app, config, resourceServer };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { app, config } = createApp();
  app.listen(config.port, () => {
    console.log(
      `novacraft-x402-api listening on :${config.port} | network=${config.network} | payTo=${config.payTo} | facilitator=${config.facilitatorUrl} | gemini=${Boolean(
        config.geminiApiKey
      )}`
    );
  });
}
