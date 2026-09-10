import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, LogOut, Lightbulb } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SYSTEM_VERSION } from '../../src/constants/version';
import '../../brand.css';

const TIPS = [
  'Dica: Use a busca rápida no Dashboard para encontrar clientes pelo CPF ou Nome.',
  'Dica: Contratos com parcelas atrasadas ficam destacados em vermelho na lista.',
  'Dica: Você pode enviar o link do Portal do Cliente para facilitar o pagamento.',
  "Dica: No modo 'Foco', as informações sensíveis são ocultadas da tela.",
  'Dica: Acompanhe suas metas diárias no painel de estatísticas.',
  'Dica: Registre intenções de pagamento para prever o fluxo de caixa do dia.'
];

export const LoadingScreen: React.FC = () => {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    setTipIndex(Math.floor(Math.random() * TIPS.length));
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleCancelLoading = async () => {
    try {
      localStorage.removeItem('cm_session');
      localStorage.removeItem('cm_last_tab');
      localStorage.removeItem('cm_invite_token');
      await supabase.auth.signOut().catch(() => {});
    } finally {
      window.location.replace('/');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#020617] px-6 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(11,59,111,0.28),transparent_42%)]" />

      <main className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-5 flex h-32 w-32 items-center justify-center sm:h-36 sm:w-36">
          <img
            src="/brand/capitalflow-loader.svg"
            alt="CapitalFlow"
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>

        <h1 className="text-3xl font-black tracking-[-0.055em] sm:text-4xl">
          CAPITAL<span className="text-[#22A06B]">FLOW</span>
        </h1>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
          Capital em movimento
        </p>

        <div className="mt-8 flex items-center gap-2.5 rounded-full border border-white/[0.06] bg-white/[0.035] px-4 py-2.5">
          <Loader2 size={14} className="animate-spin text-[#22A06B]" />
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
            Sincronizando sistema
          </span>
        </div>

        <section className="mt-7 w-full rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-4">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Lightbulb size={13} className="text-amber-400" />
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-400/80">Dica</span>
          </div>
          <p className="text-[11px] font-medium leading-relaxed text-slate-400">{TIPS[tipIndex]}</p>
        </section>

        <button
          type="button"
          onClick={handleCancelLoading}
          className="mt-5 flex items-center gap-2 rounded-lg px-3 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600 transition-colors hover:text-rose-400"
        >
          <LogOut size={12} /> Voltar ao login
        </button>
      </main>

      <footer className="absolute bottom-6 z-10 flex flex-col items-center gap-1.5 opacity-55">
        <ShieldCheck size={16} className="text-[#22A06B]" />
        <p className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-600">Ambiente criptografado</p>
        <p className="font-mono text-[7px] font-bold text-slate-700">
          REV {SYSTEM_VERSION.version} • BUILD {SYSTEM_VERSION.build}
        </p>
      </footer>
    </div>
  );
};
