
import React from 'react';
import { modalPrimaryActionClass } from '../ui/Modal';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface LoanFormActionsProps {
  formId?: string;
  isSubmitting: boolean;
  isEditing: boolean;
}

export const LoanFormActions: React.FC<LoanFormActionsProps> = ({ formId, isSubmitting, isEditing }) => {
  return (
    <div className="w-full">
      <button form={formId} type="submit" disabled={isSubmitting} className={modalPrimaryActionClass}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={20}/> {isEditing ? 'Salvar Alterações' : 'Emitir Contrato'}</>}
      </button>
    </div>
  );
};
