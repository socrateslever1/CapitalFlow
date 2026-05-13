import React from 'react';

export const Button = ({ children, className, variant = 'primary', ...props }: any) => (
  <button 
    className={`px-4 py-2 rounded-lg font-bold text-xs uppercase transition-colors ${variant === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-800 text-white hover:bg-slate-700'} ${className}`} 
    {...props}
  >
    {children}
  </button>
);
