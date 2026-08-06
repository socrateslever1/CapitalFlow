import { formatBRDate } from '../../../utils/dateHelpers';

import { supabase } from '../../../lib/supabase';
import { Agreement, Loan, UserProfile, LegalDocumentParams, LegalDocumentRecord } from '../../../types';
import { generateSHA256, createLegalSnapshot } from '../../../utils/crypto';
import { isUUID, safeUUID } from '../../../utils/uuid';
import { fetchWithRetry } from '../../../utils/fetchWithRetry';
import { buildCapitalOnlyLegalTerms } from '../domain/capitalOnlyLegalTerms';
import { buildPreContractNotice } from './preContractNotice';
import { isValidCPForCNPJ } from '../../../utils/validators';

const resolveDocumentAccessToken = (row: any): string | undefined =>
  row?.view_token || row?.public_access_token || undefined;

const PENDING_DOCUMENT_STATUSES = new Set(['PENDENTE', 'PENDING']);

const normalizeDocumentStatus = (status: any): string =>
  String(status || 'PENDENTE').toUpperCase().trim();

const normalizeSignatureRole = (value: string | null | undefined): string => {
  const role = String(value || '').trim().toUpperCase();

  if (role === 'DEVEDOR' || role === 'DEBTOR') return 'DEBTOR';
  if (role === 'CREDOR' || role === 'CREDITOR') return 'CREDITOR';
  if (role === 'AVALISTA' || role === 'GUARANTOR') return 'AVALISTA';
  if (role.startsWith('TESTEMUNHA_')) return role.replace('TESTEMUNHA_', 'WITNESS_');
  if (role.startsWith('WITNESS_')) return role;
  if (role === 'TESTEMUNHA' || role === 'WITNESS') return 'WITNESS_1';

  return role;
};

const isMissingAddress = (value?: string) => {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  return !normalized || normalized.includes('endereco nao informado') || normalized === 'nao informado';
};

