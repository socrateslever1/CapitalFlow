import { supabase } from '../../../lib/supabase';
import { personalWalletService } from '../../../services/personalWallet.service';

export type WalletSnapshot = Awaited<ReturnType<typeof personalWalletService.load>>;

export const walletRepository = {
  async load() {
    await personalWalletService.ensureDefaultCashAccount();
    return personalWalletService.load();
  },
  async getAccess(userId: string) {
    const { data, error } = await supabase
      .from('user_modulos')
      .select('ativo,configuracoes')
      .eq('user_id', userId)
      .eq('modulo_chave', 'carteira')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { active: Boolean(data.ativo), settings: data.configuracoes ?? {} } : { active: false, settings: {} };
  },
};
