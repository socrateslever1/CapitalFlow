import React, { useEffect, useState } from 'react';
import { HelpCircle, Key, Link, MessageSquare, Save, Send, ShieldCheck } from 'lucide-react';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  whatsappConfigService,
  withDefaultWhatsAppTemplates,
} from '../../../services/whatsappConfig.service';

interface WhatsAppConfigProps {
  profileId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const WhatsAppConfig: React.FC<WhatsAppConfigProps> = ({ profileId, showToast }) => {
  const [apiType, setApiType] = useState<'META' | 'EVOLUTION' | 'Z_API'>('META');
  const [apiUrl, setApiUrl] = useState('');
  const [token, setToken] = useState('');
  const [instanceId, setInstanceId] = useState('');

  const [templateOverdue3d, setTemplateOverdue3d] = useState<string>(DEFAULT_WHATSAPP_TEMPLATES.template_overdue_3d);
  const [templateDueToday, setTemplateDueToday] = useState<string>(DEFAULT_WHATSAPP_TEMPLATES.template_due_today);
  const [templateLate, setTemplateLate] = useState<string>(DEFAULT_WHATSAPP_TEMPLATES.template_late);
  const [templatePaymentReceived, setTemplatePaymentReceived] = useState<string>(
    DEFAULT_WHATSAPP_TEMPLATES.template_payment_received
  );

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
          const templates = withDefaultWhatsAppTemplates(config);
          setTemplateOverdue3d(templates.template_overdue_3d);
          setTemplateDueToday(templates.template_due_today);
          setTemplateLate(templates.template_late);
          setTemplatePaymentReceived(templates.template_payment_received);
        } else {
          setTemplateOverdue3d(DEFAULT_WHATSAPP_TEMPLATES.template_overdue_3d);
          setTemplateDueToday(DEFAULT_WHATSAPP_TEMPLATES.template_due_today);
          setTemplateLate(DEFAULT_WHATSAPP_TEMPLATES.template_late);
          setTemplatePaymentReceived(DEFAULT_WHATSAPP_TEMPLATES.template_payment_received);
        }
      } catch (err) {
        console.error('Erro ao carregar configuracoes do WhatsApp:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (profileId) loadConfig();
  }, [profileId]);

  const handleSave = async () => {
    if (!token.trim()) {
      showToast('O token de acesso e obrigatorio.', 'error');
      return;
    }

    if (!instanceId.trim()) {
      showToast(
        apiType === 'META'
          ? 'O ID do numero de telefone da Meta e obrigatorio.'
          : 'O ID da instancia e obrigatorio.',
        'error'
      );
      return;
    }

    if (apiType !== 'META' && !apiUrl.trim()) {
      showToast('A URL da API e obrigatoria para este tipo de conexao.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await whatsappConfigService.saveConfig(profileId, {
        api_type: apiType,
        api_url: apiUrl,
        token,
        instance_id: instanceId,
        template_overdue_3d: templateOverdue3d,
        template_due_today: templateDueToday,
        template_late: templateLate,
        template_payment_received: templatePaymentReceived,
      });
      showToast('Configuracoes do WhatsApp salvas com sucesso!', 'success');
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
    return <div className="animate-pulse h-60 bg-slate-800 rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-indigo-500">
        <MessageSquare size={24} className="fill-indigo-500/20 text-indigo-500" />
        <h3 className="text-lg font-black uppercase">Notificacoes e API do WhatsApp</h3>
      </div>

      <div className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-lg flex gap-3">
        <ShieldCheck className="text-indigo-400 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-indigo-400 font-bold uppercase mb-1">Cobrancas Inteligentes por Mensagem</p>
          Configure o disparo automatico de mensagens para alertar seus clientes sobre vencimentos pendentes,
          atrasos e para enviar o recibo de pagamento em tempo real.
        </div>
      </div>

      <div className="space-y-6 bg-slate-950 p-6 rounded-lg border border-slate-800 shadow-xl">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-2">
            Tipo de Integracao / Gateway
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['META', 'API Oficial (Meta)'],
              ['EVOLUTION', 'Evolution API'],
              ['Z_API', 'Z-API'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setApiType(value as 'META' | 'EVOLUTION' | 'Z_API')}
                className={`p-3 rounded-lg border text-center font-bold text-xs uppercase transition-all ${
                  apiType === value
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

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

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1 mb-2">
              <Key size={12} /> Token de Acesso (API Key / Bearer)
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Digite o token de autenticacao..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-xs outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-2">
              {apiType === 'META'
                ? 'ID do Numero de Telefone (Phone Number ID)'
                : 'ID da Instancia (Instance ID / Token Instancia)'}
            </label>
            <input
              type="text"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              placeholder={apiType === 'META' ? 'Ex: 123456789012345' : 'Ex: minha-instancia-1'}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white font-mono text-xs outline-none focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        <div className="pt-6 border-t border-slate-900 space-y-4">
          <h4 className="text-xs font-black text-white uppercase flex items-center gap-2">
            <HelpCircle size={14} className="text-indigo-400" /> Templates das Mensagens (Regua de Cobranca)
          </h4>
          <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider leading-relaxed">
            Variaveis suportadas: <span className="text-indigo-400">{'{nome_cliente}'}</span>,{' '}
            <span className="text-indigo-400">{'{valor_parcela}'}</span>,{' '}
            <span className="text-indigo-400">{'{data_vencimento}'}</span>,{' '}
            <span className="text-indigo-400">{'{copia_e_cola_pix}'}</span>,{' '}
            <span className="text-indigo-400">{'{link_portal}'}</span>
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
                Cobranca no Dia do Vencimento
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
                Cobranca de Parcela Vencida (Em Atraso)
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
                Confirmacao de Pagamento Recebido (Recibo)
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

        <div className="pt-6 border-t border-slate-900 space-y-4">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block">
            Testar Envio Instantaneo
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="DDD + Numero (ex: 11999999999)"
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
