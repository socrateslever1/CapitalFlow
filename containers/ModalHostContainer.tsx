
import React from 'react';
import { ModalHost } from '../components/modals/ModalHost';
import { UserProfile, Client, CapitalSource, Loan } from '../types';
import { ModalProvider } from '../contexts/ModalContext';
import { filesService } from '../services/files.service';

interface ModalHostContainerProps {
  ui: any;
  activeUser: UserProfile | null;
  clients: Client[];
  sources: CapitalSource[];
  loans: Loan[];
  // Fix: Added missing isLoadingData to ModalHostContainerProps
  isLoadingData: boolean;
  loanCtrl: any;
  clientCtrl: any;
  sourceCtrl: any;
  paymentCtrl: any;
  profileCtrl: any;
  adminCtrl: any;
  fileCtrl: any;
  aiCtrl: any;
  showToast: any;
  fetchFullData: any;
  handleLogout: any;
}

export const ModalHostContainer: React.FC<ModalHostContainerProps> = (props) => {
  const { ui, activeUser, fetchFullData, showToast } = props;

  return (
    <ModalProvider 
        activeModal={ui?.activeModal}
        openModal={ui?.openModal}
        closeModal={ui?.closeModal}
        {...props}
    >
       <ModalHost />
       
       {/* File Inputs Hidden Refs - Mantidos aqui para acesso via ref do hook ui */}
       <input type="file" ref={ui?.promissoriaFileInputRef} className="hidden" accept="image/*,application/pdf" onChange={(e) => filesService.handlePromissoriaUpload(e.target.files?.[0] as File, activeUser, String(ui?.promissoriaUploadLoanId), showToast, fetchFullData)}/>
       <input type="file" ref={ui?.extraDocFileInputRef} className="hidden" accept="image/*,application/pdf" onChange={(e) => filesService.handleExtraDocUpload(e.target.files?.[0] as File, activeUser, String(ui?.extraDocUploadLoanId), 'CONFISSAO', showToast, fetchFullData)}/>
    </ModalProvider>
  );
};
