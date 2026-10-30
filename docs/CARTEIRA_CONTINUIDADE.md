# Carteira — estado de continuidade e proteção contra regressões
Atualizado: 30/10/2026. Documento versionado junto às alterações da Carteira.

## Intenção de produto
Interface compacta, visual, semelhante a um banco digital, com cartões e contas reais cadastrados pelo usuário; assistência de gastos baseada apenas nos registros existentes. Mobile, tablet, desktop e APK usam o mesmo SaaS híbrido.

## Escopo preservado
- Nenhuma mudança de ledger, RPC de pagamento, estorno ou saldo, tabelas `personal_wallet_*` ou políticas RLS neste trabalho.
- `WalletOverviewSummary` mantém links para detalhes do cartão e valores calculados pelo domínio existente.
- `WalletSpendingGuide` é somente leitura. A projeção não é saldo bancário garantido.
- No importador, revisão e confirmação explícitas são obrigatórias antes do registro via `personalWalletService.recordStatementRow`. A baixa financeira utiliza os métodos canônicos existentes.

## Importação de extratos e faturas
- OFX/QFX: processado localmente, suporta SGML/XML, datas válidas, Windows-1252 e valores com vírgula/ponto. Compras em cartão são positivas; estornos/pagamentos são negativos e **não selecionados**. FITID fornece chave estável da transação.
- PDF com texto selecionável: processamento local via pdfjs. Suporta valores brasileiros, datas DD/MM, datas com mês abreviado (por exemplo 10 out) e data/valor em linhas consecutivas. Resultados começam desmarcados para conferência.
- PDF digitalizado/imagem: texto pode estar ausente. O botão “Ler PDF com IA” só envia o PDF ao Google Gemini após uma confirmação explícita do usuário e configuração de API, com possível cobrança da API.
- Não inventar lançamentos ausentes, nem usar valor total da fatura como uma compra.
- PDFs bancários possuem layouts variados: sem faturas reais de cada instituição, não é correto afirmar reconhecimento universal. Alguns extratos ainda precisam de correção manual.
- Sem envio automático de documentos bancários para serviços externos.

## Verificações de regressão
- `npm run test:wallet-statement-import`: OFX comprado/estornado, charset e datas, PDF de tabela/parcelas e opt-in para IA.
- `npm run test:quality`: build, gates gerais e importador.
- Testar visualmente no APK: espaço reduzido, campos de edição, listas longas, correção de sinais e seleção/desmarcação.
- Antes de publicar, inspecionar diff e não tocar em serviços financeiros sem autorização específica.

## Pendências
- Teste com PDFs/OFX reais e anonimizados de bancos variados, incluindo faturas digitalizadas.
- Conferência visual em aparelho Android e tablet físicos.
- Revisão de segurança do cofre de cartão, especialmente armazenamento de CVV/CVC (fora do escopo e não alterado).
- Quality Gate geral de dependências tem apresentado falhas independentes do build Android; acompanhar e não declarar aprovação global sem verificar.

## Entrega visual seguinte — 30/10/2026
- **Contas**: `AccountCardStack` mantém a lista compacta da visão geral e usa grade de instituições na página Contas, com logo e saldo por banco. Sem simular saldo de conta como limite de crédito.
- **Balanço do mês**: trilho compacto Recursos / Compromissos / Projeção e detalhe sob demanda. Reutiliza somente `calculateWalletBalance`; não altera as fontes ou as regras.
- **Ajuda com gastos**: `WalletSpendingGuide` agora contém barras de categorias calculadas por `getWalletSpendingOverview`, pontos de atenção determinísticos, estado vazio e informação explícita sobre compras parceladas.
- **Conceito dos valores**: gráfico de categorias soma as despesas originárias cadastradas pela data da compra e valor total; não representa faturas pagas, liquidez nem despesas efetivamente baixadas no mês. Exclui abertura de cartão, invoice override, cancelamentos e valores negativos. A consulta pode estar sujeita à paginação do backend.
- **Testes novos**: `npm run test:wallet-visual-next` cobre categorias, dezembro/janeiro, centavos, cancelamentos, zero dados, UI sem writes e integração com components existentes. Incluído em `test:quality`.
- **Skill própria**: `.agents/skills/capitalflow-wallet-ux/SKILL.md` junto a `AGENTS.md` fornecem continuidade sem depender da memória do chat.
- **Pendente**: validar capturas reais em smartphone, tablet e PC; testes de carga por instituição e priorização de categorias, validação com despesas parceladas reais.
- **Restrições**: não tocar em DB, ledger, RPC ou tabelas `personal_wallet_*` nesta entrega.

