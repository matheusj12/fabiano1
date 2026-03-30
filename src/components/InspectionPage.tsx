import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Pencil, Eraser, RotateCcw, Trash2, Download, Camera, Upload,
  BrainCircuit, Loader2, Sparkles, AlertTriangle, CheckCircle, ArrowRight,
  Circle, Square, Hexagon,
} from 'lucide-react';
import { analyzeStoneImage, AIAnalysisResult } from '../services/aiService';
import { StoneImperfection } from '../types';

type Tool = 'pen' | 'eraser' | 'furo' | 'recorte' | 'lasca';

interface InspectionPageProps {
  onNext: (image: string, analysis: AIAnalysisResult | null, imperfections: StoneImperfection[]) => void;
}

const MARK_COLORS: Record<string, string> = {
  furo:      '#60a5fa',
  recorte:   '#a78bfa',
  lasca:     '#fb923c',
  rachadura: '#f87171',
  fissura:   '#f87171',
  mancha:    '#a8896c',
  outro:     '#94a3b8',
};

const toolIcons: Record<string, React.ReactNode> = {
  furo: <Circle className="w-3.5 h-3.5" />,
  recorte: <Square className="w-3.5 h-3.5" />,
  lasca: <Hexagon className="w-3.5 h-3.5" />,
};

