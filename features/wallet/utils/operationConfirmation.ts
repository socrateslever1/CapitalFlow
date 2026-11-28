/** Limita o tempo da interface, sem cancelar nem repetir uma operação financeira. */
export class WalletOperationTimeoutError extends Error {
  constructor(){
    super('Tempo de confirmação excedido. Confira o extrato antes de repetir o lançamento.');
    this.name='WalletOperationTimeoutError';
  }
}

export async function withWalletOperationDeadline<T>(promise:Promise<T>,timeoutMs:number):Promise<T>{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw new RangeError('Prazo inválido.');
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
    return await Promise.race<T>([
      promise,
      new Promise<T>((_,reject)=>{
        timeout=setTimeout(()=>reject(new WalletOperationTimeoutError()),timeoutMs);
      }),
    ]);
  }finally{
    if(timeout!==undefined)clearTimeout(timeout);
  }
}
