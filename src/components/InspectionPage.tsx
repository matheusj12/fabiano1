import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pencil, Eraser, RotateCcw, Trash2, Download, Camera, BrainCircuit, Loader2, Sparkles, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import { analyzeStoneImage, AIAnalysisResult } from '../services/aiService';

interface InspectionPageProps {
  onNext: (image: string, analysis: AIAnalysisResult | null) => void;
}

export default function InspectionPage({ onNext }: InspectionPageProps) {
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [brushSize, setBrushSize] = useState(4);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [imageName, setImageName] = useState('Nenhuma imagem carregada');
  
  // AI States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const paintingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
    };
  }, []);

  const saveUndo = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setUndoStack((prev) => [...prev.slice(-29), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const startPaint = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!imageLoaded) return;
    paintingRef.current = true;
    const pos = getPos(e);
    lastPosRef.current = pos;
    saveUndo();

    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
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
  }, [imageLoaded, tool, brushSize, getPos, saveUndo]);

  const paint = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!paintingRef.current || !imageLoaded) return;
    const pos = getPos(e);
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = 'rgba(220,50,50,0.92)';
      ctx.lineWidth = brushSize;
      ctx.stroke();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.lineWidth = brushSize * 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.stroke();
      ctx.restore();
    }
    lastPosRef.current = pos;
  }, [imageLoaded, tool, brushSize, getPos]);

  const stopPaint = useCallback(() => {
    if (paintingRef.current) {
      setStrokeCount((prev) => prev + 1);
    }
    paintingRef.current = false;
  }, []);

  const undo = () => {
    if (undoStack.length === 0) return;
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const lastState = undoStack[undoStack.length - 1];
    ctx.putImageData(lastState, 0, 0);
    setUndoStack((prev) => prev.slice(0, -1));
    setStrokeCount((prev) => Math.max(0, prev - 1));
  };

  const clearDrawing = () => {
    saveUndo();
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeCount(0);
  };

  const loadStoneImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const maxW = wrapRef.current?.offsetWidth || 700;
      const ratio = Math.min(maxW / img.width, 520 / img.height);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);

      if (bgCanvasRef.current && drawCanvasRef.current) {
        bgCanvasRef.current.width = drawCanvasRef.current.width = w;
        bgCanvasRef.current.height = drawCanvasRef.current.height = h;
        const bgCtx = bgCanvasRef.current.getContext('2d');
        const drawCtx = drawCanvasRef.current.getContext('2d');
        bgCtx?.drawImage(img, 0, 0, w, h);
        drawCtx?.clearRect(0, 0, w, h);
      }
      setUndoStack([]);
      setStrokeCount(0);
      setImageLoaded(true);
      setImageName(file.name);
      setAiResult(null);
      setAiError(null);
    };
    img.src = URL.createObjectURL(file);
  };

  const getMergedImageData = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!bgCanvas || !drawCanvas) return null;

    const m = document.createElement('canvas');
    m.width = bgCanvas.width;
    m.height = bgCanvas.height;
    const ctx = m.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bgCanvas, 0, 0);
    ctx.drawImage(drawCanvas, 0, 0);
    return m.toDataURL('image/png');
  };

  const saveImage = () => {
    const dataUrl = getMergedImageData();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.download = 'pedra_inspecionada.png';
    a.href = dataUrl;
    a.click();
  };

  const handleNext = () => {
    const dataUrl = getMergedImageData();
    if (!dataUrl) return;
    onNext(dataUrl, aiResult);
  };

  const drawAIDetections = useCallback((detections: any[]) => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    saveUndo();
    
    detections.forEach((det) => {
      const [ymin, xmin, ymax, xmax] = det.box_2d;
      
      // Map normalized 0-1000 to canvas dimensions
      const x = (xmin / 1000) * canvas.width;
      const y = (ymin / 1000) * canvas.height;
      const w = ((xmax - xmin) / 1000) * canvas.width;
      const h = ((ymax - ymin) / 1000) * canvas.height;

      ctx.save();
      ctx.strokeStyle = 'rgba(220,50,50,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, w, h);
      
      ctx.fillStyle = 'rgba(220,50,50,0.2)';
      ctx.fillRect(x, y, w, h);
      
      // Draw a small label
      ctx.fillStyle = 'rgba(220,50,50,0.9)';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(det.type.toUpperCase(), x, y > 15 ? y - 5 : y + 15);
      ctx.restore();
    });

    setStrokeCount((prev) => prev + detections.length);
  }, [saveUndo]);

  const handleAIAnalysis = async () => {
    const bgCanvas = bgCanvasRef.current;
    if (!bgCanvas) return;

    setIsAnalyzing(true);
    setAiError(null);
    try {
      const base64 = bgCanvas.toDataURL('image/png');
      const result = await analyzeStoneImage(base64);
      setAiResult(result);
      
      if (result.detections && result.detections.length > 0) {
        drawAIDetections(result.detections);
      }

      // Salva inspeção no banco silenciosamente
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
      setAiError(error instanceof Error ? error.message : "Erro desconhecido na análise.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => paint(e);
    const handleGlobalMouseUp = () => stopPaint();
    const handleGlobalTouchMove = (e: TouchEvent) => paint(e);
    const handleGlobalTouchEnd = () => stopPaint();

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [paint, stopPaint]);

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 bg-[#1e1e1e] border border-[#333] rounded-xl p-3">
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all ${tool === 'pen' ? 'bg-[#c0392b] text-white' : 'bg-[#2a2a2a] text-[#f0ede8] border border-[#444] hover:bg-[#333]'}`}
          onClick={() => setTool('pen')}
        >
          <Pencil className="w-4 h-4" /> Marcar rachadura
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all ${tool === 'eraser' ? 'bg-[#2980b9] text-white' : 'bg-[#2a2a2a] text-[#f0ede8] border border-[#444] hover:bg-[#333]'}`}
          onClick={() => setTool('eraser')}
        >
          <Eraser className="w-4 h-4" /> Borracha
        </button>
        <div className="w-px h-7 bg-[#333] mx-1" />
        <div className="flex items-center gap-2 text-sm text-[#aaa]">
          <span>Espessura</span>
          <input
            type="range"
            min="2"
            max="20"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="w-20 accent-[#c9a84c]"
          />
          <span className="w-8 text-center">{brushSize}px</span>
        </div>
        <div className="w-px h-7 bg-[#333] mx-1" />
        <button
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#2a2a2a] text-[#f0ede8] border border-[#444] hover:bg-[#333] disabled:opacity-35 disabled:cursor-not-allowed"
          onClick={undo}
          disabled={undoStack.length === 0}
        >
          <RotateCcw className="w-4 h-4" /> Desfazer
        </button>
        <button
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#2a2a2a] text-[#f0ede8] border border-[#444] hover:bg-[#333] disabled:opacity-35 disabled:cursor-not-allowed"
          onClick={clearDrawing}
          disabled={strokeCount === 0}
        >
          <Trash2 className="w-4 h-4" /> Limpar marcas
        </button>
        
        <div className="flex-1" />

        <button
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#c9a84c] text-black font-bold hover:bg-[#b8973b] disabled:opacity-35 disabled:cursor-not-allowed transition-all"
          onClick={handleAIAnalysis}
          disabled={!imageLoaded || isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Analisando...
            </>
          ) : (
            <>
              <BrainCircuit className="w-4 h-4" /> Análise Inteligente
            </>
          )}
        </button>

        <button
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#27ae60] text-white hover:bg-[#219a52] disabled:opacity-35 disabled:cursor-not-allowed"
          onClick={saveImage}
          disabled={!imageLoaded}
        >
          <Download className="w-4 h-4" /> Salvar imagem
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <div
          ref={wrapRef}
          className={`relative bg-black border border-[#333] rounded-xl overflow-hidden min-h-[450px] flex items-center justify-center ${tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
          onClick={() => !imageLoaded && fileInputRef.current?.click()}
        >
          <canvas ref={bgCanvasRef} className="absolute top-0 left-0" />
          <canvas
            ref={drawCanvasRef}
            className="absolute top-0 left-0 z-10"
            onMouseDown={startPaint}
            onTouchStart={startPaint}
          />
          {!imageLoaded && (
            <div className="relative z-20 flex flex-col items-center gap-3 pointer-events-none">
              <Camera className="w-12 h-12 opacity-30 text-white" />
              <div className="text-sm text-[#888]">Clique para carregar a foto da pedra</div>
              <button
                className="px-4 py-2 bg-[#2a2a2a] text-[#f0ede8] border border-[#444] rounded-lg pointer-events-auto hover:bg-[#333]"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Escolher foto
              </button>
            </div>
          )}
        </div>

        {/* AI RESULTS PANEL */}
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
                  <p className="text-sm font-medium text-[#f0ede8]">Análise em 2 etapas...</p>
                  <p className="text-[10px] text-[#888]">Caracterizando pedra e inspecionando quadrantes</p>
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
                  }`}>
                    {aiResult.commercialGrade}
                  </div>
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="flex justify-between text-[10px] text-[#888]">
                      <span>Qualidade</span><span className="text-[#f0ede8]">{aiResult.qualityScore}%</span>
                    </div>
                    <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width:`${aiResult.qualityScore}%`, backgroundColor: aiResult.qualityScore > 80 ? '#2ecc71' : aiResult.qualityScore > 60 ? '#f1c40f' : '#e74c3c' }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-[#888]">
                      <span>Integridade</span><span className="text-[#f0ede8]">{aiResult.structuralIntegrity}%</span>
                    </div>
                    <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#3498db] transition-all" style={{ width:`${aiResult.structuralIntegrity}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-[#888]">
                      <span>Uniformidade</span><span className="text-[#f0ede8]">{aiResult.colorUniformity}%</span>
                    </div>
                    <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#9b59b6] transition-all" style={{ width:`${aiResult.colorUniformity}%` }} />
                    </div>
                  </div>
                </div>

                {/* Caracterização */}
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Tipo', value: aiResult.stoneType },
                    { label: 'Acabamento', value: aiResult.finish },
                    { label: 'Cor', value: aiResult.color },
                    { label: 'Espessura', value: aiResult.estimatedThickness },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-[#252525] rounded-lg p-2 border border-[#333]">
                      <div className="text-[9px] text-[#666] uppercase">{label}</div>
                      <div className="text-[11px] text-[#f0ede8] font-medium capitalize truncate">{value}</div>
                    </div>
                  ))}
                </div>

                {/* Análise por quadrante */}
                {aiResult.quadrantAnalysis && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-[#888] uppercase font-bold">Análise por Quadrante</span>
                    <div className="grid grid-cols-2 gap-1">
                      {([
                        ['topLeft','↖ Sup. Esq.'],['topRight','↗ Sup. Dir.'],
                        ['bottomLeft','↙ Inf. Esq.'],['bottomRight','↘ Inf. Dir.']
                      ] as [keyof typeof aiResult.quadrantAnalysis, string][]).map(([key, label]) => {
                        const q = aiResult.quadrantAnalysis[key];
                        return (
                          <div key={key} className={`p-2 rounded-lg border ${q.score > 80 ? 'border-[#27ae60] bg-[#0d2a1a]' : q.score > 60 ? 'border-[#f39c12] bg-[#2a2200]' : 'border-[#c0392b] bg-[#2a0d0d]'}`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[9px] text-[#888]">{label}</span>
                              <span className={`text-[10px] font-bold ${q.score > 80 ? 'text-[#2ecc71]' : q.score > 60 ? 'text-[#f1c40f]' : 'text-[#e74c3c]'}`}>{q.score}%</span>
                            </div>
                            {q.issues.length > 0 ? q.issues.slice(0,2).map((issue, i) => (
                              <div key={i} className="text-[9px] text-[#aaa] truncate">• {issue}</div>
                            )) : <div className="text-[9px] text-[#2ecc71]">• Sem defeitos</div>}
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

                {/* Detecções por severidade */}
                {aiResult.detections?.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-[#888] uppercase font-bold">{aiResult.detections.length} Defeito(s) Detectado(s)</span>
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
              <span>OpenAI o3 · 2 etapas</span>
              <span>MarmorCut Pro</span>
            </div>
          </div>
          
          <button
            onClick={handleNext}
            disabled={!imageLoaded}
            className="w-full flex items-center justify-center gap-2 py-4 bg-[#27ae60] text-white rounded-xl font-bold hover:bg-[#219a52] transition-all disabled:opacity-35 disabled:cursor-not-allowed group"
          >
            Próximo Passo: Calcular Cortes <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={loadStoneImage}
      />

      <div className="flex items-center gap-3 text-xs text-[#888] flex-wrap">
        <span className={`px-2.5 py-1 rounded-md font-medium border ${imageLoaded ? 'bg-[#3d1a1a] text-[#e74c3c] border-[#c0392b]' : 'bg-[#222] text-[#888] border-[#333]'}`}>
          {imageName}
        </span>
        <span className="text-[#555]">●</span>
        <span className="text-[#666]">Trace em vermelho sobre as rachaduras e imperfeições</span>
        {strokeCount > 0 && (
          <span className="ml-auto text-[#888]">{strokeCount} marca(s) registrada(s)</span>
        )}
      </div>
    </div>
  );
}
