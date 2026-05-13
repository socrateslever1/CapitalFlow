
import React, { useMemo, useState } from 'react';
import { DashboardPage } from '../pages/DashboardPage';
import { Loan, CapitalSource, UserProfile, Agreement, AgreementInstallment } from '../types';
import { filterLoans } from '../domain/filters/loanFilters';
import { buildDashboardStats } from '../domain/dashboard/stats';
import { agreementService } from '../features/agreements/services/agreementService';
import { contractsService } from '../services/contracts.service';

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
}

export const DashboardContainer: React.FC<DashboardContainerProps> = ({
  loans, sources, activeUser, staffMembers, mobileDashboardTab, setMobileDashboardTab,
  statusFilter, setStatusFilter, searchTerm, setSearchTerm, selectedStaffId, setSelectedStaffId,
  ui, loanCtrl, fileCtrl, showToast, onRefresh, onNavigate
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

  const handleAgreementPayment = async (loan: Loan, agreement: Agreement, inst: AgreementInstallment) => {
      if (!activeUser) return;
      try {
          await agreementService.processPayment(agreement, inst, inst.amount, loan.sourceId, activeUser);
          showToast("Parcela do acordo recebida!", "success");
          ui.setShowReceipt({ loan, inst: { ...inst, agreementId: agreement.id }, amountPaid: inst.amount, type: 'AGREEMENT_PAYMENT' });
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

  const handleNewAporte = (loan: Loan) => {
      ui.setNewAporteModalLoan(loan);
      ui.openModal('NEW_APORTE');
  };

  const handleMarkAsBilled = async (loan: Loan) => {
    try {
      await contractsService.markAsBilled(loan.id, loan.billing_count || 0);
      showToast("Contrato marcado como cobrado!", "success");
      onRefresh();
    } catch (e: any) {
      showToast("Erro ao marcar cobrança: " + e.message, "error");
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
        onNavigate={onNavigate}
        onRefresh={onRefresh}
        setWithdrawModal={() => ui.openModal('WITHDRAW')}
        showToast={showToast}
        isStealthMode={ui.isStealthMode}
        ui={ui}
        loanCtrl={loanCtrl}
    />
  );
};
