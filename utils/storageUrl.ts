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
    return bucket && parts.length ? { bucket, path: parts.join('/') } : null;
  }
  const match = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  return match ? { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) } : null;
}

export async function resolveAuthenticatedStorageUrl(value?: string | null): Promise<string | null> {
  const reference = parseStorageReference(value);
  if (!reference) return value || null;
  const { data, error } = await supabase.storage.from(reference.bucket).createSignedUrl(reference.path, 300);
  if (error) throw new Error(`Falha ao autorizar arquivo: ${error.message}`);
  return data.signedUrl;
}
