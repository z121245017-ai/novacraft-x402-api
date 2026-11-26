import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createApp } from "../src/server.js";
import { analyzeSolidity } from "../src/analyzers/solidity.js";
import { scoreTokenMetrics } from "../src/analyzers/token.js";
import { buildStoryboardPlan } from "../src/analyzers/storyboard.js";

const PAY_TO = "0x445F7447532d3e9300194E289C7C023A5f3CFc9E";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function startTestServer() {
  const { app } = createApp({
    config: {
      port: 0,
      payTo: PAY_TO,
      network: "eip155:8453",
      facilitatorUrl: "https://facilitator.payai.network",
      geminiApiKey: "",
    },
    syncFacilitatorOnStart: true,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { server, baseUrl };
}

test("1. Free discovery routes (/health, /.well-known/x402.json, /) return 200 with wallet and 3 routes", async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const [healthRes, wellKnownRes, htmlRes] = await Promise.all([
      fetch(`${baseUrl}/health`),
      fetch(`${baseUrl}/.well-known/x402.json`),
      fetch(`${baseUrl}/`),
    ]);

    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.equal(health.payTo, PAY_TO);
    assert.equal(health.network, "eip155:8453");
    assert.equal(health.geminiConfigured, false);
    assert.equal(health.geminiMode, "deterministic_only");
    assert.equal(health.endpoints.length, 3);

    const { app: vertexApp } = createApp({
      config: {
        port: 0,
        payTo: PAY_TO,
        network: "eip155:8453",
        useVertexAi: true,
        vertexProjectId: "test-proj",
      },
      syncFacilitatorOnStart: false,
    });
    const vertexSrv = http.createServer(vertexApp);
    await new Promise((resolve) => vertexSrv.listen(0, "127.0.0.1", resolve));
    try {
      const vh = await fetch(`http://127.0.0.1:${vertexSrv.address().port}/health`).then((r) => r.json());
      assert.equal(vh.geminiConfigured, true);
      assert.equal(vh.geminiMode, "vertexai");
    } finally {
      await new Promise((resolve) => vertexSrv.close(resolve));
    }

    assert.equal(wellKnownRes.status, 200);
    const manifest = await wellKnownRes.json();
    assert.equal(manifest.x402Version, 2);
    assert.equal(manifest.payTo, PAY_TO);
    assert.equal(manifest.resources.length, 3);
    assert.ok(manifest.resources[0].url.startsWith(baseUrl));

    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.match(html, /NovaCraft x402 API/);
    assert.match(html, new RegExp(PAY_TO));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("2. Paid endpoints return live HTTP 402 with valid Base USDC payment-required headers via PayAI", async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const expectations = [
      { path: "/api/v1/solidity-triage", amount: "50000", body: { sourceCode: "contract A { uint x; }" } },
      { path: "/api/v1/token-risk-brief", amount: "20000", body: { chain: "base", address: BASE_USDC } },
      { path: "/api/v1/video-storyboard", amount: "30000", body: { productName: "Test", tagline: "Hello world" } },
    ];

    for (const item of expectations) {
      const res = await fetch(`${baseUrl}${item.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      assert.equal(res.status, 402, `${item.path} should challenge with 402`);

      const header = res.headers.get("payment-required");
      assert.ok(header, `${item.path} missing payment-required header`);
      const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));

      assert.equal(decoded.x402Version, 2);
      assert.ok(Array.isArray(decoded.accepts) && decoded.accepts.length >= 1);
      const opt = decoded.accepts[0];
      assert.equal(opt.scheme, "exact");
      assert.equal(opt.network, "eip155:8453");
      assert.equal(opt.payTo, PAY_TO);
      assert.equal(opt.asset.toLowerCase(), BASE_USDC.toLowerCase());
      assert.equal(opt.amount, item.amount);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("3. analyzeSolidity detects critical/high patterns and scores clean contract low", () => {
  const vulnerable = `
pragma solidity ^0.8.20;
contract BadVault {
  mapping(address => uint256) public balances;
  function withdraw(address target, bytes calldata data) external {
    require(tx.origin == msg.sender, "auth");
    target.call{value: balances[msg.sender]}("");
    balances[msg.sender] = 0;
    target.delegatecall(data);
    (, int256 price, , , ) = priceFeed.latestRoundData();
  }
}`;
  const bad = analyzeSolidity(vulnerable, "BadVault");
  const ids = new Set(bad.findings.map((f) => f.id));
  assert.ok(ids.has("SOL-TX-ORIGIN"));
  assert.ok(ids.has("SOL-REENTRANCY"));
  assert.ok(ids.has("SOL-UNCHECKED-CALL"));
  assert.ok(ids.has("SOL-DELEGATECALL"));
  assert.ok(ids.has("SOL-STALE-ORACLE"));
  assert.equal(bad.riskTier, "CRITICAL");
  assert.ok(bad.riskScore >= 80);

  const safe = `
pragma solidity ^0.8.20;
contract SafeCounter {
  uint256 public count;
  function inc() external {
    count += 1;
  }
}`;
  const clean = analyzeSolidity(safe, "SafeCounter");
  assert.equal(clean.findingCount, 0);
  assert.equal(clean.riskTier, "LOW");
  assert.equal(clean.riskScore, 0);
});

test("4. scoreTokenMetrics separates honeypot/low-liq from healthy blue-chip metrics", () => {
  const risky = scoreTokenMetrics(
    [
      {
        chainId: "base",
        dexId: "uniswap",
        liquidity: { usd: 2500 },
        fdv: 5000000,
        volume: { h24: 1000 },
        baseToken: { symbol: "SCAM", name: "Scam Coin" },
      },
    ],
    {
      is_honeypot: "1",
      buy_tax: "0.05",
      sell_tax: "0.35",
      owner_change_balance: "1",
    },
    { chain: "base", address: "0x1111111111111111111111111111111111111111" }
  );
  assert.equal(risky.verdict, "AVOID");
  assert.equal(risky.riskScore, 100);
  assert.ok(risky.flags.some((f) => f.code === "HONEYPOT_DETECTED"));

  const healthy = scoreTokenMetrics(
    [
      {
        chainId: "base",
        dexId: "aerodrome",
        liquidity: { usd: 15000000 },
        fdv: 200000000,
        volume: { h24: 50000000 },
        priceUsd: "1.00",
        baseToken: { symbol: "USDC", name: "USD Coin" },
      },
    ],
    {
      is_honeypot: "0",
      buy_tax: "0",
      sell_tax: "0",
      is_open_source: "1",
    },
    { chain: "base", address: BASE_USDC }
  );
  assert.equal(healthy.verdict, "LOWER_RISK");
  assert.equal(healthy.riskScore, 0);
});

test("5. buildStoryboardPlan produces 4 structured scenes and Flow Music score", () => {
  const plan = buildStoryboardPlan({
    productName: "VeilFactor",
    tagline: "Zero-knowledge invoice double-pledge prevention on Midnight",
    features: ["Halo2 ZK nullifier", "Selective auditor disclosure", "Concentration covenant checks"],
    durationSeconds: 32,
  });
  assert.equal(plan.productName, "VeilFactor");
  assert.equal(plan.scenes.length, 4);
  assert.equal(plan.totalDurationSeconds, 32);
  assert.ok(plan.flowMusicPrompt.length > 20);
  assert.match(plan.scenes[1].visualPrompt, /Halo2 ZK nullifier/);
});
