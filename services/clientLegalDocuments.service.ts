import { supabase } from '../lib/supabase';
import { createLegalSnapshot, generateSHA256 } from '../utils/crypto';
import { generateMutuoPreDesembolsoHTML } from '../features/legal/templates/MutuoPreDesembolsoTemplate';

const PENDING_STATUSES = new Set(['PENDENTE', 'EM_ASSINATURA', 'AGUARDANDO_ASSINATURA']);
const SIGNED_BUCKET = 'legal-documents';
const ALLOWED_SIGNED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

export type ClientLegalDocument = {
  id: string;
  client_id: string;
  tipo: string;
  tipo_documento: string;
  status: string;
  status_assinatura: string;
  created_at: string;
  updated_at?: string | null;
  view_token?: string | null;
  public_access_token?: string | null;
  snapshot?: any;
  snapshot_json?: any;
  hash_sha256?: string | null;
  signed_at?: string | null;
  uploaded_signed_file_path?: string | null;
  uploaded_signed_file_name?: string | null;
  uploaded_signed_at?: string | null;
  document_origin?: string | null;
  signed_file_url?: string | null;
  signature_count: number;
  can_edit: boolean;
  can_delete: boolean;
  portal_url?: string | null;
};

const normalize = (value: unknown) => String(value || '').trim().toUpperCase();
const safeFileName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);

async function countSignatures(documentIds: string[]) {
  if (documentIds.length === 0) return new Map<string, number>();
  const { data, error } = await supabase.from('assinaturas_documento').select('document_id').in('document_id', documentIds);
  if (error) throw error;
  const result = new Map<string, number>();
  for (const row of data || []) {
    const id = String((row as any).document_id || '');
    result.set(id, (result.get(id) || 0) + 1);
  }
  return result;
}

