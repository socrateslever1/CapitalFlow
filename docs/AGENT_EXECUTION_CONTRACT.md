# CapitalFlow — contrato operacional de execução dos agentes

## Objetivo
O prompt original do proprietário é a especificação, nunca texto de interface. Os agentes não devem executar ações além do escopo autorizado, declarar testes sem evidências nem utilizar memória do chat como fonte de verdade do código ou banco.

## Pipeline e handoffs
1. **Arquiteto (somente leitura):** consultar AGENTS.md, PRODUCT.md, DESIGN.md, documentação, branch real, esquema/RLS e testes. Converter o pedido em critérios de aceitação observáveis, limites e mapa de impacto; registrar conflitos.
2. **Desenvolvedor (main por padrão do proprietário, ou branch quando ele pedir):** implementar a menor alteração suficiente. Proibidas reescritas, exclusões de dados e mudanças colaterais não solicitadas. Não copiar frases do prompt para a UI.
3. **Revisor independente:** pessoa ou outro agente com contexto separado compara o diff com os critérios originais, funcionalidades preservadas, cenários negativos e isolamento de perfis. Deve gerar parecer verificável; autodeclaração não substitui revisão.
4. **QA e Segurança:** executar testes direcionados, npm run test:quality e testes adicionais de RLS, centavos, concorrência, idempotência, falhas de rede e rollback quando o escopo exigir.
5. **Gate de integração:** em PR, descrever escopo, aceite, evidências reais e riscos; em commit direto na `main`, só enviar depois de `npm run test:quality`, `npm run test:wallet-visual-next` e revisão independente, registrando as evidências no commit e em `docs/CARTEIRA_CONTINUIDADE.md`, e conferir os workflows depois do push. O CI rejeita a documentação ausente/incompleta; a proteção da branch deve exigir checks aprovados e revisor independente antes de merge. Verificar a versão publicada web/APK antes de declarar entrega.
6. **Rastreabilidade da entrega:** registrar cada mudança funcional no mesmo commit em `CHANGELOG.md` e `src/constants/changelog.ts` (Perfil → Atualizações). Diferenciar versão numerada, commit de código, deploy web, Android debug e APK assinado. `docs/CARTEIRA_CONTINUIDADE.md` não substitui o log de mudanças.

## Regras para fluxos financeiros
- Distinguir evento financeiro, fonte de capital, conta da Minha Carteira e saldo declarado.
- Não registrar novamente recebimentos nos contratos só para conciliá-los com a Carteira. Usar a operação original e idempotência, sem criar crédito duplicado.
- Uma conta bancária escolhida no recebimento deve receber o valor integral, com capital/juros preservados no ledger. Sem seleção, manter o comportamento anterior, salvo solicitação explícita.
- RLS e vínculo com o usuário autenticado são obrigatórios. Contagens globais não representam dados do usuário.
- Mudanças históricas e destrutivas exigem autorização expressa, plano reversível e verificação antes/depois.
- Operações com mais de uma escrita (cancelar e recriar, quitar e lançar restante) são uma única RPC transacional e idempotente, nunca chamadas encadeadas no cliente.

## Garantias e limites reais
- O verificador de PR valida **presença e completude das declarações**, não a veracidade dos testes, a independência do revisor ou a qualidade semântica do código.
- No GitHub, configurar ruleset/branch protection para a main exigindo o status do job `agent-execution-contract`, os jobs de Quality Gates, revisão de terceiro e bloqueio de bypass. Sem configuração, um check vermelho não impede necessariamente merge.
- Se não houver revisão independente disponível, não declarar revisão concluída.
- Nunca usar force push ou silenciar checks para publicar.
