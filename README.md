# NovaCraft x402 API & Streamable HTTP MCP Server (Base + Celo Mainnet USDC • Vertex AI Gemini)

[![NovaCraft x402 API MCP connector](https://glama.ai/mcp/connectors/app.run.us-central1.novacraft-x402-api-981337528602/nova-craft-x402-api/badges/score.svg)](https://glama.ai/mcp/connectors/app.run.us-central1.novacraft-x402-api-981337528602/nova-craft-x402-api)

Pay-per-call AI security, token risk, and launch storyboard server over **Streamable HTTP MCP** and **REST** using **x402 v2** on **Base Mainnet (`eip155:8453`)** and **Celo Mainnet (`eip155:42220`)** USDC — no API keys, no subscriptions, no KYC. Payments settle directly to `0x445F7447532d3e9300194E289C7C023A5f3CFc9E` via **PayAI Facilitator** (`https://facilitator.payai.network`) for Base and the **Official Celo x402 Facilitator** (`https://api.x402.celo.org`) for Celo, with **Bazaar** discovery metadata.

基于 **Base Mainnet (`eip155:8453`)** 与 **Celo Mainnet (`eip155:42220`) USDC** 的双链按次付费 AI Agent 服务，同时提供 **Streamable HTTP MCP (`/mcp`)** 与 **REST API**：无需 API Key、无需订阅、免 KYC，直收钱包 `0x445F7447532d3e9300194E289C7C023A5f3CFc9E`，自动按 `PAYMENT-SIGNATURE` / `X-PAYMENT` 所选网络路由至 **PayAI Facilitator**（Base）或 **Celo 官方 x402 Facilitator**（`https://api.x402.celo.org`）。

---

## 1. Live Endpoints / 线上服务端点

- **Live Streamable HTTP MCP Endpoint (`/mcp`)**:
  `https://novacraft-x402-api-981337528602.us-central1.run.app/mcp`
  - Protocol: JSON-RPC 2.0 over Streamable HTTP (`POST /mcp`, MCP `2025-06-18`)
  - Free discovery methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`
  - Paid execution: `tools/call` enforces dual-network x402 USDC (`eip155:8453` Base + `eip155:42220` Celo) via `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` headers (and `X-PAYMENT` fallback)
- **Live Discovery & Health (Free / 免费)**:
  - Health & runtime config: `https://novacraft-x402-api-981337528602.us-central1.run.app/health`
  - x402 v2 service catalog: `https://novacraft-x402-api-981337528602.us-central1.run.app/.well-known/x402` & `/.well-known/x402.json`
- **Live Paid REST Routes**:
  - `POST https://novacraft-x402-api-981337528602.us-central1.run.app/api/v1/solidity-triage`
  - `POST https://novacraft-x402-api-981337528602.us-central1.run.app/api/v1/token-risk-brief`
  - `POST https://novacraft-x402-api-981337528602.us-central1.run.app/api/v1/video-storyboard`
- **Supported Settlement Rails / 支持结算网络**:
  - **Base Mainnet (`eip155:8453`)**: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (`eip3009`) → `https://facilitator.payai.network`
  - **Celo Mainnet (`eip155:42220`)**: USDC `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (`eip3009`) → `https://api.x402.celo.org`
- **Payout Address / 收款地址 (Base & Celo USDC)**: `0x445F7447532d3e9300194E289C7C023A5f3CFc9E`
- **Directory Listing**: [`paidmcp/directory#33`](https://github.com/paidmcp/directory/pull/33) · Companion stdio CLI/MCP: [`z121245017-ai/novacraft-mcp`](https://github.com/z121245017-ai/novacraft-mcp)

---

## 2. Priced MCP Tools & REST Routes / 工具与接口定价

| MCP Tool (`POST /mcp`) | REST Route | Price (Base USDC) | Capability / 能力 |
| :--- | :--- | :--- | :--- |
| `solidity_triage` | `POST /api/v1/solidity-triage` | `$0.05` (`50000` atomic) | Deterministic Solidity static vulnerability triage (reentrancy, `tx.origin`, `delegatecall`, stale Chainlink oracle, unchecked calls) + Gemini remediation plan / Solidity 静态漏洞初筛与修复优先级总结 |
| `token_risk_brief` | `POST /api/v1/token-risk-brief` | `$0.02` (`20000` atomic) | Live DexScreener liquidity + GoPlus honeypot/tax/concentration telemetry + Gemini risk brief / 实时流动性与蜜罐税率权限分析简报 |
| `video_storyboard` | `POST /api/v1/video-storyboard` | `$0.03` (`30000` atomic) | 4-scene Google Flow (Veo 3) / MiniMax-H3 launch video storyboard, visual prompts & Flow Music score / 4 幕启动视频分镜与配乐提示词 |
| `initialize`, `tools/list`, `ping` | `GET /health`, `GET /.well-known/x402.json` | Free / 免费 | Discovery, MCP handshake, health & x402 manifest / 服务发现与健康检查 |

---

## 3. MCP Client Configuration / MCP 客户端接入配置

### Option A: Managed Wallet Mode via `paidmcp-client` (Recommended for Spend Caps / 推荐托管钱包限额模式)

Works in **Claude Desktop**, **Cursor**, and any stdio MCP host using [`paidmcp-client`](https://github.com/paidmcp/client):

```json
{
  "mcpServers": {
    "novacraft-x402-api-981337528602": {
      "command": "npx",
      "args": [
        "paidmcp-client",
        "run",
        "https://novacraft-x402-api-981337528602.us-central1.run.app"
      ]
    }
  }
}
```

### Option B: Direct Streamable HTTP MCP (Cursor / HTTP-Capable MCP Clients / 直连远程 HTTP MCP)

```json
{
  "mcpServers": {
    "novacraft-web3-tools": {
      "url": "https://novacraft-x402-api-981337528602.us-central1.run.app/mcp"
    }
  }
}
```

### Quick Verification with `curl` / 命令行快速验证

```bash
# 1. Free discovery / 免费查询目录
curl -sS https://novacraft-x402-api-981337528602.us-central1.run.app/.well-known/x402.json

# 2. Free MCP tools/list / 免费列出 MCP 工具
curl -sS -X POST https://novacraft-x402-api-981337528602.us-central1.run.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# 3. Unpaid tools/call returns HTTP 402 + PAYMENT-REQUIRED / 未付费调用返回 402 挑战头
curl -i -X POST https://novacraft-x402-api-981337528602.us-central1.run.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"token_risk_brief","arguments":{"chain":"base","address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}}}'
```

---

## 4. Self-Hosting & Vertex AI Mode / 自部署与原生 Vertex AI 模式

- **\$300 GCP Free Trial** covers Cloud Run / Cloud Build infrastructure;
- **Vertex AI ADC** (`GOOGLE_GENAI_USE_VERTEXAI=true`) calls `gemini-2.5-flash` using the Cloud Run service account without managing an AI Studio API key;
- Configured with `--min-instances 0` for scale-to-zero idle cost.

```bash
rm -rf novacraft-x402-api && git clone https://github.com/z121245017-ai/novacraft-x402-api.git && cd novacraft-x402-api && chmod +x deploy-cloudrun.sh
PROJECT_ID="your-gcp-project-id" ./deploy-cloudrun.sh
```

Run local tests / 本地测试:

```bash
NODE_USE_ENV_PROXY=1 node --test test/api.test.js
```

---

## 5. Maintainer Contact / 维护者联系方式

- **Maintainer**: `@z121245017-ai`
- **Email**: `z121245017@gmail.com`
- **GitHub**: https://github.com/z121245017-ai/novacraft-x402-api