## Ajuste de importação e ocupação do espaço — 30/10/2026
- Verificação **somente de metadados** na instância Supabase `hzchchbxkhryextaymkn`: existem `public.personal_wallet_statement_rows` (RLS ativo), índice de idempotência, `personal_wallet_record_statement_row` e `personal_wallet_import_card_statement_purchase`. As funções de gravação têm privilégio de execução para usuários autenticados, e checam permissão de administrador. Nenhuma alteração no banco.
- Problema encontrado: o cliente enviava `p_installment_number` e `p_installment_total` na chamada RPC, mas a função implantada aceita **exatamente oito parâmetros**, até `p_category`. Isto impede o registro (incompatibilidade de assinatura). O cliente passou a enviar somente os oito aceitos.
- Parcelas extraídas podem ser mostradas para conferência, mas **o banco atual NÃO registra metadados da parcela na linha importada**; um lançamento importado continua sendo lançado individualmente no ciclo escolhido. Não declarar importação integral do plano de parcelas.
- Extração PDF: reconhece disposição fornecedor-data-valor, pontos nas datas, e data/descrição/valor em até três linhas; mascara datas antes de buscar valores para evitar falsos centavos. Faturas digitalizadas ainda exigem leitura opcional por IA com confirmação. Não há garantia de reconhecer qualquer fatura de qualquer instituição sem amostras.
- Interface: navegação interna mais compacta, cabeçalho com ação de atualizar ao lado, importação acessível pelo botão na pilha de cartões, com rolagem para o leitor. FAB global não se sobrepõe à tela Cartões; ações locais permanecem.
- Testes: `test:wallet-statement-import` ampliado, `test:wallet-import-contract` incluído em `test:quality`. Não afirmar validação de arquivo bancário específico sem arquivo fornecido.
- Atenção: chave Gemini via `VITE_*` no frontend é exposta ao cliente; não colocar chaves secretas no bundle. Migração para proxy protegido da IA requer plano e revisão de segurança separados.

## Refinamento de interface solicitado — 30/10/2026 (aba Geral)
**Motivação:** captura real no APK mostrando excesso de área vazia sob o cabeçalho, indicador verde de sincronização, faixa de navegação desproporcional e duplicação das ações de despesa/atualização.

**Decisões preservadas**
- A indicação `Sincronizado/Conectando` sai **somente da apresentação**; `useWalletRealtime` continua ativo e dispara `capitalflow:wallet-updated`. Não desativar Realtime, cache ou carregamento automático.
- As cinco rotas internas (Geral, Cartões, Contas, Dívidas, Receitas) continuam acessíveis. A faixa grande com aba azul preenchida vira navegação compacta por sublinhado azul, sem rolagem lateral no celular. Não eliminar a navegação.
- A cor de ação é `blue-600`, conforme `DESIGN.md`; o ícone do cabeçalho deixa o gradiente fúcsia específico.
- A aba Geral **não exibe botão Lançar despesa nem Atualizar indicadores**. O FAB compartilhado continua sendo a entrada de despesa; o aviso de erro continua oferecendo `Tentar novamente`. Não criar outro lançador.
- O painel de liquidez permanece com total consolidado e navegação para contas, mas sem o card interno redundante e sem repetir "Saldo disponível" a cada linha compacta. A tela Contas mantém os rótulos completos.
- Preservados: carrossel bancário dos cartões, saldo real e limites separados, `getCreditSummary`, `calculateWalletBalance`, lista de compromissos e todas as RPCs existentes.
- Nenhuma tabela Supabase, função financeira, migração, importador ou API foram alterados nesta entrega. As alterações são React/Tailwind e documentação/testes.

**Regressão protegida**
- `npm run test:wallet-visual-simplification` verifica ausência de controles redundantes e preservação da sincronização, rotas, acesso via FAB, resumo das contas e ausência de `supabase.rpc/from` na apresentação.
- O teste existente `tests/wallet/wallet-ui-architecture.test.ts` foi atualizado para a densidade compacta `px-2.5 py-2.5` mantendo a proteção da renderização institucional e demais asserções.
- `npm run test:quality` inclui a verificação; sempre consultar resultado efetivo do workflow Android e do Quality Gates separadamente.
- Captura do usuário é referência visual real. **Não confundir mockup de imagem gerada com implementação**; esta entrega modifica componentes do GitHub, sem gerar imagens.
- **Pendente de validação física:** render em 320/360/390px, tablet e desktop, especialmente quebra de palavras, safe area e FAB acima da navegação. Uma compilação aprovada não prova responsividade visual.

## Desempenho e limpeza do primeiro painel — 30/10/2026

**Pedido:** remover "Panorama financeiro" e o subtítulo redundante na aba Geral; reduzir tempo para abrir e trocar telas da Carteira sem sacrificar atualização de saldo, segurança nem FAB.

**Causa identificada no código:** `personalWalletService.load()` faz 13 consultas ao banco em paralelo e depois aguardava uma URL assinada **por imagem**. A tela inicial e o FAB montado solicitavam snapshot; o `walletRepository` só compartilhava requisições simultâneas, descartando o resultado após concluídas. Em cada remount/navegação surgia novo carregamento completo.

