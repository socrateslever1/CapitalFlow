import React, { useState } from 'react';
import { X } from 'lucide-react';

export const Calculator: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [display, setDisplay] = useState('0');

  const handleButtonClick = (value: string) => {
    if (value === 'C') {
      setDisplay('0');
    } else if (value === '=') {
      try {
        // Simple expression evaluator
        const result = new Function('return ' + display)();
        setDisplay(result.toString());
      } catch {
        setDisplay('Error');
      }
    } else {
      setDisplay(display === '0' ? value : display + value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 w-80">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold">Calculadora</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="bg-slate-950 text-white text-right p-4 rounded-lg mb-4 text-2xl font-mono">
          {display}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', 'C', '=', '+'].map((btn) => (
            <button
              key={btn}
              onClick={() => handleButtonClick(btn)}
              className="bg-slate-800 hover:bg-slate-700 text-white p-4 rounded-lg font-bold"
            >
              {btn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
