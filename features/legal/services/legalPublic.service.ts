// src/features/legal/services/legalPublic.service.ts
import { supabase } from '../../../lib/supabase';
import { LegalDocumentParams } from '../../../types';
import { legalValidityService } from './legalValidity.service';
import { safeUUID } from '../../../utils/uuid';

const normalizeSignatureRole = (value: string | null | undefined) => {
  const role = String(value || '').trim().toUpperCase();

  if (role === 'DEVEDOR' || role === 'DEBTOR') return 'DEBTOR';
  if (role === 'CREDOR' || role === 'CREDITOR') return 'CREDITOR';
  if (role === 'AVALISTA' || role === 'GUARANTOR') return 'AVALISTA';
  if (role.startsWith('TESTEMUNHA_')) return role.replace('TESTEMUNHA_', 'WITNESS_');
  if (role.startsWith('WITNESS_')) return role;
  if (role === 'TESTEMUNHA' || role === 'WITNESS') return 'WITNESS';

  return role;
};

const resolveRequiredRoles = (snapshot: any) => {
  const requiredRoles = new Set<string>();

  if (snapshot?.debtorName) requiredRoles.add('DEBTOR');
  if (snapshot?.creditorName) requiredRoles.add('CREDITOR');

  const witnesses = Array.isArray(snapshot?.witnesses) ? snapshot.witnesses.filter(Boolean) : [];
  witnesses.forEach((_: any, index: number) => {
    requiredRoles.add(`WITNESS_${index + 1}`);
  });

  if (snapshot?.incluirAvalista && snapshot?.avalistaNome) {
    requiredRoles.add('AVALISTA');
  }

  return Array.from(requiredRoles);
};

const extractPublicAccessToken = (doc: any) => doc?.view_token || doc?.public_access_token || null;

