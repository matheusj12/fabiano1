import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Header from './components/Header';
import InspectionPage from './components/InspectionPage';
import CalculatorPage from './components/CalculatorPage';
import { AIAnalysisResult } from './services/aiService';
import { StoneImperfection } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'inspection' | 'calculator'>('inspection');

  const [inspectionData, setInspectionData] = useState<{
    image: string | null;
    analysis: AIAnalysisResult | null;
    imperfections: StoneImperfection[];
  }>({
    image: null,
    analysis: null,
    imperfections: [],
  });

  const handleNextStep = (
    image: string,
    analysis: AIAnalysisResult | null,
    imperfections: StoneImperfection[],
  ) => {
    setInspectionData({ image, analysis, imperfections });
    setActiveTab('calculator');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-[Inter]">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            {activeTab === 'inspection' ? (
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
