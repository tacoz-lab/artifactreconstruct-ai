import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ArtifactAnalysis, GroundingSource } from "../types";

const getApiKey = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('gemini_api_key') || '';
  }
  return '';
};

const MAX_RETRIES = 2;
const INITIAL_BACKOFF = 1000;

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_BACKOFF): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isTransient = error?.status === 'INTERNAL' || error?.code === 500 || error?.message?.includes('500');
    if (isTransient && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const analyzeArtifact = async (base64Image: string, context: string = ''): Promise<ArtifactAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image.split(',')[1] || base64Image,
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
}`
          }
        ]
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
              required: ['type', 'era', 'civilization', 'region', 'material', 'exactYearRange']
            },
            damageAnalysis: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                missingSections: { type: Type.STRING },
              },
              required: ['description', 'missingSections']
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
                    required: ['x', 'y', 'label', 'detail']
                  }
                }
              },
              required: ['description', 'visualPrompt', 'hotspots']
            },
            modernRestoration: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                visualPrompt: { type: Type.STRING },
              },
              required: ['description', 'visualPrompt']
            },
            timeline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  year: { type: Type.STRING },
                  event: { type: Type.STRING },
                },
                required: ['year', 'event']
              }
            },
            confidenceScore: { type: Type.NUMBER },
            confidenceExplanation: { type: Type.STRING },
            assumptions: { type: Type.STRING },
            curatorNarrative: { type: Type.STRING },
          },
          required: ['identification', 'damageAnalysis', 'pastReconstruction', 'modernRestoration', 'timeline', 'confidenceScore', 'confidenceExplanation', 'curatorNarrative']
        }
      }
    });

    const text = response.text || "{}";
    const analysis = JSON.parse(text) as ArtifactAnalysis;

    const sources: GroundingSource[] = [];
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title || 'Museum Database Entry',
            uri: chunk.web.uri
          });
        }
      });
    }
    analysis.sources = sources;
    return analysis;
  });
};

export const generateImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: `Professional, sharp, museum archival photograph. STICK TO THE SUBJECT DESCRIPTION EXACTLY. NO CREATIVE LIBERTIES. The subject is a single, WHOLE, fully reconstructed ancient object. Subject: ${prompt}` }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Visual synthesis failed. The fragment might be too complex.");
  });
};

export const generateSpeech = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Narrate in an authoritative and calm museum curator voice: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Audio synthesis failed.");
    return base64Audio;
  });
};
