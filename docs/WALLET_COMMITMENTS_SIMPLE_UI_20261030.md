# Minha Carteira — Compromissos e interface simples (correção isolada)

Data: 2026-10-30. Base: `main` em `3b91d42ec65f91b1dbf6adbd2a9a4d2c849c08a2`.
Branch: `fix/wallet-commitments-canonical-20261030`. PR #86, rascunho. **Sem merge, deploy, migrações ou escrita SQL em produção.**

## Diagnóstico do bug de Compromissos

A tela `WalletOverviewPage` incluía faturas dos cartões, agrupadas por mês de pagamento via `getEffectiveInvoiceCycles`, somadas a `personal_wallet_payables`. A página `WalletPayablesPage` exibia somente `WalletPayablesPanel`, cujo domínio é `personal_wallet_payables`, e `RecurringObligationsPanel`. Assim, uma carteira com faturas pendentes e sem contas a pagar mostrava alertas na Visão Geral e lista vazia em Compromissos.

O novo `deriveWalletCommitments` fornece a **mesma lista** à Visão Geral e à página Compromissos. Trata faturas de cartão como **uma dívida por ciclo**, sem transformar compras integrantes em outras dívidas. Subtrai valores pagos conforme o domínio de fatura existente; exige saldo pendente; descarta lançamentos cancelados; datas exatas fornecidas pelo emissor têm precedência sobre dia recorrente. Contas a pagar e obrigações recorrentes já geradas são identificadas pelos `payable_id` da mesma tabela canônica. A função não tem efeitos colaterais.

Uma consulta adicional **somente de leitura** a `personal_wallet_recurring_obligation_issues` retorna links com contas a pagar existentes; não gera novas parcelas.

A página de Compromissos usa o caminho leve `walletRepository.loadOverview`. O gerenciamento completo de contas a pagar/recorrências é carregado sob demanda, sem remover métodos de pagamento. A navegação conserva o identificador do cartão e o ciclo exato (`card`, `fatura`); contas a pagar encaminham ao formulário de pagamento da conta original.

### Projeção financeira

`calculateWalletBalance` **não foi modificado**. A Visão Geral utiliza a mesma fonte de compromissos para informar faturas exigíveis no mês, evitando critérios diferentes entre contador/lista e indicador financeiro. Não adiciona os lançamentos integrantes da fatura novamente.

A consulta read-only realizada em 30/10/2026 encontrou, na carteira observada: R$ 5.678,44 em contas ativas, R$ 0,00 em receitas recorrentes ainda pendentes, R$ 0,00 em contas a pagar vencendo em outubro e R$ 490,24 em parcelas/faturas exigíveis em outubro. Sem incluir obrigações de outros meses, essa fotografia simples indicaria projeção de R$ 5.188,20. O valor informado anteriormente de R$ 2.670,65 **não é reproduzido por essa fotografia atualizada**; não atualizar dados financeiros para forçar correspondência.

## UI

- Cadastro e edição do saldo inicial: campos monetários **em branco**; no editor, números atualmente salvos servem como placeholder e persistem quando campo não foi alterado. O usuário pode informar `0,00` para substituir um valor por zero. Sem `type=number` nos campos monetários editados.
- `parseWalletMoney` é utilizado para colagens como `0.000,00`, `0000,00`, `1.146,98`, `2800.00`.
- Cartões: valor e vencimento da fatura, **Pagar** e **Editar** em primeiro plano; ações pouco frequentes/lançamentos detalhados em seções expansíveis.
- Editor de fatura: somente valor e vencimento. O mês de pagamento é derivado da data, e a RPC de correção transacional já existente permanece responsável por impedir duplicidade.
- Textos técnicos de consolidação retirados da superfície visível; nenhum histórico apagado e nenhum contrato alterado.
- Saúde financeira/alertas detalhados ficam fechados por padrão, disponíveis sob demanda.

## Validação e limites

Suite `test:wallet-invoice-cycle` inclui cenários de carteira vazia, somente cartões, somente contas a pagar, recorrências geradas, várias datas, pagamentos parciais, faturas quitadas, cancelamentos, contabilidade mensal e navegação entre páginas. Testes UI validam campos vazios, parse e botões. Gates GitHub devem ser conferidos no commit final; falhas não são aprovação.

**Não executado em aparelho físico:** teste end-to-end com teclado WebView, efeitos de autofill, seletor nativo de data; somente CI web/Android debug de branch. Nenhum teste implica deploy. A PR #59 da integração Carteira–Capital permanece intocada.

**Risco:** dados da Carteira variam entre o carregamento do resumo e o pagamento; o saldo deve ser revalidado pelo RPC de gravação existente. Nunca persistir a nova lista como lançamento, nunca recalcular a fatura pelo limite utilizado.
