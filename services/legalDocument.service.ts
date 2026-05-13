// src/services/legalDocument.service.ts
import { supabasePortal } from '../lib/supabasePortal';

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
  async missingFields(docId: string) {
    const { data, error } = await supabasePortal.rpc('rpc_doc_missing_fields', {
      p_documento_id: docId,
    });

    if (error) throw new Error(error.message || 'Falha ao validar campos.');

    const payload = Array.isArray(data) ? data[0] : data;

    return payload ?? { missing: [], can_sign: false };
  },

  /**
   * Atualiza campos faltantes via RPC segura
   */
  async updateFields(docId: string, fields: Record<string, any>) {
    const { data, error } = await supabasePortal.rpc(
      'rpc_doc_patch_snapshot',
      {
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

    return Array.isArray(data) ? data[0] : data ?? { ok: true };
  },
};