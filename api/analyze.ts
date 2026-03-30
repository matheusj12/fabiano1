import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

// ─── ETAPA 1: Caracterização petrológica ────────────────────────────────────
const PROMPT_CHARACTERIZE = `
Você é um petrólogo especialista em rochas ornamentais com 20 anos de experiência em marmorarias industriais.

Analise esta chapa de pedra natural e retorne APENAS um JSON com:
{
  "stoneType": "granito | mármore | quartzito | ardósia | travertino | outro",
  "finish": "polido | escovado | levigado | flameado | apicoado | outro",
  "color": "descrição da cor predominante",
  "veinPattern": "descrição do padrão de veios ou granulação",
  "estimatedThickness": "estimativa em cm",
  "commercialGrade": "A | B | C | Descarte",
  "colorUniformity": 0-100
}

Seja preciso. Analise textura, brilho e padrão superficial.
`;

// ─── ETAPA 2: Inspeção técnica por quadrante ────────────────────────────────
const buildInspectionPrompt = (char: string) => `
Você é um inspetor de qualidade sênior especializado em chapas de pedra natural para marmoraria.

CARACTERIZAÇÃO JÁ REALIZADA:
${char}

Faça uma varredura MINUCIOSA da chapa dividindo em 4 quadrantes:
• Superior esquerdo  (x: 0-500,   y: 0-500)
• Superior direito   (x: 500-1000, y: 0-500)
• Inferior esquerdo  (x: 0-500,   y: 500-1000)
• Inferior direito   (x: 500-1000, y: 500-1000)

Para cada quadrante, identifique TODOS os defeitos presentes:
- Rachaduras (fraturas estruturais profundas)
- Fissuras (micro-trincas superficiais)
- Lascas (remoção de material nas bordas ou superfície)
- Manchas (oxidação, contaminação, umidade)
- Poros (cavidades naturais ou artificiais)
- Eflorescências (depósitos minerais brancos)
- Irregularidades de superfície (ondulações, marcas de serragem)

Para cada defeito, forneça bounding box [ymin, xmin, ymax, xmax] com valores 0-1000.

Critérios de qualityScore:
95-100: Chapa premium, sem defeitos visíveis
85-94:  Boa qualidade, defeitos mínimos nas bordas
70-84:  Qualidade comercial, pequenos defeitos aceitáveis
50-69:  Qualidade reduzida, defeitos visíveis em área nobre
0-49:   Descarte ou uso em cortes menores

Retorne APENAS o JSON:
{
  "summary": "resumo técnico completo em 2-3 frases",
  "qualityScore": 0-100,
  "structuralIntegrity": 0-100,
  "imperfections": ["lista detalhada de cada imperfeição encontrada"],
  "recommendations": ["recomendações técnicas de uso, corte e aproveitamento"],
  "detections": [
    {
      "type": "rachadura | fissura | lasca | mancha | poro | eflorescência | irregularidade | outro",
      "severity": "crítico | moderado | leve",
      "description": "descrição técnica precisa",
      "quadrant": "topLeft | topRight | bottomLeft | bottomRight",
      "box_2d": [ymin, xmin, ymax, xmax]
    }
  ],
  "quadrantAnalysis": {
    "topLeft":     { "score": 0-100, "issues": ["lista de problemas"] },
    "topRight":    { "score": 0-100, "issues": ["lista de problemas"] },
    "bottomLeft":  { "score": 0-100, "issues": ["lista de problemas"] },
    "bottomRight": { "score": 0-100, "issues": ["lista de problemas"] }
  }
}
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'image is required' });

  const matches = image.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Formato de imagem inválido' });

  const imageBuffer = Buffer.from(matches[2], 'base64');

  try {
    // ── Etapa 1: Caracterização petrológica ──
    const { text: charText } = await generateText({
      model: openai('o3'),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_CHARACTERIZE },
          { type: 'image', image: imageBuffer },
        ],
      }],
    });

    const charJson = JSON.parse(charText.match(/\{[\s\S]*\}/)![0]);

    // ── Etapa 2: Inspeção técnica por quadrante ──
    const { text: inspText } = await generateText({
      model: openai('o3'),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildInspectionPrompt(JSON.stringify(charJson, null, 2)) },
          { type: 'image', image: imageBuffer },
        ],
      }],
    });

    const inspJson = JSON.parse(inspText.match(/\{[\s\S]*\}/)![0]);

    res.status(200).json({ ...charJson, ...inspJson });
  } catch (error: any) {
    console.error('Erro análise:', error);
    res.status(500).json({ error: error.message || 'Erro na análise' });
  }
}
