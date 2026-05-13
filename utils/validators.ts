
import { onlyDigits } from './formatters';

// CPF validation (Brazil)
export const isValidCPF = (cpfRaw: string) => {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11) return false;
  
  // Permite CPF zerado para clientes legados (000.000.000-00)
  // Nota: O Login no portal bloqueia este CPF especificamente.
  if (cpf === '00000000000') return true;

  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
};

// CNPJ validation (Brazil)
export const isValidCNPJ = (cnpjRaw: string) => {
  const cnpj = onlyDigits(cnpjRaw);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (base: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Number(base[i]) * weights[i];
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const base12 = cnpj.slice(0, 12);
  const d1 = calc(base12, [5,4,3,2,9,8,7,6,5,4,3,2]);
  const base13 = base12 + String(d1);
  const d2 = calc(base13, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj === base12 + String(d1) + String(d2);
};

export const isValidCPForCNPJ = (doc: string) => {
  const d = onlyDigits(doc);
  if (!d) return true; // Aceita vazio
  if (d.length === 11) return isValidCPF(d);
  if (d.length === 14) return isValidCNPJ(d);
  return false;
};
