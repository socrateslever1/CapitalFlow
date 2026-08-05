export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Tenta usar a Clipboard API nativa se o documento estiver focado
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard API writeText falhou (provável perda de foco do documento):', err);
  }

  // 2. Fallback robusto usando textarea temporário (funciona mesmo sem foco estrito na Clipboard API)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback de cópia via execCommand falhou:', err);
    return false;
  }
}