const validateDocumentParams = (params: LegalDocumentParams): string[] => {
  const errors: string[] = [];
  const principalAmount = Number(params.principalAmount ?? params.amount ?? 0);
  const legalTotal = Number(params.legalTotalAmount ?? params.totalDebt ?? params.amount ?? 0);
  const installmentTotal = (params.installments || []).reduce(
    (sum, installment: any) => sum + (Number(installment.amount) || 0),
    0,
  );
  const promissoryAmount = Number((params as any).promissoryAmount ?? legalTotal);

  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    errors.push('Nao existe saldo de capital em aberto para gerar a confissao de divida.');
  }

  if (!params.debtorDoc || !isValidCPForCNPJ(params.debtorDoc)) {
    errors.push('CPF ou CNPJ do devedor invalido.');
  }

  if (isMissingAddress(params.debtorAddress)) {
    errors.push('Endereco do devedor ausente.');
  }

  if (params.legalReconciliation && !params.legalReconciliation.isReconciled) {
    errors.push('Saldo juridico nao esta reconciliado com o capital operacional.');
  }

  if (params.installments?.length && Math.abs(installmentTotal - legalTotal) > 0.01) {
    errors.push('O cronograma juridico nao corresponde ao total juridico previsto.');
  }

  if (Math.abs(promissoryAmount - legalTotal) > 0.01) {
    errors.push('A nota promissoria possui valor diferente da obrigacao juridica.');
  }

  if (params.legalReconciliation && Math.abs(params.legalReconciliation.capitalDifferenceAmount) > 0.01) {
    errors.push('Ha divergencia entre capital pago e saldo restante.');
  }

  return Array.from(new Set(errors));
};

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
  async enqueuePreContractNotice(
    document: LegalDocumentRecord,
    loan: Loan,
    profileId: string,
    links: { signUrl?: string | null; portalUrl?: string | null },
  ): Promise<{ queued: boolean }> {
    const safeProfileId = safeUUID(profileId);
    const safeClientId = safeUUID(loan.clientId);
    const safeDocumentId = safeUUID(document.id);
    const safeLoanId = safeUUID(loan.id);

    if (!safeProfileId || !safeClientId || !safeDocumentId || !safeLoanId) {
      throw new Error('Cliente, documento ou contrato invalido para o aviso do pre-contrato.');
    }

    const { data: client, error: clientError } = await supabase
      .from('clientes')
      .select('name, phone')
      .eq('id', safeClientId)
      .eq('owner_id', safeProfileId)
      .maybeSingle();

    if (clientError) throw new Error(`Falha ao consultar o cliente: ${clientError.message}`);
    if (!client) throw new Error('Cliente cadastrado nao encontrado para este contrato.');

    const phone = String(client.phone || '').replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 13) {
      throw new Error('Telefone do cliente nao cadastrado ou invalido.');
    }

    const notice = buildPreContractNotice({
      clientName: client.name,
      signUrl: links.signUrl,
      portalUrl: links.portalUrl,
    });
    const dedupeKey = `precontract:${safeDocumentId}:client`;

    const { data, error } = await supabase
      .from('whatsapp_queue')
      .upsert({
        profile_id: safeProfileId,
        phone,
        message: `[[CF_CUSTOM]] ${notice.message}`,
        status: 'PENDING',
        loan_id: safeLoanId,
        dedupe_key: dedupeKey,
      }, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();

    if (error) throw new Error(`Falha ao enfileirar o aviso do pre-contrato: ${error.message}`);
    return { queued: !!data?.id };
  },

  prepareDocumentParams: (loan: Loan, activeUser: UserProfile, agreement?: Agreement): LegalDocumentParams => {
    // Para fins jurídicos, a dívida confessada é o Total a Receber (Principal + Juros Acordados)
    const legalTerms = buildCapitalOnlyLegalTerms(loan, agreement);

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
      amount: legalTerms.legalTotalAmount,
      principalAmount: legalTerms.principalAmount,
      originalPrincipalAmount: legalTerms.originalPrincipalAmount,
      principalPaidAmount: legalTerms.principalPaidAmount,
      legalInterestRatePercent: legalTerms.legalInterestRatePercent,
      legalInterestAmount: legalTerms.legalInterestAmount,
      legalTotalAmount: legalTerms.legalTotalAmount,
      legalReconciliation: legalTerms.reconciliation,
      totalDebt: legalTerms.legalTotalAmount,
      originDescription: agreement ? `Saldo de capital efetivamente disponibilizado no instrumento particular de crédito ID ${loan.id.substring(0, 8)}, reorganizado pelo Acordo nº ${agreement.id.substring(0, 8)}.` : `Saldo de capital efetivamente disponibilizado no instrumento particular de crédito ID ${loan.id.substring(0, 8)}.`,
      city: activeUser.city || 'Manaus',
      state: activeUser.state || 'AM',
      witnesses: (loan as any).witnesses || [],
      contractDate: formatBRDate(loan.startDate),
      agreementDate: agreement ? new Date(agreement.createdAt).toLocaleDateString('pt-BR') : undefined,
      installments: legalTerms.installments,
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
    const principalOnlyAmount = Number(params.principalAmount ?? params.amount ?? 0);
    const legalTotalAmount = Number(params.legalTotalAmount ?? params.totalDebt ?? params.amount ?? 0);
    if (!Number.isFinite(principalOnlyAmount) || principalOnlyAmount <= 0) {
      throw new Error('Nao existe saldo de capital em aberto para gerar a confissao de divida.');
    }

    const validationErrors = validateDocumentParams(params);
    if (validationErrors.length > 0) {
      throw new Error(`Documento juridico bloqueado: ${validationErrors.join(' ')}`);
    }

    const { data: signedDocs, error: signedDocsError } = await supabase
      .from('documentos_juridicos')
      .select('id, snapshot, hash_sha256, status_assinatura, created_at')
      .eq('loan_id', safeUUID(params.loanId))
      .eq('tipo', type || 'CONFISSAO')
      .eq('status_assinatura', 'ASSINADO')
      .order('created_at', { ascending: false })
      .limit(5);

    if (signedDocsError) throw signedDocsError;

    const conflictingSignedDoc = (signedDocs || []).find((doc: any) => {
      const snapshot = doc?.snapshot || {};
      const signedPrincipal = Number(snapshot.principalAmount ?? snapshot.amount ?? 0);
      const signedTotal = Number(snapshot.legalTotalAmount ?? snapshot.totalDebt ?? snapshot.amount ?? 0);
      return Math.abs(signedPrincipal - principalOnlyAmount) > 0.01
        || Math.abs(signedTotal - legalTotalAmount) > 0.01;
    });

    if (conflictingSignedDoc) {
      throw new Error('Ja existe documento assinado conflitante para este contrato. Revise o historico juridico antes de gerar outro.');
    }

    params = {
      ...params,
      amount: legalTotalAmount,
      principalAmount: principalOnlyAmount,
      legalTotalAmount,
      totalDebt: legalTotalAmount,
    };

    const installmentTotal = (params.installments || []).reduce(
      (sum, installment) => sum + (Number(installment.amount) || 0),
      0,
    );
    if (params.installments?.length && Math.abs(installmentTotal - legalTotalAmount) > 0.01) {
      throw new Error('O cronograma juridico nao corresponde ao total juridico previsto.');
    }

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

    if (error || !data) return { data: null };

    return { data: mapLegalDocumentRecord(data) };
  },

  async listDocumentsByLoanId(loanId: string, debtorDoc?: string, debtorName?: string): Promise<LegalDocumentRecord[]> {
    const safeLoanId = safeUUID(loanId);
    const cleanDoc = String(debtorDoc || '').replace(/\D/g, '');
    const cleanName = String(debtorName || '').trim();

    try {
      let query = supabase.from('documentos_juridicos').select('*');

      if (safeLoanId && cleanDoc) {
        query = query.or(`loan_id.eq.${safeLoanId},snapshot->>debtorDoc.ilike.%${cleanDoc}%`);
      } else if (safeLoanId) {
        query = query.eq('loan_id', safeLoanId);
      } else if (cleanDoc) {
        query = query.or(`snapshot->>debtorDoc.ilike.%${cleanDoc}%,snapshot->>debtorName.ilike.%${cleanName}%`);
      } else if (cleanName) {
        query = query.ilike('snapshot->>debtorName', `%${cleanName}%`);
      } else {
        return [];
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        if (safeLoanId) {
          const { data: fallbackData } = await supabase.from('documentos_juridicos')
            .select('*')
            .eq('loan_id', safeLoanId)
            .order('created_at', { ascending: false });
          return (fallbackData || []).map((row: any) => mapLegalDocumentRecord(row));
        }
        return [];
      }

      return (data || []).map((row: any) => mapLegalDocumentRecord(row));
    } catch {
      if (safeLoanId) {
        const { data: fallbackData } = await supabase.from('documentos_juridicos')
          .select('*')
          .eq('loan_id', safeLoanId)
          .order('created_at', { ascending: false });
        return (fallbackData || []).map((row: any) => mapLegalDocumentRecord(row));
      }
      return [];
    }
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

    const deletableIds = safeDocIds.filter((id) => !signedDocIds.has(id));

    const blockedIds = safeDocIds.filter((id) => !deletableIds.includes(id));

    if (deletableIds.length > 0) {
      const { error: logsError } = await supabase
        .from('logs_assinatura')
        .delete()
        .in('documento_id', deletableIds);

      if (logsError) console.warn(logsError);

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
    const normalizedRole = normalizeSignatureRole(role);
    const payload = `${safeDocId}|${signerInfo.doc}|${normalizedRole}|${timestamp}`;
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
      role: normalizedRole,
      papel: normalizedRole,
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
    
    if (doc.snapshot?.incluirGarantia !== undefined || doc.snapshot?.incluirAvalista !== undefined) {
      const { generateConfissaoDividaV2HTML } = await import('../templates/ConfissaoDividaV2Template');
      return generateConfissaoDividaV2HTML(doc.snapshot, doc.id, doc.hash_sha256, signatures);
    }

    const { generateConfissaoDividaHTML } = await import('../templates/ConfissaoDividaTemplate');
    return generateConfissaoDividaHTML(doc.snapshot, doc.id, doc.hash_sha256, signatures);
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

  async generatePDF(elementId: string, filename: string): Promise<void> {
    const { generatePDF } = await import('../../../utils/printHelpers');
    return generatePDF(elementId, filename);
  }
};
