import React from 'react';

type IconProps = { active?: boolean; className?: string };

/**
 * Ícones próprios das abas da Carteira: desenho com cor de identidade por área
 * (resumo, cartões, contas, contas a pagar), em vez de ícones genéricos de traço.
 * Inativos ficam esmaecidos; ativo ganha cor cheia.
 */
const frame = (active: boolean | undefined, className = '') =>
  `h-6 w-6 shrink-0 ${active ? 'opacity-100' : 'opacity-75 cf-icon-interactive'} ${className}`;

export const OverviewIcon: React.FC<IconProps> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" data-cf-icon-active={active} className={frame(active, className)}>
    {/* Rosca dividida: o resumo das finanças. */}
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="#334155" strokeWidth="4" />
    <g data-cf-part="ring"><path d="M12 3.5a8.5 8.5 0 0 1 8.2 6.3" fill="none" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
    <path d="M20.3 13.6a8.5 8.5 0 0 1-6.6 6.7" fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round" />
    <path d="M10.2 20.3a8.5 8.5 0 0 1-6.6-9.1" fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" /></g>
  </svg>
);

export const CardsIcon: React.FC<IconProps> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" data-cf-icon-active={active} className={frame(active, className)}>
    {/* Dois cartões sobrepostos; o da frente com chip. */}
    <g data-cf-part="fan"><rect x="5" y="3.5" width="16" height="11" rx="2.2" fill="#7c3aed" transform="rotate(-8 13 9)" /></g>
    <rect x="2.5" y="8" width="17" height="11.5" rx="2.4" fill="#a78bfa" />
    <rect x="2.5" y="10.6" width="17" height="2.2" fill="#5b21b6" opacity="0.55" />
    <rect x="5" y="14.4" width="4" height="3" rx="0.7" fill="#fde68a" />
  </svg>
);

export const AccountsIcon: React.FC<IconProps> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" data-cf-icon-active={active} className={frame(active, className)}>
    {/* Carteira com moeda saindo: saldo em conta. */}
    <g data-cf-part="coin"><circle cx="16.5" cy="6" r="3.6" fill="#fbbf24" />
    <path d="M16.5 4.3v3.4M15.2 5.2h2.2" stroke="#92400e" strokeWidth="1.1" strokeLinecap="round" /></g>
    <path d="M3 9.5A2.5 2.5 0 0 1 5.5 7H18a3 3 0 0 1 3 3v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18z" fill="#10b981" />
    <path d="M14 12.2h7v4.6h-7a2.3 2.3 0 0 1 0-4.6z" fill="#047857" />
    <circle cx="15.2" cy="14.5" r="1" fill="#d1fae5" />
  </svg>
);

export const PayablesIcon: React.FC<IconProps> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" data-cf-icon-active={active} className={frame(active, className)}>
    {/* Boleto com picote e selo de data: contas a pagar. */}
    <g data-cf-part="paper"><path d="M5 2.8h11l3 3v15.4l-1.8-1.2-1.8 1.2-1.8-1.2-1.8 1.2-1.8-1.2-1.8 1.2L6.8 20 5 21.2z" fill="#f59e0b" />
    <path d="M8 7.5h6M8 10.5h8M8 13.5h4" stroke="#7c2d12" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" /></g>
    <g data-cf-part="seal"><circle cx="17.2" cy="17.2" r="4.3" fill="#f43f5e" stroke="#0f172a" strokeWidth="1.2" />
    <path d="M17.2 15v2.4l1.5 1" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" fill="none" /></g>
  </svg>
);
