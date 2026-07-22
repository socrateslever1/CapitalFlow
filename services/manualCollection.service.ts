import { getSynchronizedSession } from '../lib/supabase';

export const DEV_WHATSAPP_PROFILE_ID = '62dcbb45-f02c-42ba-84a4-916af9854dea';
export type AutomaticMessageType = 'COLLECTION' | 'WELCOME' | 'REMINDER' | 'LATE' | 'PAID';
const MANUAL_COLLECTION_URL = 'https://hzchchbxkhryextaymkn.supabase.co/functions/v1/capitalflow-manual-collections';

export const manualCollectionService = {
  isEnabled(profileId?: string | null) {
    return profileId === DEV_WHATSAPP_PROFILE_ID;
  },

  async enqueue(profileId: string, loanId: string, messageType: AutomaticMessageType = 'COLLECTION') {
    if (!this.isEnabled(profileId)) throw new Error('Envio automático ainda não está habilitado para este perfil.');
    const { data: sessionData, error: sessionError } = await getSynchronizedSession({ minValidityMs: 120_000 });
    const accessToken = sessionData?.session?.access_token;
    if (sessionError || !accessToken) throw new Error('Sua sessão expirou. Entre novamente para enviar mensagens.');

    let response: Response;
    try {
      response = await fetch(MANUAL_COLLECTION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'enqueue', profile_id: profileId, loan_id: loanId, message_type: messageType }),
      });
    } catch (error: any) {
      throw new Error(`Não foi possível conectar à automação: ${error?.message || 'falha de rede'}`);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(data?.error || data?.message || '');
      const messages: Record<string, string> = {
        client_phone_missing: 'O cliente não possui um WhatsApp válido cadastrado.',
        no_open_installment: 'O contrato não possui parcela em aberto para cobrança.',
        no_amount_due: 'Não há valor pendente para cobrar neste contrato.',
        contract_not_found: 'O contrato não foi encontrado para este operador.',
        feature_not_enabled_for_profile: 'O envio automático ainda não está habilitado para este perfil.',
        installment_not_overdue: 'Esta parcela ainda não está atrasada. Use a opção de lembrete.',
        forbidden: 'Seu usuário não tem permissão para enviar por este perfil.',
        unauthorized: 'Sua sessão expirou. Entre novamente para enviar mensagens.',
      };
      throw new Error(messages[detail] || detail || `A automação recusou o envio (${response.status}).`);
    }
    if (!data?.ok) throw new Error(data?.error || 'Não foi possível enfileirar a cobrança.');
    return data;
  },
};
