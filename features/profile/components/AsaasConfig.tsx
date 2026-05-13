
import React, { useState, useEffect } from 'react';
import { ExternalLink, Save, ShieldCheck, Zap, Copy, CheckCircle2, AlertCircle } from 'lucide-react';
import { paymentConfigService } from '../../../services/paymentConfig.service';

interface AsaasConfigProps {
  profileId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AsaasConfig: React.FC<AsaasConfigProps> = ({ profileId, showToast }) => {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const projectWebhookUrl = `https://hzchchbxkhryextaymkn.supabase.co/functions/v1/asaas-webhook`;

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const config = await paymentConfigService.getAsaasConfig(profileId);
        if (config?.asaas_api_key) {
          setApiKey(config.asaas_api_key);
        }
      } catch (err) {
        console.error('Erro ao carregar configurações Asaas:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (profileId) loadConfig();
  }, [profileId]);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      showToast('A API Key é obrigatória.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await paymentConfigService.saveAsaasConfig(profileId, apiKey.trim());
      showToast('Configurações Asaas salvas!', 'success');
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
    return <div className="animate-pulse h-40 bg-slate-800 rounded-xl"></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-amber-500">
        <Zap size={24} className="fill-amber-500" />
        <h3 className="text-lg font-black uppercase">Asaas (Configuração Individual)</h3>
      </div>

      <div className="bg-amber-900/10 border border-amber-900/30 p-4 rounded-xl flex gap-3">
        <ShieldCheck className="text-amber-500 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-amber-400 font-bold uppercase mb-1">Por que usar Asaas?</p>
          O Asaas permite o <span className="text-white">Checkout Transparente</span>, onde o cliente insere o cartão diretamente no portal. Suporta Cartão de Crédito, Débito e PIX com taxas competitivas e liquidação rápida.
        </div>
      </div>

      <div className="space-y-6 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl">
        {/* API KEY */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Sua API Key Asaas (Produção)</span>
            <a 
              href="https://www.asaas.com/customer/config/apiTokens" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline flex items-center gap-1 normal-case font-bold"
            >
              Obter Token API <ExternalLink size={10} />
            </a>
          </label>
          <div className="relative">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="$a..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-white font-mono text-sm outline-none focus:border-amber-500 transition-all shadow-inner"
            />
            {apiKey && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                 <div className="px-2 py-0.5 bg-amber-600/20 text-amber-500 text-[10px] font-bold rounded uppercase flex items-center gap-1">
                   <CheckCircle2 size={10} /> Ativo
                 </div>
              </div>
            )}
          </div>
        </div>

        {/* WEBHOOK URL */}
        <div className="pt-4 border-t border-slate-900">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Fila de Sincronização (Webhook)</span>
            <span className="text-[9px] text-blue-500 font-bold uppercase tracking-widest">Para Baixa Automática</span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-slate-400 font-mono text-[10px] truncate">
              {projectWebhookUrl}
            </div>
            <button
              onClick={handleCopy}
              className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2"
            >
              {copied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
              <span className="text-[10px] font-bold uppercase hidden sm:inline">Copiar</span>
            </button>
          </div>
          <p className="text-[9px] text-slate-500 mt-2 font-medium leading-relaxed">
            Configure esta URL no menu <span className="text-white">"Configurações &gt; Integrações &gt; Webhooks"</span> do Asaas. Marque as opções de <span className="text-white">"Pagamento Recebido"</span> e <span className="text-white">"Cobrança Confirmada"</span>.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 text-white rounded-xl font-bold uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Save size={16} /> Salvar Credenciais Asaas
            </>
          )}
        </button>
      </div>

      <div className="bg-blue-900/10 border border-blue-900/30 p-4 rounded-xl flex gap-3">
        <AlertCircle className="text-blue-500 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-blue-400 font-bold uppercase mb-1">Configuração de Pix e Cartão</p>
          O checkout do CapitalFlow usará as credenciais acima para processar pagamentos. Sem a URL de Webhook, o sistema não saberá quando o cliente pagou, e você precisará confirmar manualmente.
        </div>
      </div>
    </div>
  );
};
