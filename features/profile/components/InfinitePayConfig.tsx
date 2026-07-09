import React, { useState, useEffect } from 'react';
import { CreditCard, ExternalLink, Save, ShieldCheck, AlertCircle, Copy, CheckCircle2 } from 'lucide-react';
import { paymentConfigService } from '../../../services/paymentConfig.service';

interface InfinitePayConfigProps {
  profileId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const InfinitePayConfig: React.FC<InfinitePayConfigProps> = ({ profileId, showToast }) => {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [infiniteTag, setInfiniteTag] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const projectWebhookUrl = `https://hzchchbxkhryextaymkn.supabase.co/functions/v1/infinitepay-webhook`;

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const config = await paymentConfigService.getInfinitePayConfig(profileId);
        if (config) {
          setClientId(config.client_id || '');
          setClientSecret(config.client_secret || '');
          setInfiniteTag(config.infinite_tag || '');
        }
      } catch (err) {
        console.error('Erro ao carregar configurações de pagamento InfinitePay:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (profileId) loadConfig();
  }, [profileId]);

  const handleSave = async () => {
    if (!clientId.trim() || !clientSecret.trim() || !infiniteTag.trim()) {
      showToast('Todos os campos são obrigatórios.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await paymentConfigService.saveInfinitePayConfig(
        profileId,
        clientId.trim(),
        clientSecret.trim(),
        infiniteTag.trim()
      );
      showToast('Configurações de pagamento InfinitePay salvas!', 'success');
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
        <div className="h-10 bg-slate-800 rounded-lg w-1/3"></div>
        <div className="h-32 bg-slate-800 rounded-lg w-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-blue-500">
        <CreditCard size={24} />
        <h3 className="text-lg font-black uppercase">InfinitePay (Configuração Individual)</h3>
      </div>

      <div className="bg-blue-900/10 border border-blue-900/30 p-4 rounded-lg flex gap-3">
        <ShieldCheck className="text-blue-500 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-blue-400 font-bold uppercase mb-1">Como funciona?</p>
          Ao configurar suas credenciais do <span className="text-white">InfinitePay</span>, todas as cobranças geradas (PIX e Cartão) para seus contratos serão creditadas <span className="text-white">diretamente na sua conta</span>. O sistema dará baixa automática nas parcelas via Webhook assim que o cliente pagar.
        </div>
      </div>

      <div className="space-y-6 bg-slate-950 p-6 rounded-lg border border-slate-800">
        {/* INFINITE TAG */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Sua InfiniteTag (Sem @)</span>
            <span className="text-[9px] text-slate-600 font-bold uppercase">Identificador da Conta</span>
          </label>
          <input
            type="text"
            value={infiniteTag}
            onChange={(e) => setInfiniteTag(e.target.value)}
            placeholder="Ex: minhaconta"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-sm outline-none focus:border-blue-500 transition-all shadow-inner"
          />
        </div>

        {/* CLIENT ID */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Seu Client ID</span>
            <a
              href="https://conf.infinitepay.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline flex items-center gap-1 normal-case font-bold"
            >
              Obter Credenciais <ExternalLink size={10} />
            </a>
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Client ID do painel InfinitePay"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-sm outline-none focus:border-blue-500 transition-all shadow-inner"
          />
        </div>

        {/* CLIENT SECRET */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Seu Client Secret</span>
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Client Secret do painel InfinitePay"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-sm outline-none focus:border-blue-500 transition-all shadow-inner"
          />
        </div>

        {/* WEBHOOK URL */}
        <div className="pt-4 border-t border-slate-900">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>URL de Notificação (Webhook)</span>
            <span className="text-[9px] text-amber-500 font-bold uppercase">Configuração Recomendada</span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-400 font-mono text-[10px] truncate">
              {projectWebhookUrl}
            </div>
            <button
              onClick={handleCopy}
              className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all border border-slate-700 flex items-center justify-center gap-2"
              title="Copiar URL"
            >
              {copied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
              <span className="text-[10px] font-bold uppercase hidden sm:inline">Copiar</span>
            </button>
          </div>
          <p className="text-[9px] text-slate-500 mt-2 font-medium leading-relaxed">
            Configure esta URL no painel de desenvolvedor do InfinitePay sob os eventos de atualização de transações para ativar a baixa automática de pagamentos no sistema.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-lg font-bold uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
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

      <div className="bg-amber-900/10 border border-amber-900/30 p-4 rounded-lg flex gap-3">
        <AlertCircle className="text-amber-500 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-amber-400 font-bold uppercase mb-1">Aviso de Baixa Automática</p>
          Para que o reconhecimento dos pagamentos seja <span className="text-white">automático</span>, a URL acima deve estar configurada nas credenciais da sua conta no painel do InfinitePay.
        </div>
      </div>
    </div>
  );
};
