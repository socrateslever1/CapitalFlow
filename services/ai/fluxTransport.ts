/**
 * Maps a failed `supabase.functions.invoke('ai-assistant')` call to a user-facing,
 * honest diagnostic. It never reads financial data and never invents values.
 */
export type FluxTransportFailure = {
  /** HTTP status returned by the function, or null when the request never got an answer. */
  status: number | null;
  /** Short machine code for logs/tests. */
  code: 'UNREACHABLE' | 'NOT_DEPLOYED' | 'SESSION' | 'FORBIDDEN' | 'BAD_REQUEST' | 'SERVER' | 'EMPTY_REPLY';
  message: string;
};

const SUFFIX = ' Nenhuma consulta financeira adicional foi iniciada.';

const safeServerText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  // Server messages are short PT-BR sentences; anything else (HTML, stack traces) is ignored.
  if (!text || text.length > 160 || /[<>{}]|\bat\s+\S+\s*\(|Error:/.test(text)) return null;
  return text;
};

export function describeFluxTransportFailure(status: number | null, serverError?: unknown): FluxTransportFailure {
  const serverText = safeServerText(serverError);
  if (status === null || status === 0) {
    return { status: null, code: 'UNREACHABLE',
      message: 'O Flux não conseguiu se conectar ao servidor. Verifique a internet ou se o serviço do assistente está publicado.' + SUFFIX };
  }
  if (status === 404) {
    return { status, code: 'NOT_DEPLOYED',
      message: 'O serviço do Flux não está publicado neste ambiente.' + SUFFIX };
  }
  if (status === 401) {
    return { status, code: 'SESSION',
      message: 'Sua sessão expirou ou é inválida. Entre novamente para conversar com o Flux.' + SUFFIX };
  }
  if (status === 403) {
    return { status, code: 'FORBIDDEN',
      message: (serverText || 'Seu perfil não tem acesso ao Flux.') + SUFFIX };
  }
  if (status >= 400 && status < 500) {
    return { status, code: 'BAD_REQUEST',
      message: (serverText || 'O Flux recusou a mensagem enviada.') + SUFFIX };
  }
  if (status >= 200 && status < 300) {
    return { status, code: 'EMPTY_REPLY',
      message: 'O Flux respondeu sem conteúdo. Tente novamente.' + SUFFIX };
  }
  return { status, code: 'SERVER',
    message: 'O servidor do Flux apresentou um erro (código ' + status + ')' +
      (serverText ? ': ' + serverText.replace(/\.$/, '') : '') + '.' + SUFFIX };
}

/**
 * Extracts status and `{ error }` body from supabase-js FunctionsHttpError / FetchError / RelayError
 * without depending on their classes (duck typing keeps tests runtime-free).
 */
export async function readFunctionsError(error: unknown): Promise<{ status: number | null; serverError: unknown }> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!context || typeof context !== 'object' || typeof (context as Response).status !== 'number')
    return { status: null, serverError: null };
  const response = context as Response;
  let serverError: unknown = null;
  try {
    const body = await response.clone().json();
    serverError = body && typeof body === 'object' ? (body as { error?: unknown }).error : null;
  } catch { /* corpo não-JSON é ignorado */ }
  return { status: response.status, serverError };
}
