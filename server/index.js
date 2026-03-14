import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { GoogleGenAI, Modality, Type } from "@google/genai";

dotenv.config();

const PORT = Number(process.env.PORT || 8787);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS policy"));
    },
  })
);
app.use(express.json({ limit: "20mb" }));

const MAX_RETRIES = 2;
const INITIAL_BACKOFF = 1000;

const withRetry = async (fn, retries = MAX_RETRIES, delay = INITIAL_BACKOFF) => {
  try {
    return await fn();
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const code = error?.code;
    const status = error?.status;
    const isTransient =
      status === "INTERNAL" ||
      code === 500 ||
      status === 500 ||
      message.includes("500") ||
      message.includes("internal");

    if (isTransient && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }

    throw error;
  }
};

const createClient = () => {
  if (!GEMINI_API_KEY) {
    return null;
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

const assertConfigured = (res) => {
  if (GEMINI_API_KEY) {
    return true;
  }
  res.status(500).json({
    error: "Server is missing GEMINI_API_KEY. Add it to server environment before running requests.",
  });
  return false;
};

const normalizeError = (error) => {
  const statusCode = Number(error?.status || error?.code);
  const hasStatusCode = Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600;

  return {
    status: hasStatusCode ? statusCode : 500,
    message: String(error?.message || "Unexpected server error while calling Gemini."),
  };
};

const extractRawBase64 = (value) => {
  if (!value) return "";
  return value.includes(",") ? value.split(",")[1] : value;
};

const analyzeArtifact = async (ai, base64Image, context = "") => {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: extractRawBase64(base64Image),
            },
          },
          {
            text: `You are a Senior Forensic Archaeologist. Your task is a high-precision identification of this fragment. Do not guess; perform a feature-by-feature analysis.

User Context which might be helpful: "${context}" (Verify this against visual evidence).

Step 1: Identity & Persona Lock
- Determine the IDENTITY of the figure: gender, age, and social status.
- Look for Diagnostic Markers: shape of the jawline, hair/headdress style, musculature, jewelry, or specific attire.
- VERIFY: Does this represent a specific deity, a common person, or a ruler? Explain why based on the fragment.

Step 2: Artistic DNA
- Analyze the "hand" of the artist: carving depth, eye style (e.g., almond-shaped, hooded), and surface finishing.
- Use Google Search to find identical archeological matches (e.g., "Indus Valley mother goddess vs priest king").

Step 3: Damage & Missing Volume
- Map the exact break points.
- Reconstruct the missing geometry based strictly on the IDENTIFIED persona (Step 1) and civilization.

Step 4: Output Synthesis
- Provide a visualPrompt that is a perfect, intact version of the subject.
- CRITICAL: The prompt must explicitly state the gender and specific attire to prevent AI generation errors.

Required JSON Output:
{
  "identification": {
    "type": "Specific scientific name",
    "era": "e.g., 2500-1900 BCE",
    "civilization": "Verified Culture",
    "region": "Likely excavation site",
    "material": "Specific material composition",
    "exactYearRange": "BCE/CE range"
  },
  "damageAnalysis": { "description": "Technical analysis of damage", "missingSections": "Specific missing features" },
  "timeline": [ { "year": "Date", "event": "Grounded historical fact" } ],
  "pastReconstruction": {
    "description": "Historical description focusing on the identity and persona of the whole object.",
    "visualPrompt": "A MASTERPIECE museum photograph of the WHOLE, COMPLETE version of this [GENDER] [OBJECT TYPE] from [CIVILIZATION]. It must feature [SPECIFIC HEADDRESS/FEATURE FROM FRAGMENT]. Maintain identical facial features and artistic style. 8k, professional studio lighting, neutral grey background, extremely realistic textures.",
    "hotspots": [ { "x": 0-100, "y": 0-100, "label": "Identity Marker", "detail": "Why this confirms the persona" } ]
  },
  "modernRestoration": { "description": "Conservation notes", "visualPrompt": "The restored object displayed in a modern museum spotlight." },
  "confidenceScore": 0-100,
  "confidenceExplanation": "Scientific reasoning focusing on why this identity (gender/type) was chosen.",
  "assumptions": "Archaeological gaps filled.",
  "curatorNarrative": "A 4-sentence factual tour script based on forensic evidence."
}`,
          },
        ],
      },
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            identification: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                era: { type: Type.STRING },
                civilization: { type: Type.STRING },
                region: { type: Type.STRING },
                material: { type: Type.STRING },
                exactYearRange: { type: Type.STRING },
              },
              required: ["type", "era", "civilization", "region", "material", "exactYearRange"],
            },
            damageAnalysis: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                missingSections: { type: Type.STRING },
              },
              required: ["description", "missingSections"],
            },
            pastReconstruction: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                visualPrompt: { type: Type.STRING },
                hotspots: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                      label: { type: Type.STRING },
                      detail: { type: Type.STRING },
                    },
                    required: ["x", "y", "label", "detail"],
                  },
                },
              },
              required: ["description", "visualPrompt", "hotspots"],
            },
            modernRestoration: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                visualPrompt: { type: Type.STRING },
              },
              required: ["description", "visualPrompt"],
            },
            timeline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  year: { type: Type.STRING },
                  event: { type: Type.STRING },
                },
                required: ["year", "event"],
              },
            },
            confidenceScore: { type: Type.NUMBER },
            confidenceExplanation: { type: Type.STRING },
            assumptions: { type: Type.STRING },
            curatorNarrative: { type: Type.STRING },
          },
          required: [
            "identification",
            "damageAnalysis",
            "pastReconstruction",
            "modernRestoration",
            "timeline",
            "confidenceScore",
            "confidenceExplanation",
            "curatorNarrative",
          ],
        },
      },
    });

    const text = response.text || "{}";
    const analysis = JSON.parse(text);

    const sources = [];
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      groundingChunks.forEach((chunk) => {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title || "Museum Database Entry",
            uri: chunk.web.uri,
          });
        }
      });
    }

    analysis.sources = sources;
    return analysis;
  });
};

