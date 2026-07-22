
import React, { useMemo, useState } from 'react';
import { DashboardPage } from '../pages/DashboardPage';
import { Loan, CapitalSource, UserProfile, Agreement, AgreementInstallment, Installment } from '../types';
import { filterLoans } from '../domain/filters/loanFilters';
import { buildDashboardStats } from '../domain/dashboard/stats';
import { agreementService } from '../features/agreements/services/agreementService';
import { contractsService } from '../services/contracts.service';
import { paymentsService } from '../services/payments.service';
import { isCapitalOnlyRecoveryLoan } from '../utils/capitalOnlyRecovery';
import { calculateTotalDue } from '../domain/finance/calculations';
import { manualCollectionService } from '../services/manualCollection.service';

interface DashboardContainerProps {
  loans: Loan[];
  sources: CapitalSource[];
  activeUser: UserProfile | null;
  staffMembers: UserProfile[];
  mobileDashboardTab: 'CONTRACTS' | 'BALANCE';
  setMobileDashboardTab: (val: 'CONTRACTS' | 'BALANCE') => void;
  statusFilter: any;
  setStatusFilter: (val: any) => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  selectedStaffId: string;
  setSelectedStaffId: (id: string) => void;
  ui: any;
  loanCtrl: any;
  fileCtrl: any;
  showToast: any;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
  onOpenClient?: (clientId: string | null | undefined, clientName: string) => void;
  isLoadingData?: boolean;
}

