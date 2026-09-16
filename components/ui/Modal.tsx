import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XCircle } from 'lucide-react';
import { SystemBackButton } from './SystemBackButton';
import { registerDialogBack } from '../../utils/dialogNavigation';

export const modalPrimaryActionClass = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50';
export const modalSecondaryActionClass = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50';

interface ModalProps {
  onClose: () => void;
  onBack?: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  compact?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  busy?: boolean;
  cancelLabel?: string;
}
const widths = { sm: 'max-w-[320px]', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-5xl' };
let openDialogs = 0;
let previousOverflow = '';
let previousOverscroll = '';

export const Modal: React.FC<ModalProps> = ({ onClose, onBack, title, subtitle, children, footer, compact = false, size = compact ? 'md' : 'lg', busy = false, cancelLabel = 'Cancelar' }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const callbacks = useRef({ onClose, onBack, busy });
  callbacks.current = { onClose, onBack, busy };
  const originFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const close = () => { if (!callbacks.current.busy) callbacks.current.onClose(); };
  const back = () => { if (!callbacks.current.busy) (callbacks.current.onBack || callbacks.current.onClose)(); };

  useEffect(() => {
    const update = () => setViewport({ height: window.visualViewport?.height || window.innerHeight, top: window.visualViewport?.offsetTop || 0 });
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    if (openDialogs++ === 0) {
      previousOverflow = document.body.style.overflow;
      previousOverscroll = document.body.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    }
    const registration = registerDialogBack(back);
    if (!panelRef.current?.contains(document.activeElement)) titleRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (!registration.isTop()) return;
      if (event.key === 'Escape') { event.preventDefault(); back(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:enabled, input:enabled, select:enabled, textarea:enabled, a[href], [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); titleRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      registration.dispose();
      document.removeEventListener('keydown', handleKey);
      if (--openDialogs === 0) {
        document.body.style.overflow = previousOverflow;
        document.body.style.overscrollBehavior = previousOverscroll;
      }
      if (originFocus.current instanceof HTMLElement && originFocus.current.isConnected) originFocus.current.focus();
    };
  }, []);

  const dialog = (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}
      className="fixed inset-x-0 top-0 z-[2000] flex h-dvh items-center justify-center bg-slate-950/80 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
      style={viewport ? { height: viewport.height, top: viewport.top } : undefined} onClick={event => event.stopPropagation()}>
      <div ref={panelRef} data-dialog-panel data-compact-height={viewport ? viewport.height <= 480 : undefined}
        className={`group flex max-h-[min(80dvh,100%)] min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl data-[compact-height=true]:overflow-y-auto ${widths[size]}`}>
        <header className="flex shrink-0 flex-col items-start gap-2 px-5 pt-4 pb-2">
          <SystemBackButton appleOnly local onClick={back} disabled={busy} />
          <div className="w-full text-center">
            <h2 ref={titleRef} id={titleId} tabIndex={-1} className="break-words text-sm font-black uppercase tracking-tight text-white outline-none">{title}</h2>
            {subtitle && <p className="mt-1 text-[10px] text-slate-400">{subtitle}</p>}
          </div>
        </header>
        <div role="region" aria-label={`Conteúdo: ${title}`} tabIndex={0} data-dialog-body className="min-h-0 min-w-0 flex-auto overflow-y-auto overscroll-contain px-5 py-3 [-webkit-overflow-scrolling:touch] group-data-[compact-height=true]:flex-none group-data-[compact-height=true]:overflow-visible">
          <fieldset disabled={busy} className="min-w-0 border-0 p-0 m-0">{children}</fieldset>
        </div>
        <footer className="flex shrink-0 flex-col gap-2 px-5 pt-3 pb-5">
          {footer}
          <button type="button" onClick={close} disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg text-[10px] font-black uppercase text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50"><XCircle size={12} /> {cancelLabel}</button>
        </footer>
      </div>
    </div>
  );
  // Escape transformed card ancestors and their stacking/overflow contexts.
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};
