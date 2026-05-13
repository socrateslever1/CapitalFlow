
import { supabase } from '../../../lib/supabase';
import { Agreement, Loan, UserProfile, LegalDocumentParams, LegalDocumentRecord } from '../../../types';
import { generateSHA256, createLegalSnapshot } from '../../../utils/crypto';
import { isUUID, safeUUID } from '../../../utils/uuid';
import { fetchWithRetry } from '../../../utils/fetchWithRetry';

const resolveDocumentAccessToken = (row: any): string | undefined =>
  row?.view_token || row?.public_access_token || undefined;

const PENDING_DOCUMENT_STATUSES = new Set(['PENDENTE', 'PENDING']);

const normalizeDocumentStatus = (status: any): string =>
  String(status || 'PENDENTE').toUpperCase().trim();

const mapLegalDocumentRecord = (row: any): LegalDocumentRecord => ({
  id: row.id,
  loanId: row.loan_id,
  agreementId: row.acordo_id,
  type: row.tipo,
  snapshot: row.snapshot,
  hashSHA256: row.hash_sha256,
  status: row.status_assinatura === 'ASSINADO' ? 'SIGNED' : 'PENDING',
  status_assinatura: row.status_assinatura,
  public_access_token: resolveDocumentAccessToken(row),
  view_token: row.view_token || undefined,
  created_at: row.created_at
});

