import React from 'react';
import { AppIcon, type AppIconName } from './AppIcons';

/**
 * Mesmos nomes dos ícones genéricos usados nas telas, desenhando a versão própria do CapitalFlow.
 * Trocar o import de 'lucide-react' para este arquivo aplica o padrão sem mexer no resto da tela.
 * Ícones de controle (setas, carregando, fechar, lixeira) continuam os de traço.
 */
type Props = { size?: number | string; className?: string; strokeWidth?: number | string };
const make = (name: AppIconName) => {
  const Icon: React.FC<Props> = ({ size = 20, className = '' }) => (
    <AppIcon name={name} size={Math.round(Number(size) * 1.15)} className={className.replace(/\btext-\S+/g, '')} />
  );
  Icon.displayName = `Brand(${name})`;
  return Icon;
};

export const Banknote = make('banknote');
export const CheckCircle2 = make('contractDone');
export const Briefcase = make('briefcase');
export const ShieldAlert = make('exposure');
export const ArrowUpRight = make('growth');
export const Gauge = make('gauge');
export const BrainCircuit = make('ai');
export const PieChart = make('reports');
export const TrendingUp = make('trend');
export const Calendar = make('calendar');
export const Percent = make('percent');
export const Users = make('clients');
export const Scroll = make('scroll');
export const Printer = make('printer');
export const MessageCircle = make('chat');
export const ShieldCheck = make('shieldCheck');
export const Building2 = make('bank');
export const Coins = make('capital');
export const Clock3 = make('clock');
export const CreditCard = make('wallet');
export const Calculator = make('simulator');
export const UserRound = make('profileData');
export const User = make('profileData');
export const Target = make('goals');
export const Wallet = make('walletGreen');
export const ArrowRightLeft = make('statement');
export const BarChart3 = make('dashboard');
export const Skull = make('critical');
export const Scale = make('legal');
