import React from 'react';

/**
 * Ícones próprios do CapitalFlow: desenho em duas ou três cores, com identidade por área,
 * no lugar dos ícones genéricos de traço. Use `muted` para estados inativos.
 */
export type AppIconName =
  | 'dashboard' | 'wallet' | 'capital' | 'clients' | 'statement' | 'simulator' | 'legal' | 'assistant'
  | 'contracts' | 'reports' | 'profile'
  | 'all' | 'late' | 'critical' | 'renegotiated' | 'onTime' | 'paid' | 'archived'
  | 'profileData' | 'goals' | 'payments' | 'export' | 'preferences' | 'security' | 'updates';

const paths: Record<AppIconName, React.ReactNode> = {
  // Painel: gráfico de barras sobre um quadro.
  dashboard: <>
    <rect x="2.5" y="3" width="19" height="18" rx="4" fill="#1e3a8a" />
    <rect x="6" y="12" width="3" height="6" rx="1" fill="#38bdf8" />
    <rect x="10.5" y="8" width="3" height="10" rx="1" fill="#34d399" />
    <rect x="15" y="10.5" width="3" height="7.5" rx="1" fill="#fbbf24" />
  </>,
  // Carteira (pessoal): cartão com chip.
  wallet: <>
    <rect x="5" y="3.5" width="16" height="11" rx="2.2" fill="#7c3aed" transform="rotate(-8 13 9)" />
    <rect x="2.5" y="8" width="17" height="11.5" rx="2.4" fill="#c084fc" />
    <rect x="2.5" y="10.6" width="17" height="2.2" fill="#6b21a8" opacity="0.55" />
    <rect x="5" y="14.4" width="4" height="3" rx="0.7" fill="#fde68a" />
  </>,
  // Capital: pilha de moedas.
  capital: <>
    <ellipse cx="12" cy="18" rx="8" ry="2.8" fill="#b45309" />
    <rect x="4" y="12" width="16" height="6" fill="#d97706" />
    <ellipse cx="12" cy="12" rx="8" ry="2.8" fill="#f59e0b" />
    <rect x="4" y="7" width="16" height="5" fill="#f59e0b" />
    <ellipse cx="12" cy="7" rx="8" ry="2.8" fill="#fcd34d" />
    <path d="M12 5.6v2.8M10.6 7h2.8" stroke="#92400e" strokeWidth="1.2" strokeLinecap="round" />
  </>,
  // Clientes: duas pessoas.
  clients: <>
    <circle cx="16" cy="8" r="3" fill="#059669" />
    <path d="M11.5 20a4.5 4.5 0 0 1 9 0z" fill="#059669" />
    <circle cx="9" cy="8.5" r="3.5" fill="#34d399" />
    <path d="M3 20.5a6 6 0 0 1 12 0z" fill="#34d399" />
  </>,
  // Extrato: folha com setas de entrada e saída.
  statement: <>
    <rect x="4" y="2.5" width="16" height="19" rx="3" fill="#0e7490" />
    <path d="M8 8h5.5l-1.6-1.6M8 8l1.6 1.6" stroke="#67e8f9" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M16 13.5h-5.5l1.6 1.6M16 13.5l-1.6-1.6" stroke="#fda4af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M8 18h8" stroke="#a5f3fc" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
  </>,
  // Simulador: calculadora com teclas coloridas.
  simulator: <>
    <rect x="4.5" y="2.5" width="15" height="19" rx="3" fill="#1d4ed8" />
    <rect x="7" y="5" width="10" height="4" rx="1" fill="#bfdbfe" />
    <circle cx="8.5" cy="12.5" r="1.3" fill="#e0e7ff" /><circle cx="12" cy="12.5" r="1.3" fill="#e0e7ff" /><circle cx="15.5" cy="12.5" r="1.3" fill="#fbbf24" />
    <circle cx="8.5" cy="16.5" r="1.3" fill="#e0e7ff" /><circle cx="12" cy="16.5" r="1.3" fill="#e0e7ff" /><circle cx="15.5" cy="16.5" r="1.3" fill="#34d399" />
  </>,
  // Jurídico: balança.
  legal: <>
    <path d="M12 3v16M7 19.5h10" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
    <path d="M4.5 7h15" stroke="#c4b5fd" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M6 7.5 3.5 13h5z" fill="#fbbf24" /><path d="M2.8 13a3.2 3.2 0 0 0 6.4 0z" fill="#f59e0b" />
    <path d="M18 7.5 15.5 13h5z" fill="#fbbf24" /><path d="M14.8 13a3.2 3.2 0 0 0 6.4 0z" fill="#f59e0b" />
  </>,
  // Assistente: balão com brilho.
  assistant: <>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5z" fill="#2563eb" />
    <path d="M12 6.2l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z" fill="#fde68a" />
  </>,
  // Contratos: documento com selo.
  contracts: <>
    <path d="M5 2.5h9.5L19 7v14.5H5z" fill="#1e40af" />
    <path d="M14.5 2.5V7H19" fill="#60a5fa" />
    <path d="M8 10.5h8M8 13.5h6" stroke="#bfdbfe" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="15.5" cy="17.5" r="2.6" fill="#fbbf24" />
  </>,
  // Relatórios: pizza.
  reports: <>
    <circle cx="11" cy="13" r="8" fill="#4f46e5" />
    <path d="M11 13V5a8 8 0 0 1 8 8z" fill="#a5b4fc" />
    <path d="M13.5 3a8 8 0 0 1 7.5 7.5h-7.5z" fill="#fbbf24" />
  </>,
  // Perfil: crachá.
  profile: <>
    <rect x="3" y="4" width="18" height="16" rx="3" fill="#6d28d9" />
    <circle cx="9" cy="11" r="2.6" fill="#ddd6fe" />
    <path d="M5.2 17a3.8 3.8 0 0 1 7.6 0z" fill="#ddd6fe" />
    <path d="M14 10h4M14 13h3" stroke="#c4b5fd" strokeWidth="1.4" strokeLinecap="round" />
  </>,
  // Filtros de contratos.
  all: <>
    <rect x="4" y="11" width="16" height="9" rx="2.5" fill="#1d4ed8" />
    <rect x="5.5" y="7.5" width="13" height="5" rx="2" fill="#3b82f6" />
    <rect x="7" y="4" width="10" height="5" rx="2" fill="#93c5fd" />
  </>,
  late: <>
    <circle cx="12" cy="12.5" r="8.5" fill="#d97706" />
    <path d="M12 7.5v5l3 2" stroke="#fff7ed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  critical: <>
    <path d="M12 3 21.5 19.5h-19z" fill="#e11d48" strokeLinejoin="round" />
    <path d="M12 9.5v4.5" stroke="#fff1f2" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="16.8" r="1.2" fill="#fff1f2" />
  </>,
  renegotiated: <>
    <circle cx="12" cy="12" r="9" fill="#7e22ce" />
    <path d="M8 10a4.3 4.3 0 0 1 7.6-1.8M16 14a4.3 4.3 0 0 1-7.6 1.8" stroke="#f3e8ff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <path d="M15.8 5.8v2.6h-2.6M8.2 18.2v-2.6h2.6" stroke="#f3e8ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  onTime: <>
    <path d="M12 2.5l2.3 1.7 2.8-.2.9 2.7 2.4 1.5-.9 2.7.9 2.7-2.4 1.5-.9 2.7-2.8-.2L12 21.5l-2.3-1.7-2.8.2-.9-2.7-2.4-1.5.9-2.7-.9-2.7 2.4-1.5.9-2.7 2.8.2z" fill="#059669" />
    <path d="M8.3 12.2l2.4 2.4 5-5" stroke="#ecfdf5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  paid: <>
    <circle cx="12" cy="12" r="9" fill="#4338ca" />
    <circle cx="12" cy="12" r="6.5" fill="none" stroke="#a5b4fc" strokeWidth="1.2" />
    <path d="M14 9.5c-.5-.7-1.2-1-2.1-1-1.2 0-2.1.7-2.1 1.6 0 2.2 4.4 1.2 4.4 3.5 0 .9-.9 1.6-2.2 1.6-1 0-1.8-.4-2.3-1.1M12 7.3v1.2M12 15.2v1.3" stroke="#e0e7ff" strokeWidth="1.4" strokeLinecap="round" fill="none" />
  </>,
  archived: <>
    <rect x="3" y="4" width="18" height="5" rx="1.5" fill="#64748b" />
    <path d="M4.5 9h15v9.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" fill="#94a3b8" />
    <rect x="9.5" y="11.5" width="5" height="2" rx="1" fill="#334155" />
  </>,
  // Abas do perfil.
  profileData: <>
    <circle cx="12" cy="8" r="4" fill="#60a5fa" />
    <path d="M4 20.5a8 8 0 0 1 16 0z" fill="#2563eb" />
  </>,
  goals: <>
    <circle cx="12" cy="12" r="9" fill="#059669" />
    <circle cx="12" cy="12" r="6" fill="#ecfdf5" />
    <circle cx="12" cy="12" r="3" fill="#059669" />
    <path d="M12 12l7-7M16.5 4.5H19.5V7.5" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  payments: <>
    <path d="M12 2.5 21.5 12 12 21.5 2.5 12z" fill="#0d9488" />
    <path d="M12 7.5 16.5 12 12 16.5 7.5 12z" fill="#5eead4" />
  </>,
  export: <>
    <rect x="3.5" y="3" width="17" height="18" rx="3" fill="#15803d" />
    <path d="M3.5 9h17M3.5 15h17M10 3v18" stroke="#86efac" strokeWidth="1.2" opacity="0.8" />
    <circle cx="17.5" cy="17.5" r="4" fill="#0f172a" />
    <path d="M17.5 15.3v4M15.8 17.8l1.7 1.7 1.7-1.7" stroke="#4ade80" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  preferences: <>
    <path d="M4 7h16M4 12h16M4 17h16" stroke="#475569" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="8.5" cy="7" r="2.4" fill="#38bdf8" /><circle cx="15.5" cy="12" r="2.4" fill="#fbbf24" /><circle cx="10" cy="17" r="2.4" fill="#f472b6" />
  </>,
  security: <>
    <path d="M12 2.5 19.5 5.5v6c0 4.6-3.2 8.4-7.5 10-4.3-1.6-7.5-5.4-7.5-10v-6z" fill="#0f766e" />
    <rect x="8.6" y="10.6" width="6.8" height="5.6" rx="1.2" fill="#ccfbf1" />
    <path d="M10.2 10.6V9.2a1.8 1.8 0 0 1 3.6 0v1.4" stroke="#ccfbf1" strokeWidth="1.4" fill="none" />
  </>,
  updates: <>
    <circle cx="12" cy="12" r="9" fill="#9333ea" />
    <path d="M12 6.5l1.3 3.3 3.4 1.2-3.4 1.2L12 15.5l-1.3-3.3L7.3 11l3.4-1.2z" fill="#fde68a" />
    <circle cx="16.8" cy="16.6" r="1.2" fill="#f5d0fe" />
  </>,
};

export const AppIcon: React.FC<{ name: AppIconName; size?: number; muted?: boolean; className?: string }> = ({
  name, size = 20, muted = false, className = '',
}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
    className={`shrink-0 transition-opacity ${muted ? 'opacity-80' : 'opacity-100'} ${className}`}>
    {paths[name]}
  </svg>
);
