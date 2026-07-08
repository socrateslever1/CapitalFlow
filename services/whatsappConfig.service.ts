import { supabase } from '../lib/supabase';

export interface WhatsAppConfigData {
  profile_id: string;
  api_type: 'META' | 'EVOLUTION' | 'Z_API';
  api_url?: string;
  token: string;
  instance_id?: string;
  template_overdue_3d?: string;
  template_due_today?: string;
  template_late?: string;
  template_payment_received?: string;
}

export const DEFAULT_WHATSAPP_TEMPLATES = {
  template_overdue_3d:
    'Ola, {nome_cliente}. Passando para lembrar que sua parcela de {valor_parcela} vence em 3 dias, no dia {data_vencimento}. Caso queira antecipar, use o Pix copia e cola: {copia_e_cola_pix}. Portal: {link_portal}',
  template_due_today:
    'Ola, {nome_cliente}. Sua parcela de {valor_parcela} vence hoje ({data_vencimento}). Para manter tudo em dia, voce pode pagar pelo Pix copia e cola: {copia_e_cola_pix}. Portal: {link_portal}',
  template_late:
    'Ola, {nome_cliente}. Consta em aberto a parcela de {valor_parcela}, vencida em {data_vencimento}. Regularize pelo Pix copia e cola: {copia_e_cola_pix} ou acesse seu portal: {link_portal}',
  template_payment_received:
    'Ola, {nome_cliente}. Recebemos o pagamento de {valor_parcela} referente ao vencimento {data_vencimento}. Obrigado.',
} as const;

export const withDefaultWhatsAppTemplates = (config?: Partial<WhatsAppConfigData> | null) => ({
  template_overdue_3d: config?.template_overdue_3d?.trim() || DEFAULT_WHATSAPP_TEMPLATES.template_overdue_3d,
  template_due_today: config?.template_due_today?.trim() || DEFAULT_WHATSAPP_TEMPLATES.template_due_today,
  template_late: config?.template_late?.trim() || DEFAULT_WHATSAPP_TEMPLATES.template_late,
  template_payment_received:
    config?.template_payment_received?.trim() || DEFAULT_WHATSAPP_TEMPLATES.template_payment_received,
});

const extractFunctionError = async (error: any): Promise<string> => {
  const context = error?.context;
  if (context && typeof context.text === 'function') {
    try {
      const raw = await context.text();
      if (!raw) return error?.message || 'Falha ao chamar a funcao do WhatsApp.';

      try {
        const parsed = JSON.parse(raw);
        return parsed?.message || parsed?.error || raw;
      } catch {
        return raw;
      }
    } catch {
      return error?.message || 'Falha ao chamar a funcao do WhatsApp.';
    }
  }

  return error?.message || 'Falha ao chamar a funcao do WhatsApp.';
};

const invokeWhatsAppSend = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', { body });

  if (error) {
    throw new Error(await extractFunctionError(error));
  }

  if ((data as any)?.success === false) {
    throw new Error((data as any)?.message || (data as any)?.error || 'Falha ao enviar mensagem.');
  }

  return data;
};

export const whatsappConfigService = {
  async getConfig(profileId: string): Promise<WhatsAppConfigData | null> {
    if (!profileId) return null;

    const { data, error } = await supabase
      .from('whatsapp_configs')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar configuracoes do WhatsApp:', error);
      return null;
    }

    return data ? ({ ...data, ...withDefaultWhatsAppTemplates(data as WhatsAppConfigData) } as WhatsAppConfigData) : null;
  },

  async saveConfig(profileId: string, configData: Omit<WhatsAppConfigData, 'profile_id'>): Promise<boolean> {
    if (!profileId) throw new Error('ID do perfil nao informado.');

    const payload = {
      api_type: configData.api_type,
      api_url: configData.api_url?.trim() || null,
      token: configData.token.trim(),
      instance_id: configData.instance_id?.trim() || null,
      template_overdue_3d:
        configData.template_overdue_3d?.trim() || DEFAULT_WHATSAPP_TEMPLATES.template_overdue_3d,
      template_due_today:
        configData.template_due_today?.trim() || DEFAULT_WHATSAPP_TEMPLATES.template_due_today,
      template_late:
        configData.template_late?.trim() || DEFAULT_WHATSAPP_TEMPLATES.template_late,
      template_payment_received:
        configData.template_payment_received?.trim() || DEFAULT_WHATSAPP_TEMPLATES.template_payment_received,
      updated_at: new Date().toISOString(),
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_save_whatsapp_config', {
      p_profile_id: profileId,
      p_api_type: payload.api_type,
      p_api_url: payload.api_url,
      p_token: payload.token,
      p_instance_id: payload.instance_id,
      p_template_overdue_3d: payload.template_overdue_3d,
      p_template_due_today: payload.template_due_today,
      p_template_late: payload.template_late,
      p_template_payment_received: payload.template_payment_received,
    });

    if (!rpcError) {
      if ((rpcData as any)?.success === false) {
        throw new Error((rpcData as any)?.message || 'Falha ao salvar configuracoes do WhatsApp.');
      }
      return true;
    }

    const rpcMissing = String(rpcError.message || '').toLowerCase().includes('rpc_save_whatsapp_config');
    if (!rpcMissing) {
      console.error('Erro ao salvar configuracoes do WhatsApp via RPC:', rpcError);
      throw rpcError;
    }

    const { error } = await supabase
      .from('whatsapp_configs')
      .upsert({
        profile_id: profileId,
        ...payload,
      }, { onConflict: 'profile_id' });

    if (error) {
      console.error('Erro ao salvar configuracoes do WhatsApp:', error);
      throw error;
    }

    return true;
  },

  async testConnection(profileId: string, testPhone: string): Promise<{ success: boolean; message?: string }> {
    if (!profileId) throw new Error('ID do perfil nao informado.');
    if (!testPhone) throw new Error('Telefone de teste nao informado.');

    const cleanPhone = testPhone.replace(/\D/g, '');
    try {
      await invokeWhatsAppSend({
        profile_id: profileId,
        phone: cleanPhone,
        message:
          'Ola! Esta e uma mensagem de teste enviada automaticamente pelo CapitalFlow. Sua integracao com o WhatsApp esta funcionando perfeitamente!',
        is_test: true,
      });

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao testar envio do WhatsApp:', err);
      return { success: false, message: err.message || 'Falha ao testar conexao.' };
    }
  },

  async sendMessage(profileId: string, phone: string, message: string): Promise<{ success: boolean; message?: string }> {
    if (!profileId) throw new Error('ID do perfil nao informado.');
    if (!phone) throw new Error('Telefone nao informado.');
    if (!message) throw new Error('Mensagem nao informada.');

    const cleanPhone = phone.replace(/\D/g, '');
    try {
      await invokeWhatsAppSend({
        profile_id: profileId,
        phone: cleanPhone,
        message,
      });

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao enviar mensagem do WhatsApp:', err);
      return { success: false, message: err.message || 'Falha ao enviar mensagem.' };
    }
  },
};
