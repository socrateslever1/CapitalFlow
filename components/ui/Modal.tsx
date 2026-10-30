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
  /** Custom action area owns all buttons, including Cancel. Avoids crowded footers. */
  footerMode?: 'default' | 'custom';
}
const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-5xl' };
let openDialogs = 0;
let previousOverflow = '';
let previousOverscroll = '';

export const Modal: React.FC<ModalProps> = ({ onClose, onBack, title, subtitle, icon, children, footer, compact = false, size = compact ? 'md' : 'lg', busy = false, cancelLabel = 'Cancelar', footerMode = 'default' }) => {
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
      className="fixed inset-0 z-[2000] flex min-h-0 flex-col justify-end overflow-hidden bg-slate-950/85 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 motion-reduce:transition-none"
      style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined}
      onClick={event => event.stopPropagation()}
    >
      <div
        ref={panelRef}
        data-dialog-panel
        className={`group flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-0 border-slate-800 bg-slate-900 shadow-2xl sm:h-auto sm:max-h-[min(90dvh,960px)] sm:rounded-2xl sm:border motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 motion-reduce:animate-none ${widths[size]}`}
      >
        <header className="relative flex shrink-0 flex-col items-start gap-2 overflow-hidden border-b border-slate-800/80 bg-gradient-to-r from-blue-950/50 via-slate-900 to-emerald-950/30 px-4 sm:px-6 py-3.5 sm:py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
          <SystemBackButton appleOnly local onClick={back} disabled={busy} />
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300 shadow-lg shadow-blue-950/30">{icon}</div>}
              <div className="min-w-0 text-left">
                <h2 ref={titleRef} id={titleId} className="break-words text-balance bg-gradient-to-r from-blue-300 via-white to-emerald-300 bg-clip-text text-sm font-black uppercase leading-snug tracking-wide text-transparent outline-none sm:text-base">{title}</h2>
                {subtitle && <p className="mt-0.5 line-clamp-2 text-[11px] font-medium text-slate-400">{subtitle}</p>}
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

        <footer className={`flex min-w-0 shrink-0 flex-col gap-2 border-t border-slate-800/80 bg-slate-950/95 px-4 py-3 shadow-2xl backdrop-blur-md sm:px-6 sm:py-4 [padding-bottom:max(0.875rem,env(safe-area-inset-bottom))] ${footer && footerMode === 'default' ? 'sm:flex-row-reverse' : ''}`}>
          {footer}
          {footerMode === 'default' && <button
            type="button" onClick={close} disabled={busy}
            className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-4 text-[11px] font-bold uppercase text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800/60 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50 ${footer ? 'w-full sm:flex-1' : 'w-full sm:w-auto sm:self-center sm:px-8'}`}
          >
            <XCircle size={13} /> {cancelLabel}
          </button>}
        </footer>
      </div>
    </div>
  );
  // Escape transformed card ancestors and their stacking/overflow contexts.
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};
