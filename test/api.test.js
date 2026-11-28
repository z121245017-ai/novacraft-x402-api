import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createApp } from "../src/server.js";
import { analyzeSolidity } from "../src/analyzers/solidity.js";
import { scoreTokenMetrics } from "../src/analyzers/token.js";
import { buildStoryboardPlan } from "../src/analyzers/storyboard.js";

const PAY_TO = "0x445F7447532d3e9300194E289C7C023A5f3CFc9E";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CELO_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const CELO_FACILITATOR_URL = "https://api.x402.celo.org";

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
    const [healthRes, wellKnownRes, wellKnownBareRes, htmlRes] = await Promise.all([
      fetch(`${baseUrl}/health`),
      fetch(`${baseUrl}/.well-known/x402.json`),
      fetch(`${baseUrl}/.well-known/x402`),
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
    assert.equal(wellKnownBareRes.status, 200);
    const manifest = await wellKnownRes.json();
    const manifestBare = await wellKnownBareRes.json();
    assert.deepEqual(manifestBare, manifest);
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
      const bodySchema = decoded.extensions?.bazaar?.schema?.properties?.input?.properties?.body || {};
      const schemaStr = JSON.stringify(bodySchema);
      assert.ok(!schemaStr.includes('"minLength"'), "Bazaar body schema must omit minLength");
      assert.ok(!schemaStr.includes('"required"'), "Bazaar body schema must omit required arrays");
      assert.ok(!schemaStr.includes('"default"'), "Bazaar body schema must omit default values");
    }

    const proxiedRes = await fetch(`${baseUrl}/api/v1/solidity-triage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "novacraft-x402-api.example.run.app",
      },
      body: JSON.stringify({ sourceCode: "contract A {}" }),
    });
    assert.equal(proxiedRes.status, 402);
    const proxiedHeader = JSON.parse(Buffer.from(proxiedRes.headers.get("payment-required"), "base64").toString("utf8"));
    assert.ok(
      proxiedHeader.resource?.url?.startsWith("https://"),
      `Expected https:// resource URL behind reverse proxy, got ${proxiedHeader.resource?.url}`
    );
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

test("6. Streamable HTTP /mcp supports initialize, tools/list, unpaid 402 challenge, and rejects invalid x402 payment", async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const mcpUrl = `${baseUrl}/mcp`;
    const commonHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Protocol-Version": "2025-06-18",
    };

    // 1. initialize
    const initRes = await fetch(mcpUrl, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "paidmcp-directory-checker", version: "1.0.0" },
        },
      }),
    });
    assert.equal(initRes.status, 200);
    const sessionId = initRes.headers.get("mcp-session-id");
    assert.ok(sessionId);
    const initBody = await initRes.json();
    assert.equal(initBody.result.protocolVersion, "2025-06-18");

    // 2. notifications/initialized
    const notifRes = await fetch(mcpUrl, {
      method: "POST",
      headers: { ...commonHeaders, "Mcp-Session-Id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    assert.equal(notifRes.status, 202);

    // 3. tools/list
    const listRes = await fetch(mcpUrl, {
      method: "POST",
      headers: { ...commonHeaders, "Mcp-Session-Id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    const toolNames = listBody.result.tools.map((t) => t.name);
    assert.deepEqual(toolNames, ["solidity_triage", "token_risk_brief", "video_storyboard"]);

    // 4. unpaid tools/call must return HTTP 402 with PAYMENT-REQUIRED header
    const toolCall = {
      name: "token_risk_brief",
      arguments: { chain: "base", address: BASE_USDC },
    };
    const unpaidRes = await fetch(mcpUrl, {
      method: "POST",
      headers: { ...commonHeaders, "Mcp-Session-Id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: toolCall }),
    });
    assert.equal(unpaidRes.status, 402);
    const unpaidHeader = unpaidRes.headers.get("payment-required");
    assert.ok(unpaidHeader);
    const unpaidChallenge = JSON.parse(Buffer.from(unpaidHeader, "base64").toString("utf8"));
    assert.equal(unpaidChallenge.x402Version, 2);
    assert.equal(unpaidChallenge.accepts[0].amount, "20000");
    assert.equal(unpaidChallenge.accepts[0].payTo, PAY_TO);

    // 5. invalid (all-zero) PAYMENT-SIGNATURE must produce a distinguishable x402 rejection
    const accepted = unpaidChallenge.accepts[0];
    const now = Math.floor(Date.now() / 1000);
    const bogusPayment = {
      x402Version: 2,
      resource: unpaidChallenge.resource,
      accepted,
      payload: {
        signature: `0x${"00".repeat(65)}`,
        authorization: {
          from: "0x000000000000000000000000000000000000dEaD",
          to: accepted.payTo,
          value: String(accepted.amount),
          validAfter: String(now - 60),
          validBefore: String(now + 120),
          nonce: "0x" + "11".repeat(32),
        },
      },
      ...(unpaidChallenge.extensions ? { extensions: unpaidChallenge.extensions } : {}),
    };
    const encodedBogus = Buffer.from(JSON.stringify(bogusPayment)).toString("base64");
    const badPayRes = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Mcp-Session-Id": sessionId,
        "PAYMENT-SIGNATURE": encodedBogus,
        "X-PAYMENT": encodedBogus,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: toolCall }),
    });
    assert.equal(badPayRes.status, 402);
    const badHeader = badPayRes.headers.get("payment-required");
    assert.ok(badHeader);
    const badChallenge = JSON.parse(Buffer.from(badHeader, "base64").toString("utf8"));
    assert.ok(badChallenge.error, "Invalid payment must include error reason in PaymentRequired");
    assert.notEqual(badChallenge.error, unpaidChallenge.error);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("7. Dual-network discovery (/.well-known/x402) and live 402 accepts[] advertise Base + Celo USDC and reject invalid Celo X-PAYMENT via api.x402.celo.org", async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const [wellKnownRes, wellKnownJsonRes, healthRes] = await Promise.all([
      fetch(`${baseUrl}/.well-known/x402`),
      fetch(`${baseUrl}/.well-known/x402.json`),
      fetch(`${baseUrl}/health`),
    ]);
    assert.equal(wellKnownRes.status, 200);
    assert.equal(wellKnownJsonRes.status, 200);
    const manifest = await wellKnownRes.json();
    const manifestJson = await wellKnownJsonRes.json();
    const health = await healthRes.json();

    assert.deepEqual(manifest, manifestJson);
    assert.deepEqual(manifest.networks, ["eip155:8453", "eip155:42220"]);
    assert.deepEqual(health.networks, ["eip155:8453", "eip155:42220"]);
    assert.equal(manifest.facilitators["eip155:8453"], "https://facilitator.payai.network");
    assert.equal(manifest.facilitators["eip155:42220"], CELO_FACILITATOR_URL);

    const celoNet = manifest.supportedNetworks.find((n) => n.network === "eip155:42220");
    assert.ok(celoNet, "supportedNetworks must advertise eip155:42220");
    assert.equal(celoNet.asset, CELO_USDC);
    assert.equal(celoNet.symbol, "USDC");
    assert.equal(celoNet.decimals, 6);
    assert.equal(celoNet.assetTransferMethod, "eip3009");
    assert.equal(celoNet.payTo, PAY_TO);
    assert.equal(celoNet.facilitator, CELO_FACILITATOR_URL);

    for (const resource of manifest.resources) {
      assert.deepEqual(resource.networks, ["eip155:8453", "eip155:42220"]);
      assert.equal(resource.accepts.length, 2);
      assert.equal(resource.accepts[0].network, "eip155:8453");
      assert.equal(resource.accepts[0].asset, BASE_USDC);
      assert.equal(resource.accepts[1].network, "eip155:42220");
      assert.equal(resource.accepts[1].asset, CELO_USDC);
      assert.equal(resource.accepts[1].payTo, PAY_TO);
    }

    // Check REST 402 dual accepts[] + live Celo facilitator fail-closed rejection via X-PAYMENT only
    const gateRes = await fetch(`${baseUrl}/api/v1/token-risk-brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "celo", address: CELO_USDC }),
    });
    assert.equal(gateRes.status, 402);
    const challenge = JSON.parse(
      Buffer.from(gateRes.headers.get("payment-required"), "base64").toString("utf8")
    );
    assert.equal(challenge.accepts.length, 2);
    const baseAccept = challenge.accepts.find((a) => a.network === "eip155:8453");
    const celoAccept = challenge.accepts.find((a) => a.network === "eip155:42220");
    assert.ok(baseAccept && celoAccept, "402 challenge must include both Base and Celo accepts");
    assert.equal(celoAccept.scheme, "exact");
    assert.equal(celoAccept.amount, "20000");
    assert.equal(celoAccept.asset.toLowerCase(), CELO_USDC.toLowerCase());
    assert.equal(celoAccept.payTo, PAY_TO);
    assert.equal(celoAccept.extra?.name, "USDC");
    assert.equal(celoAccept.extra?.version, "2");

    const now = Math.floor(Date.now() / 1000);
    const bogusCeloPayment = {
      x402Version: 2,
      resource: challenge.resource,
      accepted: celoAccept,
      payload: {
        signature: `0x${"00".repeat(65)}`,
        authorization: {
          from: "0x000000000000000000000000000000000000dEaD",
          to: celoAccept.payTo,
          value: String(celoAccept.amount),
          validAfter: String(now - 60),
          validBefore: String(now + 120),
          nonce: "0x" + "22".repeat(32),
        },
      },
    };
    const encodedCeloBogus = Buffer.from(JSON.stringify(bogusCeloPayment)).toString("base64");
    const badCeloRes = await fetch(`${baseUrl}/api/v1/token-risk-brief`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": encodedCeloBogus,
      },
      body: JSON.stringify({ chain: "celo", address: CELO_USDC }),
    });
    assert.equal(badCeloRes.status, 402);
    const badCeloChallenge = JSON.parse(
      Buffer.from(badCeloRes.headers.get("payment-required"), "base64").toString("utf8")
    );
    assert.ok(badCeloChallenge.error, "Invalid Celo X-PAYMENT must include facilitator rejection reason");
    assert.notEqual(badCeloChallenge.error, "Payment required");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("8. Facilitator routing sends eip155:42220 to Celo facilitator, eip155:8453 to Base facilitator, and fails closed on invalid payments", async () => {
  const calls = {
    baseVerify: 0,
    baseSettle: 0,
    celoVerify: 0,
    celoSettle: 0,
    externalFetch: 0,
  };

  const mockBaseFacilitator = {
    async getSupported() {
      return {
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }],
        extensions: [],
        signers: {},
      };
    },
    async verify(paymentPayload) {
      calls.baseVerify += 1;
      if (paymentPayload.payload?.signature === "0xbad") {
        return { isValid: false, invalidReason: "invalid_exact_evm_payload_signature" };
      }
      return { isValid: true, payer: "0x1111111111111111111111111111111111111111" };
    },
    async settle(_paymentPayload, requirements) {
      calls.baseSettle += 1;
      return {
        success: true,
        transaction: "0x" + "aa".repeat(32),
        network: requirements.network,
        payer: "0x1111111111111111111111111111111111111111",
      };
    },
  };

  const mockCeloFacilitator = {
    async getSupported() {
      return {
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: "eip155:42220",
            extra: {
              defaultAsset: {
                asset: CELO_USDC,
                symbol: "USDC",
                decimals: 6,
                name: "USDC",
                version: "2",
                assetTransferMethod: "eip3009",
              },
            },
          },
        ],
        extensions: ["eip2612GasSponsoring", "payment-identifier"],
        signers: { "eip155:42220": ["0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48"] },
      };
    },
    async verify(paymentPayload) {
      calls.celoVerify += 1;
      if (paymentPayload.payload?.signature === "0xbad") {
        return { isValid: false, invalidReason: "invalid_exact_evm_payload_signature" };
      }
      return { isValid: true, payer: "0x2222222222222222222222222222222222222222" };
    },
    async settle(_paymentPayload, requirements) {
      calls.celoSettle += 1;
      return {
        success: true,
        transaction: "0x" + "cc".repeat(32),
        network: requirements.network,
        payer: "0x2222222222222222222222222222222222222222",
      };
    },
  };

  const mockFetch = async (url) => {
    calls.externalFetch += 1;
    if (String(url).includes("dexscreener")) {
      return {
        ok: true,
        async json() {
          return {
            pairs: [
              {
                chainId: "celo",
                dexId: "uniswap",
                pairAddress: "0x3333333333333333333333333333333333333333",
                priceUsd: "1.00",
                liquidity: { usd: 2500000 },
                fdv: 15000000,
                volume: { h24: 900000 },
                baseToken: { symbol: "USDC", name: "USDC" },
              },
            ],
          };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { code: 1, result: {} };
      },
    };
  };

  const { app } = createApp({
    config: { port: 0, payTo: PAY_TO, geminiApiKey: "" },
    facilitatorClients: [mockBaseFacilitator, mockCeloFacilitator],
    fetchImpl: mockFetch,
    syncFacilitatorOnStart: true,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Unpaid 402 challenge to obtain exact Base & Celo requirements
    const unpaidRes = await fetch(`${baseUrl}/api/v1/token-risk-brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "celo", address: CELO_USDC }),
    });
    assert.equal(unpaidRes.status, 402);
    const challenge = JSON.parse(
      Buffer.from(unpaidRes.headers.get("payment-required"), "base64").toString("utf8")
    );
    const baseReq = challenge.accepts.find((a) => a.network === "eip155:8453");
    const celoReq = challenge.accepts.find((a) => a.network === "eip155:42220");
    assert.ok(baseReq && celoReq);

    // 2. Fail-closed: invalid Celo signature via X-PAYMENT must reject with 402 and NOT run handler/settle
    const invalidCeloHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        resource: challenge.resource,
        accepted: celoReq,
        payload: { signature: "0xbad", authorization: {} },
      })
    ).toString("base64");
    const invalidRes = await fetch(`${baseUrl}/api/v1/token-risk-brief`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": invalidCeloHeader,
      },
      body: JSON.stringify({ chain: "celo", address: CELO_USDC }),
    });
    assert.equal(invalidRes.status, 402);
    assert.equal(calls.celoVerify, 1);
    assert.equal(calls.celoSettle, 0);
    assert.equal(calls.baseVerify, 0);
    assert.equal(calls.externalFetch, 0, "Handler must not execute when Celo verification fails");

    // 3. Fail-closed: tampered payTo / unsupported network must reject with 402 before facilitator verify
    const tamperedHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        resource: challenge.resource,
        accepted: { ...celoReq, payTo: "0x000000000000000000000000000000000000dEaD" },
        payload: { signature: "0xok", authorization: {} },
      })
    ).toString("base64");
    const tamperedRes = await fetch(`${baseUrl}/api/v1/token-risk-brief`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": tamperedHeader,
      },
      body: JSON.stringify({ chain: "celo", address: CELO_USDC }),
    });
    assert.equal(tamperedRes.status, 402);
    const tamperedChallenge = JSON.parse(
      Buffer.from(tamperedRes.headers.get("payment-required"), "base64").toString("utf8")
    );
    assert.equal(tamperedChallenge.error, "No matching payment requirements");
    assert.equal(calls.celoVerify, 1);
    assert.equal(calls.celoSettle, 0);

    // 3b. Fail-closed: malformed non-base64 and empty JSON payment headers must reject with 402
    for (const badRaw of ["!!!not-base64!!!", Buffer.from("{}").toString("base64")]) {
      const malformedRes = await fetch(`${baseUrl}/api/v1/token-risk-brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": badRaw,
        },
        body: JSON.stringify({ chain: "celo", address: CELO_USDC }),
      });
      assert.equal(malformedRes.status, 402);
    }
    assert.equal(calls.externalFetch, 0);

    // 4. Valid Celo payment via X-PAYMENT routes ONLY to Celo facilitator and settles cleanly
    const validCeloHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        resource: challenge.resource,
        accepted: celoReq,
        payload: { signature: "0xok", authorization: {} },
      })
    ).toString("base64");
    const paidCeloRes = await fetch(`${baseUrl}/api/v1/token-risk-brief`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": validCeloHeader,
      },
      body: JSON.stringify({ chain: "celo", address: CELO_USDC }),
    });
    assert.equal(paidCeloRes.status, 200);
    const paidCeloBody = await paidCeloRes.json();
    assert.equal(paidCeloBody.ok, true);
    assert.equal(paidCeloBody.analysis.chain, "celo");
    assert.equal(calls.celoVerify, 2);
    assert.equal(calls.celoSettle, 1);
    assert.equal(calls.baseVerify, 0);
    assert.equal(calls.baseSettle, 0);
    const celoReceipt = JSON.parse(
      Buffer.from(paidCeloRes.headers.get("payment-response"), "base64").toString("utf8")
    );
    assert.equal(celoReceipt.network, "eip155:42220");
    assert.equal(celoReceipt.success, true);

    // 5. Valid Base payment via PAYMENT-SIGNATURE routes ONLY to Base facilitator (100% backward compatible)
    const validBaseHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        resource: challenge.resource,
        accepted: baseReq,
        payload: { signature: "0xok", authorization: {} },
      })
    ).toString("base64");
    const paidBaseRes = await fetch(`${baseUrl}/api/v1/token-risk-brief`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": validBaseHeader,
      },
      body: JSON.stringify({ chain: "base", address: BASE_USDC }),
    });
    assert.equal(paidBaseRes.status, 200);
    assert.equal(calls.baseVerify, 1);
    assert.equal(calls.baseSettle, 1);
    assert.equal(calls.celoVerify, 2);
    assert.equal(calls.celoSettle, 1);

    // 6. Streamable HTTP /mcp tools/call with Celo PAYMENT-SIGNATURE routes to Celo facilitator
    const mcpUnpaidRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 77,
        method: "tools/call",
        params: { name: "solidity_triage", arguments: { sourceCode: "pragma solidity ^0.8.20; contract Ok { uint256 public a; }" } },
      }),
    });
    assert.equal(mcpUnpaidRes.status, 402);
    const mcpChallenge = JSON.parse(
      Buffer.from(mcpUnpaidRes.headers.get("payment-required"), "base64").toString("utf8")
    );
    const mcpCeloReq = mcpChallenge.accepts.find((a) => a.network === "eip155:42220");
    assert.ok(mcpCeloReq);
    assert.equal(mcpCeloReq.amount, "50000");

    const mcpCeloHeader = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        resource: mcpChallenge.resource,
        accepted: mcpCeloReq,
        payload: { signature: "0xok", authorization: {} },
      })
    ).toString("base64");
    const mcpPaidRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": mcpCeloHeader,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 78,
        method: "tools/call",
        params: { name: "solidity_triage", arguments: { sourceCode: "pragma solidity ^0.8.20; contract Ok { uint256 public a; }" } },
      }),
    });
    assert.equal(mcpPaidRes.status, 200);
    assert.equal(calls.celoVerify, 3);
    assert.equal(calls.celoSettle, 2);
    assert.equal(calls.baseVerify, 1);
    assert.equal(calls.baseSettle, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
