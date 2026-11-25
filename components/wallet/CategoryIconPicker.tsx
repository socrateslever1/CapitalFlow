import React from 'react';
import { CategoryGaugeIcon } from './CategoryGaugeIcon';
import { normalizeCategoryKey } from '../../features/wallet/domain/walletCategoryVisual';

const isFallbackCategory = (category: string): boolean =>
  ['outros', 'sem categoria'].includes(normalizeCategoryKey(category));

type Props = {
  categories: readonly string[];
  value: string;
  onChange: (category: string) => void;
  ariaLabel?: string;
};

/**
 * Escolha de categoria por ícones, em duas linhas roláveis na horizontal (cabe no celular).
 * A grade enche linha por linha, então a ordem de leitura é a mesma da lista.
 */
export const CategoryIconPicker: React.FC<Props> = ({ categories, value, onChange, ariaLabel = 'Categoria' }) => {
  // "Outros" (e "Sem categoria") sempre por último: é a opção de reserva.
  const ordered = [...categories.filter(category => !isFallbackCategory(category)), ...categories.filter(isFallbackCategory)];
  const columns = Math.max(1, Math.ceil(ordered.length / 2));
  return (
    <div role="radiogroup" aria-label={ariaLabel}
      className="grid gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]"
      style={{ gridTemplateColumns: `repeat(${columns}, 76px)` }}>
      {ordered.map(category => {
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
};
