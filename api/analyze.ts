import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

// ─── ETAPA 0: Localização da chapa ──────────────────────────────────────────
const PROMPT_LOCATE = `
Localize a chapa de pedra natural nesta imagem e retorne APENAS um JSON:
{
  "stoneBbox": [ymin, xmin, ymax, xmax],
  "confidence": 0-100
}

stoneBbox usa coordenadas 0-1000 (relativas ao tamanho da imagem).
Delimite apenas a chapa de pedra — ignore parede, piso, metal, madeira e fundo.
Se não houver chapa, use [0, 0, 1000, 1000].
`;

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
const buildInspectionPrompt = (char: string, stoneBbox: number[]) => `
Você é um inspetor de qualidade sênior especializado em chapas de pedra natural para marmoraria.

CARACTERIZAÇÃO JÁ REALIZADA:
${char}

DELIMITAÇÃO DA CHAPA (coordenadas 0-1000):
A chapa de pedra ocupa a região: ymin=${stoneBbox[0]}, xmin=${stoneBbox[1]}, ymax=${stoneBbox[2]}, xmax=${stoneBbox[3]}

⚠️ REGRA ABSOLUTA: Inspecione SOMENTE o interior da chapa de pedra.
IGNORE completamente: parede, piso, fundo, metal, madeira, pessoas, sombras, reflexos no chão.
Qualquer box_2d fora da região da chapa é PROIBIDO.

Divida a chapa em 4 quadrantes RELATIVOS à sua área:
• Superior esquerdo  — metade esquerda, metade superior da chapa
• Superior direito   — metade direita, metade superior da chapa
• Inferior esquerdo  — metade esquerda, metade inferior da chapa
• Inferior direito   — metade direita, metade inferior da chapa

Para cada quadrante, identifique TODOS os defeitos DENTRO DA PEDRA:
- Rachaduras (fraturas estruturais profundas)
- Fissuras (micro-trincas superficiais)
- Lascas (fragmento de material removido: identifique o PONTO EXATO onde o material foi arrancado, não a borda inteira da chapa)
- Manchas (oxidação, contaminação, umidade)
- Poros (cavidades naturais ou artificiais)
- Eflorescências (depósitos minerais brancos)
- Irregularidades de superfície (ondulações, marcas de serragem)

REGRAS CRÍTICAS DE BOUNDING BOX [ymin, xmin, ymax, xmax] — valores 0-1000:
• TODAS as boxes devem estar DENTRO da região da chapa (ymin=${stoneBbox[0]}–${stoneBbox[2]}, xmin=${stoneBbox[1]}–${stoneBbox[3]}).
• A box deve abraçar APENAS a área afetada, NÃO o entorno.
• Para LASCA: delimite somente a região onde o material foi removido. Box PEQUENA e PRECISA.
• Para RACHADURA / FISSURA: siga o traçado linear; box estreita e alongada.
• Para MANCHA: cubra apenas a área descolorada, não ultrapasse as bordas da mancha.
• Para PORO / EFLORESCÊNCIA: box minúscula centrada no defeito pontual.
• Máximo de sobreposição entre boxes do mesmo tipo: 20%.

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
    // ── Etapa 0: Localizar a chapa na imagem ──
    const { text: locateText } = await generateText({
      model: openai('gpt-4o'),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_LOCATE },
          { type: 'image', image: imageBuffer },
        ],
      }],
    });
    const locateJson = JSON.parse(locateText.match(/\{[\s\S]*\}/)![0]);
    const stoneBbox: number[] = locateJson.stoneBbox ?? [0, 0, 1000, 1000];

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
          { type: 'text', text: buildInspectionPrompt(JSON.stringify(charJson, null, 2), stoneBbox) },
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
