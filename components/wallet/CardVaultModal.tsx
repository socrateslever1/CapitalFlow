import React, { useEffect, useRef, useState } from 'react';
import { Copy, LockKeyhole } from 'lucide-react';
import { Modal, modalPrimaryActionClass } from '../ui/Modal';
import { personalWalletService, type PersonalWalletCard } from '../../services/personalWallet.service';
import { validateCardNumber } from '../../features/wallet/domain/cardVault';
import { CardProtectedFields, emptyProtectedCard } from './CardProtectedFields';
import { copyCardFieldToClipboard } from '../../utils/cardClipboard';

/** Full PAN access uses the authenticated session; CVC/CVV is never stored. */
export const CardVaultModal: React.FC<{
  card: PersonalWalletCard;
  onClose: () => void;
  onSaved: (lastFour?: string) => Promise<void>;
}> = ({ card, onClose, onSaved }) => {
  const [loaded, setLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(emptyProtectedCard);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [retry, setRetry] = useState(0);
  const operation = useRef(0);

  useEffect(() => {
    const generation = ++operation.current;
    setLoaded(false); setUnlocked(false); setDraft(emptyProtectedCard());
    setError(''); setFeedback('');
    personalWalletService.getCardLoginVault(card.id).then(value => {
      if (operation.current !== generation || document.hidden) return;
      if (value?.number) {
        if (card.last_four && value.number.slice(-4) !== card.last_four)
          throw new Error('O cartão protegido não corresponde ao final cadastrado.');
        setDraft({ ...emptyProtectedCard(), number: value.number });
        setUnlocked(true);
      }
      setLoaded(true);
    }).catch(reason => {
      if (operation.current !== generation) return;
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados protegidos.');
    });
    return () => { operation.current++; };
  }, [card.id, retry]);

  useEffect(() => {
    let wasHidden = document.hidden;
    const handleVisibility = () => {
      if (document.hidden) {
        wasHidden = true;
        operation.current++;
        setLoaded(false); setUnlocked(false); setDraft(emptyProtectedCard()); setFeedback('');
      } else if (wasHidden) {
        wasHidden = false;
        setRetry(value => value + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!loaded || busy) return;
    setBusy(true); setError(''); setFeedback('');
    const generation = operation.current;
    try {
      const number = validateCardNumber(draft.number);
      if (operation.current !== generation || document.hidden) return;
      await personalWalletService.saveCardLoginVault(card.id, number);
      if (operation.current !== generation || document.hidden) return;
      setDraft({ ...emptyProtectedCard(), number }); setUnlocked(true);
      setFeedback('Dados protegidos salvos com a proteção da sua sessão de login.');
      await onSaved(number.slice(-4));
    } catch (reason) {
      if (operation.current === generation)
        setError(reason instanceof Error ? reason.message : 'Não foi possível salvar os dados protegidos.');
    } finally { setBusy(false); }
  };

  return <Modal title="Dados completos do cartão" subtitle={card.nickname}
    icon={<LockKeyhole size={18}/>} onClose={onClose} busy={busy}
    footer={<button type="submit" form="wallet-card-vault-form" disabled={busy || !loaded}
      className={modalPrimaryActionClass}>{busy ? 'Aguarde...' : 'Salvar dados protegidos'}</button>}>
    {!loaded && !error && <p role="status" className="text-sm text-slate-400">Carregando dados protegidos...</p>}
    <form id="wallet-card-vault-form" onSubmit={event => { void submit(event); }} className="space-y-4">
      {loaded && <>
        <CardProtectedFields value={draft} onChange={setDraft} askPassword={false}/>
        {unlocked && <button type="button" disabled={!draft.number}
          onClick={() => { void copyCardFieldToClipboard('Número completo', draft.number).then(result => setFeedback(result.message)); }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs text-slate-200 disabled:opacity-40">
          <Copy size={15}/>Copiar número completo
        </button>}
        <p className="text-xs text-slate-400">O acesso é protegido pelo login do CapitalFlow. O número fica criptografado no servidor; CVC/CVV nunca é solicitado nem armazenado.</p>
        {!unlocked && <p className="text-[11px] text-amber-200">Se este cartão usava o PIN antigo e você não o lembra, informe novamente o número para migrar para a proteção por login.</p>}
      </>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}
        {!loaded && <button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 underline">Tentar novamente</button>}
      </p>}
      {feedback && <p role="status" className="text-xs text-emerald-300">{feedback}</p>}
    </form>
  </Modal>;
};
