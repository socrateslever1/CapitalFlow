/** Legacy guard: provider keys must not be embedded in a browser or APK bundle. */
export const GEMINI_API_KEY_HELP = 'O serviço de IA precisa ser configurado no servidor.';
export const getGeminiApiKey = (): string => '';
export const isGeminiConfigError = (value?: string) =>
  Boolean(value?.toLowerCase().includes('serviço de ia'));
