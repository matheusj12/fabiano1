import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Calculator } from 'lucide-react';
import Header from './components/Header';
import InspectionPage from './components/InspectionPage';
import CalculatorPage from './components/CalculatorPage';
import { AIAnalysisResult } from './services/aiService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'inspect' | 'calc'>('inspect');
  
  // Shared state for data transfer between steps
  const [inspectionData, setInspectionData] = useState<{
    image: string | null;
    analysis: AIAnalysisResult | null;
  }>({
    image: null,
    analysis: null,
  });

  const handleNextStep = (image: string, analysis: AIAnalysisResult | null) => {
    setInspectionData({ image, analysis });
    setActiveTab('calc');
  };

  return (
    <div className="min-h-screen bg-[#111] text-[#f0ede8] font-sans">
      <Header />
      
      {/* TABS */}
      <div className="flex bg-[#1a1a1a] border-b border-[#333] px-6">
        <button
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium cursor-pointer border-b-2 transition-all ${
            activeTab === 'inspect'
              ? 'text-[#c9a84c] border-[#c9a84c]'
              : 'text-[#888] border-transparent hover:text-[#f0ede8]'
          }`}
          onClick={() => setActiveTab('inspect')}
        >
          <Search className="w-4 h-4" /> Inspeção de Pedra
        </button>
        <button
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium cursor-pointer border-b-2 transition-all ${
            activeTab === 'calc'
              ? 'text-[#c9a84c] border-[#c9a84c]'
              : 'text-[#888] border-transparent hover:text-[#f0ede8]'
          }`}
          onClick={() => setActiveTab('calc')}
        >
          <Calculator className="w-4 h-4" /> Calculadora de Cortes
        </button>
      </div>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'inspect' ? (
              <InspectionPage onNext={handleNextStep} />
            ) : (
              <CalculatorPage inspectionData={inspectionData} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
