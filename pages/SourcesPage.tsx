import React, { useCallback, useEffect, useState, useRef } from "react";
import PixDepositModal from "../components/modals/PixDepositModal";
import { CapitalSource, Loan } from "../types";
import { Plus, Wallet, Upload, Image as ImageIcon, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, modalPrimaryActionClass } from '../components/ui/Modal';
import { SourceCard } from '../components/cards/SourceCard';
import { filesService } from '../services/files.service';
import { resolveAuthenticatedStorageUrl } from '../utils/storageUrl';
import { normalizeWalletImageReference } from '../utils/imageUrl';
import { resolveBankLogo } from '../utils/bankLogoRegistry';
import { PageHeader } from '../components/ui/PageHeader';
import { SourceWalletReferencePanel } from '../components/sources/SourceWalletReferencePanel';
import { FinancialCalculatorInput } from '../components/forms/FinancialCalculatorInput';
import { supabase } from '../lib/supabase';
import { personalWalletService, type PersonalWalletAccount } from '../services/personalWallet.service';
import { platformAdminService } from '../services/platformAdmin.service';
import { CapitalSourceTransferModal } from '../features/wallet/components/CapitalSourceTransferModal';
import { canMoveCapitalSource, getMovableCapitalTotal } from '../features/wallet/domain/capitalSourceTransfer';
import { formatMoney } from '../utils/formatters';
import { buildSourceReferenceDisplay, type SourceReferenceDisplay } from '../domain/sources/sourceReferenceDisplay';
import type { WalletReference } from '../domain/sources/sourceWalletReference';

interface SourcesPageProps {
  sources: CapitalSource[];
  loans: Loan[];
  openConfirmation: (config: any) => void;
  handleUpdateSourceBalance: () => void | Promise<void>;
  isStealthMode?: boolean;
  ui: any;
  onOpenPixDeposit: (source: CapitalSource) => void;
  goBack?: () => void;
  activeUser?: any;
}

