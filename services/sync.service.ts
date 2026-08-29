
import { supabase, getSynchronizedSession } from '../lib/supabase';
import { db } from './offline/adminOfflineStore';
import { mapLoanFromDB } from './adapters/dbAdapters';
import { maskPhone, maskDocument } from '../utils/formatters';
import { asNumber } from '../utils/safe';
import { filterDeletedLoans, readDeletedContractIds } from './deletedContracts.service';

const AUTH_ERROR_PATTERNS = ['jwt expired','invalid jwt','token is expired','auth session missing','refresh token','session not found','failed verification'];
export const isAuthSyncError = (error: any) => {
  const text = String(error?.message || error?.error_description || error || '').toLowerCase();
  return AUTH_ERROR_PATTERNS.some(pattern => text.includes(pattern));
};
const ensureFreshAuth = async (forceRefresh = false) => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  const { data, error } = await getSynchronizedSession({ forceRefresh, minValidityMs: 2 * 60 * 1000 });
  if (error) throw error;
  return data?.session || null;
};
const fetchRemoteUpdatedAt = async (table: string, targetId: string) => {
  if (!table || !targetId || table === '__rpc') return null;
  const { data, error } = await supabase.from(table).select('updated_at').eq('id', targetId).maybeSingle();
  if (error) return null;
  return (data as any)?.updated_at || null;
};
const hasRemoteConflict = async (item: any) => {
  const baseUpdatedAt = item.baseUpdatedAt || item.data?.updated_at || item.data?.base_updated_at;
  if (!baseUpdatedAt || !item.targetId || item.operation === 'INSERT') return false;
  const remoteUpdatedAt = await fetchRemoteUpdatedAt(item.conflictTable || item.table, item.conflictId || item.targetId);
  if (!remoteUpdatedAt) return false;
  const remoteMs = new Date(remoteUpdatedAt).getTime();
  const baseMs = new Date(baseUpdatedAt).getTime();
  return Number.isFinite(remoteMs) && Number.isFinite(baseMs) && remoteMs > baseMs + 1000;
};
const runQueueMutation = async (item: any) => {
  if (item.operation === 'RPC') return supabase.rpc(item.data?.fn, item.data?.args || {});
  if (await hasRemoteConflict(item)) return { error: new Error('CONFLITO_OFFLINE: este registro foi alterado em outro dispositivo antes da sincronização.') };
  if (item.operation === 'UPDATE') { const { id: _id, ...updateData } = item.data || {}; return supabase.from(item.table).update(updateData).eq('id', item.targetId); }
  if (item.operation === 'INSERT') return supabase.from(item.table).upsert(item.data);
  if (item.operation === 'DELETE') return supabase.from(item.table).delete().eq('id', item.targetId);
  return { error: new Error(`Operacao de sync desconhecida: ${item.operation}`) };
};
const fetchRemoteSnapshot = async (ownerId: string) => Promise.all([
  supabase.from('clientes').select('*').eq('owner_id', ownerId),
  supabase.from('fontes').select('*').eq('profile_id', ownerId).is('archived_at', null),
  supabase.from('contratos').select('*, parcelas(*), transacoes(*), acordos_inadimplencia!loan_id(*, acordo_parcelas(*))').eq('owner_id', ownerId),
  supabase.from('perfis').select('*').eq('owner_profile_id', ownerId),
  supabase.from('portal_files').select('*').eq('profile_id', ownerId).order('created_at', { ascending: false }),
  supabase.from('mensagens_suporte').select('id, loan_id, read, sender_type').eq('profile_id', ownerId).eq('sender_type', 'CLIENT').eq('read', false).limit(1000),
  supabase.from('payment_intents').select('*').eq('profile_id', ownerId)
]);
const mapClientFromDB = (client: any) => ({ ...client, phone: maskPhone(client.phone), document: maskDocument(client.document), fotoUrl: client.foto_url || client.fotoUrl || null });

