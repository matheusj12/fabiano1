import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AIDetection {
  type: 'rachadura' | 'fissura' | 'lasca' | 'mancha' | 'outro';
  description: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

export interface AIAnalysisResult {
  summary: string;
  imperfections: string[];
  qualityScore: number; // 0 to 100
  detections: AIDetection[];
}

export async function analyzeStoneImage(base64Image: string): Promise<AIAnalysisResult> {
  const model = "gemini-2.5-pro";
  
  const prompt = `
    Analise esta chapa de pedra (mármore ou granito) para uma marmoraria.
    Identifique rachaduras, fissuras, lascas, manchas ou qualquer imperfeição.
    
    Além do resumo, você deve fornecer as coordenadas (bounding boxes) de cada imperfeição encontrada para que possamos marcá-las automaticamente no sistema.
    Use o formato [ymin, xmin, ymax, xmax] com valores normalizados de 0 a 1000.
    
    Retorne a análise em formato JSON com a seguinte estrutura:
    {
      "summary": "Um resumo geral da qualidade da pedra.",
      "imperfections": ["Lista de imperfeições encontradas"],
      "qualityScore": 85,
      "detections": [
        {
          "type": "rachadura",
          "description": "Rachadura vertical no centro",
          "box_2d": [200, 450, 800, 550]
        }
      ]
    }
    
    Seja técnico. Se encontrar lascas nas bordas ou rachaduras internas, marque-as com precisão.
  `;

  const imagePart = {
    inlineData: {
      mimeType: "image/png",
      data: base64Image.split(",")[1], // Remove the data:image/png;base64, prefix
    },
  };

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }, imagePart] }],
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    return JSON.parse(text) as AIAnalysisResult;
  } catch (error) {
    console.error("Erro na análise de IA:", error);
    throw new Error("Não foi possível completar a análise da pedra.");
  }
}
