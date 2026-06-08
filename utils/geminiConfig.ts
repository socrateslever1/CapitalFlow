export const GEMINI_API_KEY_HELP =
  'Chave da API do Gemini não configurada. Configure VITE_GOOGLE_API_KEY no arquivo .env.local.';

export const getGeminiApiKey = () =>
  import.meta.env.VITE_GOOGLE_API_KEY ||
  import.meta.env.VITE_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  '';

export const isGeminiConfigError = (value?: string) =>
  Boolean(value?.toLowerCase().includes('chave da api do gemini'));
