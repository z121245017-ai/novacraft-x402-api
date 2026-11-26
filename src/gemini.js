import { GoogleGenAI } from "@google/genai";

/**
 * Synthesizes structured JSON using Vertex AI (Cloud Run native ADC) or Gemini API Key,
 * falling back deterministically without crashing when absent or on API errors.
 */
export async function synthesizeJson({
  useVertexAi = false,
  vertexProjectId = "",
  vertexLocation = "us-central1",
  apiKey = "",
  model = "gemini-2.5-flash",
  systemInstruction,
  prompt,
  fallback,
  timeoutMs = 15000,
}) {
  let ai;
  let mode = "deterministic_only";

  if (useVertexAi && String(vertexProjectId || "").trim()) {
    mode = "vertexai";
    ai = new GoogleGenAI({
      vertexai: true,
      project: String(vertexProjectId).trim(),
      location: String(vertexLocation || "us-central1").trim(),
    });
  } else if (apiKey && String(apiKey).trim()) {
    mode = "api_key";
    ai = new GoogleGenAI({ apiKey: String(apiKey).trim() });
  } else {
    return {
      enabled: false,
      mode,
      model: null,
      data: fallback,
      note: "Neither Vertex AI nor GEMINI_API_KEY configured; deterministic output returned",
    };
  }

  try {
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
      mode,
      model,
      data: parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : fallback,
      note: `Gemini synthesis applied (${mode})`,
    };
  } catch (err) {
    return {
      enabled: false,
      mode,
      model,
      data: fallback,
      note: `Gemini fallback triggered (${mode}): ${err?.message || "unknown error"}`,
    };
  }
}
