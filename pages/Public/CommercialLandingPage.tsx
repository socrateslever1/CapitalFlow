import React from 'react';
import { 
  ArrowRight, 
  MessageSquare, 
  Wallet, 
  ShieldCheck, 
  Clock, 
  TrendingUp, 
  Zap,
  Users,
  CheckCircle,
  HelpCircle,
  Gavel
} from 'lucide-react';

const landingCss = `
  .landing-wrapper {
    background-color: #020617;
    color: #f8fafc;
    font-family: Inter, system-ui, sans-serif;
    min-height: 100vh;
    overflow-x: hidden;
  }
  .glow-effect {
    position: absolute;
    border-radius: 9999px;
    filter: blur(120px);
    opacity: 0.15;
    pointer-events: none;
    z-index: 0;
  }
  .feature-card {
    background: rgba(15, 23, 42, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(8px);
    transition: all 0.3s ease;
  }
  .feature-card:hover {
    border-color: rgba(99, 102, 241, 0.3);
    transform: translateY(-4px);
    box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
  }
  .text-gradient {
    background: linear-gradient(135deg, #ffffff 30%, #a5b4fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .text-gradient-purple {
    background: linear-gradient(135deg, #c084fc 0%, #6366f1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .cta-button {
    background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
    box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.4);
    transition: all 0.2s ease;
  }
  .cta-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 24px -5px rgba(79, 70, 229, 0.5);
  }
`;

