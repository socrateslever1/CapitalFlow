import React, { useEffect, useState } from 'react';
import { leadsService } from '../services/leads.service';
import { Lead } from '../types';
import { supabase } from '../lib/supabase';
import { buildWhatsAppLink } from '../utils/whatsapp';
import { formatMoney, maskPhone } from '../utils/formatters';
import { MessageCircle, Clock, CheckCircle2, XCircle, Loader2, User, ChevronLeft, X, Send } from 'lucide-react';
import { whatsappConfigService, WhatsAppConfigData } from '../services/whatsappConfig.service';

export const LeadsPage: React.FC<{ activeUser: any; goBack?: () => void; isStealthMode?: boolean }> = ({ activeUser, goBack, isStealthMode }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // --- STATE PARA INTEGRACAO WHATSAPP ---
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfigData | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [selectedLeadForTest, setSelectedLeadForTest] = useState<Lead | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  const fetchLeads = async () => {
    try {
      const data = await leadsService.listLeads(activeUser.id);
      setLeads(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const profileId = activeUser?.profile_id || activeUser?.id;
    if (profileId) {
      whatsappConfigService.getConfig(profileId).then(config => {
        setWhatsappConfig(config);
      });
    }
  }, [activeUser]);

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel('leads_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_leads' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setLeads(prev => [payload.new as Lead, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setLeads(prev => prev.map(l => l.id === payload.new.id ? payload.new as Lead : l));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeUser.id]);

  const handleStatusChange = async (id: string, status: Lead['status']) => {
    try {
      await leadsService.updateLeadStatus(id, status);
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    } catch (error) {
      console.error(error);
    }
  };

  const openWhatsApp = (lead: Lead) => {
    if (whatsappConfig?.token) {
      setSelectedLeadForTest(lead);
      setTestModalOpen(true);
    } else {
      const msg = `Olá ${lead.nome || ''}, vi seu interesse no empréstimo de ${formatMoney(lead.valor_solicitado, isStealthMode)}. Podemos conversar?`;
      window.open(buildWhatsAppLink(lead.whatsapp, msg), '_blank');
      if (lead.status === 'NOVO') {
        handleStatusChange(lead.id, 'EM_ATENDIMENTO');
      }
    }
  };

  const handleSendApiLeadMessage = async () => {
    if (!selectedLeadForTest || sendingTest) return;
    const profileId = activeUser?.profile_id || activeUser?.id;
    if (!profileId) return;

    setSendingTest(true);
    try {
      const msg = `Olá ${selectedLeadForTest.nome || ''}, vi seu interesse no empréstimo de ${formatMoney(selectedLeadForTest.valor_solicitado, isStealthMode)}. Podemos conversar?`;
      const res = await whatsappConfigService.sendMessage(profileId, selectedLeadForTest.whatsapp, msg);

      if (res.success) {
        alert('Mensagem enviada com sucesso via API!');
        if (selectedLeadForTest.status === 'NOVO') {
          await handleStatusChange(selectedLeadForTest.id, 'EM_ATENDIMENTO');
        }
        setTestModalOpen(false);
        setSelectedLeadForTest(null);
      } else {
        alert(`Erro ao enviar: ${res.message || 'Erro desconhecido'}`);
      }
    } catch (err: any) {
      alert(`Falha no envio: ${err.message || err}`);
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in font-sans pb-24">
      <div className="flex flex-col md:flex-row justify-end items-start md:items-center gap-4">
        <div className="bg-slate-900 px-4 py-2 rounded-lg border border-slate-800">
           <span className="text-sm font-semibold uppercase tracking-widest text-white">{leads.filter(l => l.status === 'NOVO').length} Novos</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {leads.map(lead => (
          <div id={lead.id} key={lead.id} className={`bg-slate-900 border ${lead.status === 'NOVO' ? 'border-blue-500/50 shadow-lg shadow-blue-500/10' : 'border-slate-800'} p-5 rounded-lg relative overflow-hidden group transition-all hover:border-slate-700`}>
             {lead.status === 'NOVO' && <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-black uppercase px-3 py-1 rounded-bl-xl">Novo</div>}

             <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
                      <User size={20}/>
                   </div>
                   <div>
                      <h3 className="text-white font-semibold text-sm">{lead.nome || 'Sem Nome'}</h3>
                      <p className="text-slate-500 text-sm">{maskPhone(lead.whatsapp, isStealthMode)}</p>
                   </div>
                </div>
             </div>

             <div className="mb-4">
                <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest">Valor Solicitado</p>
                <p className="text-xl font-black text-emerald-400">{formatMoney(lead.valor_solicitado, isStealthMode)}</p>
             </div>

             <div className="flex gap-2">
                <button
                  onClick={() => openWhatsApp(lead)}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black uppercase text-sm flex items-center justify-center gap-2 transition-all"
                >
                   <MessageCircle size={14}/> Conversar
                </button>

                {lead.status !== 'CONVERTIDO' && lead.status !== 'REJEITADO' && (
                  <>
                    <button onClick={() => handleStatusChange(lead.id, 'CONVERTIDO')} className="p-3 bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white rounded-lg transition-all" title="Converter">
                       <CheckCircle2 size={16}/>
                    </button>
                    <button onClick={() => handleStatusChange(lead.id, 'REJEITADO')} className="p-3 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-lg transition-all" title="Rejeitar">
                       <XCircle size={16}/>
                    </button>
                  </>
                )}
             </div>

             <div className="mt-3 flex items-center justify-between text-sm font-medium uppercase text-slate-500">
                <span className="flex items-center gap-1"><Clock size={10}/> {new Date(lead.created_at).toLocaleDateString('pt-BR')}</span>
                <span className={`${lead.status === 'CONVERTIDO' ? 'text-blue-500' : lead.status === 'REJEITADO' ? 'text-rose-500' : 'text-slate-500'}`}>{lead.status}</span>
             </div>
          </div>
        ))}

        {leads.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-500">
             <p className="text-sm font-semibold uppercase">Nenhum lead encontrado.</p>
          </div>
        )}
      </div>

      {/* MODAL DE ENVIO DE TESTE / PRIMEIRO CONTATO DE LEADS */}
      {testModalOpen && selectedLeadForTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <MessageCircle size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white uppercase tracking-tight">Iniciar Conversa</h3>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Envio via WhatsApp</p>
                </div>
              </div>
              <button
                onClick={() => { setTestModalOpen(false); setSelectedLeadForTest(null); }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-5 space-y-4 font-sans">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Cliente / Lead</p>
                <p className="text-sm font-semibold text-white">{selectedLeadForTest.nome || 'Sem Nome'}</p>
                <p className="text-xs text-slate-400 mt-0.5">{maskPhone(selectedLeadForTest.whatsapp, isStealthMode)}</p>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Mensagem Inicial</p>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 font-medium whitespace-pre-wrap">
                  {`Olá ${selectedLeadForTest.nome || ''}, vi seu interesse no empréstimo de ${formatMoney(selectedLeadForTest.valor_solicitado, isStealthMode)}. Podemos conversar?`}
                </div>
              </div>

              <div className="border-t border-slate-800/60 pt-4 space-y-4">
                {/* Opção API */}
                <div className="bg-slate-950/30 border border-slate-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Enviar pelo Servidor (API)</span>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-bold rounded border border-emerald-500/20 uppercase tracking-widest">Recomendado</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                    A mensagem será enviada em segundo plano utilizando suas credenciais configuradas de WhatsApp.
                  </p>
                  <button
                    onClick={handleSendApiLeadMessage}
                    disabled={sendingTest}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black uppercase text-xs shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 transition-all active:scale-98"
                  >
                    {sendingTest ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                    Disparar pelo Servidor
                  </button>
                </div>

                {/* Separador */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-[1px] bg-slate-800"></div>
                  <span className="text-[9px] font-black uppercase text-slate-600 tracking-widest">ou</span>
                  <div className="flex-1 h-[1px] bg-slate-800"></div>
                </div>

                {/* Opção Manual */}
                <div className="flex items-center justify-between bg-slate-950/30 border border-slate-800 rounded-lg p-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">WhatsApp Web (Manual)</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Abre uma nova aba no navegador.</p>
                  </div>
                  <button
                    onClick={() => {
                      const msg = `Olá ${selectedLeadForTest.nome || ''}, vi seu interesse no empréstimo de ${formatMoney(selectedLeadForTest.valor_solicitado, isStealthMode)}. Podemos conversar?`;
                      window.open(buildWhatsAppLink(selectedLeadForTest.whatsapp, msg), '_blank');
                      if (selectedLeadForTest.status === 'NOVO') {
                        handleStatusChange(selectedLeadForTest.id, 'EM_ATENDIMENTO');
                      }
                      setTestModalOpen(false);
                      setSelectedLeadForTest(null);
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold uppercase text-xs transition-colors border border-slate-700"
                  >
                    Abrir manual
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
