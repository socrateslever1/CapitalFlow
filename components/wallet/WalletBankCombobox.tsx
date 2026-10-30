import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BANK_CATALOG } from '../../utils/bankLogoRegistry';
import { bankSuggestionHeight, normalizeBankSearch } from './walletBankComboboxDomain';

type Props = { value: string; onChange: (value: string) => void; disabled?: boolean };

/** In-flow listbox: never portals through the keyboard or overlays the modal's footer. */
export const WalletBankCombobox: React.FC<Props> = ({ value, onChange, disabled = false }) => {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [height, setHeight] = useState(0);

  const banks = useMemo(() => {
    const query = normalizeBankSearch(value);
    return BANK_CATALOG.filter(bank => normalizeBankSearch(bank.name).includes(query)).slice(0, 60);
  }, [value]);

  useEffect(() => {
    if (!open || disabled) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = inputRef.current?.getBoundingClientRect();
        if (!rect) return;
        const viewport = window.visualViewport;
        const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const scrollBody = rootRef.current?.closest('[data-dialog-body]');
        const bodyBottom = scrollBody?.getBoundingClientRect().bottom ?? viewportBottom;
        setHeight(bankSuggestionHeight(rect.bottom, viewportBottom, bodyBottom));
      });
    };
    update();
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [open, disabled, value]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (!open || height === 0) return;
    const item = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[active];
    item?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [open, active, height]);

  const select = (name: string): void => {
    onChange(name);
    setOpen(false);
    setActive(0);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive(i => Math.max(0, Math.min(banks.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))));
    }
    if (event.key === 'Home' && open) { event.preventDefault(); setActive(0); }
    if (event.key === 'End' && open) { event.preventDefault(); setActive(Math.max(0,banks.length-1)); }
    if (event.key === 'Enter' && open && banks[active] && height > 0) {
      event.preventDefault();
      select(banks[active].name);
    }
  };

  return <div ref={rootRef} className="min-w-0 space-y-1 sm:col-span-2">
    <label htmlFor={id} className="block text-xs font-medium text-slate-200">Banco ou instituição</label>
    <input ref={inputRef} id={id} name="wallet-card-issuer" type="text" required maxLength={120}
      autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} disabled={disabled}
      role="combobox" aria-autocomplete="list"
      aria-expanded={open && banks.length > 0 && height > 0}
      aria-controls={open && height > 0 ? id+'-options' : undefined}
      aria-activedescendant={open && height > 0 && banks[active] ? id+'-option-'+active : undefined}
      placeholder="Ex.: Nubank, Itaú, C6, RecargaPay" value={value}
      onFocus={() => {
        setOpen(true); setActive(0);
        requestAnimationFrame(() => inputRef.current?.scrollIntoView({ block: 'nearest' }));
      }}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(0); }}
      onKeyDown={handleKeyDown}
      onBlur={event => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !rootRef.current?.contains(next)) setOpen(false);
      }}
      className="w-full rounded-xl border border-blue-500/40 bg-slate-950 p-3 text-white"/>
    {open && !disabled && height > 0 && banks.length > 0 &&
      <ul ref={listRef} id={id+'-options'} role="listbox" aria-label="Instituições bancárias"
        style={{ maxHeight: height }}
        className="relative w-full min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-blue-500/40 bg-slate-950 shadow-lg">
        {banks.map((bank,index) =>
          <li key={bank.id} id={id+'-option-'+index} role="option" aria-selected={index===active}>
            <button type="button" tabIndex={-1}
              onMouseDown={event => event.preventDefault()}
              onClick={() => select(bank.name)}
              className={`flex min-h-11 w-full items-center px-3 text-left text-sm text-slate-100 hover:bg-slate-800 ${index===active?'bg-blue-900/40':''}`}>
              {bank.name}
            </button>
          </li>)}
      </ul>}
  </div>;
};
