import { Client } from '../../types';
import { onlyDigits } from '../../utils/formatters';

export const filterClients = (clients: Client[], clientSearchTerm: string): Client[] => {
  if (!clientSearchTerm) return clients;
  const lower = clientSearchTerm.toLowerCase().trim();
  const ld = (v: any) => String(v || '').toLowerCase();
  const digits = onlyDigits(clientSearchTerm);
  
  return clients.filter(c => {
    return (
      ld(c.name).includes(lower) ||
      ld(c.phone).includes(lower) ||
      ld(c.email).includes(lower) ||
      ld((c as any).document).includes(lower) ||
      ld((c as any).cpf).includes(lower) ||
      ld((c as any).cnpj).includes(lower) ||
      ld((c as any).client_number).includes(lower) ||
      ld((c as any).access_code).includes(lower) ||
      (digits && (onlyDigits(c.phone || '').includes(digits) || onlyDigits((c as any).cpf || '').includes(digits) || onlyDigits((c as any).cnpj || '').includes(digits) || onlyDigits((c as any).document || '').includes(digits)))
    );
  });
};