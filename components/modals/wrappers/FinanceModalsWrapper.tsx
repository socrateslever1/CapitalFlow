
import React from 'react';
import { useModal } from '../../../contexts/ModalContext';
import { FinanceModals } from '../ModalGroups';
import { PaymentManagerModal } from '../PaymentManagerModal';
import { Loan } from '../../../types';

export const FinanceModalsWrapper = () => {
    const { activeModal, closeModal, ui, paymentCtrl } = useModal();

    // Modais Financeiros Básicos (Source, AddFunds, Withdraw)
    if (['SOURCE_FORM', 'ADD_FUNDS', 'WITHDRAW'].includes(activeModal?.type || '')) {
        return <FinanceModals />;
    }

    // Modal de Pagamento (Requer validação extra do payload)
    if (activeModal?.type === 'PAYMENT') {
        if (!ui.paymentModal || !ui.paymentModal.loan || !ui.paymentModal.inst) return null;
        
        return (
            <PaymentManagerModal 
                data={ui.paymentModal} 
                onClose={closeModal} 
                isProcessing={ui.isProcessingPayment} 
                paymentType={ui.paymentType} 
                setPaymentType={ui.setPaymentType} 
                avAmount={ui.avAmount} 
                setAvAmount={ui.setAvAmount} 
                onConfirm={paymentCtrl.handlePayment} 
                onOpenMessage={(l: Loan) => { ui.setMessageModalLoan(l); ui.openModal('MESSAGE_HUB'); }} 
            />
        );
    }

    return null;
};
