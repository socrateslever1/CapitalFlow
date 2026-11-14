import React, { useState } from 'react';
import { ShieldCheck, Check, Loader2 } from 'lucide-react';
import { CURRENT_TERMS_VERSION, TERMS_CLAUSES } from '../../services/terms.service';

interface TermsAcceptanceModalProps {
  isOpen: boolean;
  mode?: 'SIGNUP' | 'LOGIN_GATE';
  isSubmitting?: boolean;
  onAccept: () => Promise<void> | void;
  onCancel?: () => void;
}

export const TermsAcceptanceModal: React.FC<TermsAcceptanceModalProps> = ({
  isOpen,
  mode = 'SIGNUP',
  isSubmitting = false,
  onAccept,
  onCancel,
}) => {
  const [checked, setChecked] = useState(false);

  if (!isOpen) return null;

  const confirmLabel =
    mode === 'SIGNUP' ? 'Aceitar e Concluir Cadastro' : 'Aceitar e Continuar';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-800 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 id="terms-modal-title" className="text-base sm:text-lg font-bold text-white">
                Termos de Uso e Responsabilidade
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                {CURRENT_TERMS_VERSION}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Aceite obrigatório único para utilizar o CapitalFlow.
            </p>
          </div>
        </div>

        {/* Cláusulas */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="max-h-64 overflow-y-auto pr-1 space-y-3 bg-slate-950 border border-slate-800 rounded-xl p-4 custom-scrollbar">
            {TERMS_CLAUSES.map((clause) => (
              <div key={clause.number} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-md bg-blue-600/20 border border-blue-500/30 text-blue-300 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                  {clause.number}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white">{clause.title}</p>
                  <p className="text-xs text-slate-300 leading-relaxed mt-0.5">
                    {clause.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Checkbox de aceite */}
          <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors select-none">
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => setChecked((prev) => !prev)}
              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors cursor-pointer ${
                checked
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-transparent hover:border-slate-500'
              }`}
            >
              <Check size={13} strokeWidth={3} />
            </button>
            <span className="text-xs text-slate-200 leading-relaxed">
              Li, compreendi e aceito integralmente os <strong>Termos de Uso e Responsabilidade</strong>, isentando os criadores do sistema de qualquer responsabilidade sobre minhas operações e uso da plataforma.
            </span>
          </label>

          {/* Ações */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-1">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={() => void onAccept()}
              disabled={!checked || isSubmitting}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Registrando aceite...</span>
                </>
              ) : (
                <span>{confirmLabel}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

