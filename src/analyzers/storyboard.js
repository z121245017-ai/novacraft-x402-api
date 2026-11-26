/**
 * Deterministic Veo 3 / Google Flow / MiniMax-H3 multi-scene storyboard builder.
 */
export function buildStoryboardPlan({
  productName,
  tagline,
  features = [],
  targetAudience = "Web3 builders and crypto-native users",
  durationSeconds = 32,
  platform = "Google Flow (Veo 3)",
}) {
  const cleanName = String(productName || "").trim();
  const cleanTagline = String(tagline || "").trim();
  if (cleanName.length < 2 || cleanTagline.length < 5) {
    throw new Error("productName (>=2 chars) and tagline (>=5 chars) are required");
  }

  const featureList = (Array.isArray(features) ? features : [String(features || "")])
    .map((f) => String(f || "").trim())
    .filter(Boolean);
  const f1 = featureList[0] || "instant verifiable execution";
  const f2 = featureList[1] || "zero-friction on-chain settlement";
  const f3 = featureList[2] || "real-time autonomous risk guardrails";

  const clampedDuration = Math.max(24, Math.min(60, Number(durationSeconds) || 32));
  const sceneLen = Math.round(clampedDuration / 4);

  const scenes = [
    {
      scene: 1,
      beat: "Hook / Problem Statement",
      timeRange: `00:00 - 00:${String(sceneLen).padStart(2, "0")}`,
      caption: `${cleanName} — Rewriting the rules`,
      camera: "Fast macro push-in with subtle anamorphic bokeh",
      visualPrompt: `Cinematic 1080p dark-mode fintech opening shot: fragmented glowing red data shards and lagging financial tickers dissolve into a crisp obsidian glass command surface announcing "${cleanName}", neon emerald and cyan rim lighting, crisp studio 3D depth, ultra-clean motion graphics, no cluttered text.`,
      audioCue: "Deep sub-bass pulse + crisp digital shatter transition",
    },
    {
      scene: 2,
      beat: "Core Solution & Live Product Reveal",
      timeRange: `00:${String(sceneLen).padStart(2, "0")} - 00:${String(sceneLen * 2).padStart(2, "0")}`,
      caption: cleanTagline.slice(0, 72),
      camera: "Smooth orbital dolly around floating holographic UI",
      visualPrompt: `Sleek dark-slate glass UI card emerging in 3D space demonstrating ${f1}, luminous emerald status pulses flowing smoothly across clean geometric nodes tailored for ${targetAudience}, realistic volumetric lighting, 24fps filmic motion.`,
      audioCue: "Warm synth arpeggio rising into confident clean percussion click",
    },
    {
      scene: 3,
      beat: "Trust, Architecture & Second Capability",
      timeRange: `00:${String(sceneLen * 2).padStart(2, "0")} - 00:${String(sceneLen * 3).padStart(2, "0")}`,
      caption: `${f2} • ${f3}`.slice(0, 72),
      camera: "Dynamic lateral tracking shot with crisp rack focus",
      visualPrompt: `Architectural close-up of cryptographic verification rings locking seamlessly together while ${f2} and ${f3} execute in real time, subtle teal micro-particles, institutional-grade dark aesthetic, crystal-clear visual hierarchy.`,
      audioCue: "Crisp mechanical lock click layered over uplifting modern electronic groove",
    },
    {
      scene: 4,
      beat: "Payoff & Call To Action",
      timeRange: `00:${String(sceneLen * 3).padStart(2, "0")} - 00:${String(clampedDuration).padStart(2, "0")}`,
      caption: `Launch with ${cleanName} today`,
      camera: "Slow pull-back to clean centered hero lockup",
      visualPrompt: `Clean hero outro frame on deep midnight obsidian background: all glowing UI telemetry streams converge into a minimalist geometric emblem for "${cleanName}", calm confident studio spotlight, refined negative space for final brand lockup.`,
      audioCue: "Resolved warm chord + subtle clean chime decay",
    },
  ];

  return {
    productName: cleanName,
    tagline: cleanTagline,
    targetPlatform: String(platform),
    totalDurationSeconds: clampedDuration,
    aspectRatio: "16:9 (1920x1080)",
    flowMusicPrompt:
      "Modern institutional fintech electronic, 118 BPM, crisp warm analog synth arpeggio, subtle sub-bass, clean minimal percussion, uplifting confident tech launch vibe, no vocals",
    scenes,
  };
}
