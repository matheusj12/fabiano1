import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

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

// Usa Vercel AI Gateway se disponível, senão cai no Gemini direto
const gatewayKey = process.env.VITE_VERCEL_AI_GATEWAY_KEY || process.env.VERCEL_AI_GATEWAY_KEY;
const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

const google = createGoogleGenerativeAI({
  apiKey: geminiKey || '',
  ...(gatewayKey && {
    baseURL: 'https://ai-gateway.vercel.sh/v1/providers/google',
    headers: { 'x-ai-gateway-api-key': gatewayKey },
  }),
});

const prompt = `
  Analise esta chapa de pedra (mármore ou granito) para uma marmoraria.
  Identifique rachaduras, fissuras, lascas, manchas ou qualquer imperfeição.

  Além do resumo, você deve fornecer as coordenadas (bounding boxes) de cada imperfeição encontrada.
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

export async function analyzeStoneImage(base64Image: string): Promise<AIAnalysisResult> {
  const imageData = base64Image.split(',')[1];
  const mimeType = base64Image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

  try {
    const { text } = await generateText({
      model: google('gemini-2.0-flash'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', image: imageData },
          ],
        },
      ],
    });

    // Extrai JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta inválida da IA');
    return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  } catch (error) {
    console.error('Erro na análise de IA:', error);
    throw new Error('Não foi possível completar a análise da pedra.');
  }
}
