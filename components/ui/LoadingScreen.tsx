import React, { useState, useEffect } from 'react';
import { TrendingUp, Loader2, ShieldCheck, LogOut, Lightbulb } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const TIPS = [
  "Dica: Use a busca rápida no Dashboard para encontrar clientes pelo CPF ou Nome.",
  "Dica: Contratos com parcelas atrasadas ficam destacados em vermelho na lista.",
  "Dica: Você pode enviar o link do Portal do Cliente para facilitar o pagamento.",
  "Dica: No modo 'Foco', as informações sensíveis são ocultadas da tela.",
  "Dica: Acompanhe suas metas diárias no painel de estatísticas.",
  "Dica: Registre intenções de pagamento para prever o fluxo de caixa do dia."
];

import { SYSTEM_VERSION } from '../../src/constants/version';

export const LoadingScreen: React.FC = () => {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    // Sorteia uma dica inicial
    setTipIndex(Math.floor(Math.random() * TIPS.length));
    
    // Troca a dica a cada 4 segundos se o carregamento demorar
    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length);
    }, 4000);
    
    return () => clearInterval(interval);
  }, []);

  const handleCancelLoading = async () => {
    try {
      // Limpeza profunda de sessões presas no cliente
      localStorage.removeItem('cm_session');
      localStorage.removeItem('cm_last_tab');
      localStorage.removeItem('cm_invite_token');
      
      // Tenta deslogar do Supabase para limpar cookies de auth
      await supabase.auth.signOut().catch(() => {});
    } finally {
      // Força recarregamento limpo na raiz
      window.location.replace('/');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-[9999] p-6">
      <div className="relative mb-8">
         {/* Efeito de Glow */}
         <div className="absolute inset-0 bg-slate-500 blur-[60px] opacity-20 animate-pulse rounded-full"></div>
         
         {/* Ícone Central */}
         <div className="relative bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl shadow-black/50">
            <TrendingUp size={64} className="text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
         </div>
      </div>

      {/* Título da Marca */}
      <h1 className="text-4xl font-black text-white tracking-tighter mb-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
        CAPITAL<span className="text-slate-400">FLOW</span>
      </h1>

      {/* Indicador de Carregamento */}
      <div className="flex flex-col items-center gap-4 mt-8 animate-in fade-in duration-1000 delay-200 w-full max-w-sm">
         <div className="flex items-center gap-3 bg-slate-900/50 px-6 py-3 rounded-full border border-slate-800/50 backdrop-blur-md">
            <Loader2 size={16} className="text-slate-400 animate-spin" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Sistema...</span>
         </div>

         {/* Dica do Dia (Onboarding/Tips) */}
         <div className="mt-6 w-full bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Lightbulb size={14} className="text-amber-400" />
              <span className="text-[10px] font-black text-amber-400/80 uppercase tracking-widest">Dica do Dia</span>
            </div>
            <p className="text-xs text-slate-300 font-medium leading-relaxed transition-opacity duration-300">
              {TIPS[tipIndex]}
            </p>
         </div>

         {/* Botão de Escape para evitar carregamento infinito */}
         <button 
            onClick={handleCancelLoading}
            className="flex items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-rose-500 transition-colors uppercase tracking-widest px-4 py-2 rounded-xl bg-slate-900/30 border border-slate-800/50 mt-4 active:scale-95 transition-all"
         >
            <LogOut size={12}/> Voltar ao Login
         </button>
      </div>

      {/* Footer de Segurança */}
      <div className="absolute bottom-8 flex flex-col items-center gap-2 opacity-50 animate-in fade-in duration-1000 delay-500">
        <ShieldCheck size={18} className="text-emerald-500"/>
        <div className="text-center">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-1">
                Ambiente Criptografado
            </p>
            <p className="text-[8px] font-bold text-slate-700 font-mono">
                REV {SYSTEM_VERSION.version} • BUILD {SYSTEM_VERSION.build}
            </p>
        </div>
      </div>
    </div>
  );
};