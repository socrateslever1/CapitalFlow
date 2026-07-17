import { CapitalSource } from '../types';

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function isTestSource(source?: Partial<CapitalSource> | null): boolean {
  if (!source) return false;

  const name = normalize((source as any).name ?? (source as any).nome);
  const description = normalize((source as any).description ?? (source as any).descricao);
  const type = normalize((source as any).type ?? (source as any).tipo);

  return (
    type === 'test' ||
    type === 'teste' ||
    type === 'sandbox' ||
    name.includes('carteira teste') ||
    name.includes('teste') ||
    name.includes('sandbox') ||
    name.includes('homolog') ||
    description.includes('carteira teste') ||
    description.includes('sandbox') ||
    description.includes('homolog')
  );
}

export function filterOperationalSources<T extends Partial<CapitalSource>>(sources: T[] = []): T[] {
  return sources.filter((source) => !isTestSource(source));
}
