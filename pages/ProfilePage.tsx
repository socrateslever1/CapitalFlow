import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Palette,
  Phone,
  RefreshCw,
  Save,
  Shield,
  User,
  Download,
  ChevronLeft,
  CreditCard as PaymentIcon,
  Loader2,
} from 'lucide-react';

import type { AppTab, Loan, UserProfile, Client, CapitalSource } from '../types';
import { maskDocument, maskPhone } from '../utils/formatters';
import { SYSTEM_VERSION } from '../src/constants/version';
import { PageHeader } from '../components/ui/PageHeader';
import { exportLoansToExcel, exportLoansToCSV } from '../utils/loanExport';

import { useProfilePageLogic } from '../features/profile/hooks/useProfilePageLogic';
import { ProfileAuditLog } from '../features/profile/components/ProfileAuditLog';
import { ProfileDangerZone } from '../features/profile/components/ProfileDangerZone';
import { MercadoPagoConfig } from '../features/profile/components/MercadoPagoConfig';
import { AsaasConfig } from '../features/profile/components/AsaasConfig';
import { InfinitePayConfig } from '../features/profile/components/InfinitePayConfig';
import { WhatsAppConfig } from '../features/profile/components/WhatsAppConfig';
import { ProfileExportReports } from '../features/profile/components/ProfileExportReports';
import { LanguageSelector } from '../components/settings/LanguageSelector';
import { useI18n } from '../i18n/useI18n';

interface ProfilePageProps {
  activeUser: UserProfile;
  clients: Client[];
  loans: Loan[];
  sources: CapitalSource[];

