import React, { useEffect, useRef, useState } from 'react';
import { Copy, LockKeyhole } from 'lucide-react';
import { Modal, modalPrimaryActionClass } from '../ui/Modal';
import { personalWalletService, type PersonalWalletCard } from '../../services/personalWallet.service';
import {
  createWalletMasterPin, decryptCardData, decryptCardWithMaster,
  encryptCardWithMaster, unlockWalletMasterPin, validateCardNumber,
  type AnyCardVaultEnvelope, type ProtectedCardData, type WrappedWalletMasterKey,
} from '../../features/wallet/domain/cardVault';
import { cacheWalletVaultKey, clearWalletVaultSession, getWalletVaultKey } from '../../features/wallet/domain/walletVaultSession';
import { CardProtectedFields, emptyProtectedCard } from './CardProtectedFields';
import { copyCardFieldToClipboard } from '../../utils/cardClipboard';

export const CardVaultModal: React.FC<{
  card:PersonalWalletCard;onClose:()=>void;onSaved:(lastFour?:string)=>Promise<void>
}> = ({card,onClose,onSaved}) => {
  const [envelope,setEnvelope]=useState<AnyCardVaultEnvelope|null>(null);
  const [profile,setProfile]=useState<WrappedWalletMasterKey|null>(null);
  const [owner,setOwner]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [unlocked,setUnlocked]=useState(false);
  const [busy,setBusy]=useState(false);
  const [draft,setDraft]=useState(emptyProtectedCard);
  const [pin,setPin]=useState('');
  const [confirmPin,setConfirmPin]=useState('');
  const [legacyPassword,setLegacyPassword]=useState('');
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [retry,setRetry]=useState(0);
  const operation=useRef(0);

  useEffect(()=>{
    const generation=++operation.current;
    setLoaded(false);setUnlocked(false);setDraft(emptyProtectedCard());
    setError('');setFeedback('');setPin('');setConfirmPin('');setLegacyPassword('');
    Promise.all([personalWalletService.getCardVault(card.id),personalWalletService.getWalletPinProfile()])
      .then(([vault,pinProfile])=>{
        if(operation.current!==generation) return;
        if(vault.ownerId!==pinProfile.ownerId) throw new Error('Sessão do proprietário inconsistente.');
        setOwner(vault.ownerId);setEnvelope(vault.envelope);setProfile(pinProfile.profile);
        setLoaded(true);
        const cached=getWalletVaultKey(vault.ownerId);
        if(cached && vault.envelope?.version===2){
          void decryptCardWithMaster(vault.envelope,cached,vault.ownerId)
            .then(value=>{
              if(operation.current!==generation || document.hidden) return;
              if(card.last_four && value.number.slice(-4)!==card.last_four)
                throw new Error('O cartão protegido não corresponde ao final cadastrado.');
              setDraft({...emptyProtectedCard(),...value});setUnlocked(true);
            })
            .catch(()=>{if(operation.current===generation)clearWalletVaultSession();});
        }
      })
      .catch(reason=>{
        if(operation.current===generation){
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o cofre.');
          setLoaded(false);
        }
      });
    return()=>{operation.current++;};
  },[card.id,retry]);

  useEffect(()=>{
    const lock=()=>{
      if(document.hidden) {
        operation.current++;
        clearWalletVaultSession();
        setUnlocked(false);setDraft(emptyProtectedCard());
        setPin('');setConfirmPin('');setLegacyPassword('');setFeedback('');
      }
    };
    document.addEventListener('visibilitychange',lock);
    return()=>{document.removeEventListener('visibilitychange',lock);};
  },[]);

  useEffect(()=>{
    if(!unlocked)return;
    const timer=window.setTimeout(()=>{
      clearWalletVaultSession();
      operation.current++;
      setUnlocked(false);setDraft(emptyProtectedCard());
      setPin('');setLegacyPassword('');setFeedback('');
      setError('Dados protegidos bloqueados por inatividade. Digite o PIN novamente.');
    },120_000);
    return()=>window.clearTimeout(timer);
  },[unlocked,card.id]);

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!loaded||busy)return;
    setBusy(true);setError('');setFeedback('');
    const generation=operation.current;
    try {
      // Reject invalid card details before creating an irreversible master PIN.
      if(!envelope) validateCardNumber(draft.number);
      // Never send a PIN, full PAN or CVC to the PIN-profile RPC.
      let oldPlain:ProtectedCardData|null=null;
      if(envelope?.version===1) {
        if(!legacyPassword)throw new Error('Informe uma única vez a senha antiga para migrar este cartão.');
        oldPlain=await decryptCardData(envelope,legacyPassword,owner);
        if(card.last_four && oldPlain.number.slice(-4)!==card.last_four)
          throw new Error('O cartão protegido não corresponde ao final cadastrado.');
      }
      let master=getWalletVaultKey(owner);
      if(!master) {
        if(profile) {
          master=await unlockWalletMasterPin(profile,pin);
        } else {
          if(pin!==confirmPin)throw new Error('A confirmação do PIN não corresponde.');
          const created=await createWalletMasterPin(pin);
          await personalWalletService.createWalletPinProfile(created.profile);
          setProfile(created.profile);
          master=created.key;
        }
      }
      if(operation.current!==generation || document.hidden)return;
      cacheWalletVaultKey(owner,master);
      setPin('');setConfirmPin('');setLegacyPassword('');
      if(oldPlain && envelope?.version===1) {
        const next=await encryptCardWithMaster(oldPlain,master,owner,envelope.context_id);
        await personalWalletService.saveCardVault(card.id,next,oldPlain.number.slice(-4));
        if(operation.current!==generation || document.hidden)return;
        setEnvelope(next);setDraft({...emptyProtectedCard(),...oldPlain});setUnlocked(true);
        setFeedback('Cartão migrado. Da próxima vez, use apenas o PIN da Carteira.');
        await onSaved(oldPlain.number.slice(-4));
      } else if(envelope?.version===2 && !unlocked) {
        const value=await decryptCardWithMaster(envelope,master,owner);
        if(card.last_four && value.number.slice(-4)!==card.last_four)
          throw new Error('O número protegido diverge do cadastro.');
        if(operation.current!==generation || document.hidden)return;
        setDraft({...emptyProtectedCard(),...value});setUnlocked(true);
      } else {
        const number=validateCardNumber(draft.number);
        const next=await encryptCardWithMaster(
          {number,securityCode:draft.securityCode},master,owner,envelope?.context_id||card.id);
        await personalWalletService.saveCardVault(card.id,next,number.slice(-4));
        if(operation.current!==generation || document.hidden)return;
        setEnvelope(next);setUnlocked(true);setFeedback('Dados protegidos salvos.');
        await onSaved(number.slice(-4));
      }
    } catch(reason) {
      if(operation.current===generation)setError(reason instanceof Error?reason.message:'Não foi possível acessar o cofre.');
    } finally {setBusy(false);}
  };

  const isLegacy=envelope?.version===1;
  const needsPin=loaded && !getWalletVaultKey(owner);
  const needsConfirmation=needsPin && !profile;
  const showCardFields=loaded && (!envelope || unlocked);
  const actionLabel=isLegacy?'Migrar e desbloquear'
    : envelope&&!unlocked?'Desbloquear cartão'
      : envelope?'Salvar alterações':'Salvar dados protegidos';

  return <Modal title="Dados completos do cartão" subtitle={card.nickname}
    icon={<LockKeyhole size={18}/>} onClose={onClose} busy={busy}
    footer={<button type="submit" form="wallet-card-vault-form"
      disabled={busy||!loaded} className={modalPrimaryActionClass}>{busy?'Aguarde...':actionLabel}</button>}>
    {!loaded&&!error&&<p role="status" className="text-sm text-slate-400">Carregando dados protegidos…</p>}
    <form id="wallet-card-vault-form" onSubmit={event=>{void submit(event);}} className="space-y-4">
      {loaded&&<>
        {isLegacy&&<label className="block text-xs font-medium text-slate-300">
          Senha antiga deste cartão (somente para migração)
          <input type="password" name="wallet-legacy-vault-secret" autoComplete="off" maxLength={256} value={legacyPassword}
            onChange={e=>setLegacyPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"/>
        </label>}
        {needsPin&&<div className="space-y-3 rounded-xl border border-slate-700 p-3">
          <p className="text-xs text-slate-300">
            {needsConfirmation?'Defina um único PIN para seus cartões':'PIN da Carteira'}
          </p>
          <label className="block text-xs text-slate-300">
            {needsConfirmation?'Novo PIN (8 a 12 dígitos)':'Informe seu PIN'}
            <input type="password" name="wallet-vault-pin" inputMode="numeric" autoComplete="off"
              minLength={8} maxLength={12} pattern="[0-9]{8,12}"
              value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,12))}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" required/>
          </label>
          {needsConfirmation&&<label className="block text-xs text-slate-300">
            Confirmar PIN
            <input type="password" name="wallet-vault-pin-confirmation" inputMode="numeric" autoComplete="off"
              minLength={8} maxLength={12} pattern="[0-9]{8,12}"
              value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,12))}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" required/>
          </label>}
          {needsConfirmation&&<p className="text-[11px] text-amber-200">
            Guarde este PIN: sem ele, os dados completos criptografados não poderão ser recuperados.
          </p>}
          <p className="text-[11px] text-slate-400">
            O PIN não é enviado nem armazenado. Ele desbloqueia a chave criptografada dos cartões;
            os dados se bloqueiam quando o aplicativo vai para segundo plano.
          </p>
        </div>}
        {showCardFields&&<CardProtectedFields value={draft} onChange={setDraft} askPassword={false}/>}
        {unlocked&&<div className="flex flex-wrap gap-2">
          {([['Número completo',draft.number],['CVC',draft.securityCode]] as const)
            .map(([label,value])=><button key={label} type="button" disabled={!value}
              onClick={()=>{void copyCardFieldToClipboard(label,value).then(result=>setFeedback(result.message));}}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs text-slate-200 disabled:opacity-40">
              <Copy size={15}/>Copiar {label.toLowerCase()}
            </button>)}
        </div>}
        <p className="text-xs text-slate-400">
          O cofre exige login no CapitalFlow e um PIN da Carteira, sem senha separada por cartão.
        </p>
      </>}
      {error&&<p role="alert" className="text-xs text-rose-300">{error}
        {!loaded&&<button type="button" onClick={()=>setRetry(v=>v+1)}
          className="ml-2 underline">Tentar novamente</button>}
      </p>}
      {feedback&&<p role="status" className="text-xs text-emerald-300">{feedback}</p>}
    </form>
  </Modal>;
};
