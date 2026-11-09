/**
 * Acelera o envio de cobranças já enfileiradas no backend (whatsapp_queue).
 * Não envia nada por conta própria: apenas avisa o n8n para buscar a fila agora.
 * Se o aviso falhar, o n8n recupera os itens pendentes sozinho a cada 5 minutos.
 *
 * Em produção, defina VITE_N8N_MANUAL_TRIGGER_URL com o endereço HTTPS do n8n no servidor,
 * ex.: https://automacao.seudominio.com.br/webhook/capitalflow-manual-collections-trigger
 * Sem a variável, usa o n8n local (funciona só no computador onde o Docker roda).
 */
const LOCAL_TRIGGER_URL = 'http://localhost:5678/webhook/capitalflow-manual-collections-trigger';

export function resolveManualCollectionTriggerUrl(configured: unknown): string {
  const value = typeof configured === 'string' ? configured.trim() : '';
  if (!value) return LOCAL_TRIGGER_URL;
  try {
    const url = new URL(value);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    // Fora do computador local, só HTTPS: o navegador e o APK bloqueiam HTTP a partir de páginas seguras.
    if (url.protocol === 'https:' || (url.protocol === 'http:' && isLocal)) return url.toString();
  } catch { /* endereço malformado: mantém o padrão local */ }
  return LOCAL_TRIGGER_URL;
}

const MANUAL_COLLECTION_TRIGGER_URL = resolveManualCollectionTriggerUrl(
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_N8N_MANUAL_TRIGGER_URL,
);

export async function triggerManualCollection(profileId: string): Promise<boolean> {
  if (!profileId) return false;

  try {
    await fetch(MANUAL_COLLECTION_TRIGGER_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: profileId,
    });
    return true;
  } catch {
    // The item remains PENDING and is recovered by the next trigger for this profile.
    return false;
  }
}
