
type SpeechSetter = (v: string) => void;

interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

interface IWindow extends Window {
  SpeechRecognition?: new () => ISpeechRecognition;
  webkitSpeechRecognition?: new () => ISpeechRecognition;
}

export const startDictation = (setter: SpeechSetter, onError?: (msg: string) => void) => {
  // 1. Verificação de Ambiente (Browser Check)
  if (typeof window === 'undefined') {
    return;
  }

  const win = window as unknown as IWindow;
  const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;

  // 2. Verificação de Suporte da API
  if (!SpeechRecognitionCtor) {
    onError?.('Seu navegador não suporta ditado de voz.');
    return;
  }

  try {
    const rec = new SpeechRecognitionCtor();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      try {
        const results = event?.results;
        if (results && results.length > 0) {
           const firstResult = results[0];
           if (firstResult && firstResult.length > 0) {
               const transcript = firstResult[0]?.transcript;
               if (typeof transcript === 'string' && transcript.trim()) {
                   setter(transcript.trim());
               }
           }
        }
      } catch (err) {
        console.error("Erro ao processar fala:", err);
      }
    };

    rec.onerror = (event: any) => {
      console.warn("Speech Error:", event?.error);
      
      switch (event?.error) {
        case 'not-allowed':
        case 'permission-denied':
        case 'service-not-allowed':
          onError?.('Acesso ao microfone negado. Permita nas configurações do navegador.');
          break;
        case 'no-speech':
          // Ignora erro de silêncio
          break;
        case 'network':
          onError?.('Erro de conexão. O ditado requer internet.');
          break;
        case 'aborted':
          return; 
        default:
          // Não exibe erro genérico para não atrapalhar UX
          break;
      }
    };

    // Inicia diretamente (o navegador solicitará permissão aqui se necessário)
    rec.start();
  } catch (error) {
    console.error("Critical Speech Error:", error);
    onError?.('Erro ao iniciar microfone.');
  }
};
