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
