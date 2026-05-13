
import React, { createContext, useContext, ReactNode } from 'react';
import { UserProfile, Client, Loan, CapitalSource } from '../types';
import { isDev } from '../utils/isDev';

export type ModalType = 
    | 'LOAN_FORM'
    | 'CLIENT_FORM'
    | 'SOURCE_FORM'
    | 'ADD_FUNDS'
    | 'PAYMENT'
    | 'WITHDRAW'
    | 'CONFIRMATION'
    | 'DONATE'
    | 'CALC'
    | 'AGENDA'
    | 'FLOW'
    | 'MESSAGE_HUB'
    | 'RECEIPT'
    | 'PROOF_VIEW'
    | 'NOTE'
    | 'IMPORT_SHEET_SELECT'
    | 'IMPORT_MAPPING'
    | 'IMPORT_PREVIEW'
    | 'DELETE_ACCOUNT'
    | 'RESET_DATA'
    | 'RENEGOTIATION'
    | 'NEW_APORTE'
    | 'AI_ASSISTANT'
    | 'SUPPORT_CHAT'
    | 'INVITE'
    | 'TEAM_EDITOR'
    | 'MEMBER_EDITOR';

export interface ModalState {
    type: ModalType;
    payload?: any;
}

interface ModalContextType {
    activeModal: ModalState | null;
    openModal: (type: ModalType, payload?: any) => void;
    closeModal: () => void;
    ui: any; 
    activeUser: UserProfile | null;
    clients: Client[];
    sources: CapitalSource[];
    loans: Loan[];
    isLoadingData: boolean;
    loanCtrl: any;
    clientCtrl: any;
    sourceCtrl: any;
    paymentCtrl: any;
    profileCtrl: any;
    adminCtrl: any;
    fileCtrl: any;
    aiCtrl: any;
    showToast: (msg: string, type?: any) => void;
    fetchFullData: (id: string) => Promise<void>;
    handleLogout: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<ModalContextType & { children: ReactNode }> = (props) => {
    const { children, ...values } = props;
    if (isDev && values.activeModal) {
        if (!values.activeModal.type) {
            console.warn("ModalContext: Tentativa de abrir modal sem tipo definido.", values.activeModal);
        }
    }
    return (
        <ModalContext.Provider value={values}>
            {children}
        </ModalContext.Provider>
    );
};

export const useModal = () => {
    const context = useContext(ModalContext);
    if (!context) throw new Error('useModal deve ser usado dentro de um ModalProvider');
    return context;
};