**Mudanças feitas:**
- Cabeçalho duplicado removido em `WalletOverviewPage`. As abas já ficam sob `Minha Carteira`; a visão Geral começa diretamente nos dados.
- `walletSnapshotCache` usa cache **somente em memória por usuário, TTL de 25 segundos** e deduplicação de requisições. `getSession()` valida a identidade antes de devolver dados; uma mudança de conta invalida o cache. Não persistir snapshots em `localStorage` nem compartilhar sessões.
- Qualquer `capitalflow:wallet-updated` invalida imediatamente o cache. A atualização explícita ou disparada por evento usa `load({ force: true })`, prevenindo saldo antigo após gravação. Requisições anteriores à invalidação não contaminam o cache.
- `WalletExpenseFab` aparece imediatamente sem aguardar um snapshot completo; contas/cartões para o formulário são buscados **apenas quando o usuário toca Adicionar despesa**. Mantém as quatro ações e o fluxo canônico `QuickExpenseModal`.
- URLs de imagens personalizadas em cartão/conta usam `createSignedUrls` em lotes até 50, em paralelo entre os dois buckets. Falha de imagem opcional não impede carregar valores financeiros. Não mudamos dados nem operações do banco.
- `npm run test:wallet-loading`: isolamento entre usuários, cache/forçar atualização, invalidação durante requisição, lotes de assinatura de imagens, FAB e ausência do título redundante. Integrado ao gate `test:quality`.

**Limites conhecidos:** o primeiro acesso ainda precisa consultar as 13 fontes porque a Carteira tem muitos recursos que dependem do snapshot. Não foi medida latência real no aparelho/rede, logo não declarar velocidade em segundos nem "instantâneo". Uma otimização futura de carregamento progressivo por rota exige revisar com cuidado dados de faturas, parcelas e RLS, sem truncar conjuntos ou alterar saldos.

**Regra contra regressão:** não reintroduzir o cabeçalho duplicado, carga eagerly pelo FAB, cache global sem identidade do usuário, ou atualizar saldo a partir de snapshot com TTL sem invalidar alterações. Não substituir RPCs e não alterar semântica financeira.

## Evolução bancária: carregamento por necessidade e orientação financeira (30/10/2026)

### Motivo e diagnóstico
O cache anterior reduzia consultas repetidas, mas a primeira visita à aba Geral continuava solicitando o mesmo `personalWalletService.load()` de 13 fontes, seguido de tratamento e assinaturas de imagens. A navegação carregava estaticamente os seis componentes de tela, incluindo editores e importadores não utilizados no primeiro acesso. Não foram fornecidos tempos reais de rede, portanto não se afirma redução percentual ou tempo específico.

### Implementação
- **`personalWalletService.loadOverview()`**: oito fontes necessárias para a visão Geral: contas, cartões, despesas, parcelas, pagamentos de faturas, contas a pagar, receitas recorrentes e seus recebimentos. Mantém compras/parcelas completas para calcular ciclos de fatura por `getCardCreditPosition`; preserva RLS e não muda RPCs financeiros. Não consulta linhas de extrato, movimentações, pagamentos de contas a pagar, obrigações recorrentes nem fontes de capital nessa tela. Não solicita links de imagem assinados porque a visão Geral utiliza os logos locais.
- **`walletRepository.loadOverview`**: cache TTL 25 s **separado por usuário** para esse subconjunto, reutilização de requests simultâneos e invalidação pelo evento `capitalflow:wallet-updated`. `load()` permanece para páginas completas que requerem todas as informações. Atualização explícita e realtime usam `force:true`.
- **`WalletOverviewPage`**: recebe `WalletOverviewSnapshot` com o domínio financeiro existente. Não troca fórmula de saldo, limite, parcela, fatura, dívida ou projeção.
- **`routes.tsx`**: React.lazy + Suspense, com código de Cartões, Contas, Dívidas, Receitas e Cobrança baixado quando a área é aberta. O primeiro acesso baixa o código da visão Geral sem incluir necessariamente todos os editores da Carteira. Isso não garante redução de rede sob cache de browser e não substitui análise do bundle.
- **`WalletSpendingGuide`**: orientação individual READ_ONLY: saldo projetado, uso de limite, quantidade real de compromissos vencidos e próximos 7 dias, receitas recorrentes registradas como previstas ainda não recebidas, categorias e comparação com mês anterior. Recomenda somente conferir compromissos/receitas existentes; não inventa potencial de ganhos. Para mês anterior com total zero, não calcula variação percentual.
- **Prioridade visual**: alertas vêm antes dos gráficos no mobile, com identidade de marca e superfícies discretas. Não há novo FAB, botão de atualizar ou painel desnecessário.

### Testes e salvaguardas
- `npm run test:wallet-fast-path` cobre estrutura do recorte das oito consultas, uso do domínio canônico de crédito, carregamento dinâmico das telas, textos de risco/receitas e ausência de indicadores sem dados.
- Testes existentes `wallet-overview` e `wallet-loading` foram alinhados ao novo método `loadOverview`, sem eliminar verificações anteriores.
- `npm run test:quality` inclui o novo teste. Resultado do Android e do Quality Gates deve ser conferido no commit exato.
- **Não foi alterado nenhum banco de dados, RLS, RPC, pagamento, ledger, saldo, contrato ou fluxo de estorno.**
- **Pendências**: medir cold start/tempo de primeira informação no Android e desktop com rede real; paginar histórico por seção sem truncar valores contábeis; revisar bundle via analyzer; alertas de push e orçamento por categoria exigem modelagem funcional e permissões de notificação; segurança do cofre/CVV continua pendente.

## Correção FAB + cadastro coerente com Supabase — 30/10/2026

