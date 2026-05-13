import React, { useMemo } from 'react';
import { UnifiedChat } from '../../../components/chat/UnifiedChat';
import { createSupportAdapter } from '../../../components/chat/adapters/supportAdapter';
import { supabasePortal } from '../../../lib/supabasePortal';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { isUUID as isUuid } from '../../../utils/uuid';
import { formatFirstAndSecondName } from '../../../utils/formatters';

interface PortalChatDrawerProps {
  loan: any;
  isOpen: boolean;
  onClose: () => void;
}

export const PortalChatDrawer: React.FC<PortalChatDrawerProps> = ({ loan, isOpen, onClose }) => {
  const adapter = useMemo(() => createSupportAdapter('CLIENT', supabasePortal), []);

  const clientHeaderName = useMemo(() => {
    return formatFirstAndSecondName(loan?.debtorName || loan?.debtor_name || loan?.clientName || 'Atendimento');
  }, [loan]);

  // ✅ Busca ID de contrato de forma resiliente
  const loanId = useMemo(() => {
     return loan?.id || loan?.loan_id || loan?.loanId || loan?.contract_id || null;
  }, [loan]);

  // ✅ Busca ID de cliente de forma resiliente
  const clientId = useMemo(() => {
     return loan?.client_id || loan?.clientId || loan?.clientID || loan?.loggedClientId || null;
  }, [loan]);

  const effectiveProfileId = useMemo(() => {
    // 1. Tenta pegar do contrato (todas as variações possíveis mapeadas no adapter)
    const fromLoan = loan?.profile_id || loan?.profileId || loan?.owner_id || loan?.ownerId;
    if (fromLoan) return fromLoan;
    // 2. Fallback para o perfil do cliente logado (que agora capturamos no hook com fallbacks)
    return loan?.clientProfileId || loan?.loggedClientProfileId || null;
  }, [loan]);

  const context = useMemo(() => {
    if (!clientId) {
      console.warn('[PortalChatDrawer] clientId missing for loan:', loan?.id);
      return null;
    }

    // ✅ CRÍTICO: profileId DEVE ser o ID do Profissional (Tenant), nunca do devedor (clientId).
    // Se usarmos o clientId aqui, violaremos a FK "mensagens_suporte_profile_id_fkey".
    const professionalId = effectiveProfileId;
    
    if (!isUuid(professionalId)) {
        console.error('[PortalChatDrawer] professionalId/effectiveProfileId is not a valid UUID:', professionalId);
        return null;
    }

    const ctx = { 
      loanId: loanId || clientId, 
      profileId: professionalId, 
      myId: clientId, 
      clientName: loan?.debtorName || loan?.debtor_name || loan?.clientName || 'Atendimento' 
    };
    console.log('[PortalChatDrawer] Resolved Chat Context:', ctx);
    return ctx;
  }, [loanId, clientId, effectiveProfileId, loan]);

  if (!isOpen) return null;

  const isInvalid = !clientId || !effectiveProfileId;

  return (
    <div className="fixed inset-0 z-[250] flex justify-end overflow-hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" 
        onClick={onClose}
      ></motion.div>

      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full sm:max-w-lg bg-slate-900 h-full shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col border-l border-white/5"
      >
        {isInvalid || !context ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-slate-950/50 backdrop-blur-3xl">
            <div className="w-20 h-20 bg-rose-500/10 rounded-[2rem] flex items-center justify-center text-rose-500 mb-6 shadow-2xl">
                <ShieldCheck size={40} />
            </div>
            <h3 className="text-white font-black text-xl uppercase tracking-tighter mb-4">Conexão Indisponível</h3>
            <p className="text-slate-400 text-xs leading-relaxed max-w-xs mb-4">
              Não conseguimos vincular sua sessão a um contrato ativo ou canal de suporte. 
              Por favor, atualize a página ou entre em contato via WhatsApp.
            </p>
            
            {/* Debug técnico para o usuário/suporte saber o que falta */}
            <div className="bg-slate-900/80 p-3 rounded-xl border border-rose-500/20 mb-8 text-left w-full">
                <p className="text-[9px] font-mono text-rose-400/60 uppercase mb-2 border-b border-rose-500/10 pb-1">Diagnóstico de Identidade</p>
                <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                        <span className="text-slate-500 italic">ID do Contrato:</span>
                        <span className={loanId ? 'text-emerald-500' : 'text-rose-500'}>{loanId ? 'OK' : 'AUSENTE'}</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                        <span className="text-slate-500 italic">ID Profissional:</span>
                        <span className={effectiveProfileId ? 'text-emerald-500' : 'text-rose-500'}>{effectiveProfileId ? 'OK' : 'AUSENTE'}</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                        <span className="text-slate-500 italic">ID do Cliente:</span>
                        <span className={clientId ? 'text-emerald-500' : 'text-rose-500'}>{clientId ? 'OK' : 'AUSENTE'}</span>
                    </div>
                </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all border border-slate-700 active:scale-95"
            >
              Entendido
            </button>
          </div>
        ) : (
          <UnifiedChat
            adapter={adapter}
            context={context}
            role="CLIENT"
            userId={clientId}
            onClose={onClose}
            title={clientHeaderName}
            subtitle="Canal Verificado CapitalFlow"
            chatTheme="dark"
          />
        )}
      </motion.div>
    </div>
  );
};
