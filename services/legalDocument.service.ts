// src/services/legalDocument.service.ts
import { supabasePortal } from '../lib/supabasePortal';
import { supabase } from '../lib/supabase';

export type PortalDocListItem = {
  id: string;
  tipo: string;
  status_assinatura: string;
  created_at: string;
};

export type PortalDoc = {
  id: string;
  tipo: string;
  status_assinatura: string;
  snapshot?: any;
  snapshot_rendered_html?: string | null;
  [key: string]: any;
};

export const legalDocumentService = {
  /**
   * Lista documentos disponíveis para o token do portal
   */
  async listDocs(token: string, code: string): Promise<PortalDocListItem[]> {
    const { data, error } = await supabasePortal.rpc('portal_list_docs', {
      p_token: token,
      p_shortcode: code,
    });

    if (error) throw new Error(error.message || 'Falha ao listar documentos.');
    return (data ?? []) as PortalDocListItem[];
  },

  /**
   * Busca documento específico (HTML renderizado + snapshot)
   */
  async getDoc(token: string, code: string, docId: string): Promise<PortalDoc> {
    const { data, error } = await supabasePortal
      .rpc('portal_get_doc', {
        p_token: token,
        p_shortcode: code,
        p_doc_id: docId,
      })
      .single();

    if (error) throw new Error(error.message || 'Falha ao buscar documento.');
    if (!data) throw new Error('Documento não encontrado.');

    const doc = data as any;

    return {
      id: doc.id,
      tipo: doc.tipo,
      status_assinatura: doc.status_assinatura,
      snapshot: doc.snapshot,
      snapshot_rendered_html:
        doc.snapshot_rendered_html ?? doc.rendered_html ?? null,
      ...doc,
    };
  },

  /**
   * Verifica campos faltantes antes de assinar
   */
  async missingFields(token: string, code: string, docId: string) {
    const { data, error } = await supabasePortal.rpc('portal_document_signing_check_v1', {
      p_token: token,
      p_shortcode: code,
      p_documento_id: docId,
    });

    if (error) throw new Error(error.message || 'Falha ao validar campos.');

    const payload = Array.isArray(data) ? data[0] : data;

    return payload ?? { missing: [], can_sign: false };
  },

  /**
   * Atualiza campos faltantes via RPC segura
   */
  async updateFields(token: string, code: string, docId: string, fields: Record<string, any>) {
    const { data, error } = await supabasePortal.rpc(
      'portal_patch_document_snapshot',
      {
        p_token: token,
        p_shortcode: code,
        p_documento_id: docId,
        p_patch: fields,
      }
    );

    if (error)
      throw new Error(
        error.message || 'Falha ao atualizar dados do documento.'
      );

    return Array.isArray(data) ? data[0] : data;
  },

  /**
   * Assina documento (Portal)
   */
  async signDoc(payload: {
    token: string;
    code: string;
    docId: string;
    role: string;
    name: string;
    cpf: string;
    ip: string;
    userAgent: string;
    email?: string | null;
    phone?: string | null;
    assinaturaHash?: string | null;
  }) {
    const { data, error } = await supabasePortal.rpc(
      'portal_sign_document',
      {
        p_token: payload.token,
        p_shortcode: payload.code,
        p_documento_id: payload.docId,
        p_papel: payload.role,
        p_nome: payload.name,
        p_cpf: payload.cpf,
        p_email: payload.email ?? null,
        p_phone: payload.phone ?? null,
        p_ip: payload.ip,
        p_user_agent: payload.userAgent,
        p_hash_assinado: payload.assinaturaHash ?? null,
      }
    );

    if (error)
      throw new Error(error.message || 'Falha ao assinar documento.');

    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation || confirmation.success !== true) {
      throw new Error(confirmation?.message || 'Documento não assinado. Verifique os dados.');
    }
    return confirmation;
  },

  /**
   * Solicitar ajustes no documento (Portal)
   */
  async requestAdjustment(token: string, code: string, docId: string, notes: string, signerName?: string) {
    const { data, error } = await supabasePortal.rpc('portal_patch_document_snapshot', {
      p_token: token,
      p_shortcode: code,
      p_documento_id: docId,
      p_patch: {
        status_assinatura: 'AJUSTE_SOLICITADO',
        client_adjustment_request: notes,
        client_name: signerName,
      },
    });

    if (error) throw new Error(error.message || 'Falha ao solicitar ajustes.');

    return Array.isArray(data) ? data[0] : data ?? { ok: true };
  },

  /**
   * Recusar documento (Portal)
   */
  async rejectDoc(token: string, code: string, docId: string, reason: string, signerName?: string) {
    const { data, error } = await supabasePortal.rpc('portal_patch_document_snapshot', {
      p_token: token,
      p_shortcode: code,
      p_documento_id: docId,
      p_patch: {
        status_assinatura: 'RECUSADO',
        client_refusal_reason: reason,
        client_name: signerName,
      },
    });

    if (error) throw new Error(error.message || 'Falha ao recusar documento.');

    return Array.isArray(data) ? data[0] : data ?? { ok: true };
  },

  /** Lista apenas os registros arquivados pelo usuário autenticado.
   * Arquivamento não altera o documento, a assinatura ou o ledger.
   */
  async listArchivedDocIds(): Promise<string[]> {
    const { data, error } = await supabase.from('legal_document_archive_state')
      .select('document_id');
    if (error) throw new Error('Não foi possível carregar os documentos arquivados: ' + error.message);
    return (data || []).map(row => String(row.document_id));
  },

  async archiveDoc(docId: string): Promise<void> {
    const { data: session, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !session.user) throw new Error('Sua sessão expirou. Entre novamente.');
    const { data, error } = await supabase.from('legal_document_archive_state')
      .upsert({ document_id: docId, owner_auth_id: session.user.id },
        { onConflict: 'document_id,owner_auth_id' })
      .select('document_id');
    if (error) throw new Error('Não foi possível arquivar o documento: ' + error.message);
    if (!data || data.length !== 1) throw new Error('O arquivamento não foi confirmado pelo servidor.');
  },

  async restoreDoc(docId: string): Promise<void> {
    const { data: session, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !session.user) throw new Error('Sua sessão expirou. Entre novamente.');
    const { data, error } = await supabase.from('legal_document_archive_state')
      .delete().eq('document_id',docId).eq('owner_auth_id',session.user.id)
      .select('document_id');
    if (error) throw new Error('Não foi possível restaurar o documento: ' + error.message);
    if (!data || data.length !== 1) throw new Error('O documento não foi encontrado entre os seus arquivados.');
  },

  /** Exclusão física apenas de minuta própria e sem vestígio de assinatura.
   * Documento assinado, publicado, usado em acordo ou em assinatura só pode ser arquivado.
   */
  async deleteDoc(docId: string): Promise<void> {
    const { data: session, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !session.user) throw new Error('Sua sessão expirou. Entre novamente.');
    const { data: doc, error: readError } = await supabase
      .from('documentos_juridicos')
      .select('id,profile_id,status_assinatura,signed_at,locked_at,uploaded_signed_file_path,acordo_id')
      .eq('id',docId).maybeSingle();
    if (readError) throw new Error('Falha ao conferir o documento: ' + readError.message);
    if (!doc) throw new Error('Documento não encontrado ou sem autorização.');
    const { data: profile, error: ownerError } = await supabase.from('perfis')
      .select('id').eq('id',doc.profile_id).eq('user_id',session.user.id).maybeSingle();
    if (ownerError || !profile) throw new Error('Somente o titular autenticado pode excluir suas minutas.');
    if (doc.status_assinatura !== 'PENDENTE' || doc.signed_at ||
        doc.locked_at || doc.uploaded_signed_file_path || doc.acordo_id) {
      throw new Error('Documento com efeito jurídico ou assinatura em andamento: utilize Arquivar.');
    }
    const { count, error: signaturesError } = await supabase
      .from('assinaturas_documento').select('id',{count:'exact',head:true})
      .eq('document_id',docId);
    if (signaturesError) throw new Error('Falha ao verificar assinaturas: ' + signaturesError.message);
    if (count === null) throw new Error('Não foi possível confirmar a inexistência de assinaturas.');
    if (count > 0) throw new Error('Documento possui assinatura registrada. Arquive-o sem destruir a prova.');
    const { data: agreement, error: agreementError } = await supabase
      .from('acordos_inadimplencia').select('id')
      .eq('legal_document_id',docId).limit(1);
    if (agreementError) throw new Error('Falha ao verificar vínculos com acordos: ' + agreementError.message);
    if ((agreement || []).length) throw new Error('Documento vinculado a acordo: utilize Arquivar.');
    const { data: deleted, error } = await supabase
      .from('documentos_juridicos').delete().eq('id',docId)
      .eq('profile_id',doc.profile_id).select('id');
    if (error) throw new Error('O banco recusou a exclusão: ' + error.message);
    if (!deleted || deleted.length !== 1) {
      throw new Error('Nenhum registro foi excluído. Confirme o acesso e tente novamente.');
    }
  },
};