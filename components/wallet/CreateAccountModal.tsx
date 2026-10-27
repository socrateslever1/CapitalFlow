import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Landmark, Loader2, QrCode, Wallet, X } from 'lucide-react';
import type { CapitalSource } from '../../types';
import { personalWalletService } from '../../services/personalWallet.service';
import { BANK_CATALOG } from '../../utils/bankLogoRegistry';
import { formatMoney } from '../../utils/formatters';
import { generateUUID } from '../../utils/generators';
import { BankLogo } from './BankLogo';
import { getBankVisual, walletAccountTypeLabel } from './walletPresentation';

export interface CreateAccountModalProps {
  capitalSources?: CapitalSource[];
  initialAccountType?: 'CHECKING' | 'PAYMENT' | 'SAVINGS' | 'CASH' | 'INVESTMENT';
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const PRESET_INSTITUTIONS = [
  'Nubank',
  'RecargaPay',
  'Bradesco',
  'Itaú',
  'Santander',
  'Banco Inter',
  'C6 Bank',
  'Caixa Econômica',
  'Banco do Brasil',
  'Mercado Pago',
  'PicPay',
  'Dinheiro Físico / Carteira Manual',
];

export const CreateAccountModal: React.FC<CreateAccountModalProps> = ({
  capitalSources: providedCapitalSources,
  initialAccountType = 'CHECKING',
  onClose,
  onSaved,
}) => {
  const [loadedSources, setLoadedSources] = useState<CapitalSource[]>(providedCapitalSources || []);
  useEffect(() => {
    if (providedCapitalSources && providedCapitalSources.length > 0) {
      setLoadedSources(providedCapitalSources);
      return;
    }
    let mounted = true;
    personalWalletService
      .load()
      .then((res) => {
        if (mounted) setLoadedSources(res.capitalSources || []);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [providedCapitalSources]);
  const capitalSources = providedCapitalSources && providedCapitalSources.length > 0 ? providedCapitalSources : loadedSources;

  const [accountType, setAccountType] = useState<string>(initialAccountType);
  const [nickname, setNickname] = useState<string>(
    initialAccountType === 'CASH' ? 'Carteira física' : '',
  );
  const [bankName, setBankName] = useState<string>('');
  const [initialBalance, setInitialBalance] = useState<string>('0');
  const [pixKeyType, setPixKeyType] = useState<string>('');
  const [pixKey, setPixKey] = useState<string>('');
  const [capitalSourceId, setCapitalSourceId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const openingRequestIdRef = useRef<string>(generateUUID());
  const isPhysicalWallet = accountType === 'CASH';

  const visual = useMemo(
    () => getBankVisual(isPhysicalWallet ? 'Carteira Física' : bankName || nickname || 'Conta'),
    [isPhysicalWallet, bankName, nickname],
  );

  const handleBankChange = (value: string) => {
    setBankName(value);
    if (/dinheiro|carteira manual|esp[eé]cie/i.test(value)) {
      setAccountType('CASH');
      if (!nickname) setNickname('Carteira física');
    } else if (!nickname) {
      setNickname(value);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const cleanNickname = nickname.trim() || (isPhysicalWallet ? 'Carteira física' : bankName.trim());
    if (!cleanNickname) {
      setError('Informe um apelido ou nome para a conta/carteira.');
      return;
    }
    if (!isPhysicalWallet && !bankName.trim()) {
      setError('Informe a instituição ou banco da conta.');
      return;
    }

    const parsedBalance = Math.round((Number(initialBalance || 0) || 0) * 100) / 100;
    if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
      setError('Informe um saldo inicial válido (zero ou positivo).');
      return;
    }

    const cleanPixKey = isPhysicalWallet ? '' : pixKey.trim();
    const cleanPixType = isPhysicalWallet ? '' : pixKeyType.trim();
    if (cleanPixKey && !cleanPixType) {
      setError('Selecione o tipo da chave PIX informada.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      // 1. Cria a conta zerada para aplicar o saldo inicial auditado via RPC
      const created = await personalWalletService.createAccount({
        nickname: cleanNickname,
        bank_name: isPhysicalWallet ? null : bankName.trim(),
        institution_key: visual.key,
        account_type: accountType,
        balance: 0,
        pix_key: isPhysicalWallet ? null : cleanPixKey || null,
        pix_key_type: isPhysicalWallet ? null : cleanPixKey ? cleanPixType || null : null,
        notes: notes.trim() || null,
        capital_source_id: null,
      });

      // 2. Se houver saldo inicial > 0, invoca a RPC canônica personal_wallet_initialize_account_opening
      if (parsedBalance > 0) {
        await personalWalletService.initializeAccountOpening({
          accountId: created.id,
          amount: parsedBalance,
          occurredAt: new Date().toISOString(),
          requestId: openingRequestIdRef.current,
        });
      }

      // 3. Se houver vínculo com Fonte de Capital, invoca personal_wallet_link_capital_source
      if (capitalSourceId) {
        await personalWalletService.linkCapitalSource(created.id, capitalSourceId);
      }

      window.dispatchEvent(new Event('capitalflow:wallet-updated'));
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar conta ou carteira.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50';
  const labelClass = 'block text-xs font-bold text-slate-300';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-account-modal-title"
      className="fixed inset-0 z-[2400] flex items-end justify-center bg-slate-950/85 backdrop-blur-sm sm:items-center sm:p-4 animate-in fade-in"
    >
      <datalist id="create-account-institutions">
        {PRESET_INSTITUTIONS.map((item) => (
          <option key={item} value={item} />
        ))}
        {BANK_CATALOG.map((bank) => (
          <option key={bank.id} value={bank.name} />
        ))}
      </datalist>

      <form
        onSubmit={handleSubmit}
        className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 p-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              {isPhysicalWallet ? <Wallet size={18} /> : <Landmark size={18} />}
            </span>
            <div>
              <h2 id="create-account-modal-title" className="text-sm font-black uppercase tracking-wider text-white">
                Nova Conta / Carteira
              </h2>
              <p className="text-[11px] text-slate-400">
                Conta bancária, conta digital de pagamento ou carteira em espécie
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5 overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
          {/* Preview Visual Automático */}
          <div
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 p-3.5 text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${visual.accent}, ${visual.secondary})` }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="rounded-xl bg-white p-1 shadow">
                <BankLogo
                  name={isPhysicalWallet ? 'Carteira' : bankName}
                  alternateName={nickname || 'Conta'}
                  size="sm"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">
                  {nickname || bankName || (isPhysicalWallet ? 'Carteira física' : 'Nova Conta')}
                </p>
                <p className="truncate text-[11px] text-white/80">
                  {walletAccountTypeLabel(accountType)} · {isPhysicalWallet ? 'Dinheiro em espécie' : visual.name}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="block text-[10px] uppercase text-white/75">Saldo Inicial</span>
              <strong className="text-sm font-black">
                {formatMoney(Number(initialBalance || 0))}
              </strong>
            </div>
          </div>

          {/* Seletor rápido Conta Bancária vs Carteira Física */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setAccountType('CHECKING');
                if (nickname === 'Carteira física') setNickname('');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
                !isPhysicalWallet
                  ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <Landmark size={14} />
              Conta Bancária / Digital
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountType('CASH');
                if (!nickname) setNickname('Carteira física');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
                isPhysicalWallet
                  ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <Wallet size={14} />
              Carteira Física (Espécie)
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Instituição / Banco {isPhysicalWallet && <span className="text-slate-500">(opcional)</span>}
              <input
                list="create-account-institutions"
                required={!isPhysicalWallet}
                disabled={isPhysicalWallet}
                value={bankName}
                onChange={(e) => handleBankChange(e.target.value)}
                placeholder={isPhysicalWallet ? 'Dinheiro em espécie' : 'Ex: Nubank, Itaú, Inter, RecargaPay'}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Apelido da Conta / Carteira
              <input
                required
                maxLength={120}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={isPhysicalWallet ? 'Ex: Caixa Físico Escritório' : 'Ex: Nubank Principal'}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Tipo de Conta
              <select
                value={accountType}
                onChange={(e) => {
                  const next = e.target.value;
                  setAccountType(next);
                  if (next === 'CASH' && !nickname) setNickname('Carteira física');
                }}
                className={inputClass}
              >
                <option value="CHECKING">Conta Corrente</option>
                <option value="PAYMENT">Conta de Pagamento</option>
                <option value="SAVINGS">Poupança</option>
                <option value="CASH">Carteira Física (Dinheiro)</option>
                <option value="INVESTMENT">Investimento</option>
              </select>
            </label>

            <label className={labelClass}>
              Saldo Inicial (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={initialBalance}
                onChange={(e) => {
                  openingRequestIdRef.current = generateUUID();
                  setInitialBalance(e.target.value);
                }}
                placeholder="0,00"
                className={inputClass}
              />
            </label>

            {!isPhysicalWallet ? (
              <>
                <label className={labelClass}>
                  <QrCode size={12} className="mr-1 inline text-emerald-400" />
                  Tipo da Chave PIX
                  <select
                    value={pixKeyType}
                    onChange={(e) => setPixKeyType(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Sem chave PIX</option>
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="PHONE">Celular</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="RANDOM">Chave Aleatória</option>
                  </select>
                </label>

                <label className={labelClass}>
                  Chave PIX Padrão (opcional)
                  <input
                    maxLength={255}
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="Informe a chave para recebimentos"
                    className={inputClass}
                  />
                </label>
              </>
            ) : (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100 sm:col-span-2">
                Carteira física representa dinheiro em espécie e não precisa de instituição ou chave PIX.
              </div>
            )}

            <label className={`${labelClass} sm:col-span-2`}>
              Vínculo com Fonte de Capital (opcional)
              <select
                value={capitalSourceId}
                onChange={(e) => setCapitalSourceId(e.target.value)}
                className={inputClass}
              >
                <option value="">Nenhuma — manter conta independente</option>
                {capitalSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name} · Saldo: {formatMoney(Number(source.balance || 0))}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-slate-400">
                Sincroniza automaticamente desembolsos de empréstimos e recebimentos de parcelas com esta conta.
              </span>
            </label>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-800 bg-slate-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {saving ? 'Criando...' : 'Salvar Conta / Carteira'}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default CreateAccountModal;
