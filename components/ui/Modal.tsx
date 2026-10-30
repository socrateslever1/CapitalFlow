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

export const Modal: React.FC<ModalProps> = ({ onClose, onBack, title, subtitle, icon, children, footer, compact = false, size = compact ? 'md' : 'lg', busy = false, cancelLabel = 'Cancelar' }) => {
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
    const update = () => {
      if (window.visualViewport) {
        setViewport({
          height: window.visualViewport.height,
          top: window.visualViewport.offsetTop,
        });
      }
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    if (openDialogs++ === 0) {
      previousOverflow = document.body.style.overflow;
      previousOverscroll = document.body.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
      document.body.setAttribute('data-hide-fab', 'true');
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
        document.body.removeAttribute('data-hide-fab');
      }
      if (originFocus.current instanceof HTMLElement && originFocus.current.isConnected) originFocus.current.focus();
    };
  }, []);

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={busy}
      data-modal-open="true"
      className="fixed inset-0 z-[2000] flex flex-col justify-end sm:justify-center sm:items-center bg-slate-950/85 sm:p-4 backdrop-blur-sm overflow-hidden"
      style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined}
      onClick={event => event.stopPropagation()}
    >
      <div
        ref={panelRef}
        data-dialog-panel
        className={`group flex h-full sm:h-auto max-h-[100dvh] sm:max-h-[90dvh] min-h-0 w-full flex-col overflow-hidden sm:rounded-2xl border-0 sm:border border-slate-800 bg-slate-900 shadow-2xl ${widths[size]}`}
      >
        <header className="relative flex shrink-0 flex-col items-start gap-2 overflow-hidden border-b border-slate-800/80 bg-gradient-to-r from-blue-950/50 via-slate-900 to-emerald-950/30 px-4 sm:px-6 py-3.5 sm:py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
          <SystemBackButton appleOnly local onClick={back} disabled={busy} />
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300 shadow-lg shadow-blue-950/30">{icon}</div>}
              <div className="min-w-0 text-left">
                <h2 ref={titleRef} id={titleId} className="break-words bg-gradient-to-r from-blue-300 via-white to-emerald-300 bg-clip-text text-sm sm:text-base font-black uppercase tracking-wide text-transparent outline-none truncate">{title}</h2>
                {subtitle && <p className="mt-0.5 text-[10px] font-medium text-slate-400 truncate">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              aria-label="Fechar"
              className="rounded-full bg-slate-800/80 p-1.5 text-slate-400 hover:text-white transition-colors shrink-0"
            >
              <XCircle size={18} />
            </button>
          </div>
        </header>

        <div
          role="region"
          aria-label={`Conteúdo: ${title}`}
          data-dialog-body
          className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4 touch-pan-y [-webkit-overflow-scrolling:touch]"
        >
          <fieldset disabled={busy} className="min-w-0 border-0 p-0 m-0 pb-16 sm:pb-6">{children}</fieldset>
        </div>

        <footer className={`flex shrink-0 flex-col gap-2 border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-md px-4 sm:px-6 py-3.5 sm:py-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-2xl ${footer ? 'sm:flex-row-reverse' : ''}`}>
          {footer}
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className={`flex min-h-11 items-center justify-center gap-1 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-800/60 px-4 text-[10px] font-black uppercase text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50 ${footer ? 'w-full sm:flex-1' : 'w-full sm:w-auto sm:self-center sm:px-8'}`}
          >
            <XCircle size={13} /> {cancelLabel}
          </button>
        </footer>
      </div>
    </div>
  );
  // Escape transformed card ancestors and their stacking/overflow contexts.
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};
