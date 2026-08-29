import { supabase } from '../lib/supabase';

export type StorageReference = { bucket: string; path: string };

export function toStorageReference(bucket: string, path: string): string {
  return `storage://${bucket}/${path}`;
}

export function parseStorageReference(value?: string | null): StorageReference | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (raw.startsWith('storage://')) {
    const [bucket, ...parts] = raw.slice('storage://'.length).split('/');
    return bucket && parts.length
      ? { bucket: decodeURIComponent(bucket), path: parts.join('/') }
      : null;
  }

  const match = raw.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
  return match
    ? { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) }
    : null;
}

/**
 * Resolve uma referência persistente do Supabase Storage para uma URL utilizável
 * pelo navegador. O banco guarda somente storage://bucket/path; URLs assinadas
 * nunca são persistidas porque expiram.
 */
export async function resolveAuthenticatedStorageUrl(value?: string | null): Promise<string | null> {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const reference = parseStorageReference(raw);
  if (!reference) return raw;

  const { data, error } = await supabase.storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, 60 * 60);

  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }

  // Fallback autenticado: útil em ambientes em que a assinatura de URL é
  // recusada por política, mas o usuário autenticado pode ler o objeto.
  const { data: blob, error: downloadError } = await supabase.storage
    .from(reference.bucket)
    .download(reference.path);

  if (downloadError || !blob) {
    const reason = downloadError?.message || error?.message || 'arquivo indisponível';
    throw new Error(`Falha ao autorizar arquivo: ${reason}`);
  }

  return URL.createObjectURL(blob);
}