  handleLogout: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  setDonateModal: (val: boolean) => void;
  setResetDataModal: (val: boolean) => void;
  handleDeleteAccount: () => void;
  profileEditForm: UserProfile | null;
  setProfileEditForm: (val: UserProfile) => void;
  handleSaveProfile: () => void;
  handlePhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRestoreBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportBackup: () => void;
  handleImportExcel: (e: React.ChangeEvent<HTMLInputElement>) => void;
  profilePhotoInputRef: React.RefObject<HTMLInputElement>;
  fileInputExcelRef: React.RefObject<HTMLInputElement>;
  navOrder: AppTab[];
  hubOrder: AppTab[];
  saveNavConfig: (nav: AppTab[], hub: AppTab[]) => Promise<void>;
  goBack?: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  handleLogout,
  showToast,
  setResetDataModal,
  handleDeleteAccount,
  profileEditForm,
  setProfileEditForm,
  handleSaveProfile,
  handlePhotoUpload,
  handleExportBackup,
  profilePhotoInputRef,
  fileInputExcelRef,
  handleRestoreBackup,
  handleImportExcel,
  loans,
  sources = [],
  navOrder,
  hubOrder,
  saveNavConfig,
  goBack,
}) => {
  const { backupRestoreRef, auditLogs } = useProfilePageLogic(loans);
  const i18n = useI18n();

  const [activeSection, setActiveSection] = useState<
    'GENERAL' | 'FINANCE' | 'PAYMENTS' | 'EXPORT' | 'DATA' | 'INTERFACE' | 'SECURITY' | 'SYSTEM' | 'DANGER'
  >('GENERAL');

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [menuSaving, setMenuSaving] = useState(false);

  const handleExport = async (format: 'EXCEL' | 'CSV') => {
    if (loans.length === 0) {
      showToast('Não há contratos para exportar.', 'info');
      return;
    }
    setIsExporting(true);
    try {
      if (format === 'EXCEL') {
        await exportLoansToExcel(loans, sources, 'Todos os Contratos');
        showToast('Relatório Excel (.xlsx) exportado com sucesso!', 'success');
      } else {
        exportLoansToCSV(loans, sources, 'Todos os Contratos');
        showToast('Arquivo CSV (.csv) exportado com sucesso!', 'success');
      }
      setIsExportOpen(false);
    } catch (err: any) {
      showToast(`Erro ao exportar: ${err?.message || 'Falha na geração'}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Mesmos nomes do menu superior, vindos do sistema de idiomas.
  const getTabLabel = (tab: AppTab) => i18n.tab(tab);

  const moveTab = async (
    tab: AppTab,
    from: 'NAV' | 'HUB',
    direction: 'UP' | 'DOWN' | 'SWAP'
  ): Promise<void> => {
    if (menuSaving) return;
    setMenuSaving(true);
    let newNav = [...navOrder];
    let newHub = [...hubOrder];

    if (direction === 'SWAP') {
      if (from === 'NAV' && newNav.length > 1) {
        newNav = newNav.filter((t) => t !== tab);
        newHub = [tab, ...newHub];
      } else if (from === 'HUB') {
        newHub = newHub.filter((t) => t !== tab);
        newNav = [...newNav, tab];
      }
    } else {
      const target = from === 'NAV' ? newNav : newHub;
      const idx = target.indexOf(tab);

      if (direction === 'UP' && idx > 0) {
        [target[idx], target[idx - 1]] = [target[idx - 1], target[idx]];
      }
      if (direction === 'DOWN' && idx < target.length - 1) {
        [target[idx], target[idx + 1]] = [target[idx + 1], target[idx]];
      }
    }

    try {
      await saveNavConfig(newNav, newHub);
      showToast('Ordem dos menus salva.', 'success');
    } catch {
      showToast('Ordem guardada neste navegador. Sincronização pendente.', 'warning');
    } finally {
      setMenuSaving(false);
    }
  };

  if (!profileEditForm) return null;

  return (
    <div className="space-y-5 pb-20 w-full max-w-[1500px] mx-auto animate-in fade-in">
      <input
        ref={profilePhotoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePhotoUpload}
        className="sr-only"
        aria-label="Selecionar foto do perfil"
      />
      <PageHeader
        icon={<User size={22} />}
        iconClassName="border-violet-500/30 bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-indigo-950/30"
        title={<>Meu <span className="text-blue-500">Perfil</span></>}
        subtitle="Configurações da conta, financeiro, pagamentos e segurança"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
      {/* SIDEBAR */}
      <div className="lg:col-span-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="relative group cursor-pointer shrink-0"
                onClick={() => profilePhotoInputRef.current?.click()}
              >
                <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 overflow-hidden">
                  {profileEditForm.photo ? (
                    <img
                      src={profileEditForm.photo}
                      className="w-full h-full object-cover"
                      alt="Foto do perfil"
                    />
                  ) : (
                    <User size={22} className="text-slate-500" />
                  )}
                </div>
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="text-white" size={14} />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-white truncate">
                  {profileEditForm.name}
                </h2>
                <p className="text-xs text-slate-400 truncate">
                  {profileEditForm.businessName || 'Operador'}
                </p>
                <button
                  onClick={() => profilePhotoInputRef.current?.click()}
                  className="mt-0.5 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
                >
                  <Camera size={11} /> Alterar foto
                </button>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="lg:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 hover:border-rose-900/40 transition-colors"
            >
              <LogOut size={14} /> Sair
            </button>
          </div>

          <nav className="grid grid-cols-2 gap-1.5 lg:flex lg:flex-col lg:gap-1">
            <button
              onClick={() => setActiveSection('GENERAL')}
              className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                activeSection === 'GENERAL'
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
              }`}
            >
              <User size={16} />
              <span>Dados do Perfil</span>
            </button>

            <button
              onClick={() => setActiveSection('FINANCE')}
              className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                activeSection === 'FINANCE'
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
              }`}
            >
              <DollarSign size={16} />
              <span>Financeiro & Metas</span>
            </button>

            <button
              onClick={() => setActiveSection('PAYMENTS')}
              className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                activeSection === 'PAYMENTS'
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
              }`}
            >
              <PaymentIcon size={16} />
              <span>Pagamentos Real</span>
            </button>

            <button
              onClick={() => setActiveSection('DATA')}
              className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                activeSection === 'DATA'
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
              }`}
            >
              <FileSpreadsheet size={16} />
              <span>Dados & Exportação</span>
            </button>

            <button
              onClick={() => setActiveSection('INTERFACE')}
              className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                activeSection === 'INTERFACE'
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
              }`}
            >
              <LayoutGrid size={16} />
              <span>Preferências & Menus</span>
            </button>

            <button
              onClick={() => setActiveSection('SECURITY')}
              className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                activeSection === 'SECURITY'
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
              }`}
            >
              <Shield size={16} />
              <span>Segurança & Conta</span>
            </button>
          </nav>

          <button
            onClick={handleLogout}
            className="hidden lg:flex w-full mt-5 py-2.5 border border-slate-800 bg-slate-950/60 text-rose-400 rounded-lg font-semibold text-xs hover:bg-rose-950/30 hover:border-rose-900/40 transition-colors items-center justify-center gap-2"
          >
            <LogOut size={16} /> Sair do Sistema
          </button>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="lg:col-span-9 space-y-6 lg:pr-14">
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-xl">
          {/* GENERAL */}
          {activeSection === 'GENERAL' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800/80">
                <User size={18} className="text-blue-400 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    Informações Gerais
                  </h3>
                  <p className="text-xs text-slate-400">Dados cadastrais, contato e identificação do negócio.</p>
                </div>
              </div>

              {/* Identificação & Acesso */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Identificação &amp; Acesso
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nome de acesso (usuário)
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.name || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        name: e.target.value,
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.fullName || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        fullName: e.target.value,
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Mail size={13} className="text-slate-400" /> E-mail
                  </label>
                  <input
                    type="email"
                    value={profileEditForm.email || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        email: e.target.value,
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <FileText size={13} className="text-slate-400" /> CPF / CNPJ
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.document || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        document: maskDocument(e.target.value),
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white font-medium tabular-nums outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                    placeholder="000.000.000-00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nome do Negócio
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.businessName || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        businessName: e.target.value,
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Palette size={13} className="text-slate-400" /> Logo URL (Opcional)
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.logoUrl || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        logoUrl: e.target.value,
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                    placeholder="https://..."
                  />
                </div>
                </div>
              </div>

              {/* Contato & Pagamento Manual */}
              <div className="pt-5 border-t border-slate-800/80 space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Contato &amp; Pagamento Manual
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Phone size={13} className="text-slate-400" /> WhatsApp de Contato
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.phone || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        phone: maskPhone(e.target.value),
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white font-medium tabular-nums outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-blue-400 mb-1.5 flex items-center gap-1.5">
                    <MessageCircle size={13} /> WhatsApp de Suporte (Mensagens)
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.contato_whatsapp || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        contato_whatsapp: maskPhone(e.target.value),
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-blue-900/50 rounded-lg px-3 text-sm text-white font-medium tabular-nums outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                    placeholder="Número para envio de cobranças"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Número utilizado para enviar mensagens aos clientes via WhatsApp.
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <CreditCard size={13} className="text-emerald-400" /> Chave PIX Padrão (Manual)
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.pixKey || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        pixKey: e.target.value,
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-emerald-400 font-medium outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                    placeholder="CPF, Email ou Telefone"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Apenas informativo para o cliente. Para <span className="text-blue-400 font-medium">baixa automática</span>, configure a aba &quot;Pagamentos Real&quot;.
                  </p>
                </div>
                </div>
              </div>

              {/* Localização */}
              <div className="pt-5 border-t border-slate-800/80 space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Localização
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <MapPin size={13} className="text-slate-400" /> Endereço Base
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.address || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        address: e.target.value,
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                    placeholder="Rua, Número, Bairro"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Cidade
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.city || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        city: e.target.value,
                      })
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Estado (UF)
                  </label>
                  <input
                    type="text"
                    value={profileEditForm.state || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        state: e.target.value.toUpperCase(),
                      })
                    }
                    maxLength={2}
                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm text-white font-medium text-center uppercase outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                  />
                </div>
                </div>
              </div>
            </div>
          )}

          {/* FINANCE */}
          {activeSection === 'FINANCE' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800/80">
                <DollarSign size={18} className="text-emerald-400 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    Configurações Financeiras
                  </h3>
                  <p className="text-xs text-slate-400">Taxas padrão e metas operacionais do perfil.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 focus-within:border-emerald-500/60 transition-colors">
                  <label className="text-xs font-semibold text-slate-300 block mb-2">
                    Juros Padrão (%)
                  </label>
                  <div className="flex items-baseline gap-1.5">
                    <input
                      type="number"
                      value={profileEditForm.defaultInterestRate || ''}
                      onChange={(e) =>
                        setProfileEditForm({
                          ...profileEditForm,
                          defaultInterestRate: parseFloat(e.target.value),
                        })
                      }
                      className="w-full bg-transparent text-xl font-bold tabular-nums text-emerald-400 outline-none"
                    />
                    <span className="text-sm font-semibold text-slate-500 shrink-0">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">Aplicado por padrão em novos contratos.</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 focus-within:border-emerald-500/60 transition-colors">
                  <label className="text-xs font-semibold text-slate-300 block mb-2">
                    Multa Padrão (%)
                  </label>
                  <div className="flex items-baseline gap-1.5">
                    <input
                      type="number"
                      value={profileEditForm.defaultFinePercent || ''}
                      onChange={(e) =>
                        setProfileEditForm({
                          ...profileEditForm,
                          defaultFinePercent: parseFloat(e.target.value),
                        })
                      }
                      className="w-full bg-transparent text-xl font-bold tabular-nums text-emerald-400 outline-none"
                    />
                    <span className="text-sm font-semibold text-slate-500 shrink-0">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">Cobrada após o vencimento.</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 focus-within:border-emerald-500/60 transition-colors">
                  <label className="text-xs font-semibold text-slate-300 block mb-2">
                    Mora Diária (%)
                  </label>
                  <div className="flex items-baseline gap-1.5">
                    <input
                      type="number"
                      value={profileEditForm.defaultDailyInterestPercent || ''}
                      onChange={(e) =>
                        setProfileEditForm({
                          ...profileEditForm,
                          defaultDailyInterestPercent: parseFloat(e.target.value),
                        })
                      }
                      className="w-full bg-transparent text-xl font-bold tabular-nums text-emerald-400 outline-none"
                    />
                    <span className="text-sm font-semibold text-slate-500 shrink-0">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">Encargo por dia de atraso.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-slate-800/80">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Meta de Capital (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                      R$
                    </span>
                    <input
                      type="number"
                      value={profileEditForm.targetCapital || ''}
                      onChange={(e) =>
                        setProfileEditForm({
                          ...profileEditForm,
                          targetCapital: parseFloat(e.target.value),
                        })
                      }
                      className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 text-sm text-white font-semibold tabular-nums outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Meta de Lucro (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                      R$
                    </span>
                    <input
                      type="number"
                      value={profileEditForm.targetProfit || ''}
                      onChange={(e) =>
                        setProfileEditForm({
                          ...profileEditForm,
                          targetProfit: parseFloat(e.target.value),
                        })
                      }
                      className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 text-sm text-white font-semibold tabular-nums outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DATA */}
          {activeSection === 'DATA' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800/80">
                <FileSpreadsheet size={18} className="text-amber-400 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white">Dados e Backup</h3>
                  <p className="text-xs text-slate-400">Exportação rápida, cópia de segurança e importação em massa.</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-emerald-950/15 border border-emerald-500/30 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-emerald-500/60 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <h4 className="text-white font-semibold text-sm">
                        Exportar Relatório Geral (Excel / CSV)
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Gera uma planilha detalhada com todos os {loans.length} contratos, status, parcelas e totais formatados.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleExport('EXCEL')}
                      disabled={isExporting || loans.length === 0}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      title="Baixar planilha Excel (.xlsx)"
                    >
                      {isExporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
                      <span>Excel (.xlsx)</span>
                    </button>
                    <button
                      onClick={() => handleExport('CSV')}
                      disabled={isExporting || loans.length === 0}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      title="Baixar arquivo de dados (.csv)"
                    >
                      {isExporting ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                      <span>CSV</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col justify-between gap-3 hover:border-blue-500/50 transition-colors">
                    <div>
                      <h4 className="text-white font-semibold text-sm">
                        Exportar Backup Completo
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Baixe um arquivo JSON com todos seus clientes e contratos.
                      </p>
                    </div>
                    <button
                      onClick={handleExportBackup}
                      className="w-full py-2 px-3 bg-blue-600/15 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Download size={15} />
                      <span>Exportar JSON</span>
                    </button>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col justify-between gap-3 hover:border-emerald-500/50 transition-colors">
                    <div>
                      <h4 className="text-white font-semibold text-sm">
                        Importar Planilha (Excel)
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Carregue clientes em massa via arquivo .xlsx ou .csv.
                      </p>
                    </div>
                    <button
                      onClick={() => fileInputExcelRef.current?.click()}
                      className="w-full py-2 px-3 bg-emerald-600/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet size={15} />
                      <span>Selecionar Planilha</span>
                    </button>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col justify-between gap-3 hover:border-amber-500/50 transition-colors">
                    <div>
                      <h4 className="text-white font-semibold text-sm">
                        Restaurar do Backup
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Recupere seus dados a partir de um arquivo JSON anterior.
                      </p>
                    </div>
                    <button
                      onClick={() => backupRestoreRef.current?.click()}
                      className="w-full py-2 px-3 bg-amber-600/15 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <RefreshCw size={15} />
                      <span>Restaurar JSON</span>
                    </button>
                  </div>
                </div>
              </div>

              <input
                type="file"
                ref={fileInputExcelRef}
                className="hidden"
                accept=".xlsx,.csv"
                onChange={handleImportExcel}
              />
              <input
                type="file"
                ref={backupRestoreRef}
                className="hidden"
                accept=".json"
                onChange={handleRestoreBackup}
              />

              <div className="pt-6 border-t border-slate-800/80">
                <ProfileExportReports
                  loans={loans}
                  sources={sources}
                  showToast={showToast}
                  onExportBackup={handleExportBackup}
                />
              </div>
            </div>
          )}

          {/* PAYMENTS */}
          {activeSection === 'PAYMENTS' && (
             <div className="space-y-10">
                <InfinitePayConfig profileId={profileEditForm.id} showToast={showToast} />
                <div className="border-t border-slate-800 my-8"></div>
                <WhatsAppConfig profileId={profileEditForm.id} showToast={showToast} />
             </div>
          )}

          {/* INTERFACE */}
          {activeSection === 'INTERFACE' && (
            <div className="space-y-6">
              <LanguageSelector onChanged={message => showToast(message, 'success')} />
              <div className="flex items-center gap-2.5 pt-2 pb-4 border-b border-slate-800/80">
                <LayoutGrid size={18} className="text-blue-400 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    Personalizar Menus
                  </h3>
                  <p className="text-xs text-slate-400">Organize quais abas aparecem na barra principal ou no menu lateral.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase text-emerald-400 tracking-wider flex items-center gap-2">
                    <ArrowDown size={13} /> Barra Superior (Fixo)
                  </h4>

                  <div className="space-y-2">
                    {navOrder.map((tab, idx) => (
                      <div
                        key={tab}
                        className="bg-slate-950 border border-slate-800 hover:border-slate-700 px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-semibold text-slate-500 tabular-nums w-4 shrink-0">
                            {idx + 1}.
                          </span>
                          <span className="text-xs font-semibold text-white truncate">
                            {getTabLabel(tab)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => void moveTab(tab, 'NAV', 'UP')}
                            disabled={menuSaving || idx === 0}
                            aria-label={`Mover ${getTabLabel(tab)} para cima`}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            onClick={() => void moveTab(tab, 'NAV', 'DOWN')}
                            disabled={menuSaving || idx === navOrder.length - 1}
                            aria-label={`Mover ${getTabLabel(tab)} para baixo`}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            onClick={() => void moveTab(tab, 'NAV', 'SWAP')}
                            disabled={menuSaving || navOrder.length <= 1}
                            className="px-2.5 py-1 bg-blue-600/15 text-blue-300 hover:bg-blue-600 hover:text-white border border-blue-500/20 rounded text-[11px] font-semibold transition-colors disabled:opacity-30 disabled:pointer-events-none"
                            title="Mover para o Menu Lateral"
                          >
                            Menu
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase text-blue-400 tracking-wider flex items-center gap-2">
                    <LayoutGrid size={13} /> Menu Lateral
                  </h4>

                  <div className="space-y-2">
                    {hubOrder.map((tab, idx) => (
                      <div
                        key={tab}
                        className="bg-slate-950 border border-slate-800 hover:border-slate-700 px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-semibold text-slate-500 tabular-nums w-4 shrink-0">
                            {idx + 1}.
                          </span>
                          <span className="text-xs font-semibold text-white truncate">
                            {getTabLabel(tab)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => void moveTab(tab, 'HUB', 'UP')}
                            disabled={menuSaving || idx === 0}
                            aria-label={`Mover ${getTabLabel(tab)} para cima`}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            onClick={() => void moveTab(tab, 'HUB', 'DOWN')}
                            disabled={menuSaving || idx === hubOrder.length - 1}
                            aria-label={`Mover ${getTabLabel(tab)} para baixo`}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            onClick={() => void moveTab(tab, 'HUB', 'SWAP')}
                            disabled={menuSaving}
                            className="px-2.5 py-1 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600 hover:text-white border border-emerald-500/20 rounded text-[11px] font-semibold transition-colors disabled:opacity-30 disabled:pointer-events-none"
                            title="Mover para a Barra Superior"
                          >
                            Barra
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECURITY & DANGER */}
          {activeSection === 'SECURITY' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800/80">
                <Shield size={18} className="text-blue-400 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    Segurança e Conta
                  </h3>
                  <p className="text-xs text-slate-400">Histórico de auditoria e ações críticas da conta.</p>
                </div>
              </div>
              <ProfileAuditLog logs={auditLogs} />
              <div className="pt-5 border-t border-slate-800/80">
                <ProfileDangerZone
                  onResetData={() => setResetDataModal(true)}
                  onDeleteAccount={handleDeleteAccount}
                />
              </div>
            </div>
          )}

          {/* SALVAR */}
          {(activeSection === 'GENERAL' || activeSection === 'FINANCE') && (
            <div className="pt-5 mt-5 border-t border-slate-800 flex justify-end">
              <button
                onClick={handleSaveProfile}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs tracking-wide shadow-lg shadow-blue-900/20 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save size={15} /> Salvar Alterações
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
};
