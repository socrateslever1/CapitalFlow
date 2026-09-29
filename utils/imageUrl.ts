export function normalizeWalletImageReference(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('storage://')) return raw;
  if (raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
