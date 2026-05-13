
import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface LoanFormActionsProps {
  isSubmitting: boolean;
  isEditing: boolean;
}

export const LoanFormActions: React.FC<LoanFormActionsProps> = ({ isSubmitting, isEditing }) => {
  return (
    <div className="flex gap-4 pt-4">
      <button type="submit" disabled={isSubmitting} className="w-full py-5 sm:py-6 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-500 shadow-2xl shadow-blue-600/30 active:scale-95 transition-all flex items-center justify-center gap-3 text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed">
          {isSubmitting ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={20}/> {isEditing ? 'Salvar Alterações' : 'Emitir Contrato'}</>}
      </button>
    </div>
  );
};