async function sha256File(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function resolveOwner(clientId: string) {
  const { data: client, error } = await supabase.from('clientes').select('owner_id').eq('id', clientId).single();
  if (error || !client?.owner_id) throw new Error('Não foi possível identificar o proprietário do cliente.');
  return String(client.owner_id);
}

export const clientLegalDocumentsService = {
  async list(clientId: string): Promise<ClientLegalDocument[]> {
    const [{ data: docs, error }, { data: client, error: clientError }] = await Promise.all([
      supabase
        .from('documentos_juridicos')
        .select('id,client_id,tipo,tipo_documento,status,status_assinatura,created_at,updated_at,view_token,public_access_token,snapshot,snapshot_json,hash_sha256,signed_at,uploaded_signed_file_path,uploaded_signed_file_name,uploaded_signed_at,document_origin')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase.from('clientes').select('portal_token,access_code').eq('id', clientId).maybeSingle(),
    ]);

    if (error) throw error;
    if (clientError) throw clientError;

    const rows = docs || [];
    const signatures = await countSignatures(rows.map((row: any) => String(row.id)));
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://capflow.pages.dev';
    const portalUrl = client?.portal_token && client?.access_code
      ? `${origin}/?portal=${encodeURIComponent(String(client.portal_token))}&portal_code=${encodeURIComponent(String(client.access_code))}`
      : null;

    return Promise.all(rows.map(async (row: any) => {
      const signatureCount = signatures.get(String(row.id)) || 0;
      const pending = PENDING_STATUSES.has(normalize(row.status)) || PENDING_STATUSES.has(normalize(row.status_assinatura));
      const editableType = ['MUTUO_PRE_DESEMBOLSO', 'PRE_CONTRATO'].includes(normalize(row.tipo || row.tipo_documento));
      const canMutate = pending && signatureCount === 0 && !row.signed_at;
      let signedFileUrl: string | null = null;
      if (row.uploaded_signed_file_path) {
        const signed = await supabase.storage.from(SIGNED_BUCKET).createSignedUrl(String(row.uploaded_signed_file_path), 600);
        signedFileUrl = signed.data?.signedUrl || null;
      }
      return {
        ...row,
        signature_count: signatureCount,
        can_edit: canMutate && editableType,
        can_delete: canMutate,
        portal_url: portalUrl,
        signed_file_url: signedFileUrl,
      } as ClientLegalDocument;
    }));
  },

  async uploadSignedConfession(clientId: string, file: File) {
    if (!file || file.size <= 0) throw new Error('Selecione um arquivo válido.');
    if (file.size > 15 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 15 MB.');
    if (!ALLOWED_SIGNED_TYPES.has(file.type)) throw new Error('Use PDF, DOCX, JPG ou PNG.');

    const ownerId = await resolveOwner(clientId);
    const now = new Date().toISOString();
    const hash = await sha256File(file);
    const path = `${ownerId}/${clientId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

    const upload = await supabase.storage.from(SIGNED_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;

    const snapshot = {
      clientId,
      documentType: 'CONFISSAO_DIVIDA_ASSINADA',
      originalFileName: file.name,
      mimeType: file.type,
      size: file.size,
      uploadedAt: now,
      contentHash: hash,
      source: 'UPLOAD_MANUAL_ASSINADO',
    };

    const { data, error } = await supabase.from('documentos_juridicos').insert({
      client_id: clientId,
      profile_id: ownerId,
      dono_id: ownerId,
      tipo: 'CONFISSAO_ASSINADA',
      tipo_documento: 'CONFISSAO_ASSINADA',
      status: 'ASSINADO',
      status_assinatura: 'ASSINADO',
      signed_at: now,
      snapshot,
      snapshot_json: snapshot,
      hash_sha256: hash,
      content_hash: hash,
      uploaded_signed_file_path: path,
      uploaded_signed_file_name: file.name,
      uploaded_signed_at: now,
      uploaded_signed_by: ownerId,
      url_storage: path,
      document_origin: 'UPLOADED_SIGNED',
      template_version: 'UPLOAD_SIGNED_V1',
    }).select('id').single();

    if (error) {
      await supabase.storage.from(SIGNED_BUCKET).remove([path]);
      throw error;
    }
    return data;
  },

  async updatePending(documentId: string, input: { amount: number; dueDate: string; notes?: string }) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Informe um valor válido.');
    if (!input.dueDate) throw new Error('Informe o vencimento.');

    const { data: doc, error } = await supabase.from('documentos_juridicos').select('*').eq('id', documentId).single();
    if (error || !doc) throw new Error('Documento não encontrado.');

    const signatureCount = (await countSignatures([documentId])).get(documentId) || 0;
    const pending = PENDING_STATUSES.has(normalize(doc.status)) || PENDING_STATUSES.has(normalize(doc.status_assinatura));
    if (!pending || signatureCount > 0 || doc.signed_at) throw new Error('Documento assinado ou fora do estado pendente não pode ser alterado.');

    const snapshot = { ...(doc.snapshot_json || doc.snapshot || {}) };
    snapshot.amount = Number(amount.toFixed(2));
    snapshot.principalAmount = snapshot.amount;
    snapshot.originalPrincipalAmount = snapshot.amount;
    snapshot.legalTotalAmount = snapshot.amount;
    snapshot.totalDebt = snapshot.amount;
    snapshot.customContent = input.notes?.trim() || undefined;
    snapshot.installments = [{
      ...(Array.isArray(snapshot.installments) ? snapshot.installments[0] : {}),
      amount: snapshot.amount,
      principalAmount: snapshot.amount,
      legalInterestAmount: 0,
      dueDate: input.dueDate,
      principalBalanceAfter: 0,
      paidAmount: 0,
      status: 'PENDING',
    }];

    const hash = await generateSHA256(createLegalSnapshot(snapshot));
    const html = generateMutuoPreDesembolsoHTML(snapshot, documentId, hash);
    const { error: updateError } = await supabase.from('documentos_juridicos').update({ snapshot, snapshot_json: snapshot, snapshot_rendered_html: html, hash_sha256: hash, updated_at: new Date().toISOString() }).eq('id', documentId);
    if (updateError) throw updateError;
  },

  async removePending(documentId: string) {
    const { data: doc, error } = await supabase.from('documentos_juridicos').select('id,status,status_assinatura,signed_at').eq('id', documentId).single();
    if (error || !doc) throw new Error('Documento não encontrado.');

    const signatureCount = (await countSignatures([documentId])).get(documentId) || 0;
    const pending = PENDING_STATUSES.has(normalize(doc.status)) || PENDING_STATUSES.has(normalize(doc.status_assinatura));
    if (!pending || signatureCount > 0 || doc.signed_at) throw new Error('Somente documentos pendentes e sem assinatura podem ser excluídos.');

    await supabase.from('logs_assinatura').delete().eq('documento_id', documentId);
    const { error: deleteError } = await supabase.from('documentos_juridicos').delete().eq('id', documentId);
    if (deleteError) throw deleteError;
  },
};