export const legalPublicService = {
  /**
   * Gera link público de assinatura (uso administrativo)
   * Não acessa tabela direto — usa RPC
   */
  async generateSigningLink(documentId: string): Promise<string> {
    const safeDocId = safeUUID(documentId);
    if (!safeDocId) throw new Error('ID do documento inválido');

    const { data, error } = await supabase.rpc('get_documento_juridico_by_id', {
      p_document_id: safeDocId,
    });

    if (error || !data || data.length === 0) {
      throw new Error('Documento não encontrado.');
    }

    const accessToken = extractPublicAccessToken(data[0]);
    if (!accessToken) {
      throw new Error('Documento sem token publico de assinatura.');
    }

    return `${window.location.origin}/?legal_sign=${accessToken}`;
  },

  /**
   * Busca documento público pelo token
   * via RPC SECURITY DEFINER
   */
  async fetchDocumentByToken(token: string) {
    const { data, error } = await supabase.rpc('get_documento_juridico_by_view_token', {
      p_view_token: token,
    });

    if (error || !data || data.length === 0) {
      console.error('RPC fetchDocumentByToken error:', error);
      throw new Error('Título não localizado ou link inválido.');
    }

    const doc = data[0];
    let html = doc.snapshot_rendered_html;

    // Fallback: se o HTML não foi pré-renderizado (docs antigos), gera agora
    if (!html && doc.snapshot) {
      try {
        const { signatures } = await legalPublicService.getAuditByToken(token);

        if (doc.tipo === 'CONFISSAO' || !doc.tipo) {
          const { generateConfissaoDividaHTML } = await import('../templates/ConfissaoDividaTemplate');
          html = generateConfissaoDividaHTML(doc.snapshot as any, doc.id, doc.hash_sha256, signatures);
        } else {
          const { generateConfissaoDividaV2HTML } = await import('../templates/ConfissaoDividaV2Template');
          html = generateConfissaoDividaV2HTML(doc.snapshot as any, doc.id, doc.hash_sha256, signatures);
        }
      } catch (e) {
        console.error('Erro no fallback de renderização:', e);
      }
    }

    return {
      ...doc,
      snapshot: doc.snapshot as LegalDocumentParams,
      snapshot_rendered_html: html,
    };
  },

  /**
   * Auditoria pública (somente leitura)
   */
  async getAuditByToken(token: string) {
    const { data, error } = await supabase.rpc('get_documento_juridico_by_view_token', {
      p_view_token: token,
    });

    if (error || !data || data.length === 0) {
      return { signatures: [] };
    }

    const docId = data[0].id;
    const safeDocId = safeUUID(docId);
    if (!safeDocId) return { signatures: [] };

    const { data: signatures } = await supabase
      .from('assinaturas_documento')
      .select('*')
      .eq('document_id', safeDocId);

    return {
      signatures: (signatures || []).map((sig: any) => ({
        ...sig,
        role: normalizeSignatureRole(sig.papel || sig.role),
      })),
    };
  },

  /**
   * Assinatura pública
   * leitura via RPC
   * sem query direta em documentos_juridicos para busca do token
   */
  async signDocumentPublicly(
    token: string,
    signerInfo: { name: string; doc: string; role: string; signatureImage?: string },
    deviceInfo: { ip: string; userAgent: string }
  ) {
    const { data, error } = await supabase.rpc('get_documento_juridico_by_view_token', {
      p_view_token: token,
    });

    if (error || !data || data.length === 0) {
      throw new Error('Documento inválido ou acesso negado.');
    }

    const doc = data[0];
    const safeDocId = safeUUID(doc.id);
    if (!safeDocId) throw new Error('ID do documento inválido');

    const normalizedRole = normalizeSignatureRole(signerInfo.role);
    const requiredRoles = resolveRequiredRoles(doc.snapshot);

    const { data: existingSignatures, error: signaturesError } = await supabase
      .from('assinaturas_documento')
      .select('*')
      .eq('document_id', safeDocId);

    if (signaturesError) {
      throw new Error('Falha ao verificar assinaturas existentes.');
    }

    const normalizedSignedRoles = new Set(
      (existingSignatures || []).map((sig: any) => normalizeSignatureRole(sig.papel || sig.role))
    );

    if (normalizedSignedRoles.has(normalizedRole)) {
      throw new Error('Este papel já assinou o documento.');
    }

    if (requiredRoles.length > 0 && requiredRoles.every((item) => normalizedSignedRoles.has(item))) {
      throw new Error('Documento já finalizado.');
    }

    const timestamp = new Date().toISOString();
    const signaturePayload = `${token}|${signerInfo.doc}|${normalizedRole}|${timestamp}|${
      signerInfo.signatureImage ? 'WITH_IMAGE' : 'NO_IMAGE'
    }`;
    const signatureHash = await legalValidityService.calculateHash(signaturePayload);

    const { error: insertError } = await supabase.from('assinaturas_documento').insert({
      document_id: safeDocId,
      profile_id: doc.profile_id,
      nome: signerInfo.name.toUpperCase(),
      cpf: signerInfo.doc,
      aceitou: true,
      ip: deviceInfo.ip,
      signer_name: signerInfo.name.toUpperCase(),
      signer_document: signerInfo.doc,
      role: normalizedRole,
      papel: normalizedRole,
      assinatura_hash: signatureHash,
      hash_assinado: signatureHash,
      ip_origem: deviceInfo.ip,
      user_agent: deviceInfo.userAgent,
      signed_at: timestamp,
      assinatura_imagem: signerInfo.signatureImage,
      dispositivo_info: {
        ip: deviceInfo.ip,
        userAgent: deviceInfo.userAgent,
        platform: navigator.platform,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
      },
    });

    if (insertError) {
      throw new Error('Falha ao registrar assinatura.');
    }

    normalizedSignedRoles.add(normalizedRole);
    const nextStatus =
      requiredRoles.length > 0 && requiredRoles.every((item) => normalizedSignedRoles.has(item))
        ? 'ASSINADO'
        : 'EM_ASSINATURA';

    const { error: updateError } = await supabase
      .from('documentos_juridicos')
      .update({
        status_assinatura: nextStatus,
        updated_at: timestamp,
      })
      .eq('id', safeDocId);

    if (updateError) {
      console.warn(
        'Aviso: Falha ao atualizar status do documento, mas assinatura foi registrada:',
        updateError.message
      );
    }

    return true;
  },
};
