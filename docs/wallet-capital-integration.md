# Carteira e Capital

## Consulta e ferramentas

As páginas da Carteira compartilham o cabeçalho e os indicadores de consulta. A visão geral mostra linhas de contas e cartões, e mantém acesso às páginas completas. Os componentes de edição de conta/cartão, leitores de extrato, câmera, pagamentos, cálculo de parcelas e editor legal permanecem nas implementações existentes.

O painel **Integração com Capital**, em Contas e PIX, é somente de leitura: distingue conta sem vínculo, fonte indisponível, saldos iguais e divergência. Não cria fontes, não escolhe contas e não movimenta recursos.

## Regra financeira

A migration `20261029205428_wallet_capital_balance_sync.sql` preserva o vínculo opcional, a propriedade da conta/fonte e a exigência de administrador principal. Vínculos novos exigem saldos iguais. Saldos divergentes nunca são conciliados por sobrescrita automática.

- Uma alteração real em `fontes.balance` atualiza a conta vinculada e registra uma única operação de Capital.
- Uma operação originada na Carteira já possui seu lançamento canônico. Seu espelhamento em Capital não cria uma segunda operação.
- A inserção isolada de uma transação não altera saldo novamente.
- Principal, juros, multa, parcelas, idempotência e valores de estorno continuam definidos pelos RPCs financeiros existentes. A integração acompanha o resultado em Capital.
- O contexto de empréstimo/recebimento/estorno só é associado ao extrato quando há correspondência inequívoca de fonte, perfil, valor, sentido e transação PostgreSQL. Casos ambíguos permanecem como movimentações de Capital; nenhum contrato é inferido pelo valor.
- Sem vínculo, os fluxos existentes continuam independentes.
- Disputa pelos bloqueios de uma conta/fonte retorna conflito `40001`, com orientação para tentar novamente. Não existe repetição automática das operações financeiras. O erro desfaz integralmente a tentativa em andamento.
- Nenhum vínculo, saldo ou histórico é criado/reconstruído ao aplicar a migration.

O Realtime existente de contas e operações da Carteira notifica os movimentos sincronizados. Mudanças somente no nome da fonte podem exigir atualizar a página.

## Validação

`npm run test:wallet` executa os testes de domínio/apresentação e os testes SQL isolados. `npm run test:wallet-capital-sync` executa somente os testes PostgreSQL com PGlite, sem rede nem credenciais. PGlite é dependência de desenvolvimento e não integra o bundle da aplicação.

O teste SQL usa as estruturas relevantes do contrato e a migration real, com dados fictícios. Cobre saldo, débito, recebimento antes/depois do registro, estorno negativo, transferências, repetição, autorização, vínculo divergente, rollback, ambiguidade e reaplicação da migration.

Os testes SQL usam `node`, separado do carregador `tsx`; nesta combinação de Windows/Node, o carregador e o runtime WebAssembly do PostgreSQL apresentaram falha de memória quando executados juntos.

PGlite possui uma conexão. Esses testes não comprovam concorrência entre sessões nem substituem validação do schema completo, RLS e RPCs em uma instância PostgreSQL de homologação.

## Implantação

A migration foi preparada sem alterar o banco real. Antes de aplicar, comparar as definições instaladas com as versionadas, executar os testes em homologação com o schema completo e simular operações concorrentes entre Capital e Carteira. Preservar um snapshot das funções/triggers atuais para recuperação do schema sem apagar os lançamentos.

Depois de aplicar, verificar igualdade de saldo das contas vinculadas, unicidade de movimentos e autorização. Não vincular contas existentes nem corrigir divergências históricas como parte da implantação.
