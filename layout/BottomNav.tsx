
import React, { useRef, useState } from 'react';
import { LayoutDashboard, Users, Wallet, LayoutGrid, Plus, Briefcase, ChevronLeft, Calendar, Calculator, ArrowRightLeft, Megaphone, Gavel, MessageSquare } from 'lucide-react';
import { Tooltip } from '../components/ui/Tooltip';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  onOpenNav: () => void;
  onNewLoan: () => void;
  navOrder: string[];
  primaryColor?: string;
  isStaff?: boolean;
  onGoBack?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ 
  activeTab, setActiveTab, onOpenNav, onNewLoan, navOrder, primaryColor = '#2563eb', isStaff, onGoBack
}) => {
  const scrollRef = useRef<HTMLElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!scrollRef.current || e.pointerType !== 'mouse') return;
    setIsDragging(true);
    setHasDragged(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !scrollRef.current || e.pointerType !== 'mouse') return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll-fast
    if (Math.abs(walk) > 10) {
        setHasDragged(true);
    }
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const getTabIcon = (tab: string, active: boolean) => {
    const size = 20;
    switch (tab) {
      case 'DASHBOARD': return <LayoutDashboard size={size} className={active ? 'text-blue-400' : ''}/>;
      case 'CLIENTS': return <Users size={size} className={active ? 'text-emerald-400' : ''}/>;
      case 'TEAM': return <Briefcase size={size} className={active ? 'text-indigo-400' : ''}/>;
      case 'SOURCES': return <Wallet size={size} className={active ? 'text-amber-400' : ''}/>;
      case 'AGENDA': return <Calendar size={size} className={active ? 'text-violet-400' : ''}/>;
      case 'SIMULATOR': return <Calculator size={size} className={active ? 'text-cyan-400' : ''}/>;
      case 'FLOW': return <ArrowRightLeft size={size} className={active ? 'text-rose-400' : ''}/>;
      case 'ACQUISITION': return <Megaphone size={size} className={active ? 'text-orange-400' : ''}/>;
      case 'LEGAL': return <Gavel size={size} className={active ? 'text-yellow-400' : ''}/>;
      case 'SUPPORT': return <MessageSquare size={size} className={active ? 'text-blue-400' : ''}/>;
      default: return <LayoutGrid size={size} className={active ? 'text-slate-400' : ''}/>;
    }
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'DASHBOARD': return 'Painel';
      case 'CLIENTS': return 'Clientes';
      case 'TEAM': return 'Equipe';
      case 'SOURCES': return 'Capital';
      case 'AGENDA': return 'Agenda';
      case 'SIMULATOR': return 'Simulador';
      case 'FLOW': return 'Extrato';
      case 'ACQUISITION': return 'Captação';
      case 'PROFILE': return 'Perfil';
      case 'SETTINGS': return 'Ajustes';
      case 'LEGAL': return 'Jurídico';
      case 'SUPPORT': return 'Chat';
      default: return tab;
    }
  };

  // Lista completa de abas para a barra de tarefas mobile
  const mobileTabs = ['DASHBOARD', 'SIMULATOR', 'CLIENTS', 'SOURCES', 'LEGAL', 'SUPPORT'];

  return (
    <div 
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800 z-[300] flex items-center p-2 pb-safe overflow-x-auto hide-scrollbar gap-2 px-4 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
       {mobileTabs.map(tab => (
           <button 
            key={tab}
            onClick={() => {
                if (!hasDragged) setActiveTab(tab);
            }} 
            className={`flex flex-col items-center gap-1 p-2 min-w-[64px] rounded-xl transition-all shrink-0 ${activeTab === tab ? 'bg-slate-900/50' : 'text-slate-500'}`}
           >
               {getTabIcon(tab, activeTab === tab)}
               <span className={`text-[9px] font-bold uppercase truncate w-full text-center ${activeTab === tab ? 'text-white' : ''}`}>{getTabLabel(tab)}</span>
           </button>
       ))}
    </div>
  );
};
