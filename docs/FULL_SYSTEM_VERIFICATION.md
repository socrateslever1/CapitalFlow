# Verificação integral — acesso, clientes e pagamentos

Data da verificação: 2026-10-02

## Escopo

- autenticação Supabase e recuperação de sessão;
- gravação e importação de clientes;
- Payment Engine V4, idempotência, estorno e isolamento por perfil;
- compatibilidade do frontend em navegadores/WebViews sem `crypto.randomUUID`;
- integridade referencial observável no banco remoto.

## Correções aplicadas

- substituição das chamadas diretas a `crypto.randomUUID()` no frontend por `generateUUID()`, que possui fallback compatível;
- novo gate arquitetural para impedir o retorno desse padrão em componentes e serviços do navegador;
- restauração de sessão local condicionada à confirmação do vínculo entre o perfil e o usuário Auth atual;
- FK `payment_transactions.operator_profile_id` alinhada a `perfis.id` na migração remota `20261002114424_align_payment_transaction_operator_profile`.
- correção remota da ordem de perdão no `preview_financial_operation_v4` pela migração `20261002135834_fix_payment_forgiveness_order_remote`;
- remoção de mensagens técnicas da interface de recebimentos, acordos, aportes, exclusões e configurações;
- criação dos gates `test:financial-forgiveness` e `test:ui-copy`.

## Validações de código

- `npm run test:quality`: aprovado;
- `npm run test:architecture`: aprovado;
- `npm run lint`: aprovado;
- `npm run build:skip-check`: aprovado;
- `git diff --check`: aprovado;
- `npm run test:db`: harness local executado; pgTAP fica bloqueado quando Docker não está disponível e nunca usa o projeto remoto.

## Validação do perdão no banco remoto

- a migração corretiva foi aplicada sem downgrade ou alteração do histórico anterior;
- o perdão agora é calculado antes da distribuição do valor recebido;
- juros e atraso perdoados são removidos dos valores exigíveis antes da alocação;
- `process_financial_operation_v4` continua utilizando `preview_financial_operation_v4`;
- a FK `payment_transactions_operator_profile_id_fkey` continua apontando para `public.perfis(id)`;
- a migração executou apenas DDL; nenhum pagamento, estorno ou atualização financeira foi registrado por ela.

Exemplos cobertos pelo teste: em principal de 1.000, juros de 300 e atraso de 40, `CAPITAL_ONLY` e `TOTAL_CHARGES` com recebimento de 320 registram 320 no principal, zero em juros/atraso recebidos e os encargos como perdoados. Uma dispensa parcial de atraso de 20, com recebimento de 320, registra 300 de juros recebidos, 20 de atraso recebidos, zero de principal recebido e 20 perdoados.

### Modos de perdão mantidos por compatibilidade

- `NONE`: não perdoa encargos.
- `FINE_ONLY`, `MORA_ONLY` e `FINE_AND_MORA`: usam o valor de atraso informado para reduzir o encargo antes da distribuição do recebimento.
- `TOTAL_CHARGES` e `CAPITAL_ONLY`: perdoam juros e atraso; o valor recebido é direcionado ao principal.
- `INTEREST_ONLY` e `BOTH`: são nomes legados aceitos pelo contrato atual e preservam o mesmo tratamento de dispensa parcial de atraso; não perdoam juros automaticamente. Qualquer mudança desse significado exige decisão de negócio e migração compatível.

## Estado observado no Supabase remoto

- 17 usuários Auth e 16 perfis;
- 2 usuários Auth confirmados sem perfil correspondente;
- 89 clientes, 140 contratos e 230 parcelas;
- 2 transações em `payment_transactions`, sem operador, contrato ou parcela inválidos;
- 571 lançamentos em `transacoes`;
- 0 clientes órfãos;
- 1 contrato sem cliente correspondente.

## Pendências que não foram alteradas automaticamente

- criar os dois perfis ausentes exige identificar os usuários e validar os dados de negócio;
- o contrato órfão exige decisão de reconciliação, sem inventar cliente ou apagar histórico;
- `npm run test:db` exige Docker/Supabase local; sem Docker, o comando aborta com proteção e não tenta conexão remota;
- não foi possível testar login real, recuperação de senha e cadastro com credenciais de usuários sem autorização/fixtures de teste;
- os avisos existentes dos Supabase Advisors permanecem para uma revisão de segurança separada.

## Conclusão

O erro de FK que bloqueava o recebimento foi corrigido no banco remoto, a ordem do perdão foi corrigida, a interface não expõe termos técnicos proibidos e o código do frontend deixou de depender de `crypto.randomUUID`. A validação integral de todos os usuários ainda não está concluída enquanto os perfis órfãos, o contrato órfão e o banco local sem Docker não forem tratados com dados controlados.
