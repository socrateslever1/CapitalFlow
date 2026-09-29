
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { isAppleMobile } from '../../utils/appleMobile';
import { X, MessageCircle, Palette, ChevronLeft } from 'lucide-react';
import { supportChatService } from '../../services/supportChat.service';
import { ChatSidebar } from './components/ChatSidebar';
import { UnifiedChat } from '../../components/chat/UnifiedChat';
import { createSupportAdapter } from '../../components/chat/adapters/supportAdapter';
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

  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [chatTheme, setChatTheme] = useState<'dark' | 'blue'>('dark');

  const { showToast, loanCtrl } = useModal();

  const supportAdapter = useMemo(() => createSupportAdapter('OPERATOR'), []);

  const handleDeleteHistory = async () => {
    if (!selectedChat) return;

    const confirmMsg = `Tem certeza que deseja apagar TODO o histórico de conversa com ${selectedChat.clientName}? Essa ação é irreversível.`;

    loanCtrl.openConfirmation({
        type: 'DELETE_CHAT_HISTORY',
        target: selectedChat,
        title: 'Apagar Histórico?',
        message: confirmMsg,
        onConfirm: async () => {
            try {
                await supportChatService.deleteChatHistory(selectedChat.loanId);
                setSelectedChat(null);
                loadAllData();
                showToast('Histórico apagado com sucesso!', 'success');
            } catch (e: any) {
                showToast('Erro ao apagar histórico: ' + e.message, 'error');
            }
        }
    });
  };

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

  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 15000); // Polling mais lento para dados gerais
    return () => clearInterval(interval);
  }, [activeUser.id]);

  // Filtros de busca para cada lista
  const filteredActive = useMemo(() => activeChats.filter(c => c.clientName?.toLowerCase().includes(searchTerm.toLowerCase())), [activeChats, searchTerm]);
  const filteredClients = useMemo(() => contracts.filter(c => c.clientName?.toLowerCase().includes(searchTerm.toLowerCase())), [contracts, searchTerm]);

  const handleSelectContact = (contact: any) => {
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
    if (!selectedChat) return null;
    return {
      loanId: selectedChat.loanId,
      profileId: selectedChat.profileId || activeUser.id,
      myId: activeUser.id,
      clientName: selectedChat.clientName,
      operatorId: activeUser.id
    };
  }, [selectedChat, activeUser.id]);

  return (
    <div className="fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[var(--z-support)] w-full bg-slate-950 flex flex-col animate-in fade-in duration-300 font-sans pointer-events-auto sm:top-[calc(5rem+env(safe-area-inset-top))] md:top-0 md:bottom-0">

      <div className="shrink-0 border-b border-slate-800/70 bg-slate-950 px-2 py-4 sm:px-6 md:pt-safe">
        <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3">
          <div className="page-header-icon flex items-center justify-center rounded-full border border-blue-500/30 bg-blue-600 text-white shadow-lg shadow-blue-950/30">
            <MessageCircle size={22} />
          </div>

          <div className="min-w-0">
            <h1 className="page-header-title truncate uppercase text-white">Atendimento</h1>
            <p className="page-header-subtitle truncate uppercase text-slate-500">Painel do operador</p>
          </div>

          <div className="flex items-center gap-2">
            {selectedChat && (
              <button
                onClick={() => setSelectedChat(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 transition-all hover:bg-slate-800 hover:text-white active:scale-95"
                title="Voltar para conversas"
                aria-label="Voltar para conversas"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <button onClick={() => setChatTheme(prev => prev === 'dark' ? 'blue' : 'dark')} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 transition-all hover:bg-slate-800 hover:text-white" title="Alternar tema" aria-label="Alternar tema">
              <Palette size={18}/>
            </button>
            <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 transition-all hover:border-rose-900 hover:bg-rose-950/30 hover:text-white" title="Fechar atendimento" aria-label="Fechar atendimento">
              <X size={18}/>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex w-full h-full overflow-hidden">

        {/* SIDEBAR COM ABAS */}
        <ChatSidebar
            chats={filteredActive}
            clients={filteredClients}
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
          {selectedChat && supportContext ? (
              <UnifiedChat
                adapter={supportAdapter}
                context={supportContext!}
                role="OPERATOR"
                userId={activeUser.id}
                onClose={isAppleMobile() ? undefined : () => setSelectedChat(null)}
                showDeleteHistory={true}
                onDeleteHistory={handleDeleteHistory}
                chatTheme={chatTheme}
              />
          ) : (
            /* Empty State */
            <div className={`flex-1 flex flex-col items-center justify-center text-slate-500 ${chatTheme === 'blue' ? 'bg-blue-950/20' : 'bg-slate-900/50'}`}>
              <div className="w-24 h-24 bg-slate-800/50 rounded-lg flex items-center justify-center mb-6 border-2 border-dashed border-slate-700">
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
