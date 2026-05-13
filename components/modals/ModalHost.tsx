
import React from 'react';
import { useModal } from '../../contexts/ModalContext';
import { LoanModalsWrapper } from './wrappers/LoanModalsWrapper';
import { SystemModalsWrapper } from './wrappers/SystemModalsWrapper';
import { FinanceModals } from './ModalGroups';

export const ModalHost: React.FC = () => {
  const { activeModal } = useModal();

  if (!activeModal) return null;

  return (
    <>
        <LoanModalsWrapper />
        <FinanceModals />
        <SystemModalsWrapper />
    </>
  );
};
