import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, Users, Wallet, LayoutGrid, Calculator, ArrowRightLeft,
  Gavel, MessageSquare, CreditCard, GripVertical, Check, X,
} from 'lucide-react';
import type { AppTab } from '../types';
import { moveMobileTab, normalizeMobileNavOrder } from './navigationPreferences';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: AppTab) => void;
  onOpenNav: () => void;
  onNewLoan: () => void;
  navOrder: string[];
  mobileNavOrder: AppTab[];
  saveMobileNavOrder: (tabs: AppTab[]) => Promise<void>;
  primaryColor?: string;
  isStaff?: boolean;
  onGoBack?: () => void;
}

const iconFor = (tab: AppTab, active: boolean): React.ReactNode => {
  const cls = active ? 'text-blue-400' : '';
  const size = 20;
  switch (tab) {
    case 'DASHBOARD': return <LayoutDashboard size={size} className={cls} />;
    case 'DOSSIER': return <ArrowRightLeft size={size} className={active ? 'text-cyan-400' : ''}/>;
    case 'CLIENTS': return <Users size={size} className={active ? 'text-emerald-400' : ''}/>;
    case 'SOURCES': return <Wallet size={size} className={active ? 'text-amber-400' : ''}/>;
    case 'MY_WALLET': return <CreditCard size={size} className={active ? 'text-fuchsia-400' : ''}/>;
    case 'SIMULATOR': return <Calculator size={size} className={active ? 'text-cyan-400' : ''}/>;
    case 'LEGAL': return <Gavel size={size} className={active ? 'text-yellow-400' : ''}/>;
    case 'SUPPORT': return <MessageSquare size={size} className={cls}/>;
    default: return <LayoutGrid size={size} className={cls}/>;
  }
};
const labelFor = (tab: AppTab): string => ({
  DASHBOARD: 'Painel', DOSSIER: 'Extrato', CLIENTS: 'Clientes',
  SOURCES: 'Capital', MY_WALLET: 'Carteira', SIMULATOR: 'Simulador',
  LEGAL: 'Jurídico', SUPPORT: 'Chat',
} as Partial<Record<AppTab,string>>)[tab] ?? tab;

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab, setActiveTab, mobileNavOrder, saveMobileNavOrder, navOrder,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftOrder, setDraftOrder] = useState<AppTab[]>(() => normalizeMobileNavOrder(mobileNavOrder));
  const [notice, setNotice] = useState('');
  const draggedRef = useRef<{ tab: AppTab; pointer: number } | null>(null);
  const scrollingRef = useRef<{ pointer: number; startX: number; startScroll: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!editing) setDraftOrder(normalizeMobileNavOrder(mobileNavOrder));
  }, [mobileNavOrder, editing]);

  useEffect(() => {
    if (editing || !scrollRef.current) return;
    const activeButton = scrollRef.current.querySelector<HTMLElement>(`[data-mobile-nav-tab="${activeTab}"]`);
    activeButton?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab, editing]);

  const enterEdit = () => {
    setDraftOrder(normalizeMobileNavOrder(mobileNavOrder));
    setNotice('');
    setEditing(true);
    draggedRef.current = null;
    scrollingRef.current = null;
  };
  const cancelEdit = () => {
    if (saving) return;
    setDraftOrder(normalizeMobileNavOrder(mobileNavOrder));
    setEditing(false);
    draggedRef.current = null;
  };
  const finishEdit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveMobileNavOrder(draftOrder);
      setNotice('');
    } catch {
      // Parent saved the order on this device before trying the network.
      setNotice('Ordem salva neste aparelho. Sincronização pendente.');
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const onTabPointerDown = (event: React.PointerEvent<HTMLButtonElement>, tab: AppTab) => {
    if (!editing || saving) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    draggedRef.current = { tab, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onTabPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragged = draggedRef.current;
    if (!editing || !dragged || dragged.pointer !== event.pointerId) return;
    event.preventDefault();
    const scroll = scrollRef.current;
    if (scroll) {
      const rect = scroll.getBoundingClientRect();
      if (event.clientX < rect.left + 34) scroll.scrollLeft -= 17;
      if (event.clientX > rect.right - 34) scroll.scrollLeft += 17;
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-mobile-nav-tab]')
      ?.dataset.mobileNavTab as AppTab | undefined;
    if (target && target !== dragged.tab) {
      setDraftOrder(previous => moveMobileTab(previous, dragged.tab, target));
    }
  };
  const onTabPointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (draggedRef.current?.pointer !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggedRef.current = null;
  };

  const onScrollPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editing || event.pointerType !== 'mouse' || event.button !== 0) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    scrollingRef.current = {
      pointer: event.pointerId, startX: event.clientX,
      startScroll: scroll.scrollLeft, moved: false,
    };
  };
  const onScrollPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = scrollingRef.current;
    if (editing || !gesture || gesture.pointer !== event.pointerId || !scrollRef.current) return;
    if (Math.abs(event.clientX - gesture.startX) <= 8 && !gesture.moved) return;
    gesture.moved = true;
    scrollRef.current.scrollLeft = gesture.startScroll - (event.clientX - gesture.startX);
    event.preventDefault();
  };
  const onScrollPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scrollingRef.current?.pointer !== event.pointerId) return;
    // Click follows pointerup, so keep the scroll gesture until the click.
    if (!scrollingRef.current.moved) scrollingRef.current = null;
  };

  return (
    <div className="bottom-nav-mobile md:hidden fixed bottom-0 inset-x-0 z-[var(--z-nav,200)] border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl pb-safe">
      {editing ? (
        <div className="flex min-h-10 items-center justify-between gap-2 border-b border-slate-800 px-3 py-1">
          <span className="text-[11px] font-semibold text-slate-300">Arraste os ícones para organizar</span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Cancelar organização" disabled={saving}
              onClick={cancelEdit} className="flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-slate-300 disabled:opacity-50">
              <X size={15}/> Cancelar
            </button>
            <button type="button" aria-label="Salvar ordem dos botões" disabled={saving}
              onClick={() => void finishEdit()} className="flex min-h-9 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-bold text-white disabled:opacity-50">
              <Check size={15}/> {saving ? 'Salvando' : 'Concluir'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" aria-label="Organizar ordem dos botões"
          title="Organizar barra" onClick={enterEdit}
          className="absolute right-1 top-0 z-10 flex h-7 w-7 items-center justify-center rounded-b-lg border border-slate-800 bg-slate-900/95 text-slate-400 shadow-sm">
          <GripVertical size={14}/>
        </button>
      )}
      <div
        ref={scrollRef}
        role="navigation" aria-label="Navegação principal"
        onPointerDown={onScrollPointerDown}
        onPointerMove={onScrollPointerMove}
        onPointerUp={onScrollPointerUp}
        onPointerCancel={() => { scrollingRef.current = null; }}
        className={'flex items-center gap-2 overflow-x-auto hide-scrollbar pl-4 pr-10 py-2 scroll-smooth ' +
          (editing ? 'select-none' : 'cursor-grab')}
        style={{ WebkitOverflowScrolling: 'touch', touchAction: editing ? 'none' : 'pan-x' }}
      >
        {draftOrder.filter(tab => tab !== 'MY_WALLET' || navOrder.includes('MY_WALLET')).map(tab => (
          <button key={tab} type="button" data-mobile-nav-tab={tab}
            aria-label={editing ? 'Arrastar '+ labelFor(tab) : labelFor(tab)}
            aria-current={!editing && activeTab === tab ? 'page' : undefined}
            onPointerDown={event => onTabPointerDown(event, tab)}
            onPointerMove={onTabPointerMove}
            onPointerUp={onTabPointerEnd}
            onPointerCancel={onTabPointerEnd}
            onClick={event => {
              if (editing || scrollingRef.current?.moved) { event.preventDefault(); scrollingRef.current = null; return; }
              setActiveTab(tab);
            }}
            className={'flex min-w-[64px] shrink-0 flex-col items-center gap-1 rounded-xl p-2 transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-95 ' +
              (editing ? 'cursor-grab touch-none border border-dashed border-slate-600 active:bg-slate-800' :
                activeTab === tab ? 'bg-blue-600/15 ring-1 ring-blue-500/30 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200')}
            style={editing ? { touchAction: 'none' } : undefined}
          >
            {iconFor(tab, activeTab === tab)}
            <span className={'w-full truncate text-center text-[10px] font-bold uppercase tracking-tight transition-colors duration-200 ' +
              (activeTab === tab ? 'text-white' : '')}>{labelFor(tab)}</span>
          </button>
        ))}
      </div>
      {notice && !editing && (
        <div role="status" className="border-t border-amber-900/50 px-3 py-1 text-center text-[10px] text-amber-200">
          {notice}
        </div>
      )}
    </div>
  );
};
