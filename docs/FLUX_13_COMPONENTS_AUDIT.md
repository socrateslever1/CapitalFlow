# Flux — avaliação dos 13 componentes mostrados no vídeo (12/11/2026)

## Método e limites
Confronto entre as legendas e telas visíveis do vídeo enviado, os módulos na branch main e a Edge Function `ai-assistant` implantada no Supabase (v38). **Não se trata de transcrição integral certificada da faixa de áudio.** Os rótulos indicam 0/13 a 13/13 (0 = chamada simples à LLM; 1 a 13 = peças adicionais).

| Etapa do vídeo | Flux em produção | Evidência / lacuna |
| --- | --- | --- |
| 0. Integração de LLM | SIM | Edge Function autenticada `ai-assistant`; proxy e pool de provedores configuráveis. |
| 1. Histórico/memória de conversa | PARCIAL | Últimos turnos transportados pelo React; não há persistência e sincronização multidispositivo do histórico recente. |
| 2. RAG — recuperar documentos antes de responder | NÃO DEMONSTRADO | A função atual consulta dados financeiros estruturados, sem pipeline documental de recuperação. |
| 3. Embeddings e banco vetorial | NÃO IDENTIFICADO | Não há extensão `vector` instalada ou coluna vetorial identificada nas tabelas públicas auditadas. |
| 4. Grounding — limitar resposta à base de verdade | PARCIAL | A leitura financeira vem de ferramentas com RLS, mas não há validação universal de cada resposta frente às fontes nem RAG documental. |
| 5. Tool calling | PARCIAL | Existe `consultar_dados_financeiros`, limitada a leitura por domínio; MCP e skills não estão unificados no controlador. |
| 6. Loop de agente | NÃO | O controlador admite no máximo uma leitura da ferramenta e uma resposta, não um ciclo geral de planejamento/execução/observação. |
| 7. Saídas estruturadas | PARCIAL | Há contrato para a ferramenta de consulta; não foi identificado schema estrito de resposta final da LLM. |
| 8. Streaming | NÃO IDENTIFICADO | A Edge Function implantada não mostrou transporte de tokens via SSE/ReadableStream. |
| 9. Validação de entrada/saída | PARCIAL | Há validações de autenticação, áreas permitidas e utilidade de respostas; falta uma política abrangente de validação de resultados, fundamentação e conteúdo não confiável. |
| 10. Prompt caching | PARCIAL/DIFERENTE | Existe cache de leituras financeiras por 12 segundos; isso **não é evidência** de cache de prefixo do prompt no provedor da LLM. |
| 11. Fallback de provedor | IMPLEMENTADO, NÃO HOMOLOGADO E2E | `AI_PROVIDER_POOL_JSON` e estratégia de fallback estão no código; operação multiprovedor real precisa de teste autenticado. |
| 12. Evals automatizados | IMPLEMENTADO NO REPOSITÓRIO | `npm run test:evals`, `test:flux-agent` e Quality Gates; não há demonstração de métricas de qualidade com tráfego real. |
| 13. Observabilidade/tracing | INCOMPLETO | `n8n_ai_intent_events` sem eventos no momento da auditoria; solicitações antigas em `ai_assistant_requests` marcadas FAILED. A documentação diz que conversas ordinárias não são persistidas nessa tabela, portanto isso não prova falha geral do Flux. Não foi encontrado tracing completo por requisição. |

## Priorização técnica
1. Consolidar identidade/RLS e a fonte financeira canônica; completar testes reais de vários perfis, sem abrir escrita financeira por IA.
2. Unificar controlador Flux e `ai/skills` por gateway autenticado de somente leitura, com tool calls limitados, resposta fundamentada e contexto persistido sob autorização.
3. Acrescentar validação estruturada de entrada/saída, streaming e traces com IDs correlacionados e anonimização de dados; testar prompt injection.
4. Somente com necessidade comprovada adicionar RAG/pgvector documental e prompt caching real, com controle de acesso por documento, recuperação avaliada e invalidação.
5. Evals devem abranger perguntas com dados reais autorizados, sem alegar sucesso com testes mockados; criar regressão específica para escolha de conta no recebimento sem contabilização duplicada.

## Separação obrigatória
- **Skills do processo de desenvolvimento** (`.agents/skills/*`) orientam Codex e revisores; não são automaticamente executadas pelo aplicativo.
- **Skills de negócio** (`ai/skills/*`) são módulos de consulta financeira; estar no registro não significa estar integrado à Edge Function `ai-assistant`.
- Este documento é diagnóstico. Não representa implementação automática das lacunas do Flux.
