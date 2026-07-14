
import React from 'react';
import { useLoanCardComputed } from './hooks/useLoanCardComputed';
import { LoanCardProps } from './LoanCardComposition/types';
import { getDebtorNameSafe, getNextInstallment, getNextDueDate, getDaysUntilDue } from './LoanCardComposition/helpers';

// Blocos de UI
import { Header } from './LoanCardComposition/Header';
import { QuickActions } from './LoanCardComposition/QuickActions';
import { Body } from './LoanCardComposition/Body';
import { Footer } from './LoanCardComposition/Footer';
import { Ledger } from './LoanCardComposition/Ledger';
import { isCapitalOnlyRecoveryLoan } from '../../utils/capitalOnlyRecovery';
import { useStableExpandedCardFocus } from './hooks/useStableExpandedCardFocus';

// Re-exporta a interface para manter compatibilidade
export type { LoanCardProps };

export const LoanCard: React.FC<LoanCardProps> = (props) => {
  const {
    loan, sources, isStealthMode, activeUser, onEdit, onMessage, onArchive,
    onRestore, onDelete, onNote, onPortalLink, onUploadPromissoria,
    onUploadDoc, onViewPromissoria, onViewDoc, onReviewSignal, onOpenComprovante,
    onReverseTransaction, onOpenReceipt, onRenegotiate, onActivate, onNewAporte, onAgreementPayment,
    onReverseAgreementPayment, onInstallmentPayment, onReverseInstallmentPayment, onNavigate, onLegalDocument, onRefresh, allLoans, onToggleCapitalOnly,
    isExpanded: isExpandedProp, onToggleExpand
  } = props;

  const [isExpandedInternal, setIsExpandedInternal] = React.useState(false);
  const isAccordionControlled = props.setSelectedLoanId !== undefined;
  const isExpanded = isExpandedProp !== undefined
    ? isExpandedProp
    : (isAccordionControlled ? props.selectedLoanId === loan.id : isExpandedInternal);

  const { ref: cardRef, focusCard } = useStableExpandedCardFocus<HTMLDivElement>(isExpanded, loan.id);

  // Lógica de Negócio
  const computed = useLoanCardComputed(loan, sources, isStealthMode);
  const isCapitalOnlyRecovery = isCapitalOnlyRecoveryLoan(loan);

  const {
    isLate, hasActiveAgreement, isFullyFinalized, iconStyle,
    orderedInstallments, totalDebt, activeAgreement, fixedTermStats,
    isPaid, isZeroBalance, showProgress, strategy, isDailyFree, isFixedTerm,
    nextDueDate, daysUntilDue, riskProfile
  } = computed;

  // Helpers de Apresentação
  const debtorNameSafe = getDebtorNameSafe(loan);

  // Definição da cor da borda lateral baseada no status
  const hasPendingPaymentSignal = (loan.paymentSignals || []).some((signal: any) => {
    const status = String(signal?.status || '').toUpperCase();
    return ['PENDENTE', 'PENDING'].includes(status) || !!signal?.comprovante_url || !!signal?.comprovanteUrl;
  });
  const hasPendingPortalFile = (loan.portalFiles || []).some((file: any) => {
    const status = String(file?.status || '').toUpperCase();
    return file?.direction === 'CLIENT_TO_OPERATOR' && ['PENDING', 'PENDENTE'].includes(status);
  });
  const hasUnreadClientMessage = Number((loan as any).supportUnreadCount || 0) > 0;
  const hasPendingPortalAction = hasPendingPaymentSignal || hasPendingPortalFile || hasUnreadClientMessage;

  let borderLeftColor = "border-l-slate-700"; // Padrão
  if (isFullyFinalized) borderLeftColor = "border-l-emerald-500";
  else if (isCapitalOnlyRecovery) borderLeftColor = "border-l-rose-600";
  else if (hasActiveAgreement) borderLeftColor = "border-l-indigo-500";
  else if (isLate) borderLeftColor = "border-l-rose-500 cf-overdue-card-pulse";
  else if (daysUntilDue <= 3) borderLeftColor = "border-l-amber-500";
  else borderLeftColor = "border-l-blue-500";

  const handleCardClick = (e: React.MouseEvent) => {
    // Se clicar em botões ou links internos, não faz nada
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }

    if (isExpanded) {
      focusCard();
      return;
    }

    if (!isExpanded) {
      if (onToggleExpand) {
        onToggleExpand(e);
      } else if (isAccordionControlled && props.setSelectedLoanId) {
        props.setSelectedLoanId(loan.id);
      } else {
        setIsExpandedInternal(true);
      }
    }
  };

  const handleToggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand({} as React.MouseEvent);
    } else if (isAccordionControlled && props.setSelectedLoanId) {
      props.setSelectedLoanId(isExpanded ? null : loan.id);
    } else {
      setIsExpandedInternal(!isExpandedInternal);
    }
  };

  const handleNavigate = (e?: React.MouseEvent | React.KeyboardEvent | string) => {
    if (typeof e === 'object' && e?.stopPropagation) {
      e.stopPropagation();
    }
    if (onNavigate) {
      onNavigate(loan.id);
    }
  };

  const keepCardOpen = React.useCallback(() => {
    if (isAccordionControlled && props.setSelectedLoanId && props.selectedLoanId !== loan.id) {
      props.setSelectedLoanId(loan.id);
    }
    window.setTimeout(() => focusCard(), 0);
  }, [focusCard, isAccordionControlled, loan.id, props]);

  return (
    <div
      ref={cardRef}
      className={`responsive-card relative overflow-hidden transition-all duration-300 rounded-lg border border-slate-800 bg-slate-900 hover:border-slate-700 hover:shadow-xl hover:shadow-slate-900/50 group cursor-pointer border-l-4 ${borderLeftColor} ${hasPendingPortalAction ? 'cf-portal-action-pulse' : ''} ${isExpanded ? 'ring-2 ring-blue-500/20' : ''}`}
      onClick={handleCardClick}
      onDoubleClick={handleNavigate}
    >
      {/* Container Principal com Padding */}
      <div className="space-y-3 flex flex-col h-full">
        <Header
          loan={loan}
          debtorNameSafe={debtorNameSafe}
          isFullyFinalized={isFullyFinalized}
          isLate={isLate}
          hasActiveAgreement={hasActiveAgreement}
          daysUntilDue={daysUntilDue}
          nextDueDate={nextDueDate}
          iconStyle={iconStyle}
          isStealthMode={isStealthMode}
          isExpanded={isExpanded}
          currentDebt={totalDebt}
          onToggleExpand={handleToggleExpand}
          onNavigate={handleNavigate}
          onMarkAsBilled={props.onMarkAsBilled}
          riskProfile={riskProfile}
          isCapitalOnlyRecovery={isCapitalOnlyRecovery}
        />

        {isExpanded && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <QuickActions
              hasNotes={!!loan.notes}
              onMessage={(e) => {
                e.stopPropagation();
                keepCardOpen();
                onMessage(loan);
                // Cobrança automática ao enviar mensagem
                if (isLate || daysUntilDue < 0) {
                  props.onMarkAsBilled?.(loan);
                }
              }}
              onNote={(e) => { e.stopPropagation(); keepCardOpen(); onNote(loan); }}
              onPortalLink={(e) => { e.stopPropagation(); keepCardOpen(); onPortalLink(loan); }}
              onViewDoc={(e, url) => { e.stopPropagation(); keepCardOpen(); onViewDoc(url); }}
              onUploadPromissoria={(e) => { e.stopPropagation(); keepCardOpen(); onUploadPromissoria?.(loan); }}
              onUploadDoc={(e) => { e.stopPropagation(); keepCardOpen(); onUploadDoc(loan); }}
              onEdit={(e) => { e.stopPropagation(); keepCardOpen(); onEdit(loan); }}
              onNavigate={handleNavigate}
            />

            <Body
              hasActiveAgreement={hasActiveAgreement}
              loan={loan}
              activeUser={activeUser}
              activeAgreement={activeAgreement}
              onRefresh={onRefresh}
              onAgreementPayment={(loanArg, agreement, inst, amount, forgiveLateFee) => {
                keepCardOpen();
                onAgreementPayment(loanArg, agreement, inst, amount, forgiveLateFee);
              }}
              onReverseAgreementPayment={(loanArg, agreement, inst) => {
                keepCardOpen();
                onReverseAgreementPayment?.(loanArg, agreement, inst);
              }}
              onInstallmentPayment={(loanArg, inst, debt, amount, options) => {
                keepCardOpen();
                onInstallmentPayment?.(loanArg, inst, debt, amount, options);
              }}
              onReverseInstallmentPayment={(loanArg, inst) => {
                keepCardOpen();
                onReverseInstallmentPayment?.(loanArg, inst);
              }}
              orderedInstallments={orderedInstallments}
              fixedTermStats={fixedTermStats}
              isPaid={isPaid}
              isLate={isLate}
              isZeroBalance={isZeroBalance}
              isFullyFinalized={isFullyFinalized}
              showProgress={showProgress}
              strategy={strategy}
              isDailyFree={isDailyFree}
              isFixedTerm={isFixedTerm}
              isStealthMode={isStealthMode}
              allLoans={allLoans}
              onNavigate={handleNavigate}
              onLegalDocument={(path) => {
                keepCardOpen();
                onLegalDocument?.(path);
              }}
              daysUntilDue={daysUntilDue}
            />

            {loan.ledger && loan.ledger.length > 0 && (
              <Ledger
                allLedger={loan.ledger}
                loan={loan}
                onReverseTransaction={(transaction, loanArg) => {
                  keepCardOpen();
                  onReverseTransaction(transaction, loanArg);
                }}
                onOpenReceipt={onOpenReceipt
                  ? (transaction, loanArg) => {
                    keepCardOpen();
                    onOpenReceipt(transaction, loanArg);
                  }
                  : undefined}
                isStealthMode={isStealthMode}
              />
            )}

            <Footer
              loan={loan}
              onArchive={() => { keepCardOpen(); onArchive(loan); }}
              onRestore={() => { keepCardOpen(); onRestore(loan); }}
              onDelete={() => { keepCardOpen(); onDelete(loan); }}
              onRenegotiate={() => { keepCardOpen(); onRenegotiate(loan); }}
              onActivate={() => { keepCardOpen(); onActivate(loan); }}
              onNewAporte={() => { keepCardOpen(); onNewAporte(loan); }}
              onToggleCapitalOnly={() => { keepCardOpen(); onToggleCapitalOnly?.(loan); }}
              onEdit={(e) => { e.stopPropagation(); keepCardOpen(); onEdit(loan); }}
              isFullyFinalized={isFullyFinalized}
              hasActiveAgreement={hasActiveAgreement}
              isLate={isLate}
            />
          </div>
        )}
      </div>
    </div>
  );
};
