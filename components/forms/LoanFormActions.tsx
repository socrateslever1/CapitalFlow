
import React from 'react';
import { Loader2, CheckCircle2, X } from 'lucide-react';

interface LoanFormActionsProps {
  formId?: string;
  isSubmitting: boolean;
  isEditing: boolean;
}

export const LoanFormActions: React.FC<LoanFormActionsProps> = ({ formId, isSubmitting, isEditing }) => {
  return (
    <div className="w-full flex gap-2.5">
      <button
        form={formId}
        type="submit"
        disabled={isSubmitting}
        className="flex-1 flex items-center justify-center gap-2.5 h-14 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-400 text-white font-bold text-sm uppercase tracking-wide rounded-lg transition-all shadow-lg hover:shadow-blue-500/50 disabled:shadow-none border border-blue-500/20"
      >
        {isSubmitting ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <CheckCircle2 size={18} />
            {isEditing ? 'Salvar Alterações' : 'Emitir Contrato'}
          </>
        )}
      </button>
      <button
        type="button"
        disabled={isSubmitting}
        className="flex items-center justify-center gap-2 px-6 h-14 bg-slate-800/60 hover:bg-slate-700/60 disabled:bg-slate-900/40 disabled:text-slate-500 text-slate-200 font-bold text-sm uppercase tracking-wide rounded-lg transition-all border border-slate-700/80 hover:border-slate-600/80"
      >
        <X size={18} />
        Cancelar
      </button>
    </div>
  );
};
