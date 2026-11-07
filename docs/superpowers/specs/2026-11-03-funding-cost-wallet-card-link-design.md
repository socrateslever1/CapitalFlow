# Integração de fontes com cartão e rentabilidade financeira

**Objetivo.** Informar o custo financeiro pago para obter o principal, associar opcionalmente uma fonte de capital a um cartão da Minha Carteira e exibir rentabilidade bruta e líquida sem alterar a dívida do cliente.

## Requisitos e invariantes
- O contrato mantém principal e juros cobrados do cliente; custo de captação é despesa do credor, nunca compõe principal ou parcelas.
- Valor cobrado pelo cartão = principal captado + custo, sem duplicar a saída do principal.
- A despesa da compra no cartão permanece exclusivamente no fluxo canônico de despesas da Minha Carteira; vínculo da fonte é metadado, não compra, pagamento de fatura ou alteração de limite.
- Vinculação opcional apenas entre fonte e cartão do mesmo proprietário autenticado; RLS, isolamento por carteira e acesso apenas do titular principal.
- Cartões legados `CARD` e fontes `MISTO` são reconhecidos; fontes sem cartão continuam independentes.
- Não modificar saldos existentes, parcelas, contratos passados, RPCs de pagamento, índices de fatura, certificados Android, nem automatizar importação de compras.
- Lucro bruto = valor contratual - principal; lucro líquido previsto = lucro bruto - custo da captação; separar resultados realizados e projetados.
- Se a compra já consta da fatura, o custo do contrato não cria outra despesa nem outro débito.
- Composição de múltiplas fontes permanece desabilitada até a RPC transacional de recebimento e estorno ser homologada; nenhuma ativação implícita.
- Campos e feedback em português, sem colar frases das instruções na interface.

## Alternativas consideradas
1. Lançar automaticamente compra na Carteira quando emitir contrato: rejeitado neste estágio, pois duplicaria compra importada do extrato e poderia deixar contrato parcialmente gravado.
2. Guardar saldos de cartão e caixa no mesmo campo de fonte: rejeitado, pois limite de crédito não é disponibilidade em caixa.
3. **Adotado:** reutilizar `contratos.funding_cost` e `funding_total_payable` para custo; vínculo opcional isolado para cartão, sem movimentação automática; apuração bruta e líquida explicitamente segregadas.

## Próxima etapa independente
- Conciliação por ID imutável de compra existente ou novo lançamento canônico idempotente, explicitamente escolhido, sem duplicidade da importação de faturas.
- Habilitar múltiplas fontes apenas após testes financeiros completos da RPC.
