import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, CheckCircle2, XCircle, AlertCircle, Sparkles, BrainCircuit } from 'lucide-react';
import { Piece, Stone, StoneImperfection } from '../types';
import { AIAnalysisResult } from '../services/aiService';

interface CalculatorPageProps {
  inspectionData: {
    image: string | null;
    analysis: AIAnalysisResult | null;
    imperfections: StoneImperfection[];
  };
}

const IMP_COLORS: Record<string, string> = {
  lasca:     '#e67e22',
  furo:      '#3498db',
  recorte:   '#9b59b6',
  rachadura: '#e74c3c',
  fissura:   '#e74c3c',
  mancha:    '#795548',
  outro:     '#95a5a6',
};

const IMP_LABELS: Record<string, string> = {
  lasca: 'Lasca', furo: 'Furo', recorte: 'Recorte',
  rachadura: 'Rachadura', fissura: 'Fissura', mancha: 'Mancha', outro: 'Outro',
};

export default function CalculatorPage({ inspectionData }: CalculatorPageProps) {
  const [stone,   setStone]   = useState<Stone>({ w: '', h: '' });
  const [pieces,  setPieces]  = useState<Piece[]>([]);
  const [summary, setSummary] = useState({ total: 0, ok: 0, fail: 0 });
  const [usage,   setUsage]   = useState(0);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const stoneImgRef  = useRef<HTMLImageElement | null>(null);

  // Pre-load stone image
  useEffect(() => {
    if (inspectionData.image) {
      const img  = new Image();
      img.onload = () => { stoneImgRef.current = img; recalc(); };
      img.src    = inspectionData.image;
    } else {
      stoneImgRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionData.image]);

  const addPiece    = () => setPieces(p => [...p, { id: Date.now(), w: '', h: '' }]);
  const removePiece = (id: number) => setPieces(p => p.filter(x => x.id !== id));
  const updatePiece = (id: number, field: 'w' | 'h', value: string) => {
    const num = parseFloat(value) || '';
    setPieces(p => p.map(x => x.id === id ? { ...x, [field]: num } : x));
  };
  const updateStone = (field: 'w' | 'h', value: string) => {
    const num = parseFloat(value) || '';
    setStone(p => ({ ...p, [field]: num }));
  };

  const drawPreview = useCallback((
    currentPieces: Piece[],
    sw: number, sh: number,
    stoneOk: boolean,
    imps: StoneImperfection[],
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const CW  = canvas.width;
    const CH  = canvas.height;
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CW, CH);

    if (!stoneOk) {
      ctx.fillStyle = '#555';
      ctx.font = '14px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText('Informe as dimensões da pedra para visualizar', CW / 2, CH / 2);
      setUsage(0);
      return;
    }

    const pad  = 32;
    const scale = Math.min((CW - pad * 2) / sw, (CH - pad * 2) / sh);
    const dw   = sw * scale;
    const dh   = sh * scale;
    const ox   = (CW - dw) / 2;
    const oy   = (CH - dh) / 2;

    // ── Stone background: foto ou cor ─────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    // @ts-ignore
    if (ctx.roundRect) ctx.roundRect(ox, oy, dw, dh, 4); else ctx.rect(ox, oy, dw, dh);
    ctx.clip();
    if (stoneImgRef.current) {
      ctx.drawImage(stoneImgRef.current, ox, oy, dw, dh);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(ox, oy, dw, dh);
    } else {
      ctx.fillStyle = '#2a2218';
      ctx.fillRect(ox, oy, dw, dh);
    }
    ctx.restore();

    // stone border
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    // @ts-ignore
    if (ctx.roundRect) ctx.roundRect(ox, oy, dw, dh, 4); else ctx.rect(ox, oy, dw, dh);
    ctx.stroke();

    // label
    ctx.fillStyle = '#c9a84c';
    ctx.font      = 'bold 11px Segoe UI';
    ctx.textAlign = 'left';
    ctx.fillText(`${sw} × ${sh} cm`, ox + 6, oy + 15);

    // ── Grid ───────────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(201,168,76,0.15)';
    ctx.lineWidth   = 0.5;
    const gridStep  = Math.max(10, Math.round(Math.min(sw, sh) / 8));
    for (let x = 0; x <= sw; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(ox + x * scale, oy);
      ctx.lineTo(ox + x * scale, oy + dh);
      ctx.stroke();
    }
    for (let y = 0; y <= sh; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + y * scale);
      ctx.lineTo(ox + dw, oy + y * scale);
      ctx.stroke();
    }

    // ── Imperfections ──────────────────────────────────────────────────────
    imps.forEach(imp => {
      const color = IMP_COLORS[imp.type] || '#95a5a6';
      const ix = ox + imp.rx * dw;
      const iy = oy + imp.ry * dh;
      const iw = Math.max(imp.rw * dw, 10);
      const ih = Math.max(imp.rh * dh, 10);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle   = color + '55';
      ctx.lineWidth   = imp.source === 'manual' ? 1.5 : 2;

      if (imp.type === 'furo') {
        const r = Math.min(iw, ih) / 2;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(ix + iw / 2, iy + ih / 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        // inner circle
        ctx.fillStyle = color + 'aa';
        ctx.beginPath();
        ctx.arc(ix + iw / 2, iy + ih / 2, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (imp.type === 'recorte') {
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(ix, iy, iw, ih);
        ctx.fillRect(ix, iy, iw, ih);
        ctx.setLineDash([]);
      } else {
        ctx.beginPath();
        ctx.ellipse(ix + iw / 2, iy + ih / 2, iw / 2, ih / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // label
      if (iw > 18 || ih > 12) {
        ctx.fillStyle = color;
        ctx.font      = 'bold 8px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(
          (IMP_LABELS[imp.type] || imp.type).toUpperCase(),
          ix + iw / 2,
          iy - 3,
        );
      }
      ctx.restore();
    });

    // ── Pieces (shelf packing) ─────────────────────────────────────────────
    const valid = currentPieces.filter(p => typeof p.w === 'number' && typeof p.h === 'number');
    let curX = 0, curY = 0, rowH = 0;
    const placed: Piece[] = [];

    valid.forEach(p => {
      let pw = p.w as number;
      let ph = p.h as number;
      if (pw > sw && ph <= sw) [pw, ph] = [ph, pw];
      if (ph > sh && pw <= sh) [pw, ph] = [ph, pw];
      if (pw > sw || ph > sh) { placed.push({ ...p, placed: false }); return; }
      if (curX + pw > sw) { curX = 0; curY += rowH; rowH = 0; }
      if (curY + ph > sh) { placed.push({ ...p, placed: false }); return; }
      placed.push({ ...p, px: curX, py: curY, pw, ph, placed: true });
      rowH = Math.max(rowH, ph);
      curX += pw;
    });

    let placedArea = 0;
    placed.forEach((p, i) => {
      if (!p.placed) {
        const bx = ox + 4 + (i % 4) * (dw / 4);
        const by = oy + dh - 28;
        ctx.fillStyle   = 'rgba(192,57,43,0.3)';
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        // @ts-ignore
        if (ctx.roundRect) ctx.roundRect(bx, by, dw / 4 - 4, 22, 3); else ctx.rect(bx, by, dw / 4 - 4, 22);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle   = '#e74c3c';
        ctx.font        = '10px Segoe UI';
        ctx.textAlign   = 'center';
        ctx.fillText(`${p.w}×${p.h}`, bx + dw / 8, by + 14);
        return;
      }

      placedArea += (p.pw || 0) * (p.ph || 0);
      const rx = ox + (p.px || 0) * scale;
      const ry = oy + (p.py || 0) * scale;
      const rw = (p.pw || 0) * scale - 2;
      const rh = (p.ph || 0) * scale - 2;

      ctx.fillStyle   = 'rgba(39,174,96,0.35)';
      ctx.strokeStyle = '#27ae60';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      // @ts-ignore
      if (ctx.roundRect) ctx.roundRect(rx + 1, ry + 1, rw, rh, 3); else ctx.rect(rx + 1, ry + 1, rw, rh);
      ctx.fill(); ctx.stroke();

      if (rw > 40 && rh > 18) {
        ctx.fillStyle   = '#2ecc71';
        ctx.font        = `bold ${Math.min(12, rw / 5)}px Segoe UI`;
        ctx.textAlign   = 'center';
        ctx.fillText(`${p.w}×${p.h}`, rx + rw / 2 + 1, ry + rh / 2 + 4 + 1);
      }
    });

    const pct = sw * sh > 0 ? Math.round((placedArea / (sw * sh)) * 100) : 0;
    setUsage(pct);
  }, []);

  const recalc = useCallback(() => {
    const sw = typeof stone.w === 'number' ? stone.w : 0;
    const sh = typeof stone.h === 'number' ? stone.h : 0;
    const stoneOk = sw > 0 && sh > 0;

    let okCount = 0, failCount = 0;
    const updatedPieces = pieces.map(p => {
      const pw = typeof p.w === 'number' ? p.w : 0;
      const ph = typeof p.h === 'number' ? p.h : 0;
      if (!pw || !ph) return { ...p, status: undefined };
      const fits  = stoneOk && (pw <= sw && ph <= sh);
      const fitsR = stoneOk && (ph <= sw && pw <= sh);
      if (!stoneOk) return { ...p, status: 'warn' as const };
      if (fits || fitsR) { okCount++;   return { ...p, status: 'ok'   as const }; }
      else               { failCount++; return { ...p, status: 'fail' as const }; }
    });

    setSummary({ total: pieces.filter(p => typeof p.w === 'number' && typeof p.h === 'number').length, ok: okCount, fail: failCount });
    drawPreview(updatedPieces, sw, sh, stoneOk, inspectionData.imperfections || []);
  }, [stone, pieces, inspectionData.imperfections, drawPreview]);

  useEffect(() => { recalc(); }, [recalc]);

  // distinct imperfection types for legend
  const impTypes = [...new Set((inspectionData.imperfections || []).map(i => i.type))];

  return (
    <div className="p-5 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">

      {/* LEFT PANEL */}
      <div className="flex flex-col gap-4">

        {/* Inspection Reference */}
        {inspectionData.image && (
          <div className="bg-[#1e1e1e] border border-[#333] rounded-xl p-4">
            <div className="flex items-center gap-2 text-[#c9a84c] mb-3">
              <Sparkles className="w-4 h-4" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">Referência da Inspeção</h2>
            </div>
            <div className="relative rounded-lg overflow-hidden border border-[#333] bg-black aspect-video flex items-center justify-center">
              <img src={inspectionData.image} alt="Pedra" className="max-w-full max-h-full object-contain" />
            </div>
            {inspectionData.analysis && (
              <div className="mt-3 p-2 bg-[#252525] rounded border border-[#333]">
                <div className="flex items-center gap-1.5 text-[9px] text-[#888] uppercase mb-1">
                  <BrainCircuit className="w-3 h-3" /> Qualidade:
                  <span className="text-[#c9a84c]">{inspectionData.analysis.qualityScore}%</span>
                </div>
                <p className="text-[10px] text-[#aaa] line-clamp-2 italic leading-tight">
                  "{inspectionData.analysis.summary}"
                </p>
              </div>
            )}
            {inspectionData.imperfections?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {inspectionData.imperfections.map(imp => (
                  <span key={imp.id} className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                    style={{ backgroundColor: (IMP_COLORS[imp.type] || '#888') + '33', color: IMP_COLORS[imp.type] || '#888', border: `1px solid ${IMP_COLORS[imp.type] || '#888'}55` }}>
                    {IMP_LABELS[imp.type] || imp.type}
                    {imp.source === 'manual' ? ' ✎' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stone dimensions */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#c9a84c] mb-4 tracking-wider uppercase">📏 Dimensões da Pedra (cm)</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {(['w','h'] as const).map(field => (
              <div key={field} className="flex flex-col gap-1">
                <label className="text-[10px] text-[#888] uppercase">{field === 'w' ? 'Comprimento' : 'Largura'}</label>
                <input type="number" value={stone[field]}
                  onChange={e => updateStone(field, e.target.value)}
                  placeholder={field === 'w' ? 'ex: 280' : 'ex: 160'}
                  className="w-full p-2.5 bg-[#2a2a2a] border border-[#444] rounded-lg text-[#f0ede8] text-sm outline-none focus:border-[#c9a84c] transition-all"
                />
              </div>
            ))}
          </div>
          <div className={`inline-block px-3 py-1 rounded-md text-xs font-medium border ${typeof stone.w === 'number' && typeof stone.h === 'number' ? 'bg-[#1a3d2a] text-[#2ecc71] border-[#27ae60]' : 'bg-[#222] text-[#888] border-[#333]'}`}>
            {typeof stone.w === 'number' && typeof stone.h === 'number'
              ? `Pedra: ${stone.w} × ${stone.h} cm (${((stone.w * stone.h) / 10000).toFixed(2)} m²)`
              : 'Informe as dimensões da pedra'}
          </div>
        </div>

        {/* Pieces */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#c9a84c] mb-4 tracking-wider uppercase">🪨 Peças a Cortar</h2>
          <div className="flex flex-col gap-2 mb-4 max-h-[280px] overflow-y-auto pr-1">
            {pieces.length === 0
              ? <div className="text-center text-[#555] text-sm py-4">Nenhuma peça adicionada</div>
              : pieces.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-2 bg-[#252525] border rounded-lg p-2 transition-all ${p.status === 'ok' ? 'border-[#27ae60]' : p.status === 'fail' ? 'border-[#c0392b]' : 'border-[#333]'}`}>
                  <span className="text-[10px] text-[#888] min-w-[20px]">{i + 1}.</span>
                  <div className="flex items-center gap-1.5 flex-1">
                    {(['w','h'] as const).map((field, fi) => (
                      <React.Fragment key={field}>
                        {fi > 0 && <span className="text-[#666]">×</span>}
                        <input type="number" value={p[field]}
                          onChange={e => updatePiece(p.id, field, e.target.value)}
                          placeholder={field === 'w' ? 'Comp.' : 'Larg.'}
                          className="w-16 p-1.5 bg-[#1e1e1e] border border-[#444] rounded text-[#f0ede8] text-xs outline-none focus:border-[#c9a84c]"
                        />
                      </React.Fragment>
                    ))}
                    <span className="text-[10px] text-[#666]">cm</span>
                  </div>
                  <div className="min-w-[24px] flex justify-center">
                    {p.status === 'ok'   && <CheckCircle2  className="w-4 h-4 text-[#2ecc71]" />}
                    {p.status === 'fail' && <XCircle       className="w-4 h-4 text-[#e74c3c]" />}
                    {p.status === 'warn' && <AlertCircle   className="w-4 h-4 text-[#f1c40f]" />}
                  </div>
                  <button onClick={() => removePiece(p.id)} className="text-[#555] hover:text-[#e74c3c] transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            }
          </div>

          <button onClick={addPiece}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2a2a2a] text-[#f0ede8] border border-[#444] rounded-lg hover:bg-[#333] transition-all text-sm font-medium">
            <Plus className="w-4 h-4" /> Adicionar peça
          </button>

          {summary.total > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                { label: 'Total', value: summary.total, color: '#c9a84c' },
                { label: 'Cabem', value: summary.ok,    color: '#2ecc71' },
                { label: 'Não cabem', value: summary.fail, color: '#e74c3c' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[#252525] rounded-lg p-2 text-center">
                  <div className="text-lg font-bold" style={{ color }}>{value}</div>
                  <div className="text-[9px] text-[#888] uppercase">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — canvas */}
      <div className="bg-[#1e1e1e] border border-[#333] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[#c9a84c] mb-4 tracking-wider uppercase">🗺️ Visualização do Aproveitamento</h2>
        <canvas ref={canvasRef} width={700} height={480}
          className="w-full h-auto bg-black border border-[#333] rounded-lg block" />

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-[#888] uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#27ae60] rounded-sm opacity-70" /> Peça posicionada
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#c0392b] rounded-sm opacity-70" /> Não cabe
          </div>
          {impTypes.map(type => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm opacity-70" style={{ backgroundColor: IMP_COLORS[type] || '#888' }} />
              {IMP_LABELS[type] || type}
            </div>
          ))}
        </div>

        {summary.total > 0 && (
          <div className="mt-4">
            <div className="flex justify-between items-end mb-1.5">
              <span className="text-[10px] text-[#888] uppercase">Aproveitamento</span>
              <span className="text-sm font-bold text-[#c9a84c]">{usage}%</span>
            </div>
            <div className="h-2 bg-[#333] rounded-full overflow-hidden">
              <div className="h-full transition-all duration-500 rounded-full"
                style={{
                  width: `${usage}%`,
                  backgroundColor: usage > 80 ? '#c0392b' : usage > 50 ? '#c9a84c' : '#27ae60',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
