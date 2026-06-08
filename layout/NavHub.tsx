
import React, { useRef, useState } from 'react';
import { LayoutGrid, X, User, Calendar, Calculator, ArrowRightLeft, Shield, Scale, Wallet, Briefcase, Users, LayoutDashboard, PiggyBank, Settings, Megaphone, MenuSquare, PieChart } from 'lucide-react';
import { AppTab, UserProfile } from "../types";

interface NavHubProps {
    onClose: () => void;
    onNavigate: (tab: AppTab, modal?: string) => void;
    userLevel: UserProfile["accessLevel"];
    hubOrder: AppTab[];
    unreadCampaignCount?: number;
}

export const NavHub: React.FC<NavHubProps> = ({ onClose, onNavigate, userLevel, hubOrder, unreadCampaignCount = 0 }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [hasDragged, setHasDragged] = useState(false);
    const [startY, setStartY] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!scrollRef.current || e.pointerType !== 'mouse') return;
        setIsDragging(true);
        setHasDragged(false);
        setStartY(e.pageY - scrollRef.current.offsetTop);
        setScrollTop(scrollRef.current.scrollTop);
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
        const y = e.pageY - scrollRef.current.offsetTop;
        const walk = (y - startY) * 2; // Scroll-fast
        if (Math.abs(walk) > 10) {
            setHasDragged(true);
        }
        scrollRef.current.scrollTop = scrollTop - walk;
    };

    const getTabMeta = (tab: AppTab) => {
        switch (tab) {
            case 'PROFILE': return { icon: <User size={20}/>, label: 'Perfil', color: 'text-blue-500', hover: 'hover:border-blue-600' };
            case 'SOURCES': return { icon: <Wallet size={20}/>, label: 'Capital', color: 'text-emerald-500', hover: 'hover:border-emerald-600' };
            case 'LEGAL': return { icon: <Scale size={20}/>, label: 'Jurídico', color: 'text-indigo-500', hover: 'hover:border-indigo-600' };
            case 'TEAM': return { icon: <Briefcase size={20}/>, label: 'Minha Equipe', color: 'text-purple-500', hover: 'hover:border-purple-600' };
            case 'CLIENTS': return { icon: <Users size={20}/>, label: 'Clientes', color: 'text-amber-500', hover: 'hover:border-amber-600' };
            case 'DASHBOARD': return { icon: <LayoutDashboard size={20}/>, label: 'Painel Geral', color: 'text-cyan-500', hover: 'hover:border-cyan-600' };
            case 'SETTINGS': return { icon: <Settings size={20}/>, label: 'Ajustes', color: 'text-slate-400', hover: 'hover:border-slate-500' };
            case 'ACQUISITION': return { icon: <Megaphone size={20}/>, label: 'Captação', color: 'text-orange-500', hover: 'hover:border-orange-600' };
            case 'REPORTS': return { icon: <PieChart size={20}/>, label: 'Inteligência', color: 'text-indigo-400', hover: 'hover:border-indigo-500' };
            default: return { icon: <LayoutGrid size={20}/>, label: tab, color: 'text-slate-500', hover: 'hover:border-slate-600' };
        }
    };

    const displayOrder = ['DASHBOARD' as AppTab, ...hubOrder.filter(tab =>
        tab !== 'DASHBOARD' &&
        tab !== 'TEAM' &&
        tab !== 'LEADS' &&
        tab !== 'ACQUISITION' &&
        tab !== 'AGENDA' &&
        tab !== 'REPORTS'
    ), 'REPORTS' as AppTab];

    return (
        <div
            className="fixed inset-0 z-[2000] bg-slate-950/40 backdrop-blur-sm hidden md:flex justify-start animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="w-full max-w-sm h-full bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-left duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header fixo com botão fechar */}
                <div className="flex justify-between items-center p-6 border-b border-slate-800/50 shrink-0">
                    <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                        <div className="p-2 bg-blue-600/20 rounded-full">
                            <MenuSquare className="text-blue-500" size={20}/>
                        </div>
                        <span className="text-white">Menu</span> <span className="text-blue-500">Principal</span>
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all active:scale-95"
                    >
                        <X size={20}/>
                    </button>
                </div>

                {/* Lista com scroll */}
                <div
                    ref={scrollRef}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerMove={handlePointerMove}
                    className={`flex-1 overflow-y-auto overscroll-contain p-4 space-y-2 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    {displayOrder.map(tab => {
                        const meta = getTabMeta(tab);
                        return (
                            <button
                                key={tab}
                                onClick={() => {
                                    if (!hasDragged) onNavigate(tab);
                                }}
                                className={`w-full p-4 bg-slate-950/50 hover:bg-slate-800 border border-slate-800/50 rounded-lg transition-all group flex items-center gap-4 relative active:scale-95 ${meta.hover}`}
                            >
                                <div className={`p-3 bg-slate-900 rounded-full ${meta.color} group-hover:scale-110 transition-transform`}>
                                    {meta.icon}
                                </div>
                                <span className="font-black text-white uppercase text-[11px] tracking-widest">{meta.label}</span>
                                {tab === 'ACQUISITION' && unreadCampaignCount > 0 && (
                                    <span className="absolute top-1/2 -translate-y-1/2 right-4 bg-rose-500 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full ring-4 ring-slate-950 animate-bounce shadow-lg shadow-rose-500/50">
                                        {unreadCampaignCount > 99 ? '99+' : unreadCampaignCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    {/* Atalhos fixos de utilitários */}
                    <div className="pt-4 mt-4 border-t border-slate-800/50 space-y-2">
                        {/*
                        AGENDA - REMOVIDA TEMPORARIAMENTE
                        <button onClick={() => { if (!hasDragged) onNavigate('AGENDA' as any); }} className="w-full p-4 bg-slate-950/50 hover:bg-slate-800 border border-slate-800/50 rounded-lg transition-all group flex items-center gap-4 active:scale-95">
                            <div className="p-3 bg-slate-900 rounded-full text-purple-500 group-hover:scale-110 transition-transform">
                                <Calendar size={20}/>
                            </div>
                            <span className="font-black text-white uppercase text-[11px] tracking-widest">Agenda</span>
                        </button>
                        */}
                        <button onClick={() => { if (!hasDragged) onNavigate('SIMULATOR' as any); }} className="w-full p-4 bg-slate-950/50 hover:bg-slate-800 border border-slate-800/50 rounded-lg transition-all group flex items-center gap-4 active:scale-95">
                            <div className="p-3 bg-slate-900 rounded-full text-blue-400 group-hover:scale-110 transition-transform">
                                <Calculator size={20}/>
                            </div>
                            <span className="font-black text-white uppercase text-[11px] tracking-widest">Simulador</span>
                        </button>
                        <button onClick={() => { if (!hasDragged) onNavigate('FLOW' as any); }} className="w-full p-4 bg-slate-950/50 hover:bg-slate-800 border border-slate-800/50 rounded-lg transition-all group flex items-center gap-4 active:scale-95">
                            <div className="p-3 bg-slate-900 rounded-full text-emerald-400 group-hover:scale-110 transition-transform">
                                <ArrowRightLeft size={20}/>
                            </div>
                            <span className="font-black text-white uppercase text-[11px] tracking-widest">Extrato</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
