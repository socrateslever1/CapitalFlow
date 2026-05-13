
import React from 'react';
import { Loan, CapitalSource, Client, Installment, LoanStatus, UserProfile, LedgerEntry, PaymentType } from '../types';
import { addDaysUTC, parseDateOnlyUTC, toISODateOnlyUTC, getDaysDiff, todayDateOnlyUTC } from '../utils/dateHelpers';
import { generateUniqueAccessCode, generateUniqueClientNumber } from '../utils/generators';

// Tipos para as funções de atualização de estado do React
type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export const demoService = {
  
  handleSaveLoan: (
    loan: Loan,
    editingLoan: Loan | null,
    sources: CapitalSource[],
    setSources: SetState<CapitalSource[]>,
    loans: Loan[],
    setLoans: SetState<Loan[]>,
    showToast: (msg: string, type?: 'success'|'error') => void
  ) => {
    const principal = Number(loan.principal) || 0;
    
    // Lógica de Saldo da Fonte (Estorno + Débito)
    let updatedSources = [...sources];

    // 1. Estorno (se edição)
    if (editingLoan) {
        const oldSourceId = editingLoan.sourceId;
        const oldPrincipal = Number(editingLoan.principal) || 0;
        
        // Estorno na fonte antiga
        updatedSources = updatedSources.map(s => 
            s.id === oldSourceId 
            ? { ...s, balance: s.balance + oldPrincipal } 
            : s
        );
    }

    // 2. Débito (na nova fonte ou mesma fonte já estornada)
    if (loan.sourceId) {
        updatedSources = updatedSources.map(s => 
            s.id === loan.sourceId 
            ? { ...s, balance: s.balance - principal } 
            : s
        );
    }
    setSources(updatedSources);

    // Respeita as parcelas geradas pelo formulário (seja 1 ou 30)
    // Se o formulário não gerou (fallback), cria uma padrão.
    let finalInstallments = loan.installments;
    
    if (!finalInstallments || finalInstallments.length === 0) {
        const interestRate = Number(loan.interestRate) || 0;
        const oneMonthInterest = principal * (interestRate / 100);
        const startBase = parseDateOnlyUTC(String(loan.startDate || new Date().toISOString()));
        const dueDate = toISODateOnlyUTC(addDaysUTC(startBase, 30));

        finalInstallments = [{
            id: editingLoan?.installments[0]?.id || crypto.randomUUID(),
            dueDate: dueDate,
            amount: principal + oneMonthInterest,
            scheduledPrincipal: principal,
            scheduledInterest: oneMonthInterest,
            principalRemaining: principal,
            interestRemaining: oneMonthInterest,
            lateFeeAccrued: 0,
            avApplied: 0,
            paidPrincipal: 0,
            paidInterest: 0,
            paidLateFee: 0,
            paidTotal: 0,
            status: LoanStatus.PENDING,
            logs: []
        }];
    }

    const totalToReceive = finalInstallments.reduce((acc, i) => acc + i.amount, 0);

    const newLoan: Loan = {
        ...loan,
        id: loan.id || crypto.randomUUID(),
        installments: finalInstallments,
        ledger: editingLoan?.ledger || [],
        paymentSignals: [],
        totalToReceive: totalToReceive,
        isArchived: false,
        amortizationType: 'JUROS',
        billingCycle: loan.billingCycle || 'MONTHLY',
        customDocuments: loan.customDocuments || []
    };

    if (editingLoan) {
        setLoans(loans.map(l => l.id === editingLoan.id ? newLoan : l));
        showToast('Contrato atualizado! (Modo Demonstração)', 'success');
    } else {
        setLoans([newLoan, ...loans]);
        showToast('Contrato criado! (Modo Demonstração)', 'success');
    }
  },

  handlePayment: (
    params: {
        loan: Loan, 
        inst: Installment, 
        amountToPay: number, 
        paymentType: PaymentType,
        activeUser: UserProfile,
        loans: Loan[],
        setLoans: SetState<Loan[]>,
        setActiveUser: SetState<UserProfile | null>,
        showToast: (msg: string, type?: 'success'|'error') => void,
        forgivePenalty?: boolean
    }
  ) => {
      const { loan, inst, amountToPay, paymentType, activeUser, loans, setLoans, setActiveUser, showToast, forgivePenalty } = params;

      const updatedLoans = loans.map(l => {
         if (l.id === loan.id) {
             const newInst = [...l.installments];
             const targetIndex = newInst.findIndex(i => i.id === inst.id);
             
             let newLoanState = { ...l };

             if (targetIndex > -1) {
                 if (paymentType === 'FULL') {
                     newInst[targetIndex] = { 
                         ...newInst[targetIndex], 
                         status: LoanStatus.PAID, 
                         paidDate: new Date().toISOString(), 
                         paidTotal: amountToPay,
                         principalRemaining: 0,
                         interestRemaining: 0
                     };
                 } else {
                     // RENOVAÇÃO (Demo)
                     let baseDate: Date;
                     if (forgivePenalty) {
                        baseDate = parseDateOnlyUTC(inst.dueDate);
                     } else {
                        baseDate = todayDateOnlyUTC();
                     }
                     
                     const newStartDateISO = toISODateOnlyUTC(baseDate);
                     const newDueDateISO = toISODateOnlyUTC(addDaysUTC(baseDate, 30));

                     newLoanState.startDate = newStartDateISO;

                     newInst[targetIndex] = { 
                         ...newInst[targetIndex], 
                         dueDate: newDueDateISO, 
                         status: LoanStatus.PENDING,
                         lateFeeAccrued: 0 
                     };
                 }
                 
                 // Adiciona Log Fake no Ledger
                 const newLedgerEntry: LedgerEntry = {
                     id: crypto.randomUUID(),
                     date: new Date().toISOString(),
                     type: paymentType === 'FULL' ? 'PAYMENT_FULL' : 'PAYMENT_INTEREST_ONLY',
                     amount: amountToPay,
                     principalDelta: paymentType === 'FULL' ? inst.principalRemaining : 0,
                     interestDelta: paymentType !== 'FULL' ? amountToPay : 0,
                     lateFeeDelta: 0,
                     notes: paymentType === 'FULL' ? 'Quitação (Demo)' : 'Renovação (Demo)'
                 };
                 return { ...newLoanState, installments: newInst, ledger: [...l.ledger, newLedgerEntry] };
             }
         }
         return l;
      });
      
      setLoans(updatedLoans);

      // Simula lucro no perfil
      if (paymentType !== 'FULL') {
         setActiveUser({...activeUser, interestBalance: activeUser.interestBalance + amountToPay});
      }

      showToast(paymentType !== 'FULL' ? "Renovado (Demo)" : "Quitado (Demo)", "success");
  },

  handleSaveClient: (
      clientData: any,
      editingClient: Client | null,
      clients: Client[],
      setClients: SetState<Client[]>,
      activeUser: UserProfile,
      showToast: (msg: string) => void
  ) => {
      const id = editingClient?.id || crypto.randomUUID();
      const newClient = { 
          id, 
          profile_id: activeUser.id, 
          name: clientData.name, 
          phone: clientData.phone || '00000000000', 
          email: clientData.email, 
          address: clientData.address, 
          city: clientData.city, 
          state: clientData.state,
          access_code: clientData.access_code || '0000',
          client_number: clientData.client_number || '0000',
          cpf: null, cnpj: null, 
          document: clientData.document || '00000000000', 
          notes: clientData.notes, 
          createdAt: editingClient ? editingClient.createdAt : new Date().toISOString()
      };
      
      if (editingClient) {
          setClients(clients.map(c => c.id === id ? newClient as any : c));
      } else {
          setClients([newClient as any, ...clients]);
      }
      showToast("Cliente salvo (Demo)");
  },

  executeAction: (
      type: string,
      target: any,
      loans: Loan[], setLoans: SetState<Loan[]>,
      clients: Client[], setClients: SetState<Client[]>,
      sources: CapitalSource[], setSources: SetState<CapitalSource[]>,
      showToast: (msg: string) => void
  ) => {
      let newLoans = [...loans];
      let newClients = [...clients];
      let newSources = [...sources];

      if (type === 'DELETE') {
          newLoans = newLoans.filter(l => l.id !== target.id);
      } else if (type === 'ARCHIVE') {
          newLoans = newLoans.map(l => l.id === target.id ? { ...l, isArchived: true } : l);
      } else if (type === 'RESTORE') {
          newLoans = newLoans.map(l => l.id === target.id ? { ...l, isArchived: false } : l);
      } else if (type === 'DELETE_CLIENT') {
          newClients = newClients.filter(c => c.id !== target);
      } else if (type === 'DELETE_SOURCE') {
          newSources = newSources.filter(s => s.id !== target);
      }

      setLoans(newLoans);
      setClients(newClients);
      setSources(newSources);
      showToast("Ação realizada (Modo Demo)");
  }
};
