
import React, { useEffect, useState, useRef } from 'react';
import { MessageCircle, CheckCircle2, DollarSign, ArrowRight, Send, Loader2, User, Phone, Fingerprint, ShieldCheck } from 'lucide-react';
import { campaignService, campaignChatService, CampaignChatMessage } from '../../services/campaign.service';
import { Campaign } from '../../types';
import { supabasePortal } from '../../lib/supabasePortal';

/**
 * PÁGINA PÚBLICA DE CAMPANHA (CAPTAÇÃO)
 * Formato Único: /campanha/:id OU ?campaign_id=
 */
export const PublicCampaignPage = () => {
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [step, setStep] = useState(1);
    const [selectedValue, setSelectedValue] = useState<number | null>(null);
    const [leadName, setLeadName] = useState('');
    const [leadPhone, setLeadPhone] = useState('');
    const [leadCPF, setLeadCPF] = useState('');
    
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<CampaignChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isCreatingSession, setIsCreatingSession] = useState(false);

    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('campaign_id');
        if (id) {
            const fetchCampaign = async () => {
                try {
                    const camp = await campaignService.getCampaign(id);
                    if (camp) {
                        setCampaign(camp);
                        campaignService.trackClick(id);
                    }
                } catch (e) {
                    console.error('Erro ao buscar campanha:', e);
                } finally {
                    setLoading(false);
                }
            };
            fetchCampaign();
        } else {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (chatOpen && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, chatOpen]);

    useEffect(() => {
        if (!sessionToken || !chatOpen) return;

        const channel = supabasePortal
            .channel(`campaign_chat_${sessionToken}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'campaign_chat_messages',
                filter: `session_token=eq.${sessionToken}`
            }, (payload) => {
                const msg = payload.new as CampaignChatMessage;
                setChatMessages(prev => {
                    if (prev.find(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
            })
            .subscribe();

        return () => {
            supabasePortal.removeChannel(channel);
        };
    }, [sessionToken, chatOpen]);

    const validateCPF = (cpf: string) => {
        const cleaned = cpf.replace(/\D/g, '');
        if (cleaned.length !== 11) return false;
        if (/^(\d)\1+$/.test(cleaned)) return false;
        let sum = 0, remainder;
        for (let i = 1; i <= 9; i++) sum += parseInt(cleaned.substring(i - 1, i)) * (11 - i);
        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cleaned.substring(9, 10))) return false;
        sum = 0;
        for (let i = 1; i <= 10; i++) sum += parseInt(cleaned.substring(i - 1, i)) * (12 - i);
        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        return remainder === parseInt(cleaned.substring(10, 11));
    };

    const handleStartSimulation = async () => {
        if (!campaign || !selectedValue || !leadName || !leadPhone || !leadCPF) return;
        
        if (!validateCPF(leadCPF)) {
            alert('CPF inválido. Por favor, verifique os dados.');
            return;
        }

        setIsCreatingSession(true);
        try {
            const token = await campaignService.createLeadSession(
                campaign.id,
                leadName,
                leadPhone,
                leadCPF,
                selectedValue
            );

            setSessionToken(token);
            setChatOpen(true);
            
            const msgs = await campaignChatService.listMessages(token);
            setChatMessages(msgs);
            
        } catch (e: any) {
            console.error(e);
            alert('Erro ao iniciar simulação: ' + e.message);
        } finally {
            setIsCreatingSession(false);
        }
    };

    const handleSendMessage = async () => {
        if (!chatInput.trim() || !sessionToken || isSending) return;
        
        const text = chatInput;
        setChatInput('');
        setIsSending(true);

        try {
            await campaignChatService.sendLeadMessage(sessionToken, text);
            const tempMsg: CampaignChatMessage = {
                id: Date.now().toString(),
                session_token: sessionToken,
                sender: 'LEAD',
                message: text,
                created_at: new Date().toISOString()
            };
            setChatMessages(prev => [...prev, tempMsg]);
        } catch (e: any) {
            alert('Erro ao enviar: ' + e.message);
        } finally {
            setIsSending(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 gap-4">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Carregando Campanha...</p>
        </div>
    );

    if (!campaign) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center">
                <h2 className="text-white font-black text-xl mb-2 uppercase">Campanha Indisponível</h2>
                <p className="text-slate-400 text-sm">O link que você acessou não é mais válido ou expirou.</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-blue-500/30">
            <div className="max-w-md mx-auto min-h-screen flex flex-col relative overflow-hidden">
                <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[60%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none"></div>

                <div className="relative z-10 flex-1 flex flex-col p-6">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                                <DollarSign className="text-white" size={24}/>
                            </div>
                            <span className="font-black text-xl tracking-tight uppercase">Capital<span className="text-blue-500">Flow</span></span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-full">
                            <ShieldCheck size={12} className="text-emerald-500"/>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ambiente Seguro</span>
                        </div>
                    </div>

                    {!chatOpen ? (
                        <div className="flex-1 flex flex-col">
                            {campaign.imageUrl && (
                                <div className="w-full aspect-square rounded-2xl overflow-hidden mb-8 shadow-2xl border border-slate-800 relative group">
                                    <img src={campaign.imageUrl} alt={campaign.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"/>
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-80"></div>
                                    <div className="absolute bottom-8 left-8 right-8">
                                        <span className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black uppercase rounded-full mb-3 inline-block shadow-lg">Oportunidade</span>
                                        <h1 className="text-2xl font-black leading-tight uppercase tracking-tight">{campaign.description || 'Crédito rápido e sem burocracia.'}</h1>
                                    </div>
                                </div>
                            )}

                            {step === 1 ? (
                                <div className="space-y-6 animate-in slide-in-from-bottom-10 duration-500">
                                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                                            <CheckCircle2 size={16} className="text-blue-500"/>
                                            Quanto você precisa?
                                        </h2>
                                        <div className="grid grid-cols-2 gap-4">
                                            {campaign.values.map(val => (
                                                <button 
                                                    key={val}
                                                    onClick={() => setSelectedValue(val)}
                                                    className={`p-5 rounded-2xl border transition-all font-black text-xl ${selectedValue === val ? 'bg-blue-600 border-blue-500 text-white shadow-xl scale-105' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}
                                                >
                                                    R$ {val}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => selectedValue && setStep(2)}
                                        disabled={!selectedValue}
                                        className="w-full py-5 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-slate-200 transition-all disabled:opacity-50 shadow-xl flex items-center justify-center gap-2"
                                    >
                                        Continuar Simulação <ArrowRight size={18}/>
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl space-y-6">
                                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
                                            <User size={16} className="text-blue-500"/>
                                            Seus Dados
                                        </h2>
                                        
                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo</label>
                                                <div className="relative">
                                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18}/>
                                                    <input 
                                                        type="text"
                                                        value={leadName}
                                                        onChange={e => setLeadName(e.target.value)}
                                                        placeholder="Ex: João Silva"
                                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-5 text-sm font-black text-white outline-none focus:border-blue-500 transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">WhatsApp</label>
                                                <div className="relative">
                                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18}/>
                                                    <input 
                                                        type="tel"
                                                        value={leadPhone}
                                                        onChange={e => setLeadPhone(e.target.value)}
                                                        placeholder="(00) 00000-0000"
                                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-5 text-sm font-black text-white outline-none focus:border-blue-500 transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">CPF</label>
                                                <div className="relative">
                                                    <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18}/>
                                                    <input 
                                                        type="text"
                                                        value={leadCPF}
                                                        onChange={e => setLeadCPF(e.target.value)}
                                                        placeholder="000.000.000-00"
                                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-5 text-sm font-black text-white outline-none focus:border-blue-500 transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => setStep(1)}
                                            className="flex-1 py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs border border-slate-800"
                                        >
                                            Voltar
                                        </button>
                                        <button 
                                            onClick={handleStartSimulation}
                                            disabled={isCreatingSession || !leadName || !leadPhone || !leadCPF}
                                            className="flex-[2] py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isCreatingSession ? <Loader2 className="animate-spin" size={18}/> : 'Finalizar Simulação'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden animate-in zoom-in-95 duration-500">
                            <div className="p-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-black text-white">
                                        {campaign.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-black uppercase tracking-widest">{campaign.name}</h3>
                                        <div className="flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Consultor Online</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                                {chatMessages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.sender === 'LEAD' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] p-4 rounded-2xl text-sm font-medium ${msg.sender === 'LEAD' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'}`}>
                                            {msg.message}
                                            <div className={`text-[8px] mt-1 opacity-50 ${msg.sender === 'LEAD' ? 'text-right' : 'text-left'}`}>
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>

                            <div className="p-4 bg-slate-900 border-t border-slate-800">
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        value={chatInput}
                                        onChange={e => setChatInput(e.target.value)}
                                        onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                                        placeholder="Digite sua mensagem..."
                                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs font-medium text-white outline-none focus:border-blue-500 transition-all"
                                    />
                                    <button 
                                        onClick={handleSendMessage}
                                        disabled={isSending || !chatInput.trim()}
                                        className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20 disabled:opacity-50"
                                    >
                                        {isSending ? <Loader2 className="animate-spin" size={18}/> : <Send size={18}/>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
