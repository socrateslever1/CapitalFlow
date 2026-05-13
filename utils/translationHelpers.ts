
export const translateTransactionType = (type: string): string => {
  const translations: Record<string, string> = {
    'LOAN_INITIAL': 'Contrato Inicial',
    'INITIAL': 'Inicial',
    'LEND_MORE': 'Novo Aporte',
    'PAYMENT_FULL': 'Quitação',
    'PAYMENT_PARTIAL': 'Pagamento Parcial',
    'PAYMENT': 'Pagamento',
    'RENEW_INTEREST': 'Renovação (Juros)',
    'RENEW_AV': 'Renovação com Aporte',
    'ADJUSTMENT': 'Ajuste',
    'ESTORNO': 'Estorno',
    'NOVO_APORTE': 'Novo Aporte',
    'AGREEMENT_PAYMENT': 'Pagamento de Acordo',
    'AGREEMENT_PAYMENT_REVERSED': 'Estorno de Acordo',
    'FULL': 'Quitação Total',
    'CUSTOM': 'Personalizado',
    'PARTIAL_INTEREST': 'Juros Parciais',
    'SYSTEM': 'Sistema',
    'AUDIT': 'Auditoria',
    'PAYMENT_PROFIT': 'Lucro (Juros)',
    'payment_profit': 'Lucro (Juros)',
    'PAYMENT_PRINCIPAL': 'Retorno de Capital',
    'payment_principal': 'Retorno de Capital',
    'PAYMENT_LATE_FEE': 'Multa/Mora',
    'payment_late_fee': 'Multa/Mora',
    'PAYMENT_INTEREST': 'Lucro (Juros)',
    'payment_interest': 'Lucro (Juros)',
    'PAYMENT_INTEREST_ONLY': 'Pagamento de Juros',
    'payment_interest_only': 'Pagamento de Juros',
    'RENEWAL': 'Renovação',
    'renewal': 'Renovação',
    'WITHDRAWAL': 'Resgate',
    'withdrawal': 'Resgate',
    'DEPOSIT': 'Depósito',
    'deposit': 'Depósito',
    'TRANSFER': 'Transferência',
    'transfer': 'Transferência',
    'RENEGOTIATION_CREATED': 'Renegociação Criada',
    'RENEGOTIATION_BROKEN': 'Renegociação Quebrada',
    'CHARGE': 'Encargo Financeiro',
    'ARCHIVE': 'Arquivamento',
    'RESTORE': 'Restauração',
    'EXTERNAL_WITHDRAWAL': 'Resgate Externo',
  };

  return translations[type] || type;
};

export const translateLoanStatus = (status: string): string => {
  const translations: Record<string, string> = {
    'PENDING': 'Pendente',
    'PAID': 'Quitado',
    'LATE': 'Atrasado',
    'PARTIAL': 'Parcial',
    'OVERDUE': 'Atrasado',
    'ACTIVE': 'Ativo',
    'BROKEN': 'Quebrado',
    'ARCHIVED': 'Arquivado',
    'RENEGOTIATED': 'Renegociado',
    'PAGO': 'Quitado',
    'ATRASADO': 'Atrasado',
    'ATIVO': 'Ativo',
    'CANCELADO': 'Cancelado',
  };

  return translations[status] || status;
};

export const translateFilter = (filter: string): string => {
  const translations: Record<string, string> = {
    'TODOS': 'Todos',
    'ATRASADOS': 'Atrasados',
    'ATRASO_CRITICO': 'Críticos',
    'EM_DIA': 'Em Dia',
    'QUITADO': 'Quitados',
    'PAGOS': 'Quitados',
    'RENEGOCIADO': 'Renegociados',
    'ARQUIVADOS': 'Arquivados',
    'PENDENTES': 'Pendentes',
  };

  return translations[filter] || filter;
};
