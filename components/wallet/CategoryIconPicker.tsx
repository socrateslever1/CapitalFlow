import React from 'react';
import { Tag } from 'lucide-react';
import { CategoryGaugeIcon } from './CategoryGaugeIcon';
import { MarqueeText } from '../ui/MarqueeText';
import { normalizeCategoryKey } from '../../features/wallet/domain/walletCategoryVisual';
import { DEFAULT_EXPENSE_CATEGORIES } from '../../features/wallet/utils/walletCustomCategories';

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
            <MarqueeText text={category} className={`w-full text-[10px] font-semibold ${selected ? 'text-white' : 'text-slate-300'}`} />
          </button>
        );
      })}
    </div>
  );
};

const incomeCategories = ['Salário', 'Pensão', 'Aluguel recebido', 'Serviços', 'Investimentos', 'Outros'];

export function CategoryPickerField({ value, onChange, categories, income = false, className = '' }: {
  value: string;
  onChange: (category: string) => void;
  categories?: readonly string[];
  income?: boolean;
  className?: string;
}) {
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [previous, setPrevious] = React.useState('');
  const base = income ? [...incomeCategories, ...(categories ?? [])] : categories ?? DEFAULT_EXPENSE_CATEGORIES;
  const options = [...new Set([...base, creating ? previous : value].filter(Boolean))];
  const canonical = (name: string) =>
    base.find(option => normalizeCategoryKey(option) === normalizeCategoryKey(name)) ?? name;
  const confirm = () => {
    const name = draft.trim();
    if (!name) return;
    onChange(canonical(name));
    setCreating(false);
    setDraft('');
  };
  return <div className={`min-w-0 space-y-2 ${className}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-300">
        <Tag size={12} aria-hidden="true" /> Categoria
      </span>
      <button type="button" aria-expanded={creating} onClick={() => {
        if (creating) onChange(previous);
        else setPrevious(value);
        setDraft('');
        setCreating(!creating);
      }}
        className="min-h-8 rounded-md border border-slate-700 px-2 text-xs font-semibold text-slate-200">
        {creating ? 'Cancelar nova categoria' : '+ Nova'}
      </button>
    </div>
    {creating && <div className="flex min-w-0 gap-2">
      <input aria-label="Nome da categoria" maxLength={100} value={draft} onChange={event => {
        const name = event.target.value;
        setDraft(name);
        onChange(name.trim() ? canonical(name.trim()) : previous);
      }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); confirm(); } }}
        className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-white" />
      <button type="button" disabled={!draft.trim()} onClick={confirm} className="rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-50">Usar</button>
    </div>}
    <CategoryIconPicker categories={options} value={value} onChange={category => {
      setCreating(false);
      setDraft('');
      onChange(category);
    }} />
  </div>;
}
