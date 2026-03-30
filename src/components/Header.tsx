import { Gem, ScanSearch, Calculator } from 'lucide-react';

interface HeaderProps {
  activeTab: 'inspection' | 'calculator';
  onTabChange: (tab: 'inspection' | 'calculator') => void;
}

export default function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-gold-400/15">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-lg"
              style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
            >
              <Gem className="w-5 h-5 text-slate-950" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold tracking-[0.2em] text-gradient-gold uppercase leading-tight">
                MarmorCut
              </h1>
              <span className="text-[9px] text-slate-500 tracking-[0.15em] uppercase">
                Sistema para Marmoraria
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => onTabChange('inspection')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
                ${activeTab === 'inspection'
                  ? 'bg-gold-400/10 text-gold-400 shadow-[inset_0_-2px_0_0_var(--color-gold-400)]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
            >
              <ScanSearch className="w-4 h-4" />
              <span className="hidden sm:inline">Inspeção</span>
            </button>
            <button
              onClick={() => onTabChange('calculator')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
                ${activeTab === 'calculator'
                  ? 'bg-gold-400/10 text-gold-400 shadow-[inset_0_-2px_0_0_var(--color-gold-400)]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
            >
              <Calculator className="w-4 h-4" />
              <span className="hidden sm:inline">Calculadora</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
