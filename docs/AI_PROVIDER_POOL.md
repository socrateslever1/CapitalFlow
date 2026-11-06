# Pool de provedores do mascote master

O mascote usa a Edge Function `ai-assistant`. As chaves ficam somente nos Secrets das Edge Functions do Supabase; o navegador nunca recebe tokens.

## Configuração

No projeto Supabase `hzchchbxkhryextaymkn`, cadastre os secrets:

- `GEMINI_API_KEY` — já usado pelo fallback Gemini server-side.
- `OPENAI_API_KEY` — opcional, somente se houver uma chave válida para o fallback.
- `AI_PROVIDER_POOL_JSON` — opcional, com nomes de secrets, nunca valores:

```json
[
  {"id":"gemini-primary","kind":"gemini","model":"gemini-3.8-flash","secretEnv":"GEMINI_API_KEY"},
  {"id":"openai-fallback","kind":"openai","model":"gpt-5-mini","secretEnv":"OPENAI_API_KEY"}
]
```

Quando `AI_PROVIDER_POOL_JSON` não existe, a função usa automaticamente `GEMINI_API_KEY`. Quando um provedor falha ou seu secret não está disponível, o próximo provedor é tentado e somente um código categórico é registrado.

## Ordem segura de ativação

1. Cadastrar os secrets no painel Supabase, sem colocá-los no repositório.
2. Configurar `AI_PROVIDER_POOL_JSON` com os nomes dos secrets.
3. Fazer uma solicitação somente de leitura como master.
4. Confirmar resposta HTTP 200 e consultar os logs sem expor prompt, token ou dados financeiros.
5. Não habilitar ações de gravação: o mascote continua READ/DRAFT até existir confirmação financeira explícita.

Nenhuma chave ou resposta de provedor foi adicionada a este repositório.