export const CommercialLandingPage: React.FC = () => {
  const handleGoToLogin = () => {
    window.location.pathname = '/login';
  };

  return (
    <div className="landing-wrapper relative overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: landingCss }} />

      {/* Glow Backgrounds */}
      <div className="glow-effect w-96 h-96 bg-indigo-500 top-10 left-10"></div>
      <div className="glow-effect w-96 h-96 bg-purple-500 bottom-20 right-10"></div>

      {/* HEADER */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 h-20 flex items-center justify-between border-b border-slate-900">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-indigo-900/30">
            CF
          </div>
          <span className="font-black text-sm uppercase tracking-widest text-white">CapitalFlow</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <a href="#features" className="hover:text-white transition-colors">Recursos</a>
          <a href="#rules" className="hover:text-white transition-colors">Régua</a>
          <a href="#legal" className="hover:text-white transition-colors">Validade Legal</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </nav>

        <div>
          <button 
            onClick={handleGoToLogin}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-lg text-xs font-black uppercase tracking-wider transition-all active:scale-95"
          >
            Área do Operador
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
        <span className="px-3 py-1 bg-indigo-950/50 border border-indigo-900/50 rounded-full text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-6 inline-block">
          SaaS de Cobrança e Recebimento Inteligente
        </span>

        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none mb-6">
          <span className="text-gradient block">Recupere Recebíveis</span>
          <span className="text-gradient-purple block mt-2">Sem Perder Clientes</span>
        </h1>

        <p className="max-w-2xl mx-auto text-slate-400 text-sm md:text-base font-medium leading-relaxed mb-10">
          O CapitalFlow automatiza suas réguas de mensagens de cobrança por WhatsApp, fornece um portal exclusivo de auto-negociação com Pix dinâmico para os clientes devedores e assegura acordos com aceite eletrônico de validade jurídica inquestionável.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button 
            onClick={handleGoToLogin}
            className="cta-button w-full sm:w-auto px-8 py-4 text-white font-black uppercase text-xs rounded-lg flex items-center justify-center gap-2 tracking-wider"
          >
            Começar Agora <ArrowRight size={14} />
          </button>
          <a 
            href="#features"
            className="w-full sm:w-auto px-8 py-4 bg-slate-900/50 hover:bg-slate-800 border border-slate-800/80 text-slate-300 font-black uppercase text-xs rounded-lg tracking-wider text-center transition-all"
          >
            Conhecer Recursos
          </a>
        </div>

        {/* Mockup do Sistema Visual */}
        <div className="mt-16 relative border border-slate-800/60 rounded-xl bg-slate-950 p-3 shadow-2xl shadow-black/80 max-w-4xl mx-auto">
          <div className="flex items-center gap-1.5 border-b border-slate-900 pb-3 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
            <span className="text-[9px] text-slate-600 font-mono ml-2 uppercase font-black">capitalflow.com/dashboard</span>
          </div>
          <div className="aspect-[16/9] bg-slate-900/20 rounded-lg overflow-hidden flex items-center justify-center border border-slate-900">
            <div className="text-center p-8 space-y-4">
              <Zap className="w-12 h-12 text-indigo-500 mx-auto animate-pulse" />
              <p className="text-white font-bold text-xs uppercase tracking-widest">Painel Administrativo & Régua Inteligente</p>
              <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed mx-auto font-medium">Sua conta configurada com réguas automáticas integradas a gateways de Pix Asaas e Mercado Pago.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-slate-900">
        <div className="text-center max-w-xl mx-auto mb-16">
          <h2 className="text-2xl font-black uppercase text-white tracking-wide">Recursos Construídos para Escalar</h2>
          <p className="text-slate-500 text-xs font-bold uppercase mt-2">Diga adeus a processos manuais e controles de cobrança ineficientes.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="feature-card p-8 rounded-xl flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-indigo-600/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center mb-6">
                <MessageSquare size={20} />
              </div>
              <h3 className="text-white font-black text-sm uppercase tracking-wide mb-3">Régua de WhatsApp</h3>
              <p className="text-slate-400 text-xs font-medium leading-relaxed">
                Mensagens automatizadas programadas (D-3, D0, D+1, D+7 e D+15) com fallback para templates customizados e tags dinâmicas de Pix e link do portal.
              </p>
            </div>
          </div>

          <div className="feature-card p-8 rounded-xl flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mb-6">
                <Wallet size={20} />
              </div>
              <h3 className="text-white font-black text-sm uppercase tracking-wide mb-3">Portal do Devedor</h3>
              <p className="text-slate-400 text-xs font-medium leading-relaxed">
                Área exclusiva onde o cliente visualiza seus contratos, consulta chaves Pix dinâmicas, faz propostas de renegociação e emite comprovantes instantâneos.
              </p>
            </div>
          </div>

          <div className="feature-card p-8 rounded-xl flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-purple-600/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-6">
                <ShieldCheck size={20} />
              </div>
              <h3 className="text-white font-black text-sm uppercase tracking-wide mb-3">Validade Jurídica</h3>
              <p className="text-slate-400 text-xs font-medium leading-relaxed">
                Aceites eletrônicos amparados legalmente. Gravamos IP, timezone do cliente, fuso horário, dados do dispositivo e versão do termo assinado de forma estruturada.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* REGUA EXPLICADA */}
      <section id="rules" className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-slate-900 bg-slate-950/20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="px-2.5 py-1 bg-indigo-950 border border-indigo-900 rounded text-[8px] font-black uppercase tracking-widest text-indigo-400 mb-4 inline-block">
              Fluxos Inteligentes
            </span>
            <h2 className="text-2xl md:text-3xl font-black uppercase text-white tracking-wide mb-6">
              Como funciona a Régua de Reminders
            </h2>
            <p className="text-slate-400 text-xs font-medium leading-relaxed mb-6">
              Nossa automação varre o vencimento das parcelas abertas de forma nativa e insere mensagens otimizadas de cobrança na fila de envios. Em datas críticas, o sistema retém o envio para análise humana.
            </p>

            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-indigo-600/10 text-indigo-500 flex items-center justify-center text-[10px] font-black shrink-0">1</div>
                <div>
                  <h4 className="text-white font-bold text-xs uppercase">Notificação Prévia (D-3)</h4>
                  <p className="text-slate-500 text-[10px] leading-relaxed mt-0.5">Aviso amigável com botão de antecipação e Pix copia-e-cola.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-indigo-600/10 text-indigo-500 flex items-center justify-center text-[10px] font-black shrink-0">2</div>
                <div>
                  <h4 className="text-white font-bold text-xs uppercase">Cobrança no Vencimento (D0)</h4>
                  <p className="text-slate-500 text-[10px] leading-relaxed mt-0.5">Lembrete no dia do pagamento com atalho Pix facilitado.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-indigo-600/10 text-indigo-500 flex items-center justify-center text-[10px] font-black shrink-0">3</div>
                <div>
                  <h4 className="text-white font-bold text-xs uppercase">Alerta Jurídico (D+15)</h4>
                  <p className="text-slate-500 text-[10px] leading-relaxed mt-0.5">Cobranças críticas entram com status WAITING APPROVAL, exigindo crivo do operador.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Fila de Envio */}
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl space-y-4 font-mono text-[10px]">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <span className="text-white font-bold uppercase tracking-wider">Fila de WhatsApp</span>
              <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 rounded text-[8px] font-black uppercase">Monitor Ativo</span>
            </div>
            <div className="space-y-2">
              <div className="p-3 bg-slate-950/60 rounded border border-slate-850 flex justify-between items-center">
                <div>
                  <p className="text-slate-400 font-bold">Dest: +55 (11) 99887-6655</p>
                  <p className="text-slate-600 text-[8px] mt-0.5">Olá, João. Recebemos o seu pagamento de R$ 150,00...</p>
                </div>
                <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-400 rounded text-[7px] font-black border border-emerald-900/30">SENT</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded border border-slate-850 flex justify-between items-center">
                <div>
                  <p className="text-slate-400 font-bold">Dest: +55 (21) 97766-5544</p>
                  <p className="text-slate-600 text-[8px] mt-0.5">Consta em aberto a parcela de R$ 340,00...</p>
                </div>
                <span className="px-1.5 py-0.5 bg-amber-950 text-amber-400 rounded text-[7px] font-black border border-amber-900/30">WAITING APPROVAL</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LEGAL SECTION */}
      <section id="legal" className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-slate-900 text-center">
        <div className="max-w-2xl mx-auto">
          <Gavel size={36} className="text-indigo-500 mx-auto mb-6" />
          <h2 className="text-2xl font-black uppercase text-white tracking-wide mb-4">
            Total Validade Jurídica em Cada Acordo
          </h2>
          <p className="text-slate-400 text-xs font-medium leading-relaxed mb-10">
            Nossos termos e acordos de renegociação utilizam criptografia e lastro digital para assegurar a autoria e integridade das assinaturas. Capturamos IP de origem, fuso horário do assinante, versão do snapshot documental e identificadores de navegador (User-Agent) em conformidade com as diretrizes do judiciário brasileiro.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/20 border border-slate-900 rounded-lg">
              <h4 className="text-white font-bold text-xs uppercase">IP de Origem</h4>
              <p className="text-[8px] text-slate-500 mt-1 uppercase font-black">Auditado</p>
            </div>
            <div className="p-4 bg-slate-900/20 border border-slate-900 rounded-lg">
              <h4 className="text-white font-bold text-xs uppercase">Timezone Fuso</h4>
              <p className="text-[8px] text-slate-500 mt-1 uppercase font-black">Geolocalizado</p>
            </div>
            <div className="p-4 bg-slate-900/20 border border-slate-900 rounded-lg">
              <h4 className="text-white font-bold text-xs uppercase">Criptografia</h4>
              <p className="text-[8px] text-slate-500 mt-1 uppercase font-black">Cópia Autêntica</p>
            </div>
            <div className="p-4 bg-slate-900/20 border border-slate-900 rounded-lg">
              <h4 className="text-white font-bold text-xs uppercase">Conformidade</h4>
              <p className="text-[8px] text-slate-500 mt-1 uppercase font-black">MP 2.200-2/2001</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="relative z-10 max-w-4xl mx-auto px-6 py-20 border-t border-slate-900">
        <div className="text-center mb-12">
          <HelpCircle size={28} className="text-indigo-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black uppercase text-white tracking-wide">Perguntas Frequentes</h2>
        </div>

        <div className="space-y-6">
          <div className="p-5 bg-slate-900/20 border border-slate-900 rounded-lg">
            <h4 className="text-white font-bold text-xs uppercase">Preciso de um número de WhatsApp exclusivo?</h4>
            <p className="text-slate-400 text-[10px] leading-relaxed mt-2 font-medium">
              Sim. Você pode conectar sua conta oficial da Meta Cloud API, Evolution API ou Z-API para enviar mensagens disparadas automaticamente pelo sistema.
            </p>
          </div>
          <div className="p-5 bg-slate-900/20 border border-slate-900 rounded-lg">
            <h4 className="text-white font-bold text-xs uppercase">Como funciona a integração com Pix e gateways?</h4>
            <p className="text-slate-400 text-[10px] leading-relaxed mt-2 font-medium">
              O CapitalFlow conecta-se aos gateways de pagamento Asaas e Mercado Pago de forma transparente. A baixa do pagamento ocorre automaticamente após a confirmação via webhook.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 max-w-7xl mx-auto px-6 py-12 border-t border-slate-900 text-center flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center font-black text-white text-xs">CF</div>
          <span className="font-bold text-white tracking-wider">CAPITALFLOW</span>
        </div>
        <p className="font-bold uppercase tracking-wider">© {new Date().getFullYear()} CapitalFlow. Todos os direitos reservados.</p>
        <p className="uppercase font-black text-[8px] text-indigo-500/80 tracking-widest">SaaS Premium Financeiro</p>
      </footer>
    </div>
  );
};
