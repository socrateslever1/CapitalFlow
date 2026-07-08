import React, { useEffect, useState } from 'react';
import { 
  HelpCircle, 
  Key, 
  Link, 
  MessageSquare, 
  Save, 
  Send, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  RotateCw, 
  AlertTriangle, 
  List, 
  FileText, 
  Clock 
} from 'lucide-react';
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
  const [activeSubTab, setActiveSubTab] = useState<'CONFIG' | 'TEMPLATES' | 'QUEUE'>('CONFIG');

  // Configs Estado
  const [apiType, setApiType] = useState<'META' | 'EVOLUTION' | 'Z_API'>('META');
  const [configs, setConfigs] = useState<Record<'META' | 'EVOLUTION' | 'Z_API', { apiUrl: string; token: string; instanceId: string }>>({
    META: { apiUrl: '', token: '', instanceId: '' },
    EVOLUTION: { apiUrl: '', token: '', instanceId: '' },
    Z_API: { apiUrl: '', token: '', instanceId: '' },
  });

  const apiUrl = configs[apiType].apiUrl;
  const token = configs[apiType].token;
  const instanceId = configs[apiType].instanceId;

  const setApiUrl = (val: string) => setConfigs((prev) => ({ ...prev, [apiType]: { ...prev[apiType], apiUrl: val } }));
  const setToken = (val: string) => setConfigs((prev) => ({ ...prev, [apiType]: { ...prev[apiType], token: val } }));
  const setInstanceId = (val: string) => setConfigs((prev) => ({ ...prev, [apiType]: { ...prev[apiType], instanceId: val } }));

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

  // Templates Estado
  const [templates, setTemplates] = useState<any[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [tplCategory, setTplCategory] = useState<'AVISO' | 'COBRANCA' | 'CONFIRMACAO' | 'ATENDIMENTO' | 'JURIDICO'>('AVISO');
  const [tplName, setTplName] = useState('');
  const [tplContent, setTplContent] = useState('');
  const [tplApproval, setTplApproval] = useState(false);

  // Fila e Logs Estado
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const [isTriggeringReminders, setIsTriggeringReminders] = useState(false);

  const fetchTemplates = async () => {
    try {
      const data = await whatsappConfigService.listTemplates(profileId);
      setTemplates(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchQueue = async () => {
    setIsQueueLoading(true);
    try {
      const data = await whatsappConfigService.listQueue(profileId);
      setQueueItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsQueueLoading(false);
    }
  };

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const config = await whatsappConfigService.getConfig(profileId);
        if (config) {
          const loadedType = config.api_type as 'META' | 'EVOLUTION' | 'Z_API';
          setApiType(loadedType);
          setConfigs((prev) => ({
            ...prev,
            [loadedType]: {
              apiUrl: config.api_url || '',
              token: config.token || '',
              instanceId: config.instance_id || '',
            },
          }));
          const templates = withDefaultWhatsAppTemplates(config);
          setTemplateOverdue3d(templates.template_overdue_3d);
          setTemplateDueToday(templates.template_due_today);
          setTemplateLate(templates.template_late);
          setTemplatePaymentReceived(templates.template_payment_received);
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

  // CRUD Templates
  const handleOpenForm = (tpl?: any) => {
    if (tpl) {
      setEditingTemplateId(tpl.id);
      setTplCategory(tpl.category);
      setTplName(tpl.name);
      setTplContent(tpl.content);
      setTplApproval(tpl.requires_approval);
    } else {
      setEditingTemplateId(null);
      setTplCategory('AVISO');
      setTplName('');
      setTplContent('');
      setTplApproval(false);
    }
    setIsFormOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!tplName.trim()) {
      showToast('O nome do template e obrigatorio.', 'error');
      return;
    }
    if (!tplContent.trim()) {
      showToast('O conteudo da mensagem e obrigatorio.', 'error');
      return;
    }

    try {
      await whatsappConfigService.saveTemplate(profileId, {
        id: editingTemplateId || undefined,
        category: tplCategory,
        name: tplName,
        content: tplContent,
        requires_approval: tplCategory === 'JURIDICO' ? true : tplApproval
      });
      showToast('Template salvo com sucesso!', 'success');
      setIsFormOpen(false);
      fetchTemplates();
    } catch (err: any) {
      showToast('Erro ao salvar template: ' + (err.message || ''), 'error');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Deseja realmente excluir este template?')) return;
    try {
      await whatsappConfigService.deleteTemplate(id);
      showToast('Template deletado com sucesso!', 'success');
      fetchTemplates();
    } catch (err: any) {
      showToast('Erro ao excluir template: ' + (err.message || ''), 'error');
    }
  };

  // Ações da Fila
  const handleApproveMessage = async (id: string) => {
    try {
      await whatsappConfigService.approveMessage(id, profileId);
      showToast('Mensagem aprovada e enfileirada para envio!', 'success');
      fetchQueue();
    } catch (err: any) {
      showToast('Erro ao aprovar mensagem: ' + (err.message || ''), 'error');
    }
  };

  const handleRejectMessage = async (id: string) => {
    try {
      await whatsappConfigService.rejectMessage(id);
      showToast('Mensagem recusada com sucesso.', 'info');
      fetchQueue();
    } catch (err: any) {
      showToast('Erro ao recusar mensagem: ' + (err.message || ''), 'error');
    }
  };

  const handleTriggerBilling = async () => {
    setIsTriggeringReminders(true);
    try {
      const res = await whatsappConfigService.triggerBillingReminders();
      if (res.success) {
        showToast(`Regua processada! ${res.processed_count} novas mensagens enfileiradas.`, 'success');
        fetchQueue();
      } else {
        showToast('Erro ao processar regua: ' + (res.message || ''), 'error');
      }
    } catch (err: any) {
      showToast('Falha tecnica ao disparar: ' + (err.message || ''), 'error');
    } finally {
      setIsTriggeringReminders(false);
    }
  };

  if (isLoading) {
    return <div className="animate-pulse h-60 bg-slate-800 rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-indigo-500">
          <MessageSquare size={24} className="fill-indigo-500/20 text-indigo-500" />
          <h3 className="text-lg font-black uppercase">Gestao e Regua de WhatsApp</h3>
        </div>
      </div>

      <div className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-lg flex gap-3">
        <ShieldCheck className="text-indigo-400 shrink-0" size={20} />
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
          <p className="text-indigo-400 font-bold uppercase mb-1">Regua Automatica de Mensagens</p>
          Mapeie templates personalizados para cada fase de atraso. Mensagens de carater juridico/critico podem ser configuradas para exigir sua aprovacao manual antes do envio real.
        </div>
      </div>

      {/* Sub-abas de Navegação */}
      <div className="flex border-b border-slate-800 gap-4">
        <button
          onClick={() => setActiveSubTab('CONFIG')}
          className={`pb-3 text-xs font-black uppercase tracking-wider transition-all ${
            activeSubTab === 'CONFIG' ? 'border-b-2 border-indigo-500 text-white' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Configuracoes de Conexao
        </button>
        <button
          onClick={() => {
            setActiveSubTab('TEMPLATES');
            fetchTemplates();
          }}
          className={`pb-3 text-xs font-black uppercase tracking-wider transition-all ${
            activeSubTab === 'TEMPLATES' ? 'border-b-2 border-indigo-500 text-white' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Templates Customizados
        </button>
        <button
          onClick={() => {
            setActiveSubTab('QUEUE');
            fetchQueue();
          }}
          className={`pb-3 text-xs font-black uppercase tracking-wider transition-all ${
            activeSubTab === 'QUEUE' ? 'border-b-2 border-indigo-500 text-white' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Fila & Aprovacoes
        </button>
      </div>

      {/* RENDER ABA 1: CONFIG */}
      {activeSubTab === 'CONFIG' && (
        <div className="bg-slate-900/40 border border-slate-850 p-6 rounded-xl space-y-6">
          <div className="flex gap-4">
            {(['META', 'EVOLUTION', 'Z_API'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setApiType(type)}
                className={`flex-1 py-3 text-xs font-black uppercase rounded-lg border transition-all ${
                  apiType === type
                    ? 'bg-indigo-600/10 border-indigo-500 text-white font-bold shadow-md shadow-indigo-950/20'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {apiType !== 'META' && (
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1 mb-2">
                  <Link size={12} /> Endereco da API (Gateway URL)
                </label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.meugateway.com"
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
                  : 'ID da Instancia (Instance ID)'}
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
              <HelpCircle size={14} className="text-indigo-400" /> Templates Fixos de Mensagem (Fallback)
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
                  Lembrete 3 dias antes (Aviso)
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
                  Cobranca no Dia do Vencimento (Aviso)
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
                  Cobranca de Parcela Vencida (Cobranca)
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
                  Recibo de Pagamento Recebido (Confirmacao)
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
                <Save size={16} /> Salvar Credenciais e Fallbacks
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
      )}

      {/* RENDER ABA 2: TEMPLATES CUSTOMIZADOS */}
      {activeSubTab === 'TEMPLATES' && (
        <div className="space-y-4">
          {isFormOpen ? (
            <div className="bg-slate-900/40 border border-slate-850 p-6 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-xs font-black text-white uppercase">
                  {editingTemplateId ? 'Editar Template' : 'Adicionar Template de Regua'}
                </h4>
                <button onClick={() => setIsFormOpen(false)} className="text-slate-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-2">Categoria</label>
                  <select
                    value={tplCategory}
                    onChange={(e: any) => setTplCategory(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-white text-xs outline-none focus:border-indigo-500"
                  >
                    <option value="AVISO">Aviso Previo (D-3, D0)</option>
                    <option value="COBRANCA">Cobranca Atraso (D+1, D+3, D+7)</option>
                    <option value="CONFIRMACAO">Confirmacao (Recibo / Baixa)</option>
                    <option value="ATENDIMENTO">Atendimento Manual</option>
                    <option value="JURIDICO">Juridico / Critico (D+15)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-2">Nome Identificador</label>
                  <input
                    type="text"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="Ex: Aviso D+7 Juridico"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-white text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-2">Mensagem do Template</label>
                <p className="text-[8px] text-slate-500 mb-2">
                  Tags validas: <span className="text-indigo-400">{'{nome_cliente}'}</span>, <span className="text-indigo-400">{'{valor_parcela}'}</span>, <span className="text-indigo-400">{'{data_vencimento}'}</span>, <span className="text-indigo-400">{'{copia_e_cola_pix}'}</span>, <span className="text-indigo-400">{'{link_portal}'}</span>
                </p>
                <textarea
                  value={tplContent}
                  onChange={(e) => setTplContent(e.target.value)}
                  rows={4}
                  placeholder="Ola, {nome_cliente}! Lembramos que sua parcela..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>

              {tplCategory !== 'JURIDICO' && (
                <div className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    id="chk-approval"
                    checked={tplApproval}
                    onChange={(e) => setTplApproval(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <label htmlFor="chk-approval" className="text-[10px] font-black text-slate-400 uppercase cursor-pointer select-none">
                    Exigir aprovacao manual antes de enviar
                  </label>
                </div>
              )}

              {tplCategory === 'JURIDICO' && (
                <div className="bg-rose-950/20 border border-rose-900/30 p-3 rounded-lg text-[9px] text-rose-400 font-bold uppercase">
                  Nota: Templates do setor Juridico sempre exigem aprovacao manual por padrao de conformidade e seguranca.
                </div>
              )}

              <div className="flex gap-2 justify-end border-t border-slate-800 pt-3">
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border border-slate-800 text-slate-400 rounded-lg text-xs font-black uppercase hover:bg-slate-800/30"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveTemplate}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black uppercase flex items-center gap-2"
                >
                  <Save size={14} /> Salvar Template
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-900/30 border border-slate-850 p-4 rounded-xl">
                <div>
                  <h4 className="text-xs font-black text-white uppercase">Seus Templates Customizados</h4>
                  <p className="text-[9px] text-slate-500 uppercase font-bold">Crie templates modulares por fase e categoria para a regua automatica.</p>
                </div>
                <button
                  onClick={() => handleOpenForm()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black uppercase flex items-center gap-1.5 shadow-lg shadow-indigo-950/20"
                >
                  <Plus size={14} /> Novo Template
                </button>
              </div>

              {templates.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
                  <FileText className="w-10 h-10 mx-auto text-slate-700 mb-2" />
                  <p className="text-xs font-bold uppercase">Nenhum template customizado cadastrado.</p>
                  <p className="text-[9px] text-slate-600 mt-1 uppercase font-black">O sistema utilizara os templates de fallback fixos.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map((tpl) => (
                    <div key={tpl.id} className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl flex flex-col justify-between hover:border-slate-700 transition-all">
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                            tpl.category === 'JURIDICO' ? 'bg-rose-950/50 text-rose-400 border border-rose-900/30' :
                            tpl.category === 'COBRANCA' ? 'bg-amber-950/50 text-amber-400 border border-amber-900/30' :
                            'bg-blue-950/50 text-blue-400 border border-blue-900/30'
                          }`}>
                            {tpl.category}
                          </span>
                          {tpl.requires_approval && (
                            <span className="text-[8px] font-black text-rose-400 flex items-center gap-1 uppercase">
                              <AlertTriangle size={10} /> Requer Aprovacao
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-black text-white uppercase mb-2">{tpl.name}</h4>
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed font-mono line-clamp-3 bg-slate-950/40 p-2.5 rounded border border-slate-850">
                          {tpl.content}
                        </p>
                      </div>
                      <div className="flex justify-end gap-2 border-t border-slate-850/60 pt-3 mt-3">
                        <button
                          onClick={() => handleOpenForm(tpl)}
                          className="px-2.5 py-1.5 border border-slate-800 text-slate-300 rounded font-black text-[9px] uppercase hover:bg-slate-800/40"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(tpl.id)}
                          className="p-1.5 border border-slate-800/80 text-rose-500 hover:text-rose-400 rounded hover:bg-rose-950/20"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* RENDER ABA 3: FILA E APROVAÇÕES */}
      {activeSubTab === 'QUEUE' && (
        <div className="space-y-6">
          <div className="bg-slate-900/30 border border-slate-850 p-4 rounded-xl flex justify-between items-center">
            <div>
              <h4 className="text-xs font-black text-white uppercase">Logs & Processamento da Regua</h4>
              <p className="text-[9px] text-slate-500 uppercase font-bold">Verifique o status das cobrancas e aprove os disparos criticos pendentes.</p>
            </div>
            <button
              onClick={handleTriggerBilling}
              disabled={isTriggeringReminders}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-black uppercase flex items-center gap-1.5 shadow-lg shadow-emerald-950/20"
            >
              {isTriggeringReminders ? (
                <RotateCw size={14} className="animate-spin" />
              ) : (
                <RotateCw size={14} />
              )}
              Disparar Regua Diaria
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Coluna 1: Central de Aprovações */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-amber-500 uppercase flex items-center gap-2 pl-1">
                <AlertTriangle size={14} /> Aprovacoes Pendentes ({queueItems.filter(i => i.status === 'WAITING_APPROVAL').length})
              </h4>

              {queueItems.filter(i => i.status === 'WAITING_APPROVAL').length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl text-slate-600 bg-slate-900/10">
                  <Clock className="w-8 h-8 mx-auto text-slate-800 mb-2" />
                  <p className="text-[10px] font-black uppercase">Nenhuma mensagem juridica ou cobranca aguardando aprovacao.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {queueItems.filter(i => i.status === 'WAITING_APPROVAL').map((item) => (
                    <div key={item.id} className="bg-slate-900 border border-amber-900/30 p-4 rounded-xl space-y-3">
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="font-bold text-slate-400 font-mono">Dest: +{item.phone}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 font-black uppercase border border-amber-900/30">
                          {item.category || 'JURIDICO'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-300 font-mono leading-relaxed bg-slate-950/50 p-2.5 rounded border border-slate-900">
                        {item.message}
                      </p>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleRejectMessage(item.id)}
                          className="px-3 py-1.5 border border-rose-900/40 text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 rounded text-[9px] font-black uppercase flex items-center gap-1"
                        >
                          <X size={12} /> Recusar
                        </button>
                        <button
                          onClick={() => handleApproveMessage(item.id)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9px] font-black uppercase flex items-center gap-1"
                        >
                          <Check size={12} /> Aprovar Envio
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Coluna 2: Fila & Logs Recentes */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 pl-1">
                <List size={14} /> Fila e Logs Recentes ({queueItems.filter(i => i.status !== 'WAITING_APPROVAL').length})
              </h4>

              {isQueueLoading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-slate-900 rounded-lg animate-pulse" />
                  <div className="h-10 bg-slate-900 rounded-lg animate-pulse" />
                </div>
              ) : queueItems.filter(i => i.status !== 'WAITING_APPROVAL').length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl text-slate-600">
                  <p className="text-[10px] font-black uppercase">Nenhum log ou mensagem processada na fila.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {queueItems.filter(i => i.status !== 'WAITING_APPROVAL').slice(0, 30).map((item) => (
                    <div key={item.id} className="bg-slate-900/40 border border-slate-850 p-3 rounded-lg text-[10px] hover:border-slate-800 transition-all">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-mono text-slate-400 font-bold">+{item.phone}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] text-slate-500 font-bold">
                            {new Date(item.created_at).toLocaleDateString('pt-BR')} {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                            item.status === 'SENT' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/30' :
                            item.status === 'ERROR' ? 'bg-rose-950 text-rose-400 border border-rose-900/30' :
                            'bg-blue-950 text-blue-400 border border-blue-900/30 animate-pulse'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-300 font-mono leading-relaxed line-clamp-2 pr-1">{item.message}</p>
                      {item.status === 'ERROR' && item.error_message && (
                        <p className="text-[8px] text-rose-400 mt-1 font-bold italic uppercase">
                          Motivo: {item.error_message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
