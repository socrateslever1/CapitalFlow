import { supabase } from '../lib/supabase';

export type LegalDocumentSummary = {
  id: string;
  loanId: string;
  type: string;
  status: string;
  token: string;
  createdAt: string;
};

export const legalOperationsService = {
  async listDocumentsForLoans(loanIds: string[]): Promise<LegalDocumentSummary[]> {
    const ids = Array.from(new Set(loanIds.filter(Boolean)));
    if (ids.length === 0) return [];

    const { data, error } = await supabase
      .from('documentos_juridicos')
      .select('id, loan_id, tipo, status_assinatura, view_token, public_access_token, created_at')
      .in('loan_id', ids)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Dossier] Falha ao carregar documentos juridicos:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      loanId: row.loan_id,
      type: row.tipo || 'CONFISSAO',
      status: String(row.status_assinatura || 'PENDENTE').toUpperCase(),
      token: row.view_token || row.public_access_token || '',
      createdAt: row.created_at,
    }));
  },
};
