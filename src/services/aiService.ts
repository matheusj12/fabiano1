export interface AIDetection {
  type: 'rachadura' | 'fissura' | 'lasca' | 'mancha' | 'outro';
  description: string;
  box_2d: [number, number, number, number];
}

export interface AIAnalysisResult {
  summary: string;
  imperfections: string[];
  qualityScore: number;
  detections: AIDetection[];
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
