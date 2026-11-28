import React from 'react';
import { Check, Landmark, RotateCcw, Wallet } from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import { BankLogo } from './BankLogo';

export interface ReceiptDestinationSourceOption {
  id: string;
  name: string;
  balance: number;
}

export interface ReceiptDestinationAccountOption {
  id: string;
  nickname: string;
  balance: number;
  bank_name?: string | null;
  account_type?: string | null;
  capital_source_id?: string | null;
}

interface SourceSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  sources: ReceiptDestinationSourceOption[];
  contractSourceId?: string | null;
  disabled?: boolean;
  isStealthMode?: boolean;
}

export const ReceiptSourceDestinationList: React.FC<SourceSelectorProps> = ({
  label,
  value,
  onChange,
  sources,
  contractSourceId,
  disabled = false,
  isStealthMode = false,
}) => {
  if (!sources.length) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-200">{label}</span>
        {value && <button type="button" onClick={() => onChange('')} disabled={disabled}
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/10 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50">
          <RotateCcw size={13} /> Limpar
        </button>}
      </div>
      {!value && <p className="text-[11px] text-slate-400">Sem seleção: mantém as fontes originais.</p>}
      <div role="radiogroup" aria-label={label} className="grid gap-1.5">
        {sources.map(source => {
          const selected = value === source.id;
          return (
            <button
              key={source.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(source.id)}
              className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
                selected
                  ? 'border-blue-500/70 bg-blue-500/15 text-white'
                  : 'border-slate-800 bg-slate-950/70 text-slate-200 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Landmark size={14} className={selected ? 'shrink-0 text-blue-300' : 'shrink-0 text-slate-400'} />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {source.name}
                  {source.id === contractSourceId && (
                    <span className="ml-1.5 text-[10px] font-normal text-slate-400">· contrato</span>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="tabular-nums text-[11px] font-semibold text-emerald-300">
                  {formatMoney(source.balance, isStealthMode)}
                </span>
                {selected && <Check size={14} className="text-blue-300" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface AccountSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  accounts: ReceiptDestinationAccountOption[];
  disabled?: boolean;
  isStealthMode?: boolean;
  errorMessage?: string;
}

export const ReceiptAccountDestinationList: React.FC<AccountSelectorProps> = ({
  label,
  value,
  onChange,
  accounts,
  disabled = false,
  isStealthMode = false,
  errorMessage,
}) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-slate-200">{label}</span>
      {value && <button type="button" onClick={() => onChange('')} disabled={disabled}
        className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/10 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50">
        <RotateCcw size={13} /> Limpar
      </button>}
    </div>
    {!value && <p className="text-[11px] text-slate-400">Sem seleção: nenhuma conta adicional.</p>}
    <div role="radiogroup" aria-label={label} className="grid gap-1.5">
      {accounts.map(account => {
        const selected = value === account.id;
        const isCash = account.account_type === 'CASH';
        return (
          <button
            key={account.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(account.id)}
            className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
              selected
                ? 'border-blue-500/70 bg-blue-500/15 text-white'
                : 'border-slate-800 bg-slate-950/70 text-slate-200 hover:border-slate-700 hover:bg-slate-900'
            }`}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {isCash ? (
                <Wallet size={14} className="shrink-0 text-amber-300" />
              ) : (
                <BankLogo name={account.bank_name} alternateName={account.nickname} size="sm" />
              )}
              <span className="min-w-0 flex-1 truncate font-semibold">
                {account.nickname}
                {account.capital_source_id && (
                  <span className="ml-1.5 text-[10px] font-normal text-blue-300">· Capital</span>
                )}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="tabular-nums text-[11px] font-semibold text-emerald-300">
                {formatMoney(account.balance, isStealthMode)}
              </span>
              {selected && <Check size={14} className="text-blue-300" />}
            </span>
          </button>
        );
      })}
    </div>
    {errorMessage && <p role="status" className="text-xs text-amber-300">{errorMessage}</p>}
  </div>
);
