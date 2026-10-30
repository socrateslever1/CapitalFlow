import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BANK_CATALOG } from '../../utils/bankLogoRegistry';

const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

type Props = { value: string; onChange: (value: string) => void; disabled?: boolean };

/** Inline listbox: participates in modal scrolling rather than escaping over Android's keyboard. */
export const WalletBankCombobox: React.FC<Props> = ({ value, onChange, disabled }) => {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [height, setHeight] = useState(200);
  const banks = useMemo(() => {
    const query = normalize(value.trim());
    return BANK_CATALOG.filter(bank => normalize(bank.name).includes(query)).slice(0, 60);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const reposition = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      setHeight(Math.max(64, Math.min(224, Math.floor(bottom - rect.bottom - 16))));
    };
    reposition();
    viewport?.addEventListener('resize', reposition);
    viewport?.addEventListener('scroll', reposition);
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    return () => {
      viewport?.removeEventListener('resize', reposition);
      viewport?.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const select = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(0);
    input.current?.focus({ preventScroll: true });
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive(index => Math.max(0, Math.min(banks.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    }
    if (event.key === 'Enter' && open && banks[active]) {
      event.preventDefault();
      select(banks[active].name);
    }
  };

  return <div ref={root} className="min-w-0 space-y-1 sm:col-span-2">
    <label htmlFor={id} className="block text-xs font-medium text-slate-200">Banco ou instituição</label>
    <input ref={input} id={id} name="wallet-card-issuer" type="text" required maxLength={120}
      autoComplete="off" autoCorrect="off" spellCheck={false} disabled={disabled}
      role="combobox" aria-autocomplete="list" aria-expanded={open && banks.length > 0}
      aria-controls={id + '-options'} aria-activedescendant={open && banks[active] ? id + '-option-' + active : undefined}
      placeholder="Ex.: Nubank, Itaú, C6, RecargaPay" value={value}
      onFocus={() => { setOpen(true); setActive(0); }}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(0); }}
      onKeyDown={onKeyDown}
      onBlur={event => { if (!root.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
      className="w-full rounded-xl border border-blue-500/40 bg-slate-950 p-3 text-white"/>
    {open && banks.length > 0 && height >= 64 && <ul id={id + '-options'} role="listbox"
      aria-label="Instituições bancárias" style={{ maxHeight: height }}
      className="relative z-0 w-full min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-blue-500/40 bg-slate-950 shadow-lg">
      {banks.map((bank, index) => <li key={bank.id} id={id + '-option-' + index} role="option"
        aria-selected={index === active}>
        <button type="button" tabIndex={-1} onPointerDown={event => event.preventDefault()}
          onClick={() => select(bank.name)}
          className={`flex min-h-11 w-full items-center px-3 text-left text-sm text-slate-100 hover:bg-slate-800 ${index === active ? 'bg-blue-900/40' : ''}`}>
          {bank.name}
        </button>
      </li>)}
    </ul>}
  </div>;
};
