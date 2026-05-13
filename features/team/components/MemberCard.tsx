import React, { useState, useEffect } from 'react';
import { 
    Trash2, User, ShieldCheck, Mail, Clock, Timer, XCircle, 
    CheckCircle2, Copy, ChevronDown, ChevronUp, Wallet, 
    Users, Briefcase, Activity, MessageSquare, ExternalLink,
    TrendingUp, MousePointer2
} from 'lucide-react';
import { formatMoney, maskDocument, formatShortName } from '../../../utils/formatters';
import { supabase } from '../../../lib/supabase';
import { getDaysDiff } from '../../../utils/dateHelpers';
import { translateTransactionType } from '../../../utils/translationHelpers';

interface MemberStats {
    totalLent: number;
    activeLoans: number;
    clientCount: number;
    totalRecovered: number;
    lastTransactions: any[];
}

export const MemberCard = ({ member, onDelete, onEdit, onOpenChat, isStealthMode }: any) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [stats, setStats] = useState<MemberStats | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [copied, setCopied] = useState(false);

    const isPending = !member.profile_id && member.invite_status === 'PENDING';
    const isExpired = member.invite_status === 'EXPIRED' || (!member.profile_id && new Date(member.expires_at) < new Date());
    const isAccepted = member.invite_status === 'ACCEPTED' || !!member.profile_id;
    
    const emailDisplay = member.linked_profile?.usuario_email || member.username_or_email || "Aguardando ativação";
    const avatarUrl = member.linked_profile?.avatar_url;
    const inviteLink = `${window.location.origin}/setup-password?invite_token=${member.invite_token}`;

    // Auditoria de Acesso
    const accessCount = member.linked_profile?.access_count || 0;
    const lastActive = member.linked_profile?.last_active_at;
    const daysOff = lastActive ? getDaysDiff(lastActive) : null;

    const loadMemberActivity = async () => {
        if (!member.profile_id || !isExpanded) return;
        
        setLoadingStats(true);
        try {
            const [loansRes, clientsRes, transRes] = await Promise.all([
                supabase.from('contratos').select('principal, id').eq('operador_responsavel_id', member.profile_id),
                supabase.from('clientes').select('id', { count: 'exact' }).eq('owner_id', member.linked_profile?.supervisor_id || member.profile_id),
                supabase.from('transacoes').select('*').eq('profile_id', member.profile_id).order('date', { ascending: false }).limit(5)
            ]);

            const loans = loansRes.data || [];
            setStats({
                totalLent: loans.reduce((acc, l) => acc + (l.principal || 0), 0),
                activeLoans: loans.length,
                clientCount: clientsRes.count || 0,
                totalRecovered: 0,
                lastTransactions: transRes.data || []
            });
        } catch (e) {
            console.error("Erro ao carregar performance do membro", e);
        } finally {
            setLoadingStats(false);
        }
    };

    useEffect(() => {
        if (isExpanded && isAccepted) loadMemberActivity();
    }, [isExpanded]);

    const handleCopyLink = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getRemainingTime = () => {
        if (!member.expires_at) return null;
        const diff = new Date(member.expires_at).getTime() - new Date().getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours < 0) return "Expirado";
        if (hours > 24) return `${Math.floor(hours/24)}d restantes`;
        return `${hours}h restantes`;
    };

    return (
        <div className={`flex flex-col group transition-all duration-300 relative overflow-hidden ${
            isExpanded ? 'bg-slate-800/50' : 'hover:bg-slate-800/30'
        } ${
            isExpired ? 'opacity-60' : ''
        }`}>
            
            {isPending && !isExpired && (
                <div className="absolute top-0 right-0 px-4 py-1 bg-blue-600 text-white text-[8px] font-black uppercase tracking-widest rounded-bl-full flex items-center gap-1.5 shadow-lg z-10">
                    <Timer size={10} className="animate-spin" /> {getRemainingTime()}
                </div>
            )}

            <div className="p-4 sm:p-6 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-slate-500 border overflow-hidden shrink-0 ${isPending ? 'bg-slate-950 border-blue-500/20' : 'bg-slate-950 border-slate-800'}`}>
                       {avatarUrl ? <img src={avatarUrl} alt={member.full_name} className="w-full h-full object-cover" /> : <User size={24} className={isPending ? 'text-blue-500' : ''} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <h3 className="text-sm font-semibold text-white uppercase truncate">
                                    {isExpanded ? member.full_name : formatShortName(member.full_name)}
                                </h3>
                                {member.role === 'ADMIN' && <ShieldCheck size={12} className="text-blue-500 shrink-0" />}
                                {isAccepted && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="hidden sm:flex flex-col items-end">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Status</span>
                                    <span className={`text-[10px] font-bold uppercase mt-1 ${daysOff === 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        {daysOff === 0 ? 'Online' : daysOff ? `Off há ${daysOff}d` : 'Inativo'}
                                    </span>
                                </div>
                                {isExpanded ? <ChevronUp size={18} className="text-slate-500"/> : <ChevronDown size={18} className="text-slate-500"/>}
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                {member.cpf ? maskDocument(member.cpf, isStealthMode) : 'S/ CPF'}
                            </span>
                            <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest truncate">
                                {member.role === 'ADMIN' ? 'Administrador' : isPending ? 'Convidado' : 'Operador'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {isExpanded && isPending && !isExpired && (
                <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="bg-slate-950 p-4 rounded-2xl border border-blue-500/20 space-y-3">
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                            <ExternalLink size={12}/> Link de Ativação Único
                        </p>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-full p-2.5 overflow-hidden">
                                <p className="text-[10px] font-mono text-slate-400 truncate">{inviteLink}</p>
                            </div>
                            <button 
                                onClick={handleCopyLink}
                                className={`p-2.5 rounded-full transition-all shadow-lg ${copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                            >
                                {copied ? <CheckCircle2 size={18}/> : <Copy size={18}/>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isExpanded && isAccepted && (
                <div className="px-6 pb-6 space-y-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex gap-2">
                        <button 
                            onClick={() => onOpenChat?.(member)}
                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition-all"
                        >
                            <MessageSquare size={14}/> Chat de Equipe
                        </button>
                        <button 
                            onClick={() => onEdit(member)}
                            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-[10px] font-black uppercase transition-all"
                        >
                            Editar Permissões
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                            <div className="flex items-center gap-2 text-slate-500 mb-1">
                                <Briefcase size={12}/>
                                <span className="text-[9px] font-black uppercase">Capital Operado</span>
                            </div>
                            <p className="text-sm font-black text-white">
                                {loadingStats ? "..." : formatMoney(stats?.totalLent || 0, isStealthMode)}
                            </p>
                        </div>
                        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                            <div className="flex items-center gap-2 text-slate-500 mb-1">
                                <Users size={12}/>
                                <span className="text-[9px] font-black uppercase">Clientes</span>
                            </div>
                            <p className="text-sm font-black text-white">
                                {loadingStats ? "..." : stats?.clientCount} Cadastrados
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
                        <div className="bg-slate-900/50 px-4 py-2 border-b border-slate-800 flex items-center gap-2">
                            <Activity size={12} className="text-emerald-500"/>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Atividade Recente</span>
                        </div>
                        <div className="p-2 space-y-1">
                            {loadingStats ? (
                                <div className="py-8 flex justify-center"><Clock className="animate-spin text-slate-700" size={16}/></div>
                            ) : stats?.lastTransactions.length === 0 ? (
                                <p className="text-[10px] text-slate-500 text-center py-4 italic">Nenhuma transação registrada.</p>
                            ) : stats?.lastTransactions.map((t: any) => (
                                <div key={t.id} className="flex justify-between items-center p-2 hover:bg-slate-900 rounded-lg transition-colors">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold text-slate-300 truncate uppercase">{t.notes || translateTransactionType(t.type)}</p>
                                        <p className="text-[8px] text-slate-500">{new Date(t.date).toLocaleDateString()}</p>
                                    </div>
                                    <span className={`text-[10px] font-black ${t.type === 'LEND_MORE' ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {t.type === 'LEND_MORE' ? '-' : '+'} {formatMoney(t.amount, isStealthMode)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-auto p-4 bg-slate-950/50 border-t border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <MousePointer2 size={10} className="text-blue-500" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">{accessCount} Acessos</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(member.id); }} 
                        className="p-2 bg-slate-900 text-slate-500 hover:text-rose-500 rounded-full transition-all border border-slate-800 hover:border-rose-500/30"
                        title="Excluir Membro"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};