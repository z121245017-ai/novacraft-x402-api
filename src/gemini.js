import { GoogleGenAI } from "@google/genai";

/**
 * Synthesizes structured JSON using Gemini when GEMINI_API_KEY is configured,
 * falling back deterministically without crashing when absent or on API errors.
 */
export async function synthesizeJson({
  apiKey,
  model = "gemini-2.5-flash",
  systemInstruction,
  prompt,
  fallback,
  timeoutMs = 15000,
}) {
  if (!apiKey || !String(apiKey).trim()) {
    return {
      enabled: false,
      model: null,
      data: fallback,
      note: "GEMINI_API_KEY not set; deterministic output returned",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: String(apiKey).trim() });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.2,
        abortSignal: controller.signal,
      },
    });

    clearTimeout(timer);
    const raw = response?.text ?? "";
    const parsed = JSON.parse(raw);
    return {
      enabled: true,
      model,
      data: parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : fallback,
      note: "Gemini synthesis applied",
    };
  } catch (err) {
    return {
      enabled: false,
      model,
      data: fallback,
      note: `Gemini fallback triggered: ${err?.message || "unknown error"}`,
    };
  }
}
