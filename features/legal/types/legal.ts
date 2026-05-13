
export enum LegalDocumentType {
  CONFISSAO_DIVIDA = 'CONFISSAO_DIVIDA',
  NOTA_PROMISSORIA = 'NOTA_PROMISSORIA',
  TERMO_QUITACAO = 'TERMO_QUITACAO',
  ACORDO_EXTRAJUDICIAL = 'ACORDO_EXTRAJUDICIAL'
}

export enum LegalDocumentStatus {
  PENDENTE = 'PENDENTE',
  ASSINADO = 'ASSINADO',
  CANCELADO = 'CANCELADO',
  REGISTRADO_BLOCKCHAIN = 'REGISTRADO_BLOCKCHAIN' // Preparação para futuro
}

export interface LegalDocumentSnapshot {
  [key: string]: any;
}

export interface LegalDocument {
  id: string;
  profile_id: string;
  loan_id?: string;
  agreement_id?: string;
  type: LegalDocumentType;
  status: LegalDocumentStatus;
  content_snapshot: LegalDocumentSnapshot; // JSON imutável do conteúdo
  hash_sha256: string; // Hash de integridade
  created_at: string;
  updated_at?: string;
  metadata?: {
    version: string;
    origin_ip?: string;
    template_id?: string;
  };
}

export interface LegalSignature {
  id: string;
  document_id: string;
  profile_id: string;
  signer_name: string;
  signer_document: string; // CPF/CNPJ
  signed_at: string;
  signature_hash: string; // Hash do momento da assinatura (Snapshot + Metadata)
  metadata: {
    ip_address: string;
    user_agent: string;
    device_fingerprint?: string;
    auth_method: 'PASSWORD' | 'TOKEN' | 'MANUAL_ENTRY';
  };
}

export interface LegalLog {
  id: string;
  document_id: string;
  profile_id: string;
  action: 'CREATE' | 'VIEW' | 'SIGN' | 'CANCEL' | 'PRINT' | 'DOWNLOAD';
  timestamp: string;
  details?: string;
  ip_address?: string;
}
