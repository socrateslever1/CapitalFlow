import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BellRing, CheckCircle2, ShieldAlert, Trash2, X } from 'lucide-react';
import { PrivateMoney } from '../../../contexts/FinancialPrivacyContext';
import { formatMoney } from '../../../utils/formatters';
import QuickExpenseModal from '../components/QuickExpenseModal';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import {
  bankNotificationsSupported, bindBankNotificationsProfile, clearBankNotices, dismissBankNotice,
  getBankNoticeStatus, listBankNotices, listenBankNotices, openBankNoticeSettings,
  setBankNoticeEnabled, setBankNoticePackages,
  type BankNoticeStatus, type CapturedBankNotice,
} from '../bankNotificationsBridge';

const notificationRequestId = (id: string) => {
  const hex = id.slice(0, 32);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) +
    '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
};

const localIsoDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  return year + '-' + String(date.getMonth() + 1).padStart(2, '0') +
    '-' + String(date.getDate()).padStart(2, '0');
};

const ReviewNotification: React.FC<{
  item: CapturedBankNotice; onClose: () => void; onRecorded: () => Promise<void>;
}> = ({ item, onClose, onRecorded }) => {
  const { data, loading, error, refresh } = useWalletSnapshot();
  if (loading) return <div role="status" className="fixed inset-0 z-[2200] grid place-items-center bg-slate-950/85 text-white">
    Preparando conferência...
  </div>;
  if (!data || error) return <div role="alert" className="fixed inset-0 z-[2200] grid place-items-center bg-slate-950/90 p-4">
    <div className="w-full max-w-sm rounded-xl bg-slate-900 p-4 text-sm text-rose-200">
      Não foi possível carregar as contas e cartões.
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-lg border border-slate-600 px-4 py-2" onClick={onClose}>Fechar</button>
        <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => void refresh()}>Tentar novamente</button>
      </div>
    </div>
  </div>;
  return <QuickExpenseModal
    key={item.id} accounts={data.accounts} cards={data.cards}
    initialMode={item.mode} requireExplicitDestination
    notificationPrefill={{
      amountCents: item.cents,
      description: 'Despesa identificada por notificação do ' + item.institution,
      date: localIsoDate(item.at),
      requestId: notificationRequestId(item.id),
    }}
    onClose={onClose}
    onSaved={async () => {
      // The existing form alone is responsible for a confirmed, idempotent financial write.
      await dismissBankNotice(item.id);
      await onRecorded();
    }}
  />;
};

