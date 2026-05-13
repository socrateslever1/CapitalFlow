import React, { useMemo } from 'react';
import { ClientsPage } from '../pages/ClientsPage';
import { Client } from '../types';
import { filterClients } from '../domain/filters/clientFilters';

interface ClientsContainerProps {
  clients: Client[];
  clientSearchTerm: string;
  setClientSearchTerm: (term: string) => void;
  clientCtrl: any;
  loanCtrl: any;
  showToast: any;
  ui: any; // Added ui for accessing state
  isStealthMode?: boolean;
}

export const ClientsContainer: React.FC<ClientsContainerProps> = ({ 
  clients, clientSearchTerm, setClientSearchTerm, clientCtrl, loanCtrl, showToast, ui, isStealthMode
}) => {
  const filteredClients = useMemo(() => filterClients(clients, clientSearchTerm), [clients, clientSearchTerm]);

  return (
    <ClientsPage 
        filteredClients={filteredClients} clientSearchTerm={clientSearchTerm} setClientSearchTerm={setClientSearchTerm}
        openClientModal={clientCtrl.openClientModal} openConfirmation={loanCtrl.openConfirmation} showToast={showToast}
        isBulkDeleteMode={ui.isBulkDeleteMode}
        toggleBulkDeleteMode={clientCtrl.toggleBulkDeleteMode}
        selectedClientsToDelete={ui.selectedClientsToDelete}
        toggleClientSelection={clientCtrl.toggleClientSelection}
        executeBulkDelete={clientCtrl.executeBulkDelete}
        onDeleteClient={(id) => loanCtrl.openConfirmation({ type: 'DELETE_CLIENT', target: id })}
        isStealthMode={ui.isStealthMode}
    />
  );
};