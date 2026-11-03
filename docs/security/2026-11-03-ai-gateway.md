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
