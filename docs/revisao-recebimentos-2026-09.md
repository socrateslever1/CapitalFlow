# Revisão de recebimentos

## Situação da continuação — agrupamento no extrato

Implementado localmente: um recebimento por chave no extrato financeiro, detalhamento de capital/juros/mora e destino de cada parte, busca por destino preservando o total integral, um botão de estorno por evento e contagem de operações agrupadas. O histórico do contrato também exibe o detalhamento dos valores. A transformação oculta de agrupamento em `vite.config.ts` foi removida e substituída por código direto da página.

**Não implementado:** quitação por valor negociado e as correções estruturais do backend listadas abaixo. O alcance da quitação (parcela ou contrato inteiro) ainda precisa ser definido; as alterações atuais não perdoam saldo automaticamente. Nenhum commit, push, migração ou publicação desta continuação foi realizado.

## Caso confirmado por consulta somente de leitura

O recebimento analisado totaliza **R$ 585,00**: capital **R$ 46,35** e juros **R$ 538,65**, com a mesma chave de evento (a linha de lucro usa o sufixo `_lucro`). Não foram encontrados dois recebimentos de R$ 585,00 nesse evento. Nenhum registro real foi alterado ou estornado nesta revisão.

### Correções locais

- `LedgerList`: o agrupamento anterior dependia da ordem. Se os juros aparecessem primeiro, eles eram mostrados isoladamente e novamente no total agrupado. Agora agrupa somente pela chave persistida, independentemente da ordem, sem juntar pagamentos distintos do mesmo dia.
- `dbAdapters`: a chave de idempotência era descartada no carregamento. Agora ela chega ao extrato do contrato e ao serviço de estorno. A mensagem de recebimento antigo não correspondia à situação desse registro, que possui chave no banco.
- A data contábil à meia-noite UTC não produz mais um horário fictício de 20:00 no histórico. Horários efetivamente presentes em outros lançamentos continuam exibidos.
- Entradas de estorno e lançamentos originais permanecem no histórico; grupos já estornados não oferecem novamente o botão de estorno.

## Riscos encontrados — ainda não corrigidos

1. **Autorização no recebimento (crítico).** A definição instalada de `process_payment_v3_selective` é `SECURITY DEFINER`, executável por `authenticated`, e não verifica `auth.uid()` nem vínculo entre usuário, perfil, contrato e fontes. `anon` não possui EXECUTE. É necessária autorização explícita dentro da função antes das gravações. Não foi tentada exploração nem operação com outro perfil.
2. **Persistência fragmentada (alto).** `payments.service.ts` grava recebimento, excedente, auditoria, perdão e renovação em etapas distintas. Uma falha posterior pode informar erro após já movimentar o caixa. O fallback direto altera parcela e carteiras sem uma transação única e não produz o mesmo histórico da RPC.
3. **Repetição após falha (alto).** A interface bloqueia cliques simultâneos, mas uma nova tentativa gera outra chave. Falhas de resposta após confirmação exigem reconciliação da mesma operação, não um novo recebimento.
4. **Estorno incompleto para operações especiais (alto).** `reverse_payment_group` recompõe os valores pagos, mas não restaura integralmente o estado anterior de perdão, capitalização e renovação. Falta snapshot transacional anterior/posterior e regra para estornar eventos antigos quando existem operações posteriores. A checagem de repetição também ocorre antes do bloqueio do contrato, exigindo revisão de concorrência.
5. **Saldo apresentado após pagamento (alto).** O saldo mostrado inclui cálculos de encargos e reconciliação além dos campos brutos da parcela. No caso analisado, a parcela registra R$ 585,00 pagos e R$ 403,65 de principal restante. É preciso reproduzir o cálculo na data do recebimento e nas modalidades relevantes antes de modificar qualquer saldo real.
6. **Quitação negociada pendente de definição.** É necessário confirmar se encerra a parcela selecionada ou todas as parcelas do contrato. A operação deve registrar valor recebido e saldo dispensado separadamente, mostrar confirmação explícita e motivo, exigir internet e ser atômica/reversível. Não deve simular pagamento integral nem converter desconto em receita.

## Critérios para concluir a revisão financeira

- Testes de autorização por proprietário/operador, valores negativos/nulos, duas chamadas simultâneas e repetição após timeout.
- Recebimento parcial, total, excedente, condição especial, quitação negociada, capitalização, renovação e operação offline.
- Estorno repetido, concorrente e de evento anterior a outra movimentação, com recomposição de carteiras e do estado original.
- Conferência única entre extrato, recibo, parcela, contrato e portal.
- Migração validada em banco isolado antes de produção. A revisão atual não aplica migrações nem altera os dados do caso real.

## Validação executada

- 16 testes de regressão: agrupamento, adaptador, navegação dos cartões e formulários.
- Suítes financeira e de arquitetura aprovadas; build TypeScript/Vite aprovado, com avisos de tamanho de bundle e imports mistos já existentes.
- 104 cenários de layout em navegador Chromium/Edge: 13 telas, identificação de iPhone/Android e quatro resoluções (320×568, 390×844, 640×320, 1280×800).
- Verificações adicionais de cartões sobrepostos, Escape/retorno, bloqueio durante envio, foco, altura reduzida, formulário externo, etapas de renegociação, extrato único e documentos/arquivos do portal.
- Dados e serviços simulados nos testes visuais, sem pagamentos reais. Não é validação em Safari/iPhone físico nem publicação em produção.
