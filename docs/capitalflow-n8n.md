# CapitalFlow WhatsApp e n8n

## Arquitetura

WAHA recebe mensagens do WhatsApp e entrega eventos ao webhook interno do n8n. O workflow normaliza e filtra a entrada, consulta a Edge Function `capitalflow-n8n-tools`, descarta duplicidades, tenta primeiro a camada local/grátis via `CAPITALFLOW_LOCAL_AI_URL` quando disponível, cai para Gemini/Groq se a camada local falhar e só então usa o bot convencional, valida a saída e envia pelo WAHA.

Uma saudação simples recebe uma resposta natural, sem menu. Empréstimo só é tratado quando a própria pessoa manifesta interesse. Informações financeiras só são respondidas após identificação segura e sempre a partir do contexto retornado pelo backend.

Todas as consultas são limitadas pelo `profile_id` associado à sessão WAHA. A sessão `default` está associada ao perfil principal CapitalFlow `62dcbb45-f02c-42ba-84a4-916af9854dea`.

## Regras financeiras do atendimento

- Contratos quitados, cancelados, renegociados ou encerrados são removidos antes do contexto chegar à IA.
- O valor em atraso é recalculado pela mesma RPC financeira usada no checkout, incluindo juros, multa e dias corridos.
- O link de pagamento é gerado somente após pedido explícito do cliente, com o valor atualizado naquele momento.
- Links de checkout são encurtados pela função privada `capitalflow-short-link`, expiram em 24 horas e aceitam somente destinos InfinitePay autorizados.
- Discordância de valor e solicitação de empréstimo são encaminhadas ao contato do operador; o robô nunca oferece empréstimo.
- UUIDs e demais identificadores internos são removidos do contexto e bloqueados na saída.
- Pessoas ainda não cadastradas podem conversar e receber explicações gerais sem informar CPF.
- Quem deseja se tornar cliente é encaminhado ao operador, sem coleta de documentos ou promessa de aprovação pelo robô.
- O atendimento automatizado não toma decisões de crédito, não dá parecer jurídico e bloqueia linguagem abusiva, cobrança a terceiros, promessa de aprovação e pedido antecipado para liberar empréstimo.

## Containers

- `n8nwahalocal-n8n-1`: n8n 1.50.0, porta 5678, volume `n8nwahalocal_n8n_data`.
- `n8nwahalocal-waha-1`: WAHA, porta 3000, volumes de sessão e mídia.
- `n8nwahalocal-redis-1`: memória conversacional.
- `n8nwahalocal-postgres-1`: PostgreSQL local do compose. O n8n atual usa SQLite no próprio volume.
- Opcionalmente, um container `koboldcpp` ou outro servidor OpenAI-compatible local pode responder em `CAPITALFLOW_LOCAL_AI_URL` e virar a primeira saída de IA.

O compose operacional está em `C:\Users\LeverDell\Downloads\N8N WAHA Local\docker-compose.yml`. O segredo n8n/backend está em `.env.n8n`, fora do repositório.

## Workflows

- `CapitalFlow - Atendimento WhatsApp`: ativo.
- `CapitalFlow - Regua de Cobranca`: agendador ativo entre 08h e 18h; somente prepara envios no horário escolhido e quando o operador habilita a política no portal.

## Segurança

- Grupos, mensagens próprias, eventos incompatíveis e remetentes inválidos são descartados.
- `message_id` é obrigatório e deduplicado no banco.
- A organização vem do mapa protegido de sessões, nunca do texto do usuário.
- Contratos, parcelas, atrasos, links existentes de pagamento e link do portal são obtidos no backend antes da resposta da IA.
- O `Output Guard` bloqueia termos internos e substitui saídas inseguras por uma resposta neutra.
- O backend usa segredo de 256 bits armazenado fora do Git e hash SHA-256 no banco.
- CPF completo, tokens e credenciais não são retornados ao modelo.
- Tabelas da automação têm RLS habilitada e acesso removido de `anon` e `authenticated`.
- A identificação persistida expira em 24 horas e é isolada por organização e hash do telefone.

## Inicialização

```powershell
docker compose -f "C:\Users\LeverDell\Downloads\N8N WAHA Local\docker-compose.yml" up -d
```

## Testes

```powershell
node --test automation/n8n/normalize-waha-message.test.cjs
npm run lint
```

Testes automatizados não devem utilizar números reais nem ativar cobrança em massa.

## Backup e restauração

O backup inicial está em `C:\Users\LeverDell\Downloads\N8N WAHA Local\backups\20260721-052613`. Ele contém compose, workflow, metadados e credenciais criptografadas. Para restaurar, interrompa alterações, restaure o compose e importe workflow/credenciais usando a mesma chave de criptografia preservada no volume do n8n.

## Atualização

Não use `latest` nem remova volumes. Exporte workflow e credenciais, fixe versões, consulte breaking changes, atualize somente o n8n e valide logs, webhook e credenciais antes de atualizar WAHA ou Redis.

Se a camada local for habilitada, mantenha `CAPITALFLOW_LOCAL_AI_URL` e `CAPITALFLOW_LOCAL_AI_MODEL` no mesmo `.env` do compose para que o n8n possa chamá-la sem depender das chaves pagas. A implementação oficial deste projeto está em `automation/local-ai`: KoboldCpp + Qwen3 4B Q4_K_M, conectado à rede `n8nwahalocal_default` com o alias interno `koboldcpp`.

## Régua híbrida de cobrança

- A configuração fica no perfil, abaixo das credenciais do WhatsApp.
- Modos após o atraso: manual, uma vez ao dia ou uma vez por semana.
- Tons permitidos: cordial, objetivo, mediador e firme respeitoso.
- Lembretes independentes em D-2, D0 e D+1, limite de mensagens e pausa geral.
- Valores vencidos são recalculados pela RPC financeira antes de cada mensagem.
- O telefone vem exclusivamente do cadastro do cliente relacionado ao contrato e é normalizado antes do envio.
- Pagamento encerra a cobrança. Resposta recente suspende por sete dias; contestação, atendimento humano ou promessa ativa também suspendem.
- O histórico registra estágio, valor, tom, mensagem, situação e horário do envio sem gravar o telefone em texto aberto.
- A política inicial permanece desligada para impedir disparo retroativo. O operador deve revisar a prévia e habilitar conscientemente.

## Pendências operacionais

- A política do perfil principal continua desligada até o teste e a ativação consciente pelo operador.
- A API WAHA ainda precisa receber uma chave antes de exposição fora da máquina local.
- O n8n 1.50.0 deve ser atualizado em uma manutenção separada, com teste de compatibilidade.
