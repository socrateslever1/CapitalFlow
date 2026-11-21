/** Prévia somente informativa: a RPC aplica o saldo autoritativo sob lock. */
const centsOrNull=(value:number):number|null=>{
  if(!Number.isFinite(value)||value<0)return null;
  const cents=Math.round(value*100);
  if(!Number.isSafeInteger(cents)||Math.abs(value*100-cents)>0.00001)return null;
  return cents;
};

export const getAccountTransferPreview=(balance:number,amount:number)=>{
  const balanceCents=centsOrNull(balance);
  const amountCents=centsOrNull(amount);
  const validAmount=amountCents!==null&&amountCents>0;
  const remainingCents=balanceCents!==null&&validAmount?balanceCents-amountCents:null;
  return {
    balanceCents,
    remainingCents,
    insufficientFunds:remainingCents!==null&&remainingCents<0,
  };
};
