import React, { useState, useEffect } from 'react';
import { CreditCard, ExternalLink, Save, ShieldCheck, AlertCircle, Copy, CheckCircle2 } from 'lucide-react';
import { paymentConfigService } from '../../../services/paymentConfig.service';

interface MercadoPagoConfigProps {
  profileId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const MercadoPagoConfig: React.FC<MercadoPagoConfigProps> = ({ profileId, showToast }) => {
  const [publicKey, setPublicKey] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const projectWebhookUrl = `https://hzchchbxkhryextaymkn.supabase.co/functions/v1/mp-webhook`;

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const config = await paymentConfigService.getConfig(profileId);
        if (config) {
          setPublicKey(config.mp_public_key || '');
          setAccessToken(config.mp_access_token || '');
          setClientId(config.mp_client_id || '');
          setClientSecret(config.mp_client_secret || '');
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

    if (accessToken.trim().length === 44) {
      showToast('O valor no "Access Token" parece ser a "Public Key" (44 caract.). Verifique se você não inverteu os campos!', 'error');
      return;
    }

    if (publicKey.trim() && publicKey.trim().length > 50) {
      showToast('O valor no "Public Key" parece ser o "Access Token" (mais de 50 caract.). Verifique se você não inverteu os campos!', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await paymentConfigService.saveConfig(
        profileId,
        accessToken.trim(),
        publicKey.trim(),
        clientId.trim(),
        clientSecret.trim()
      );
      showToast('Configurações de pagamento salvas com sucesso!', 'success');
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
        <h3 className="text-lg font-black uppercase">Mercado Pago (Configuração Individual)</h3>
      </div>

      <div className="bg-blue-900/10 border border-blue-900/30 p-4 rounded-lg flex gap-3">
        <ShieldCheck className="text-blue-500 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-blue-400 font-bold uppercase mb-1">Como funciona?</p>
          Configure os dados de produção abaixo para que todas as cobranças (PIX e Cartão) geradas para seus contratos sejam creditadas diretamente na sua conta do Mercado Pago.
        </div>
      </div>

      <div className="space-y-6 bg-slate-950 p-6 rounded-lg border border-slate-800">
        {/* CABEÇALHO CREDENCIAIS */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-900">
          <span className="text-[10px] font-black text-slate-400 uppercase">Credenciais de produção</span>
          <a
            href="https://www.mercadopago.com.br/developers/panel/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline flex items-center gap-1 text-[10px] font-bold"
          >
            Obter Credenciais no Painel <ExternalLink size={10} />
          </a>
        </div>

        {/* PUBLIC KEY */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Public Key</span>
          </label>
          <input
            type="text"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="APP_USR-..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-sm outline-none focus:border-blue-500 transition-all shadow-inner"
          />
        </div>

        {/* ACCESS TOKEN */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Access Token</span>
          </label>
          <div className="relative">
             <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="APP_USR-..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-sm outline-none focus:border-blue-500 transition-all shadow-inner"
              />
              {accessToken && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                   <div className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded uppercase flex items-center gap-1">
                     <CheckCircle2 size={10} /> Ativo
                   </div>
                </div>
              )}
          </div>
        </div>

        {/* CLIENT ID */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Client ID</span>
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Insira o Client ID"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-sm outline-none focus:border-blue-500 transition-all shadow-inner"
          />
        </div>

        {/* CLIENT SECRET */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>Client Secret</span>
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Insira o Client Secret"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-sm outline-none focus:border-blue-500 transition-all shadow-inner"
          />
        </div>

        {/* WEBHOOK URL */}
        <div className="pt-4 border-t border-slate-900">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center justify-between mb-2">
            <span>URL de Notificação (Webhook)</span>
            <span className="text-[9px] text-amber-500 font-bold uppercase">Configuração Obrigatória</span>
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
            Copie esta URL e cole no campo <span className="text-white">"Modo de Produção &gt; Webhooks"</span> dentro do seu painel do Mercado Pago. Marque os eventos de <span className="text-white">"Pagamentos"</span> e <span className="text-white">"Cobranças"</span>.
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
          Para que o reconhecimento seja <span className="text-white">automático</span>, a URL acima deve estar configurada no seu painel de desenvolvedor do Mercado Pago. Sem isso, você terá que dar baixa manual nos recebimentos.
        </div>
      </div>
    </div>
  );
};
