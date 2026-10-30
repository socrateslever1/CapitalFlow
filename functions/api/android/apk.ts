/** Stream the public signed Android release from our own Cloudflare Pages origin.
 * This is a binary proxy, not a redirect: browser stays at CapitalFlow.
 * Downloads are public; never proxy arbitrary URLs from untrusted input.
 */
const OFFICIAL_APK = 'https://github.com/socrateslever1/CapitalFlow/releases/download/android-signed-beta/CapitalFlow-Android.apk';
const MAX_APK_BYTES = 150 * 1024 * 1024;

export const onRequestGet = async (): Promise<Response> => {
  try {
    const upstream = await fetch(OFFICIAL_APK, {
      redirect: 'follow',
      headers: { Accept: 'application/vnd.android.package-archive, application/octet-stream' },
      signal: AbortSignal.timeout(45_000),
    });
    if (!upstream.ok || !upstream.body) {
      return new Response('Instalador temporariamente indisponível.', {
        status: 502, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    const final = new URL(upstream.url);
    if (final.protocol !== 'https:' ||
        !(final.hostname === 'github.com' || final.hostname.endsWith('.githubusercontent.com'))) {
      await upstream.body.cancel();
      return new Response('Origem do instalador não reconhecida.', { status: 502 });
    }
    const kind = (upstream.headers.get('content-type') || '').toLowerCase();
    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (kind.includes('text/html') || !Number.isFinite(contentLength) ||
        contentLength < 0 || contentLength > MAX_APK_BYTES) {
      await upstream.body.cancel();
      return new Response('Resposta de download inválida.', { status: 502 });
    }
    const headers = new Headers({
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': 'attachment; filename="CapitalFlow-Android.apk"',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    if (contentLength > 0) headers.set('Content-Length', String(contentLength));
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return new Response('Não foi possível obter o APK. Tente novamente.', {
      status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};
