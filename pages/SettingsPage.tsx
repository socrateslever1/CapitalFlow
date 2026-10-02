import React from 'react';
import { FileText, Landmark, MessageCircle, ShieldCheck, Sparkles, Zap } from 'lucide-react';

export const SettingsPage: React.FC = () => (
  <div className="space-y-8 animate-in fade-in duration-500">
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 sm:p-8">
      <div className="mb-8 flex items-center gap-3 border-b border-slate-800 pb-6">
        <div className="rounded-lg bg-blue-600/10 p-3 text-blue-500"><Landmark size={24} /></div>
        <div>
          <h3 className="text-lg font-black uppercase text-white">Sobre o CapitalFlow</h3>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Recursos para organizar sua operação</p>
        </div>
      </div>

      <div className="space-y-8">
        <section className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-black uppercase text-white"><FileText size={16} className="text-emerald-500" /> Gestão em um só lugar</h4>
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
            <p>Organize clientes, contratos, parcelas, carteiras e documentos em uma única operação.</p>
            <p>Tenha uma visão clara dos valores recebidos, saldos em aberto e próximos vencimentos.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-black uppercase text-white"><Sparkles size={16} className="text-purple-500" /> Recursos disponíveis</h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard title="Organização financeira" text="Acompanhe entradas, saídas, capital em aberto e resultados da operação." />
            <InfoCard title="Documentos e contratos" text="Crie, acompanhe e compartilhe documentos importantes com seus clientes." />
            <InfoCard title="Atendimento" text="Converse com clientes e acompanhe solicitações em um só lugar." />
            <InfoCard title="Automação" text="Reduza tarefas repetitivas e mantenha as cobranças organizadas." />
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-black uppercase text-white"><Zap size={16} className="text-amber-500" /> Como o sistema protege seus registros</h4>
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
            <p className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />Cada usuário acessa somente as informações da sua própria operação.</p>
            <p className="flex items-start gap-2"><MessageCircle size={15} className="mt-0.5 shrink-0 text-cyan-400" />As ações importantes mostram o resultado antes da confirmação.</p>
          </div>
        </section>
      </div>
    </div>
  </div>
);

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <strong className="mb-2 block text-xs uppercase text-white">{title}</strong>
      <p className="text-[10px] leading-relaxed text-slate-400">{text}</p>
    </div>
  );
}
