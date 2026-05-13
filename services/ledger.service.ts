/**
 * Ponte de compatibilidade
 *
 * Este arquivo existe para NÃO quebrar imports antigos do projeto.
 * Qualquer lugar que faça:
 *   import { ledgerService } from '@/services/ledger.service'
 * continuará funcionando normalmente.
 *
 * Toda a lógica real está agora em:
 *   src/services/ledger/ledgerService.ts
 */
export { ledgerService } from './ledger/ledgerService';
export type { LedgerActionType } from './ledger/ledgerService';