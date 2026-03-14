import { ArtifactAnalysis } from "../types";

const normalizedApiBase = (() => {
  const raw = (import.meta.env.VITE_API_BASE_URL || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
})();

const buildUrl = (path: string) => {
  if (!import.meta.env.DEV && !normalizedApiBase && window.location.hostname.endsWith("github.io")) {
    throw new Error(
      "Backend API is not configured for GitHub Pages. Set VITE_API_BASE_URL to your backend URL before building."
    );
  }
  return `${normalizedApiBase}${path}`;
};

const postJson = async <T>(path: string, payload: unknown): Promise<T> => {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsed: any = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text };
    }
  }

  if (!response.ok) {
    const message = parsed?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return parsed as T;
};

export const analyzeArtifact = async (base64Image: string, context: string = ""): Promise<ArtifactAnalysis> => {
  return postJson<ArtifactAnalysis>("/api/analyze", { base64Image, context });
};

export const generateImage = async (prompt: string): Promise<string> => {
  const result = await postJson<{ imageDataUrl: string }>("/api/generate-image", { prompt });
  return result.imageDataUrl;
};

export const generateSpeech = async (text: string): Promise<string> => {
  const result = await postJson<{ audioBase64: string }>("/api/generate-speech", { text });
  return result.audioBase64;
};
