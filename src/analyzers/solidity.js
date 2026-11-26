const SEVERITY_WEIGHTS = {
  critical: 30,
  high: 20,
  medium: 10,
  low: 5,
};

function findLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function stripComments(line) {
  return line.replace(/\/\/.*$/, "").trim();
}

/**
 * Deterministic static Solidity security triage analyzer.
 * Detects high-impact EVM vulnerability classes with line numbers and remediation guidance.
 */
export function analyzeSolidity(sourceCode, contractName = "TargetContract") {
  if (typeof sourceCode !== "string" || sourceCode.trim().length < 10) {
    throw new Error("sourceCode must be a non-empty Solidity string (min 10 chars)");
  }

  const lines = sourceCode.split("\n");
  const findings = [];
  const seen = new Set();

  const addFinding = ({ id, severity, title, line, evidence, remediation }) => {
    const key = `${id}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ id, severity, title, line, evidence: evidence.trim(), remediation });
  };

  // 1. tx.origin authentication
  lines.forEach((raw, idx) => {
    const line = stripComments(raw);
    if (!line) return;
    if (/\btx\.origin\b/.test(line)) {
      addFinding({
        id: "SOL-TX-ORIGIN",
        severity: "high",
        title: "Authentication or authorization relies on tx.origin",
        line: idx + 1,
        evidence: line,
        remediation: "Replace tx.origin with msg.sender or role-based access control.",
      });
    }
  });

  // 2. Arbitrary delegatecall
  lines.forEach((raw, idx) => {
    const line = stripComments(raw);
    if (!line) return;
    if (/\.delegatecall\s*\(/.test(line)) {
      addFinding({
        id: "SOL-DELEGATECALL",
        severity: "critical",
        title: "delegatecall exposes caller storage layout",
        line: idx + 1,
        evidence: line,
        remediation: "Restrict delegatecall targets to immutable vetted implementations and guard with strict governance.",
      });
    }
  });

  // 3. selfdestruct / suicide
  lines.forEach((raw, idx) => {
    const line = stripComments(raw);
    if (!line) return;
    if (/\b(selfdestruct|suicide)\s*\(/.test(line)) {
      addFinding({
        id: "SOL-SELFDESTRUCT",
        severity: "high",
        title: "Use of selfdestruct/suicide detected",
        line: idx + 1,
        evidence: line,
        remediation: "Remove selfdestruct; note EIP-6780 behavior and prefer explicit pause/withdrawal flows.",
      });
    }
  });

  // 4. Reentrancy (external .call before state update within function block)
  const callRegex = /\.call(?:\s*\{[^}]*\})?\s*\(/g;
  let match;
  while ((match = callRegex.exec(sourceCode)) !== null) {
    const lineNum = findLineNumber(sourceCode, match.index);
    const snippetLine = stripComments(lines[lineNum - 1] || "");
    if (!snippetLine) continue;

    // Look ahead up to 15 lines for state assignment after external call
    const lookahead = lines.slice(lineNum, Math.min(lines.length, lineNum + 15));
    const hasStateWriteAfter = lookahead.some((l) => {
      const clean = stripComments(l);
      if (!clean || clean.startsWith("require") || clean.startsWith("emit") || clean.startsWith("if")) {
        return false;
      }
      return (
        /[A-Za-z_][A-Za-z0-9_]*\s*\[[^\]]+\]\s*(\+=|-=|=)\s*/.test(clean) ||
        /\b(balances|shares|debt|collateral|claimed|withdrawn|rewardDebt)\b[^;]*(=|\+=|-=)/.test(clean)
      );
    });

    if (hasStateWriteAfter) {
      addFinding({
        id: "SOL-REENTRANCY",
        severity: "critical",
        title: "State updated after external low-level .call (CEI violation / reentrancy)",
        line: lineNum,
        evidence: snippetLine,
        remediation: "Apply Checks-Effects-Interactions (update balances/state before external calls) and add ReentrancyGuard.",
      });
    }

    // 5. Unchecked low-level call return value
    const assignsReturn = /\(\s*bool\s+[A-Za-z_][A-Za-z0-9_]*/.test(snippetLine) || /bool\s+[A-Za-z_][A-Za-z0-9_]*\s*=/.test(snippetLine);
    const wrappedInRequire = /\brequire\s*\(/.test(snippetLine);
    if (!assignsReturn && !wrappedInRequire) {
      addFinding({
        id: "SOL-UNCHECKED-CALL",
        severity: "high",
        title: "Unchecked return value on low-level .call",
        line: lineNum,
        evidence: snippetLine,
        remediation: "Capture `(bool ok, ) = target.call(...)` and revert when `!ok`.",
      });
    }
  }

  // Unchecked .send()
  lines.forEach((raw, idx) => {
    const line = stripComments(raw);
    if (!line) return;
    if (/\.send\s*\(/.test(line) && !/\brequire\s*\(/.test(line) && !/=/.test(line)) {
      addFinding({
        id: "SOL-UNCHECKED-SEND",
        severity: "medium",
        title: "Unchecked return value on .send()",
        line: idx + 1,
        evidence: line,
        remediation: "Check the boolean return value of .send() or prefer checked .call{value: ...}(\"\").",
      });
    }
  });

  // 6. Weak on-chain randomness
  lines.forEach((raw, idx) => {
    const line = stripComments(raw);
    if (!line) return;
    if (/(block\.timestamp|blockhash\s*\(|block\.prevrandao|block\.difficulty).*%|%.*(block\.timestamp|blockhash\s*\(|block\.prevrandao|block\.difficulty)/.test(line)) {
      addFinding({
        id: "SOL-WEAK-RANDOMNESS",
        severity: "medium",
        title: "Predictable on-chain randomness via block metadata modulo",
        line: idx + 1,
        evidence: line,
        remediation: "Use Chainlink VRF or a commit-reveal scheme instead of block metadata.",
      });
    }
  });

  // 7. Stale Chainlink oracle check
  lines.forEach((raw, idx) => {
    const line = stripComments(raw);
    if (!line) return;
    if (/\.latestRoundData\s*\(/.test(line)) {
      const windowText = lines.slice(Math.max(0, idx - 1), Math.min(lines.length, idx + 8)).map(stripComments).join("\n");
      const checksFreshness = /updatedAt/.test(windowText) && (/answeredInRound/.test(windowText) || /block\.timestamp\s*-/.test(windowText));
      if (!checksFreshness) {
        addFinding({
          id: "SOL-STALE-ORACLE",
          severity: "high",
          title: "Chainlink latestRoundData() missing staleness or round completeness checks",
          line: idx + 1,
          evidence: line,
          remediation: "Verify answer > 0, updatedAt != 0, block.timestamp - updatedAt <= heartbeat, and answeredInRound >= roundId.",
        });
      }
    }
  });

  // 8. Division before multiplication precision loss
  lines.forEach((raw, idx) => {
    const line = stripComments(raw);
    if (!line) return;
    if (/[A-Za-z0-9_)]\s*\/\s*[A-Za-z0-9_(]+\s*\*\s*[A-Za-z0-9_(]+/.test(line)) {
      addFinding({
        id: "SOL-DIV-BEFORE-MUL",
        severity: "low",
        title: "Potential integer truncation from division before multiplication",
        line: idx + 1,
        evidence: line,
        remediation: "Perform multiplication before division or use fixed-point WAD/RAY math (e.g. Math.mulDiv).",
      });
    }
  });

  const severitySummary = { critical: 0, high: 0, medium: 0, low: 0 };
  let score = 0;
  for (const f of findings) {
    severitySummary[f.severity] = (severitySummary[f.severity] || 0) + 1;
    score += SEVERITY_WEIGHTS[f.severity] || 0;
  }

  const riskScore = Math.min(100, score);
  const riskTier =
    riskScore >= 60 ? "CRITICAL" : riskScore >= 30 ? "HIGH" : riskScore >= 10 ? "MEDIUM" : "LOW";

  return {
    contractName: String(contractName || "TargetContract"),
    linesAnalyzed: lines.length,
    riskScore,
    riskTier,
    severitySummary,
    findingCount: findings.length,
    findings,
    recommendations: [...new Set(findings.map((f) => f.remediation))],
  };
}
