import { Gem } from 'lucide-react';

export default function Header() {
  return (
    <header className="bg-[#1a1a1a] border-b-2 border-[#c9a84c] p-4 flex items-center gap-3">
      <div className="w-10 h-10 bg-[#c9a84c] flex items-center justify-center text-xl" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
        <Gem className="w-6 h-6 text-black" />
      </div>
      <div>
        <h1 className="text-xl font-bold tracking-widest text-[#c9a84c] uppercase">MarmorCut</h1>
        <span className="text-[10px] text-[#888] tracking-wider">SISTEMA PARA MARMORARIA</span>
      </div>
    </header>
  );
}
