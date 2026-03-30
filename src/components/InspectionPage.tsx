import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Pencil, Eraser, RotateCcw, Trash2, Download, Camera,
  BrainCircuit, Loader2, Sparkles, AlertTriangle, CheckCircle, ArrowRight,
} from 'lucide-react';
import { analyzeStoneImage, AIAnalysisResult } from '../services/aiService';
import { StoneImperfection } from '../types';

type Tool = 'pen' | 'eraser' | 'furo' | 'recorte' | 'lasca';

interface InspectionPageProps {
  onNext: (image: string, analysis: AIAnalysisResult | null, imperfections: StoneImperfection[]) => void;
}

const MARK_COLORS: Record<string, string> = {
  furo:      '#3498db',
  recorte:   '#9b59b6',
  lasca:     '#e67e22',
  rachadura: '#e74c3c',
  fissura:   '#e74c3c',
  mancha:    '#795548',
  outro:     '#95a5a6',
};

export default function InspectionPage({ onNext }: InspectionPageProps) {
  const [tool, setTool] = useState<Tool>('pen');
  const [brushSize, setBrushSize] = useState(4);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [imageName, setImageName] = useState('Nenhuma imagem carregada');

  // marcações manuais estruturadas
  const [manualMarks, setManualMarks] = useState<StoneImperfection[]>([]);
  // bbox da pedra retornado pela API (0-1000)
  const [stoneBbox, setStoneBbox] = useState<[number,number,number,number]>([0,0,1000,1000]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const bgCanvasRef  = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef      = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paintingRef  = useRef(false);
  const lastPosRef   = useRef({ x: 0, y: 0 });

  const isPaintTool = tool === 'pen' || tool === 'eraser';

  // ── canvas utils ──────────────────────────────────────────────────────────
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }, []);

  const saveUndo = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setUndoStack(prev => [...prev.slice(-29), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  // ── drawing ───────────────────────────────────────────────────────────────
  const drawMarkShape = (
    ctx: CanvasRenderingContext2D,
    type: Tool | string,
    cx: number, cy: number, rw: number, rh: number,
  ) => {
    const color = MARK_COLORS[type] || '#e74c3c';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color + '44';
    ctx.lineWidth = 2;

    if (type === 'furo') {
      const r = Math.min(rw, rh) / 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      // inner X
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.4, cy - r * 0.4);
      ctx.lineTo(cx + r * 0.4, cy + r * 0.4);
      ctx.moveTo(cx + r * 0.4, cy - r * 0.4);
      ctx.lineTo(cx - r * 0.4, cy + r * 0.4);
      ctx.stroke();
    } else if (type === 'recorte') {
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
      ctx.fillRect(cx - rw / 2, cy - rh / 2, rw, rh);
      ctx.setLineDash([]);
    } else {
      // lasca / default oval
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // label
    ctx.fillStyle = color;
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(type.toUpperCase(), cx, cy - Math.max(rw, rh) / 2 - 4);
    ctx.restore();
  };

  const placeMark = useCallback((canvasX: number, canvasY: number) => {
    const canvas = drawCanvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    saveUndo();

    // pixel size on canvas for the mark
    const pw = canvas.width  * 0.06;
    const ph = canvas.height * 0.06;
    drawMarkShape(ctx, tool, canvasX, canvasY, pw, ph);

    // normalize to stone-relative (0-1)
    const [sby1, sbx1, sby2, sbx2] = stoneBbox;
    const sbW = sbx2 - sbx1 || 1000;
    const sbH = sby2 - sby1 || 1000;
    const imgX = (canvasX / canvas.width)  * 1000;
    const imgY = (canvasY / canvas.height) * 1000;
    const rw   = (pw / canvas.width  * 1000) / sbW;
    const rh   = (ph / canvas.height * 1000) / sbH;

    const mark: StoneImperfection = {
      id:     Date.now(),
      type:   tool as StoneImperfection['type'],
      label:  tool === 'furo' ? 'Furo' : tool === 'recorte' ? 'Recorte' : 'Lasca',
      rx:     Math.max(0, (imgX - sbx1) / sbW - rw / 2),
      ry:     Math.max(0, (imgY - sby1) / sbH - rh / 2),
      rw,
      rh,
      source: 'manual',
    };

    setManualMarks(prev => [...prev, mark]);
    setStrokeCount(prev => prev + 1);
  }, [tool, stoneBbox, saveUndo]);

  const startPaint = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!imageLoaded) return;
    const pos = getPos(e);

    if (!isPaintTool) {
      placeMark(pos.x, pos.y);
      return;
    }

    paintingRef.current = true;
    lastPosRef.current  = pos;
    saveUndo();

    const canvas = drawCanvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx) return;
    const r = tool === 'eraser' ? brushSize * 2.5 : brushSize;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r / 2, 0, Math.PI * 2);
    if (tool === 'pen') {
      ctx.fillStyle = 'rgba(220,50,50,0.92)';
      ctx.fill();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fill();
      ctx.restore();
    }
  }, [imageLoaded, tool, isPaintTool, brushSize, getPos, saveUndo, placeMark]);

  const paint = useCallback((e: MouseEvent | TouchEvent) => {
    if (!paintingRef.current || !imageLoaded || !isPaintTool) return;
    const pos    = getPos(e);
    const canvas = drawCanvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    if (tool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = 'rgba(220,50,50,0.92)';
      ctx.lineWidth   = brushSize;
      ctx.stroke();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.lineWidth   = brushSize * 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.stroke();
      ctx.restore();
    }
    lastPosRef.current = pos;
  }, [imageLoaded, isPaintTool, tool, brushSize, getPos]);

  const stopPaint = useCallback(() => {
    if (paintingRef.current) setStrokeCount(p => p + 1);
    paintingRef.current = false;
  }, []);

  const undo = () => {
    if (undoStack.length === 0) return;
    const canvas = drawCanvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
    setUndoStack(p => p.slice(0, -1));
    setStrokeCount(p => Math.max(0, p - 1));
  };

  const clearDrawing = () => {
    saveUndo();
    const canvas = drawCanvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeCount(0);
    setManualMarks([]);
  };

  // ── image load ────────────────────────────────────────────────────────────
  const loadStoneImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const maxW  = wrapRef.current?.offsetWidth || 700;
      const ratio = Math.min(maxW / img.width, 520 / img.height);
      const w     = Math.round(img.width  * ratio);
      const h     = Math.round(img.height * ratio);
      if (bgCanvasRef.current && drawCanvasRef.current) {
        bgCanvasRef.current.width = drawCanvasRef.current.width  = w;
        bgCanvasRef.current.height = drawCanvasRef.current.height = h;
        bgCanvasRef.current.getContext('2d')?.drawImage(img, 0, 0, w, h);
        drawCanvasRef.current.getContext('2d')?.clearRect(0, 0, w, h);
      }
      setUndoStack([]);
      setStrokeCount(0);
      setManualMarks([]);
      setImageLoaded(true);
      setImageName(file.name);
      setAiResult(null);
      setAiError(null);
      setStoneBbox([0, 0, 1000, 1000]);
    };
    img.src = URL.createObjectURL(file);
  };

  // ── merged image ──────────────────────────────────────────────────────────
  const getMergedImageData = () => {
    const bg   = bgCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!bg || !draw) return null;
    const m   = document.createElement('canvas');
    m.width   = bg.width;
    m.height  = bg.height;
    const ctx = m.getContext('2d')!;
    ctx.drawImage(bg,   0, 0);
    ctx.drawImage(draw, 0, 0);
    return m.toDataURL('image/png');
  };

  const saveImage = () => {
    const url = getMergedImageData();
    if (!url) return;
    const a = document.createElement('a');
    a.download = 'pedra_inspecionada.png';
    a.href = url;
    a.click();
  };

  // ── AI detections → canvas + StoneImperfection[] ─────────────────────────
  const drawAIDetections = useCallback((
    detections: AIAnalysisResult['detections'],
    bbox: [number,number,number,number],
  ): StoneImperfection[] => {
    const canvas = drawCanvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return [];

    saveUndo();
    const [sby1, sbx1, sby2, sbx2] = bbox;
    const sbW = sbx2 - sbx1 || 1000;
    const sbH = sby2 - sby1 || 1000;

    const imperfections: StoneImperfection[] = [];

    detections.forEach(det => {
      const [ymin, xmin, ymax, xmax] = det.box_2d;
      const cx = ((xmin + xmax) / 2 / 1000) * canvas.width;
      const cy = ((ymin + ymax) / 2 / 1000) * canvas.height;
      const pw = ((xmax - xmin) / 1000) * canvas.width;
      const ph = ((ymax - ymin) / 1000) * canvas.height;

      drawMarkShape(ctx, det.type, cx, cy, pw, ph);

      const rx = (xmin - sbx1) / sbW;
      const ry = (ymin - sby1) / sbH;
      const rw = (xmax - xmin) / sbW;
      const rh = (ymax - ymin) / sbH;

      imperfections.push({
        id:       Date.now() + Math.random(),
        type:     det.type as StoneImperfection['type'],
        label:    det.type,
        rx:       Math.max(0, rx),
        ry:       Math.max(0, ry),
        rw:       Math.max(0.01, rw),
        rh:       Math.max(0.01, rh),
        severity: det.severity,
        source:   'ai',
      });
    });

    setStrokeCount(p => p + detections.length);
    return imperfections;
  }, [saveUndo]);

  // ── AI Analysis ───────────────────────────────────────────────────────────
  const handleAIAnalysis = async () => {
    const bgCanvas = bgCanvasRef.current;
    if (!bgCanvas) return;

    setIsAnalyzing(true);
    setAiError(null);
    try {
      const base64 = bgCanvas.toDataURL('image/png');
      const result = await analyzeStoneImage(base64);
      setAiResult(result);

      const bbox: [number,number,number,number] = result.stoneBbox ?? [0,0,1000,1000];
      setStoneBbox(bbox);

      const aiImps = result.detections?.length
        ? drawAIDetections(result.detections, bbox)
        : [];

      setManualMarks(prev => [...prev.filter(m => m.source === 'manual'), ...aiImps]);

      fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          quality_score: result.qualityScore,
          summary: result.summary,
          imperfections: result.imperfections,
          detections: result.detections,
        }),
      }).catch(() => {});
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Erro desconhecido na análise.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Next step ─────────────────────────────────────────────────────────────
  const handleNext = () => {
    const dataUrl = getMergedImageData();
    if (!dataUrl) return;
    onNext(dataUrl, aiResult, manualMarks);
  };

  // ── global mouse events ───────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent)  => paint(e);
    const onUp   = ()               => stopPaint();
    const onTouch = (e: TouchEvent) => paint(e);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onTouch, { passive: false });
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('touchend',  onUp);
    };
  }, [paint, stopPaint]);

  // ── cursor class ──────────────────────────────────────────────────────────
  const cursorClass = tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair';

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-5 flex flex-col gap-4">

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-2 bg-[#1e1e1e] border border-[#333] rounded-xl p-3">

        {/* Draw tools */}
        <button
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all ${tool === 'pen' ? 'bg-[#c0392b] text-white' : 'bg-[#2a2a2a] text-[#f0ede8] border border-[#444] hover:bg-[#333]'}`}
          onClick={() => setTool('pen')}
        >
          <Pencil className="w-4 h-4" /> Rachadura
        </button>

        {/* Manual mark tools */}
        {([
          { key: 'furo',    label: 'Furo',    color: '#3498db' },
          { key: 'recorte', label: 'Recorte', color: '#9b59b6' },
          { key: 'lasca',   label: 'Lasca',   color: '#e67e22' },
        ] as const).map(({ key, label, color }) => (
          <button
            key={key}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all border ${
              tool === key
                ? 'text-white border-transparent'
                : 'bg-[#2a2a2a] text-[#f0ede8] border-[#444] hover:bg-[#333]'
            }`}
            style={tool === key ? { backgroundColor: color, borderColor: color } : {}}
            onClick={() => setTool(key)}
          >
            <span className="w-2.5 h-2.5 rounded-full border-2 shrink-0" style={{ borderColor: tool === key ? 'white' : color, backgroundColor: tool === key ? 'white' : 'transparent' }} />
            {label}
          </button>
        ))}

        <button
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all ${tool === 'eraser' ? 'bg-[#2980b9] text-white' : 'bg-[#2a2a2a] text-[#f0ede8] border border-[#444] hover:bg-[#333]'}`}
          onClick={() => setTool('eraser')}
        >
          <Eraser className="w-4 h-4" /> Borracha
        </button>

        <div className="w-px h-7 bg-[#333] mx-1" />

        <div className="flex items-center gap-2 text-sm text-[#aaa]">
          <span>Espessura</span>
          <input type="range" min="2" max="20" value={brushSize}
            onChange={e => setBrushSize(parseInt(e.target.value))}
            className="w-20 accent-[#c9a84c]" />
          <span className="w-8 text-center">{brushSize}px</span>
        </div>

        <div className="w-px h-7 bg-[#333] mx-1" />

        <button
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-[#2a2a2a] text-[#f0ede8] border border-[#444] hover:bg-[#333] disabled:opacity-35"
          onClick={undo} disabled={undoStack.length === 0}
        >
          <RotateCcw className="w-4 h-4" /> Desfazer
        </button>
        <button
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-[#2a2a2a] text-[#f0ede8] border border-[#444] hover:bg-[#333] disabled:opacity-35"
          onClick={clearDrawing} disabled={strokeCount === 0}
        >
          <Trash2 className="w-4 h-4" /> Limpar
        </button>

        <div className="flex-1" />

        <button
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#c9a84c] text-black font-bold hover:bg-[#b8973b] disabled:opacity-35 transition-all"
          onClick={handleAIAnalysis} disabled={!imageLoaded || isAnalyzing}
        >
          {isAnalyzing
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando...</>
            : <><BrainCircuit className="w-4 h-4" /> Análise Inteligente</>}
        </button>

        <button
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#27ae60] text-white hover:bg-[#219a52] disabled:opacity-35"
          onClick={saveImage} disabled={!imageLoaded}
        >
          <Download className="w-4 h-4" /> Salvar
        </button>
      </div>

      {/* MAIN AREA */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">

        {/* CANVAS */}
        <div
          ref={wrapRef}
          className={`relative bg-black border border-[#333] rounded-xl overflow-hidden min-h-[450px] flex items-center justify-center ${cursorClass}`}
          onClick={() => !imageLoaded && fileInputRef.current?.click()}
        >
          <canvas ref={bgCanvasRef}   className="absolute top-0 left-0" />
          <canvas ref={drawCanvasRef} className="absolute top-0 left-0 z-10"
            onMouseDown={startPaint}
            onTouchStart={startPaint}
          />
          {!imageLoaded && (
            <div className="relative z-20 flex flex-col items-center gap-3 pointer-events-none">
              <Camera className="w-12 h-12 opacity-30 text-white" />
              <div className="text-sm text-[#888]">Clique para carregar a foto da pedra</div>
              <button
                className="px-4 py-2 bg-[#2a2a2a] text-[#f0ede8] border border-[#444] rounded-lg pointer-events-auto hover:bg-[#333]"
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Escolher foto
              </button>
            </div>
          )}
        </div>

        {/* AI REPORT PANEL */}
        <div className="flex flex-col gap-4">
          <div className="bg-[#1e1e1e] border border-[#333] rounded-xl p-5 flex flex-col gap-4 min-h-[450px]">
            <div className="flex items-center gap-2 text-[#c9a84c] border-b border-[#333] pb-3">
              <Sparkles className="w-5 h-5" />
              <h2 className="text-sm font-bold uppercase tracking-widest">Relatório Técnico</h2>
            </div>

            {!imageLoaded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-[#555]">
                <BrainCircuit className="w-10 h-10 opacity-20" />
                <p className="text-xs">Carregue uma imagem para habilitar a análise inteligente.</p>
              </div>
            ) : isAnalyzing ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                <div className="relative">
                  <BrainCircuit className="w-12 h-12 text-[#c9a84c] animate-pulse" />
                  <Loader2 className="w-14 h-14 text-[#c9a84c] animate-spin absolute -top-1 -left-1 opacity-40" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-[#f0ede8]">Análise em 3 etapas...</p>
                  <p className="text-[10px] text-[#888]">Localizando · Caracterizando · Inspecionando</p>
                </div>
              </div>
            ) : aiResult ? (
              <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">

                {/* Grade + Scores */}
                <div className="flex items-center gap-3">
                  <div className={`text-2xl font-black px-3 py-1 rounded-lg border-2 ${
                    aiResult.commercialGrade === 'A' ? 'text-[#2ecc71] border-[#27ae60] bg-[#0d2a1a]' :
                    aiResult.commercialGrade === 'B' ? 'text-[#f1c40f] border-[#f39c12] bg-[#2a2200]' :
                    aiResult.commercialGrade === 'C' ? 'text-[#e67e22] border-[#d35400] bg-[#2a1400]' :
                    'text-[#e74c3c] border-[#c0392b] bg-[#2a0d0d]'
                  }`}>{aiResult.commercialGrade}</div>
                  <div className="flex-1 flex flex-col gap-1.5">
                    {[
                      { label: 'Qualidade',   value: aiResult.qualityScore,      color: aiResult.qualityScore > 80 ? '#2ecc71' : aiResult.qualityScore > 60 ? '#f1c40f' : '#e74c3c' },
                      { label: 'Integridade', value: aiResult.structuralIntegrity, color: '#3498db' },
                      { label: 'Uniformidade', value: aiResult.colorUniformity,    color: '#9b59b6' },
                    ].map(({ label, value, color }) => (
                      <React.Fragment key={label}>
                        <div className="flex justify-between text-[10px] text-[#888]">
                          <span>{label}</span><span className="text-[#f0ede8]">{value}%</span>
                        </div>
                        <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Caracterização */}
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Tipo',       value: aiResult.stoneType },
                    { label: 'Acabamento', value: aiResult.finish },
                    { label: 'Cor',        value: aiResult.color },
                    { label: 'Espessura',  value: aiResult.estimatedThickness },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-[#252525] rounded-lg p-2 border border-[#333]">
                      <div className="text-[9px] text-[#666] uppercase">{label}</div>
                      <div className="text-[11px] text-[#f0ede8] font-medium capitalize truncate">{value}</div>
                    </div>
                  ))}
                </div>

                {/* Quadrantes */}
                {aiResult.quadrantAnalysis && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-[#888] uppercase font-bold">Análise por Quadrante</span>
                    <div className="grid grid-cols-2 gap-1">
                      {(['topLeft','topRight','bottomLeft','bottomRight'] as const).map((key, idx) => {
                        const labels = ['↖ Sup. Esq.','↗ Sup. Dir.','↙ Inf. Esq.','↘ Inf. Dir.'];
                        const q = aiResult.quadrantAnalysis[key];
                        return (
                          <div key={key} className={`p-2 rounded-lg border ${q.score > 80 ? 'border-[#27ae60] bg-[#0d2a1a]' : q.score > 60 ? 'border-[#f39c12] bg-[#2a2200]' : 'border-[#c0392b] bg-[#2a0d0d]'}`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[9px] text-[#888]">{labels[idx]}</span>
                              <span className={`text-[10px] font-bold ${q.score > 80 ? 'text-[#2ecc71]' : q.score > 60 ? 'text-[#f1c40f]' : 'text-[#e74c3c]'}`}>{q.score}%</span>
                            </div>
                            {q.issues.length > 0
                              ? q.issues.slice(0,2).map((issue, i) => <div key={i} className="text-[9px] text-[#aaa] truncate">• {issue}</div>)
                              : <div className="text-[9px] text-[#2ecc71]">• Sem defeitos</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Resumo */}
                <div className="bg-[#252525] p-3 rounded-lg border border-[#333]">
                  <div className="text-[9px] text-[#888] uppercase mb-1">Resumo Técnico</div>
                  <p className="text-[11px] text-[#ccc] leading-relaxed">{aiResult.summary}</p>
                </div>

                {/* Defeitos */}
                {aiResult.detections?.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-[#888] uppercase font-bold">{aiResult.detections.length} Defeito(s)</span>
                    {aiResult.detections.map((d, i) => (
                      <div key={i} className={`flex items-start gap-2 text-[11px] p-2 rounded border-l-2 ${
                        d.severity === 'crítico' ? 'border-[#e74c3c] bg-[#1a0a0a] text-[#e74c3c]' :
                        d.severity === 'moderado' ? 'border-[#f39c12] bg-[#1a1200] text-[#f39c12]' :
                        'border-[#888] bg-[#1a1a1a] text-[#aaa]'
                      }`}>
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-bold capitalize">{d.type}</span>
                          <span className="text-[#666] mx-1">·</span>
                          <span className="text-[#888] text-[10px]">{d.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recomendações */}
                {aiResult.recommendations?.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-[#888] uppercase font-bold">Recomendações</span>
                    {aiResult.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] text-[#aaa] bg-[#1a1a1a] p-2 rounded border-l-2 border-[#3498db]">
                        <CheckCircle className="w-3 h-3 text-[#3498db] mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Marcações manuais */}
                {manualMarks.filter(m => m.source === 'manual').length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-[#888] uppercase font-bold">Marcações Manuais</span>
                    {manualMarks.filter(m => m.source === 'manual').map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-[11px] p-2 rounded border-l-2 bg-[#1a1a1a]"
                        style={{ borderColor: MARK_COLORS[m.type] || '#888' }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: MARK_COLORS[m.type] }} />
                        <span className="font-bold capitalize" style={{ color: MARK_COLORS[m.type] }}>{m.label}</span>
                        <span className="text-[#666] text-[10px]">marcado manualmente</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : aiError ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-[#e74c3c]">
                <AlertTriangle className="w-10 h-10" />
                <p className="text-xs">{aiError}</p>
                <button onClick={handleAIAnalysis} className="text-[10px] underline uppercase tracking-widest text-[#888] hover:text-white">
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-[#888]">
                <BrainCircuit className="w-10 h-10 opacity-40" />
                <p className="text-xs">Clique em "Análise Inteligente" para processar a chapa.</p>
              </div>
            )}

            <div className="mt-auto pt-3 border-t border-[#333] flex items-center justify-between text-[9px] text-[#555] uppercase tracking-tighter">
              <span>Gemini 2.5 Pro · 3 etapas</span>
              <span>MarmorCut Pro</span>
            </div>
          </div>

          <button
            onClick={handleNext} disabled={!imageLoaded}
            className="w-full flex items-center justify-center gap-2 py-4 bg-[#27ae60] text-white rounded-xl font-bold hover:bg-[#219a52] transition-all disabled:opacity-35 group"
          >
            Próximo Passo: Calcular Cortes <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={loadStoneImage} />

      <div className="flex items-center gap-3 text-xs text-[#888] flex-wrap">
        <span className={`px-2.5 py-1 rounded-md font-medium border ${imageLoaded ? 'bg-[#3d1a1a] text-[#e74c3c] border-[#c0392b]' : 'bg-[#222] text-[#888] border-[#333]'}`}>
          {imageName}
        </span>
        <span className="text-[#555]">●</span>
        <span className="text-[#666]">
          {!isPaintTool
            ? `Clique na pedra para marcar ${tool === 'furo' ? 'um furo' : tool === 'recorte' ? 'um recorte' : 'uma lasca'}`
            : 'Trace sobre as imperfeições ou use a Análise Inteligente'}
        </span>
        {strokeCount > 0 && <span className="ml-auto text-[#888]">{strokeCount} marca(s)</span>}
      </div>
    </div>
  );
}
