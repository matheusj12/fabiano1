export interface Piece {
  id: number;
  w: number | '';
  h: number | '';
  status?: 'ok' | 'fail' | 'warn';
  fits?: boolean;
  fitsRotated?: boolean;
  px?: number;
  py?: number;
  pw?: number;
  ph?: number;
  placed?: boolean;
}

export interface Stone {
  w: number | '';
  h: number | '';
}

export interface StoneImperfection {
  id: number;
  type: 'lasca' | 'furo' | 'recorte' | 'rachadura' | 'fissura' | 'mancha' | 'outro';
  label: string;
  /** posição relativa à chapa: 0-1 */
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  severity?: 'crítico' | 'moderado' | 'leve';
  source: 'ai' | 'manual';
}
