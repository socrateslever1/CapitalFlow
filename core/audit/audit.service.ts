
import { supabase } from '../../lib/supabase';
import { generateUUID } from '../../utils/generators';
import { AuditLogEntry } from './audit.types';

export const auditService = {
  async log(entry: Omit<AuditLogEntry, 'id' | 'date'>) {
    const payload: AuditLogEntry = {
      id: generateUUID(),
      date: new Date().toISOString(),
      ...entry
    };
    
    const { error } = await supabase.from('transacoes').insert([payload]);
    if (error) console.error('Falha ao registrar auditoria:', error);
    return payload;
  }
};
