import React, { useEffect, useRef } from 'react';

interface ExitConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ExitConfirmDialog: React.FC<ExitConfirmDialogProps> = ({
  open, onCancel, onConfirm,
}) => {
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
      role="presentation">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cf-exit-title"
        aria-describedby="cf-exit-description"
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
      >
        <h2 id="cf-exit-title" className="text-lg font-bold text-white">Sair do CapitalFlow?</h2>
        <p id="cf-exit-description" className="mt-2 text-sm leading-relaxed text-slate-300">
          Você está na tela inicial. Deseja encerrar o aplicativo?
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button ref={cancelButton} type="button" onClick={onCancel}
            className="min-h-11 rounded-xl border border-slate-600 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-blue-400">
            Continuar no app
          </button>
          <button type="button" onClick={onConfirm}
            className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-rose-300">
            Sair
          </button>
        </div>
      </section>
    </div>
  );
};
