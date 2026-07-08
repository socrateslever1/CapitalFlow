
import { supabase, getSynchronizedSession } from '../lib/supabase';
import { db } from './offline/adminOfflineStore';
import { mapLoanFromDB } from './adapters/dbAdapters';
import { maskPhone, maskDocument } from '../utils/formatters';
import { asNumber } from '../utils/safe';

const AUTH_ERROR_PATTERNS = [
  'jwt expired',
  'invalid jwt',
  'token is expired',
  'auth session missing',
  'refresh token',
  'session not found',
  'failed verification'
];

export const isAuthSyncError = (error: any) => {
  const text = String(error?.message || error?.error_description || error || '').toLowerCase();
  return AUTH_ERROR_PATTERNS.some(pattern => text.includes(pattern));
};

const ensureFreshAuth = async (forceRefresh = false) => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  const { data, error } = await getSynchronizedSession({
    forceRefresh,
    minValidityMs: 2 * 60 * 1000
  });
  if (error) throw error;
  return data?.session || null;
};

const fetchRemoteUpdatedAt = async (table: string, targetId: string) => {
  if (!table || !targetId || table === '__rpc') return null;
  const { data, error } = await supabase
    .from(table)
    .select('updated_at')
    .eq('id', targetId)
    .maybeSingle();
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
  if (item.operation === 'RPC') {
    return supabase.rpc(item.data?.fn, item.data?.args || {});
  }

  if (await hasRemoteConflict(item)) {
    return { error: new Error('CONFLITO_OFFLINE: este registro foi alterado em outro dispositivo antes da sincronização.') };
  }

  if (item.operation === 'UPDATE') {
    const { id: _id, ...updateData } = item.data || {};
    return supabase.from(item.table).update(updateData).eq('id', item.targetId);
  }

  if (item.operation === 'INSERT') {
    return supabase.from(item.table).upsert(item.data);
  }

  if (item.operation === 'DELETE') {
    return supabase.from(item.table).delete().eq('id', item.targetId);
  }

  return { error: new Error(`Operacao de sync desconhecida: ${item.operation}`) };
};

const fetchRemoteSnapshot = async (ownerId: string) => {
  return Promise.all([
    supabase.from('clientes').select('*').eq('owner_id', ownerId),
    supabase.from('fontes').select('*').eq('profile_id', ownerId),
    supabase
      .from('contratos')
      .select('*, parcelas(*), transacoes(*), acordos_inadimplencia!loan_id(*, acordo_parcelas(*))')
      .eq('owner_id', ownerId),
    supabase.from('perfis').select('*').eq('owner_profile_id', ownerId),
    supabase.from('payment_intents').select('*').eq('profile_id', ownerId),
    supabase.from('portal_files').select('*').eq('profile_id', ownerId)
  ]);
};

const mapClientFromDB = (client: any) => ({
  ...client,
  phone: maskPhone(client.phone),
  document: maskDocument(client.document),
  fotoUrl: client.foto_url || client.fotoUrl || null,
});

