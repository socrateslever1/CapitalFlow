import React from 'react';

export const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-slate-900 border border-slate-800 rounded-xl ${className}`}>{children}</div>
);
