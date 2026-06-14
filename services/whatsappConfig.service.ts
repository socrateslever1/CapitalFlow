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

export const whatsappConfigService = {
  /**
   * Busca as configurações do WhatsApp para um perfil específico
   */
  async getConfig(profileId: string): Promise<WhatsAppConfigData | null> {
    if (!profileId) return null;
    
    const { data, error } = await supabase
      .from('whatsapp_configs')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();
    
    if (error) {
      console.error('Erro ao buscar configurações do WhatsApp:', error);
      return null;
    }
    
    return data as WhatsAppConfigData;
  },

  /**
   * Salva ou atualiza as configurações do WhatsApp
   */
  async saveConfig(profileId: string, configData: Omit<WhatsAppConfigData, 'profile_id'>): Promise<boolean> {
    if (!profileId) throw new Error('ID do perfil não informado.');

    const { error } = await supabase
      .from('whatsapp_configs')
      .upsert({
        profile_id: profileId,
        api_type: configData.api_type,
        api_url: configData.api_url?.trim() || null,
        token: configData.token.trim(),
        instance_id: configData.instance_id?.trim() || null,
        template_overdue_3d: configData.template_overdue_3d || null,
        template_due_today: configData.template_due_today || null,
        template_late: configData.template_late || null,
        template_payment_received: configData.template_payment_received || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'profile_id' });

    if (error) {
      console.error('Erro ao salvar configurações do WhatsApp:', error);
      throw error;
    }
    
    return true;
  },

  /**
   * Dispara uma mensagem de teste do WhatsApp chamando a Edge Function do Supabase
   */
  async testConnection(profileId: string, testPhone: string): Promise<{ success: boolean; message?: string }> {
    if (!profileId) throw new Error('ID do perfil não informado.');
    if (!testPhone) throw new Error('Telefone de teste não informado.');

    const cleanPhone = testPhone.replace(/\D/g, '');
    
    // Obtém as sessões locais para o cabeçalho Authorization
    const { data: { session } } = await supabase.auth.getSession();
    const tokenHeader = session ? `Bearer ${session.access_token}` : '';

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': tokenHeader
        },
        body: JSON.stringify({
          profile_id: profileId,
          phone: cleanPhone,
          message: 'Olá! Esta é uma mensagem de teste enviada automaticamente pelo CapitalFlow. Sua integração com o WhatsApp está funcionando perfeitamente!',
          is_test: true
        })
      });

      const result = await response.json();
      if (!response.ok || result?.success === false) {
        throw new Error(result?.message || 'Erro desconhecido ao enviar mensagem de teste.');
      }

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao testar envio do WhatsApp:', err);
      return { success: false, message: err.message || 'Falha ao testar conexão.' };
    }
  },

  /**
   * Dispara uma mensagem customizada de WhatsApp chamando a Edge Function do Supabase
   */
  async sendMessage(profileId: string, phone: string, message: string): Promise<{ success: boolean; message?: string }> {
    if (!profileId) throw new Error('ID do perfil não informado.');
    if (!phone) throw new Error('Telefone não informado.');
    if (!message) throw new Error('Mensagem não informada.');

    const cleanPhone = phone.replace(/\D/g, '');
    const { data: { session } } = await supabase.auth.getSession();
    const tokenHeader = session ? `Bearer ${session.access_token}` : '';

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': tokenHeader
        },
        body: JSON.stringify({
          profile_id: profileId,
          phone: cleanPhone,
          message: message
        })
      });

      const result = await response.json();
      if (!response.ok || result?.success === false) {
        throw new Error(result?.message || 'Erro desconhecido ao enviar mensagem.');
      }

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao enviar mensagem do WhatsApp:', err);
      return { success: false, message: err.message || 'Falha ao enviar mensagem.' };
    }
  }
};
