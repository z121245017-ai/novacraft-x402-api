const CHAIN_ID_MAP = {
  ethereum: "1",
  eth: "1",
  bsc: "56",
  polygon: "137",
  arbitrum: "42161",
  base: "8453",
  solana: "solana",
};

export function validateTokenInput(chain, address) {
  const normalizedChain = String(chain || "base").trim().toLowerCase();
  const chainId = CHAIN_ID_MAP[normalizedChain];
  if (!chainId) {
    throw new Error(`Unsupported chain "${chain}". Supported: ${Object.keys(CHAIN_ID_MAP).join(", ")}`);
  }

  const addr = String(address || "").trim();
  if (normalizedChain === "solana") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
      throw new Error("Invalid Solana token mint address");
    }
  } else if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    throw new Error("Invalid EVM token contract address (expected 0x + 40 hex chars)");
  }

  return { chain: normalizedChain, chainId, address: addr };
}

/**
 * Pure deterministic scoring function over DexScreener pairs & GoPlus token security payload.
 */
export function scoreTokenMetrics(dexPairs, goPlusData, { chain, address }) {
  const flags = [];
  let riskScore = 0;

  const addFlag = (code, severity, detail, weight) => {
    flags.push({ code, severity, detail });
    riskScore += weight;
  };

  const pairs = Array.isArray(dexPairs) ? dexPairs : [];
  const matchingPairs = pairs.filter(
    (p) => !chain || String(p.chainId || "").toLowerCase() === chain || chain === "eth" && p.chainId === "ethereum"
  );
  const sortedPairs = (matchingPairs.length ? matchingPairs : pairs).slice().sort((a, b) => {
    const liqA = Number(a?.liquidity?.usd || 0);
    const liqB = Number(b?.liquidity?.usd || 0);
    return liqB - liqA;
  });

  const topPair = sortedPairs[0] || null;
  const liquidityUsd = Number(topPair?.liquidity?.usd || 0);
  const fdvUsd = Number(topPair?.fdv || 0);
  const volume24hUsd = Number(topPair?.volume?.h24 || 0);
  const priceUsd = topPair?.priceUsd ? String(topPair.priceUsd) : null;
  const symbol = topPair?.baseToken?.symbol || goPlusData?.token_symbol || null;
  const name = topPair?.baseToken?.name || goPlusData?.token_name || null;

  if (!topPair) {
    addFlag("NO_ACTIVE_DEX_POOL", "high", "No active DEX liquidity pool found on DexScreener", 35);
  } else {
    if (liquidityUsd < 10000) {
      addFlag("CRITICAL_LOW_LIQUIDITY", "high", `Top pool liquidity is very low ($${liquidityUsd.toFixed(0)} < $10,000)`, 30);
    } else if (liquidityUsd < 50000) {
      addFlag("MODERATE_LOW_LIQUIDITY", "medium", `Top pool liquidity is thin ($${liquidityUsd.toFixed(0)} < $50,000)`, 12);
    }

    if (liquidityUsd > 0 && fdvUsd / liquidityUsd > 100) {
      addFlag("EXTREME_FDV_LIQUIDITY_RATIO", "medium", `FDV/Liquidity ratio is ${(fdvUsd / liquidityUsd).toFixed(1)}x (> 100x)`, 15);
    }
  }

  if (goPlusData && typeof goPlusData === "object") {
    const buyTax = Number(goPlusData.buy_tax || 0);
    const sellTax = Number(goPlusData.sell_tax || 0);

    if (String(goPlusData.is_honeypot) === "1") {
      addFlag("HONEYPOT_DETECTED", "critical", "GoPlus flagged token as honeypot / cannot sell", 60);
    }
    if (String(goPlusData.cannot_sell_all) === "1") {
      addFlag("CANNOT_SELL_ALL", "high", "GoPlus flagged restriction on selling full balance", 30);
    }
    if (String(goPlusData.is_mintable) === "1") {
      addFlag("MINTABLE_SUPPLY", "medium", "Contract owner/privileged role can mint new tokens", 15);
    }
    if (String(goPlusData.owner_change_balance) === "1") {
      addFlag("OWNER_BALANCE_MUTATION", "critical", "Privileged address can arbitrarily modify holder balances", 45);
    }
    if (String(goPlusData.is_blacklisted) === "1") {
      addFlag("BLACKLIST_FUNCTION", "low", "Contract includes address blacklisting capability", 8);
    }
    if (String(goPlusData.is_open_source) === "0") {
      addFlag("UNVERIFIED_SOURCE", "medium", "Contract source code is not verified/open-source", 15);
    }
    if (buyTax > 0.05 || sellTax > 0.05) {
      addFlag(
        "HIGH_TRADING_TAX",
        sellTax > 0.15 || buyTax > 0.15 ? "high" : "medium",
        `Elevated token tax (buy ${(buyTax * 100).toFixed(1)}%, sell ${(sellTax * 100).toFixed(1)}%)`,
        sellTax > 0.15 || buyTax > 0.15 ? 25 : 12
      );
    }

    const holders = Array.isArray(goPlusData.holders) ? goPlusData.holders : [];
    const topHolderPct = holders.reduce((acc, h) => acc + Number(h.percent || 0), 0);
    if (holders.length > 0 && topHolderPct > 0.5) {
      addFlag(
        "CONCENTRATED_HOLDERS",
        "medium",
        `Top reported holders control ${(topHolderPct * 100).toFixed(1)}% of tracked supply`,
        15
      );
    }
  } else {
    flags.push({
      code: "GOPLUS_DATA_UNAVAILABLE",
      severity: "low",
      detail: "GoPlus security payload unavailable; score reflects DEX market telemetry only",
    });
  }

  riskScore = Math.min(100, riskScore);
  const verdict = riskScore >= 60 ? "AVOID" : riskScore >= 25 ? "CAUTION" : "LOWER_RISK";

  return {
    chain,
    address,
    token: { name, symbol, priceUsd },
    market: {
      dexId: topPair?.dexId || null,
      pairAddress: topPair?.pairAddress || null,
      liquidityUsd,
      fdvUsd,
      volume24hUsd,
      poolCount: sortedPairs.length,
    },
    securityTelemetryAvailable: Boolean(goPlusData),
    riskScore,
    verdict,
    flags,
  };
}

async function fetchJsonWithTimeout(fetchImpl, url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": "novacraft-x402-api/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeTokenRisk({ chain = "base", address, fetchImpl = fetch }) {
  const validated = validateTokenInput(chain, address);

  const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(validated.address)}`;
  const goPlusUrl =
    validated.chainId === "solana"
      ? `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(validated.address)}`
      : `https://api.gopluslabs.io/api/v1/token_security/${validated.chainId}?contract_addresses=${encodeURIComponent(validated.address.toLowerCase())}`;

  const [dexPayload, goPlusPayload] = await Promise.all([
    fetchJsonWithTimeout(fetchImpl, dexUrl),
    fetchJsonWithTimeout(fetchImpl, goPlusUrl),
  ]);

  const dexPairs = dexPayload?.pairs || [];
  const goPlusResultMap = goPlusPayload?.result || {};
  const goPlusData =
    goPlusResultMap[validated.address.toLowerCase()] ||
    goPlusResultMap[validated.address] ||
    null;

  return scoreTokenMetrics(dexPairs, goPlusData, {
    chain: validated.chain,
    address: validated.address,
  });
}
