

import { asString, asNumber } from './safe';

export const maskPhone = (value: string | undefined | null, isStealth: boolean = false) => {
  if (isStealth) return "(••) •••••-••••";
  const safeValue = asString(value);
  return safeValue.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d)(\d{4})$/, '$1-$2').slice(0, 15);
};

export const maskDocument = (value: string | undefined | null, isStealth: boolean = false) => {
  if (isStealth) return "•••.•••.•••-••";
  const clean = asString(value).replace(/\D/g, '');
  if (clean.length <= 11) {
    return clean.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').slice(0, 14);
  }
  return clean.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2').slice(0, 18);
};

export const onlyDigits = (v: string | undefined | null) => asString(v).replace(/\D/g, '');

/**
 * Limpa uma string de input numérico para não ter zeros à esquerda de inteiros,
 * resolvendo o problema de digitar "500" e obter "0500".
 */
export const cleanNumberStr = (value: string | undefined | null): string => {
  if (!value) return '';
  const str = String(value);
  // Se for apenas um zero, ou "0." / "0.x", mantém
  if (str === '0' || str.startsWith('0.')) return str;
  // Se começar com zero e outro número em seguida, remove os zeros à esquerda
  return str.replace(/^0+(?=\d)/, '');
};

export const formatMoney = (value: number | string | undefined | null, isStealth: boolean = false) => {
  if (isStealth) return "R$ ••••";
  const num = asNumber(value);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/**
 * Converte valor numérico para extenso em Real (BRL)
 */
export const numberToWordsBRL = (amount: number): string => {
  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const tens = ["", "dez", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function convertGroup(n: number) {
    if (n === 100) return "cem";
    let output = "";
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    if (h > 0) output += hundreds[h];
    if (t > 1) {
      if (h > 0) output += " e ";
      output += tens[t];
      if (u > 0) output += " e " + units[u];
    } else if (t === 1) {
      if (h > 0) output += " e ";
      output += teens[u];
    } else if (u > 0) {
      if (h > 0) output += " e ";
      output += units[u];
    }
    return output;
  }

  if (amount === 0) return "zero reais";
  
  const integerPart = Math.floor(amount);
  const centsPart = Math.round((amount - integerPart) * 100);

  let result = "";

  if (integerPart > 0) {
    if (integerPart >= 1000000) {
        const millions = Math.floor(integerPart / 1000000);
        result += convertGroup(millions) + (millions > 1 ? " milhões" : " milhão");
        const remaining = integerPart % 1000000;
        if (remaining > 0) result += (remaining < 100 ? " e " : " ") + convertGroup(Math.floor(remaining / 1000)) + " mil";
    } else if (integerPart >= 1000) {
        const thousands = Math.floor(integerPart / 1000);
        result += (thousands === 1 ? "" : convertGroup(thousands)) + " mil";
        const remaining = integerPart % 1000;
        if (remaining > 0) result += (remaining < 100 ? " e " : " ") + convertGroup(remaining);
    } else {
        result += convertGroup(integerPart);
    }
    result += integerPart > 1 ? " reais" : " real";
  }

  if (centsPart > 0) {
    if (result) result += " e ";
    result += convertGroup(centsPart) + (centsPart > 1 ? " centavos" : " centavo");
  }

  return result.charAt(0).toUpperCase() + result.slice(1);
};

export const parseCurrency = (val: string | number | undefined | null): number => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (str.includes('.') && str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    if (str.includes(',')) return parseFloat(str.replace(',', '.')) || 0;
    return parseFloat(str) || 0;
};

export const normalizeBrazilianPhone = (value: string | undefined | null): string => {
  const safeVal = asString(value);
  let digits = safeVal.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.substring(2);
  if (digits.length < 8) return maskPhone(digits);
  const suffix = digits.slice(-8);
  let prefix = digits.slice(0, -8);
  if (prefix.endsWith('9') && prefix.length >= 3) prefix = prefix.slice(0, -1);
  const ddd = prefix.slice(-2);
  const fullNumber = `${ddd}9${suffix}`;
  return fullNumber.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
};

// Added isTestClientName to fix "no exported member" errors in contracts.service.ts and useClientController.ts
export const isTestClientName = (name: string | undefined | null): boolean => {
  return asString(name).toUpperCase().includes('TESTE');
};

export const normalizeName = (name: string | undefined | null): string => {
  return asString(name)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^\w\s]/gi, '') // Remove pontuação
    .replace(/\s+/g, ' '); // Remove múltiplos espaços
};

export const capitalizeName = (name: string | undefined | null): string => {
  if (!name) return '';
  const particles = ['de', 'da', 'do', 'dos', 'das', 'e'];
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && particles.includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
};

export const formatShortName = (name: string | undefined | null): string => {
  if (!name) return '';
  const capitalized = capitalizeName(name);
  const parts = capitalized.split(/\s+/);
  if (parts.length <= 2) return capitalized;
  
  // Return first and last name
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

export const formatFirstAndSecondName = (name: string | undefined | null): string => {
  if (!name) return '';
  const capitalized = capitalizeName(name);
  const parts = capitalized.split(/\s+/);
  if (parts.length <= 1) return capitalized;
  return `${parts[0]} ${parts[1]}`;
};
