import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Link2, Save, ShieldCheck, AlertCircle } from 'lucide-react';
import { paymentConfigService } from '../../../services/paymentConfig.service';

interface InfinitePayConfigProps {
  profileId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const InfinitePayConfig: React.FC<InfinitePayConfigProps> = ({ profileId, showToast }) => {
  const [handle, setHandle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const projectWebhookUrl = `https://hzchchbxkhryextaymkn.supabase.co/functions/v1/infinitepay-webhook`;

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const config = await paymentConfigService.getInfinitePayConfig(profileId);
        if (config?.infinitepay_handle) setHandle(config.infinitepay_handle);
      } catch (err) {
        console.error('Erro ao carregar configuracoes InfinitePay:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (profileId) loadConfig();
  }, [profileId]);

  const handleSave = async () => {
    if (!handle.trim()) {
      showToast('A InfiniteTag e obrigatoria.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await paymentConfigService.saveInfinitePayConfig(profileId, handle.trim());
      showToast('Configuracao InfinitePay salva!', 'success');
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
    return <div className="animate-pulse h-40 bg-slate-800 rounded-lg"></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-emerald-500">
        <Link2 size={24} />
        <h3 className="text-lg font-black uppercase">InfinitePay (Checkout Integrado)</h3>
      </div>

      <div className="bg-emerald-900/10 border border-emerald-900/30 p-4 rounded-lg flex gap-3">
        <ShieldCheck className="text-emerald-500 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-emerald-400 font-bold uppercase mb-1">Pix e cartao por link</p>
          O cliente paga no checkout hospedado da InfinitePay. Quando o webhook confirma o pagamento, a parcela e baixada automaticamente no CapitalFlow.
        </div>
      </div>

      <div className="space-y-6 bg-slate-950 p-6 rounded-lg border border-slate-800 shadow-xl">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>InfiniteTag / Handle</span>
            <a
              href="https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline flex items-center gap-1 normal-case font-bold"
            >
              Ver documentacao <ExternalLink size={10} />
            </a>
          </label>
          <div className="relative">
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="sua_infinite_tag"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-sm outline-none focus:border-emerald-500 transition-all shadow-inner"
            />
            {handle && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                <div className="px-2 py-0.5 bg-emerald-600/20 text-emerald-500 text-[10px] font-bold rounded uppercase flex items-center gap-1">
                  <CheckCircle2 size={10} /> Ativo
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-900">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Webhook InfinitePay</span>
            <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Baixa Automatica</span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-400 font-mono text-[10px] truncate">
              {projectWebhookUrl}
            </div>
            <button
              onClick={handleCopy}
              className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all border border-slate-700 flex items-center justify-center gap-2"
            >
              {copied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
              <span className="text-[10px] font-bold uppercase hidden sm:inline">Copiar</span>
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-lg font-bold uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Save size={16} /> Salvar InfinitePay
            </>
          )}
        </button>
      </div>

      <div className="bg-blue-900/10 border border-blue-900/30 p-4 rounded-lg flex gap-3">
        <AlertCircle className="text-blue-500 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          Ative o Checkout Integrado na InfinitePay e use a URL acima para receber a notificacao de pagamento.
        </div>
      </div>
    </div>
  );
};
