# CapitalFlow WhatsApp e n8n

## Arquitetura

WAHA recebe mensagens do WhatsApp e entrega eventos ao webhook interno do n8n. O workflow normaliza e filtra a entrada, consulta a Edge Function `capitalflow-n8n-tools`, descarta duplicidades e só responde quando o contato já existe no sistema e está identificado com segurança. A trilha financeira é determinística: fatos monetários vêm do backend, não de geração livre de texto.

Uma saudação simples não gera menu financeiro para desconhecidos. Empréstimo só é tratado quando a própria pessoa manifesta interesse e passa pela identificação do backend. Informações financeiras só são respondidas após identificação segura e a partir do contexto retornado pelo backend.

Cada sessão WAHA é associada ao perfil correspondente no backend. O `profile_id` é resolvido pelo ambiente protegido da automação, nunca aceito como dado arbitrário da mensagem do usuário.

## Regras financeiras do atendimento

- Contratos quitados, cancelados, renegociados ou encerrados são removidos antes da montagem do contexto de cobrança.
- O valor em atraso é recalculado pela mesma regra financeira autoritativa usada no checkout, incluindo juros, multa e mora aplicáveis.
- Link de pagamento só é gerado após pedido explícito do cliente, com o valor atualizado naquele momento.
- Links curtos expiram e só podem apontar para destinos de pagamento autorizados pelo backend.
- Discordância de valor e solicitação de empréstimo são encaminhadas ao operador; o robô não promete aprovação nem cria proposta de crédito por conta própria.
- UUIDs, tokens e outros identificadores internos não devem ser expostos ao cliente.
- Pessoas ainda não cadastradas não recebem dados financeiros nem menu financeiro automático.
- A automação não toma decisões de crédito, não dá parecer jurídico e não realiza cobrança a terceiros.

## Containers

Ambiente local típico:

- n8n 1.50.0 na porta 5678;
- WAHA na porta 3000;
- Redis para estado conversacional;
- armazenamento persistente do n8n em volume próprio.

O compose operacional e os segredos permanecem fora do repositório. Não versione `.env`, chaves do WAHA, segredo n8n/backend ou credenciais de provedores.

## Workflows

- `CapitalFlow - Atendimento WhatsApp`: atendimento determinístico do cliente identificado.
- `CapitalFlow - Regua de Cobranca`: o scheduler versionado executa **a cada hora, 24 horas por dia** (`0 * * * *`). Isso significa disponibilidade contínua para avaliar a régua; **não significa enviar cobrança a cada hora**. O backend somente libera mensagens nos `send_hours`, cadência, pausas e demais regras configuradas pelo operador.

A configuração de cobrança pode ter escopo global, por cliente ou por contrato. O estado da política é controlado no portal; o workflow não deve assumir que uma política está habilitada ou desabilitada sem consultar o backend.

## Segurança

- Grupos, mensagens próprias, eventos incompatíveis e remetentes inválidos são descartados.
- `message_id` é obrigatório e deduplicado no banco.
- A organização/perfil vem do mapa protegido de sessões, nunca do texto recebido no WhatsApp.
- Contratos, parcelas, atrasos e links de pagamento são obtidos do backend antes da resposta.
- Contatos não identificados não recebem dados financeiros.
- Segredos ficam fora do Git e devem ser fortes e rotacionáveis.
- CPF completo, tokens e credenciais não são retornados ao modelo nem enviados em mensagens de cobrança.
- Tabelas internas da automação usam RLS e privilégios mínimos compatíveis com cada fluxo.
- Identificações persistidas têm expiração e isolamento por organização/perfil.

## Inicialização local

Use o compose da instalação local:

```powershell
docker compose -f "<CAMINHO_DO_COMPOSE>" up -d
```

## Testes

```bash
node --test automation/n8n/*.test.cjs
npm run test:quality
```

Testes automatizados não devem usar números reais, credenciais reais nem disparar cobrança em massa.

## Backup e atualização

Antes de atualizar n8n, WAHA ou Redis:

1. exporte workflow e credenciais de forma segura;
2. preserve volumes e a chave de criptografia do n8n;
3. fixe versões em vez de usar `latest`;
4. consulte breaking changes;
5. atualize um componente por vez;
6. valide logs, webhooks, credenciais e fluxo de envio antes da próxima mudança.

A versão 1.50.0 do n8n deve ser atualizada somente em manutenção própria, com teste de compatibilidade e plano de rollback.

## Régua híbrida de cobrança

- Modos após atraso: manual, diário ou semanal, conforme política.
- Tons permitidos permanecem controlados pelo portal.
- Lembretes D-2, D0 e D+1 podem coexistir com regras pós-vencimento.
- Valores vencidos são recalculados antes de cada mensagem.
- O telefone vem exclusivamente do cadastro do cliente ligado ao contrato e é normalizado antes do envio.
- Pagamento interrompe cobranças incompatíveis com o novo estado financeiro.
- Resposta recente, contestação, atendimento humano, promessa ativa ou pausa configurada podem suspender o disparo conforme política.
- O histórico registra estágio, valor, tom, situação e horário sem depender do telefone em texto aberto.

## Princípio operacional

O n8n coordena; o Supabase decide os fatos financeiros. Se o backend não confirmar cliente, saldo, vencimento, política ou idempotência, o workflow deve falhar fechado e não improvisar a operação.
