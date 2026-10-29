# CapitalFlow — Carteira como fonte da verdade; Capital em transição

**Decisão de produto — 29/10/2026.** O módulo **Minha Carteira** é o registro dos saldos efetivos informados pelo titular. A tela **Fontes de Capital** será extinta posteriormente. Nesta transição, ela deve funcionar como classificação/vínculo operacional, e **não como um segundo saldo bancário**.

## 1. Regra de domínio, sem ambiguidades

- Uma **conta da Carteira** representa onde dinheiro realmente está (banco, conta de pagamento, espécie ou investimento). Seu saldo é escriturado exclusivamente por operações auditáveis da Carteira; **não** é uma integração de Open Finance nem um saldo consultado ao banco.
- Uma **origem de capital** pode ser:
  1. **Conta vinculada**: refere-se a uma única conta da Carteira do usuário. O saldo visualizado é o saldo daquela conta, nunca uma soma adicional da antiga fonte.
  2. **Capital avulso**: origem operacional sem vínculo com conta bancária. Preserva o funcionamento e o histórico de fontes independentes; **não** entra na liquidez bancária somada da Carteira.
- Não associar fontes antigas a contas novas por semelhança de nome ou saldo. Vínculos são explícitos, e devem ser reversíveis sem apagar histórico.
- O vínculo **não é uma transferência, depósito, receita ou ajuste de inventário**. Criar/editar o vínculo não mexe em valor algum.
- Um cartão de crédito **não é uma conta com saldo disponível** e não pode ser apresentado como origem bancária líquida.

## 2. Experiência desejada para SUPER_ADMIN (conta master)

### Na Carteira — Contas & PIX
- Conta cadastrada exibe instituição, apelido, saldo e movimentações.
- Ação exclusiva do master: **Disponibilizar como origem do capital** (ou **Desvincular**, sujeito a contratos/lançamentos).
- Ao vincular, reutilizar uma referência existente **somente se** pertencer ao mesmo usuário, não estiver associada a outra conta, e não houver divergência/histórico que leve a relançamento. Caso contrário, criar referência técnica própria, sem lançamento financeiro.
- Não permitir editar o saldo real a partir da tela Capital; alterações de saldo passam por entrada, saída, transferência ou correção auditada da Carteira.

### Novo contrato — Origem do dinheiro
- Seletor do master dividido em **Contas da Carteira** (logo, banco, apelido e saldo real) e **Capital avulso** (fontes independentes).
- Escolher Nubank, RecargaPay ou Carteira física significa selecionar **a conta da qual realmente sairá o dinheiro**. Salvar a identidade dessa conta no desembolso; nunca resolver por nome.
- Avulso permanece selecionável, sem obrigar o cadastro de banco.
- Modalidades de empréstimo e contratos históricos continuam intactos.
- Para quem não é master, manter interface e regras de permissão atuais, sem expor o recurso piloto.

### Recebimento/estorno — Destino do dinheiro
- O destino do recebimento é **independente da origem**: o cliente pode receber o empréstimo de uma conta e pagar em outra.
- Quando o dinheiro entrar no banco, creditar **o total efetivamente recebido** na conta escolhida, incluindo principal, juros e mora; não somente a parte do principal.
- Principal/lucro permanecem segregados contabilmente no motor, mas a Carteira registra o fluxo físico uma única vez.
- Em recebimento avulso, oferecer destino explícito na Carteira ou registrar como **pendente de conciliação**. Não inventar depósito bancário.
- Estorno desfaz exatamente o movimento original, na mesma conta, sem refazer a composição financeira por suposição.

## 3. Achados que impedem ativação ingênua do vínculo existente

1. **Schema existente:** `personal_wallet_accounts.capital_source_id` + `personal_wallet_link_capital_source` já criam associação, mas a RPC atual autoriza também usuários com acesso ao módulo, não exclusivamente o superadministrador. A regra piloto deve existir **no banco**, não só na interface.
2. **Trigger existente:** `trg_sync_transacao_to_wallet` cobre somente `LOAN_INITIAL` e `PAYMENT_RECEIVED` (positivos). Não cobre de forma exaustiva aporte, recebimento de acordo, ajustes, estorno nem outros eventos.
3. **Motor V4:** `process_financial_operation_v4` produz `PAYMENT_RECEIVED` separados para **principal** (na fonte do contrato) e **lucro** (na fonte de lucro), conforme a própria função SQL. Por isso, espelhar apenas `fontes.balance` na conta bancária **não** equivale a receber o total em dinheiro.
4. **Contrato novo:** `contracts.service.ts` atualmente insere contrato/parcelas, ajusta saldo da fonte e registra `LOAN_INITIAL` em chamadas separadas. Integrar à Carteira sem operação atômica pode deixar débito isolado em caso de falha.
5. **Estado atual:** contas reais da Carteira permanecem sem `capital_source_id`. Existem fontes antigas com saldos diferentes. Não fazer backfill por nome ou cópia de valores.

