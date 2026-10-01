# Skills de IA do CapitalFlow

## Conceito

Skills são capacidades de negócio tipadas e limitadas. Elas validam intenção e entrada, exigem contexto autenticado, chamam somente um gateway autorizado e retornam `SkillResult`. Não calculam finanças nem executam SQL.

```text
Usuário / WhatsApp / Portal
          ↓
       Intent
          ↓
        Skill
          ↓
        Tool
          ↓
 Serviço/RPC autorizada
          ↓
 Backend financeiro
          ↓
 SkillResult
          ↓
       Resposta
```

## Núcleo

- `SkillContext`: identidade, perfil confiável, origem, request e permissões.
- `CapitalFlowSkill`: metadados, risco, validação e execução.
- `SkillResult`: sucesso ou erro estruturado.
- `SkillRegistry`: registro, busca, filtros e bloqueio.
- `executeRegisteredSkill`: autorização e evento de observabilidade.
- `ToolRegistry`: valida entrada, permissão, risco, confirmação e disponibilidade.
- `CapitalFlowSkillGateway`: fronteira técnica usada somente pelas Tools autorizadas.

O input de uma Skill não possui `profileId`, tenant ou owner. Esses valores vêm exclusivamente do contexto autenticado e são novamente verificados pelas RPCs.

## Skills READ_ONLY

| Skill | Tool | Backend autorizado | Resultado |
|---|---|---|---|
| `consultar_cliente` | `client.get` | `skill_find_clients_v1` | cliente único ou `AMBIGUOUS` |
| `consultar_divida` | `debt.get` | `skill_get_debt_position_v1` | posição persistida pelo backend |
| `consultar_parcelas` | `installments.list` | `skill_list_installments_v1` | parcelas e saldos oficiais |
| `consultar_contrato` | `contract.get` | `skill_list_contracts_v1` | contrato sem tokens ou segredos |
| `consultar_vencimentos` | `due_dates.list` | `skill_list_due_v1` | vencimentos do perfil |
| `consultar_acordo` | `agreement.get` | `skill_get_agreement_v1` | acordo ativo persistido |

As RPCs de leitura estão na migration `20260929042103_ai_skills_read_models.sql`, já registrada no histórico remoto.

## Riscos

- `READ_ONLY`: consulta autenticada sem mutação financeira.
- `LOW`: preparação de conteúdo ou handoff.
- `FINANCIAL_WRITE`: exige autenticação, permissão, confirmação, idempotência e auditoria.
- `CRITICAL`: permanece fora da autonomia da IA.

## Skills financeiras bloqueadas

`registrar_pagamento`, `estornar_pagamento`, `renovar_pagamento`, `capitalizar_saldo`, `quitar_por_acordo`, `novo_aporte`, `registrar_pagamento_acordo`, `aplicar_desconto` e `alterar_vencimento` existem somente como contratos desabilitados.

Todas possuem `enabled: false`, risco `FINANCIAL_WRITE` e `requiresConfirmation: true`. Nenhuma chama RPC ou altera dados.

## Segurança

- Sem `service_role` no runtime das Skills.
- Sem SQL arbitrário ou acesso direto a tabelas.
- Sem cálculo de juros, multa, mora ou saldo.
- Sem escolha automática diante de ambiguidade.
- Sem retorno de token do portal, credenciais ou segredos.
- Prompt do usuário é sempre dado não confiável.
- Observabilidade registra somente skill, request, perfil, origem, duração e resultado.

## Integração mínima

`executeSkillIntent` aceita somente IDs explicitamente permitidos e encaminha para o registry. Ele não planeja, não encadeia operações e não substitui n8n.

Fluxo futuro preservado:

```text
WAHA → n8n → estado/funil → intent → Skill → Tool/MCP → backend → n8n → WhatsApp
```

O MCP V1 apenas adapta as Tools READ_ONLY. RAG, embeddings, fine-tuning e agente autônomo não fazem parte desta etapa.

## Adicionando uma Skill

1. Defina input e validação em `schema.ts`.
2. Use uma factory que receba `ToolRegistry`.
3. Não importe Supabase, gateway ou serviços financeiros na Skill.
4. Registre categoria, risco, autenticação, confirmação e permissões.
5. Retorne erros estruturados.
6. Adicione testes de sucesso, autorização, backend indisponível e input hostil.
7. Registre a Skill em `ai/skills/registry.ts`.
8. Atualize os gates arquiteturais e esta documentação.
