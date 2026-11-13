# Plano de execução — 13/11/2026

## Requisito original
Alinhar os campos do custo de captação, mostrar capital efetivamente disponível, permitir transferência de saldo operacional de fontes para uma conta da Minha Carteira, aproveitar vínculos persistidos e remover o botão duplicado de carteira física.

## Análise de impacto
- Fonte `fontes.balance` é um livro interno e pode corresponder a cartão, caixa ou conta espelho.
- `personal_wallet_accounts.balance` é saldo declarado da Carteira, não movimentação bancária.
- `capital_source_wallet_references` registra referências de origem inclusive cartão, diferentes do espelhamento efetivo em `capital_source_id`.
- `wallet_keep_capital_mirror` sincroniza saldos de conta vinculada; fonte de origem já espelhada não pode ser debitada isoladamente.
- `withdraw_profit_to_wallet_atomic` serve apenas ao lucro/Caixa Livre; não deve ser reutilizada para qualquer fonte.
- Transferência contábil não pode aparecer como INCOME nem afetar contratos, faturas ou operações financeiras V4.

## Contrato técnico
Usar RPC transacional master com perfil e conta próprios, chave idempotente, saldos e duas casas decimais, bloqueio de CARD/MISTO, conta antiga oculta e fonte espelhada. Registrar tipo próprio no extrato, sem PIX/TED externo. Conservar a lógica do resgate de lucro intacta.

## Aceite
- Modal acessível em Fontes e Contas ao master, com saldo transferível e destino próprio.
- Cartões, fontes zeradas/negativas e espelhos não são oferecidos; servidor valida novamente.
- Movimentação registra débito de fonte e crédito da conta, com auditoria e resposta idempotente. Sem gerar receita.
- Conta de destino com espelho diferente atualiza a fonte vinculada via trigger somente após confirmar saldo consistente.
- Campo custo, taxa e total refluem automaticamente em painéis estreitos, sem truncar inputs.
- Carteira física continua dentro de Nova conta; botão duplicado removido.
- Testes e CI antes do merge; migração em produção somente após revisão e passagem do CI.

## Fora do escopo
Não fazer transferência bancária real, não movimentar os R$ 4.342,79 históricos, não alterar contratos nem apagar fontes ou contas. Não declarar testes físicos sem dispositivos.

## Risco
`fontes.balance` é saldo informado pelo usuário; não comprova fundos no banco. A UI explica esse caráter contábil. A auditoria financeira de valores históricos permanece separada da movimentação de fontes.