export const WalletBankNotificationsPage: React.FC<{
  userId: string; onNavigate: (path: string) => void;
}> = ({ userId, onNavigate }) => {
  const supported = bankNotificationsSupported();
  const [status, setStatus] = useState<BankNoticeStatus | null>(null);
  const [items, setItems] = useState<CapturedBankNotice[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState('');
  const [review, setReview] = useState<CapturedBankNotice | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const refresh = useCallback(async () => {
    if (!supported || !userId) return;
    const [current, pending] = await Promise.all([getBankNoticeStatus(), listBankNotices()]);
    setStatus(current); setItems(pending); setError('');
  }, [supported, userId]);

  useEffect(() => {
    if (!supported || !userId) { setLoading(false); return; }
    let active = true;
    void bindBankNotificationsProfile(userId)
      .then(() => refresh())
      .catch(() => { if (active) setError('Não foi possível iniciar o leitor de notificações.'); })
      .finally(() => { if (active) setLoading(false); });
    const update = () => { if (active) void refresh().catch(() => setError('Não foi possível consultar as notificações.')); };
    const onVisibility = () => { if (!document.hidden) update(); };
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', onVisibility);
    let removeListener: (() => Promise<void>) | undefined;
    void listenBankNotices(update).then(remove => { if (active) removeListener = remove; else void remove(); });
    return () => {
      active = false;
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', onVisibility);
      if (removeListener) void removeListener();
    };
  }, [supported, userId, refresh]);

  const operate = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); await refresh(); }
    catch { setError('Não foi possível concluir esta ação. Verifique a permissão do Android.'); }
    finally { setBusy(false); }
  };
  const selected = useMemo(() => new Set(status?.packages || []), [status?.packages]);
  const datetime = (timestamp: number) => new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));

  return <WalletPageFrame title="Notificações bancárias"
    description="Sugestões locais de despesas. Nenhuma compra é registrada sem sua confirmação."
    loading={loading} error={error}
    actions={<button type="button" onClick={() => onNavigate('visao-geral')}
      className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs text-white">
      <ArrowLeft size={16}/> Voltar
    </button>}
    onRefresh={supported ? () => void operate(refresh) : undefined}>
    {!supported ? <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
      A leitura de notificações de outros aplicativos está disponível somente no APK Android atualizado.
    </section> : <>
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="flex items-center gap-2 font-semibold text-white"><ShieldAlert size={18} className="text-blue-400"/> Controle de acesso</h3>
        <p className="text-xs leading-relaxed text-slate-300">
          O Android solicita acesso às notificações do aparelho, mas o CapitalFlow processa somente
          aplicativos autorizados abaixo. A captura fica desativada até você habilitar.
          Mensagens de autenticação, senhas e notificações completas não são armazenadas.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-200">
            Acesso do Android: <strong>{status?.permissionGranted ? 'autorizado' : 'não autorizado'}</strong>
          </span>
          <button type="button" onClick={() => void operate(openBankNoticeSettings)}
            className="min-h-11 rounded-lg border border-blue-500 px-3 text-xs font-semibold text-blue-300">
            Configurar no Android
          </button>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-700 p-3 text-sm">
          <input type="checkbox" checked={status?.enabled || false} disabled={busy || !status || !selected.size}
            onChange={e => void operate(() => setBankNoticeEnabled(e.target.checked))}
            className="size-5 accent-blue-500"/>
          <span>Capturar sugestões de despesas</span>
        </label>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-semibold text-slate-300">Bancos autorizados</legend>
          {status?.availableBanks.map(bank => <label key={bank.id}
            className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-800 px-3 text-sm text-white">
            <input type="checkbox" checked={selected.has(bank.id)} disabled={busy}
              onChange={event => void operate(() => setBankNoticePackages(event.target.checked
                ? [...selected, bank.id] : [...selected].filter(pkg => pkg !== bank.id)))}
              className="size-5 accent-blue-500"/>
            {bank.label}
          </label>)}
        </fieldset>
        {!status?.permissionGranted && <p className="text-xs text-amber-200">
          O leitor só poderá funcionar após a autorização manual nas configurações do Android.
        </p>}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <BellRing size={18} className="text-blue-400"/> Para conferir ({items.length})
          </h3>
          <button type="button" disabled={!items.length || busy}
            onClick={() => {
              if (!confirmClear) { setConfirmClear(true); return; }
              void operate(clearBankNotices).then(() => setConfirmClear(false));
            }}
            className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-400 disabled:opacity-40">
            <Trash2 size={14}/>{confirmClear ? 'Confirmar limpeza' : 'Limpar sugestões'}
          </button>
        </div>
        {!items.length && <p className="rounded-lg bg-slate-950/70 px-3 py-5 text-center text-sm text-slate-400">
          Nenhuma despesa identificada. Novas notificações elegíveis aparecerão aqui.
        </p>}
        {items.map(item => <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{item.institution}</p>
              <p className="text-xs text-slate-400">{datetime(item.at)} · {item.mode === 'CARD' ? 'Possível compra no cartão' : 'Possível débito ou Pix'}</p>
            </div>
            <strong className="shrink-0 text-sm text-white"><PrivateMoney value={formatMoney(item.cents / 100)}/></strong>
          </div>
          <p className="mt-2 text-[11px] text-amber-200">Confira no banco antes de registrar. A notificação não comprova uma compra.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setReview(item)}
              className="min-h-11 flex-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white">
              Conferir lançamento
            </button>
            <button type="button" disabled={busy}
              onClick={() => void operate(() => dismissBankNotice(item.id))}
              className="min-h-11 rounded-lg border border-slate-700 px-3 text-xs text-slate-300">Descartar</button>
          </div>
        </article>)}
        <p className="text-[11px] leading-relaxed text-slate-400">
          O conteúdo completo das notificações não é enviado à IA nem ao servidor.
          Sugestões ficam cifradas no aparelho por até 72 horas, com limite de 40.
        </p>
      </section>
      {review && <ReviewNotification key={review.id} item={review} onClose={() => setReview(null)}
        onRecorded={async () => { await refresh(); setReview(null); }}/>}
    </>}
  </WalletPageFrame>;
};
