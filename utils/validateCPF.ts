// src/utils/validateCPF.ts

export function onlyDigits(v: string): string {
  return (v ?? '').replace(/\D/g, '');
}

/**
 * Valida CPF (11 dígitos) com dígitos verificadores.
 * Rejeita CPFs com todos os dígitos iguais.
 */
export function isValidCPF(input: string): boolean {
  const cpf = onlyDigits(input);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (factor - i);
    }
    let mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcDigit(cpf.slice(0, 9), 10);
  const d2 = calcDigit(cpf.slice(0, 10), 11);

  return cpf === cpf.slice(0, 9) + String(d1) + String(d2);
}