const generateImage = async (ai, prompt) => {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [
          {
            text: `Professional, sharp, museum archival photograph. STICK TO THE SUBJECT DESCRIPTION EXACTLY. NO CREATIVE LIBERTIES. The subject is a single, WHOLE, fully reconstructed ancient object. Subject: ${prompt}`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("Visual synthesis failed. The fragment might be too complex.");
  });
};

const generateSpeech = async (ai, text) => {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Narrate in an authoritative and calm museum curator voice: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("Audio synthesis failed.");
    }

    return base64Audio;
  });
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(GEMINI_API_KEY),
  });
});

app.post("/api/analyze", async (req, res) => {
  if (!assertConfigured(res)) return;

  const { base64Image, context = "" } = req.body || {};
  if (typeof base64Image !== "string" || !base64Image.trim()) {
    res.status(400).json({ error: "base64Image is required." });
    return;
  }

  try {
    const ai = createClient();
    const analysis = await analyzeArtifact(ai, base64Image, typeof context === "string" ? context : "");
    res.json(analysis);
  } catch (error) {
    const normalized = normalizeError(error);
    res.status(normalized.status).json({ error: normalized.message });
  }
});

app.post("/api/generate-image", async (req, res) => {
  if (!assertConfigured(res)) return;

  const { prompt } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt is required." });
    return;
  }

  try {
    const ai = createClient();
    const imageDataUrl = await generateImage(ai, prompt);
    res.json({ imageDataUrl });
  } catch (error) {
    const normalized = normalizeError(error);
    res.status(normalized.status).json({ error: normalized.message });
  }
});

app.post("/api/generate-speech", async (req, res) => {
  if (!assertConfigured(res)) return;

  const { text } = req.body || {};
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required." });
    return;
  }

  try {
    const ai = createClient();
    const audioBase64 = await generateSpeech(ai, text);
    res.json({ audioBase64 });
  } catch (error) {
    const normalized = normalizeError(error);
    res.status(normalized.status).json({ error: normalized.message });
  }
});

app.listen(PORT, () => {
  console.log(`Gemini API server running on http://localhost:${PORT}`);
});
