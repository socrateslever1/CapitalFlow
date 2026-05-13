
import React, { useState, useEffect } from 'react';
import { CreditCard, ExternalLink, Save, ShieldCheck, AlertCircle, Copy, CheckCircle2 } from 'lucide-react';
import { paymentConfigService } from '../../../services/paymentConfig.service';

interface MercadoPagoConfigProps {
  profileId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const MercadoPagoConfig: React.FC<MercadoPagoConfigProps> = ({ profileId, showToast }) => {
  const [accessToken, setAccessToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${window.location.protocol}//${window.location.host.includes('localhost') ? 'hzchchbxkhryextaymkn.supabase.co' : window.location.host}/functions/v1/mp-webhook`;
  // Na verdade, a URL do webhook do Supabase é sempre baseada no projeto ID
  const projectWebhookUrl = `https://hzchchbxkhryextaymkn.supabase.co/functions/v1/mp-webhook`;

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const config = await paymentConfigService.getConfig(profileId);
        if (config?.mp_access_token) {
          setAccessToken(config.mp_access_token);
        }
      } catch (err) {
        console.error('Erro ao carregar configurações de pagamento:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (profileId) loadConfig();
  }, [profileId]);

  const handleSave = async () => {
    if (!accessToken.trim()) {
      showToast('O Access Token é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await paymentConfigService.saveConfig(profileId, accessToken.trim());
      showToast('Configurações de pagamento salvas!', 'success');
    } catch (err: any) {
      showToast('Erro ao salvar: ' + (err.message || 'Erro desconhecido'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(projectWebhookUrl);
    setCopied(true);
    showToast('URL do Webhook copiada!', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-slate-800 rounded-xl w-1/3"></div>
        <div className="h-32 bg-slate-800 rounded-xl w-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-blue-500">
        <CreditCard size={24} />
        <h3 className="text-lg font-black uppercase">Mercado Pago (Configuração Individual)</h3>
      </div>

      <div className="bg-blue-900/10 border border-blue-900/30 p-4 rounded-xl flex gap-3">
        <ShieldCheck className="text-blue-500 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-blue-400 font-bold uppercase mb-1">Como funciona?</p>
          Ao configurar seu <span className="text-white">Access Token</span>, todos os pagamentos (PIX e Cartão) gerados para seus contratos serão creditados <span className="text-white">diretamente na sua conta</span> do Mercado Pago. O sistema reconhece o pagamento automaticamente via Webhook.
        </div>
      </div>

      <div className="space-y-6 bg-slate-950 p-6 rounded-2xl border border-slate-800">
        {/* ACCESS TOKEN */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Seu Access Token Produção</span>
            <a 
              href="https://www.mercadopago.com.br/developers/panel/credentials" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline flex items-center gap-1 normal-case font-bold"
            >
              Obter Credenciais <ExternalLink size={10} />
            </a>
          </label>
          <div className="relative">
             <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="APP_USR-..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-white font-mono text-sm outline-none focus:border-blue-500 transition-all shadow-inner"
              />
              {accessToken && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                   <div className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded uppercase flex items-center gap-1">
                     <CheckCircle2 size={10} /> Ativo
                   </div>
                </div>
              )}
          </div>
          <p className="text-[9px] text-slate-600 mt-2 font-medium">
            Nunca compartilhe seu Access Token. Ele é usado apenas para gerar cobranças em seu nome.
          </p>
        </div>

        {/* WEBHOOK URL */}
        <div className="pt-4 border-t border-slate-900">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>URL de Notificação (Webhook)</span>
            <span className="text-[9px] text-amber-500 font-bold uppercase">Configuração Obrigatória</span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-slate-400 font-mono text-[10px] truncate">
              {projectWebhookUrl}
            </div>
            <button
              onClick={handleCopy}
              className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2"
              title="Copiar URL"
            >
              {copied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
              <span className="text-[10px] font-bold uppercase hidden sm:inline">Copiar</span>
            </button>
          </div>
          <p className="text-[9px] text-slate-500 mt-2 font-medium leading-relaxed">
            Copie esta URL e cole no campo <span className="text-white">"Modo de Produção &gt; Webhooks"</span> dentro do seu painel do Mercado Pago. Marque os eventos de <span className="text-white">"Pagamentos"</span> e <span className="text-white">"Cobranças"</span>.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-xl font-bold uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Save size={16} /> Salvar Credenciais
            </>
          )}
        </button>
      </div>

      <div className="bg-amber-900/10 border border-amber-900/30 p-4 rounded-xl flex gap-3">
        <AlertCircle className="text-amber-500 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-amber-400 font-bold uppercase mb-1">Aviso de Baixa Automática</p>
          Para que o reconhecimento seja <span className="text-white">automático</span>, a URL acima deve estar configurada no seu painel de desenvolvedor do Mercado Pago. Sem isso, você terá que dar baixa manual nos recebimentos.
        </div>
      </div>
    </div>
  );
};
