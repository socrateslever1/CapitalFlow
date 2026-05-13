
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShieldCheck, X, MessageCircle, Palette, ChevronLeft } from 'lucide-react';
import { supportChatService } from '../../services/supportChat.service';
import { ChatSidebar } from './components/ChatSidebar';
import { useCampaignChat } from '../../hooks/useCampaignChat';
import { useCampaignNotifications } from '../../hooks/useCampaignNotifications';
import { UnifiedChat } from '../../components/chat/UnifiedChat';
import { createSupportAdapter } from '../../components/chat/adapters/supportAdapter';
import { createCaptacaoAdapter } from '../../components/chat/adapters/captacaoAdapter';
import { useModal } from '../../contexts/ModalContext';

function diffLabel(ts: string | number | Date) {
  if (!ts) return '';
  const t = typeof ts === 'string' || typeof ts === 'number' ? new Date(ts) : ts;
  const ms = Date.now() - t.getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `agora`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function OperatorSupportChat({ activeUser, onClose }: { activeUser: any; onClose: () => void; }) {
  const [activeChats, setActiveChats] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [campaignLeads, setCampaignLeads] = useState<any[]>([]);
  
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [chatTheme, setChatTheme] = useState<'dark' | 'blue'>('dark');

  const { showToast, loanCtrl } = useModal();

  const supportAdapter = useMemo(() => createSupportAdapter('OPERATOR'), []);
  const captacaoAdapter = useMemo(() => createCaptacaoAdapter('OPERATOR'), []);

  const handleDeleteHistory = async () => {
    if (!selectedChat) return;
    
    const isCampaign = selectedChat.type === 'CAMPAIGN';
    const confirmMsg = isCampaign 
        ? `Tem certeza que deseja apagar TODO o histórico de conversa com este Lead? Essa ação é irreversível.`
        : `Tem certeza que deseja apagar TODO o histórico de conversa com ${selectedChat.clientName}? Essa ação é irreversível.`;

    loanCtrl.openConfirmation({
        type: 'DELETE_CHAT_HISTORY',
        target: selectedChat,
        title: 'Apagar Histórico?',
        message: confirmMsg,
        onConfirm: async () => {
            try {
                if (isCampaign) {
                    await supportChatService.deleteCampaignChatHistory(selectedChat.session_token);
                } else {
                    await supportChatService.deleteChatHistory(selectedChat.loanId);
                }
                setSelectedChat(null);
                loadAllData();
                showToast('Histórico apagado com sucesso!', 'success');
            } catch (e: any) {
                showToast('Erro ao apagar histórico: ' + e.message, 'error');
            }
        }
    });
  };

  const { unreadCampaignCount, clearUnread } = useCampaignNotifications(activeUser);
  const { leads: hookLeads, loadLeads } = useCampaignChat();

  useEffect(() => {
    setCampaignLeads(hookLeads);
  }, [hookLeads]);

  // Identificação do dono para buscar dados corretos
  const ownerId = activeUser.supervisor_id || activeUser.id;

  const loadAllData = async () => {
    if (!activeUser) return;
    
    // 1. Chats Ativos
    const actives = await supportChatService.getActiveChats(activeUser.id);
    setActiveChats(actives);

    // 2. Contratos (Clientes)
    const clients = await supportChatService.getAvailableContracts(ownerId);
    setContracts(clients);

    // 3. Equipe
    const team = await supportChatService.getTeamMembers(ownerId);
    setTeamMembers(team);

    // 4. Captação
    loadLeads();
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 15000); // Polling mais lento para dados gerais
    return () => clearInterval(interval);
  }, [activeUser.id]);

  // Filtros de busca para cada lista
  const filteredActive = useMemo(() => activeChats.filter(c => c.clientName?.toLowerCase().includes(searchTerm.toLowerCase())), [activeChats, searchTerm]);
  const filteredClients = useMemo(() => contracts.filter(c => c.clientName?.toLowerCase().includes(searchTerm.toLowerCase())), [contracts, searchTerm]);
  const filteredTeam = useMemo(() => teamMembers.filter(t => t.clientName?.toLowerCase().includes(searchTerm.toLowerCase())), [teamMembers, searchTerm]);
  const filteredCampaign = useMemo(() => campaignLeads.filter(l => (l.nome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (l.whatsapp || '').includes(searchTerm)), [campaignLeads, searchTerm]);

  const handleSelectContact = (contact: any) => {
      if (contact.type === 'TEAM') {
          showToast("Chat interno de equipe em breve.", "info");
          return;
      }

      if (contact.type === 'CAMPAIGN') {
          clearUnread();
          setSelectedChat({
              id: contact.id,
              session_token: contact.session_token,
              clientName: contact.nome || 'Lead sem nome',
              type: 'CAMPAIGN'
          });
          return;
      }
      
      // Se selecionou um cliente da lista que JÁ tem chat ativo, muda para o chat ativo
      const existingChat = activeChats.find(c => c.loanId === contact.loanId);
      if (existingChat) {
          setSelectedChat(existingChat);
      } else {
          // Cria objeto de chat temporário para iniciar conversa
          setSelectedChat({
              loanId: contact.loanId,
              clientId: contact.clientId,
              profileId: contact.profileId,
              clientName: contact.clientName,
              type: 'ACTIVE'
          });
      }
  };

  const handleBulkDelete = async (selectedIds: string[]) => {
      loanCtrl.openConfirmation({
          type: 'DELETE_MULTIPLE_CHATS',
          target: selectedIds,
          title: 'Apagar Conversas?',
          message: `Deseja apagar o histórico de ${selectedIds.length} conversas selecionadas?`,
          onConfirm: async () => {
              try {
                  await supportChatService.deleteMultipleChats(selectedIds);
                  await loadAllData();
                  if (selectedChat && selectedIds.includes(selectedChat.loanId)) {
                      setSelectedChat(null);
                  }
                  showToast('Conversas apagadas com sucesso!', 'success');
              } catch (e: any) {
                  showToast("Erro ao apagar chats: " + e.message, 'error');
              }
          }
      });
  };

  const supportContext = useMemo(() => {
    if (!selectedChat || selectedChat.type === 'CAMPAIGN') return null;
    return { 
      loanId: selectedChat.loanId, 
      profileId: selectedChat.profileId || activeUser.id, 
      myId: activeUser.id,
      clientName: selectedChat.clientName, 
      operatorId: activeUser.id 
    };
  }, [selectedChat, activeUser.id]);

  const campaignContext = useMemo(() => {
    if (!selectedChat || selectedChat.type !== 'CAMPAIGN') return null;
    return { 
      sessionToken: selectedChat.session_token, 
      clientName: selectedChat.clientName 
    };
  }, [selectedChat]);

  return (
    <div className="fixed inset-0 z-[var(--z-support)] w-full h-full bg-slate-950 flex flex-col animate-in fade-in duration-300 font-sans pointer-events-auto">
      
      {/* HEADER COMPACTO PADRÃO */}
      <div className="h-14 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4 shrink-0 z-[var(--z-header)]">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all active:scale-95"
            title="Voltar"
          >
            <ChevronLeft size={20} />
          </button>

          <div>
            <h1 className="text-sm font-bold text-white leading-none">Atendimento</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase mt-0.5">Painel do Operador</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={() => setChatTheme(prev => prev === 'dark' ? 'blue' : 'dark')} className="w-10 h-10 flex items-center justify-center bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 rounded-full transition-all" title="Alternar Tema">
            <Palette size={18}/>
          </button>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-900 text-slate-400 hover:text-white hover:bg-rose-950/30 hover:border-rose-900 border border-slate-800 rounded-full transition-all">
            <X size={18}/>
          </button>
        </div>
      </div>

      <div className="flex-1 flex w-full h-full overflow-hidden">
        
        {/* SIDEBAR COM ABAS */}
        <ChatSidebar 
            chats={filteredActive}
            clients={filteredClients}
            team={filteredTeam}
            campaigns={filteredCampaign}
            unreadCampaignCount={unreadCampaignCount}
            selectedChat={selectedChat}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onSelectChat={handleSelectContact}
            diffLabel={diffLabel}
            onBulkDelete={handleBulkDelete}
            chatTheme={chatTheme}
        />

        {/* ÁREA DE CHAT */}
        <div className={`flex-1 flex flex-col relative min-w-0 w-full h-full ${!selectedChat ? 'hidden md:flex' : 'flex'} ${chatTheme === 'blue' ? 'bg-slate-900/50' : 'bg-slate-900'}`}>
          {selectedChat && (selectedChat.type === 'CAMPAIGN' ? campaignContext : supportContext) ? (
            selectedChat.type === 'CAMPAIGN' ? (
              <UnifiedChat
                adapter={captacaoAdapter}
                context={campaignContext!}
                role="OPERATOR"
                userId={activeUser.id}
                onClose={() => setSelectedChat(null)}
                chatTheme={chatTheme}
                showDeleteHistory={true}
                onDeleteHistory={handleDeleteHistory}
              />
            ) : (
              <UnifiedChat
                adapter={supportAdapter}
                context={supportContext!}
                role="OPERATOR"
                userId={activeUser.id}
                onClose={() => setSelectedChat(null)}
                showDeleteHistory={true}
                onDeleteHistory={handleDeleteHistory}
                chatTheme={chatTheme}
              />
            )
          ) : (
            /* Empty State */
            <div className={`flex-1 flex flex-col items-center justify-center text-slate-500 ${chatTheme === 'blue' ? 'bg-blue-950/20' : 'bg-slate-900/50'}`}>
              <div className="w-24 h-24 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-6 border-2 border-dashed border-slate-700">
                 <MessageCircle size={40} className="opacity-50"/>
              </div>
              <h3 className="text-sm font-black uppercase text-white tracking-widest mb-2">Pronto para Atender</h3>
              <p className="text-xs text-slate-500 max-w-xs text-center">Selecione um cliente ou conversa na lista lateral para iniciar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
