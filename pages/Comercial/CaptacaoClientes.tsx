import React, { useState, useEffect, useRef } from 'react';
import { Megaphone, Link as LinkIcon, Copy, CheckCircle2, ArrowRight, Trash2, Calendar, MousePointer2, Image as ImageIcon, Loader2, MessageCircle, Share2, Plus, Search, User, Send, Paperclip, X, ChevronLeft } from 'lucide-react';
import { Campaign, Lead, UserProfile } from "../../types";
import { campaignService } from '../../services/campaign.service';
import { useCampaignChat } from '../../hooks/useCampaignChat';
import { supabase } from '../../lib/supabase';
import { formatMoney, maskPhone } from '../../utils/formatters';
import { GoogleGenAI } from "@google/genai";

const DEFAULT_VALUES = [300, 500, 800, 1000, 1500];
const DEFAULT_TEMPLATE = "Olá! Me chamo {NOME}. Vim pela campanha {CAMPANHA}. Tenho interesse no valor de R$ {VALOR}. Link: {LINK}";

export const CustomerAcquisitionPage: React.FC<{ activeUser: UserProfile | null, goBack?: () => void, isStealthMode?: boolean }> = ({ activeUser, goBack, isStealthMode }) => {
  const [activeMode, setActiveMode] = useState<'CHAT' | 'CAMPAIGNS'>('CHAT');
  
  // --- STATE PARA CAMPANHAS ---
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [view, setView] = useState<'LIST' | 'FORM'>('LIST');
  const [form, setForm] = useState<Partial<Campaign>>({
    name: '',
    source: '',
    description: '',
    values: DEFAULT_VALUES,
    messageTemplate: DEFAULT_TEMPLATE,
    status: 'ACTIVE'
  });
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  // --- STATE PARA ATENDIMENTO (CHAT) ---
  const {
    leads,
    selectedSession,
    messages,
    loadingLeads,
    loadingMessages,
    sending,
    uploading,
    loadLeads,
    selectLead,
    sendMessage,
    sendAttachment
  } = useCampaignChat();

    const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [inputText, setInputText] = useState('');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeMode === 'CAMPAIGNS') {
      loadCampaigns();
    } else {
      loadLeads();
    }
  }, [activeMode, loadLeads]);

  useEffect(() => {
    if (activeMode === 'CHAT') {
      const filtered = leads.filter(l => 
        (l.nome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (l.whatsapp || '').includes(searchTerm) ||
        (l.cpf || '').includes(searchTerm)
      );
      setFilteredLeads(filtered);
    }
  }, [searchTerm, leads, activeMode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

    const handleSelectLead = (lead: Lead) => {
    selectLead(lead);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedSession || sending) return;
    
    try {
      await sendMessage(inputText);
      setInputText('');
    } catch (e) {
      alert('Erro ao enviar mensagem');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSession) return;

    try {
      await sendAttachment(file);
    } catch (e) {
      alert('Erro ao enviar anexo');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const loadCampaigns = () => {
    setCampaigns(campaignService.getCampaigns());
  };

  const handleSave = () => {
    if (!form.name || !form.source || !activeUser) {
      alert('Preencha nome, origem e certifique-se de estar logado.');
      return;
    }

    const id = form.id || crypto.randomUUID();
    const link = `${window.location.origin}/?campaign_id=${id}`;

    const newCampaign: Campaign = {
      profile_id: activeUser.profile_id,
      id,
      name: form.name,
      description: form.description,
      source: form.source,
      link,
      createdAt: form.createdAt || new Date().toISOString(),
      status: form.status || 'ACTIVE',
      values: form.values || DEFAULT_VALUES,
      messageTemplate: form.messageTemplate || DEFAULT_TEMPLATE,
      imageUrl: generatedImage || form.imageUrl,
      clicks: form.clicks || 0,
      leads: form.leads || 0
    };

    try {
      campaignService.saveCampaign(newCampaign);
      loadCampaigns();
      setView('LIST');
      setForm({ values: DEFAULT_VALUES, messageTemplate: DEFAULT_TEMPLATE, status: 'ACTIVE' });
      setGeneratedImage(null);
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar campanha. Tente usar uma imagem menor.');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Excluir campanha?')) {
      campaignService.deleteCampaign(id);
      loadCampaigns();
    }
  };

  const handleGenerateImage = async () => {
    if (!form.name) {
      alert('Preencha o nome da campanha primeiro.');
      return;
    }
    
    setGeneratingImage(true);
    try {
      const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!googleApiKey) {
        throw new Error("Chave da API do Gemini não configurada.");
      }
      const ai = new GoogleGenAI({ apiKey: googleApiKey });
      const prompt = `Create a professional, clean, and trustworthy social media image for a financial service campaign named "${form.name}". 
      Text to include: "Simule seu crédito" and "Escolha o valor e fale no WhatsApp". 
      Style: Commercial, financial, blue and white tones, high quality. 
      Aspect ratio 1:1.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: {
            imageConfig: {
                aspectRatio: "1:1",
            }
        }
      });

      let base64Image = null;
      if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                  base64Image = `data:image/png;base64,${part.inlineData.data}`;
                  break;
              }
          }
      }

      if (base64Image) {
        setGeneratedImage(base64Image);
      } else {
        alert('Não foi possível gerar a imagem. Tente novamente.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar imagem.');
    } finally {
      setGeneratingImage(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copiado!');
  };

  const shareWhatsApp = (campaign: Campaign) => {
    const msg = campaign.messageTemplate
      .replace('{NOME}', 'Cliente')
      .replace('{VALOR}', campaign.values[0].toString())
      .replace('{LINK}', campaign.link)
      .replace('{CAMPANHA}', campaign.name);
    
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col animate-in fade-in">
      {/* HEADER COM TOGGLE */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-orange-900/20">
              <Megaphone size={20}/>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">Captação de <span className="text-blue-500">Clientes</span></h1>
              <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">
                {activeMode === 'CHAT' ? 'Gerenciamento de Leads' : 'Gerador de Campanhas'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveMode('CHAT')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-widest transition-all ${activeMode === 'CHAT' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
          >
            Atendimento
          </button>
          <button 
            onClick={() => setActiveMode('CAMPAIGNS')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-widest transition-all ${activeMode === 'CAMPAIGNS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
          >
            Campanhas
          </button>
        </div>
      </div>

      {activeMode === 'CHAT' ? (
        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* SIDEBAR DE LEADS */}
          <div className="w-full md:w-80 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/>
                <input 
                  type="text"
                  placeholder="Buscar lead..."
                  className="w-full bg-slate-950 border border-slate-800 pl-10 pr-4 py-2 rounded-xl text-sm font-medium text-white outline-none focus:border-blue-500 transition-colors"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {loadingLeads ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
                  <Loader2 className="animate-spin" size={24}/>
                  <span className="text-[10px] font-black uppercase">Carregando Leads...</span>
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <p className="text-[10px] font-black uppercase">Nenhum lead encontrado</p>
                </div>
              ) : (
                filteredLeads.map(lead => (
                  <button
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className={`w-full p-4 rounded-2xl text-left transition-all border relative overflow-hidden ${selectedSession?.id === lead.id ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-600/20' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}`}
                  >
                    {lead.status === 'NOVO' && (
                      <div className="absolute top-0 right-0 bg-amber-500 text-black text-[10px] font-black uppercase px-2 py-0.5 rounded-bl-lg shadow-sm">
                        Novo
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold uppercase truncate ${selectedSession?.id === lead.id ? 'text-white' : 'text-slate-200'}`}>
                        {lead.nome || 'Sem Nome'}
                      </span>
                      <span className={`text-sm font-medium ${selectedSession?.id === lead.id ? 'text-blue-200' : 'text-slate-500'}`}>
                        {new Date(lead.created_at).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${selectedSession?.id === lead.id ? 'text-blue-100' : 'text-slate-400'}`}>
                        {maskPhone(lead.whatsapp, isStealthMode)}
                      </span>
                      {lead.valor_solicitado && (
                        <span className={`text-sm font-black ${selectedSession?.id === lead.id ? 'text-white' : 'text-emerald-500'}`}>
                          {formatMoney(lead.valor_solicitado, isStealthMode)}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ÁREA DE CHAT */}
          <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {selectedSession ? (
              <>
                {/* Header do Chat */}
                <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600/10 rounded-full flex items-center justify-center text-blue-500 border border-blue-500/20">
                      <User size={20}/>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white uppercase tracking-tight">{selectedSession.nome || 'Lead s/ Nome'}</h3>
                      <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">{maskPhone(selectedSession.whatsapp, isStealthMode)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-slate-900 rounded-full text-[9px] font-black uppercase text-slate-400 border border-slate-800">
                      Campanha: {selectedSession.campaign_id || 'Direta'}
                    </span>
                  </div>
                </div>

                {/* Mensagens */}
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-950/20"
                >
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="animate-spin text-blue-500" size={32}/>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                      <MessageCircle size={48} className="opacity-20"/>
                      <p className="text-xs font-bold uppercase tracking-widest">Inicie a conversa com este lead</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isOperator = msg.sender === 'OPERATOR';
                      return (
                        <div 
                          key={msg.id || idx}
                          className={`flex ${isOperator ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[80%] p-4 rounded-2xl text-sm font-medium shadow-sm ${isOperator ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'}`}>
                            {msg.message?.startsWith('[ANEXO]') ? (
                              <div className="space-y-2">
                                {msg.message.split(' ')[1].match(/\.(jpeg|jpg|gif|png)$/) ? (
                                  <img 
                                    src={msg.message.split(' ')[1]} 
                                    alt="Anexo" 
                                    className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => window.open(msg.message.split(' ')[1], '_blank')}
                                  />
                                ) : (
                                  <a 
                                    href={msg.message.split(' ')[1]} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="flex items-center gap-2 underline"
                                  >
                                    <Paperclip size={14}/> Ver Arquivo
                                  </a>
                                )}
                              </div>
                            ) : (
                              msg.message
                            )}
                            <div className={`text-[9px] mt-1 font-bold uppercase opacity-50 ${isOperator ? 'text-right' : 'text-left'}`}>
                              {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Input de Mensagem */}
                <div className="p-4 bg-slate-950/50 border-t border-slate-800">
                  <div className="flex items-end gap-3">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={handleFileUpload}
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-500 rounded-xl transition-colors border border-slate-800 disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="animate-spin" size={20}/> : <Paperclip size={20}/>}
                    </button>
                    <div className="flex-1 relative">
                      <textarea 
                        rows={1}
                        placeholder="Digite sua mensagem..."
                        className="w-full bg-slate-900 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-medium resize-none max-h-32"
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                      />
                    </div>
                    <button 
                      onClick={handleSendMessage}
                      disabled={!inputText.trim() || sending}
                      className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                    >
                      {sending ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-10 text-center">
                <div className="w-24 h-24 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-center mb-6 shadow-2xl">
                  <MessageCircle size={40} className="opacity-20"/>
                </div>
                <h3 className="text-white font-black uppercase tracking-tight text-lg mb-2">Selecione um Lead</h3>
                <p className="text-slate-500 text-xs font-medium max-w-xs leading-relaxed uppercase tracking-widest">
                  Escolha um lead na lista ao lado para visualizar o histórico e responder mensagens.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          {/* O CONTEÚDO ORIGINAL DE CAMPANHAS VEM AQUI */}
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 border border-blue-500/20">
                  <Megaphone size={20}/>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white uppercase tracking-tighter">Minhas Campanhas</h2>
                  <p className="text-sm text-slate-500 font-medium uppercase tracking-widest">Gerencie seus links de captação</p>
                </div>
              </div>
              
              {view === 'LIST' && (
                <button 
                  onClick={() => { setForm({ values: DEFAULT_VALUES, messageTemplate: DEFAULT_TEMPLATE, status: 'ACTIVE' }); setGeneratedImage(null); setView('FORM'); }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs flex items-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  <Plus size={16}/> Nova Campanha
                </button>
              )}
            </div>

            {view === 'FORM' ? (
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-3xl mx-auto shadow-xl">
                <div className="flex items-center gap-2 text-white font-bold uppercase text-sm border-b border-slate-800 pb-4 mb-6">
                  <LinkIcon size={16} className="text-blue-500"/>
                  <h2>{form.id ? 'Editar Campanha' : 'Nova Campanha'}</h2>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Nome (utm_campaign) *</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                        placeholder="Ex: verao_2024"
                        value={form.name || ''}
                        onChange={e => setForm({...form, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Origem (utm_source) *</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                        placeholder="Ex: instagram"
                        value={form.source || ''}
                        onChange={e => setForm({...form, source: e.target.value})}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Descrição</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                      value={form.description || ''}
                      onChange={e => setForm({...form, description: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Valores Disponíveis (separados por vírgula)</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                      value={form.values?.join(', ') || ''}
                      onChange={e => setForm({...form, values: e.target.value.split(',').map(v => Number(v.trim())).filter(n => !isNaN(n))})}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Template de Mensagem WhatsApp</label>
                    <textarea 
                      className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold h-24"
                      value={form.messageTemplate || ''}
                      onChange={e => setForm({...form, messageTemplate: e.target.value})}
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Variáveis: {'{NOME}, {VALOR}, {LINK}, {CAMPANHA}'}</p>
                  </div>

                  <div className="border-t border-slate-800 pt-6">
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-2 block">Imagem da Campanha</label>
                    <div className="flex items-start gap-4">
                        <div className="w-32 h-32 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden">
                          {generatedImage || form.imageUrl ? (
                            <img src={generatedImage || form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="text-slate-700" size={32}/>
                          )}
                        </div>
                        <div className="flex-1">
                          <button 
                            onClick={handleGenerateImage}
                            disabled={generatingImage || !form.name}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-bold uppercase text-xs flex items-center gap-2 shadow-lg shadow-purple-600/20 disabled:opacity-50"
                          >
                            {generatingImage ? <Loader2 className="animate-spin" size={14}/> : <ImageIcon size={14}/>}
                            Gerar com IA
                          </button>
                          <p className="text-[10px] text-slate-500 mt-2">Gera uma imagem exclusiva para usar nas redes sociais.</p>
                        </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => setView('LIST')}
                      className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black uppercase text-xs"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSave}
                      className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-xs shadow-lg shadow-emerald-600/20"
                    >
                      Salvar Campanha
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {campaigns.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 bg-slate-900 rounded-2xl border border-slate-800">
                    <Megaphone size={48} className="mx-auto mb-4 opacity-20"/>
                    <p className="text-sm font-bold">Nenhuma campanha criada.</p>
                    <p className="text-xs mt-1">Crie sua primeira campanha para começar a captar leads.</p>
                  </div>
                ) : (
                  campaigns.map(campaign => (
                    <div key={campaign.id} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center gap-6 group hover:border-slate-700 transition-colors shadow-xl">
                      {campaign.imageUrl && (
                        <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0">
                          <img src={campaign.imageUrl} alt={campaign.name} className="w-full h-full object-cover"/>
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-white font-semibold text-sm truncate">{campaign.name}</h3>
                          <span className="px-2 py-0.5 bg-slate-950 rounded text-[10px] font-bold uppercase text-slate-400 border border-slate-800">
                            {campaign.source}
                          </span>
                        </div>
                        <p className="text-slate-500 text-sm truncate mb-3">{campaign.description || 'Sem descrição'}</p>
                        
                        <div className="flex items-center gap-4 text-sm text-slate-400 font-medium uppercase tracking-wider bg-slate-950/50 p-2 rounded-lg w-fit">
                          <span className="flex items-center gap-1"><Calendar size={12}/> {new Date(campaign.createdAt).toLocaleDateString()}</span>
                          <span className="flex items-center gap-1 text-blue-400"><MousePointer2 size={12}/> {campaign.clicks || 0} Cliques</span>
                          <span className="flex items-center gap-1 text-emerald-400"><MessageCircle size={12}/> {campaign.leads || 0} Leads</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 w-full md:w-auto">
                        <div className="flex items-center gap-2">
                            <button 
                              onClick={() => copyToClipboard(campaign.link)}
                              className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-2 transition-colors"
                            >
                              <LinkIcon size={14}/> Copiar Link
                            </button>
                            <button 
                              onClick={() => shareWhatsApp(campaign)}
                              className="px-3 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 rounded-lg transition-colors"
                              title="Testar WhatsApp"
                            >
                              <Share2 size={16}/>
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                              onClick={() => { setForm(campaign); setGeneratedImage(campaign.imageUrl || null); setView('FORM'); }}
                              className="flex-1 px-3 py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-lg text-[10px] font-bold uppercase transition-colors"
                            >
                              Editar
                            </button>
                            <button 
                              onClick={() => handleDelete(campaign.id)}
                              className="px-3 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={16}/>
                            </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
