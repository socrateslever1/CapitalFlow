/**
 * Public-facing messages for Android updates.
 * Raw Java/HTTP messages, operating-system classes and internal error codes
 * must never be rendered in the interface.
 */
const descriptions: Readonly<Record<string, string>> = Object.freeze({
  CONNECTION: 'Não foi possível baixar a atualização. Verifique sua conexão com a internet e tente novamente.',
  VALIDATION: 'Não foi possível verificar a segurança da atualização. Tente novamente mais tarde.',
  INSTALLATION: 'Não foi possível concluir a atualização. Tente novamente.',
  PERMISSION: 'Permita a instalação pelo CapitalFlow nas configurações do celular e tente novamente.',
  INSTALLATION_CANCELLED: 'A atualização foi cancelada. Você pode tentar novamente quando quiser.',
  INSTALLATION_BLOCKED: 'O celular não permitiu a instalação. Confira as permissões e tente novamente.',
  INSTALLATION_CONFLICT: 'Não foi possível substituir a versão instalada. Verifique se o aplicativo é o original.',
  INSTALLATION_INCOMPATIBLE: 'Esta atualização não é compatível com seu celular.',
  INSTALLATION_INVALID: 'Não foi possível verificar a segurança da atualização. Tente novamente mais tarde.',
  INSTALLATION_STORAGE: 'Não há espaço suficiente no celular para atualizar o aplicativo.',
  INSTALLATION_UNKNOWN: 'Não foi possível instalar a atualização. Tente novamente.',
});

const fallback = 'Não foi possível concluir a atualização. Verifique sua conexão e tente novamente.';

/** Only an allowlisted internal code may select a friendly message. */
export function friendlyAndroidUpdateError(error: unknown): string {
  let code: unknown;
  if (typeof error === 'string') code = error;
  else if (error && typeof error === 'object') {
    const payload = error as { message?: unknown };
    code = payload.message;
  }
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(descriptions, code)
    ? descriptions[code]
    : fallback;
}