**Problemas confirmados em produção**
1. `WalletModule.tsx` tinha `route !== 'cartoes' && <WalletExpenseFab />`: suprimia o FAB na aba Cartões. Correção: mesmo FAB canônico montado em todas as cinco abas; margem inferior ajustada em Cartões para reduzir colisão com a barra inferior. Não duplicar outro FAB nessa aba.
2. `personal_wallet_accounts` não tinha a coluna `bank_details`, enquanto `createAccount()` e `updateAccount()` a enviavam. Isso causava erro PostgREST PGRST204. A migração Supabase `wallet_accounts_optional_bank_details_jsonb` **versão 20261030130657** foi aplicada no projeto `hzchchbxkhryextaymkn` e verificada em `information_schema.columns`: `jsonb NOT NULL DEFAULT '{}'`. Fonte versionada em `supabase/migrations/20261030130657_wallet_accounts_optional_bank_details_jsonb.sql`. RLS existente, saldos, IDs e RPCs preservados; reload do schema solicitado.
3. `CreateAccountModal` interpretava `1.234,56` com `Number()`, reduzindo saldo inicial inválido silenciosamente a zero. Agora usa `parseWalletMoney` e comunica erro; a aplicação de saldo inicial permanece exclusivamente via RPC `personal_wallet_initialize_account_opening`.

**Cadastro pré-preenchido**
- Usar `activeUser.fullName/name` no cartão e nos campos `bank_details.holder_name` das contas próprias; documento de `activeUser.document` somente quando formato aparente CPF/CNPJ, editável.
- Se nome não estiver disponível no contexto, buscar de `public.profiles.full_name` do usuário autenticado com `getUser()` e `RLS` própria. Não buscar perfis de outros usuários.
- Opções explícitas `Cartão de outra pessoa` e `Conta de outra pessoa` removem a sugestão do perfil e exigem nome do titular próprio. Nunca usar dados do proprietário em contas de terceiros. Nenhum campo de banco, agência, número do cartão ou chave PIX é adivinhado ou sincronizado com bancos externos.
- Coluna `personal_wallet_cards.cardholder_name` já existe; coluna `personal_wallet_accounts.bank_details` agora armazena metadados de agência, conta, nome e documento de titular, produtos opcionais. Não representam saldo ou limite de crédito oficial.
- `CreateAccountModal` aceita fontes de capital fornecidas, inclusive lista vazia, sem nova carga integral desnecessária.
- Testes `test:wallet-onboarding-schema` cobrem idempotência da migração PGlite, preservação dos registros, FAB em Cartões, preenchimento do titular e conta de terceiros; incluídos em `test:quality`.

**Regra de arquitetura:** antes de criar/enviar qualquer nova propriedade no payload Supabase, consultar `information_schema` no projeto real e verificar RPCs, RLS e tipos. Manter o esquema versionado e proteger o contrato com teste. A identidade do proprietário autenticado não é autorização para operar contas de terceiros; tudo continua limitado ao titular autenticado autorizado pelas políticas.

**Pendências de validação:** testar a interface em smartphone físico, cadastro real de conta e cartão com usuário autorizado, vinculação PIX sem inferir chaves, e regressões de navegação. Compilação aprovada não prova funcionalidade em aparelho. Verificar Quality Gates e release do commit exato.

## Correção 30/10/2026 — importação nativa de faturas + falha de rede + seletor Android

**Evidências:** prints enviados pelo usuário mostram (a) `TypeError: Failed to fetch` bloqueando a Carteira, (b) popup nativo de autocomplete/datalist de bancos sobreposto a múltiplos inputs do modal e ao teclado do Samsung, (c) Gmail Android com anexo OFX sem CapitalFlow na opção "Abrir com".

**Implementações:**
- Substituir `<datalist>` do cadastro de instituições por `<select>` de banco com `Outro banco ou instituição` e input dedicado. Nada de sobreposições nativas dentro do WebView. Mantém nickname, saldo inicial auditado e campos de titular/terceiro.
- `useWalletAccess` preserva estado ativo já confirmado **somente** durante falha de rede de revalidação; acesso desconhecido/negado continua bloqueado. Usuário vê mensagem legível e botão `Tentar novamente`, recuperação em `online`/focus e auth callback; nenhum bypass de `user_modulos` ou RLS.
- Projeto Android gerado pelo CI recebe `WalletFileInboxPlugin.java` e novos filtros `ACTION_VIEW`/`ACTION_SEND` para PDF, OFX, QFX, octet-stream. MIME genérico somente após ação explícita do usuário e com validação de extensão suportada. Ler com `ContentResolver.openInputStream`, máximo 10 MB, sem permissão genérica de storage ou upload automático. Registrar plugin antes de `BridgeActivity.onCreate`; tratar `onNewIntent` e app aberto/cold launch.
- `main.tsx` detecta documentos recebidos e abre `/carteira/cartoes`. `NativeWalletFileInbox` recebe o conteúdo mediante ponte Capacitor. Antes de gravar, faz escolha do tipo (fatura cartão ou extrato conta) e do destino, com sugestão estrita baseada no tipo OFX, banco e identificador de conta/cartão, exigindo unicidade. Instituições ambíguas **não são atribuídas automaticamente**. PDFs sem metadados identificáveis requerem escolha manual.
- Reutilizar `FlatSmartStatementReader` com `initialFile`, mesmo parser OFX/PDF e RPCs canônicas já existentes. **Nenhum lançamento automático apenas por abrir o documento**: exigir revisão e confirmação do usuário. Nunca tratar pagamento/estorno de cartão como compra. Leitura local por padrão; IA opcional mediante consentimento expresso.
- `tests/wallet/wallet-native-file-inbox.test.ts` protege fluxos e ambiguidade de bancos. Integrar `test:wallet-native-inbox` ao `test:quality`.
- Sem modificações nas tabelas e políticas financeiras de Supabase. Problema `Failed to fetch` é de comunicação/controle de estado, não comprovadamente banco desativado; não tratar sucesso de CI como prova da estabilidade da rede real.

