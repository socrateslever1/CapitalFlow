import React, { useState, useEffect } from 'react';
import { Save, ShieldCheck, MessageSquare, Send, CheckCircle2, AlertCircle, HelpCircle, Key, Link } from 'lucide-react';
import { whatsappConfigService, WhatsAppConfigData } from '../../../services/whatsappConfig.service';

interface WhatsAppConfigProps {
  profileId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const WhatsAppConfig: React.FC<WhatsAppConfigProps> = ({ profileId, showToast }) => {
  const [apiType, setApiType] = useState<'META' | 'EVOLUTION' | 'Z_API'>('META');
  const [apiUrl, setApiUrl] = useState('');
  const [token, setToken] = useState('');
  const [instanceId, setInstanceId] = useState('');

  // Templates
  const [templateOverdue3d, setTemplateOverdue3d] = useState('');
  const [templateDueToday, setTemplateDueToday] = useState('');
  const [templateLate, setTemplateLate] = useState('');
  const [templatePaymentReceived, setTemplatePaymentReceived] = useState('');

  // Statuses
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const config = await whatsappConfigService.getConfig(profileId);
        if (config) {
          setApiType(config.api_type);
          setApiUrl(config.api_url || '');
          setToken(config.token || '');
          setInstanceId(config.instance_id || '');
          setTemplateOverdue3d(config.template_overdue_3d || '');
          setTemplateDueToday(config.template_due_today || '');
          setTemplateLate(config.template_late || '');
          setTemplatePaymentReceived(config.template_payment_received || '');
        }
      } catch (err) {
        console.error('Erro ao carregar configurações do WhatsApp:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (profileId) loadConfig();
  }, [profileId]);

  const handleSave = async () => {
    if (!token.trim()) {
      showToast('O Token de Acesso é obrigatório.', 'error');
      return;
    }

    if (apiType !== 'META' && !apiUrl.trim()) {
      showToast('A URL da API é obrigatória para este tipo de conexão.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await whatsappConfigService.saveConfig(profileId, {
        api_type: apiType,
        api_url: apiUrl,
        token: token,
        instance_id: instanceId,
        template_overdue_3d: templateOverdue3d,
        template_due_today: templateDueToday,
        template_late: templateLate,
        template_payment_received: templatePaymentReceived,
      });
      showToast('Configurações do WhatsApp salvas com sucesso!', 'success');
    } catch (err: any) {
      showToast('Erro ao salvar: ' + (err.message || 'Erro desconhecido'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!testPhone.trim()) {
      showToast('Informe o telefone para o envio de teste.', 'error');
      return;
    }

    setIsTesting(true);
    try {
      const res = await whatsappConfigService.testConnection(profileId, testPhone);
      if (res.success) {
        showToast('Mensagem de teste enviada com sucesso!', 'success');
      } else {
        showToast('Falha no teste: ' + (res.message || ''), 'error');
      }
    } catch (err: any) {
      showToast('Erro ao testar envio: ' + (err.message || ''), 'error');
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return <div className="animate-pulse h-60 bg-slate-800 rounded-lg"></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-indigo-500">
        <MessageSquare size={24} className="fill-indigo-500/20 text-indigo-500" />
        <h3 className="text-lg font-black uppercase">Notificações e API do WhatsApp</h3>
      </div>

      <div className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-lg flex gap-3">
        <ShieldCheck className="text-indigo-400 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-indigo-400 font-bold uppercase mb-1">Cobranças Inteligentes por Mensagem</p>
          Configure o disparo automático de mensagens para alertar seus clientes sobre vencimentos pendentes, atrasos e para enviar o recibo de pagamento em tempo real.
        </div>
      </div>

      <div className="space-y-6 bg-slate-950 p-6 rounded-lg border border-slate-800 shadow-xl">
        {/* API TYPE */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-2">
            Tipo de Integração / Gateway
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setApiType('META')}
              className={`p-3 rounded-lg border text-center font-bold text-xs uppercase transition-all ${
                apiType === 'META'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              API Oficial (Meta)
            </button>
            <button
              type="button"
              onClick={() => setApiType('EVOLUTION')}
              className={`p-3 rounded-lg border text-center font-bold text-xs uppercase transition-all ${
                apiType === 'EVOLUTION'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Evolution API
            </button>
            <button
              type="button"
              onClick={() => setApiType('Z_API')}
              className={`p-3 rounded-lg border text-center font-bold text-xs uppercase transition-all ${
                apiType === 'Z_API'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Z-API
            </button>
          </div>
        </div>

        {/* DINAMIC CREDENTIALS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {apiType !== 'META' && (
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1 mb-2">
                <Link size={12} /> URL da API do Gateway
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={apiType === 'Z_API' ? 'https://api.z-api.io' : 'https://api.evolution.com'}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-xs outline-none focus:border-indigo-500 transition-all"
              />
            </div>
          )}

          <div className={apiType === 'META' ? 'md:col-span-2' : ''}>
            <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1 mb-2">
              <Key size={12} /> Token de Acesso (API Key / Bearer)
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Digite o token de autenticação..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-xs outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          {apiType !== 'META' && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-2">
                ID da Instância (Instance ID / Token Instância)
              </label>
              <input
                type="text"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                placeholder="Ex: minha-instancia-1"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-xs outline-none focus:border-indigo-500 transition-all"
              />
            </div>
          )}
        </div>

        {/* TEMPLATES EDITOR */}
        <div className="pt-6 border-t border-slate-900 space-y-4">
          <h4 className="text-xs font-black text-white uppercase flex items-center gap-2">
            <HelpCircle size={14} className="text-indigo-400" /> Templates das Mensagens (Régua de Cobrança)
          </h4>
          <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider leading-relaxed">
            Variáveis suportadas: <span className="text-indigo-400">{'{nome_cliente}'}</span>, <span className="text-indigo-400">{'{valor_parcela}'}</span>, <span className="text-indigo-400">{'{data_vencimento}'}</span>, <span className="text-indigo-400">{'{copia_e_cola_pix}'}</span>, <span className="text-indigo-400">{'{link_portal}'}</span>
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">
                Lembrete 3 dias antes
              </label>
              <textarea
                value={templateOverdue3d}
                onChange={(e) => setTemplateOverdue3d(e.target.value)}
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">
                Cobrança no Dia do Vencimento
              </label>
              <textarea
                value={templateDueToday}
                onChange={(e) => setTemplateDueToday(e.target.value)}
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">
                Cobrança de Parcela Vencida (Em Atraso)
              </label>
              <textarea
                value={templateLate}
                onChange={(e) => setTemplateLate(e.target.value)}
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">
                Confirmação de Pagamento Recebido (Recibo)
              </label>
              <textarea
                value={templatePaymentReceived}
                onChange={(e) => setTemplatePaymentReceived(e.target.value)}
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* SAVE BUTTON */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg font-bold uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/20"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Save size={16} /> Salvar Credenciais do WhatsApp
            </>
          )}
        </button>

        {/* TEST CONNECTION */}
        <div className="pt-6 border-t border-slate-900 space-y-4">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block">
            Testar Envio Instantâneo
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="DDD + Número (ex: 11999999999)"
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3 text-white font-bold outline-none text-xs focus:border-indigo-500"
            />
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !testPhone}
              className="px-6 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-300 rounded-lg transition-all border border-slate-700 flex items-center justify-center gap-2 active:scale-95"
            >
              {isTesting ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send size={14} />
              )}
              <span className="text-[10px] font-black uppercase">Testar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
