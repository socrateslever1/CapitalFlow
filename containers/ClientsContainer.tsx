import React, { useMemo } from 'react';
import { ClientsPage } from '../pages/ClientsPage';
import { Client, Loan } from '../types';
import { filterClients } from '../domain/filters/clientFilters';

interface ClientsContainerProps {
  profileId: string;
  clients: Client[];
  loans: Loan[];
  clientSearchTerm: string;
  setClientSearchTerm: (term: string) => void;
  clientCtrl: any;
  loanCtrl: any;
  showToast: any;
  ui: any; // Added ui for accessing state
  isStealthMode?: boolean;
}

export const ClientsContainer: React.FC<ClientsContainerProps> = ({
  profileId, clients, loans, clientSearchTerm, setClientSearchTerm, clientCtrl, loanCtrl, showToast, ui, isStealthMode
}) => {
  const filteredClients = useMemo(() => filterClients(clients, clientSearchTerm), [clients, clientSearchTerm]);

  return (
    <ClientsPage
        profileId={profileId}
        filteredClients={filteredClients} clientSearchTerm={clientSearchTerm} setClientSearchTerm={setClientSearchTerm}
        openClientModal={clientCtrl.openClientModal} openConfirmation={loanCtrl.openConfirmation} showToast={showToast}
        isBulkDeleteMode={ui.isBulkDeleteMode}
        toggleBulkDeleteMode={clientCtrl.toggleBulkDeleteMode}
        selectedClientsToDelete={ui.selectedClientsToDelete}
        toggleClientSelection={clientCtrl.toggleClientSelection}
        executeBulkDelete={clientCtrl.executeBulkDelete}
        onDeleteClient={(id) => loanCtrl.openConfirmation({ type: 'DELETE_CLIENT', target: id })}
        loans={loans}
        isStealthMode={ui.isStealthMode}
    />
  );
};