**Riscos e limites ainda exigindo teste em aparelho físico:** Android Gmail pode declarar MIME inconsistente e aplicativos diferentes usam provedores URI diferentes; validar filtro com anexo OFX da instituição específica e comando `adb shell am start`, cold start e app já aberto. O PDF digitalizado continua dependente de IA opcional; identificar destino por PDF sem metadados confiáveis não é seguro. A associação é **sugestão + confirmação** antes de qualquer escrita. Keyboard resize no Samsung deve ser observado após remoção do datalist.

## 30/10/2026 — FAB Receber valor, baixas de clientes e visão de receitas

### Motivação e regra de domínio
O usuário apontou a ausência de `Receber valor` no FAB, quer registrar entrada comum ou selecionar cliente/contrato/parcela usando as **opções originais de pagamento do CapitalFlow**, abatendo contrato sem duplicar saldo. Acompanhar a melhoria visual com propostas concretas. A tela enviada mostra um FAB com quatro opções em coluna, ocupando muito espaço.

**Regra inegociável: não gravar duas entradas para um mesmo pagamento.** A Carteira não processa autonomamente contratos nem cria liquidações de empréstimo via `personal_wallet_record_account_operation`. Os pagamentos de clientes devem passar por `PaymentManagerModal` -> `paymentCtrl.handlePayment` -> Payment Engine canônico e espelhamento existente da fonte de Capital quando vinculado. Sem vínculo, não inventar associação ao saldo de uma conta bancária.

### Implementação
- `features/wallet/components/WalletExpenseFab.tsx`: quinta ação **Receber valor**, importação lazy do modal, preservadas as quatro ações anteriores e o FAB nas cinco abas; menu organizado em painel compacto com uma ação principal e quatro ações em grade de duas colunas, safe-area, acessível por teclado.
- `features/wallet/components/QuickIncomeModal.tsx`: modos **Entrada comum** e **Cliente CapitalFlow**.
  - Entrada comum: usuário escolhe conta, valor BRL, data, categoria e descrição; código usa `prepareManualIncome`, valida conta da lista acessível, centavos, valor positivo, data válida não futura, descrição e UUID; grava exclusivamente por `personalWalletService.recordAccountOperation({type:'INCOME',fromAccountId:null,toAccountId,...})` com ID idempotente estável durante retries. Não é movimentação bancária real e não abate contratos.
  - Cliente CapitalFlow: usa os clientes e empréstimos do `ModalContext` autenticado; seleciona cliente, contrato e parcela não paga; calcula `calculateTotalDue` e prepara **exatamente** o `ui.setPaymentModal` do fluxo original, abrindo `openModal('PAYMENT')`. O modal canônico administra valores, opções integral/parcial, perdão/juros, pagamento e recibos. Não executa nenhuma RPC financeira alternativa.
  - **Acordo renegociado ativo:** não atravessar a baixa genérica. O pagamento deve ser efetuado na tela do acordo/contrato, cujo mecanismo é distinto. Sem contrato/sem parcela/arquivado não há botão habilitado; backend valida a autorização mesmo que o cliente tente alterar o frontend.
- `features/wallet/domain/quickReceipt.ts`: domínio puro para preparo da operação e seleção segura do contrato, com cobertura de cenários inválidos, cliente divergente, parcela paga, acordo e dados duplicados.
- `features/wallet/pages/WalletIncomePage.tsx`: bloco compacto de **Entradas avulsas** no mês a partir das operações canônicas `INCOME` existentes, total, datas, contas e últimas oito operações; permanece o `RecurringIncomePanel`. Não soma transferências internas, pagamentos de clientes ou recebimentos recorrentes como segunda receita.
- `components/wallet/RecurringIncomePanel.tsx`: valor mensal agora usa `parseWalletMoney`, input com teclado decimal; corrige rejeição/interpretação incorreta de `1.250,50` sem mudar RPCs.
- Testes `tests/wallet/wallet-quick-receipts.test.ts`, comando `npm run test:wallet-receipts` no `test:quality`. Verificar build, financeiro e Android sobre commit EXATO.
- Supabase inspecionado **somente leitura**: `personal_wallet_record_account_operation` aceita `INCOME` e `RECEIPT` com `p_from_account IS NULL` e `p_to_account IS NOT NULL`, checa autorização, centavos e UUID; existe `trg_wallet_keep_capital_mirror` em `personal_wallet_accounts`. Nenhuma migration, RLS, RPC ou saldo alterados nesta entrega.