export default function InspectionPage({ onNext }: InspectionPageProps) {
  const [tool, setTool] = useState<Tool>('pen');
  const [brushSize, setBrushSize] = useState(4);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [imageName, setImageName] = useState('');

  const [manualMarks, setManualMarks] = useState<StoneImperfection[]>([]);
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
    const color = MARK_COLORS[type] || '#f87171';
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
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

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

    const pw = canvas.width  * 0.06;
    const ph = canvas.height * 0.06;
    drawMarkShape(ctx, tool, canvasX, canvasY, pw, ph);

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
      ctx.fillStyle = 'rgba(248,113,113,0.92)';
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
      ctx.strokeStyle = 'rgba(248,113,113,0.92)';
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

  const cursorClass = tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair';

  const gradeColor = (grade: string) => {
    if (grade === 'A') return { text: 'text-success-400', bg: 'bg-success-400/10', border: 'border-success-400/30' };
    if (grade === 'B') return { text: 'text-warning-400', bg: 'bg-warning-400/10', border: 'border-warning-400/30' };
    if (grade === 'C') return { text: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30' };
    return { text: 'text-danger-400', bg: 'bg-danger-400/10', border: 'border-danger-400/30' };
  };

  const scoreBarColor = (value: number) =>
    value > 80 ? '#4ade80' : value > 60 ? '#facc15' : '#f87171';

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* TOOLBAR */}
      <div className="glass-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Draw tools */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950/50">
            <button
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all cursor-pointer ${
                tool === 'pen'
                  ? 'bg-danger-400/20 text-danger-400 ring-1 ring-danger-400/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              onClick={() => setTool('pen')}
            >
              <Pencil className="w-3.5 h-3.5" /> Rachadura
            </button>

            {([
              { key: 'furo' as Tool,    label: 'Furo',    color: MARK_COLORS.furo },
              { key: 'recorte' as Tool, label: 'Recorte', color: MARK_COLORS.recorte },
              { key: 'lasca' as Tool,   label: 'Lasca',   color: MARK_COLORS.lasca },
            ]).map(({ key, label, color }) => (
              <button
                key={key}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  tool === key
                    ? 'ring-1'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
                style={tool === key ? { backgroundColor: color + '22', color, ringColor: color + '55' } : {}}
                onClick={() => setTool(key)}
              >
                {toolIcons[key]}
                {label}
              </button>
            ))}

            <button
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all cursor-pointer ${
                tool === 'eraser'
                  ? 'bg-info-400/20 text-info-400 ring-1 ring-info-400/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              onClick={() => setTool('eraser')}
            >
              <Eraser className="w-3.5 h-3.5" /> Borracha
            </button>
          </div>

          <div className="w-px h-7 bg-gold-400/10 mx-1" />

          {/* Brush size */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Espessura</span>
            <input type="range" min="2" max="20" value={brushSize}
              onChange={e => setBrushSize(parseInt(e.target.value))}
              className="w-20 accent-gold-400" />
            <span className="w-7 text-center text-slate-400 font-mono text-[11px]">{brushSize}px</span>
          </div>

          <div className="w-px h-7 bg-gold-400/10 mx-1 hidden sm:block" />

          {/* Undo / Clear */}
          <div className="flex items-center gap-1">
            <button
              className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all disabled:opacity-30 cursor-pointer"
              onClick={undo} disabled={undoStack.length === 0}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Desfazer
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all disabled:opacity-30 cursor-pointer"
              onClick={clearDrawing} disabled={strokeCount === 0}
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpar
            </button>
          </div>

          <div className="flex-1" />

          {/* AI + Save */}
          <div className="flex items-center gap-2">
            <button
              className="btn-gold flex items-center gap-2 text-xs cursor-pointer"
              onClick={handleAIAnalysis} disabled={!imageLoaded || isAnalyzing}
            >
              {isAnalyzing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando...</>
                : <><BrainCircuit className="w-4 h-4" /> Análise Inteligente</>}
            </button>
            <button
              className="btn-ghost flex items-center gap-2 text-xs cursor-pointer"
              onClick={saveImage} disabled={!imageLoaded}
            >
              <Download className="w-4 h-4" /> Salvar
            </button>
          </div>
        </div>
      </div>

      {/* MAIN AREA */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">

        {/* CANVAS */}
        <div
          ref={wrapRef}
          className={`glass-card relative overflow-hidden min-h-[480px] flex items-center justify-center ${cursorClass}`}
          onClick={() => !imageLoaded && fileInputRef.current?.click()}
        >
          <canvas ref={bgCanvasRef}   className="absolute top-0 left-0" />
          <canvas ref={drawCanvasRef} className="absolute top-0 left-0 z-10"
            onMouseDown={startPaint}
            onTouchStart={startPaint}
          />
          {!imageLoaded && (
            <div className="relative z-20 flex flex-col items-center gap-4 pointer-events-none">
              <div className="w-20 h-20 rounded-2xl bg-gold-400/5 border border-gold-400/10 flex items-center justify-center">
                <Camera className="w-10 h-10 text-gold-400/30" />
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-400 mb-1">Clique para carregar a foto da pedra</p>
                <p className="text-[10px] text-slate-600">PNG, JPG até 10MB</p>
              </div>
              <button
                className="btn-gold flex items-center gap-2 text-xs pointer-events-auto cursor-pointer"
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                <Upload className="w-4 h-4" /> Escolher Foto
              </button>
            </div>
          )}
        </div>

        {/* AI REPORT PANEL */}
        <div className="flex flex-col gap-4">
          <div className="glass-card p-5 flex flex-col gap-4 min-h-[480px]">
            <div className="flex items-center gap-2 text-gold-400 border-b border-gold-400/10 pb-3">
              <Sparkles className="w-4 h-4" />
              <h2 className="text-xs font-bold uppercase tracking-[0.15em]">Relatório Técnico</h2>
            </div>

            {!imageLoaded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center">
                  <BrainCircuit className="w-8 h-8 text-slate-700" />
                </div>
                <p className="text-xs text-slate-600 max-w-[200px]">
                  Carregue uma imagem para habilitar a análise inteligente.
                </p>
              </div>
            ) : isAnalyzing ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
                <div className="relative w-16 h-16">
                  <BrainCircuit className="w-10 h-10 text-gold-400 absolute top-3 left-3 animate-pulse" />
                  <div className="w-16 h-16 border-2 border-gold-400/20 border-t-gold-400 rounded-full animate-spin-slow" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-slate-200">Análise em 3 etapas...</p>
                  <p className="text-[10px] text-slate-600 tracking-wide">Localizando · Caracterizando · Inspecionando</p>
                </div>
              </div>
            ) : aiResult ? (
              <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in">

                {/* Grade + Scores */}
                <div className="flex items-start gap-3">
                  <div className={`text-3xl font-black px-4 py-2 rounded-xl border-2 ${gradeColor(aiResult.commercialGrade).text} ${gradeColor(aiResult.commercialGrade).bg} ${gradeColor(aiResult.commercialGrade).border}`}>
                    {aiResult.commercialGrade}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    {[
                      { label: 'Qualidade',    value: aiResult.qualityScore },
                      { label: 'Integridade',  value: aiResult.structuralIntegrity },
                      { label: 'Uniformidade', value: aiResult.colorUniformity },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-slate-500">{label}</span>
                          <span className="text-slate-300 font-mono">{value}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${value}%`, backgroundColor: scoreBarColor(value) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Caracterização */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Tipo',       value: aiResult.stoneType },
                    { label: 'Acabamento', value: aiResult.finish },
                    { label: 'Cor',        value: aiResult.color },
                    { label: 'Espessura',  value: aiResult.estimatedThickness },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-700/30">
                      <div className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</div>
                      <div className="text-[11px] text-slate-200 font-medium capitalize truncate mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>

                {/* Quadrantes */}
                {aiResult.quadrantAnalysis && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Análise por Quadrante</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['topLeft','topRight','bottomLeft','bottomRight'] as const).map((key, idx) => {
                        const labels = ['↖ Sup. Esq.','↗ Sup. Dir.','↙ Inf. Esq.','↘ Inf. Dir.'];
                        const q = aiResult.quadrantAnalysis[key];
                        const qColor = q.score > 80 ? 'border-success-400/20 bg-success-400/5' :
                                       q.score > 60 ? 'border-warning-400/20 bg-warning-400/5' :
                                       'border-danger-400/20 bg-danger-400/5';
                        return (
                          <div key={key} className={`p-2.5 rounded-lg border ${qColor}`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[9px] text-slate-500">{labels[idx]}</span>
                              <span className={`text-[10px] font-bold font-mono ${q.score > 80 ? 'text-success-400' : q.score > 60 ? 'text-warning-400' : 'text-danger-400'}`}>{q.score}%</span>
                            </div>
                            {q.issues.length > 0
                              ? q.issues.slice(0,2).map((issue, i) => <div key={i} className="text-[9px] text-slate-500 truncate">• {issue}</div>)
                              : <div className="text-[9px] text-success-400">• Sem defeitos</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Resumo */}
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/30">
                  <div className="text-[9px] text-slate-600 uppercase mb-1 tracking-wide">Resumo Técnico</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{aiResult.summary}</p>
                </div>

                {/* Defeitos */}
                {aiResult.detections?.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                      {aiResult.detections.length} Defeito(s)
                    </span>
                    {aiResult.detections.map((d, i) => (
                      <div key={i} className={`flex items-start gap-2 text-[11px] p-2.5 rounded-lg border-l-2 ${
                        d.severity === 'crítico' ? 'border-danger-400 bg-danger-400/5 text-danger-400' :
                        d.severity === 'moderado' ? 'border-warning-400 bg-warning-400/5 text-warning-400' :
                        'border-slate-600 bg-slate-800/30 text-slate-400'
                      }`}>
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-bold capitalize">{d.type}</span>
                          <span className="text-slate-600 mx-1">·</span>
                          <span className="text-slate-500 text-[10px]">{d.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recomendações */}
                {aiResult.recommendations?.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Recomendações</span>
                    {aiResult.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] text-slate-400 bg-info-400/5 p-2.5 rounded-lg border-l-2 border-info-400">
                        <CheckCircle className="w-3 h-3 text-info-400 mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Marcações manuais */}
                {manualMarks.filter(m => m.source === 'manual').length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Marcações Manuais</span>
                    {manualMarks.filter(m => m.source === 'manual').map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-[11px] p-2.5 rounded-lg border-l-2 bg-slate-800/30"
                        style={{ borderColor: MARK_COLORS[m.type] || '#94a3b8' }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: MARK_COLORS[m.type] }} />
                        <span className="font-bold capitalize" style={{ color: MARK_COLORS[m.type] }}>{m.label}</span>
                        <span className="text-slate-600 text-[10px]">marcado manualmente</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : aiError ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-danger-400/10 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-danger-400" />
                </div>
                <p className="text-xs text-danger-400 max-w-[220px]">{aiError}</p>
                <button onClick={handleAIAnalysis}
                  className="text-[10px] text-slate-500 hover:text-gold-400 uppercase tracking-[0.1em] underline underline-offset-4 cursor-pointer transition-colors">
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gold-400/5 border border-gold-400/10 flex items-center justify-center">
                  <BrainCircuit className="w-8 h-8 text-gold-400/30" />
                </div>
                <p className="text-xs text-slate-600 max-w-[200px]">
                  Clique em "Análise Inteligente" para processar a chapa.
                </p>
              </div>
            )}

            <div className="mt-auto pt-3 border-t border-slate-700/20 flex items-center justify-between text-[9px] text-slate-700 uppercase tracking-[0.1em]">
              <span>Gemini 2.5 Pro · 3 etapas</span>
              <span>MarmorCut Pro</span>
            </div>
          </div>

          <button
            onClick={handleNext} disabled={!imageLoaded}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-30 group cursor-pointer
              bg-gradient-to-r from-success-500 to-emerald-600 text-white hover:from-success-400 hover:to-emerald-500 shadow-lg shadow-success-500/20 hover:shadow-success-500/30"
          >
            Próximo: Calcular Cortes
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={loadStoneImage} />

      {/* Status bar */}
      <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap px-1">
        {imageName && (
          <span className="badge badge-gold">{imageName}</span>
        )}
        <span className="text-slate-700">
          {!isPaintTool
            ? `Clique na pedra para marcar ${tool === 'furo' ? 'um furo' : tool === 'recorte' ? 'um recorte' : 'uma lasca'}`
            : 'Trace sobre as imperfeições ou use a Análise Inteligente'}
        </span>
        {strokeCount > 0 && (
          <span className="ml-auto badge badge-info">{strokeCount} marca(s)</span>
        )}
      </div>
    </div>
  );
}
