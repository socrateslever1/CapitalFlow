import { supabase } from '../lib/supabase';
import { createLegalSnapshot, generateSHA256 } from '../utils/crypto';
import { generateMutuoPreDesembolsoHTML } from '../features/legal/templates/MutuoPreDesembolsoTemplate';

const PENDING_STATUSES = new Set(['PENDENTE', 'EM_ASSINATURA', 'AGUARDANDO_ASSINATURA']);

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
  signature_count: number;
  can_edit: boolean;
  can_delete: boolean;
  portal_url?: string | null;
};

const normalize = (value: unknown) => String(value || '').trim().toUpperCase();

async function countSignatures(documentIds: string[]) {
  if (documentIds.length === 0) return new Map<string, number>();
  const { data, error } = await supabase
    .from('assinaturas_documento')
    .select('document_id')
    .in('document_id', documentIds);
  if (error) throw error;
  const result = new Map<string, number>();
  for (const row of data || []) {
    const id = String((row as any).document_id || '');
    result.set(id, (result.get(id) || 0) + 1);
  }
  return result;
}

export const clientLegalDocumentsService = {
  async list(clientId: string): Promise<ClientLegalDocument[]> {
    const [{ data: docs, error }, { data: client, error: clientError }] = await Promise.all([
      supabase
        .from('documentos_juridicos')
        .select('id,client_id,tipo,tipo_documento,status,status_assinatura,created_at,updated_at,view_token,public_access_token,snapshot,snapshot_json,hash_sha256,signed_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('clientes')
        .select('portal_token,access_code')
        .eq('id', clientId)
        .maybeSingle(),
    ]);

    if (error) throw error;
    if (clientError) throw clientError;

    const rows = docs || [];
    const signatures = await countSignatures(rows.map((row: any) => String(row.id)));
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://capflow.pages.dev';
    const portalUrl = client?.portal_token && client?.access_code
      ? `${origin}/?portal=${encodeURIComponent(String(client.portal_token))}&portal_code=${encodeURIComponent(String(client.access_code))}`
      : null;

    return rows.map((row: any) => {
      const signatureCount = signatures.get(String(row.id)) || 0;
      const pending = PENDING_STATUSES.has(normalize(row.status)) || PENDING_STATUSES.has(normalize(row.status_assinatura));
      const editableType = normalize(row.tipo || row.tipo_documento) === 'MUTUO_PRE_DESEMBOLSO' || normalize(row.tipo || row.tipo_documento) === 'PRE_CONTRATO';
      const canMutate = pending && signatureCount === 0 && !row.signed_at;
      return {
        ...row,
        signature_count: signatureCount,
        can_edit: canMutate && editableType,
        can_delete: canMutate,
        portal_url: portalUrl,
      } as ClientLegalDocument;
    });
  },

  async updatePending(documentId: string, input: { amount: number; dueDate: string; notes?: string }) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Informe um valor válido.');
    if (!input.dueDate) throw new Error('Informe o vencimento.');

    const { data: doc, error } = await supabase
      .from('documentos_juridicos')
      .select('*')
      .eq('id', documentId)
      .single();
    if (error || !doc) throw new Error('Documento não encontrado.');

    const signatureCount = (await countSignatures([documentId])).get(documentId) || 0;
    const pending = PENDING_STATUSES.has(normalize(doc.status)) || PENDING_STATUSES.has(normalize(doc.status_assinatura));
    if (!pending || signatureCount > 0 || doc.signed_at) {
      throw new Error('Documento assinado ou fora do estado pendente não pode ser alterado.');
    }

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
    const { error: updateError } = await supabase
      .from('documentos_juridicos')
      .update({
        snapshot,
        snapshot_json: snapshot,
        snapshot_rendered_html: html,
        hash_sha256: hash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);
    if (updateError) throw updateError;
  },

  async removePending(documentId: string) {
    const { data: doc, error } = await supabase
      .from('documentos_juridicos')
      .select('id,status,status_assinatura,signed_at')
      .eq('id', documentId)
      .single();
    if (error || !doc) throw new Error('Documento não encontrado.');

    const signatureCount = (await countSignatures([documentId])).get(documentId) || 0;
    const pending = PENDING_STATUSES.has(normalize(doc.status)) || PENDING_STATUSES.has(normalize(doc.status_assinatura));
    if (!pending || signatureCount > 0 || doc.signed_at) {
      throw new Error('Somente documentos pendentes e sem assinatura podem ser excluídos.');
    }

    await supabase.from('logs_assinatura').delete().eq('documento_id', documentId);
    const { error: deleteError } = await supabase.from('documentos_juridicos').delete().eq('id', documentId);
    if (deleteError) throw deleteError;
  },
};
