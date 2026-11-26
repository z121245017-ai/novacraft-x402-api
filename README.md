# NovaCraft x402 API (Base Mainnet USDC + Gemini + PayAI)

按次收取 **Base Mainnet USDC** 的 AI Agent 付费接口（`x402 v2`，无需 API Key、无需订阅、免 KYC 直收钱包 `0x445F7447532d3e9300194E289C7C023A5f3CFc9E`），接入 **PayAI Facilitator**（`https://facilitator.payai.network`）与 **Bazaar 自动索引扩展**。

## 1. 接口清单与定价

| 方法与路径 | 单价 (Base USDC) | 能力 |
| :--- | :--- | :--- |
| `POST /api/v1/solidity-triage` | `$0.05` (`50000` atomic) | Solidity 静态漏洞初筛（重入、`tx.origin`、`delegatecall`、Chainlink 过期检查、未检查调用等）+ Gemini 修复优先级总结 |
| `POST /api/v1/token-risk-brief` | `$0.02` (`20000` atomic) | 实时拉取 DexScreener 流动性 + GoPlus 蜜罐/税率/权限 + Gemini 简报 |
| `POST /api/v1/video-storyboard` | `$0.03` (`30000` atomic) | 4 幕 Veo 3 / Google Flow / MiniMax-H3 启动视频分镜与 Flow Music 提示词 |
| `GET /health` & `GET /.well-known/x402.json` | 免费 | 健康检查与机器可读服务目录 |

## 2. 绑定 AI Studio 用 \$440 赠金拿 `GEMINI_API_KEY`（约 1 分钟）

1. 用 `zhufan108@gmail.com` 打开 https://aistudio.google.com/apikey
2. 点击 **Create API key**（若提示选择 Google Cloud 项目，选绑定了结算账号 **`010DBE-51F426-FA29BD`** 的项目）
3. 复制生成的 `AIza...` 密钥——所有 Gemini API 调用优先走那 **\$440 赠金**。

## 3. 用 Cloud Shell 零本地环境一键部署到 Cloud Run（约 2 分钟）

- 打开 https://shell.cloud.google.com （确认左上角项目已关联结算账号 `010DBE-51F426-FA29BD`），把本目录打包上传或推到仓库后执行：

```bash
chmod +x deploy-cloudrun.sh
PROJECT_ID="你的GCP项目ID" GEMINI_API_KEY="AIza你的Key" ./deploy-cloudrun.sh
```

- 默认配置了 `--min-instances 0`，无人调用时缩容到 0，闲置费用为 **\$0**，有请求时才计费并直接扣您的 **\$440 Cloud 赠金**。

## 4. 触发 Bazaar 自动索引

在 PayAI / x402 生态里，端点在**首次成功完成一笔真实付费结算后**会被 Facilitator 自动抓取并收录进 Bazaar 发现目录：
- 用您的 Base 小钱包（带 `$0.10` USDC + 少量 Base ETH gas）对部署后的 `/api/v1/token-risk-brief` 自付一笔 `$0.02` 真实调用，即可自动验证结算通路并触发收录。
