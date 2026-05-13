import { supabase } from '../lib/supabase';

/**
 * Gera (ou reutiliza) link único do portal para um contrato
 * Agora inclui obrigatoriamente um SHORTCODE de 6 dígitos
 */
export async function getOrCreatePortalLink(loanId: string): Promise<string> {
  // 1) tenta pegar token e shortcode existentes
  const { data: existing, error: fetchError } = await supabase
    .from('contratos')
    .select('portal_token, portal_shortcode')
    .eq('id', loanId)
    .single();

  if (fetchError) {
    throw new Error('Erro ao buscar contrato');
  }

  let token = existing?.portal_token as string | null;
  let shortcode = existing?.portal_shortcode as string | null;

  // 2) se não existir token ou shortcode, cria/atualiza
  if (!token || !shortcode) {
    const updates: any = {};
    
    if (!token) updates.portal_token = crypto.randomUUID();
    if (!shortcode) {
        // Gera código numérico de 6 dígitos
        updates.portal_shortcode = Math.floor(100000 + Math.random() * 900000).toString();
    }

    const { data: updated, error: updateError } = await supabase
      .from('contratos')
      .update(updates)
      .eq('id', loanId)
      .select('portal_token, portal_shortcode')
      .single();

    if (updateError || !updated?.portal_token || !updated?.portal_shortcode) {
      throw new Error('Erro ao gerar link do portal');
    }

    token = updated.portal_token;
    shortcode = updated.portal_shortcode;
  }

  // 3) monta URL final OBRIGATÓRIA com code
  return `${window.location.origin}/?portal=${token}&portal_code=${shortcode}`;
}
