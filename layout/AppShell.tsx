
import React, { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, MessageSquare, Plus, ArrowLeft, LayoutDashboard, Users, Briefcase, Wallet, PiggyBank, Calendar, Calculator, ArrowRightLeft, Megaphone, User, Menu, ShieldCheck, FileText, X } from 'lucide-react';
import { HeaderBar } from './HeaderBar';
import { BottomNav } from './BottomNav';
import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { notificationService } from '../services/notification.service';
import { useCampaignNotifications } from '../hooks/useCampaignNotifications';
import { InAppNotification } from '../hooks/useAppNotifications';
import { motion, AnimatePresence } from 'framer-motion';

interface AppShellProps {
  children: React.ReactNode;
  toast: { msg: string; type: 'success' | 'error' | 'info' | 'warning' } | null;
  clearToast?: () => void;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  activeUser: UserProfile | null;
  isLoadingData: boolean;
  onOpenNav: () => void;
  onNewLoan: () => void;
  isStealthMode: boolean;
  toggleStealthMode: () => void;
  onOpenSupport?: () => void;
  navOrder: string[]; 
  onGoBack?: () => void;
  isInHub?: boolean;
  title?: string;
  subtitle?: string;
  notifications?: InAppNotification[];
  removeNotification?: (id: string) => void;
  onNavigate?: (path: string) => void;
  addNotification?: (notif: Omit<InAppNotification, 'id' | 'createdAt'>) => void;
  activeModal?: any;
}

export const AppShell: React.FC<AppShellProps> = ({ 
  children, toast, clearToast, activeTab, setActiveTab, activeUser, isLoadingData, onOpenNav, onNewLoan, isStealthMode, toggleStealthMode, onOpenSupport, navOrder, onGoBack, isInHub, title, subtitle, notifications, removeNotification, onNavigate, activeModal, addNotification
}) => {
  const [unreadSupport, setUnreadSupport] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const { unreadCampaignCount } = useCampaignNotifications(activeUser);

  const totalUnread = unreadSupport + unreadCampaignCount;

  useEffect(() => {
    if (!activeUser || activeUser.id === 'DEMO') return;
    
    const fetchUnread = async () => {
        const { count } = await supabase
            .from('mensagens_suporte')
            .select('*', { count: 'exact', head: true })
            .eq('profile_id', activeUser.id)
            .eq('read', false)
            .neq('sender_user_id', activeUser.id);
        setUnreadSupport(count || 0);
    };

    fetchUnread();

    const channel = supabase.channel('support-notifications-main')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'mensagens_suporte', 
            filter: `profile_id=eq.${activeUser.id}` 
        }, (payload) => {
            if (payload.new.sender_user_id !== activeUser.id) {
                notificationService.notify(
                    "Nova Mensagem de Suporte",
                    payload.new.content || payload.new.text || "Cliente enviou uma mídia.",
                    () => {
                        window.focus();
                        onOpenSupport?.();
                    }
                );
                fetchUnread();
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'mensagens_suporte',
            filter: `profile_id=eq.${activeUser.id}`
        }, () => fetchUnread())
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeUser?.id]);

  // Highlight logic based on URL query parameters
  useEffect(() => {
    const handleHighlight = () => {
      const params = new URLSearchParams(window.location.search);
      const highlightId = params.get('highlight');
      if (highlightId) {
        // Small delay to allow rendering
        setTimeout(() => {
          const el = document.getElementById(highlightId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-4', 'ring-blue-500', 'ring-offset-2', 'ring-offset-slate-900', 'transition-all', 'duration-1000');
            setTimeout(() => {
              el.classList.remove('ring-4', 'ring-blue-500', 'ring-offset-2', 'ring-offset-slate-900');
            }, 3000);
          }
        }, 500);
      }
    };

    handleHighlight(); // Run on mount and tab change
    window.addEventListener('popstate', handleHighlight);
    return () => window.removeEventListener('popstate', handleHighlight);
  }, [activeTab]); // Re-run when tab changes as content might have loaded

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 font-sans selection:bg-blue-600/30 flex flex-col overflow-hidden relative">
      <HeaderBar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        activeUser={activeUser} 
        isLoadingData={isLoadingData} 
        onOpenNav={onOpenNav} 
        onNewLoan={onNewLoan}
        isStealthMode={isStealthMode}
        toggleStealthMode={toggleStealthMode}
        navOrder={navOrder}
        notifications={notifications}
        removeNotification={removeNotification}
        onNavigate={onNavigate}
        onOpenSupport={onOpenSupport}
        addNotification={addNotification}
      />

      <main className="flex-1 overflow-y-auto touch-pan-y overflow-x-hidden pb-28 md:pb-12">
        <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-8">
          {children}
        </div>
      </main>

      {activeUser && (
        <div className="fixed bottom-22 md:bottom-8 right-6 z-[var(--z-fab)] flex flex-col gap-3 items-center mb-safe">
          <button 
            onClick={onNewLoan}
            className="w-12 h-12 relative flex items-center justify-center text-white rounded-full shadow-2xl hover:scale-110 transition-all active:scale-95 group"
            style={{
              background: `linear-gradient(135deg, ${activeUser?.brandColor || '#2563eb'}, ${activeUser?.brandColor || '#2563eb'}dd)`,
              boxShadow: `0 10px 25px -5px ${activeUser?.brandColor || '#2563eb'}66`
            }}
          >
            <Plus size={24}/>
            <span className="absolute right-full mr-4 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-2xl">Novo Contrato</span>
          </button>

          <button 
            onClick={onOpenSupport}
            className="w-12 h-12 relative flex items-center justify-center text-white rounded-full shadow-2xl hover:scale-110 transition-all active:scale-95 group"
            style={{
              background: `linear-gradient(135deg, ${activeUser?.brandColor || '#2563eb'}, ${activeUser?.brandColor || '#2563eb'}dd)`,
              boxShadow: `0 10px 25px -5px ${activeUser?.brandColor || '#2563eb'}66`
            }}
          >
              <MessageSquare size={20}/>
              {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full ring-4 ring-slate-950 animate-bounce">
                      {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
              )}
              <span className="absolute right-full mr-4 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-2xl">Atendimento Online</span>
          </button>
        </div>
      )}

      {(!activeModal || activeModal.type !== 'SUPPORT_CHAT') && (
        <BottomNav 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          onOpenNav={onOpenNav} 
          onNewLoan={onNewLoan}
          navOrder={navOrder}
          primaryColor={activeUser?.brandColor}
          isStaff={!!activeUser?.supervisor_id}
          onGoBack={isInHub ? onGoBack : undefined}
        />
      )}
    </div>
  );
};
