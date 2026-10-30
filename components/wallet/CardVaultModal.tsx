import React, { useEffect, useRef, useState } from 'react';
import { Copy, LockKeyhole } from 'lucide-react';
import { Modal, modalPrimaryActionClass } from '../ui/Modal';
import { personalWalletService, type PersonalWalletCard } from '../../services/personalWallet.service';
import { decryptCardData, encryptCardData, validateCardNumber, type CardVaultEnvelope } from '../../features/wallet/domain/cardVault';
import { CardProtectedFields, emptyProtectedCard } from './CardProtectedFields';
import { copyCardFieldToClipboard } from '../../utils/cardClipboard';

export const CardVaultModal:React.FC<{card:PersonalWalletCard;onClose:()=>void;onSaved:(lastFour?:string)=>Promise<void>}> = ({card,onClose,onSaved}) => {
  const [envelope,setEnvelope]=useState<CardVaultEnvelope|null>(null);
  const [owner,setOwner]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [unlocked,setUnlocked]=useState(false);
  const [busy,setBusy]=useState(false);
  const [draft,setDraft]=useState(emptyProtectedCard);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [retry,setRetry]=useState(0);
  const operation=useRef(0);
  useEffect(()=>{
    let active=true;
    setLoaded(false);setError('');
    personalWalletService.getCardVault(card.id).then(result=>{if(active){setOwner(result.ownerId);setEnvelope(result.envelope);setLoaded(true);}})
      .catch(()=>{if(active)setError('Não foi possível carregar o cofre. Tente novamente.');});
    return()=>{active=false;};
  },[card.id,retry]);
  useEffect(()=>{
    const lock=()=>{if(document.hidden){operation.current++;setUnlocked(false);setDraft(emptyProtectedCard());setFeedback('');}};
    document.addEventListener('visibilitychange',lock);
    return()=>{operation.current++;document.removeEventListener('visibilitychange',lock);};
  },[]);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy||!loaded)return;
    setBusy(true);setError('');setFeedback('');
    const generation=operation.current;
    try {
      if(envelope&&!unlocked){
        const value=await decryptCardData(envelope,draft.password,owner);
        if(operation.current!==generation||document.hidden)return;
        if(value.number.slice(-4)!==card.last_four)throw new Error('O final do número protegido diverge do cadastro. Confira este cartão.');
        setDraft(current=>({...current,...value}));setUnlocked(true);
      } else {
        if(!envelope&&draft.password!==draft.confirmation)throw new Error('As senhas do cofre não coincidem.');
        const number=validateCardNumber(draft.number);
        const encrypted=await encryptCardData({number,securityCode:draft.securityCode},draft.password,owner,envelope?.context_id||card.id);
        await personalWalletService.saveCardVault(card.id,encrypted,number.slice(-4));
        await onSaved(number.slice(-4));onClose();
      }
    } catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível abrir ou salvar o cofre.');}
    finally{setBusy(false);}
  };
  return <Modal title="Dados completos do cartão" subtitle={card.nickname} icon={<LockKeyhole size={18}/>} onClose={onClose} busy={busy}
    footer={<button type="submit" form="wallet-card-vault-form" disabled={busy||!loaded} className={modalPrimaryActionClass}>{busy?'Aguarde...':envelope&&!unlocked?'Desbloquear':'Salvar dados protegidos'}</button>}>
    {!loaded && !error && <p role="status" className="text-sm text-slate-400">Carregando cofre...</p>}
    <form id="wallet-card-vault-form" onSubmit={event=>{void submit(event);}} className="space-y-4">
      {loaded && (envelope&&!unlocked ? <label className="block text-sm text-slate-300">Senha deste cartão<input type="password" autoComplete="off" required maxLength={256} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" value={draft.password} onChange={event=>setDraft(value=>({...value,password:event.target.value}))}/></label> : <CardProtectedFields value={draft} onChange={setDraft} askPassword={!envelope}/>)}
      {unlocked && <div className="flex flex-wrap gap-2">{[['Número completo',draft.number],['CVC',draft.securityCode]].map(([label,value])=><button key={label} type="button" disabled={!value} onClick={()=>{void copyCardFieldToClipboard(label,value).then(result=>setFeedback(result.message));}} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs text-slate-200 disabled:opacity-40"><Copy size={15}/>Copiar {label.toLowerCase()}</button>)}</div>}
      <p className="text-xs text-slate-400">O cofre bloqueia ao fechar ou sair desta aba.</p>
      {error && <div role="alert" className="text-sm text-rose-300">{error}{!loaded&&<button type="button" onClick={()=>setRetry(value=>value+1)} className="ml-2 underline">Tentar novamente</button>}</div>}
      {feedback&&<p role="status" className="text-xs text-emerald-300">{feedback}</p>}
    </form>
  </Modal>;
};
