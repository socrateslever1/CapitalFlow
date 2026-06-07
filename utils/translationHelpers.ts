
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
    'RENEGOTIATION_ABATEMENT': 'Abatimento da Renegociação',
    'AGREEMENT_SCHEDULE_UPDATED': 'Calendário do Acordo Atualizado',
    'NORMAL_UNIFICATION_CREATED': 'Unificação Normal Criada',
    'CAPITAL_ONLY_RECOVERY_ENABLED': 'Somente Capital Ativado',
    'CAPITAL_ONLY_RECOVERY_DISABLED': 'Somente Capital Removido',
    'CHARGE': 'Encargo Financeiro',
    'ARCHIVE': 'Arquivamento',
    'RESTORE': 'Restauração',
    'EXTERNAL_WITHDRAWAL': 'Resgate Externo',
  };

  if (translations[type]) return translations[type];

  return String(type || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

export const translateDocumentType = (type: string): string => {
  const translations: Record<string, string> = {
    'CONFISSAO': 'Confissão de Dívida',
    'CONFISSAO_AUTO': 'Confissão de Dívida',
    'CONFISSAO_UNICO': 'Confissão de Dívida',
    'CONFISSAO_DIVIDA': 'Confissão de Dívida',
    'NOTA_PROMISSORIA': 'Nota Promissória',
    'NOTIFICACAO': 'Notificação de Cobrança',
    'TERMO_QUITACAO': 'Termo de Quitação',
    'QUITACAO': 'Termo de Quitação',
    'ACORDO_EXTRAJUDICIAL': 'Acordo Extrajudicial',
  };

  if (translations[type]) return translations[type];

  return String(type || 'Documento')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
