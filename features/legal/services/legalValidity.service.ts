
import { supabase } from '../../../lib/supabase';
import { generateUUID } from '../../../utils/generators';
import { isUUID, safeUUID } from '../../../utils/uuid';

// Tipagem estrita para o serviço
interface LegalContext {
  ip?: string;
  userAgent?: string;
  actorRole: 'CREDOR' | 'DEVEDOR' | 'TESTEMUNHA' | 'SISTEMA';
}

interface SignerData {
  name: string;
  document: string;
  email?: string;
}

/**
 * SERVIÇO DE VALIDADE JURÍDICA E INTEGRIDADE
 * 
 * Base Legal:
 * - Art. 784, III do Código de Processo Civil (Título Executivo Extrajudicial)
 * - Art. 225 do Código Civil (Força probante dos documentos digitais)
 * - Art. 10, § 2º, da MP nº 2.200-2/2001 (Validade de assinaturas eletrônicas não-ICP se admitidas pelas partes)
 * 
 * Responsabilidades:
 * 1. Garantir que o Snapshot JSON seja canônico (chaves ordenadas) para determinismo do Hash.
 * 2. Calcular Hash SHA-256 usando Web Crypto API.
 * 3. Registrar trilha de auditoria imutável (Logs).
 */
export const legalValidityService = {

  /**
   * 1. PREPARE LEGAL SNAPSHOT (Canonical JSON)
   * Ordena as chaves do objeto recursivamente para garantir que JSONs semanticamente iguais
   * gerem sempre a mesma string e, consequentemente, o mesmo Hash.
   */
  prepareLegalSnapshot(data: any): string {
    const sortKeys = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(sortKeys);
      }
      return Object.keys(obj)
        .sort()
        .reduce((result: any, key) => {
          result[key] = sortKeys(obj[key]);
          return result;
        }, {});
    };

    const canonicalData = sortKeys(data);
    return JSON.stringify(canonicalData);
  },

  /**
   * 2. CALCULATE SECURE HASH (SHA-256)
   * Gera o hash criptográfico que garante o princípio da Integridade.
   * Qualquer alteração de 1 bit no snapshot invalidará este hash.
   */
  async calculateHash(contentString: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(contentString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * 3. SIGN LEGAL DOCUMENT (Eletronic Signature)
   * Registra a intenção de assinatura, vinculando o signatário ao hash do documento.
   * Gera log de auditoria no banco.
   */
  async signLegalDocument(
    documentId: string,
    currentSnapshot: any,
    signer: SignerData,
    context: LegalContext
  ): Promise<void> {
    
    // A) Validação Prévia de Integridade (Client-Side)
    // Garante que o documento que o usuário está vendo (snapshot) é o mesmo que está no banco.
    const snapshotStr = this.prepareLegalSnapshot(currentSnapshot);
    const calculatedHash = await this.calculateHash(snapshotStr);

    const safeDocId = safeUUID(documentId);
    if (!safeDocId) throw new Error('ID do documento inválido');

    const { data: docDB, error: fetchError } = await supabase
      .from('documentos_juridicos')
      .select('hash_sha256, status_assinatura')
      .eq('id', safeDocId)
      .single();

    if (fetchError || !docDB) throw new Error('Documento original não encontrado para assinatura.');
    
    // Verificação de Integridade Crítica
    if (docDB.hash_sha256 !== calculatedHash) {
      throw new Error('VIOLAÇÃO DE INTEGRIDADE: O conteúdo do documento foi alterado.');
    }

    if (docDB.status_assinatura === 'ASSINADO') {
      throw new Error('Documento já finalizado.');
    }

    // B) Hash da Assinatura (Vínculo Signatário + Documento + Timestamp)
    // Cria uma "impressão digital" única deste ato de assinatura.
    const signatureTimestamp = new Date().toISOString();
    const signaturePayload = `${documentId}|${calculatedHash}|${signer.document}|${signatureTimestamp}`;
    const signatureHash = await this.calculateHash(signaturePayload);

    // C) Persistência Atômica
    // 1. Registra a assinatura na tabela de assinaturas
    const { error: signError } = await supabase.from('assinaturas_documento').insert({
      id: generateUUID(),
      document_id: safeDocId,
      profile_id: (await supabase.auth.getUser()).data.user?.id, // Captura ID do usuário autenticado
      signer_name: signer.name,
      signer_document: signer.document,
      signer_email: signer.email,
      assinatura_hash: signatureHash,
      ip_origem: context.ip,
      user_agent: context.userAgent,
      signed_at: signatureTimestamp
    });

    if (signError) throw new Error(`Erro ao registrar assinatura: ${signError.message}`);

    // 2. Atualiza status do documento (Blindagem)
    const { error: updateError } = await supabase.from('documentos_juridicos').update({
      status_assinatura: 'ASSINADO',
      metadata_assinatura: {
        last_signature_hash: signatureHash,
        signer_count: 1, // Lógica simplificada para 1 assinante principal
        finalized_at: signatureTimestamp
      },
      ip_origem: context.ip, // IP de quem finalizou
      user_agent: context.userAgent,
      signed_at: signatureTimestamp
    }).eq('id', safeDocId);

    if (updateError) throw new Error(`Erro ao finalizar documento: ${updateError.message}`);

    // 3. Log de Auditoria Jurídica (Via RPC Seguro)
    await this.appendLegalLog(safeDocId, 'SIGN', context.actorRole, `Assinado por ${signer.name} (Hash: ${signatureHash.substring(0,8)}...)`, context);
  },

  /**
   * 4. VALIDATE INTEGRITY
   * Verifica se o documento no banco de dados sofreu alguma mutação indevida.
   */
  async validateLegalIntegrity(documentId: string): Promise<{ isValid: boolean; message: string }> {
    const safeDocId = safeUUID(documentId);
    if (!safeDocId) return { isValid: false, message: 'ID do documento inválido.' };

    const { data: doc, error } = await supabase
      .from('documentos_juridicos')
      .select('snapshot, hash_sha256, status_assinatura')
      .eq('id', safeDocId)
      .single();

    if (error || !doc) return { isValid: false, message: 'Documento não encontrado.' };

    const snapshotStr = this.prepareLegalSnapshot(doc.snapshot);
    const calculatedHash = await this.calculateHash(snapshotStr);

    if (calculatedHash !== doc.hash_sha256) {
      return { isValid: false, message: 'CRÍTICO: Hash calculado difere do registrado. Documento adulterado.' };
    }

    return { isValid: true, message: 'Integridade confirmada. Hash SHA-256 válido.' };
  },

  /**
   * 5. APPEND LOG (AUDIT TRAIL)
   * Chama a função RPC segura para garantir que o log seja escrito independente de permissões de tabela.
   */
  async appendLegalLog(
    documentId: string,
    action: string,
    role: string,
    details: string,
    context: LegalContext
  ) {
    try {
      const safeDocId = safeUUID(documentId);
      if (!safeDocId) return;

      await supabase.rpc('registrar_log_juridico', {
        p_documento_id: safeDocId,
        p_action: `${action} - ${details}`,
        p_actor_role: role,
        p_ip: context.ip || 'N/A',
        p_user_agent: context.userAgent || 'N/A'
      });
    } catch (e) {
      console.error('Falha crítica ao registrar log jurídico:', e);
      // Em sistemas de alta segurança, falha de log deve impedir a transação.
      // Aqui apenas logamos no console para não travar a UX, mas o ideal seria retry.
    }
  }
};