export const DashboardContainer: React.FC<DashboardContainerProps> = ({
  loans, sources, activeUser, staffMembers, mobileDashboardTab, setMobileDashboardTab,
  statusFilter, setStatusFilter, searchTerm, setSearchTerm, selectedStaffId, setSelectedStaffId,
  ui, loanCtrl, fileCtrl, showToast, onRefresh, onNavigate, onOpenClient, isLoadingData = false
}) => {

  // LÓGICA DE FILTRAGEM DE EQUIPE
  const scopeLoans = useMemo(() => {
    if (!activeUser) return [];

    if (activeUser.accessLevel === 'ADMIN' || (activeUser as any).accessLevel === 1) {
      if (selectedStaffId === 'ALL') return loans;
      return loans.filter(l => l.operador_responsavel_id === selectedStaffId);
    }

    return loans.filter(l => l.owner_id === activeUser.id || l.operador_responsavel_id === activeUser.id);
  }, [loans, selectedStaffId, activeUser]);

  // Filtros de busca e status aplicados diretamente aos empréstimos do escopo
  const filteredLoans = useMemo(() => filterLoans(scopeLoans, searchTerm, statusFilter), [scopeLoans, searchTerm, statusFilter]);
  const stats = useMemo(() => buildDashboardStats(scopeLoans, sources, activeUser), [scopeLoans, sources, activeUser]);

  const handleAgreementPayment = async (loan: Loan, agreement: Agreement, inst: AgreementInstallment, amount?: number, forgiveLateFee?: boolean) => {
      if (!activeUser) return;
      const paidAmount = Number(amount ?? inst.amount) || 0;
      try {
          await agreementService.processPayment(agreement, inst, paidAmount, loan.sourceId, activeUser, forgiveLateFee);
          showToast("Parcela do acordo recebida!", "success");
          ui.setShowReceipt({ loan, inst: { ...inst, agreementId: agreement.id }, amountPaid: paidAmount, type: 'AGREEMENT_PAYMENT' });
          ui.openModal('RECEIPT');
          onRefresh();
      } catch (e: any) {
          showToast("Erro ao processar pagamento: " + e.message, "error");
      }
  };

  const handleReverseAgreementPayment = async (loan: Loan, agreement: Agreement, inst: AgreementInstallment) => {
      if (!activeUser) return;
      try {
          await agreementService.reversePayment(agreement, inst, activeUser);
          showToast("Pagamento estornado com sucesso!", "success");
          onRefresh();
      } catch (e: any) {
          showToast("Erro ao estornar pagamento: " + e.message, "error");
      }
  };


  const handleInstallmentPayment = async (
      loan: Loan,
      inst: Installment,
      debt?: any,
      amount?: number,
      options?: { forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH' }
  ) => {
      if (!activeUser) return;
      const calculations = debt || calculateTotalDue(loan, inst);
      const amountToReceive = Number(amount ?? calculations?.total ?? inst.amount ?? 0) || 0;

      if (amount === undefined) {
          ui.setPaymentModal({ loan, inst, calculations });
          ui.setAvAmount(amountToReceive > 0 ? amountToReceive.toFixed(2) : '');
          ui.openModal('PAYMENT');
          return;
      }

      try {
          const result = await paymentsService.processPayment({
              loan,
              inst,
              calculations,
              amountPaid: amountToReceive,
              activeUser,
              sources,
              forgivenessMode: options?.forgivenessMode || 'NONE',
              realDate: new Date(),
              paymentType: 'FULL'
          });

          if (result.paymentType === 'ALREADY_PAID_SYNCED') {
              showToast('Parcela ja estava quitada. Status sincronizado na tela.', 'success');
              onRefresh();
              return;
          }

          showToast('Recebimento registrado com sucesso!', 'success');
          ui.setShowReceipt({
              loan,
              inst,
              amountPaid: result.amountToPay || amountToReceive,
              type: result.paymentType || 'PAYMENT'
          });
          ui.openModal('RECEIPT');
          onRefresh();
      } catch (e: any) {
          showToast('Erro ao registrar recebimento: ' + (e?.message || 'desconhecido'), 'error');
      }
  };
  const handleReverseInstallmentPayment = (loan: Loan, inst: Installment) => {
      const tx = [...(loan.ledger || [])]
          .filter((entry: any) => {
              const type = String(entry.type || '').toUpperCase();
              return type.includes('PAYMENT') && Number(entry.amount || 0) > 0 && String(entry.installmentId || '') === String(inst.id || '');
          })
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      if (!tx) {
          showToast('Nao encontrei o pagamento dessa parcela no extrato para estornar.', 'error');
          return;
      }

      loanCtrl.openReverseTransaction(tx, loan);
  };
  const handleNewAporte = (loan: Loan) => {
      if (isCapitalOnlyRecoveryLoan(loan)) {
          showToast("Cliente marcado como Somente Capital nao pode receber novo aporte.", "error");
          return;
      }
      ui.setNewAporteModalLoan(loan);
      ui.openModal('NEW_APORTE');
  };

  const handleOpenReceipt = (transaction: any, loan: Loan) => {
      ui.setShowReceipt({
          loan,
          inst: {
              id: transaction.installmentId || transaction.id,
              dueDate: transaction.date,
              amount: Number(transaction.amount || 0),
              status: 'PAID'
          },
          amountPaid: Math.abs(Number(transaction.amount || 0)),
          type: transaction.type || 'PAYMENT'
      });
      ui.openModal('RECEIPT');
  };

  const handleMarkAsBilled = async (loan: Loan) => {
    try {
      if (!activeUser?.id) throw new Error('Perfil do operador não identificado.');
      await manualCollectionService.enqueue(activeUser.id, loan.id);
      await contractsService.markAsBilled(loan.id, loan.billing_count || 0);
      showToast('Cobrança validada e adicionada à fila do WhatsApp.', 'success');
      onRefresh();
    } catch (e: any) {
      showToast(`Não foi possível enviar a cobrança: ${e.message}`, 'error');
      throw e;
    }
  };

  return (
    <DashboardPage
        loans={loans}
        sources={sources}
        filteredLoans={filteredLoans}
        stats={stats}
        activeUser={activeUser} staffMembers={staffMembers} selectedStaffId={selectedStaffId} onStaffChange={setSelectedStaffId}
        mobileDashboardTab={mobileDashboardTab} setMobileDashboardTab={setMobileDashboardTab}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
        sortOption={ui.sortOption} setSortOption={ui.setSortOption}
        selectedLoanId={ui.selectedLoanId} setSelectedLoanId={ui.setSelectedLoanId}
        onEdit={(l) => { ui.setEditingLoan(l); ui.openModal('LOAN_FORM', l); }}
        onMessage={(l) => { ui.setMessageModalLoan(l); ui.openModal('MESSAGE_HUB'); }}
        onArchive={(l) => loanCtrl.openConfirmation({ type: 'ARCHIVE', target: l, showRefundOption: true })}
        onRestore={(l) => loanCtrl.openConfirmation({ type: 'RESTORE', target: l })}
        onDelete={(l) => loanCtrl.openConfirmation({ type: 'DELETE', target: l, showRefundOption: true })}
        onNote={(l) => { ui.setNoteModalLoan(l); ui.setNoteText(l.notes); ui.openModal('NOTE'); }}
        onPortalLink={(l) => loanCtrl.handleGenerateLink(l)}
        onUploadPromissoria={(l) => { ui.setPromissoriaUploadLoanId(String(l.id)); ui.promissoriaFileInputRef.current?.click(); }}
        onUploadDoc={(l) => { ui.setExtraDocUploadLoanId(String(l.id)); ui.setExtraDocKind('CONFISSAO'); ui.extraDocFileInputRef.current?.click(); }}
        onViewPromissoria={(url) => window.open(url, '_blank', 'noreferrer')}
        onViewDoc={(url) => window.open(url, '_blank', 'noreferrer')}
        onReviewSignal={loanCtrl.handleReviewSignal}
        onOpenComprovante={fileCtrl.handleOpenComprovante}
        onReverseTransaction={loanCtrl.openReverseTransaction}
        onOpenReceipt={handleOpenReceipt}
        onRenegotiate={(l) => {
            const loans = Array.isArray(l) ? l : [l];
            ui.setRenegotiationModalLoans(loans);
            ui.openModal('RENEGOTIATION', loans);
        }}
        onActivate={loanCtrl.handleActivateLoan}
        onNewAporte={handleNewAporte}
        onMarkAsBilled={handleMarkAsBilled}
        onAgreementPayment={handleAgreementPayment}
        onReverseAgreementPayment={handleReverseAgreementPayment}
        onInstallmentPayment={handleInstallmentPayment}
        onReverseInstallmentPayment={handleReverseInstallmentPayment}
        onNavigate={onNavigate}
        onOpenClient={onOpenClient}
        onRefresh={onRefresh}
        isLoadingData={isLoadingData}
        setWithdrawModal={() => ui.openModal('WITHDRAW')}
        showToast={showToast}
        isStealthMode={ui.isStealthMode}
        ui={ui}
        loanCtrl={loanCtrl}
    />
  );
};