export const legalService = {
  prepareDocumentParams: (loan: Loan, activeUser: UserProfile, agreement?: Agreement): LegalDocumentParams => {
    // Para fins jurídicos, a dívida confessada é o Total a Receber (Principal + Juros Acordados)
    const valorConfessado = agreement?.negotiatedTotal || loan.totalToReceive;

    return {
      loanId: loan.id,
      clientName: loan.debtorName,
      debtorName: loan.debtorName,
      debtorDoc: loan.debtorDocument,
      debtorPhone: loan.debtorPhone,
      debtorAddress: loan.debtorAddress || 'Endereço não informado',
      creditorName: activeUser.fullName || activeUser.businessName || activeUser.name,
      creditorDoc: activeUser.document || 'Não informado',
      creditorAddress: activeUser.address || `${activeUser.city || 'Manaus'} - ${activeUser.state || 'AM'}`,
      amount: loan.principal,
      totalDebt: valorConfessado,
      originDescription: agreement ? `Instrumento particular de crédito ID ${loan.id.substring(0, 8)} consolidado via Acordo nº ${agreement.id.substring(0, 8)}. O valor engloba o capital principal e os juros remuneratórios pactuados.` : `Instrumento particular de crédito ID ${loan.id.substring(0, 8)}.`,
      city: activeUser.city || 'Manaus',
      state: activeUser.state || 'AM',
      witnesses: (loan as any).witnesses || [],
      contractDate: new Date(loan.startDate).toLocaleDateString('pt-BR'),
      agreementDate: agreement ? new Date(agreement.createdAt).toLocaleDateString('pt-BR') : undefined,
      installments: (agreement?.installments || loan.installments) as any[],
      billingCycle: loan.billingCycle,
      amortizationType: loan.amortizationType,
      isAgreement: !!agreement,
      timestamp: new Date().toISOString(),
      discount: agreement?.discount,
      gracePeriod: agreement?.gracePeriod,
      downPayment: agreement?.downPayment,
    };
  },

  async generateAndRegisterDocument(entityId: string, params: LegalDocumentParams, profileId: string, type?: string): Promise<LegalDocumentRecord> {
    const snapshotStr = createLegalSnapshot(params);
    const hash = await generateSHA256(snapshotStr);

    const { data: created, error } = await supabase.rpc('create_documento_juridico_by_loan', {
      p_loan_id: safeUUID(params.loanId),
      p_tipo: type || 'CONFISSAO',
      p_snapshot: params,
      p_acordo_id: safeUUID(entityId === params.loanId ? null : entityId),
      p_dono_id: safeUUID(profileId)
    });

    if (error) throw new Error(`Falha na base de dados: ${error.message}`);
    
    let row = Array.isArray(created) ? created[0] : created;

    if (row?.id && !resolveDocumentAccessToken(row)) {
      const { data: hydratedRow } = await supabase
        .from('documentos_juridicos')
        .select('*')
        .eq('id', row.id)
        .maybeSingle();

      if (hydratedRow) {
        row = { ...row, ...hydratedRow };
      }
    }

    // ✅ GERAÇÃO AUTOMÁTICA DO TEXTO (MOTOR JURÍDICO)
    // Geramos o HTML logo após criar o registro para que o portal já tenha o conteúdo
    try {
      let renderedHtml = '';
      if (type === 'CONFISSAO' || !type) {
          const { generateConfissaoDividaHTML } = await import('../templates/ConfissaoDividaTemplate');
          renderedHtml = generateConfissaoDividaHTML(params, row.id, row.hash_sha256);
      } else {
          const { DocumentTemplates } = await import('../templates/DocumentTemplates');
          const templateFn = (DocumentTemplates as any)[type.toLowerCase()] || (DocumentTemplates as any).confissaoDivida;
          renderedHtml = templateFn(params);
      }

      if (renderedHtml) {
          await supabase.from('documentos_juridicos')
            .update({ snapshot_rendered_html: renderedHtml })
            .eq('id', row.id);
      }
    } catch (renderErr) {
      console.error('[LegalService] Erro ao pré-renderizar documento:', renderErr);
    }

    return mapLegalDocumentRecord({
      ...row,
      loan_id: params.loanId,
      acordo_id: row.acordo_id ?? entityId,
      tipo: type || 'CONFISSAO',
      snapshot: params
    });
  },

  async getVigentDocument(loanId: string, type: string) {
    const safeLoanId = safeUUID(loanId);
    if (!safeLoanId) return { data: null };

    const { data, error } = await supabase.from('documentos_juridicos')
      .select('*')
      .eq('loan_id', safeLoanId)
      .eq('tipo', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) return { data: null };

    if (!data) return { data: null };

    return { data: mapLegalDocumentRecord(data) };
  },

  async _deleteDocumentLegacy(docId: string) {
    const safeDocId = safeUUID(docId);
    if (!safeDocId) throw new Error('ID inválido');

    const { count, error: signaturesCountError } = await supabase
      .from('assinaturas_documento')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', safeDocId);

    if (signaturesCountError) throw signaturesCountError;

    if ((count || 0) > 0) {
      throw new Error('Nao e seguro apagar um documento que ja possui assinaturas registradas.');
    }

    const { error: logsError } = await supabase
      .from('logs_assinatura')
      .delete()
      .eq('documento_id', safeDocId);

    if (logsError) throw logsError;

    const { error } = await supabase.from('documentos_juridicos')
      .delete()
      .eq('id', safeDocId);

    if (error) throw error;
  },

  async listDocumentsByLoanId(loanId: string): Promise<LegalDocumentRecord[]> {
    const safeLoanId = safeUUID(loanId);
    if (!safeLoanId) return [];

    const { data, error } = await supabase.from('documentos_juridicos')
      .select('*')
      .eq('loan_id', safeLoanId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => mapLegalDocumentRecord(row));
  },

  async deleteDocuments(docIds: string[]): Promise<{ deletedIds: string[]; blockedIds: string[] }> {
    const safeDocIds = Array.from(
      new Set(docIds.map((id) => safeUUID(id)).filter((id): id is string => !!id))
    );

    if (safeDocIds.length === 0) {
      return { deletedIds: [], blockedIds: [] };
    }

    const { data: docs, error: docsError } = await supabase
      .from('documentos_juridicos')
      .select('id, status_assinatura')
      .in('id', safeDocIds);

    if (docsError) throw docsError;

    const statusById = new Map(
      (docs || []).map((doc: any) => [doc.id, normalizeDocumentStatus(doc.status_assinatura)])
    );

    const { data: signatures, error: signaturesError } = await supabase
      .from('assinaturas_documento')
      .select('document_id')
      .in('document_id', safeDocIds);

    if (signaturesError) throw signaturesError;

    const signedDocIds = new Set((signatures || []).map((row: any) => row.document_id));

    const deletableIds = safeDocIds.filter((id) => {
      const status = statusById.get(id);
      return !!status && PENDING_DOCUMENT_STATUSES.has(status) && !signedDocIds.has(id);
    });

    const blockedIds = safeDocIds.filter((id) => !deletableIds.includes(id));

    if (deletableIds.length > 0) {
      const { error: logsError } = await supabase
        .from('logs_assinatura')
        .delete()
        .in('documento_id', deletableIds);

      if (logsError) throw logsError;

      const { error: docsDeleteError } = await supabase
        .from('documentos_juridicos')
        .delete()
        .in('id', deletableIds);

      if (docsDeleteError) throw docsDeleteError;
    }

    return {
      deletedIds: deletableIds,
      blockedIds,
    };
  },

  async deleteLoanDocuments(loanId: string): Promise<{ deletedIds: string[]; blockedIds: string[] }> {
    const docs = await this.listDocumentsByLoanId(loanId);
    return this.deleteDocuments(docs.map((doc) => doc.id));
  },

  async deleteDocument(docId: string) {
    const result = await this.deleteDocuments([docId]);
    if (result.deletedIds.length === 0) {
      throw new Error('Nao e seguro apagar um documento que ja possui assinatura ou ja saiu do estado pendente.');
    }
  },

  async getDocumentByLoanId(loanId: string) {
    const safeLoanId = safeUUID(loanId);
    if (!safeLoanId) return null;

    const { data } = await supabase.from('documentos_juridicos')
      .select('*')
      .eq('loan_id', safeLoanId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? mapLegalDocumentRecord(data) : null;
  },

  async getFullAuditData(docId: string) {
    const safeDocId = safeUUID(docId);
    if (!safeDocId) return { doc: null, signatures: [], logs: [] };

    const { data: doc } = await supabase.from('documentos_juridicos').select('*').eq('id', safeDocId).single();
    if (!doc) return { doc: null, signatures: [], logs: [] };
    
    const [signaturesRes, logsRes] = await Promise.all([
      supabase.from('assinaturas_documento').select('*').eq('document_id', doc.id).order('signed_at', { ascending: true }),
      supabase.from('logs_assinatura').select('*').eq('document_id', doc.id).order('timestamp', { ascending: true })
    ]);

    return { 
      doc, 
      signatures: (signaturesRes.data || []).map((sig: any) => ({ ...sig, role: sig.papel || sig.role })), 
      logs: logsRes.data || [] 
    };
  },

  async signDocument(docId: string, profileId: string, signerInfo: { name: string; doc: string }, role: string): Promise<void> {
    const safeDocId = safeUUID(docId);
    if (!safeDocId) throw new Error('ID do documento inválido');

    let ip = '0.0.0.0';
    try { 
      const res = await fetchWithRetry('https://api.ipify.org?format=json', { maxRetries: 1 }); 
      const d = await res.json(); 
      ip = d.ip; 
    } catch {}
    const timestamp = new Date().toISOString();
    const payload = `${safeDocId}|${signerInfo.doc}|${role}|${timestamp}`;
    const hash = await generateSHA256(payload);

    const { error: signError } = await supabase.from('assinaturas_documento').insert({
      document_id: safeDocId,
      profile_id: safeUUID(profileId),
      nome: signerInfo.name.toUpperCase(),
      cpf: signerInfo.doc,
      aceitou: true,
      ip,
      signer_name: signerInfo.name.toUpperCase(),
      signer_document: signerInfo.doc,
      role,
      papel: role, // CREDOR, DEVEDOR, TESTEMUNHA_1, TESTEMUNHA_2
      assinatura_hash: hash,
      hash_assinado: hash,
      ip_origem: ip,
      user_agent: navigator.userAgent,
      signed_at: timestamp,
    });

    if (signError) throw signError;
    await supabase.from('documentos_juridicos').update({ status_assinatura: 'EM_ASSINATURA' }).eq('id', safeDocId);
  },

  async getRenderedHTML(docId: string): Promise<string> {
    const { doc, signatures } = await this.getFullAuditData(docId);
    if (!doc) throw new Error('Documento não encontrado');
    
    // Se o snapshot tiver campos do modelo V2, usa o novo template
    if (doc.snapshot?.incluirGarantia !== undefined || doc.snapshot?.incluirAvalista !== undefined) {
      const { generateConfissaoDividaV2HTML } = await import('../templates/ConfissaoDividaV2Template');
      return generateConfissaoDividaV2HTML(doc.snapshot, doc.id, doc.hash_sha256, signatures);
    }

    const { generateConfissaoDividaHTML } = await import('../templates/ConfissaoDividaTemplate');
    return generateConfissaoDividaHTML(doc.snapshot, doc.id, doc.hash_sha256, signatures);
  },

  async generatePDF(elementId: string, filename: string): Promise<void> {
    const { generatePDF } = await import('../../../utils/printHelpers');
    return generatePDF(elementId, filename);
  }
};
