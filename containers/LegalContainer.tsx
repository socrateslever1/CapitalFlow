
import React from 'react';
import { LegalPage } from '../pages/LegalPage';
import { Loan, CapitalSource, UserProfile, Agreement, AgreementInstallment } from '../types';
import { agreementService } from '../features/agreements/services/agreementService';

interface LegalContainerProps {
  loans: Loan[];
  sources: CapitalSource[];
  activeUser: UserProfile | null;
  ui: any;
  loanCtrl: any;
  fileCtrl: any;
  showToast: any;
  onRefresh: () => void;
  goBack?: () => void;
  onNavigate?: (id: string) => void;
}

export const LegalContainer: React.FC<LegalContainerProps> = ({
  loans, sources, activeUser, ui, loanCtrl, fileCtrl, showToast, onRefresh, goBack, onNavigate
}) => {

  const handleAgreementPayment = async (loan: Loan, agreement: Agreement, inst: AgreementInstallment) => {
      if (!activeUser) return;
      try {
          await agreementService.processPayment(agreement, inst, inst.amount, loan.sourceId, activeUser);
          showToast("Parcela do acordo recebida!", "success");
          ui.setShowReceipt({ loan, inst: { ...inst, agreementId: agreement.id }, amountPaid: inst.amount, type: 'AGREEMENT_PAYMENT' });
          onRefresh();
      } catch (e: any) {
          showToast("Erro ao processar pagamento: " + e.message, "error");
      }
  };

  return (
    <LegalPage 
        loans={loans} 
        sources={sources} 
        activeUser={activeUser}
        ui={ui}
        loanCtrl={loanCtrl}
        fileCtrl={fileCtrl}
        onRefresh={onRefresh}
        onAgreementPayment={handleAgreementPayment}
        onReviewSignal={loanCtrl.handleReviewSignal}
        onReverseTransaction={loanCtrl.openReverseTransaction}
        isStealthMode={ui.isStealthMode}
        showToast={showToast}
        goBack={goBack}
        onNavigate={onNavigate}
    />
  );
};
