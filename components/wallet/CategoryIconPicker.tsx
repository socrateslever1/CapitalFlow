import React from 'react';
import { CategoryGaugeIcon } from './CategoryGaugeIcon';

type Props = {
  categories: readonly string[];
  value: string;
  onChange: (category: string) => void;
  ariaLabel?: string;
};

/** Escolha de categoria por ícones, em duas linhas roláveis na horizontal (cabe no celular). */
export const CategoryIconPicker: React.FC<Props> = ({ categories, value, onChange, ariaLabel = 'Categoria' }) => (
  <div role="radiogroup" aria-label={ariaLabel}
    className="grid grid-flow-col grid-rows-2 auto-cols-[76px] gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
    {categories.map(category => {
      const selected = category === value;
      return (
        <button key={category} type="button" role="radio" aria-checked={selected}
          onClick={() => onChange(category)}
          className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-center transition ${
            selected ? 'border-blue-500/80 bg-blue-500/10' : 'border-transparent hover:bg-slate-800/60'}`}>
          <CategoryGaugeIcon category={category} size={38} />
          <span className={`w-full truncate text-[10px] font-semibold ${selected ? 'text-white' : 'text-slate-300'}`}>{category}</span>
        </button>
      );
    })}
  </div>
);