export const SourcesPage: React.FC<SourcesPageProps> = ({
  sources,
  loans,
  openConfirmation,
  handleUpdateSourceBalance,
  isStealthMode,
  ui,
  onOpenPixDeposit,
  activeUser
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoUrlError, setLogoUrlError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const saveOriginsRef = useRef<(() => Promise<boolean>) | null>(null);
  const [sourceReferences, setSourceReferences] = useState<Record<string, SourceReferenceDisplay>>({});
  const [sourceReferenceError, setSourceReferenceError] = useState(false);
  const [canTransferCapital, setCanTransferCapital] = useState(false);
  const [transferAccounts, setTransferAccounts] = useState<PersonalWalletAccount[] | null>(null);
  const [transferSource, setTransferSource] = useState<CapitalSource | null>(null);
  const [balanceOverrides, setBalanceOverrides] = useState<Record<string, number>>({});
  const displayedSources = sources.map(source => ({
    ...source, balance: balanceOverrides[source.id] ?? source.balance,
  }));
  const transferableCapital = transferAccounts
    ? getMovableCapitalTotal(displayedSources, transferAccounts) : null;

  useEffect(() => {
    let active = true;
    setCanTransferCapital(false);
    setTransferAccounts(null);
    if (activeUser?.id && activeUser.id !== 'DEMO' && !activeUser?.supervisor_id) {
      void platformAdminService.isSuperAdmin().then(async allowed => {
        if (!allowed || !active) return;
        const snapshot = await personalWalletService.loadOverview();
        if (!active) return;
        setCanTransferCapital(true);
        setTransferAccounts(snapshot.accounts);
      }).catch(() => {
        if (active) { setCanTransferCapital(false); setTransferAccounts(null); }
      });
    }
    return () => { active = false; };
  }, [activeUser?.id, activeUser?.supervisor_id]);

  useEffect(() => { setBalanceOverrides({}); }, [sources]);

  const refreshTransferBalances = async () => {
    const visibleIds = sources.map(source => source.id);
    if (visibleIds.length) {
      const result = await supabase.from('fontes').select('id,balance').in('id', visibleIds);
      if (result.error) throw result.error;
      setBalanceOverrides(Object.fromEntries((result.data || []).map(row => [row.id, Number(row.balance)])));
    }
    const snapshot = await personalWalletService.loadOverview();
    setTransferAccounts(snapshot.accounts);
  };
  const walletOwnerId: string = activeUser?.id || '';
  const isPrimaryOwner = walletOwnerId !== '' && walletOwnerId !== 'DEMO' && !activeUser?.supervisor_id;

  const refreshSourceReferences = useCallback(async (isActive: () => boolean) => {
    if (!isPrimaryOwner) {
      if (isActive()) { setSourceReferences({}); setSourceReferenceError(false); }
      return;
    }
    try {
      const permission = await supabase.rpc('can_manage_capital_source_wallet_origins');
      if (permission.error) throw permission.error;
      if (permission.data !== true) {
        if (isActive()) { setSourceReferences({}); setSourceReferenceError(false); }
        return;
      }
      const [wallet, rows] = await Promise.all([
        personalWalletService.loadOverview(),
        supabase.from('capital_source_wallet_references')
          .select('source_id,target_kind,target_id,allocated_amount'),
      ]);
      if (rows.error) throw rows.error;
      const refs = (rows.data || []) as WalletReference[];
      const next: Record<string, SourceReferenceDisplay> = {};
      for (const ref of refs) {
        const sourceRefs = refs.filter(item => item.source_id === ref.source_id);
        if (next[ref.source_id]) continue;
        const display = buildSourceReferenceDisplay(sourceRefs, wallet.accounts, wallet.cards);
        if (display) next[ref.source_id] = display;
      }
      if (isActive()) { setSourceReferences(next); setSourceReferenceError(false); }
    } catch {
      if (isActive()) {
        setSourceReferenceError(true);
      }
    }
  }, [isPrimaryOwner, walletOwnerId]);

  useEffect(() => {
    let active = true;
    const refresh = () => { void refreshSourceReferences(() => active); };
    refresh();
    window.addEventListener('capitalflow:source-origins-updated', refresh);
    window.addEventListener('capitalflow:wallet-updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('capitalflow:source-origins-updated', refresh);
      window.removeEventListener('capitalflow:wallet-updated', refresh);
    };
  }, [refreshSourceReferences]);

  useEffect(() => {
    let cancelled = false;
    const rawLogo = ui.editingSource?.logo_url as string | undefined;
    setLogoUrlInput(rawLogo?.startsWith('http') ? rawLogo : '');
    setLogoUrlError('');

    if (!rawLogo) {
      setLogoPreviewUrl(null);
      return () => { cancelled = true; };
    }

    resolveAuthenticatedStorageUrl(rawLogo)
      .then((url) => {
        if (!cancelled) setLogoPreviewUrl(url);
      })
      .catch((error) => {
        console.warn('[source-logo] Falha ao resolver preview:', error);
        if (!cancelled) setLogoPreviewUrl(null);
      });

    return () => { cancelled = true; };
  }, [ui.editingSource?.id, ui.editingSource?.logo_url]);

  const handleAddFunds = (source: CapitalSource) => {
    onOpenPixDeposit(source);
  };

  const handleEditSource = (source: CapitalSource) => {
    ui.setEditingSource(source);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUser || !ui.editingSource) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem válida.');
      e.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2 MB.');
      e.target.value = '';
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setLogoPreviewUrl(localPreview);
    setLogoLoading(true);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${activeUser.id}/source_logos/${ui.editingSource.id}/${Date.now()}_${safeName}`;
      const storageReference = await filesService.uploadFile(file, path);

      if (!storageReference) throw new Error('Falha ao armazenar a imagem.');

      ui.setEditingSource({
        ...ui.editingSource,
        logo_url: storageReference
      });

      const signedPreview = await resolveAuthenticatedStorageUrl(storageReference);
      setLogoPreviewUrl(signedPreview || localPreview);
    } catch (error) {
      console.error('[source-logo] Erro no upload:', error);
      toast.error('Não foi possível carregar a imagem da carteira.');
    } finally {
      setLogoLoading(false);
      URL.revokeObjectURL(localPreview);
      e.target.value = '';
    }
  };

  const removeLogo = () => {
    setLogoPreviewUrl(null);
    setLogoUrlInput('');
    setLogoUrlError('');
    ui.setEditingSource({ ...ui.editingSource, logo_url: '' });
  };

  const applyLogoUrl = () => {
    const normalized = normalizeWalletImageReference(logoUrlInput);
    if (!normalized) {
      setLogoUrlError('Informe um link HTTPS válido para uma imagem pública.');
      return;
    }
    setLogoUrlError('');
    setLogoPreviewUrl(normalized);
    ui.setEditingSource({ ...ui.editingSource, logo_url: normalized });
  };

  const saveSourceEdit = async () => {
    if (isSavingEdit || !ui.editingSource) return;
    setIsSavingEdit(true);
    try {
      // A confirmação no banco é obrigatória antes de fechar a edição.
      if (saveOriginsRef.current && !(await saveOriginsRef.current())) return;

      const previous = sources.find(source => source.id === ui.editingSource.id);
      const balanceChanged = previous && Number(previous.balance) !== Number(ui.editingSource.balance);
      const logoChanged = previous && String(previous.logo_url ?? '') !== String(ui.editingSource.logo_url ?? '');
      if (balanceChanged || logoChanged) {
        await handleUpdateSourceBalance();
      } else {
        ui.setEditingSource(null);
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader
        icon={<Wallet size={22} />}
        iconClassName="border-emerald-500/30 bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-emerald-950/30"
        title={<>Fontes de <span className="text-blue-500">Capital</span></>}
        subtitle="Gestão de fundos e liquidez"
        actions={<button
          onClick={() => ui.openModal('SOURCE_FORM')}
          className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 shrink-0"
        >
          <Plus size={16} /> Nova Fonte
        </button>}
      />

      {canTransferCapital && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-slate-900 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-100">Capital disponível para movimentação contábil</p>
            <p className="text-xs text-slate-400">Fontes com saldo positivo, exceto cartões e saldos espelhados em contas.</p>
          </div>
          <strong className="text-xl font-bold tabular-nums text-emerald-300">
            {transferableCapital === null ? 'Verificando...' : formatMoney(transferableCapital, isStealthMode)}
          </strong>
          <button type="button" disabled={!transferAccounts || !transferableCapital}
            onClick={() => setTransferSource(displayedSources.find(source =>
              canMoveCapitalSource(source, transferAccounts || [])) || null)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-500/40 bg-blue-950/30 px-4 text-xs font-semibold text-blue-200 hover:bg-blue-900/40 disabled:opacity-40">
            Transferir capital para conta
          </button>
        </div>
      )}
      {sourceReferenceError && isPrimaryOwner && (
        <p role="alert" className="text-xs text-amber-300">
          Não foi possível atualizar os valores associados da Minha Carteira.
        </p>
      )}

      <div className="grid grid-cols-1 items-start sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {displayedSources.map(source => (
          <SourceCard
            key={source.id}
            source={source}
            loans={loans}
            onAddFunds={handleAddFunds}
            onEdit={handleEditSource}
            onDelete={(id) => openConfirmation({ type: 'DELETE_SOURCE', target: id })}
            isStealthMode={isStealthMode}
            referenceDisplay={sourceReferences[source.id] ?? null}
            onTransferToAccount={canTransferCapital && transferAccounts
              && canMoveCapitalSource(source, transferAccounts) ? setTransferSource : undefined}
          />
        ))}
      </div>

      {transferSource && activeUser && (
        <CapitalSourceTransferModal
          profileId={activeUser.profile_id || activeUser.id}
          sources={displayedSources}
          accounts={transferAccounts || undefined}
          initialSourceId={transferSource.id}
          onClose={() => setTransferSource(null)}
          onSaved={refreshTransferBalances}
        />
      )}

      {ui.editingSource && (
        <Modal
          onClose={() => ui.setEditingSource(null)}
          title="Editar carteira"
          subtitle={ui.editingSource.name}
          icon={<Wallet size={18} />}
          compact
          busy={isSavingEdit || logoLoading}
          footer={(
            <button
              onClick={saveSourceEdit}
              disabled={isSavingEdit || logoLoading}
              className={`${modalPrimaryActionClass} sm:flex-1`}
            >
              {isSavingEdit ? 'Salvando...' : 'Salvar alterações'}
            </button>
          )}
        >
          <div className="space-y-3">
            <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded-lg">
              <p className="text-[10px] text-amber-200 uppercase font-bold text-center">
                Informe o saldo real da fonte quando não houver histórico confiável. A correção não cria movimentações anteriores nem altera contratos.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Novo Saldo Atual</label>
              <FinancialCalculatorInput
                placeholder="0,00"
                fieldLabel="saldo real"
                signed
                value={ui.editingSource.balance === 0 ? '' : ui.editingSource.balance}
                onChange={e => ui.setEditingSource({
                  ...ui.editingSource,
                  balance: e.target.value
                })}
                className="w-full bg-slate-950 p-3.5 rounded-lg text-white text-xl font-bold outline-none border border-slate-800 focus:border-blue-500 transition-colors"
              />
            </div>

            <SourceWalletReferencePanel
              key={ui.editingSource.id}
              sources={[ui.editingSource]}
              activeUser={activeUser}
              onEditManual={handleEditSource}
              saveRef={saveOriginsRef}
            />

            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
              <label className="text-[10px] uppercase font-bold text-slate-400">Imagem da carteira</label>
              <div className="flex items-center gap-3">
              {logoPreviewUrl ? (
                <div className="relative w-16 h-16 rounded-full overflow-hidden border border-slate-700 group bg-slate-950 shrink-0">
                  <img
                    src={logoPreviewUrl}
                    alt={`Logo ${ui.editingSource.name}`}
                    className="w-full h-full object-cover"
                    onError={() => setLogoPreviewUrl(null)}
                  />
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <span className="text-[9px] text-white font-bold uppercase">Remover</span>
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 overflow-hidden shrink-0">
                  {resolveBankLogo(ui.editingSource.name) ? (
                    <img
                      src={resolveBankLogo(ui.editingSource.name)!}
                      alt={`Logo ${ui.editingSource.name}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={24} className="text-slate-500" />
                  )}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  disabled={logoLoading}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-10 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold uppercase rounded-lg border border-slate-700 flex items-center gap-2 transition-colors"
                >
                  <Upload size={14} />
                  {logoLoading ? 'Carregando...' : 'Carregar Imagem'}
                </button>
                <p className="text-[10px] text-slate-500 mt-1">JPG, PNG, GIF ou WEBP (máx. 2 MB)</p>
              </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="url"
                    value={logoUrlInput}
                    onChange={(event) => { setLogoUrlInput(event.target.value); setLogoUrlError(''); }}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyLogoUrl(); } }}
                    placeholder="https://site.com/imagem.png"
                    className="min-h-10 w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white outline-none transition-colors focus:border-blue-500"
                  />
                </div>
                <button type="button" onClick={applyLogoUrl} className="min-h-10 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 text-[10px] font-black uppercase text-blue-300 transition-colors hover:bg-blue-500/20">
                  Usar link
                </button>
              </div>
              {logoUrlError && <p role="alert" className="text-[10px] font-medium text-rose-400">{logoUrlError}</p>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
