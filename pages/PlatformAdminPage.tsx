import React, { useEffect, useMemo, useState } from 'react';
import { AdminDiagnostics } from '../components/system/AdminDiagnostics';
import { localDiagnostics } from '../services/localDiagnostics';
import {
  Activity,
  ShieldCheck,
  Search,
  KeyRound,
  Ban,
  CheckCircle,
  Users,
  X,
  Lock,
} from 'lucide-react';
import { platformAdminService, PlatformProfileSummary } from '../services/platformAdmin.service';

type AdminTab = 'USERS' | 'DIAGNOSTICS';

const featureLabels = [
  { key: 'MULTI_SOURCE_FUNDING', label: 'Fontes múltiplas' },
];

export const PlatformAdminPage: React.FC = () => {
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('USERS');
  const [diagnosticsCount, setDiagnosticsCount] = useState(() => localDiagnostics.list().length);
  const [profiles, setProfiles] = useState<PlatformProfileSummary[]>([]);
  const [featureState, setFeatureState] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [busy, setBusy] = useState('');

  // Modal de troca de senha
  const [passwordModalProfile, setPasswordModalProfile] = useState<PlatformProfileSummary | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Confirmação interna de bloqueio/desbloqueio (sem window.confirm)
  const [blockConfirmProfile, setBlockConfirmProfile] = useState<PlatformProfileSummary | null>(null);

  useEffect(() => localDiagnostics.subscribe(() => setDiagnosticsCount(localDiagnostics.list().length)), []);

  const loadData = async () => {
    try {
      const [loadedProfiles, configuration] = await Promise.all([
        platformAdminService.listProfiles(),
        platformAdminService.listFeatureConfiguration(),
      ]);
      setProfiles(loadedProfiles);
      const resolved: Record<string, boolean> = {};
      for (const profile of loadedProfiles) {
        for (const feature of featureLabels) {
          const override = configuration.overrides.find(
            (item) => item.profile_id === profile.id && item.feature_key === feature.key
          );
          resolved[`${profile.id}:${feature.key}`] = override?.enabled ?? configuration.defaults[feature.key] ?? false;
        }
      }
      setFeatureState(resolved);
    } catch (reason: any) {
      setError(String(reason?.message || reason));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProfiles = useMemo(() => {
    if (!searchTerm.trim()) return profiles;
    const term = searchTerm.toLowerCase().trim();
    return profiles.filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const email = String(p.email || '').toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [profiles, searchTerm]);

  const activeUsersCount = useMemo(
    () => profiles.filter((p) => p.access_level !== 0).length,
    [profiles]
  );
  const blockedUsersCount = profiles.length - activeUsersCount;

  const toggleFeature = async (profileId: string, featureKey: string) => {
    const key = `${profileId}:${featureKey}`;
    setBusy(key);
    setError('');
    try {
      await platformAdminService.setFeature(profileId, featureKey, !featureState[key]);
      setFeatureState((current) => ({ ...current, [key]: !current[key] }));
    } catch (reason: any) {
      setError(String(reason?.message || reason));
    } finally {
      setBusy('');
    }
  };

  const confirmToggleBlock = async () => {
    if (!blockConfirmProfile) return;
    const profile = blockConfirmProfile;
    const isCurrentlyBlocked = profile.access_level === 0;
    const nextLevel = isCurrentlyBlocked ? 2 : 0;

    setBusy(`block:${profile.id}`);
    setError('');
    try {
      await platformAdminService.setUserAccessLevel(profile.id, nextLevel);
      setProfiles((prev) =>
        prev.map((item) => (item.id === profile.id ? { ...item, access_level: nextLevel } : item))
      );
      setBlockConfirmProfile(null);
      setSuccessMsg(`Conta ${isCurrentlyBlocked ? 'desbloqueada' : 'bloqueada'} com sucesso.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (reason: any) {
      setError(String(reason?.message || reason));
    } finally {
      setBusy('');
    }
  };

  const handleOpenPasswordModal = (profile: PlatformProfileSummary) => {
    setPasswordModalProfile(profile);
    setNewPassword('');
    setError('');
  };

  const handleConfirmPasswordChange = async () => {
    if (!passwordModalProfile || !passwordModalProfile.email) {
      setError('E-mail do operador não encontrado.');
      return;
    }
    if (newPassword.trim().length < 4) {
      setError('A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }

    setIsChangingPassword(true);
    setError('');
    try {
      await platformAdminService.resetUserPassword(passwordModalProfile.email, newPassword.trim());
      setSuccessMsg(`Senha de ${passwordModalProfile.name || passwordModalProfile.email} alterada com sucesso.`);
      setPasswordModalProfile(null);
      setNewPassword('');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (reason: any) {
      setError(String(reason?.message || reason));
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <section className="space-y-4">
      {/* Cabeçalho */}
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/20 p-2.5 text-amber-300">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-lg font-black text-white">Administração do Sistema</h1>
            <p className="text-xs text-slate-400">Usuários, acessos, recursos e diagnóstico da plataforma</p>
          </div>
        </div>

        {/* Navegação de seções do Admin */}
        <nav aria-label="Seções da administração" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveAdminTab('USERS')}
            aria-current={activeAdminTab === 'USERS' ? 'page' : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ${
              activeAdminTab === 'USERS'
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <Users size={15} aria-hidden="true" />
            <span>Usuários e Acessos</span>
            <span className="rounded-full bg-slate-950/80 px-2 py-0.5 text-[11px] tabular-nums text-slate-200">
              {profiles.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveAdminTab('DIAGNOSTICS')}
            aria-current={activeAdminTab === 'DIAGNOSTICS' ? 'page' : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ${
              activeAdminTab === 'DIAGNOSTICS'
                ? 'border-blue-500/40 bg-blue-500/15 text-blue-200'
                : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <Activity size={15} aria-hidden="true" />
            <span>Diagnóstico do Sistema</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${
                diagnosticsCount > 0
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {diagnosticsCount}
            </span>
          </button>
        </nav>
      </header>

      {/* Avisos */}
      {error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-rose-400 hover:text-white" aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-200">
          <CheckCircle size={16} className="text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ABA 1: USUÁRIOS E ACESSOS */}
      {activeAdminTab === 'USERS' && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
                aria-label="Buscar inscrição por nome ou e-mail"
                className="h-9 w-full rounded-lg border border-slate-800 bg-slate-950/90 pl-9 pr-3 text-xs font-bold text-white placeholder-slate-500 outline-none focus:border-amber-500/50 transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-2.5 py-1.5 text-emerald-300">
                <CheckCircle size={13} aria-hidden="true" />
                <strong className="tabular-nums">{activeUsersCount}</strong> ativos
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-950/20 px-2.5 py-1.5 text-rose-300">
                <Ban size={13} aria-hidden="true" />
                <strong className="tabular-nums">{blockedUsersCount}</strong> bloqueados
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="p-4">Conta / Inscrição</th>
                  <th className="p-4">E-mail</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Recursos</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => {
                  const isBlocked = profile.access_level === 0;
                  const isBlockBusy = busy === `block:${profile.id}`;

                  return (
                    <tr key={profile.id} className="border-b border-slate-800/70 align-top last:border-0 hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <span>{profile.name || 'Sem nome'}</span>
                          {profile.is_super_admin && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-300">
                              Master
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] font-normal text-slate-500">
                          Inscrito em {profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—'}
                        </div>
                      </td>

                      <td className="p-4 text-slate-300 text-xs">
                        {profile.email || '—'}
                      </td>

                      <td className="p-4">
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-950/60 border border-rose-500/30 px-2.5 py-1 text-[10px] font-black uppercase text-rose-400">
                            <Ban size={11} /> Bloqueado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-400">
                            <CheckCircle size={11} /> Ativo
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <div className="flex flex-wrap gap-1.5">
                          {featureLabels.map((feature) => {
                            const key = `${profile.id}:${feature.key}`;
                            const enabled = featureState[key] === true;
                            return (
                              <button
                                key={feature.key}
                                type="button"
                                disabled={busy === key}
                                onClick={() => toggleFeature(profile.id, feature.key)}
                                className={`rounded-lg px-2.5 py-1.5 text-[9px] font-black uppercase transition-colors ${
                                  enabled
                                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                              >
                                {feature.label}: {enabled ? 'sim' : 'não'}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenPasswordModal(profile)}
                            title="Redefinir Senha"
                            className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-950/20 px-2.5 py-1.5 text-[10px] font-black uppercase text-blue-300 hover:bg-blue-900/30 transition-colors"
                          >
                            <KeyRound size={12} />
                            <span>Senha</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBlockBusy}
                            onClick={() => setBlockConfirmProfile(profile)}
                            title={isBlocked ? 'Desbloquear Operador' : 'Bloquear Operador'}
                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase transition-colors ${
                              isBlocked
                                ? 'border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-900/30'
                                : 'border border-rose-500/30 bg-rose-950/20 text-rose-300 hover:bg-rose-900/30'
                            }`}
                          >
                            <Ban size={12} />
                            <span>{isBlocked ? 'Desbloquear' : 'Bloquear'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredProfiles.length === 0 && (
              <p className="p-6 text-center text-xs text-slate-500">Nenhuma inscrição encontrada.</p>
            )}
          </div>
        </div>
      )}

      {/* ABA 2: DIAGNÓSTICO DO SISTEMA */}
      {activeAdminTab === 'DIAGNOSTICS' && <AdminDiagnostics />}

      {/* Modal Interno de Confirmação de Bloqueio/Desbloqueio */}
      {blockConfirmProfile && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirmar alteração de acesso"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-400">
                <Ban size={20} />
                <h3 className="font-bold text-white text-base">
                  {blockConfirmProfile.access_level === 0 ? 'Desbloquear conta' : 'Bloquear conta'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBlockConfirmProfile(null)}
                className="text-slate-400 hover:text-white"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              Deseja realmente{' '}
              <strong>{blockConfirmProfile.access_level === 0 ? 'desbloquear' : 'bloquear'}</strong> a conta de{' '}
              <strong className="text-white">{blockConfirmProfile.name || blockConfirmProfile.email}</strong>?
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBlockConfirmProfile(null)}
                className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-bold uppercase text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy === `block:${blockConfirmProfile.id}`}
                onClick={() => void confirmToggleBlock()}
                className={`flex-1 rounded-xl py-2.5 text-xs font-black uppercase text-white disabled:opacity-50 transition-colors ${
                  blockConfirmProfile.access_level === 0
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {busy === `block:${blockConfirmProfile.id}`
                  ? 'Salvando...'
                  : blockConfirmProfile.access_level === 0
                    ? 'Confirmar desbloqueio'
                    : 'Confirmar bloqueio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Redefinição de Senha */}
      {passwordModalProfile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Redefinir Senha"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-amber-400">
                <Lock size={20} />
                <h3 className="font-bold text-white text-base">Redefinir Senha</h3>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalProfile(null)}
                className="text-slate-400 hover:text-white"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Defina uma nova senha de acesso para o operador{' '}
              <strong className="text-white">{passwordModalProfile.name || passwordModalProfile.email}</strong>.
            </p>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Nova Senha</label>
              <input
                type="text"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha (mínimo 4 caracteres)..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-sm font-bold text-white outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPasswordModalProfile(null)}
                className="flex-1 rounded-xl bg-slate-800 py-3 text-xs font-bold uppercase text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isChangingPassword || newPassword.trim().length < 4}
                onClick={handleConfirmPasswordChange}
                className="flex-[2] rounded-xl bg-amber-500 py-3 text-xs font-black uppercase text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {isChangingPassword ? 'Salvando...' : 'Confirmar Senha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default PlatformAdminPage;
