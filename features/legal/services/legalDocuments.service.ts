
import { supabase } from '../../../lib/supabase';
import { 
  LegalDocument, 
  LegalDocumentType, 
  LegalDocumentSnapshot, 
  LegalSignature, 
  LegalDocumentStatus,
  LegalLog 
} from '../types/legal';
import { generateUUID } from '../../../utils/generators';
import { safeUUID } from '../../../utils/uuid';

export const legalDocumentsService = {
  
  /**
   * Gera um Hash SHA-256 criptograficamente seguro do conteúdo.
   * Utiliza a Web Crypto API nativa do navegador.
   * Ordena as chaves do objeto para garantir determinismo (Snapshot Imutável).
   */
  async generateSecureHash(content: LegalDocumentSnapshot): Promise<string> {
    // 1. Canonicalização do JSON (ordenação de chaves)
    const orderedKeys = Object.keys(content).sort();
    const canonicalObj = orderedKeys.reduce((obj: any, key) => {
      obj[key] = content[key];
      return obj;
    }, {});
    
    const msgString = JSON.stringify(canonicalObj);
    const msgBuffer = new TextEncoder().encode(msgString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  },

  /**
   * Cria um novo documento jurídico com garantia de integridade.
   */
  async createDocument(
    profileId: string,
    type: LegalDocumentType,
    snapshot: LegalDocumentSnapshot,
    relatedEntityId?: { loanId?: string; agreementId?: string }
  ): Promise<LegalDocument> {
    const hash = await this.generateSecureHash(snapshot);
    const docId = generateUUID();
    const now = new Date().toISOString();

    const payload = {
      id: docId,
      tipo: type, // Campo obrigatório no banco (NOT NULL)
      tipo_documento: type, // Mantido para compatibilidade com migrations recentes
      status_assinatura: LegalDocumentStatus.PENDENTE,
      snapshot: snapshot,
      hash_sha256: hash,
      created_at: now,
      // Campos opcionais de relacionamento
      loan_id: safeUUID(relatedEntityId?.loanId) || null,
      acordo_id: safeUUID(relatedEntityId?.agreementId) || null,
      metadata: {
        version: '1.0',
        origin: 'SYSTEM_GENERATED'
      }
    };

    // Inserção na tabela documentos_juridicos
    const { data, error } = await supabase
      .from('documentos_juridicos')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar documento jurídico:', error);
      throw new Error(`Falha na criação do documento legal: ${error.message}`);
    }

    // Log de Auditoria Inicial
    await this.logAction(docId, profileId, 'CREATE', 'Documento gerado e hash registrado.');

    return data as LegalDocument;
  },

  /**
   * Registra uma assinatura eletrônica no documento.
   * Realiza verificação de integridade antes de assinar.
   */
  async signDocument(
    documentId: string,
    profileId: string,
    signerInfo: { name: string; document: string },
    deviceInfo: { ip: string; userAgent: string }
  ): Promise<LegalSignature> {
    const safeDocId = safeUUID(documentId);
    if (!safeDocId) throw new Error('ID do documento inválido');

    // 1. Busca documento atual para validação
    const { data: doc, error: fetchError } = await supabase
      .from('documentos_juridicos')
      .select('*')
      .eq('id', safeDocId)
      .single();

    if (fetchError || !doc) throw new Error("Documento não encontrado.");
    if (doc.status === LegalDocumentStatus.ASSINADO) throw new Error("Documento já assinado.");

    // 2. Re-validação de Integridade (Hash Check)
    const currentHash = await this.generateSecureHash(doc.content_snapshot);
    if (currentHash !== doc.hash_sha256) {
      throw new Error("VIOLAÇÃO DE INTEGRIDADE: O conteúdo do documento foi alterado.");
    }

    // 3. Preparação da Assinatura
    const signatureId = generateUUID();
    const now = new Date().toISOString();
    
    // Hash composto da assinatura (Documento Hash + Dados do Signatário + Timestamp)
    const signatureComposite = {
      docHash: currentHash,
      signer: signerInfo,
      timestamp: now,
      device: deviceInfo
    };
    const signatureHash = await this.generateSecureHash(signatureComposite);

    const signaturePayload = {
      id: signatureId,
      document_id: safeDocId,
      profile_id: profileId,
      signer_name: signerInfo.name,
      signer_document: signerInfo.document,
      signed_at: now,
      signature_hash: signatureHash,
      metadata: {
        ip_address: deviceInfo.ip,
        user_agent: deviceInfo.userAgent,
        auth_method: 'MANUAL_ENTRY'
      }
    };

    // 4. Transação Atômica (Assinatura + Atualização de Status)
    // Nota: Como Supabase client não suporta transações SQL diretas no client-side facilmente sem RPC,
    // faremos sequencial com verificação otimista. Em produção crítica, usaríamos uma RPC 'sign_legal_document'.
    
    const { data: sigData, error: sigError } = await supabase
      .from('assinaturas_documento')
      .insert(signaturePayload)
      .select()
      .single();

    if (sigError) throw new Error(`Erro ao registrar assinatura: ${sigError.message}`);

    const { error: updateError } = await supabase
      .from('documentos_juridicos')
      .update({ 
        status: LegalDocumentStatus.ASSINADO,
        updated_at: now
      })
      .eq('id', safeDocId);

    if (updateError) {
      // Rollback manual (raro, mas boa prática se não usar RPC)
      await supabase.from('assinaturas_documento').delete().eq('id', signatureId);
      throw new Error(`Erro ao atualizar status do documento: ${updateError.message}`);
    }

    await this.logAction(safeDocId, profileId, 'SIGN', `Assinado por ${signerInfo.name} (IP: ${deviceInfo.ip})`);

    return sigData as LegalSignature;
  },

  /**
   * Registra logs de auditoria jurídica imutáveis.
   */
  async logAction(
    documentId: string,
    profileId: string,
    action: LegalLog['action'],
    details?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('logs_assinatura')
      .insert({
        id: generateUUID(),
        document_id: documentId,
        profile_id: profileId,
        action: action,
        timestamp: new Date().toISOString(),
        details: details
      });

    if (error) {
      console.error("Falha silenciosa ao registrar log jurídico:", error);
      // Não lançamos erro aqui para não interromper o fluxo principal, mas em produção monitoraríamos isso.
    }
  },

  /**
   * Busca um documento pelo ID e verifica sua integridade atual.
   */
  async getDocumentWithIntegrityCheck(documentId: string): Promise<{ document: LegalDocument, isValid: boolean }> {
    const safeDocId = safeUUID(documentId);
    if (!safeDocId) throw new Error('ID do documento inválido');

    const { data, error } = await supabase
      .from('documentos_juridicos')
      .select('*')
      .eq('id', safeDocId)
      .single();

    if (error || !data) throw new Error("Documento não encontrado.");

    const calculatedHash = await this.generateSecureHash(data.content_snapshot);
    const isValid = calculatedHash === data.hash_sha256;

    return {
      document: data as LegalDocument,
      isValid
    };
  }
};
