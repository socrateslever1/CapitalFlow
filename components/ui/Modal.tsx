
import React from 'react';
import { X } from 'lucide-react';

export const Modal: React.FC<{onClose: () => void, title: string, children: React.ReactNode}> = ({onClose, title, children}) => (
  <div className="fixed inset-0 z-[var(--z-modal)] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300">
    <div className="bg-slate-900/90 border border-slate-800/50 w-full max-w-2xl rounded-[2rem] p-6 sm:p-10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 relative flex flex-col max-h-[85dvh] overflow-hidden backdrop-blur-md">
      <div className="flex justify-between items-center mb-4 sm:mb-10 flex-shrink-0">
        <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-white pr-4 leading-tight">{title}</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-all p-1 hover:bg-slate-800 rounded-full flex-shrink-0"><X size={18}/></button>
      </div>
      <div className="overflow-y-auto custom-scrollbar pr-2 flex-1 min-h-0">
        {children}
      </div>
    </div>
  </div>
);
