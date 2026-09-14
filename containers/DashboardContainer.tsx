import React, { useMemo, useState } from 'react';
import { DashboardPage } from '../pages/DashboardPage';
import { Loan, CapitalSource, UserProfile, Agreement, AgreementInstallment, Installment } from '../types';
import { filterLoans } from '../domain/filters/loanFilters';
import { buildDashboardStats } from '../domain/dashboard/stats';
import { agreementService } from '../features/agreements/services/agreementService';
import { contractsService } from '../services/contracts.service';
import { paymentsService } from '../services/payments.service';
import { paymentOffersService } from '../services/paymentOffers.service';
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

type PartialBalanceAction = 'KEEP_PENDING' | 'CAPITALIZE' | 'RENEW_KEEP_PENDING' | 'SETTLE';

type InstallmentPaymentOptions = {
  forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH';
  partialBalanceAction?: PartialBalanceAction;
};

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

  const createInstantSettlementOffer = async (
    loan: Loan,
    inst: Installment,
    calculations: any,
    acceptedAmount: number
  ) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Quitação por acordo exige internet para registrar o desconto com segurança.');
    }

    const principal = Math.max(0, Number(calculations?.principal ?? inst.principalRemaining ?? 0) || 0);
    const interest = Math.max(0, Number(calculations?.interest ?? inst.interestRemaining ?? 0) || 0);
    const base = principal + interest;
    const gross = Math.max(base, Number(calculations?.total ?? inst.amount ?? 0) || 0);
    const amount = Number(acceptedAmount || 0);

    if (!Number.isFinite(amount) || amount <= 0.05) {
      throw new Error('Informe um valor válido para a quitação por acordo.');
    }
    if (amount >= gross - 0.05) return false;

    // A condição especial já sabe registrar desconto de principal/juros e perdão
    // de multa/mora. Escolhemos a combinação que chega ao valor aceito sem inventar
    // baixa financeira fora das RPCs auditadas.
    const lateFee = Math.max(0, Number(calculations?.lateFee ?? inst.lateFeeAccrued ?? gross - base) || 0);
    const fine = Math.max(0, Number(calculations?.finePart ?? 0) || 0);
    const dailyMora = Math.max(0, Number(calculations?.moraPart ?? Math.max(0, lateFee - fine)) || 0);
    const candidates = [
      { waiveFine: false, waiveDailyInterest: false, waived: 0 },
      { waiveFine: true, waiveDailyInterest: false, waived: fine },
      { waiveFine: false, waiveDailyInterest: true, waived: dailyMora },
      { waiveFine: true, waiveDailyInterest: true, waived: Math.max(lateFee, fine + dailyMora) },
    ]
      .map((candidate) => ({
        ...candidate,
        discount: gross - candidate.waived - amount,
      }))
      .filter((candidate) => candidate.discount >= -0.05 && candidate.discount <= base + 0.05)
      .sort((a, b) => a.waived - b.waived);

    const settlement = candidates[0] || {
      waiveFine: true,
      waiveDailyInterest: true,
      waived: lateFee,
      discount: base - amount,
    };
    const discount = Math.max(0, Math.min(base, settlement.discount));
    const today = new Date().toISOString().slice(0, 10);

    const offerResult = await paymentOffersService.save(loan, inst, {
      offerType: 'SETTLEMENT',
      agreedDate: today,
      validUntil: today,
      discountMode: discount > 0.005 ? 'VALUE' : 'NONE',
      discount,
      waiveFine: settlement.waiveFine,
      waiveDailyInterest: settlement.waiveDailyInterest,
      note: `Quitação imediata por valor aceito no recebimento: R$ ${amount.toFixed(2)}`,
    });

    const offeredAmount = Number(
      (offerResult as any)?.offered_amount
      ?? (offerResult as any)?.offeredAmount
      ?? 0
    );

    if (!Number.isFinite(offeredAmount) || Math.abs(offeredAmount - amount) > 0.05) {
      try {
        await paymentOffersService.cancel(loan, inst, 'Condição automática cancelada: valor final divergente do valor aceito.');
      } catch (cancelError) {
        console.error('[Payment] Falha ao cancelar condição automática divergente:', cancelError);
      }
      throw new Error(
        `O saldo foi atualizado e a quitação resultaria em R$ ${offeredAmount.toFixed(2).replace('.', ',')}. Atualize a tela e confirme novamente.`
      );
    }

    return true;
  };

  const handleInstallmentPayment = async (
      loan: Loan,
      inst: Installment,
      debt?: any,
      amount?: number,
      options?: InstallmentPaymentOptions
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

      const partialAction = options?.partialBalanceAction || 'KEEP_PENDING';
      let instantSettlementCreated = false;

      try {
          if (partialAction === 'SETTLE') {
              instantSettlementCreated = await createInstantSettlementOffer(loan, inst, calculations, amountToReceive);
          }

          const result = await paymentsService.processPayment({
              loan,
              inst,
              calculations,
              amountPaid: amountToReceive,
              activeUser,
              sources,
              forgivenessMode: options?.forgivenessMode || 'NONE',
              realDate: new Date(),
              capitalizeRemaining: partialAction === 'CAPITALIZE',
              renewWithPending: partialAction === 'RENEW_KEEP_PENDING',
              paymentType: 'FULL'
          });

          if (result.paymentType === 'ALREADY_PAID_SYNCED') {
              showToast('Parcela ja estava quitada. Status sincronizado na tela.', 'success');
              onRefresh();
              return;
          }

          if (partialAction === 'SETTLE') showToast('Quitação por acordo registrada com sucesso!', 'success');
          else if (partialAction === 'CAPITALIZE') showToast('Recebimento registrado e saldo restante capitalizado!', 'success');
          else if (partialAction === 'RENEW_KEEP_PENDING') showToast('Recebimento registrado e ciclo renovado com saldo pendente!', 'success');
          else showToast('Recebimento registrado com sucesso!', 'success');

          ui.setShowReceipt({
              loan,
              inst,
              amountPaid: result.amountToPay || amountToReceive,
              type: result.paymentType || 'PAYMENT'
          });
          ui.openModal('RECEIPT');
          onRefresh();
      } catch (e: any) {
          if (instantSettlementCreated) {
              try {
                  await paymentOffersService.cancel(loan, inst, 'Condição automática cancelada após falha no recebimento.');
              } catch (cancelError) {
                  console.error('[Payment] Falha ao cancelar condição automática após erro:', cancelError);
              }
          }
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
