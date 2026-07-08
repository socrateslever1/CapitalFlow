import { supabasePortal } from '../lib/supabasePortal';
import { safeUUID } from '../utils/uuid';
import {
  enqueuePortalPaymentIntent,
  getOutboxStats,
  listPendingOutbox,
  markOutboxAttempted,
  loadPortalSnapshot,
  markOutboxFailed,
  markOutboxSynced,
  requeueDeadOutboxItems,
  savePortalSnapshot,
} from './offline/portalOfflineStore';

function asRpcArray<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload) return [];
  return [payload as T];
}

export const portalService = {
  _flushPromise: null as Promise<{ processed: number; synced: number; failed: number }> | null,

  async saveOfflineSnapshot(token: string, code: string, payload: any) {
    if (!token || !code) return;
    await savePortalSnapshot({
      token,
      code,
      savedAt: new Date().toISOString(),
      payload: {
        clientData: payload?.clientData ?? null,
        contracts: asRpcArray(payload?.contracts),
        fullLoanData: payload?.fullLoanData ?? null,
        installments: asRpcArray(payload?.installments),
        signals: asRpcArray(payload?.signals),
        documents: asRpcArray(payload?.documents),
      },
    });
  },

  async loadOfflineSnapshot(token: string, code: string) {
    return loadPortalSnapshot(token, code);
  },

  /**
   * Marca o portal como visualizado (registro de log/acesso)
   */
  async markViewed(token: string, code: string) {
    if (!token || !code) return;
    try {
      await supabasePortal.rpc('portal_mark_viewed', {
        p_token: token,
        p_shortcode: code
      });
    } catch (e) {
      console.warn('Falha ao registrar visualizacao:', e);
    }
  },

  /**
   * Busca dados basicos do cliente usando as credenciais do portal.
   */
  async fetchClientByPortal(token: string, code: string) {
    const { data, error } = await supabasePortal
      .rpc('portal_get_client', { p_token: token, p_shortcode: code })
      .single();

    if (error || !data) return null;
    return (data as any).portal_get_client || data;
  },

  /**
   * Lista contratos do cliente usando as credenciais do portal.
   */
  async fetchClientContractsByPortal(token: string, code: string) {
    const { data, error } = await supabasePortal
      .rpc('portal_list_contracts', { p_token: token, p_shortcode: code });

    if (error) throw new Error('Falha ao listar contratos.');
    return asRpcArray(data);
  },

  /**
   * Carrega dados completos do contrato (parcelas, sinais, etc) usando credenciais do portal.
   */
  async fetchLoanDetailsByPortal(token: string, code: string) {
    const { data: installments, error: instErr } = await supabasePortal
      .rpc('portal_get_parcels', { p_token: token, p_shortcode: code });

    if (instErr) throw new Error('Erro ao carregar parcelas.');

    let signals: any[] = [];
    try {
      const { data: sig } = await supabasePortal
        .rpc('portal_get_signals', { p_token: token, p_shortcode: code });
      if (sig) signals = asRpcArray(sig);
    } catch {}

    return { installments: asRpcArray(installments), signals };
  },

  async fetchPortalFiles(token: string, code: string) {
    try {
      const { data, error } = await supabasePortal
        .rpc('portal_get_files', { p_token: token, p_shortcode: code });

      if (error) return [];
      return asRpcArray(data);
    } catch {
      return [];
    }
  },

  /**
   * Busca o contrato completo com parcelas e sinalizacoes usando credenciais do portal.
   */
  async fetchFullLoanByPortal(token: string, code: string) {
    const { data, error } = await supabasePortal
      .rpc('portal_get_full_loan', { p_token: token, p_shortcode: code })
      .single();

    if (error || !data) return null;
    return (data as any).portal_get_full_loan || data;
  },

  /**
   * Registra intencao de pagamento via portal_token (com fila offline).
   */
  async submitPaymentIntentByPortalToken(token: string, code: string, tipo: string, comprovanteUrl?: string | null) {
    if (!token || !code) throw new Error('Credenciais do portal incompletas.');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueuePortalPaymentIntent(token, code, tipo, comprovanteUrl);
      return { queued: true, offline: true };
    }

    const { data, error } = await supabasePortal.rpc('portal_registrar_intencao', {
      p_token: token,
      p_shortcode: code,
      p_tipo: tipo,
      p_comprovante_url: comprovanteUrl ?? null
    });

    if (error) {
      throw new Error(error.message || 'Falha ao registrar o pagamento no portal.');
    }

    return data;
  },

  async flushPortalOutbox() {
    if (this._flushPromise) return this._flushPromise;

    this._flushPromise = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { processed: 0, synced: 0, failed: 0 };
    }

    let processed = 0;
    let synced = 0;
    let failed = 0;
    const pending = await listPendingOutbox();
    for (const item of pending) {
      if (item.type !== 'PORTAL_PAYMENT_INTENT' || !item.id) continue;
      processed += 1;

      try {
        await markOutboxAttempted(item.id);
        const { error } = await supabasePortal.rpc('portal_registrar_intencao', {
          p_token: item.token,
          p_shortcode: item.code,
          p_tipo: item.payload.tipo,
          p_comprovante_url: item.payload.comprovanteUrl ?? null
        });

        if (error) {
          await markOutboxFailed(item.id, error.message || 'sync_failed');
          failed += 1;
          continue;
        }

        await markOutboxSynced(item.id);
        synced += 1;
      } catch (err: any) {
        await markOutboxFailed(item.id, err?.message || 'sync_exception');
        failed += 1;
      }
    }
    return { processed, synced, failed };
    })()
      .finally(() => {
        this._flushPromise = null;
      });

    return this._flushPromise;
  },

  async syncPortalOfflineQueue() {
    const result = await this.flushPortalOutbox();
    const stats = await this.getOfflineSyncStats();
    return { ...result, stats };
  },

  async getOfflineSyncStats() {
    return getOutboxStats();
  },

  async retryDeadOutbox(limit = 20) {
    const count = await requeueDeadOutboxItems(limit);
    return { requeued: count };
  },

  /**
   * Lista documentos disponiveis para o token atual
   */
  async listDocuments(token: string, code: string) {
    const { data, error } = await supabasePortal
      .rpc('portal_list_docs', { p_token: token, p_shortcode: code });

    if (error) throw new Error('Falha ao listar documentos.');
    return asRpcArray(data);
  },

  /**
   * Busca o conteudo HTML de um documento especifico
   */
  async fetchDocument(token: string, code: string, docId: string) {
    const safeDocId = safeUUID(docId);
    if (!safeDocId) throw new Error('ID do documento invalido.');

    const { data, error } = await supabasePortal
      .rpc('portal_get_doc', { p_token: token, p_shortcode: code, p_doc_id: safeDocId })
      .single();

    if (error || !data) throw new Error('Falha ao carregar documento.');
    return (data as any).portal_get_doc || data;
  },

  /**
   * Verifica campos faltantes para assinatura
   */
  async docMissingFields(docId: string) {
    const safeDocId = safeUUID(docId);
    if (!safeDocId) throw new Error('ID do documento invalido.');

    const { data, error } = await supabasePortal
      .rpc('rpc_doc_missing_fields', { p_documento_id: safeDocId })
      .single();

    if (error) throw new Error('Erro ao verificar campos.');
    return data;
  },

  /**
   * Atualiza campos faltantes no snapshot do documento
   */
  async updateDocumentSnapshotFields(docId: string, patch: any) {
    const safeDocId = safeUUID(docId);
    if (!safeDocId) throw new Error('ID do documento invalido.');

    const { data, error } = await supabasePortal
      .rpc('rpc_doc_patch_snapshot', { p_documento_id: safeDocId, p_patch: patch });

    if (error) throw error;
    return data;
  },

  /**
   * Assina o documento
   */
  async signDocument(
    token: string, 
    code: string, 
    docId: string, 
    role: string, 
    name: string, 
    cpf: string, 
    ip: string, 
    userAgent: string,
    clientTimezone?: string,
    documentVersion?: string,
    portalToken?: string
  ) {
    const safeDocId = safeUUID(docId);
    if (!safeDocId) throw new Error('ID do documento invalido.');

    const normalizeSignatureRole = (value: string) => {
      const r = value.trim().toUpperCase();
      if (r === 'DEVEDOR' || r === 'DEBTOR') return 'DEBTOR';
      if (r === 'CREDOR' || r === 'CREDITOR') return 'CREDITOR';
      if (r === 'AVALISTA' || r === 'GUARANTOR') return 'AVALISTA';
      if (r.startsWith('TESTEMUNHA_')) return r.replace('TESTEMUNHA_', 'WITNESS_');
      if (r.startsWith('WITNESS_')) return r;
      if (r === 'TESTEMUNHA' || r === 'WITNESS') return 'WITNESS_1';
      return r;
    };
    const normalizedRole = normalizeSignatureRole(role);

    const { data, error } = await supabasePortal
      .rpc('portal_sign_document', {
        p_token: token,
        p_shortcode: code,
        p_documento_id: safeDocId,
        p_papel: normalizedRole,
        p_nome: name,
        p_cpf: cpf,
        p_ip: ip,
        p_user_agent: userAgent,
        p_client_timezone: clientTimezone || null,
        p_document_version: documentVersion || null,
        p_portal_token: portalToken || null
      });

    if (error) throw new Error('Erro ao assinar documento: ' + error.message);
    return data;
  },

  /**
   * Cria uma preferencia de pagamento no Mercado Pago (Cartao/PIX/Boleto)
   */
  async createMercadoPagoPreference(token: string, code: string, loanId: string, installmentId: string, amount: number) {
    if (!token || !code) throw new Error('Credenciais do portal incompletas.');

    const { data, error } = await supabasePortal.functions.invoke('mp-create-preference', {
      body: {
        loan_id: loanId,
        installment_id: installmentId,
        amount: amount,
        payment_type: 'PORTAL_PAYMENT',
        return_url: window.location.href,
        portal_token: token,
        portal_code: code
      },
    });

    if (error) {
      const msg = String((error as any)?.message || '');
      if (msg.includes('Failed to send a request to the Edge Function') || msg.includes('NOT_FOUND')) {
        throw new Error('Funcao de pagamento online indisponivel no servidor. Solicite o deploy da Edge Function mp-create-preference.');
      }
      throw new Error(error.message || 'Falha ao iniciar pagamento online.');
    }

    if (!data?.ok || !data?.init_point) {
      throw new Error(data?.error || 'Erro ao gerar link de pagamento Mercado Pago.');
    }

    return data.init_point;
  },

  /**
   * Remove um documento juridico (limpeza de portal)
   */
  async deleteDocument(docId: string) {
    const safeDocId = safeUUID(docId);
    if (!safeDocId) throw new Error('ID do documento invalido.');

    const { error } = await supabasePortal
      .from('documentos_juridicos')
      .delete()
      .eq('id', safeDocId);

    if (error) throw new Error('Erro ao excluir documento: ' + error.message);
    return true;
  }
};
