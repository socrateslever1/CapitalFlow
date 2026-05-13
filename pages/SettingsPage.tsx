
import React from 'react';
import { Settings, FileText, Cpu, Layers, Code, ShieldCheck, Zap } from 'lucide-react';

export const SettingsPage: React.FC = () => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* CONTEÚDO TÉCNICO (README) */}
            <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-2xl">
                
                <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-800">
                    <div className="p-3 bg-blue-600/10 text-blue-500 rounded-2xl"><Cpu size={24}/></div>
                    <div>
                        <h3 className="text-lg font-black text-white uppercase">Análise Técnica do Sistema</h3>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">CapitalFlow v3.0.0 • Stack Report</p>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* RESUMO EXECUTIVO */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-black text-white uppercase flex items-center gap-2"><FileText size={16} className="text-emerald-500"/> Resumo Executivo</h4>
                        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed space-y-2">
                            <p>O <strong>CapitalFlow</strong> é uma aplicação web robusta (SPA) focada em gestão financeira de crédito privado, com funcionalidades avançadas de CRM, jurídico e automação via IA.</p>
                            <p>A arquitetura é moderna, baseada em <strong>React 19 + TypeScript + Vite</strong>, utilizando o <strong>Supabase</strong> como Backend-as-a-Service (BaaS). O sistema evoluiu para uma plataforma complexa que inclui Gestão de Crédito, Jurídico (Títulos Executivos), Comunicação Realtime e Automação Financeira.</p>
                        </div>
                    </div>

                    {/* ARQUITETURA */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-black text-white uppercase flex items-center gap-2"><Layers size={16} className="text-purple-500"/> Arquitetura e Padrões</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                                <strong className="text-white text-xs uppercase block mb-2">Estrutura (Feature-based)</strong>
                                <p className="text-[10px] text-slate-400">Organização limpa baseada em funcionalidades (<code>features/</code>), separando lógica de negócio (<code>domain/</code>), interface (<code>components/</code>) e serviços (<code>services/</code>).</p>
                            </div>
                            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                                <strong className="text-white text-xs uppercase block mb-2">Estado e Cache</strong>
                                <p className="text-[10px] text-slate-400">Gerenciamento via hooks customizados (<code>useAppState</code>) com sistema de cache manual (localStorage) para performance offline-first e mitigação de latência.</p>
                            </div>
                            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                                <strong className="text-white text-xs uppercase block mb-2">Segurança (RLS)</strong>
                                <p className="text-[10px] text-slate-400">Segurança a nível de linha (Row Level Security) no PostgreSQL. Acesso restrito via <code>owner_id</code> e <code>profile_id</code>.</p>
                            </div>
                            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                                <strong className="text-white text-xs uppercase block mb-2">Design Patterns</strong>
                                <p className="text-[10px] text-slate-400">Uso extensivo de Strategy Pattern (Financeiro), Controller Pattern (Lógica de UI) e Adapter Pattern (Normalização de Dados).</p>
                            </div>
                        </div>
                    </div>

                    {/* PONTOS FORTES */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-black text-white uppercase flex items-center gap-2"><Zap size={16} className="text-amber-500"/> Destaques do Sistema</h4>
                        <ul className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                            <li className="text-xs text-slate-300 flex items-start gap-2">
                                <span className="text-emerald-500 font-bold">•</span>
                                <span><strong>Módulo Jurídico:</strong> Geração de títulos executivos com hash SHA-256 (Web Crypto API) para integridade probatória.</span>
                            </li>
                            <li className="text-xs text-slate-300 flex items-start gap-2">
                                <span className="text-emerald-500 font-bold">•</span>
                                <span><strong>Integração IA:</strong> Análise de risco e consultoria financeira via Google Gemini (SDK @google/genai).</span>
                            </li>
                            <li className="text-xs text-slate-300 flex items-start gap-2">
                                <span className="text-emerald-500 font-bold">•</span>
                                <span><strong>Atomicidade Financeira:</strong> Uso de RPCs (Stored Procedures) para garantir consistência em transações críticas.</span>
                            </li>
                            <li className="text-xs text-slate-300 flex items-start gap-2">
                                <span className="text-emerald-500 font-bold">•</span>
                                <span><strong>Realtime:</strong> Suporte ao cliente e notificações via Supabase Realtime Channels.</span>
                            </li>
                        </ul>
                    </div>

                    {/* RISCOS E ATENÇÃO */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-black text-white uppercase flex items-center gap-2"><ShieldCheck size={16} className="text-rose-500"/> Pontos de Atenção</h4>
                        <div className="bg-rose-950/10 p-4 rounded-2xl border border-rose-500/20 text-xs text-rose-200/80 leading-relaxed">
                            <p className="mb-2"><strong>1. Roteamento Manual:</strong> O sistema utiliza controle de estado (<code>activeTab</code>) em vez de React Router. O botão "Voltar" do navegador é interceptado manualmente (<code>useExitGuard</code>).</p>
                            <p className="mb-2"><strong>2. Performance de Renderização:</strong> Componentes como <code>DashboardPage</code> e <code>LoanCard</code> são densos. O uso de <code>React.memo</code> e virtualização deve ser monitorado conforme a base cresce.</p>
                            <p><strong>3. Tipagem:</strong> Existem usos de <code>any</code> em adaptadores que podem reduzir a segurança do TypeScript. Recomenda-se refatoração progressiva.</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