export const syncService = {
  async syncFullData(profileId: string, ownerId: string) {
    console.log('[SYNC] Iniciando sincronização completa...', { profileId, ownerId });
    try {
      await ensureFreshAuth();
      await this.processQueue();
      let [clientsRes, sourcesRes, loansRes, staffRes, portalFilesRes, supportUnreadRes, paymentIntentsRes] = await fetchRemoteSnapshot(ownerId);
      const firstError = clientsRes.error || sourcesRes.error || loansRes.error || staffRes.error;
      if (firstError && isAuthSyncError(firstError)) { await ensureFreshAuth(true); [clientsRes, sourcesRes, loansRes, staffRes, portalFilesRes, supportUnreadRes, paymentIntentsRes] = await fetchRemoteSnapshot(ownerId); }
      if (clientsRes.error) throw clientsRes.error; if (sourcesRes.error) throw sourcesRes.error; if (loansRes.error) throw loansRes.error; if (staffRes.error) throw staffRes.error;
      if (portalFilesRes.error) console.warn('[SYNC] portal_files indisponivel:', portalFilesRes.error);
      if (supportUnreadRes.error) console.warn('[SYNC] mensagens_suporte indisponivel:', supportUnreadRes.error);
      if (paymentIntentsRes.error) console.warn('[SYNC] payment_intents indisponivel:', paymentIntentsRes.error);

      const rejectedClientIds = (clientsRes.data || []).filter((client:any)=>client.registration_status==='REJECTED').map((client:any)=>client.id);
      if (rejectedClientIds.length) await db.clientes.bulkDelete(rejectedClientIds);
      const mappedClients = (clientsRes.data || []).filter((client:any)=>client.registration_status!=='REJECTED').map(mapClientFromDB);
      await db.clientes.bulkPut(mappedClients);

      const mappedSources = (sourcesRes.data || []).map((s:any)=>({ ...s, balance: asNumber(s.balance) }));
      const remoteSourceIds = new Set(mappedSources.map((s:any)=>s.id));
      const localOwnerSources = await db.fontes.where('profile_id').equals(ownerId).toArray();
      const staleSourceIds = localOwnerSources.filter((s:any)=>!remoteSourceIds.has(s.id)).map((s:any)=>s.id);
      if (staleSourceIds.length) await db.fontes.bulkDelete(staleSourceIds);
      if (mappedSources.length) await db.fontes.bulkPut(mappedSources);

      if (staffRes.data?.length) await db.perfis.bulkPut(staffRes.data as any[]);
      const allLoans:any[]=[]; const allInstallments:any[]=[]; const allTransactions:any[]=[];
      const deletedLoanIds=readDeletedContractIds(ownerId); const portalFilesByLoan=new Map<string,any[]>();
      (portalFilesRes.data||[]).forEach((file:any)=>{if(!file?.loan_id)return; const current=portalFilesByLoan.get(file.loan_id)||[]; current.push(file); portalFilesByLoan.set(file.loan_id,current);});
      const unreadByLoan=new Map<string,number>(); (supportUnreadRes.data||[]).forEach((m:any)=>{if(m?.loan_id) unreadByLoan.set(m.loan_id,(unreadByLoan.get(m.loan_id)||0)+1);});
      const paymentIntentsByLoan=new Map<string,any[]>(); (paymentIntentsRes.data||[]).forEach((i:any)=>{if(!i?.loan_id)return; const current=paymentIntentsByLoan.get(i.loan_id)||[]; current.push(i); paymentIntentsByLoan.set(i.loan_id,current);});
      (loansRes.data||[]).forEach((l:any)=>{ if(deletedLoanIds.has(String(l.id)))return; const {parcelas,transacoes,...loanBase}=l; allLoans.push({...loanBase,payment_intents:paymentIntentsByLoan.get(l.id)||[],portal_files:portalFilesByLoan.get(l.id)||[],support_unread_count:unreadByLoan.get(l.id)||0}); if(parcelas)allInstallments.push(...parcelas); if(transacoes)allTransactions.push(...transacoes); });
      await db.contratos.bulkPut(allLoans); if(allInstallments.length)await db.parcelas.bulkPut(allInstallments); if(allTransactions.length)await db.transacoes.bulkPut(allTransactions); if(portalFilesRes.data?.length)await db.portal_files.bulkPut(portalFilesRes.data as any[]);
      if(deletedLoanIds.size){const ids=Array.from(deletedLoanIds); await Promise.all([db.contratos.bulkDelete(ids),...ids.map((id:string)=>db.parcelas.where('loan_id').equals(id).delete()),...ids.map((id:string)=>db.transacoes.where('loan_id').equals(id).delete()),...ids.map((id:string)=>db.portal_files.where('loan_id').equals(id).delete())]);}
      const remoteLoanIds=new Set(allLoans.map(l=>l.id).filter(Boolean)); const pendingQueue=await db.write_queue.where('status').anyOf(['PENDING','FAILED']).toArray(); const protectedIds=new Set(pendingQueue.filter(i=>i.table==='contratos'&&i.operation!=='DELETE').map(i=>i.targetId||i.data?.id).filter(Boolean));
      const staleLoans=await db.contratos.where('owner_id').equals(ownerId).filter((loan:any)=>!remoteLoanIds.has(loan.id)&&!protectedIds.has(loan.id)).toArray();
      if(staleLoans.length){const ids=staleLoans.map((l:any)=>l.id).filter(Boolean); await Promise.all([...ids.map((id:string)=>db.parcelas.where('loan_id').equals(id).delete()),...ids.map((id:string)=>db.transacoes.where('loan_id').equals(id).delete())]); await db.contratos.bulkDelete(ids);}
      await db.sync_metadata.put({key:'last_full_sync',last_sync:new Date().toISOString(),profile_id:profileId});
      console.log('[SYNC] Sincronização concluída com sucesso.'); return true;
    } catch(error){console.error('[SYNC] Erro durante a sincronização:',error); throw error;}
  },
  async getLocalData(ownerId:string){
    const [loans,clients,allSources]=await Promise.all([db.contratos.where('owner_id').equals(ownerId).toArray(),db.clientes.where('owner_id').equals(ownerId).toArray(),db.fontes.where('profile_id').equals(ownerId).toArray()]);
    const sources=allSources.filter((source:any)=>!source.archived_at); const visibleLoans=filterDeletedLoans(ownerId,loans); const loanIds=visibleLoans.map((l:any)=>l.id).filter(Boolean);
    const [allInstallments,allTransactions]=loanIds.length?await Promise.all([db.parcelas.where('loan_id').anyOf(loanIds).toArray(),db.transacoes.where('loan_id').anyOf(loanIds).toArray()]):[[],[]];
    const installmentsByLoan=new Map<string,any[]>(); allInstallments.forEach((i:any)=>{const c=installmentsByLoan.get(i.loan_id)||[];c.push(i);installmentsByLoan.set(i.loan_id,c);});
    const transactionsByLoan=new Map<string,any[]>(); allTransactions.forEach((t:any)=>{const c=transactionsByLoan.get(t.loan_id)||[];c.push(t);transactionsByLoan.set(t.loan_id,c);});
    const enrichedLoans=visibleLoans.map((l:any)=>mapLoanFromDB({...l,parcelas:installmentsByLoan.get(l.id)||[],transacoes:transactionsByLoan.get(l.id)||[],portal_files:l.portal_files||[]},clients));
    return {loans:enrichedLoans,clients:clients.filter((c:any)=>c.registration_status!=='REJECTED').map(mapClientFromDB),sources};
  },
  async enqueueOperation(params:{table:string;operation:'INSERT'|'UPDATE'|'DELETE'|'RPC';data:any;id:string;baseUpdatedAt?:string|null;conflictTable?:string;conflictId?:string;}){
    const {table,operation,data,id}=params; const tableInstance=(db as any)[table]; let baseUpdatedAt=params.baseUpdatedAt||data?.updated_at||data?.base_updated_at||null;
    if(tableInstance){if(!baseUpdatedAt){try{const previous=await tableInstance.get(id);baseUpdatedAt=previous?.updated_at||previous?.updatedAt||null;}catch{}} if(operation==='DELETE')await tableInstance.delete(id); else if(operation==='UPDATE')await tableInstance.update(id,data); else await tableInstance.put(data);}
    const queueItem={id:crypto.randomUUID(),table,operation,data,targetId:id,baseUpdatedAt,conflictTable:params.conflictTable||null,conflictId:params.conflictId||null,status:'PENDING',attempts:0,maxAttempts:7,nextRetryAt:new Date().toISOString(),timestamp:new Date().toISOString()}; await db.write_queue.put(queueItem); this.processQueue().catch(err=>console.warn('[SYNC] Queue processing failed:',err)); return true;
  },
  async processQueue(){
    if(typeof navigator!=='undefined'&&!navigator.onLine)return; const session=await ensureFreshAuth().catch(err=>{console.warn('[SYNC] Sessao indisponivel para processar fila:',err?.message||err);return null;}); if(!session)return;
    const now=new Date().toISOString(); const items=await db.write_queue.where('status').anyOf(['PENDING','FAILED']).and(item=>item.nextRetryAt<=now).toArray(); if(!items.length)return; console.log(`[SYNC] Processando fila de escrita (${items.length} itens)...`);
    for(const item of items){try{let {error}=await runQueueMutation(item);if(error&&isAuthSyncError(error)){await ensureFreshAuth(true);const retry=await runQueueMutation(item);error=retry.error;}if(error)throw error;await db.write_queue.delete(item.id);console.log(`[SYNC] Item ${item.id} sincronizado com sucesso.`);}catch(err:any){const attempts=(item.attempts||0)+1,maxAttempts=item.maxAttempts||7;console.error(`[SYNC] Falha na tentativa ${attempts}/${maxAttempts} para item ${item.id}:`,err);const isConflict=String(err?.message||'').includes('CONFLITO_OFFLINE');if(isConflict){await db.write_queue.update(item.id,{status:'CONFLICT',attempts,lastError:err?.message||String(err)});continue;}if(attempts>=maxAttempts){await db.write_queue.update(item.id,{status:'DEAD',attempts,lastError:err?.message||String(err)});continue;}const delayMs=Math.min(60000,1000*Math.pow(2,attempts));await db.write_queue.update(item.id,{status:'FAILED',attempts,lastError:err?.message||String(err),nextRetryAt:new Date(Date.now()+delayMs).toISOString()});}}
  }
};