export const syncService = {
  /**
   * Sincroniza todos os dados de um perfil do Supabase para o Dexie
   */
  async syncFullData(profileId: string, ownerId: string) {
    console.log('[SYNC] Iniciando sincronização completa...', { profileId, ownerId });

    try {
      await ensureFreshAuth();
      await this.processQueue();

      // 1. Buscar tudo em paralelo para velocidade
      let [clientsRes, sourcesRes, loansRes, staffRes, paymentIntentsRes, portalFilesRes] = await fetchRemoteSnapshot(ownerId);

      const firstError = clientsRes.error || sourcesRes.error || loansRes.error || staffRes.error || paymentIntentsRes.error || portalFilesRes.error;
      if (firstError && isAuthSyncError(firstError)) {
        await ensureFreshAuth(true);
        [clientsRes, sourcesRes, loansRes, staffRes, paymentIntentsRes, portalFilesRes] = await fetchRemoteSnapshot(ownerId);
      }

      if (clientsRes.error) throw clientsRes.error;
      if (sourcesRes.error) throw sourcesRes.error;
      if (loansRes.error) throw loansRes.error;
      if (staffRes.error) throw staffRes.error;
      if (paymentIntentsRes.error) throw paymentIntentsRes.error;
      if (portalFilesRes.error) throw portalFilesRes.error;

      // 2. Salvar Clientes
      const mappedClients = (clientsRes.data || []).map(mapClientFromDB);
      await db.clientes.bulkPut(mappedClients);

      // 3. Salvar Fontes
      const mappedSources = (sourcesRes.data || []).map(s => ({
        ...s,
        balance: asNumber(s.balance)
      }));
      await db.fontes.bulkPut(mappedSources);

      if (staffRes.data?.length) {
        await db.perfis.bulkPut(staffRes.data as any[]);
      }

      // 4. Salvar Contratos e suas sub-entidades
      // No Dexie, preferimos salvar as parcelas e transações em tabelas separadas para performance de busca
      const allLoans: any[] = [];
      const allInstallments: any[] = [];
      const allTransactions: any[] = [];

      (loansRes.data || []).forEach(l => {
        // O contrato em si (sem o aninhamento pesado para a tabela de busca)
        // Mantemos acordos_inadimplencia no loanBase pois são pequenos e vitais para a UI
        const { parcelas, transacoes, ...loanBase } = l;
        allLoans.push(loanBase);

        if (parcelas) allInstallments.push(...parcelas);
        if (transacoes) allTransactions.push(...transacoes);
      });

      await db.contratos.bulkPut(allLoans);
      if (allInstallments.length > 0) await db.parcelas.bulkPut(allInstallments);
      if (allTransactions.length > 0) await db.transacoes.bulkPut(allTransactions);
      await db.payment_intents.where('profile_id').equals(ownerId).delete();
      if (paymentIntentsRes.data?.length) {
        await db.payment_intents.bulkPut(paymentIntentsRes.data as any[]);
      }
      await db.portal_files.where('profile_id').equals(ownerId).delete();
      if (portalFilesRes.data?.length) {
        await db.portal_files.bulkPut(portalFilesRes.data as any[]);
      }

      // 5. Atualizar metadados de sincronização
      const remoteLoanIds = new Set(allLoans.map((loan) => loan.id).filter(Boolean));
      const pendingQueue = await db.write_queue.where('status').anyOf(['PENDING', 'FAILED']).toArray();
      const protectedIds = new Set(
        pendingQueue
          .filter((item) => item.table === 'contratos' && item.operation !== 'DELETE')
          .map((item) => item.targetId || item.data?.id)
          .filter(Boolean)
      );
      const staleLoans = await db.contratos
        .where('owner_id')
        .equals(ownerId)
        .filter((loan: any) => !remoteLoanIds.has(loan.id) && !protectedIds.has(loan.id))
        .toArray();

      if (staleLoans.length > 0) {
        const staleIds = staleLoans.map((loan: any) => loan.id).filter(Boolean);
        await Promise.all([
          ...staleIds.map((id: string) => db.parcelas.where('loan_id').equals(id).delete()),
          ...staleIds.map((id: string) => db.transacoes.where('loan_id').equals(id).delete()),
        ]);
        await db.contratos.bulkDelete(staleIds);
      }

      await db.sync_metadata.put({
        key: 'last_full_sync',
        last_sync: new Date().toISOString(),
        profile_id: profileId
      });

      console.log('[SYNC] Sincronização concluída com sucesso.');
      return true;
    } catch (error) {
      console.error('[SYNC] Erro durante a sincronização:', error);
      throw error;
    }
  },

  /**
   * Obtém os dados do Dexie de forma reativa (Source of Truth)
   */
  async getLocalData(ownerId: string) {
    const [loans, clients, sources, paymentIntents, portalFiles] = await Promise.all([
      db.contratos.where('owner_id').equals(ownerId).toArray(),
      db.clientes.where('owner_id').equals(ownerId).toArray(),
      db.fontes.where('profile_id').equals(ownerId).toArray(),
      db.payment_intents.where('profile_id').equals(ownerId).toArray(),
      db.portal_files.where('profile_id').equals(ownerId).toArray()
    ]);

    // Precisamos remontar os contratos com suas parcelas para manter compatibilidade com o frontend
    // Nota: Em um app gigante, faríamos isso sob demanda, mas aqui mantemos o contrato "gordo"
    const enrichedLoans = await Promise.all(loans.map(async (l) => {
      const [parcelas, transacoes, loanPaymentIntents, loanPortalFiles] = await Promise.all([
        db.parcelas.where('loan_id').equals(l.id).toArray(),
        db.transacoes.where('loan_id').equals(l.id).toArray(),
        Promise.resolve(paymentIntents.filter((intent: any) => intent.loan_id === l.id)),
        Promise.resolve(portalFiles.filter((file: any) => file.loan_id === l.id))
      ]);

      // Mapeia para o formato do Frontend usando o adapter existente
      return mapLoanFromDB({ ...l, parcelas, transacoes, payment_intents: loanPaymentIntents, portal_files: loanPortalFiles }, clients);
    }));

    return {
      loans: enrichedLoans,
      clients: clients.map(mapClientFromDB),
      sources
    };
  },

  /**
   * Enfileira uma operação para execução posterior (ou imediata se online)
   * Implementa o padrão "Optimistic UI + Background Sync" com Backoff
   */
  async enqueueOperation(params: {
    table: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'RPC';
    data: any;
    id: string;
    baseUpdatedAt?: string | null;
    conflictTable?: string;
    conflictId?: string;
  }) {
    const { table, operation, data, id } = params;

    // 1. Atualizar Dexie IMEDIATAMENTE (Optimistic)
    const tableInstance = (db as any)[table];
    let baseUpdatedAt = params.baseUpdatedAt || data?.updated_at || data?.base_updated_at || null;
    if (tableInstance) {
      if (!baseUpdatedAt) {
        try {
          const previous = await tableInstance.get(id);
          baseUpdatedAt = previous?.updated_at || previous?.updatedAt || null;
        } catch {}
      }
      if (operation === 'DELETE') {
        await tableInstance.delete(id);
      } else if (operation === 'UPDATE') {
        // Usa update para mergear dados parciais e não apagar o objeto inteiro no Dexie
        await tableInstance.update(id, data);
      } else {
        await tableInstance.put(data);
      }
    }

    // 2. Adicionar na Fila de Escrita
    const queueItem = {
      id: crypto.randomUUID(),
      table,
      operation,
      data,
      targetId: id,
      baseUpdatedAt,
      conflictTable: params.conflictTable || null,
      conflictId: params.conflictId || null,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 7,
      nextRetryAt: new Date().toISOString(),
      timestamp: new Date().toISOString()
    };
    await db.write_queue.put(queueItem);

    // 3. Tentar processar a fila em background
    this.processQueue().catch(err => console.warn('[SYNC] Queue processing failed:', err));

    return true;
  },

  /**
   * Processa a fila de escritas pendentes com lógica de Backoff
   */
  async processQueue() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const session = await ensureFreshAuth().catch(err => {
      console.warn('[SYNC] Sessao indisponivel para processar fila:', err?.message || err);
      return null;
    });

    if (!session) return;

    // Busca itens que não estão DEAD e cujo tempo de retry já passou
    const now = new Date().toISOString();
    const items = await db.write_queue
      .where('status')
      .anyOf(['PENDING', 'FAILED'])
      .and(item => item.nextRetryAt <= now)
      .toArray();

    if (items.length === 0) return;

    console.log(`[SYNC] Processando fila de escrita (${items.length} itens)...`);

    for (const item of items) {
      try {
        let { error } = await runQueueMutation(item);

        // Simulação de delay para evitar race conditions
        await new Promise(resolve => setTimeout(resolve, 100));

        if (error && isAuthSyncError(error)) {
          await ensureFreshAuth(true);
          const retry = await runQueueMutation(item);
          error = retry.error;
        }

        if (error) throw error;

        // Sucesso: Remove da fila
        await db.write_queue.delete(item.id);
        console.log(`[SYNC] Item ${item.id} sincronizado com sucesso.`);
      } catch (err: any) {
        const attempts = (item.attempts || 0) + 1;
        const maxAttempts = item.maxAttempts || 7;

        console.error(`[SYNC] Falha na tentativa ${attempts}/${maxAttempts} para item ${item.id}:`, err);

        const isConflict = String(err?.message || '').includes('CONFLITO_OFFLINE');

        if (isConflict) {
          await db.write_queue.update(item.id, {
            status: 'CONFLICT',
            attempts,
            lastError: err?.message || String(err),
            lastAttemptAt: new Date().toISOString()
          });
        } else if (attempts >= maxAttempts) {
          // Marca como DEAD se excedeu tentativas
          await db.write_queue.update(item.id, {
            status: 'DEAD',
            attempts,
            lastError: err?.message || String(err),
            lastAttemptAt: new Date().toISOString()
          });
        } else {
          // Lógica de Backoff Exponencial (2^attempts * 1000ms) com teto de 5min
          const backoffSec = Math.min(Math.pow(2, attempts), 300);
          const nextRetry = new Date(Date.now() + backoffSec * 1000).toISOString();

          await db.write_queue.update(item.id, {
            status: 'FAILED',
            attempts,
            nextRetryAt: nextRetry,
            lastError: err?.message || String(err),
            lastAttemptAt: new Date().toISOString()
          });
        }

        // Para o processamento desta leva se houver erro de rede global
        if (!navigator.onLine) break;
      }
    }
  },

  /**
   * Força o re-enfileiramento de itens mortos (Manual Retry)
   */
  async retryDeadItems() {
    const deadItems = await db.write_queue.where('status').equals('DEAD').toArray();
    for (const item of deadItems) {
      await db.write_queue.update(item.id, {
        status: 'PENDING',
        attempts: 0,
        nextRetryAt: new Date().toISOString()
      });
    }
    this.processQueue();
    return deadItems.length;
  }
};
