# CapitalFlow: AI boundary (03/11/2026)

O frontend não recebe chaves Gemini nem tokens privados do Cloudflare AI Gateway. O SDK de IA não é instanciado no navegador. Todas as análises remotas utilizam `capitalflow-gemini-proxy`, que exige JWT válido, limita tipos de arquivo/modelos/tamanho e mantém `GEMINI_API_KEY` como segredo do Supabase.

## Implantação
1. Configurar `GEMINI_API_KEY` nos **Secrets** das Edge Functions do projeto Supabase CapitalFlow; nunca usar variáveis `VITE_*` para credenciais.
2. Implantar `supabase/functions/capitalflow-gemini-proxy/index.ts` com `verify_jwt = true`.
3. Revogar/rotacionar qualquer chave antiga que tenha sido exposta em builds Vite ou versões APK anteriores.
4. Confirmar resposta autenticada, rejeição de JWT ausente, quotas e uso de PDFs/OFX locais sem envio externo.
5. Não enviar imagens físicas de cartões até existir OCR/redação local auditada. Nenhum CVC é persistido nas novas versões do cofre.
6. Imagens e documentos financeiros só seguem ao proxy após consentimento explícito; lançamentos reconhecidos pela IA começam desmarcados.

### Limites
- O limitador em memória é auxiliar e não é uma quota distribuída. Necessário adicionar quota persistente por usuário antes de escala.
- Sem segredo do Gemini no servidor, a IA remota falha fechada e recursos textuais recorrem ao mecanismo interno; PDF/OFX local continua operacional.
- Alterações em produção e homologação física exigem confirmação por build e deploy do SHA exato.

- Vite usa allowlist `envPrefix` explícita para impedir que variáveis `VITE_GOOGLE_API_KEY`, `VITE_GEMINI_API_KEY` ou `VITE_CF_AIG_TOKEN` sejam copiadas para `import.meta.env`, mesmo quando ainda estiverem presentes na configuração antiga de implantação.

## Incidente confirmado em 03/11/2026
Os logs das últimas 24h retornavam 26 respostas HTTP 502 ao chamar o proxy e 13 respostas 204 de preflight, sem resposta 200. A existência de respostas 502 indica que houve tentativa de chamada externa, mas não comprova validade da chave nem sucesso. A versão antiga mascarava o status do provedor e usava por padrão Gemini 2.5 Flash, cujo acesso o Google restringiu a usuários ativos anteriores (documentação oficial atualizada em 29/10/2026: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash ).

A versão atual usa `gemini-3.8-flash`, modelo suportado e estável, e registra **somente códigos não secretos** de erro upstream (`status`, `code`, `reason` validados), sem prompts, documentos, chaves ou mensagens de erro brutas. Nenhum teste automatizado substitui uma resposta HTTP 200 autenticada do Gemini em produção. A rotação da chave antiga exige ação no Google AI Studio e atualização segura do Secret da Edge Function.
