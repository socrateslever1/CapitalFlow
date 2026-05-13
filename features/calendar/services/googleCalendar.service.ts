
import { supabase } from '../../../lib/supabase';
import { safeUUID } from '../../../utils/uuid';

// Helper para carregar o script do Google Identity Services
export const loadGoogleScript = () => {
  return new Promise((resolve) => {
    if ((window as any).google) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve(true);
    document.body.appendChild(script);
  });
};

import { fetchWithRetry } from '../../../utils/fetchWithRetry';

export const googleCalendarService = {
  // Inicializa o cliente de token (Implicit Flow)
  initTokenClient: (callback: (tokenResponse: any) => void) => {
    // NOTA: Em produção, CLIENT_ID deve vir de env vars.
    // Aqui usamos um placeholder ou esperamos que o usuário configure.
    // O usuário deve configurar no Cloud Console as origens permitidas.
    const CLIENT_ID = 'SEU_GOOGLE_CLIENT_ID_AQUI'; 
    
    return (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar',
      callback: callback,
    });
  },

  async saveToken(profileId: string, token: string, expiry: number) {
    const safeProfileId = safeUUID(profileId);
    if (!safeProfileId) return;

    // Salva token no banco (Cuidado: Idealmente criptografado no backend)
    await supabase.from('user_integrations').upsert({
      profile_id: safeProfileId,
      google_access_token: token,
      google_token_expiry: Date.now() + (expiry * 1000),
      sync_enabled: true,
      updated_at: new Date().toISOString()
    });
  },

  async disconnect(profileId: string) {
    const safeProfileId = safeUUID(profileId);
    if (!safeProfileId) return;
    await supabase.from('user_integrations').delete().eq('profile_id', safeProfileId);
  },

  async getIntegrationStatus(profileId: string) {
    const safeProfileId = safeUUID(profileId);
    if (!safeProfileId) return null;
    const { data } = await supabase.from('user_integrations').select('*').eq('profile_id', safeProfileId).single();
    return data;
  },

  // Sincronização Simplificada (One-way: Google -> App)
  async listGoogleEvents(token: string) {
    try {
      const now = new Date().toISOString();
      const response = await fetchWithRetry(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&singleEvents=true&orderBy=startTime`, {
        headers: { Authorization: `Bearer ${token}` },
        maxRetries: 2
      });
      const data = await response.json();
      return data.items || [];
    } catch (e) {
      console.error("Google API Error", e);
      return [];
    }
  }
};
