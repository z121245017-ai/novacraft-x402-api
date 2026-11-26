import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";

import { loadConfig } from "./config.js";
import { synthesizeJson } from "./gemini.js";
import { analyzeSolidity } from "./analyzers/solidity.js";
import { analyzeTokenRisk } from "./analyzers/token.js";
import { buildStoryboardPlan } from "./analyzers/storyboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

export function buildRoutesConfig(config) {
  return {
    "POST /api/v1/solidity-triage": {
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
    },
    "POST /api/v1/token-risk-brief": {
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
    },
    "POST /api/v1/video-storyboard": {
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
    },
  };
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
    res.json({
      ok: true,
      service: "novacraft-x402-api",
      network: config.network,
      facilitator: config.facilitatorUrl,
      payTo: config.payTo,
      geminiConfigured: Boolean(config.geminiApiKey),
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

  // x402 payment middleware protecting paid endpoints
  const facilitatorClient =
    options.facilitatorClient || new HTTPFacilitatorClient({ url: config.facilitatorUrl });

  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(config.network, new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension);

  const routes = buildRoutesConfig(config);
  const syncOnStart = options.syncFacilitatorOnStart ?? true;

  app.use(paymentMiddleware(routes, resourceServer, undefined, undefined, syncOnStart));

  // Paid Route 1: Solidity Triage ($0.05 USDC on Base)
  app.post("/api/v1/solidity-triage", async (req, res) => {
    try {
      const { sourceCode, contractName } = req.body || {};
      const staticAnalysis = analyzeSolidity(sourceCode, contractName);

      const fallbackSummary = {
        executiveSummary:
          staticAnalysis.findingCount === 0
            ? `No critical or high patterns matched in ${staticAnalysis.contractName}; perform full manual business-logic and invariant review.`
            : `Detected ${staticAnalysis.findingCount} pattern finding(s) in ${staticAnalysis.contractName} (risk tier: ${staticAnalysis.riskTier}). Prioritize fixing critical/high items first.`,
        priorityOrder: staticAnalysis.findings.slice(0, 5).map((f) => `${f.id} (L${f.line}): ${f.title}`),
      };

      const ai = await synthesizeJson({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
        systemInstruction:
          "You are a senior EVM smart-contract auditor. Return strict JSON with keys executiveSummary (string) and priorityOrder (array of short actionable strings).",
        prompt: `Contract: ${staticAnalysis.contractName}\nStatic findings:\n${JSON.stringify(
          staticAnalysis.findings
        )}\nSource snippet (first 3000 chars):\n${String(sourceCode).slice(0, 3000)}`,
        fallback: fallbackSummary,
      });

      res.json({
        ok: true,
        analysis: staticAnalysis,
        synthesis: ai.data,
        gemini: { enabled: ai.enabled, model: ai.model, note: ai.note },
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err?.message || "Invalid request payload" });
    }
  });

  // Paid Route 2: Token Risk Brief ($0.02 USDC on Base)
  app.post("/api/v1/token-risk-brief", async (req, res) => {
    try {
      const { chain = "base", address } = req.body || {};
      const analysis = await analyzeTokenRisk({
        chain,
        address,
        fetchImpl: options.fetchImpl || fetch,
      });

      const fallbackSummary = {
        brief: `Token ${analysis.token.symbol || analysis.address} on ${analysis.chain} scored ${analysis.riskScore}/100 (${analysis.verdict}) across ${analysis.market.poolCount} pool(s).`,
        watchouts: analysis.flags.map((f) => `[${f.severity.toUpperCase()}] ${f.detail}`),
      };

      const ai = await synthesizeJson({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
        systemInstruction:
          "You are a DeFi quantitative risk analyst. Return strict JSON with keys brief (concise 2-sentence assessment) and watchouts (array of strings). Never invent numbers not present in telemetry.",
        prompt: `Telemetry:\n${JSON.stringify(analysis)}`,
        fallback: fallbackSummary,
      });

      res.json({
        ok: true,
        analysis,
        synthesis: ai.data,
        gemini: { enabled: ai.enabled, model: ai.model, note: ai.note },
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err?.message || "Invalid request payload" });
    }
  });

  // Paid Route 3: Video Storyboard ($0.03 USDC on Base)
  app.post("/api/v1/video-storyboard", async (req, res) => {
    try {
      const plan = buildStoryboardPlan(req.body || {});
      const ai = await synthesizeJson({
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

      res.json({
        ok: true,
        storyboard: {
          ...plan,
          ...ai.data,
        },
        gemini: { enabled: ai.enabled, model: ai.model, note: ai.note },
      });
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
