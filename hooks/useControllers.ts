// src/hooks/useControllers.ts
import { useLoanController } from './controllers/useLoanController';
import { useClientController } from './controllers/useClientController';
import { useSourceController } from './controllers/useSourceController';
import { useProfileController } from './controllers/useProfileController';
import { usePaymentController } from './controllers/usePaymentController';
import { useFileController } from './controllers/useFileController';
import { useAIController } from './controllers/useAIController';
import { useAdminController } from './controllers/useAdminController';

import type { UserProfile, Loan, Client, CapitalSource } from '../types';

export const useControllers = (
  activeUser: UserProfile | null,
  ui: any,
  loans: Loan[],
  setLoans: any,
  clients: Client[],
  setClients: any,
  sources: CapitalSource[],
  setSources: any,
  setActiveUser: any,
  setIsLoadingData: any,
  fetchFullData: (id: string) => Promise<void>,
  fetchAllUsers: () => Promise<void>,
  handleLogout: () => void,
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void,
  profileEditForm: UserProfile | null,
  setProfileEditForm: any
) => {
  const loanCtrl = useLoanController(
    activeUser,
    ui,
    sources,
    setSources,
    loans,
    setLoans,
    clients,
    setClients,
    fetchFullData,
    showToast
  );

  const clientCtrl = useClientController(
    activeUser,
    ui,
    clients,
    setClients,
    fetchFullData,
    showToast
  );

  const sourceCtrl = useSourceController(
    activeUser,
    ui,
    sources,
    setSources,
    setActiveUser,
    fetchFullData,
    showToast
  );

  const paymentCtrl = usePaymentController(
    activeUser,
    ui,
    sources,
    loans,
    setLoans,
    setActiveUser,
    fetchFullData,
    showToast
  );

  const profileCtrl = useProfileController(
    activeUser,
    ui,
    profileEditForm,
    setProfileEditForm,
    setActiveUser,
    setIsLoadingData,
    fetchFullData,
    handleLogout,
    showToast
  );

  const adminCtrl = useAdminController(activeUser, ui, fetchAllUsers, showToast);

  const fileCtrl = useFileController(ui, sources, showToast);

  const aiCtrl = useAIController(loans, clients, ui, showToast);

  return {
    loanCtrl,
    clientCtrl,
    sourceCtrl,
    paymentCtrl,
    profileCtrl,
    adminCtrl,
    fileCtrl,
    aiCtrl,
  };
};