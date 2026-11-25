import {
  Baby, Briefcase, Bus, CalendarSync, Car, Coffee, Drama, Droplet, Dumbbell, Ellipsis, Film, Fuel, Gift,
  GraduationCap, HeartPulse, House, Landmark, PawPrint, Percent, Pill, Plane, Receipt, Repeat, Shirt,
  ShoppingBag, ShoppingCart, Smartphone, Sparkles, Tag, Utensils, Wifi, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Identidade visual das categorias de despesa: ícone (lucide-react, licença ISC)
 * e cor própria do CapitalFlow. Somente apresentação; não altera a categoria salva.
 */
export type WalletCategoryVisual = {
  icon: LucideIcon;
  /** Cor do ícone e do anel medidor (hex, legível no tema escuro). */
  color: string;
  /** Fundo do círculo do ícone. */
  background: string;
};

const tone = (color: string): Pick<WalletCategoryVisual, 'color' | 'background'> =>
  ({ color, background: color + '26' });

const VISUALS: Array<{ keys: string[]; icon: LucideIcon; color: string }> = [
  { keys: ['alimentacao', 'comida', 'restaurante', 'refeicao', 'lanche', 'delivery', 'ifood'], icon: Utensils, color: '#F97316' },
  { keys: ['supermercado', 'mercado', 'feira', 'hortifruti'], icon: ShoppingCart, color: '#F59E0B' },
  { keys: ['padaria', 'cafe', 'cafeteria'], icon: Coffee, color: '#D97706' },
  { keys: ['transporte', 'uber', '99', 'taxi', 'corrida', 'aplicativo de transporte'], icon: Car, color: '#38BDF8' },
  { keys: ['onibus', 'transporte publico', 'metro'], icon: Bus, color: '#0EA5E9' },
  { keys: ['combustivel', 'gasolina', 'posto'], icon: Fuel, color: '#06B6D4' },
  { keys: ['moradia', 'casa', 'aluguel', 'condominio'], icon: House, color: '#84CC16' },
  { keys: ['energia', 'luz', 'contas de consumo'], icon: Zap, color: '#FACC15' },
  { keys: ['agua', 'saneamento'], icon: Droplet, color: '#60A5FA' },
  { keys: ['internet', 'telefone', 'celular', 'telefonia'], icon: Wifi, color: '#818CF8' },
  { keys: ['saude', 'medico', 'hospital', 'clinica', 'plano de saude'], icon: HeartPulse, color: '#F43F5E' },
  { keys: ['farmacia', 'drogaria', 'remedio', 'medicamento'], icon: Pill, color: '#FB7185' },
  { keys: ['academia', 'esporte', 'fitness'], icon: Dumbbell, color: '#10B981' },
  { keys: ['lazer', 'entretenimento', 'diversao', 'passeio'], icon: Drama, color: '#14B8A6' },
  { keys: ['cinema', 'streaming', 'filmes'], icon: Film, color: '#A855F7' },
  { keys: ['viagem', 'viagens', 'passagem', 'hotel'], icon: Plane, color: '#EC4899' },
  { keys: ['servicos', 'manutencao', 'reparo'], icon: Wrench, color: '#94A3B8' },
  { keys: ['assinaturas', 'assinatura', 'mensalidade'], icon: Repeat, color: '#8B5CF6' },
  { keys: ['eletronicos', 'tecnologia', 'aplicativos'], icon: Smartphone, color: '#6366F1' },
  { keys: ['compras', 'shopping', 'loja'], icon: ShoppingBag, color: '#E879F9' },
  { keys: ['vestuario', 'roupas', 'roupa', 'calcados'], icon: Shirt, color: '#F472B6' },
  { keys: ['beleza', 'cuidados pessoais', 'salao'], icon: Sparkles, color: '#FDA4AF' },
  { keys: ['presentes', 'presente', 'doacao', 'doacoes'], icon: Gift, color: '#EF4444' },
  { keys: ['educacao', 'escola', 'curso', 'faculdade', 'livros'], icon: GraduationCap, color: '#3B82F6' },
  { keys: ['filhos', 'bebe', 'criancas', 'brinquedos'], icon: Baby, color: '#FBBF24' },
  { keys: ['pets', 'pet', 'animais', 'veterinario'], icon: PawPrint, color: '#A3E635' },
  { keys: ['trabalho', 'negocios', 'escritorio'], icon: Briefcase, color: '#64748B' },
  { keys: ['emprestimos', 'emprestimo', 'financiamento', 'banco', 'tarifas', 'tarifa'], icon: Landmark, color: '#7C3AED' },
  { keys: ['juros e encargos', 'juros', 'encargos'], icon: Percent, color: '#DC2626' },
  { keys: ['parcelamento de fatura', 'parcelamento'], icon: CalendarSync, color: '#C2410C' },
  { keys: ['impostos e taxas', 'impostos', 'imposto', 'taxas', 'contas'], icon: Receipt, color: '#F87171' },
  { keys: ['outros', 'sem categoria', 'diversos', 'demais categorias', 'demais'], icon: Ellipsis, color: '#9CA3AF' },
];

/** Nome comparável: minúsculo, sem acentos e sem espaços extras. */
export const normalizeCategoryKey = (name: string | null | undefined): string =>
  String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();

const BY_KEY = new Map<string, WalletCategoryVisual>();
for (const entry of VISUALS) {
  for (const key of entry.keys) BY_KEY.set(key, { icon: entry.icon, ...tone(entry.color) });
}

/** Cores estáveis para categorias criadas pelo usuário (mesmo nome, mesma cor). */
const CUSTOM_COLORS = ['#22D3EE', '#F59E0B', '#A78BFA', '#34D399', '#F472B6', '#60A5FA', '#FB923C', '#4ADE80'];
const stableIndex = (key: string, size: number): number => {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % size;
};

export function getWalletCategoryVisual(name: string | null | undefined): WalletCategoryVisual {
  const key = normalizeCategoryKey(name);
  const exact = BY_KEY.get(key);
  if (exact) return exact;
  // Categoria composta ("Alimentação fora de casa"): usa a primeira palavra conhecida.
  for (const word of key.split(/[^a-z0-9]+/)) {
    const partial = word && BY_KEY.get(word);
    if (partial) return partial;
  }
  if (!key) return BY_KEY.get('outros')!;
  return { icon: Tag, ...tone(CUSTOM_COLORS[stableIndex(key, CUSTOM_COLORS.length)]) };
}
