import { useState, useRef, useCallback, useEffect } from 'react';
import type { CapitalSource, Loan, Client, Installment, AgreementInstallment } from '../types';
import type { ModalType, ModalState } from '../contexts/ModalContext';

// Estado agrupado para pagamento (suporta parcela normal ou parcela de acordo)
interface PaymentState {
  loan: Loan;
  inst: Installment | AgreementInstallment;
  calculations: any;
}

const DEFAULT_CLIENT_FORM = {
  name: '',
  phone: '',
  document: '',
  email: '',
  address: '',
  city: '',
  state: '',
  notes: '',
  fotoUrl: '',
};

const DEFAULT_SOURCE_FORM = {
  name: '',
  type: 'BANK',
  balance: '',
  operador_permitido_id: '',
};

export const useUiState = () => {
  const [activeModal, setActiveModal] = useState<ModalState | null>(null);

  const [showNavHub, setShowNavHub] = useState(false);
  const [isStealthMode, setIsStealthMode] = useState(false);
  const [mobileDashboardTab, setMobileDashboardTab] = useState<'CONTRACTS' | 'BALANCE'>('CONTRACTS');

  // Controllers de UI para edição
  const [noteText, setNoteText] = useState('');
  const [noteModalLoan, setNoteModalLoan] = useState<Loan | null>(null);

  const [editingSource, setEditingSource] = useState<CapitalSource | null>(null);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(() => {
    return localStorage.getItem('cm_selected_loan_id');
  });

  useEffect(() => {
    if (selectedLoanId) {
      localStorage.setItem('cm_selected_loan_id', selectedLoanId);
    } else {
      localStorage.removeItem('cm_selected_loan_id');
    }
  }, [selectedLoanId]);

  // Master / Admin
  const [masterEditUser, setMasterEditUser] = useState<any>(null);
  const [sacSearch, setSacSearch] = useState('');

  // Estados de Processamento
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Forms e Inputs
  const [clientForm, setClientForm] = useState({ ...DEFAULT_CLIENT_FORM });
  const [clientDraftAccessCode, setClientDraftAccessCode] = useState<string>('');
  const [clientDraftNumber, setClientDraftNumber] = useState<string>('');

  const [sourceForm, setSourceForm] = useState({ ...DEFAULT_SOURCE_FORM });
  const [addFundsValue, setAddFundsValue] = useState('');

  // Payment Logic State
  const [paymentModal, setPaymentModal] = useState<PaymentState | null>(null);
  const [paymentType, setPaymentType] = useState<'FULL' | 'RENEW_INTEREST' | 'RENEW_AV' | 'LEND_MORE' | 'CUSTOM'>('FULL');
  const [avAmount, setAvAmount] = useState('');
  const [showReceipt, setShowReceipt] = useState<{
    loan: Loan;
    inst: Installment | AgreementInstallment;
    amountPaid: number;
    type: string;
  } | null>(null);

  // Context Modals Data
  const [renegotiationModalLoans, setRenegotiationModalLoans] = useState<Loan[]>([]);
  const [newAporteModalLoan, setNewAporteModalLoan] = useState<Loan | null>(null);
  const [messageModalLoan, setMessageModalLoan] = useState<Loan | null>(null);

  const [withdrawValue, setWithdrawValue] = useState('');
  const [withdrawSourceId, setWithdrawSourceId] = useState('');

  const [refundChecked, setRefundChecked] = useState(true);

  // Confirmations
  const [confirmation, setConfirmation] = useState<{
    type: 'DELETE' | 'ARCHIVE' | 'RESTORE' | 'DELETE_CLIENT' | 'DELETE_SOURCE' | 'REVERSE_TRANSACTION';
    target: any;
    title?: string;
    message?: string;
    showRefundOption?: boolean;
    extraData?: any;
  } | null>(null);

  // Upload Helpers State
  const [promissoriaUploadLoanId, setPromissoriaUploadLoanId] = useState<string | null>(null);
  const [extraDocUploadLoanId, setExtraDocUploadLoanId] = useState<string | null>(null);
  const [extraDocKind, setExtraDocKind] = useState<'CONFISSAO' | null>(null);

  // Import Logic State
  const [importSheets, setImportSheets] = useState<any[]>([]);
  const [importSheetNames, setImportSheetNames] = useState<string[]>([]);
  const [importCurrentSheet, setImportCurrentSheet] = useState<any>(null);
  const [importMapping, setImportMapping] = useState<Record<string, number>>({});
  const [importCandidates, setImportCandidates] = useState<any[]>([]);
  const [selectedImportIndices, setSelectedImportIndices] = useState<number[]>([]);

  // Bulk Actions
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [selectedClientsToDelete, setSelectedClientsToDelete] = useState<string[]>([]);

  // Danger Zone
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [deleteAccountAgree, setDeleteAccountAgree] = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState('');

  // Refs
  const promissoriaFileInputRef = useRef<HTMLInputElement>(null);
  const extraDocFileInputRef = useRef<HTMLInputElement>(null);
  const clientAvatarInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const fileInputExcelRef = useRef<HTMLInputElement>(null);

  // =========================
  // Reset Helpers (reutilizáveis)
  // =========================
  const resetClientForm = useCallback(() => {
    setClientForm({ ...DEFAULT_CLIENT_FORM });
    setClientDraftAccessCode('');
    setClientDraftNumber('');
    setEditingClient(null);
  }, []);

  const resetSourceForm = useCallback(() => {
    setSourceForm({ ...DEFAULT_SOURCE_FORM });
    setAddFundsValue('');
    setEditingSource(null);
  }, []);

  const resetPaymentState = useCallback(() => {
    setPaymentModal(null);
    setPaymentType('FULL');
    setAvAmount('');
    setIsProcessingPayment(false);
  }, []);

  const resetNotes = useCallback(() => {
    setNoteText('');
    setNoteModalLoan(null);
  }, []);

  const resetImports = useCallback(() => {
    setImportSheets([]);
    setImportSheetNames([]);
    setImportCurrentSheet(null);
    setImportMapping({});
    setImportCandidates([]);
    setSelectedImportIndices([]);
  }, []);

  const openModal = useCallback((type: ModalType, payload?: any) => {
    setActiveModal({ type, payload });
  }, []);

  const closeModal = useCallback(() => {
    // fecha modal
    setActiveModal(null);

    // limpa “acessórios” de modal que vazam fácil
    setConfirmation(null);
    setRefundChecked(true);

    // notes
    resetNotes();

    // pagamento
    resetPaymentState();
    setShowReceipt(null);

    // bulk delete
    setIsBulkDeleteMode(false);
    setSelectedClientsToDelete([]);

    // modais auxiliares
    setRenegotiationModalLoans([]);
    setNewAporteModalLoan(null);
    setMessageModalLoan(null);

    // upload targets
    setPromissoriaUploadLoanId(null);
    setExtraDocUploadLoanId(null);
    setExtraDocKind(null);

    // withdraw
    setWithdrawValue('');
    setWithdrawSourceId('');

    // import
    resetImports();

    // forms “não destrutivos”:
    // ⚠️ não zeramos editingLoan aqui por padrão, porque tem modal que fecha e você ainda está no fluxo do contrato.
    // Controllers (Loan/Client/Source) devem limpar o editing* quando finalizar a ação.
  }, [resetNotes, resetPaymentState, resetImports]);

  return {
    // modal
    activeModal,
    openModal,
    closeModal,

    // helpers de reset (úteis pros controllers)
    resetClientForm,
    resetSourceForm,
    resetPaymentState,
    resetNotes,
    resetImports,

    // ui
    showNavHub,
    setShowNavHub,
    isStealthMode,
    setIsStealthMode,
    mobileDashboardTab,
    setMobileDashboardTab,

    // notes
    noteText,
    setNoteText,
    noteModalLoan,
    setNoteModalLoan,

    // editing
    editingSource,
    setEditingSource,
    editingLoan,
    setEditingLoan,
    editingClient,
    setEditingClient,

    // selection
    selectedLoanId,
    setSelectedLoanId,

    // receipt
    showReceipt,
    setShowReceipt,

    // master/admin
    masterEditUser,
    setMasterEditUser,
    sacSearch,
    setSacSearch,

    // processing
    isSaving,
    setIsSaving,
    isProcessingPayment,
    setIsProcessingPayment,

    // client form
    clientForm,
    setClientForm,
    clientDraftAccessCode,
    setClientDraftAccessCode,
    clientDraftNumber,
    setClientDraftNumber,

    // source form
    sourceForm,
    setSourceForm,
    addFundsValue,
    setAddFundsValue,

    // payment
    paymentModal,
    setPaymentModal,
    paymentType,
    setPaymentType,
    avAmount,
    setAvAmount,

    // context modals
    renegotiationModalLoans,
    setRenegotiationModalLoans,
    newAporteModalLoan,
    setNewAporteModalLoan,
    messageModalLoan,
    setMessageModalLoan,

    // withdraw
    withdrawValue,
    setWithdrawValue,
    withdrawSourceId,
    setWithdrawSourceId,

    // confirmations
    refundChecked,
    setRefundChecked,
    confirmation,
    setConfirmation,

    // uploads
    promissoriaUploadLoanId,
    setPromissoriaUploadLoanId,
    extraDocUploadLoanId,
    setExtraDocUploadLoanId,
    extraDocKind,
    setExtraDocKind,

    // import
    importSheets,
    setImportSheets,
    importSheetNames,
    setImportSheetNames,
    importCurrentSheet,
    setImportCurrentSheet,
    importMapping,
    setImportMapping,
    importCandidates,
    setImportCandidates,
    selectedImportIndices,
    setSelectedImportIndices,

    // bulk
    isBulkDeleteMode,
    setIsBulkDeleteMode,
    selectedClientsToDelete,
    setSelectedClientsToDelete,

    // danger zone
    resetPasswordInput,
    setResetPasswordInput,
    deleteAccountAgree,
    setDeleteAccountAgree,
    deleteAccountConfirm,
    setDeleteAccountConfirm,

    // refs
    promissoriaFileInputRef,
    extraDocFileInputRef,
    clientAvatarInputRef,
    profilePhotoInputRef,
    fileInputExcelRef,
  };
};