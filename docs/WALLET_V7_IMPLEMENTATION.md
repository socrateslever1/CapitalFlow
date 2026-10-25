# CapitalFlow — Carteira V7
## Arquitetura aplicada

O CapitalFlow usa as tabelas físicas `personal_wallet_accounts`, `personal_wallet_cards` e `personal_wallet_payables`. Elas são preservadas. Criar tabelas paralelas chamadas `contas`, `cartoes` ou `dividas_pagar` duplicaria registros e geraria divergência de saldos.

### Dados e segurança

- `personal_wallet_institutions`: catálogo canônico, com referências opcionais em contas/cartões (bancos desconhecidos continuam cadastráveis).
- `personal_wallet_cards`: `account_id` nullable já existente; `available_limit` gerado de `credit_limit-used_limit`, `primary_color` opcional; sem lançamento manual em `used_limit` neste módulo.
- `personal_wallet_recurring_incomes`: projeções mensais; a efetivação de receita ocorre somente por `personal_wallet_post_recurring_income`, com mês único e crédito transacional.
- `personal_wallet_payables`: categoria e origem da liquidação com FK a conta ou cartão.
- `personal_wallet_create_linked_assets`: criação transacional de conta+cartão, ou apenas um; não altera o motor de empréstimos.
- `personal_wallet_pay_payable_from_card`: liquidação parcial ou integral com lançamento único de despesa na fatura, controle de autorização, trava de dívida/cartão e idempotência.
- Todos os novos dados privados exigem autenticação de proprietário e permissão administrativa da carteira. A tabela de instituições é catálogo global somente de leitura.
- Contas/cartões existentes e quaisquer registros financeiros legados não são removidos.
- Não armazenar novos números completos ou CVCs no formulário de cadastro de cartão.

### Fluxos visuais

- Pilha real com navegação por toque, swipe e setas.
- Bottom Sheet mobile / modal desktop e detalhes por cartão já existentes, preservados.
- Grid responsivo `lg:grid-cols-12` com sete colunas de pilha/liquidez e cinco de detalhes/passivos/extrato.
- Formulários bidirecionais com confirmação de criação híbrida.
- Receitas fixas com projeção e registro de recebimento apenas sob ação expressa.
- Dívidas PF/PJ com origem obrigatória na interface e liquidação em conta ou cartão.
- PIX: apenas valor e descrição; usa perfil autenticado, chave cadastrada, BR Code CRC16 e rota pública de compartilhamento. Não confirma recebimento automaticamente.

## Verificações de homologação

1. `npm run build`, testes de arquitetura, testes de IA e carga aprovados.
2. Migration testada com `BEGIN ... ROLLBACK` antes de aplicar.
3. Testar em sessão administrativa real os quatro fluxos de cadastro (cartão avulso, cartão com conta existente, conta+cartão e cartão+conta).
4. Testar lançamento de receita mensal idempotente, débito por dívida em conta e conversão da dívida em encargo de cartão sem repetição.
5. Comparar `private.financial_integrity_report()` antes/depois.
6. A aprovação automatizada de build não substitui o teste manual mobile e desktop.
