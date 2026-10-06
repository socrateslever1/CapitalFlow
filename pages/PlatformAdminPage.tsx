import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Search, KeyRound, Ban, CheckCircle, Users, X, Lock } from 'lucide-react';
import { platformAdminService, PlatformProfileSummary } from '../services/platformAdmin.service';

const featureLabels = [
  { key: 'MULTI_SOURCE_FUNDING', label: 'Fontes múltiplas' },
  { key: 'PERSONAL_WALLET', label: 'Carteira pessoal' },
];

export const PlatformAdminPage: React.FC = () => {
  const [profiles, setProfiles] = useState<PlatformProfileSummary[]>([]);
  const [featureState, setFeatureState] = useState<Record<string, boolean>>({});
  const [supportSession, setSupportSession] = useState<{ id: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [busy, setBusy] = useState('');

  // Modal de troca de senha
  const [passwordModalProfile, setPasswordModalProfile] = useState<PlatformProfileSummary | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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

  const handleToggleBlock = async (profile: PlatformProfileSummary) => {
    const isCurrentlyBlocked = profile.access_level === 0;
    const nextLevel = isCurrentlyBlocked ? 2 : 0;
    const actionLabel = isCurrentlyBlocked ? 'desbloquear' : 'bloquear';

    if (!window.confirm(`Deseja realmente ${actionLabel} a conta de "${profile.name || profile.email}"?`)) {
      return;
    }

    setBusy(`block:${profile.id}`);
    setError('');
    try {
      await platformAdminService.setUserAccessLevel(profile.id, nextLevel);
      setProfiles((prev) =>
        prev.map((item) => (item.id === profile.id ? { ...item, access_level: nextLevel } : item))
      );
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

  const startSupport = async (profileId: string) => {
    setBusy(`support:${profileId}`);
    setError('');
    try {
      setSupportSession({ id: await platformAdminService.startReadOnlySupport(profileId) });
    } catch (reason: any) {
      setError(String(reason?.message || reason));
    } finally {
      setBusy('');
    }
  };

  const endSupport = async () => {
    if (!supportSession) return;
    setBusy('support-end');
    setError('');
    try {
      await platformAdminService.endReadOnlySupport(supportSession.id);
      setSupportSession(null);
    } catch (reason: any) {
      setError(String(reason?.message || reason));
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="space-y-6">
      {/* Cabeçalho */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-500/20 p-3 text-amber-300">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Painel do Dono</h1>
            <p className="text-xs text-slate-500">Inscrições, acessos, senhas e bloqueios do sistema</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
            <Users size={15} className="text-amber-400" />
            <span className="font-bold">{profiles.length}</span>
            <span className="text-slate-500">inscrições</span>
          </div>
        </div>
      </header>

      {/* Avisos */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-rose-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-200">
          <CheckCircle size={16} className="text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {supportSession && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">
          <span>Modo de visualização somente leitura em andamento.</span>
          <button
            type="button"
            disabled={busy === 'support-end'}
            onClick={endSupport}
            className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-black uppercase text-slate-950 hover:bg-amber-400 transition-colors"
          >
            Encerrar
          </button>
        </div>
      )}

      {/* Barra de Busca de Inscrições */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar inscrição por nome ou e-mail..."
          className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-3 pl-10 pr-4 text-xs font-bold text-white placeholder-slate-500 outline-none focus:border-amber-500/50 transition-all"
        />
      </div>

      {/* Tabela de Inscrições / Usuários */}
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
                  {/* Conta / Data */}
                  <td className="p-4 font-bold text-white">
                    <div className="flex items-center gap-2">
                      <span>{profile.name || 'Sem nome'}</span>
                      {profile.access_level === 1 && (
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-300">
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] font-normal text-slate-500">
                      Inscrito em {profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—'}
                    </div>
                  </td>

                  {/* E-mail */}
                  <td className="p-4 text-slate-300 text-xs">
                    {profile.email || '—'}
                  </td>

                  {/* Status / Nível */}
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

                  {/* Recursos */}
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

                  {/* Ações */}
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Troca de Senha */}
                      <button
                        type="button"
                        onClick={() => handleOpenPasswordModal(profile)}
                        title="Redefinir Senha"
                        className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-950/20 px-2.5 py-1.5 text-[10px] font-black uppercase text-blue-300 hover:bg-blue-900/30 transition-colors"
                      >
                        <KeyRound size={12} />
                        <span>Senha</span>
                      </button>

                      {/* Bloqueio / Desbloqueio */}
                      <button
                        type="button"
                        disabled={isBlockBusy}
                        onClick={() => handleToggleBlock(profile)}
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

                      {/* Suporte Somente Leitura */}
                      <button
                        type="button"
                        disabled={Boolean(supportSession) || busy === `support:${profile.id}`}
                        onClick={() => startSupport(profile.id)}
                        className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-300 hover:bg-slate-700 transition-colors"
                      >
                        Visualizar
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

      {/* Modal de Redefinição de Senha */}
      {passwordModalProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
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
