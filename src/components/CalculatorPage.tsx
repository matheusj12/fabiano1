import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, CheckCircle2, XCircle, AlertCircle, Sparkles, BrainCircuit } from 'lucide-react';
import { Piece, Stone } from '../types';
import { AIAnalysisResult } from '../services/aiService';

interface CalculatorPageProps {
  inspectionData: {
    image: string | null;
    analysis: AIAnalysisResult | null;
  };
}

export default function CalculatorPage({ inspectionData }: CalculatorPageProps) {
  const [stone, setStone] = useState<Stone>({ w: '', h: '' });
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [summary, setSummary] = useState({ total: 0, ok: 0, fail: 0 });
  const [usage, setUsage] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const addPiece = () => {
    setPieces((prev) => [...prev, { id: Date.now(), w: '', h: '' }]);
  };

  const removePiece = (id: number) => {
    setPieces((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePiece = (id: number, field: 'w' | 'h', value: string) => {
    const num = parseFloat(value) || '';
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: num } : p))
    );
  };

  const updateStone = (field: 'w' | 'h', value: string) => {
    const num = parseFloat(value) || '';
    setStone((prev) => ({ ...prev, [field]: num }));
  };

  const recalc = () => {
    const sw = typeof stone.w === 'number' ? stone.w : 0;
    const sh = typeof stone.h === 'number' ? stone.h : 0;
    const stoneOk = sw > 0 && sh > 0;

    let totalArea = 0;
    let okCount = 0;
    let failCount = 0;

    const updatedPieces = pieces.map((p) => {
      const pw = typeof p.w === 'number' ? p.w : 0;
      const ph = typeof p.h === 'number' ? p.h : 0;
      const hasSize = pw > 0 && ph > 0;

      if (!hasSize) return { ...p, status: undefined };

      totalArea += pw * ph;

      const fitsStraight = stoneOk && pw <= sw && ph <= sh;
      const fitsRotated = stoneOk && ph <= sw && pw <= sh;
      const fits = fitsStraight || fitsRotated;

      if (!stoneOk) {
        return { ...p, status: 'warn' as const, fits: false, fitsRotated: false };
      } else if (fits) {
        okCount++;
        return { ...p, status: 'ok' as const, fits: true, fitsRotated: !fitsStraight && fitsRotated };
      } else {
        failCount++;
        return { ...p, status: 'fail' as const, fits: false, fitsRotated: false };
      }
    });

    setSummary({ total: pieces.filter(p => typeof p.w === 'number' && typeof p.h === 'number').length, ok: okCount, fail: failCount });
    drawPreview(updatedPieces, sw, sh, stoneOk);
  };

  const drawPreview = (currentPieces: Piece[], sw: number, sh: number, stoneOk: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const CW = canvas.width;
    const CH = canvas.height;
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

    const pad = 32;
    const scale = Math.min((CW - pad * 2) / sw, (CH - pad * 2) / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const ox = (CW - dw) / 2;
    const oy = (CH - dh) / 2;

    // Stone background
    ctx.fillStyle = '#2a2218';
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // @ts-ignore
    if (ctx.roundRect) ctx.roundRect(ox, oy, dw, dh, 4);
    else ctx.rect(ox, oy, dw, dh);
    ctx.fill();
    ctx.stroke();

    // Stone label
    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 11px Segoe UI';
    ctx.textAlign = 'left';
    ctx.fillText(`${sw} × ${sh} cm`, ox + 6, oy + 15);

    // Grid
    ctx.strokeStyle = 'rgba(201,168,76,0.1)';
    ctx.lineWidth = 0.5;
    const gridStep = Math.max(10, Math.round(Math.min(sw, sh) / 8));
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

    // Pack pieces (simple shelf packing)
    const validPieces = currentPieces.filter((p) => typeof p.w === 'number' && typeof p.h === 'number');
    let curX = 0;
    let curY = 0;
    let rowH = 0;
    const placed: Piece[] = [];

    validPieces.forEach((p) => {
      let pw = p.w as number;
      let ph = p.h as number;

      // Try rotation if needed
      if (pw > sw && ph <= sw) [pw, ph] = [ph, pw];
      if (ph > sh && pw <= sh) [pw, ph] = [ph, pw];
      if (pw > sw || ph > sh) {
        placed.push({ ...p, placed: false });
        return;
      }

      if (curX + pw > sw) {
        curX = 0;
        curY += rowH;
        rowH = 0;
      }

      if (curY + ph > sh) {
        placed.push({ ...p, placed: false });
        return;
      }

      placed.push({ ...p, px: curX, py: curY, pw, ph, placed: true });
      rowH = Math.max(rowH, ph);
      curX += pw;
    });

    let placedArea = 0;
    placed.forEach((p, i) => {
      if (!p.placed) {
        const bx = ox + 4 + (i % 4) * (dw / 4);
        const by = oy + dh - 28;
        ctx.fillStyle = 'rgba(192,57,43,0.3)';
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // @ts-ignore
        if (ctx.roundRect) ctx.roundRect(bx, by, dw / 4 - 4, 22, 3);
        else ctx.rect(bx, by, dw / 4 - 4, 22);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e74c3c';
        ctx.font = '10px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(`${p.w}×${p.h}`, bx + dw / 8, by + 14);
        return;
      }

      placedArea += (p.pw || 0) * (p.ph || 0);
      const rx = ox + (p.px || 0) * scale;
      const ry = oy + (p.py || 0) * scale;
      const rw = (p.pw || 0) * scale - 2;
      const rh = (p.ph || 0) * scale - 2;

      ctx.fillStyle = 'rgba(39,174,96,0.25)';
      ctx.strokeStyle = '#27ae60';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // @ts-ignore
      if (ctx.roundRect) ctx.roundRect(rx + 1, ry + 1, rw, rh, 3);
      else ctx.rect(rx + 1, ry + 1, rw, rh);
      ctx.fill();
      ctx.stroke();

      if (rw > 40 && rh > 18) {
        ctx.fillStyle = '#2ecc71';
        ctx.font = `bold ${Math.min(12, rw / 5)}px Segoe UI`;
        ctx.textAlign = 'center';
        ctx.fillText(`${p.w}×${p.h}`, rx + rw / 2 + 1, ry + rh / 2 + 4 + 1);
      }
    });

    const stoneArea = sw * sh;
    const pct = stoneArea > 0 ? Math.round((placedArea / stoneArea) * 100) : 0;
    setUsage(pct);
  };

  useEffect(() => {
    recalc();
  }, [stone, pieces]);

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
              <img src={inspectionData.image} alt="Inspected Stone" className="max-w-full max-h-full object-contain" />
            </div>
            {inspectionData.analysis && (
              <div className="mt-3 p-2 bg-[#252525] rounded border border-[#333]">
                <div className="flex items-center gap-1.5 text-[9px] text-[#888] uppercase mb-1">
                  <BrainCircuit className="w-3 h-3" /> Qualidade: <span className="text-[#c9a84c]">{inspectionData.analysis.qualityScore}%</span>
                </div>
                <p className="text-[10px] text-[#aaa] line-clamp-2 italic leading-tight">
                  "{inspectionData.analysis.summary}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* Stone dimensions */}
        <div className="bg-[#1e1e1e] border border-[#333] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#c9a84c] mb-4 tracking-wider uppercase">📏 Dimensões da Pedra (cm)</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#888] uppercase">Comprimento</label>
              <input
                type="number"
                value={stone.w}
                onChange={(e) => updateStone('w', e.target.value)}
                placeholder="ex: 280"
                className="w-full p-2.5 bg-[#2a2a2a] border border-[#444] rounded-lg text-[#f0ede8] text-sm outline-none focus:border-[#c9a84c] transition-all"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#888] uppercase">Largura</label>
              <input
                type="number"
                value={stone.h}
                onChange={(e) => updateStone('h', e.target.value)}
                placeholder="ex: 160"
                className="w-full p-2.5 bg-[#2a2a2a] border border-[#444] rounded-lg text-[#f0ede8] text-sm outline-none focus:border-[#c9a84c] transition-all"
              />
            </div>
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
          <div className="flex flex-col gap-2 mb-4 max-h-[300px] overflow-y-auto pr-1">
            {pieces.length === 0 ? (
              <div className="text-center text-[#555] text-sm py-4">Nenhuma peça adicionada</div>
            ) : (
              pieces.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 bg-[#252525] border rounded-lg p-2 transition-all ${p.status === 'ok' ? 'border-[#27ae60]' : p.status === 'fail' ? 'border-[#c0392b]' : p.status === 'warn' ? 'border-[#333]' : 'border-[#333]'}`}
                >
                  <span className="text-[10px] text-[#888] min-w-[20px]">{i + 1}.</span>
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="number"
                      value={p.w}
                      onChange={(e) => updatePiece(p.id, 'w', e.target.value)}
                      placeholder="Comp."
                      className="w-16 p-1.5 bg-[#1e1e1e] border border-[#444] rounded text-[#f0ede8] text-xs outline-none focus:border-[#c9a84c]"
                    />
                    <span className="text-[#666]">×</span>
                    <input
                      type="number"
                      value={p.h}
                      onChange={(e) => updatePiece(p.id, 'h', e.target.value)}
                      placeholder="Larg."
                      className="w-16 p-1.5 bg-[#1e1e1e] border border-[#444] rounded text-[#f0ede8] text-xs outline-none focus:border-[#c9a84c]"
                    />
                    <span className="text-[10px] text-[#666]">cm</span>
                  </div>
                  <div className="min-w-[24px] flex justify-center">
                    {p.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-[#2ecc71]" />}
                    {p.status === 'fail' && <XCircle className="w-4 h-4 text-[#e74c3c]" />}
                    {p.status === 'warn' && <AlertCircle className="w-4 h-4 text-[#f1c40f]" />}
                  </div>
                  <button onClick={() => removePiece(p.id)} className="text-[#555] hover:text-[#e74c3c] transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
          <button
            onClick={addPiece}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2a2a2a] text-[#f0ede8] border border-[#444] rounded-lg hover:bg-[#333] transition-all text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Adicionar peça
          </button>

          {summary.total > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-[#252525] rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-[#c9a84c]">{summary.total}</div>
                <div className="text-[9px] text-[#888] uppercase">Total</div>
              </div>
              <div className="bg-[#252525] rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-[#2ecc71]">{summary.ok}</div>
                <div className="text-[9px] text-[#888] uppercase">Cabem</div>
              </div>
              <div className="bg-[#252525] rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-[#e74c3c]">{summary.fail}</div>
                <div className="text-[9px] text-[#888] uppercase">Não cabem</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="bg-[#1e1e1e] border border-[#333] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[#c9a84c] mb-4 tracking-wider uppercase">🗺️ Visualização do Aproveitamento</h2>
        <canvas ref={canvasRef} width={600} height={400} className="w-full h-auto bg-black border border-[#333] rounded-lg block" />
        
        {summary.total > 0 && (
          <>
            <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-[#888] uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-[#27ae60] rounded-sm" /> Peça que cabe
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-[#c0392b] rounded-sm" /> Peça que não cabe
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-[#c9a84c] rounded-sm" /> Pedra disponível
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[10px] text-[#888] uppercase">Aproveitamento</span>
                <span className="text-sm font-bold text-[#c9a84c]">{usage}%</span>
              </div>
              <div className="h-2 bg-[#333] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 rounded-full"
                  style={{
                    width: `${usage}%`,
                    backgroundColor: usage > 80 ? '#c0392b' : usage > 50 ? '#c9a84c' : '#27ae60'
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
