import React, { useState, useEffect } from 'react';
import { UserPlus, Loader2, Shield, Users, RefreshCw, Layers, AlertCircle, Settings, Plus, BrainCircuit, ShieldAlert, Key, Fingerprint, ChevronLeft } from 'lucide-react';
import { useTeamData } from '../features/team/hooks/useTeamData';
import { useTeamInvite } from '../features/team/hooks/useTeamInvite';
import { MemberCard } from '../features/team/components/MemberCard';
import { InviteModal } from '../features/team/components/InviteModal';
import { TeamEditorModal } from '../features/team/components/TeamEditorModal';
import { MemberEditorModal } from '../features/team/components/MemberEditorModal';
import { TeamAIInsight } from '../features/team/components/TeamAIInsight';
import { isDev } from '../utils/isDev';
import { supabase } from '../lib/supabase';

export const TeamPage = ({ activeUser, showToast, ui, goBack, isStealthMode }: any) => {
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [authStatus, setAuthStatus] = useState<any>(null);

  const { teams, activeTeam, setActiveTeam, members, loading, fetchError, refresh, actions } = useTeamData(activeUser?.id);
  
  const { createInvite, isProcessing, inviteResult, resetInviteState, deleteMember } = useTeamInvite({
    teamId: activeTeam?.id,
    onSuccess: refresh,
    showToast
  });

  // Diagnóstico de Sessão para Auditoria (Apenas DEV)
  useEffect(() => {
    if (!isDev) return;
    const checkAuth = async () => {
        try {
            const { data } = await supabase.auth.getSession();
            const session = data?.session;
            setAuthStatus({
                authenticated: !!session,
                uid: session?.user?.id || 'null',
                email: session?.user?.email || 'null'
            });
        } catch (e) {
            if (isDev) console.error('[TEAM] Auth check failed:', e);
            setAuthStatus({ authenticated: false, uid: 'error', email: 'error' });
        }
    };
    checkAuth();
  }, []);

  const handleOpenTeamEditor = (isNew: boolean) => {
      setEditingTeam(isNew ? null : activeTeam);
      ui.openModal('TEAM_EDITOR');
  };

  const handleSaveTeam = async (name: string) => {
      try {
          if (editingTeam) {
              await actions.updateTeam(editingTeam.id, name);
              showToast("Equipe renomeada!", "success");
          } else {
              const newTeam = await actions.createTeam(name);
              if (newTeam) setActiveTeam(newTeam);
              showToast("Equipe criada com sucesso!", "success");
          }
          ui.closeModal();
      } catch (e: any) {
          showToast(e.message, "error");
      }
  };

  const handleDeleteTeam = async () => {
      if (!editingTeam) return;
      try {
          await actions.deleteTeam(editingTeam.id);
          showToast("Equipe excluída.", "success");
          ui.closeModal();
      } catch (e: any) {
          showToast("Erro ao excluir: " + e.message, "error");
      }
  };

  const handleOpenMemberEditor = (member: any) => {
      setEditingMember(member);
      ui.openModal('MEMBER_EDITOR');
  };

  const handleSaveMember = async (memberId: string, updates: any) => {
      try {
          await actions.updateMember(memberId, updates);
          showToast("Membro atualizado!", "success");
          ui.closeModal();
      } catch (e: any) {
          showToast("Erro ao atualizar membro: " + e.message, "error");
      }
  };

  if (loading && teams.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-slate-500 gap-4">
        <Loader2 className="animate-spin text-blue-500" size={40} />
        <p className="text-xs font-black uppercase tracking-widest animate-pulse">Sincronizando Time...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-900/20">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">Gestão de <span className="text-blue-500">Time</span></h1>
              <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">
                Controle de Membros e Equipes
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Team Selector Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-slate-900 p-3 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-2 flex-1 w-full lg:w-auto">
              <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 flex-1 lg:flex-none lg:min-w-[240px] min-w-0">
                  <Layers size={14} className="text-blue-500 shrink-0"/>
                  <select 
                      value={activeTeam?.id || ''} 
                      onChange={(e) => setActiveTeam(teams.find(t => t.id === e.target.value))}
                      className="bg-transparent text-white text-sm font-medium uppercase tracking-widest outline-none border-none cursor-pointer hover:text-blue-400 transition-colors w-full truncate"
                  >
                      {teams.length === 0 ? (
                          <option>Nenhuma Equipe</option>
                      ) : (
                          teams.map(t => (
                              <option key={t.id} value={t.id} className="bg-slate-900 text-white">{t.name}</option>
                          ))
                      )}
                  </select>
              </div>
              <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleOpenTeamEditor(false)} disabled={!activeTeam} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700"><Settings size={16} /></button>
                  <button onClick={() => handleOpenTeamEditor(true)} className="p-2 text-slate-500 hover:text-emerald-500 hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700"><Plus size={16} /></button>
              </div>
          </div>
          
          <div className="flex gap-2 w-full lg:w-auto shrink-0">
              <button onClick={refresh} disabled={loading} className={`p-3 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:text-white transition-all active:scale-95 shrink-0 ${loading ? 'animate-spin' : ''}`}><RefreshCw size={18} /></button>
              <button onClick={() => ui.openModal('INVITE')} className="flex-1 lg:flex-none px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm uppercase shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0"><UserPlus size={18} /> Novo Membro</button>
          </div>
      </div>

      {/* Banner de Diagnóstico (DEV ONLY) */}
      {isDev && authStatus && (
        <div className="bg-slate-900 border border-blue-500/30 p-3 rounded-2xl flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest">
                <span className="flex items-center gap-1 text-slate-500"><Key size={10} className={authStatus.authenticated ? 'text-emerald-500' : 'text-rose-500'}/> Auth: {authStatus.authenticated ? 'Ativo' : 'Inativo'}</span>
                <span className="text-slate-500 truncate max-w-[150px]">UID: {authStatus.uid}</span>
                <span className="text-slate-500">Email: {authStatus.email}</span>
            </div>
            <button onClick={() => refresh()} className="text-[9px] font-black text-blue-500 hover:text-white uppercase flex items-center gap-1">
                <RefreshCw size={10}/> Forçar Refresh
            </button>
        </div>
      )}

      {/* Alerta de Erro Crítico (RLS ou Banco) */}
      {fetchError && (
        <div className="bg-rose-950/20 border border-rose-500/50 p-6 rounded-2xl flex items-start gap-4 animate-in slide-in-from-top-4">
           <ShieldAlert className="text-rose-500 shrink-0" size={32}/>
           <div className="flex-1">
              <h3 className="text-white font-black uppercase text-sm">Falha de Integridade</h3>
              <p className="text-rose-200 text-xs mt-1 leading-relaxed">{fetchError}</p>
              <button onClick={() => refresh()} className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-rose-500 shadow-lg">Reconectar ao Banco</button>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                {teams.length === 0 ? (
                    <div className="py-24 flex flex-col items-center justify-center">
                        <Users size={32} className="text-slate-500 mb-4"/>
                        <p className="text-sm font-medium text-slate-500 uppercase">Nenhuma equipe encontrada.</p>
                        <button onClick={() => handleOpenTeamEditor(true)} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold uppercase hover:bg-slate-700">Criar Primeira Equipe</button>
                    </div>
                ) : members.length === 0 && !loading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center px-6">
                        <Users size={40} className="text-slate-500 mb-4"/>
                        <h4 className="text-xl font-semibold text-white uppercase mb-1">Equipe Vazia</h4>
                        <p className="text-sm font-medium text-slate-500 max-w-xs mx-auto">Não há membros registrados ou o acesso está bloqueado por políticas de segurança.</p>
                        <button onClick={refresh} className="mt-6 flex items-center gap-2 text-blue-500 font-semibold text-sm uppercase"><RefreshCw size={12}/> Tentar Atualizar</button>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-800">
                        {members.map((member) => (
                            <MemberCard 
                                key={member.id} 
                                member={member} 
                                onDelete={deleteMember} 
                                onEdit={handleOpenMemberEditor}
                                isStealthMode={isStealthMode}
                            />
                        ))}
                    </div>
                )}
              </div>
          </div>

          <div className="lg:col-span-4">
              <TeamAIInsight members={members} teamName={activeTeam?.name} />
          </div>
      </div>

      {ui.activeModal?.type === 'INVITE' && (
        <InviteModal isOpen={true} onClose={ui.closeModal} onGenerate={createInvite} isLoading={isProcessing} result={inviteResult} resetResult={resetInviteState} />
      )}
      {ui.activeModal?.type === 'TEAM_EDITOR' && (
          <TeamEditorModal isOpen={true} onClose={ui.closeModal} onSave={handleSaveTeam} onDelete={editingTeam ? handleDeleteTeam : undefined} initialName={editingTeam?.name} isEditing={!!editingTeam} />
      )}
      {ui.activeModal?.type === 'MEMBER_EDITOR' && (
          <MemberEditorModal 
            isOpen={true} 
            onClose={ui.closeModal} 
            member={{...editingMember, team_members: members}} 
            teams={teams} 
            onSave={handleSaveMember} 
          />
      )}
    </div>
  );
};