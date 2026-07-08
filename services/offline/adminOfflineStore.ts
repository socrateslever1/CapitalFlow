
import Dexie, { type Table } from 'dexie';
import { Loan, Client, CapitalSource, UserProfile } from '../../types';

export class CapitalFlowDB extends Dexie {
  perfis!: Table<UserProfile>;
  contratos!: Table<any>; // Usando any para facilitar o mapeamento do DB
  parcelas!: Table<any>;
  transacoes!: Table<any>;
  clientes!: Table<Client>;
  fontes!: Table<CapitalSource>;
  sync_metadata!: Table<{ key: string; last_sync: string; profile_id: string }>;
  write_queue!: Table<any>;

  constructor() {
    super('CapitalFlowDB');
    this.version(1).stores({
      perfis: 'id',
      contratos: 'id, owner_id, client_id, status, last_billed_at',
      parcelas: 'id, loan_id, profile_id, status, data_vencimento',
      transacoes: 'id, loan_id, profile_id, date, type',
      clientes: 'id, owner_id, name, document, phone',
      fontes: 'id, profile_id, name',
      sync_metadata: 'key, profile_id',
      write_queue: 'id, table, operation, status, nextRetryAt, timestamp'
    });
  }
}

export const db = new CapitalFlowDB();
