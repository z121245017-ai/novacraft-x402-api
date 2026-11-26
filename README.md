# NovaCraft x402 API (Base Mainnet USDC + Vertex AI Gemini + PayAI)

按次收取 **Base Mainnet USDC** 的 AI Agent 付费接口（`x402 v2`，无需 API Key、无需订阅、免 KYC 直收钱包 `0x445F7447532d3e9300194E289C7C023A5f3CFc9E`），接入 **PayAI Facilitator**（`https://facilitator.payai.network`）与 **Bazaar 自动索引扩展**。

## 1. 接口清单与定价

| 方法与路径 | 单价 (Base USDC) | 能力 |
| :--- | :--- | :--- |
| `POST /api/v1/solidity-triage` | `$0.05` (`50000` atomic) | Solidity 静态漏洞初筛（重入、`tx.origin`、`delegatecall`、Chainlink 过期检查、未检查调用等）+ Gemini 修复优先级总结 |
| `POST /api/v1/token-risk-brief` | `$0.02` (`20000` atomic) | 实时拉取 DexScreener 流动性 + GoPlus 蜜罐/税率/权限 + Gemini 简报 |
| `POST /api/v1/video-storyboard` | `$0.03` (`30000` atomic) | 4 幕 Veo 3 / Google Flow / MiniMax-H3 启动视频分镜与 Flow Music 提示词 |
| `GET /health` & `GET /.well-known/x402.json` | 免费 | 健康检查与机器可读服务目录 |

## 2. 为什么默认走原生 Vertex AI 模式（最省钱）

- **\$300 新户免费试用金** 抵扣 Cloud Run / Cloud Build 云基础设施；
- **\$140 Ultra 开发者赠金（\$40 + \$100，有效期 1 年）** 直接抵扣 **Vertex AI** 上的 `gemini-2.5-flash` 调用费；
- 全程使用 Cloud Run 服务账号原生 ADC 认证，**无需额外往 AI Studio 充值设置预付款**。

## 3. Cloud Shell 一键部署（自动补齐 IAM 权限并启用 Vertex AI）

打开 https://shell.cloud.google.com/?project=project-fd4cf214-9f45-417f-b6c&show=terminal 执行：

```bash
rm -rf novacraft-x402-api && git clone https://github.com/z121245017-ai/novacraft-x402-api.git && cd novacraft-x402-api && chmod +x deploy-cloudrun.sh
PROJECT_ID="project-fd4cf214-9f45-417f-b6c" ./deploy-cloudrun.sh
```

默认配置了 `--min-instances 0`，闲置零费用，有请求才计费。