### Situações de uso e melhorias posteriores (não declarar implementadas)
1. **Salário ou serviço**: entra R$ 2.500,00 em uma conta, a Carteira mostra saldo maior, histórico da conta e total de receitas avulsas, sem criar contrato.
2. **Cliente paga R$ 500,00 de contrato de R$ 1.500,00**: selecionar cliente, contrato, parcela e no modal original decidir pagamento parcial/total e encargos; única gravação canônica. Havendo conta vinculada à fonte correta, o banco espelha conforme gatilhos existentes. Não supor que um cartão/conta escolhido de forma arbitrária seja a origem desse contrato.
3. **Cliente com acordo ativo**: atalho bloqueia baixa simples e orienta a usar o fluxo de acordo; preservar histórico de renegociação e juros de cada parcela.
4. **Duplo clique ou conexão interrompida**: mesmo UUID é reaproveitado numa tentativa de entrada comum até confirmação. Erros de leitura pós-confirmação não provocam nova transação automaticamente.
5. **Melhoria visual seguinte**: resumo do mês com separação explícita dinheiro disponível / compromissos / limites de crédito; cartão de ação de fatura mais próximo do vencimento, alertas somente quando relevantes, microinterações discretas e consistentes; não multiplicar cards ou status.
6. **Próximas funcionalidades**: orçamento por categoria e alertas de gastos, lembretes de vencimento configuráveis, calendário único de faturas e parcelas, conciliação do arquivo OFX com operações já registradas e relatório de evolução de patrimônio. Requerem modelagem e testes específicos; não criar por inferência.
7. **Ponto pendente alto risco**: reconciliação contratual com comprovante bancário, identificação de conta de recebimento real e correspondência com contrato. Não lançar duas vezes quando a fonte de Capital já espelha a conta. Verificar em homologação operações parciais/juros/multa/renegociação e estorno, depois validar no APK real.
8. **Performance pendente**: o modal de entrada usa `useWalletSnapshot` somente sob demanda, não na montagem do FAB. Futuramente separar a carga leve só de contas para reduzir 13 consultas quando o usuário abre a entrada.

### Continuidade e postura
Priorizar correção comprovada, criticar ações que duplicam eventos financeiros, propor alternativas antes de mudanças grandes, não degradar funcionalidades. Mantenha `PRODUCT.md`, `DESIGN.md`, `AGENTS.md` e skills. Relatório acima descreve o estado desejado; antes de afirmar produção, verificar workflow e versão publicada. Não inferir testes com celular físico.

## Incidente de publicação Android em 30/10/2026
O commit 04076d871124b55ba73248d656fce0d7584c1a87 passou nos testes, na compilação web e na assinatura Android, mas o workflow 41070887545 falhou ao publicar por HTTP 500 da API de assets do GitHub. O APK foi parcialmente substituído sem atualizar checksum/notas, logo o asset isolado não comprova uma versão válida. Corrigido o workflow com cinco tentativas, backoff, download de verificação, comparação de SHA-256 e checksum, atualização das notas após validação e teste test:android-release-resilience. Confirmar commit e versionCode das notas e sucesso do workflow antes de divulgar nova versão. A falha de npm audit é independente.


## 30/10/2026 — interpretação de faturas, segurança e anti-duplicação (branch de revisão)

### Regra contábil e evidência
- utils/cardInvoiceSummary.ts extrai uma fotografia declarada pelo emissor: fatura total, pagamento mínimo, limite total, limite utilizado, limite disponível, lançamentos futuros e vencimento. Não gera gasto, receita, saldo ou pagamento. O emissor informado pelo PDF e o cartão de destino são comparados antes da gravação.
- A disponibilidade informada pelo banco tem precedência sobre o cálculo limite total menos limite utilizado na prévia. Se houver divergência, mostrar alerta e manter os valores originais, sem forçar igualdade nem inventar operações.
- Compromissos futuros declarados não são deduzidos automaticamente da diferença entre limite usado e fatura. Diferenças residuais permanecem sem alocação até conciliação.
- Pagamento mínimo é alternativa de pagamento e não quitação. O restante da fatura só é conhecido após o registro de pagamentos confirmados no fluxo canônico de pagamentos.
- PDF com texto e OFX são lidos no navegador. PDF protegido por senha não é lido sem desbloqueio pelo titular. Não enviar faturas reais, credenciais, PII, PAN ou CVC para o repositório.
- Pagamentos de fatura sem sufixo C (ex.: pagamento PIX e "Pagamento em dd MMM") devem ser tratados como crédito/abatimento no leitor de faturas e jamais como compras. Pix no crédito continua despesa do cartão.

### Cadastro
- Cadastro novo não pede senha exclusiva: guarda a instituição, bandeira, titular opcional, validade, últimos quatro dígitos opcionais e valor de limite opcional.
- O RPC existente exige credit_limit numeric NOT NULL DEFAULT 0. Na ausência do limite informado, envia 0 por compatibilidade; esse zero ainda não distingue desconhecido de limite contratual nulo no banco. Não exibir "R$ 0 de limite liberado" como fato bancário sem evidência.
- Número completo e CVC não são solicitados no cadastro. O cofre anterior continua exigindo senha própria até existir autenticação biométrica/PIN do app com criptografia revisada. Não substituir PBKDF2 por senha vazia, bearer token ou chave fixa.

