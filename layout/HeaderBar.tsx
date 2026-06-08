import React, { useRef, useState, useEffect } from 'react';
import {
  TrendingUp,
  Plus,
  Loader2,
  Eye,
  EyeOff,
  Users,
  LayoutDashboard,
  Wallet,
  Briefcase,
  Calendar,
  Calculator,
  ArrowRightLeft,
  Megaphone,
  User,
  Menu,
  Gavel,
  Bell,
  X,
  Trash2,
} from 'lucide-react';
import { UserProfile } from '../types';
import { Tooltip } from '../components/ui/Tooltip';
import { InAppNotification } from '../hooks/useAppNotifications';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { resolveNotificationTarget } from '../utils/notificationRouting';

interface HeaderBarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  activeUser: UserProfile | null;
  isLoadingData: boolean;
  onOpenNav: () => void;
  onNewLoan: () => void;
  isStealthMode: boolean;
  toggleStealthMode: () => void;
  navOrder: string[];
  notifications?: InAppNotification[];
  removeNotification?: (id: string) => void;
  onNavigate?: (path: string) => void;
  onOpenSupport?: () => void;
  addNotification?: (notif: Omit<InAppNotification, 'id' | 'createdAt'>) => void;
}

interface NotificationItemProps {
  notif: InAppNotification;
  onOpen: (notif: InAppNotification) => void;
  onRemove?: (id: string) => void;
  getNotificationColor: (type: string) => string;
  getNotificationBg: (type: string) => string;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notif,
  onOpen,
  onRemove,
  getNotificationColor,
  getNotificationBg,
}) => {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-120, -60, 0], [1, 0.5, 0]);
  const deleteScale = useTransform(x, [-120, -60, 0], [1, 0.9, 0.8]);
  const isDraggingRef = useRef(false);
  const toneDotClass =
    notif.type === 'error'
      ? 'bg-rose-400'
      : notif.type === 'warning'
        ? 'bg-amber-400'
        : notif.type === 'success'
          ? 'bg-emerald-400'
          : 'bg-blue-400';

  return (
    <div className="relative overflow-hidden rounded-lg">
      <motion.div
        style={{ opacity: deleteOpacity, scale: deleteScale }}
        className="absolute inset-y-0 right-0 w-20 flex flex-col items-center justify-center rounded-lg bg-rose-500/12 border border-rose-500/20"
      >
        <Trash2 size={16} className="text-rose-400" />
        <span className="mt-1 text-[8px] font-black uppercase tracking-[0.18em] text-rose-400">
          Apagar
        </span>
      </motion.div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -120, right: 0 }}
        dragElastic={0.08}
        style={{ x }}
        onDragStart={() => {
          isDraggingRef.current = true;
        }}
        onDragEnd={(_, info) => {
          const shouldRemove = info.offset.x <= -95 || info.velocity.x <= -500;
          if (shouldRemove) {
            onRemove?.(notif.id);
          }
          setTimeout(() => {
            isDraggingRef.current = false;
          }, 50);
        }}
        whileDrag={{ scale: 0.985, cursor: 'grabbing' }}
        onClick={() => {
          if (!isDraggingRef.current) {
            onOpen(notif);
          }
        }}
        className="relative cursor-pointer rounded-lg border border-white/[0.06] bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(8,15,30,0.98))] px-3.5 py-3 shadow-[0_16px_32px_-24px_rgba(0,0,0,0.9)]"
      >
        <div className="pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-full bg-white/10" />
        <div className="flex gap-3 items-start">
          <div
            className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border border-white/5 shadow-inner ${getNotificationBg(
              notif.type
            )}`}
          >
            <Bell size={15} className={getNotificationColor(notif.type)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] sm:text-[13px] font-black text-white tracking-tight leading-tight">
                  {notif.title}
                </p>
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1 leading-relaxed break-words">
                  {notif.message}
                </p>
              </div>
              <span className="rounded-full border border-white/5 bg-slate-950/70 px-2 py-0.5 text-[9px] text-slate-500 font-bold whitespace-nowrap">
                {new Date(notif.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full ${toneDotClass}`} />
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                  {notif.isPersistent ? 'Pendente' : 'Novo'}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.(notif.id);
                }}
                className="h-7 w-7 rounded-full border border-white/5 bg-slate-950/70 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:border-rose-500/20 transition-colors"
                aria-label="Remover notificacao"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const HeaderBar: React.FC<HeaderBarProps> = ({
  activeTab,
  setActiveTab,
  activeUser,
  isLoadingData,
  onOpenNav,
  onNewLoan,
  isStealthMode,
  toggleStealthMode,
  navOrder,
  notifications = [],
  removeNotification,
  onNavigate,
  onOpenSupport,
}) => {
  const scrollRef = useRef<HTMLElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const mobileNotificationRef = useRef<HTMLDivElement>(null);
  const desktopNotificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isMobileClickOutside =
        mobileNotificationRef.current && !mobileNotificationRef.current.contains(event.target as Node);
      const isDesktopClickOutside =
        desktopNotificationRef.current && !desktopNotificationRef.current.contains(event.target as Node);

      if (isMobileClickOutside && isDesktopClickOutside) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const handleNotificationClick = (notif: InAppNotification) => {
    const target = resolveNotificationTarget(notif);
    if (onNavigate) {
      onNavigate(target);
    }
    removeNotification?.(notif.id);
    setShowNotifications(false);
  };

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
    const walk = (x - startX) * 2;
    if (Math.abs(walk) > 10) {
      setHasDragged(true);
    }
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case 'DASHBOARD':
        return <LayoutDashboard size={14} className="text-blue-500" />;
      case 'CLIENTS':
        return <Users size={14} className="text-indigo-500" />;
      case 'TEAM':
        return <Briefcase size={14} className="text-amber-500" />;
      case 'SOURCES':
        return <Wallet size={14} className="text-emerald-500" />;
      case 'AGENDA':
        return <Calendar size={14} className="text-purple-500" />;
      case 'SIMULATOR':
        return <Calculator size={14} className="text-blue-400" />;
      case 'FLOW':
        return <ArrowRightLeft size={14} className="text-teal-500" />;
      case 'ACQUISITION':
        return <Megaphone size={14} className="text-orange-400" />;
      case 'LEGAL':
        return <Gavel size={14} className="text-yellow-400" />;
      case 'PROFILE':
        return <User size={14} className="text-blue-400" />;
      case 'HUB':
        return <Menu size={14} className="text-slate-400" />;
      default:
        return null;
    }
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'DASHBOARD':
        return 'Painel';
      case 'CLIENTS':
        return 'Clientes';
      case 'TEAM':
        return 'Equipe';
      case 'SOURCES':
        return 'Capital';
      case 'AGENDA':
        return 'Agenda';
      case 'SIMULATOR':
        return 'Simulador';
      case 'FLOW':
        return 'Extrato';
      case 'ACQUISITION':
        return 'Captação';
      case 'LEGAL':
        return 'Jurídico';
      case 'PROFILE':
        return 'Perfil';
      case 'HUB':
        return 'Menu';
      default:
        return tab;
    }
  };

  const primaryColor = activeUser?.brandColor || '#2563eb';

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-emerald-400';
      case 'warning':
        return 'text-amber-400';
      case 'error':
        return 'text-rose-400';
      case 'info':
        return 'text-blue-400';
      default:
        return 'text-white';
    }
  };

  const getNotificationBg = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-500/10';
      case 'warning':
        return 'bg-amber-500/10';
      case 'error':
        return 'bg-rose-500/10';
      case 'info':
        return 'bg-blue-500/10';
      default:
        return 'bg-slate-800/50';
    }
  };

  const renderNotificationList = (isMobile = false) => (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className={`absolute ${isMobile ? 'fixed inset-x-3 top-20' : 'top-full right-0 mt-3 w-[22rem]'} max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-6rem)] sm:max-h-[28rem] flex flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-950/96 backdrop-blur-2xl z-[1100] ring-1 ring-white/10`}
      style={{
        boxShadow: `0 28px 80px -26px ${primaryColor}30, 0 28px 90px -28px rgba(0,0,0,0.82)`,
      }}
    >
      <div
        className="relative shrink-0 overflow-hidden border-b border-white/5 px-4 py-3.5"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}22 0%, rgba(15,23,42,0.96) 46%, rgba(2,6,23,0.98) 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full blur-3xl"
          style={{ backgroundColor: `${primaryColor}22` }}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 shadow-inner"
                style={{ backgroundColor: `${primaryColor}18` }}
              >
                <Bell size={15} style={{ color: primaryColor }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-[13px] font-black uppercase tracking-[0.16em] text-white">
                  Central de Alertas
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-400 font-bold tracking-[0.08em]">
                  Painel rapido do que precisa da sua atencao
                </p>
              </div>
            </div>
            <p className="mt-3 text-[9px] text-slate-500 font-black uppercase tracking-[0.18em]">
              {notifications.length === 0
                ? 'Sem alertas pendentes'
                : `${notifications.length} alerta${notifications.length > 1 ? 's' : ''} carregado${notifications.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <span
                className="rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
                style={{
                  color: primaryColor,
                  backgroundColor: `${primaryColor}14`,
                  borderColor: `${primaryColor}33`,
                }}
              >
                {notifications.length}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowNotifications(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/5 bg-slate-900/60 text-slate-500 hover:text-white transition-all hover:rotate-90"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 custom-scrollbar">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-white/5 bg-slate-900/80 shadow-inner">
              <Bell size={20} className="text-slate-600" />
            </div>
            <p className="text-sm text-slate-200 font-black tracking-tight">Tudo em dia</p>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              Quando algo novo chegar, ele entra em fila aqui sem inflar o painel.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notif={notif}
                onOpen={handleNotificationClick}
                onRemove={removeNotification}
                getNotificationColor={getNotificationColor}
                getNotificationBg={getNotificationBg}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/5 bg-slate-900/72 px-4 py-2.5">
        <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.18em] text-center">
          Deslize para a esquerda para remover
        </p>
      </div>
    </motion.div>
  );

  return (
    <header id="app-header" className="sticky top-0 z-[1000] bg-slate-950/90 backdrop-blur-md border-b border-slate-800 pt-safe">
      <div id="header-container" className="max-w-[1920px] mx-auto px-2 sm:px-6 min-h-[4rem] sm:min-h-[5rem] py-2 sm:py-3 flex flex-wrap items-center justify-between gap-y-2 sm:gap-y-3">
        <div id="header-main-row" className="flex flex-wrap items-center justify-between w-full gap-2 sm:gap-6">
          <div id="header-left-section" className="flex items-center gap-3 sm:gap-6 order-1">
            <div id="menu-button-container" className="hidden md:flex items-center">
              <button
                id="btn-open-nav"
                onClick={onOpenNav}
                className="h-11 w-11 flex items-center justify-center bg-slate-900 hover:bg-blue-600 text-slate-400 hover:text-white rounded-lg transition-all shadow-lg group"
              >
                <Menu size={22} className="group-hover:scale-110 transition-transform" />
              </button>
            </div>

            <div
              id="brand-container"
              className="flex items-center gap-1.5 sm:gap-2 cursor-pointer group"
              onClick={() => setActiveTab('DASHBOARD')}
            >
              <div
                id="logo-wrapper"
                className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-lg flex items-center justify-center shadow-lg transition-transform flex-shrink-0 group-hover:scale-110"
                style={{ backgroundColor: primaryColor }}
              >
                {activeUser?.logoUrl ? (
                  <img
                    src={activeUser.logoUrl}
                    className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <TrendingUp className="text-white w-4 h-4 sm:w-6 sm:h-6" />
                )}
              </div>
              <div id="title-wrapper">
                <h1 id="app-title" className="text-sm sm:text-2xl font-black tracking-tighter uppercase leading-none text-white">
                  Capital<span style={{ color: primaryColor }}>Flow</span>
                </h1>
                <p id="user-greeting" className="text-[8px] sm:text-xs text-emerald-500 animate-pulse font-extrabold uppercase tracking-widest mt-0.5">
                  Olá, {activeUser?.name?.split(' ')[0] || 'Gestor'}
                </p>
              </div>
            </div>

            <div id="header-left-divider-group" className="hidden md:flex items-center gap-4">
              <div id="header-divider" className="h-8 w-px bg-slate-800" />

              <button
                id="btn-profile-desktop"
                onClick={() => setActiveTab('PROFILE')}
                className="flex items-center gap-3 bg-slate-900/50 hover:bg-slate-800/80 p-2 pr-4 rounded-lg border border-slate-800/50 transition-all hover:border-slate-700 group"
              >
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-700 group-hover:border-blue-500/50 transition-colors">
                  {activeUser?.photo ? (
                    <img src={activeUser.photo} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center text-xs font-bold">
                      {activeUser?.name?.[0]}
                    </div>
                  )}
                </div>
                <div className="text-xs text-left">
                  <p className="text-white font-bold group-hover:text-blue-400 transition-colors">
                    {activeUser?.name?.split(' ')[0]}
                  </p>
                  <p className="text-[9px] text-slate-500 uppercase font-black">
                    @{activeUser?.email?.split('@')[0]}
                  </p>
                </div>
              </button>

              <button
                id="btn-stealth-desktop"
                onClick={toggleStealthMode}
                className={`p-3 rounded-lg transition-all shadow-lg group ${
                  isStealthMode
                    ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-indigo-500/20'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                }`}
                title="Modo Privacidade"
              >
                {isStealthMode ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>

              <div className="relative" ref={desktopNotificationRef}>
                <button
                  id="btn-notifications-desktop"
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`p-3 rounded-lg transition-all shadow-lg group relative ${
                    showNotifications
                      ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-blue-500/20'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <Bell size={20} className={notifications.length > 0 ? 'animate-bell' : ''} />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full ring-4 ring-slate-950">
                      {notifications.length}
                    </span>
                  )}
                </button>

                <AnimatePresence>{showNotifications && renderNotificationList(false)}</AnimatePresence>
              </div>

              {isLoadingData && <Loader2 id="loader-icon" className="animate-spin text-blue-500" />}
            </div>
          </div>

          <nav
            ref={scrollRef}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerMove={handlePointerMove}
            className={`hidden md:flex w-full xl:w-auto xl:flex-1 order-3 xl:order-2 bg-slate-900/50 backdrop-blur-md p-1.5 rounded-lg border border-slate-800/50 gap-1 overflow-x-auto scrollbar-hide xl:mx-4 mt-3 xl:mt-0 ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {(navOrder || [])
              .filter((tab) => tab !== 'PERSONAL_FINANCE' && tab !== 'AGENDA' && tab !== 'TEAM' && tab !== 'LEADS' && tab !== 'ACQUISITION')
              .map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      if (!hasDragged) setActiveTab(tab);
                    }}
                    className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${
                      isActive
                        ? 'text-white shadow-xl shadow-blue-500/20'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    }`}
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`
                        : 'transparent',
                    }}
                  >
                    {getTabIcon(tab)} <span>{getTabLabel(tab)}</span>
                  </button>
                );
              })}
          </nav>

          <div id="header-right-section" className="flex items-center gap-1.5 sm:gap-3 order-2 xl:order-3">
            <div id="mobile-actions" className="flex items-center gap-1.5 sm:gap-2 md:hidden">
              <div className="relative" ref={mobileNotificationRef}>
                <button
                  id="btn-notifications-mobile"
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-lg flex items-center justify-center border transition-all relative ${
                    showNotifications
                      ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <Bell size={16} className={notifications.length > 0 ? 'animate-bell' : ''} />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[7px] sm:text-[8px] font-black w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center rounded-full ring-2 ring-slate-950">
                      {notifications.length}
                    </span>
                  )}
                </button>
                <AnimatePresence>{showNotifications && renderNotificationList(true)}</AnimatePresence>
              </div>

              <button
                id="btn-stealth-mobile"
                onClick={toggleStealthMode}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-lg flex items-center justify-center border transition-all ${
                  isStealthMode
                    ? 'bg-gradient-to-br from-indigo-600 to-violet-700 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                {isStealthMode ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>

              <button
                id="btn-profile-mobile"
                onClick={() => setActiveTab('PROFILE')}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center"
              >
                {activeUser?.photo ? (
                  <img src={activeUser.photo} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-white font-bold text-xs">{activeUser?.name?.[0]}</span>
                )}
              </button>
            </div>

            <div id="new-contract-container" className="hidden xl:flex items-center">
              <Tooltip content="Adicionar novo registro" position="bottom">
                <button
                  id="btn-new-contract"
                  onClick={onNewLoan}
                  className="h-11 rounded-lg text-white px-4 py-2.5 font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 whitespace-nowrap hover:brightness-110 shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
                    boxShadow: `0 10px 20px -5px ${primaryColor}66`,
                  }}
                >
                  <Plus className="w-4 h-4" />
                  <span className="inline">Novo Contrato</span>
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
