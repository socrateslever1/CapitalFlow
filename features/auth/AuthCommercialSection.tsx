import React from 'react';
import {
  ArrowUp,
  BellRing,
  Check,
  FileSpreadsheet,
  History,
  Landmark,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
} from 'lucide-react';

interface AuthCommercialSectionProps {
  onCreateAccount: () => void;
  onScrollToLogin: () => void;
}

const STEPS = [
  {
    step: '01',
    icon: FileSpreadsheet,
    title: 'Cadastre clientes e contratos',
    description:
      'Organize prazos, taxas, parcelas e formas de recebimento em um único lugar, sem depender de planilhas soltas.',
  },
  {
    step: '02',
    icon: Wallet,
    title: 'Acompanhe o caixa real',
    description:
      'Visualize separadamente capital, juros, parcelas vencidas e saldo efetivo para tomar decisões com clareza.',
  },
  {
    step: '03',
    icon: BellRing,
    title: 'Cobrança e lembretes assistivos',
    description:
      'Acompanhe vencimentos e notificações operacionais mantendo o histórico completo de cada recebimento.',
  },
];

const ADVANTAGES = [
  {
    icon: History,
    title: 'Histórico auditável',
    description: 'Pagamentos, baixas parciais e estornos preservam a rastreabilidade da operação.',
  },
  {
    icon: Smartphone,
    title: 'Celular e computador',
    description: 'Interface adaptada para consultar e operar rapidamente na rua ou no escritório.',
  },
  {
    icon: Landmark,
    title: 'Fontes e Carteira integradas',
    description: 'Organize caixas, contas e cartões separando o capital operacional com clareza.',
  },
  {
    icon: ShieldCheck,
    title: 'Conciliação transparente',
    description: 'Identifique a origem de cada entrada e evite duplicidade ou confusão de saldos.',
  },
];

const FREE_FEATURES = [
  'Cadastro de clientes, contratos e parcelas',
  'Controle de recebimentos e histórico financeiro',
  'Acesso via navegador no celular e no computador',
  'Pode exibir anúncios discretos na versão gratuita',
];

const PRO_FEATURES = [
  'Experiência limpa, sem anúncios',
  'Fluxos avançados de cobrança e lembretes',
  'Relatórios completos e exportação de dados',
  'Suporte prioritário e recursos avançados de gestão',
];

export const AuthCommercialSection: React.FC<AuthCommercialSectionProps> = ({
  onCreateAccount,
  onScrollToLogin,
}) => {
  return (
    <section
      id="capitalflow-commercial"
      aria-label="Conheça o CapitalFlow"
      className="w-full border-t border-slate-800/80 bg-slate-950 px-4 py-14 text-slate-200 sm:px-6 sm:py-20"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16">
        {/* Como funciona */}
        <div className="space-y-8">
          <div className="mx-auto max-w-2xl text-center space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-blue-400">
              <Sparkles className="h-3.5 w-3.5" /> Como funciona na prática
            </span>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Controle financeiro e de contratos sem complicação
            </h2>
            <p className="text-sm leading-relaxed text-slate-400">
              Estruturado para quem precisa registrar operações com precisão, acompanhar vencimentos e manter o caixa organizado.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg transition-colors hover:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 text-blue-400">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-black tracking-widest text-slate-500">
                      PASSO {item.step}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Vantagens */}
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              Vantagens para a sua operação
            </h2>
            <p className="text-sm text-slate-400">
              Segurança operacional para não misturar números nem perder o histórico.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ADVANTAGES.map((adv) => {
              const Icon = adv.icon;
              return (
                <div
                  key={adv.title}
                  className="flex items-start gap-3.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-white">{adv.title}</h3>
                    <p className="text-xs leading-relaxed text-slate-400">{adv.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Planos */}
        <div className="space-y-8">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              Comece grátis e evolua quando precisar
            </h2>
            <p className="text-sm text-slate-400">
              Crie sua conta gratuita agora e conheça a plataforma por dentro.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Plano Free */}
            <div className="flex flex-col justify-between gap-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Plano Free
                  </span>
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-bold text-slate-300">
                    Gratuito
                  </span>
                </div>
                <p className="text-2xl font-black text-white">R$ 0</p>
                <ul className="space-y-2.5 text-sm text-slate-300">
                  {FREE_FEATURES.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={onCreateAccount}
                className="min-h-11 w-full rounded-xl bg-slate-800 px-4 py-3 text-xs font-black uppercase text-white transition-colors hover:bg-slate-700"
              >
                Criar conta grátis
              </button>
            </div>

            {/* Plano Pro */}
            <div className="flex flex-col justify-between gap-6 rounded-2xl border border-blue-500/40 bg-gradient-to-b from-slate-900 to-slate-900/90 p-6 shadow-xl shadow-blue-950/30">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-blue-400">
                    Plano Pro
                  </span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-400">
                    Em breve
                  </span>
                </div>
                <p className="text-2xl font-black text-white">Assinatura</p>
                <ul className="space-y-2.5 text-sm text-slate-200">
                  {PRO_FEATURES.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={onCreateAccount}
                className="min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-black uppercase text-white shadow-lg transition-colors hover:bg-blue-500"
              >
                Começar pelo cadastro gratuito
              </button>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <footer className="flex flex-col items-center justify-between gap-4 border-t border-slate-800/80 pt-8 text-center sm:flex-row sm:text-left">
          <p className="max-w-2xl text-xs leading-relaxed text-slate-500">
            CapitalFlow é uma ferramenta de gestão e controle operacional. O uso da plataforma e as decisões financeiras são de responsabilidade do usuário.
          </p>
          <button
            type="button"
            onClick={onScrollToLogin}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
          >
            <ArrowUp className="h-3.5 w-3.5" /> Voltar ao login
          </button>
        </footer>
      </div>
    </section>
  );
};