### Anti-duplicação e limitações
- Revisão local identifica possíveis duplicidades entre PDF/OFX por cartão, data, valor em centavos e descrição normalizada. Desmarca candidatos, avisa, bloqueia gravação a menos que o usuário autorize repetição. Duas compras reais podem coincidir: nunca excluir automaticamente.
- A idempotência transacional segue sendo responsabilidade das RPCs do banco. O bloqueio de duplicatas entre arquivos não é constraint transacional no servidor; concorrência e descrições diferentes exigem conciliação adicional.
- As cifras de fatura mínima, limite declarado e lançamentos futuros estão em prévia para conferência, não têm atualização persistente própria por ciclo no esquema atual. Não declarar importação completa de parcelas futuras.
- Para salvar/corrigir esses dados de forma independente, evoluir o contrato backend para uma tabela de fatos por cartão/ciclo, com origem, data de apuração, RLS, validação em centavos e trilha de auditoria. Não escrever diretamente em used_limit nem criar pagamentos/parcelas a partir de resumo.
- Correção existente: situação inicial e definição manual de valor de fatura. Não duplicar fatura com importação de compras; revisar modalidade INCLUDED e confirmar documento antes de lançar.
- Antes de mesclar: executar npm run test:wallet-statement-import, npm run test:wallet-import-contract e npm run test:quality. Nenhum arquivo real ou segredo deve entrar em fixtures de CI.


## 30/10/2026 — Continuação: C6/RecargaPay, PDF protegido, valores por ciclo

- PDF protegido: interface pede senha e a passa somente ao pdfjs no navegador. Senha descartada após leitura; não há senha em código-fonte, banco, arquivo de teste ou log. Mensagens diferentes para senha ausente ou incorreta.
- RecargaPay: compras negativas no documento equivalem a despesas positivas no cartão, enquanto pagamento da fatura com valor positivo é abatimento; várias compras podem aparecer com uma única data. O leitor restringe transações às seções de lançamentos, sem transformar simulações em despesas.
- C6 Bank: reconhece total, pagamento mínimo, limite total/utilizado/disponível e vencimento; não mistura limite de saque e saldo de obrigações futuras com parcelas de compras. Inclusão de Pagamento é crédito, juros/IOF são encargos. Não inventa lançamentos.
- Nubank: saldo em aberto total não representa necessariamente parcelas futuras, portanto não ocorre inferência. Os outros leitores de banco existentes foram preservados.
- A tabela nova personal_wallet_card_invoice_facts guarda uma fotografia dos valores declarados por cartão e ciclo, com RLS de master, chave única, montantes não negativos e sem lançamento no ledger. Migração aplicada e verificada no Supabase, sem registros pessoais.
- Os campos reconhecidos são editáveis e salvos mediante confirmação; também podem ser inseridos manualmente pela tela Cartões. Valor efetivo de fatura, mínimo, limite e disponível bancário não se tornam automaticamente gastos nem pagamentos.
- A posição transacional permanece no domínio canônico; valores do banco são indicados como declarados para não confundir com saldo financeiro.
- O cadastro novo não solicita PAN/CVC nem senha particular. O cofre anterior segue protegido até implementação segura de biometria/PIN; não há chave vazia ou fixa.
- O usuário pode revisar duplicidades entre PDF e OFX. Não há repartição automática de faturas com múltiplos cartões, nem dedução de parcelas futuras onde a fonte é incompleta.
- Testes sintéticos de cinco bancos cobrem novas regras sem expor dados reais. Auditoria de dependências continua obrigatória e bloqueia release enquanto houver vulnerabilidades.


## 30/10/2026 — Incidente de cadastro: RPC 404 real no Android

- Evidência no Supabase: Android WebView chamou POST /rest/v1/rpc/personal_wallet_create_complete_card, que respondeu HTTP 404 (a função existia em uma migration do GitHub mas não estava aplicada no banco).
- Correção aplicada: migration 20261030171500_wallet_create_complete_card_rpc.sql, função com seis parâmetros iguais aos do frontend. É SECURITY INVOKER; exige master; reaproveita personal_wallet_create_card_with_opening, inclusive lock por requestId e inicialização sem duplicidade; atualiza a identidade do cartão na mesma transação e recusa envelopes, PAN/CVC e senha no cadastro.
- Registro mínimo: banco obrigatório; apelido, 4 últimos dígitos e limite opcionais; bandeira, fechamento, vencimento, conta associada, titular/validade são dados avançados opcionais. Abrir situação inicial somente quando necessário.
- Retry: CardRegistrationAttempt preserva a solicitação após resposta incerta, impedindo duplicar cartões se houve commit mas a rede perdeu a resposta. Se a listagem não atualizar após uma criação confirmada, informar que o cartão foi salvo e oferecer atualização da página.
- Mantida a proteção criptográfica do cofre legado de cartões já existentes até que um sistema de PIN/biometria de aplicativo esteja realmente implantado. Cadastro novo nunca exige senha do cofre e não armazena CVC.
- Testes contratual/arquitetural em tests/architecture/wallet-card-complete-registration.test.mjs. Verificar Android Capacitor e Cloudflare após aprovação. Floot não é a hospedagem atual; não criar cópia paralela.


## 30/10/2026 — Cofre com PIN único para acesso rápido (web e APK)

