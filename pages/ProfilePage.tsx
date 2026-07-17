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
} from 'lucide-react';

import type { AppTab, Loan, UserProfile, Client, CapitalSource } from '../types';
import { maskDocument, maskPhone } from '../utils/formatters';
import { SYSTEM_VERSION } from '../src/constants/version';

import { useProfilePageLogic } from '../features/profile/hooks/useProfilePageLogic';
import { ProfileAuditLog } from '../features/profile/components/ProfileAuditLog';
import { ProfileDangerZone } from '../features/profile/components/ProfileDangerZone';
import { MercadoPagoConfig } from '../features/profile/components/MercadoPagoConfig';
import { AsaasConfig } from '../features/profile/components/AsaasConfig';
import { InfinitePayConfig } from '../features/profile/components/InfinitePayConfig';
import { WhatsAppConfig } from '../features/profile/components/WhatsAppConfig';

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
  saveNavConfig: (nav: AppTab[], hub: AppTab[]) => void;
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
  handleExportBackup,
  profilePhotoInputRef,
  fileInputExcelRef,
  handleRestoreBackup,
  handleImportExcel,
  loans,
  navOrder,
  hubOrder,
  saveNavConfig,
  goBack,
}) => {
  const { backupRestoreRef, auditLogs } = useProfilePageLogic(loans);

  const [activeSection, setActiveSection] = useState<
    'GENERAL' | 'FINANCE' | 'PAYMENTS' | 'DATA' | 'INTERFACE' | 'SECURITY' | 'SYSTEM' | 'DANGER'
  >('GENERAL');

  const getTabLabel = (tab: AppTab) => {
    switch (tab) {
      case 'DASHBOARD':
        return 'Painel';
      case 'DOSSIER':
        return 'Dossiê';
      case 'CLIENTS':
        return 'Clientes';
      case 'SOURCES':
        return 'Fundos';
      case 'LEGAL':
        return 'Jurídico';
      case 'PROFILE':
        return 'Perfil';
      default:
        return tab;
    }
  };

  const moveTab = (
    tab: AppTab,
    from: 'NAV' | 'HUB',
    direction: 'UP' | 'DOWN' | 'SWAP'
  ) => {
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

    saveNavConfig(newNav, newHub);
  };

  if (!profileEditForm) return null;

  return (
    <div className="space-y-8 pb-20 max-w-[1600px] mx-auto animate-in fade-in">
      {/* HEADER PADRONIZADO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-900/20">
              <User size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">Meu <span className="text-blue-500">Perfil</span></h1>
              <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">Configurações e Preferências</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* SIDEBAR */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg relative overflow-hidden">
          <div className="flex flex-col items-center mb-6">
            <div
              className="relative group cursor-pointer"
              onClick={() => profilePhotoInputRef.current?.click()}
            >
              <div className="w-28 h-28 bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-900 shadow-2xl overflow-hidden">
                {profileEditForm.photo ? (
                  <img
                    src={profileEditForm.photo}
                    className="w-full h-full object-cover"
                    alt="Foto do perfil"
                  />
                ) : (
                  <User size={48} className="text-slate-500" />
                )}
              </div>
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="text-white" size={24} />
              </div>
            </div>

            <button
              onClick={() => profilePhotoInputRef.current?.click()}
              className="mt-2 text-[10px] font-bold text-blue-500 hover:text-blue-400 uppercase tracking-wider flex items-center gap-1"
            >
              <Camera size={12} /> Alterar Foto
            </button>

            <h2 className="text-xl font-black text-white mt-4">
              {profileEditForm.name}
            </h2>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">
              {profileEditForm.businessName || 'Operador'}
            </p>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveSection('GENERAL')}
              className={`w-full p-4 rounded-lg flex items-center gap-3 transition-all ${
                activeSection === 'GENERAL'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <User size={18} />{' '}
              <span className="font-bold text-xs uppercase">Dados do Perfil</span>
            </button>

            <button
              onClick={() => setActiveSection('FINANCE')}
              className={`w-full p-4 rounded-lg flex items-center gap-3 transition-all ${
                activeSection === 'FINANCE'
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <DollarSign size={18} />{' '}
              <span className="font-bold text-xs uppercase">
                Financeiro & Metas
              </span>
            </button>

            <button
              onClick={() => setActiveSection('PAYMENTS')}
              className={`w-full p-4 rounded-lg flex items-center gap-3 transition-all ${
                activeSection === 'PAYMENTS'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <PaymentIcon size={18} />{' '}
              <span className="font-bold text-xs uppercase">Pagamentos Real</span>
            </button>

            <button
              onClick={() => setActiveSection('INTERFACE')}
              className={`w-full p-4 rounded-lg flex items-center gap-3 transition-all ${
                activeSection === 'INTERFACE'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <LayoutGrid size={18} />{' '}
              <span className="font-bold text-xs uppercase">
                Interface & Menus
              </span>
            </button>

            <button
              onClick={() => setActiveSection('DATA')}
              className={`w-full p-4 rounded-lg flex items-center gap-3 transition-all ${
                activeSection === 'DATA'
                  ? 'bg-amber-600 text-white shadow-lg'
                  : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileSpreadsheet size={18} />{' '}
              <span className="font-bold text-xs uppercase">Dados & Backup</span>
            </button>

            <button
              onClick={() => setActiveSection('SECURITY')}
              className={`w-full p-4 rounded-lg flex items-center gap-3 transition-all ${
                activeSection === 'SECURITY'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Shield size={18} />{' '}
              <span className="font-bold text-xs uppercase">Segurança</span>
            </button>

            <button
              onClick={() => setActiveSection('SYSTEM')}
              className={`w-full p-4 rounded-lg flex items-center gap-3 transition-all ${
                activeSection === 'SYSTEM'
                  ? 'bg-slate-600 text-white shadow-lg'
                  : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <RefreshCw size={18} />{' '}
              <span className="font-bold text-xs uppercase">Sistema & Versão</span>
            </button>

            <button
              onClick={() => setActiveSection('DANGER')}
              className={`w-full p-4 rounded-lg flex items-center gap-3 transition-all ${
                activeSection === 'DANGER'
                  ? 'bg-rose-600 text-white shadow-lg'
                  : 'bg-slate-950 text-rose-500 hover:bg-rose-900/20'
              }`}
            >
              <AlertTriangle size={18} />{' '}
              <span className="font-bold text-xs uppercase">Zona de Perigo</span>
            </button>
          </nav>

          <button
            onClick={handleLogout}
            className="w-full mt-6 py-4 border border-rose-900/30 bg-rose-950/10 text-rose-500 rounded-lg font-bold uppercase text-xs hover:bg-rose-900/30 hover:text-rose-400 transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> Sair do Sistema
          </button>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-lg">
          {/* GENERAL */}
          {activeSection === 'GENERAL' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right">
              <div className="flex items-center gap-3 text-blue-500 mb-4">
                <User size={24} />
                <h3 className="text-lg font-black uppercase">
                  Informações Gerais
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                      Nome de Acesso (Username)
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1">
                      <Mail size={12} /> E-mail
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1">
                      <CreditCard size={12} /> Chave PIX Padrão (Manual)
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-emerald-400 font-bold outline-none focus:border-emerald-500"
                      placeholder="CPF, Email ou Telefone"
                    />
                    <p className="text-[9px] text-slate-500 mt-1 ml-1 uppercase font-bold tracking-widest leading-relaxed">
                      Apenas informativo para o cliente. Para <span className="text-blue-500">baixa automática</span>, configure a aba "Pagamentos Real".
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1">
                      <FileText size={12} /> CPF / CNPJ
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                      placeholder="000.000.000-00"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1">
                      <Phone size={12} /> WhatsApp de Contato
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-blue-500 uppercase ml-1 flex items-center gap-1">
                      <MessageCircle size={12} /> WhatsApp de Suporte (Mensagens)
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
                      className="w-full bg-slate-950 border border-blue-900/30 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                      placeholder="Número para envio de cobranças"
                    />
                    <p className="text-[9px] text-slate-500 mt-1 ml-1 uppercase font-bold tracking-widest">
                      Número utilizado para enviar mensagens aos clientes via WhatsApp.
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1">
                      <MapPin size={12} /> Endereço Base
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                      placeholder="Rua, Número, Bairro"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800">
                <h4 className="text-xs font-black text-white uppercase mb-4 flex items-center gap-2">
                  <Palette size={14} className="text-purple-500" /> Personalização
                </h4>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">
                      Logo URL (Opcional)
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-white"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FINANCE */}
          {activeSection === 'FINANCE' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right">
              <div className="flex items-center gap-3 text-emerald-500 mb-4">
                <DollarSign size={24} />
                <h3 className="text-lg font-black uppercase">
                  Configurações Financeiras
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
                    Juros Padrão (%)
                  </label>
                  <input
                    type="number"
                    value={profileEditForm.defaultInterestRate || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        defaultInterestRate: parseFloat(e.target.value),
                      })
                    }
                    className="w-full bg-transparent text-2xl font-black text-emerald-400 outline-none"
                  />
                </div>

                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
                    Multa Padrão (%)
                  </label>
                  <input
                    type="number"
                    value={profileEditForm.defaultFinePercent || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        defaultFinePercent: parseFloat(e.target.value),
                      })
                    }
                    className="w-full bg-transparent text-2xl font-black text-emerald-400 outline-none"
                  />
                </div>

                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
                    Mora Diária (%)
                  </label>
                  <input
                    type="number"
                    value={profileEditForm.defaultDailyInterestPercent || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        defaultDailyInterestPercent: parseFloat(e.target.value),
                      })
                    }
                    className="w-full bg-transparent text-2xl font-black text-emerald-400 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-2">
                    Meta de Capital (R$)
                  </label>
                  <input
                    type="number"
                    value={profileEditForm.targetCapital || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        targetCapital: parseFloat(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-2">
                    Meta de Lucro (R$)
                  </label>
                  <input
                    type="number"
                    value={profileEditForm.targetProfit || ''}
                    onChange={(e) =>
                      setProfileEditForm({
                        ...profileEditForm,
                        targetProfit: parseFloat(e.target.value),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-white font-bold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* DATA */}
          {activeSection === 'DATA' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right">
              <div className="flex items-center gap-3 text-amber-500 mb-4">
                <FileSpreadsheet size={24} />
                <h3 className="text-lg font-black uppercase">Dados e Backup</h3>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-lg flex items-center justify-between group hover:border-blue-500 transition-all">
                  <div>
                    <h4 className="text-white font-bold text-sm uppercase">
                      Exportar Backup Completo
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      Baixe um arquivo JSON com todos seus clientes e contratos.
                    </p>
                  </div>
                  <button
                    onClick={handleExportBackup}
                    className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 shadow-lg transition-all"
                  >
                    <Download size={20} />
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-5 rounded-lg flex items-center justify-between group hover:border-emerald-500 transition-all">
                  <div>
                    <h4 className="text-white font-bold text-sm uppercase">
                      Importar Planilha (Excel)
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      Carregue clientes em massa via arquivo .xlsx ou .csv.
                    </p>
                  </div>
                  <button
                    onClick={() => fileInputExcelRef.current?.click()}
                    className="p-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 shadow-lg transition-all"
                  >
                    <FileSpreadsheet size={20} />
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-5 rounded-lg flex items-center justify-between group hover:border-amber-500 transition-all">
                  <div>
                    <h4 className="text-white font-bold text-sm uppercase">
                      Restaurar do Backup
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      Recupere seus dados a partir de um arquivo JSON anterior.
                    </p>
                  </div>
                  <button
                    onClick={() => backupRestoreRef.current?.click()}
                    className="p-3 bg-amber-600 text-white rounded-lg hover:bg-amber-500 shadow-lg transition-all"
                  >
                    <RefreshCw size={20} />
                  </button>
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
            </div>
          )}

          {/* PAYMENTS */}
          {activeSection === 'PAYMENTS' && (
             <div className="animate-in fade-in slide-in-from-right space-y-12">
                <MercadoPagoConfig profileId={profileEditForm.id} showToast={showToast} />
                <div className="border-t border-slate-800 my-8"></div>
                <AsaasConfig profileId={profileEditForm.id} showToast={showToast} />
                <div className="border-t border-slate-800 my-8"></div>
                <InfinitePayConfig profileId={profileEditForm.id} showToast={showToast} />
                <div className="border-t border-slate-800 my-8"></div>
                <WhatsAppConfig profileId={profileEditForm.id} showToast={showToast} />
             </div>
          )}

          {/* INTERFACE */}
          {activeSection === 'INTERFACE' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right">
              <div className="flex items-center gap-3 text-purple-500 mb-4">
                <LayoutGrid size={24} />
                <h3 className="text-lg font-black uppercase">
                  Personalizar Menus
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-emerald-500 tracking-widest flex items-center gap-2">
                    <ArrowDown size={14} /> Barra Superior (Fixo)
                  </h4>

                  <div className="space-y-2">
                    {navOrder.filter(t => t !== 'AGENDA' && t !== 'TEAM' && t !== 'LEADS' && t !== 'ACQUISITION').map((tab) => (
                      <div
                        key={tab}
                        className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-center justify-between group"
                      >
                        <span className="text-xs font-bold text-white uppercase">
                          {getTabLabel(tab)}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => moveTab(tab, 'NAV', 'UP')}
                            className="p-1.5 hover:bg-slate-800 rounded"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            onClick={() => moveTab(tab, 'NAV', 'DOWN')}
                            className="p-1.5 hover:bg-slate-800 rounded"
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            onClick={() => moveTab(tab, 'NAV', 'SWAP')}
                            className="p-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded"
                            title="Mover para o Menu Lateral"
                          >
                            Menu
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-blue-500 tracking-widest flex items-center gap-2">
                    <LayoutGrid size={14} /> Menu Lateral
                  </h4>

                  <div className="space-y-2">
                    {hubOrder.filter(t => t !== 'AGENDA' && t !== 'TEAM' && t !== 'LEADS' && t !== 'ACQUISITION').map((tab) => (
                      <div
                        key={tab}
                        className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-center justify-between group"
                      >
                        <span className="text-xs font-bold text-white uppercase">
                          {getTabLabel(tab)}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => moveTab(tab, 'HUB', 'UP')}
                            className="p-1.5 hover:bg-slate-800 rounded"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            onClick={() => moveTab(tab, 'HUB', 'DOWN')}
                            className="p-1.5 hover:bg-slate-800 rounded"
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            onClick={() => moveTab(tab, 'HUB', 'SWAP')}
                            className="p-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded"
                            title="Mover para a Barra"
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

          {/* SECURITY */}
          {activeSection === 'SECURITY' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right">
              <div className="flex items-center gap-3 text-indigo-500 mb-4">
                <Shield size={24} />
                <h3 className="text-lg font-black uppercase">
                  Segurança e Auditoria
                </h3>
              </div>
              <ProfileAuditLog logs={auditLogs} />
            </div>
          )}

          {/* SYSTEM */}
          {activeSection === 'SYSTEM' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right">
              <div className="flex items-center gap-3 text-slate-400 mb-4">
                <RefreshCw size={24} />
                <h3 className="text-lg font-black uppercase">
                  Informações de Build e Versão
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-950 p-6 rounded-lg border border-slate-800 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Controle de Versão</h4>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-slate-900">
                            <span className="text-xs font-bold text-slate-400">Revisão</span>
                            <span className="text-xs font-black text-white px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg">{SYSTEM_VERSION.version}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-900">
                            <span className="text-xs font-bold text-slate-400">Build ID</span>
                            <span className="text-xs font-black text-white font-mono">{SYSTEM_VERSION.build}</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-xs font-bold text-slate-400">Ambiente</span>
                            <span className="text-xs font-black text-emerald-500 uppercase">{SYSTEM_VERSION.environment}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-950 p-6 rounded-lg border border-slate-800 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Motor Lógico</h4>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-slate-900">
                            <span className="text-xs font-bold text-slate-400">Versão do Motor</span>
                            <span className="text-xs font-black text-purple-400">{SYSTEM_VERSION.logicalMotor}</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-xs font-bold text-slate-400">Último Deploy Cloud</span>
                            <span className="text-xs font-black text-slate-300">
                                {new Date(SYSTEM_VERSION.lastDeploy).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                        </div>
                    </div>
                </div>
              </div>

              <div className="bg-blue-600/10 border border-blue-500/20 p-6 rounded-lg">
                 <div className="flex gap-4">
                    <div className="p-3 bg-blue-600/20 text-blue-400 rounded-lg h-fit">
                        <Shield size={20} />
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-1">Status de Sincronização</h4>
                        <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                            Se as informações acima não baterem com as mudanças que você solicitou, tente fazer um <span className="text-blue-500 font-bold">Hard Refresh (Ctrl + F5)</span>. Isso garante que o navegador descarte o cache antigo e puxe a versão mais recente do Cloud Run.
                        </p>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {/* DANGER */}
          {activeSection === 'DANGER' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right">
              <ProfileDangerZone
                onResetData={() => setResetDataModal(true)}
                onDeleteAccount={handleDeleteAccount}
              />
            </div>
          )}

          {/* SALVAR */}
          {activeSection !== 'PAYMENTS' && activeSection !== 'DANGER' && (
            <div className="pt-8 mt-8 border-t border-slate-800 sticky bottom-0 bg-slate-900 pb-2">
              <button
                onClick={handleSaveProfile}
                className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-black uppercase text-sm shadow-2xl shadow-blue-900/20 transition-all flex items-center justify-center gap-3"
              >
                <Save size={20} /> Salvar Alterações
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
};
