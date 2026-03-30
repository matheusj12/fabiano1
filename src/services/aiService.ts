export interface AIDetection {
  type: 'rachadura' | 'fissura' | 'lasca' | 'mancha' | 'poro' | 'eflorescência' | 'irregularidade' | 'outro';
  severity: 'crítico' | 'moderado' | 'leve';
  description: string;
  quadrant: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  box_2d: [number, number, number, number];
}

export interface QuadrantResult {
  score: number;
  issues: string[];
}

export interface AIAnalysisResult {
  // Etapa 1 — Caracterização
  stoneType: string;
  finish: string;
  color: string;
  veinPattern: string;
  estimatedThickness: string;
  commercialGrade: 'A' | 'B' | 'C' | 'Descarte';
  colorUniformity: number;
  // Etapa 2 — Inspeção
  summary: string;
  qualityScore: number;
  structuralIntegrity: number;
  imperfections: string[];
  recommendations: string[];
  detections: AIDetection[];
  quadrantAnalysis: {
    topLeft: QuadrantResult;
    topRight: QuadrantResult;
    bottomLeft: QuadrantResult;
    bottomRight: QuadrantResult;
  };
}

export async function analyzeStoneImage(base64Image: string): Promise<AIAnalysisResult> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Não foi possível completar a análise da pedra.');
  }

  return res.json();
}