## 4. Implementação segura e ordenada

**Fase A — modelo de ligação e escolha:**
1. Criar API/RPC autenticada master-only para associação explícita conta ↔ referência operacional. Comprovar `auth.uid()`, `is_platform_super_admin()`, ownership em `perfis`, `personal_wallet_accounts` e `fontes`.
2. Deixar Fonte de Capital avulsa independente e disponível; identificar fontes vinculadas nas consultas sem duplicar saldo em visão geral.
3. Persistir no **contrato/desembolso** a conta efetiva escolhida (UUID), independente da referência histórica de fonte. Persistir o vínculo como evento histórico/imutável para resistir a renomeação e desvinculação posterior.
4. Atualizar seletor do formulário do master para **Contas da Carteira / Capital avulso**, mantendo seletores históricos dos demais perfis.

**Fase B — movimentação financeira:**
1. Ao desembolsar, executar **uma transação SQL atômica**: valida identidade/contrato/conta, controla idempotência, lança no motor financeiro, debita conta e grava ledger da Carteira com contrato, conta de origem e identificador de operação.
2. Ao receber, escolher conta de destino. Processar parcelas, acordos e modalidades por RPCs do motor; **um** movimento de crédito na Carteira pelo **total realmente recebido**, enquanto a separação principal/juros/mora permanece nos livros de negócio.
3. Ao estornar, localizar operação e conta originais por chave estável, reverter o fluxo monetário exatamente uma vez; aplicar a mesma regra a parcial, atraso, renegociação, aporte, exclusão e repetição por rede.
4. Não somar um movimento automaticamente por `fontes.balance` **e** novamente por `transacoes`; escolher um único produtor de movimentações canônicas por operação financeira.
5. Se houver inconsistência ou falta de conciliação, **não** alterar o saldo real por suposição. Registrar pendência visível para o master.

**Fase C — descontinuação da tela Capital:**
1. Mover a gestão de origens avulsas para a Carteira.
2. Converter a tela Capital em visualização de transição; bloquear edição de saldos de contas vinculadas.
3. Retirar navegação antiga somente após garantir consultas, relatórios, automações, contratos e auditorias sem dependência da tela, mantendo compatibilidade das referências persistidas.

## 5. Invariantes e critérios de aceite

- **Sem duplicação:** vínculo sem movimentação; a soma de contas não inclui referência operacional de Capital.
- **Valor físico:** desembolso R$ 1.000 da conta Nubank -> Nubank -R$ 1.000, uma única operação. Pagamento R$ 300 na RecargaPay, sendo R$ 200 principal e R$ 100 juros -> RecargaPay +R$ 300, uma única operação; motor conserva decomposição 200/100.
- **Avulso:** empréstimo registrado em capital avulso não altera arbitrariamente nenhuma conta bancária.
- **Idempotência:** repetição exata não produz novo lançamento; estorno altera conta original uma única vez.
- **Isolamento:** outro usuário autenticado não consulta/altera vínculos master (incluindo RPC direto).
- **Histórico:** desvincular ou renomear conta não reescreve operações históricas; usuários antigos não perdem dados.
- **Compatibilidade:** testes para diário, semanal, quinzenal, mensal, parcelado sem juros, juros diários, acordos, aportes, estorno e operações offline.
- **Produção:** somente após testes financeiros e RLS, conciliação de valores antes/depois e validação em staging; **nenhuma vinculação automática de dados já existentes**.

## 6. Não fazer

- Não deixar duas entidades editarem o mesmo saldo real.
- Não criar conta/fonte duplicada silenciosamente ao salvar contrato.
- Não fazer espelhamento automático indiscriminado de `fontes.balance` para banco: o motor separa lucro e capital.
- Não usar nomes de banco ou saldo para identificar conta em transações.
- Não liberar interface para operadores antes de conferir autorização via SQL.
- Não aplicar mudanças destrutivas, restaurar valores antigos ou apagar fontes anteriores.
