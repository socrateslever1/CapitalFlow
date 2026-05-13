
/**
 * Utilitário para realizar fetch com retentativas automáticas e backoff exponencial.
 * Útil para mitigar erros de rede temporários e limites de quota (429).
 */

interface FetchRetryOptions extends RequestInit {
  maxRetries?: number;
  initialDelay?: number;
  retryOnStatusCodes?: number[];
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    retryOnStatusCodes = [429, 500, 502, 503, 504],
    ...fetchOptions
  } = options;

  let lastError: any;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      let requestInput: RequestInfo | URL = input;
      let currentOptions: RequestInit = { ...fetchOptions };

      if (input instanceof Request) {
        requestInput = input.clone();
        if (input.body !== null && currentOptions.body) {
          delete currentOptions.body;
        }
      }

      const response = await fetch(requestInput, currentOptions);

      if (response.ok) {
        return response;
      }

      if (retryOnStatusCodes.includes(response.status) && i < maxRetries) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Fetch falhou com status ${response.status}. Tentativa ${i + 1} de ${maxRetries}. Retentando em ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error: any) {
      lastError = error;
      const urlStr = typeof input === 'string' 
        ? input 
        : (input instanceof Request ? input.url : (input instanceof URL ? input.toString() : 'unknown'));
        
      const isAuthUrl = urlStr.includes('/auth/v1/');
      const currentMaxRetries = isAuthUrl ? Math.min(maxRetries, 2) : maxRetries;
      const currentInitialDelay = isAuthUrl ? initialDelay / 2 : initialDelay;

      const isNetworkError = 
        error.message?.includes('Failed to fetch') || 
        error.message?.includes('NetworkError') ||
        error.name === 'TypeError'; // Fetch throws TypeError on network failure

      if (isNetworkError && i < currentMaxRetries) {
        const delay = currentInitialDelay * Math.pow(2, i);
        console.warn(`Erro de rede no fetch (${urlStr}). Tentativa ${i + 1} de ${currentMaxRetries}. Retentando em ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Adiciona o contexto da URL no erro se falhar permanentemente
      if (isNetworkError) {
        const enhancedError = new Error(`${error.message} (URL: ${urlStr})`);
        (enhancedError as any).name = error.name;
        (enhancedError as any).originalError = error;
        throw enhancedError;
      }

      throw error;
    }
  }

  throw lastError;
}
