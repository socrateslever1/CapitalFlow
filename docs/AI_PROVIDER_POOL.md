# Flux — provedores de IA e continuidade (06/11/2026)

## Execução real

O Flux usa uma única Edge Function autenticada: `ai-assistant`. A LLM conduz a conversa com os últimos dez turnos mantidos em memória pelo React. Um erro em um provedor encaminha a mesma conversa ao seguinte, preservando mensagens e contexto financeiro já consultado. Não há chave de IA no navegador.

A configuração opcional `AI_PROVIDER_POOL_JSON` define **ordem de tentativa**. Use apenas chaves criadas e autorizadas por você, guardadas em **Supabase Edge Function Secrets**. Nenhuma integração cria créditos ou ignora limites de provedores. Sem configuração, é usado `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`) com o modelo `GEMINI_MODEL`/padrão `gemini-2.5-flash`.

Exemplo para opções com modalidade gratuita sujeita a cotas e disponibilidade:

```json
[
  {"id":"groq","kind":"openai","model":"llama-3.3-70b-versatile","baseUrl":"https://api.groq.com/openai/v1","secretEnv":"GROQ_API_KEY"},
  {"id":"openrouter-free","kind":"openai","model":"openrouter/free","baseUrl":"https://openrouter.ai/api/v1","secretEnv":"OPENROUTER_API_KEY"},
  {"id":"gemini","kind":"gemini","model":"gemini-2.5-flash","secretEnv":"GEMINI_API_KEY"}
]
```

O pool configurado aceita até quatro entradas e o roteador pode ativar até dez candidatos deduplicados; cada tentativa tem limite de oito segundos. Falhas 429/5xx causam período de resfriamento de 30 segundos na instância; falhas de chave/endpoint causam 120 segundos. As instâncias não compartilham esse estado. O modelo gratuito roteado automaticamente pelo OpenRouter pode não oferecer *tool calling*; nesse caso o próximo provedor será tentado. Cotas, preços e identificadores de modelo precisam ser conferidos nas plataformas antes de configurar.

## Ferramentas de leitura do agente

A ferramenta `consultar_dados_financeiros` aceita somente as áreas `geral`, `contas`, `cartoes`, `compromissos`, `fontes`, `contratos` e `alertas`. O identificador de usuário é obtido da sessão autenticada, nunca do modelo. A consulta usa as políticas RLS existentes, campos selecionados e limites de linhas. Não são expostos SQL, privilégios administrativos ou operações financeiras.

Se a intenção financeira é explícita, a ferramenta usa primeiro cache de 12 segundos e a LLM recebe contexto compacto em **uma chamada**. Respostas financeiras muito curtas ou genéricas são descartadas e encaminhadas ao próximo provedor; se todos falharem, o fallback determinístico responde apenas com dados lidos. Se a intenção é ambígua, a própria LLM pode solicitar uma consulta; o controlador executa **no máximo uma leitura** e uma resposta final. O cache é isolado por usuário/área, temporário na instância Edge e nunca é tratado como fonte contábil oficial. A ação `fresh: true` força leitura. Não existe promessa de coerência imediata entre instâncias distribuídas; para pagamentos e outras decisões críticas, use as RPCs transacionais com leitura atual.

Diálogo ordinário não carrega tabelas financeiras. As verificações de autenticação e autorização do Supabase permanecem em todas as mensagens — são custos necessários de segurança, não consultas ao ledger. O histórico recente é transportado em memória na sessão do aplicativo; mensagens comuns não são gravadas em `ai_assistant_requests`. O comando de histórico consulta sob demanda registros antigos já persistidos. Não há sincronização automática do novo histórico entre dispositivos.

## MCP e Skills existentes

O módulo MCP V1 e o registro de Skills não foram removidos nem declarados como agentes ativos no Flux. O novo controlador de ferramenta é uma integração de **consulta limitada dentro da Edge Function**. A futura unificação de Tools/Skills/MCP exige um gateway autenticado compatível com Deno, testes de isolamento e observabilidade. As Skills `FINANCIAL_WRITE` permanecem desabilitadas.

## Verificação

- `npm run test:flux-agent`: política de roteamento, limites de contexto e análise estrutural.
- `npm run build`: compatibilidade de frontend TypeScript e Vite.
- `npm run test:quality`: regressões gerais.
- Verificação autenticada em produção ainda requer uma sessão master real; o deploy sozinho não comprova conversas multi-provedor.
