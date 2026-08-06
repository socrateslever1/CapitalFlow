import React from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
  return (
    <div className="relative flex items-center justify-center group" title={content}>
      {children}
      <div 
        className={`absolute ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} hidden group-hover:flex group-focus-within:flex flex-col items-center whitespace-nowrap animate-in fade-in zoom-in-95 duration-150 pointer-events-none z-50`}
      >
        <span className="relative z-50 px-2.5 py-1 text-[9px] font-black text-slate-100 bg-slate-950 rounded-md shadow-2xl border border-slate-700 uppercase tracking-wider backdrop-blur-md">
          {content}
          <span 
            className={`absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-slate-950 border-slate-700 transform rotate-45 ${
              position === 'top' ? 'bottom-[-4px] border-b border-r' : 'top-[-4px] border-t border-l'
            }`}
          ></span>
        </span>
      </div>
    </div>
  );
};
