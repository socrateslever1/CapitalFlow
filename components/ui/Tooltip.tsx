
import React from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'bottom' }) => {
  return (
    <div className="relative flex items-center justify-center group z-50">
      {children}
      <div 
        className={`absolute ${position === 'top' ? 'bottom-full mb-3' : 'top-full mt-3'} hidden group-hover:flex flex-col items-center whitespace-nowrap animate-in fade-in zoom-in-95 duration-200 pointer-events-none`}
      >
        <span className="relative z-50 px-3 py-2 text-[9px] font-black text-slate-200 bg-slate-900 rounded-xl shadow-2xl border border-slate-700 uppercase tracking-widest backdrop-blur-md">
          {content}
          {/* Seta decorativa CSS pura */}
          <span 
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-slate-700 transform rotate-45 ${
              position === 'top' ? 'bottom-[-5px] border-b border-r' : 'top-[-5px] border-t border-l'
            }`}
          ></span>
        </span>
      </div>
    </div>
  );
};
