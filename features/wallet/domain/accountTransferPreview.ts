/** Prévia somente informativa: a RPC aplica o saldo autoritativo sob lock. */
const centsOrNull=(value:number):number|null=>{
  if(!Number.isFinite(value)||value<0)return null;
  const cents=Math.round(value*100);
  if(!Number.isSafeInteger(cents)||Math.abs(value*100-cents)>0.00001)return null;
  return cents;
};

export type AccountMovementDirection='CREDIT'|'DEBIT';

/** Prévia visual; o servidor valida o saldo autoritativo sob lock. */
export const getAccountMovementPreview=(balance:number,amount:number,direction:AccountMovementDirection)=>{
  const balanceCents=centsOrNull(balance);
  const amountCents=centsOrNull(amount);
  const validAmount=amountCents!==null&&amountCents>0;
  const projected=balanceCents!==null&&validAmount
    ? balanceCents+(direction==='CREDIT'?amountCents:-amountCents)
    : null;
  const remainingCents=projected!==null&&Number.isSafeInteger(projected)?projected:null;
  return {
    balanceCents,
    remainingCents,
    insufficientFunds:direction==='DEBIT'&&remainingCents!==null&&remainingCents<0,
  };
};

/** Compatibilidade com as transferências existentes. */
export const getAccountTransferPreview=(balance:number,amount:number)=>
  getAccountMovementPreview(balance,amount,'DEBIT');
