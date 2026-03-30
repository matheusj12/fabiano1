import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'image is required' });
  }

  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY || '',
  });

  try {
    const imageData = image.split(',')[1];

    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
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

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta inválida da IA');

    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error('Erro Gemini:', error);
    res.status(500).json({ error: error.message || 'Erro na análise' });
  }
}