- A autenticação de entrada continua sendo o login/senha existente do CapitalFlow; o PIN do cofre não substitui a sessão Supabase, nem é exigido para criar um novo cartão.
- Diagnóstico: a tabela personal_wallet_card_vault e os RPCs do cofre, embora presentes em migration histórica, estavam AUSENTES na instância Supabase. A migração 20261030192500_wallet_master_pin_vault.sql restaura a tabela e os RPCs com verificação explícita do proprietário/administrador, RLS e sem SELECT público.
- Para cartões com dados completos, o usuário define uma vez um PIN de 8–12 dígitos. Um segredo mestre aleatório de 256 bits é cifrado no dispositivo por PBKDF2-SHA256 (600 mil iterações) + AES-GCM, e só a chave embrulhada é persistida no Supabase; o PIN nunca é salvo/enviado.
- Todos os cartões v2 são cifrados por AES-GCM sob uma chave mestre não extraível pelo WebCrypto, com IV aleatório por gravação e AAD vinculado ao proprietário e contexto do cartão. O mesmo PIN permite desbloquear na web e no APK sem senha individual.
- A chave não extraível é mantida SOMENTE em memória por janela curta; ao colocar o navegador/app em segundo plano ou encerrar sessão, o cache é apagado. Nenhum PIN, PAN ou CVC é incluído em localStorage, logs, dados da visão geral ou snapshot de carteiras.
- Cofres legados v1 criptografados por senha anterior são suportados: ao abrir pela primeira vez, informar a senha antiga uma única vez para migrar ao PIN global. Não há alteração silenciosa da senha antiga.
- Número completo continua protegido e não aparece na lista nem no formulário básico; o titular pode salvá-lo por "Dados completos" após criar o cartão. A validação de Luhn deriva os quatro últimos dígitos para associação.
- Dependências financeiras, pagamentos, ledger, CardOpening e links de conta não foram modificados. A migração não criou cartão nem copiou dados pessoais.
- Risco residual explícito: PIN numérico humano tem entropia limitada contra ataques *offline* após vazamento de ciphertext e chave embrulhada. A implementação não substitui proteção forte por hardware no Android, biometria nativa nem controles PCI DSS; não prometer invulnerabilidade.

## Correção de abertura com excesso de limite — 30/10/2026
- Exemplo reproduzido em captura: limite R$ 10.000,00; utilizado R$ 10.663,38; fatura R$ 2.517,55. O excedente é R$ 663,38, sem crédito disponível para novas compras. Não tratar saldo disponível negativo como valor positivo/verde, nem salvar número com erro de ponto flutuante.
- O modal **Situação inicial** passou a mostrar disponibilidade calculada, em vez de aceitar campo derivado como entrada; entrada monetária pt-BR com duas casas, único botão Cancelar no rodapé compartilhado, e confirmação de excesso. A fatura não é somada novamente ao uso.
- A migração `20261030193000_wallet_allow_overlimit_opening.sql` ajusta **somente** as validações de quatro RPCs de abertura/edição, mantendo ledger, idempotência, privilégios e recálculo existentes. Permite fotografia inicial acima do limite, mas não autoriza compras acima do limite.
- Testes automatizados `tests/wallet/card-opening-overlimit.test.ts` entram em `test:wallet-card-opening`. Validar também no Supabase de homologação: aplicação da migração, abertura acima do limite com e sem fatura, replay de request_id e saldo disponível gerado em zero; validar visualmente no Android antes de publicar.
- **Deploy obrigatório:** migrar Supabase antes de disponibilizar o frontend corrigido; apenas alterar GitHub não corrige RPC implantada. Não confundir `credit_limit-used_limit` com disponibilidade declarada pelo banco quando houver regras especiais/limite temporário.


## 30/10/2026 — Modal responsivo e atualizações separadas por plataforma

- PaymentOfferModal: substituída janela fixa de 320px por tamanho responsivo; título quebrável, conteúdo rolável e rodapé de três ações em grade. No celular, botão de envio em linha própria; tablet e desktop, ações em três colunas; altura mínima de 48px para toque.
- Modal: rodapé customizado opcional sem duplicar Cancelar, preservando outros modais. Ajustes para viewport visual, safe areas e teclado.
- AppUpdateBanner: aviso de recarregar página apenas no navegador; aplicativo Capacitor não recebe reload web.
- AndroidApkNotice: navegador Android oferece APK oficial por /api/android/apk no mesmo domínio; Cloudflare Pages Function faz streaming binário da release, valida HTTPS/origem/tamanho e responde como attachment, sem redirect do navegador ao GitHub.
- AndroidNativeUpdateNotice: no APK Android compara versionCode e aciona plugin CapitalFlowApkInstaller. Plugin baixa internamente APK oficial, valida SHA-256, packageName, versionCode e certificado de assinatura, depois abre instalador nativo do Android com consentimento. Não faz instalação silenciosa nem abre navegador.
- build Android: registra plugin nativo no MainActivity, FileProvider privado com cache de APK e permissão REQUEST_INSTALL_PACKAGES. CI falha se faltar algum componente.
- Limite de validação: QA automatizado não equivale a inspeção visual manual em todos os dispositivos. Rota Cloudflare Pages Function depende do deployment de produção do próprio site.
